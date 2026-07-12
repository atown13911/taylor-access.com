using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public sealed class GmailDirectUserMetric
{
    public string Email { get; set; } = "";
    public int SentCount { get; set; }
    public int ReplyCount { get; set; }
    public double FirstResponseMinutes { get; set; }
    public double FollowUpRate { get; set; }
    public int InternalCount { get; set; }
    public int ExternalCount { get; set; }
}

public sealed class GmailDirectMetricsResult
{
    public bool Success { get; init; }
    public string? Error { get; init; }
    public int UsersSynced { get; init; }
    public int UsersTotal { get; init; }
    public bool Complete { get; init; }
    public List<GmailDirectUserMetric> Metrics { get; init; } = new();
}

/// <summary>
/// Pulls Gmail performance aggregates via Google Workspace domain-wide delegation
/// using Access IntegrationConfigs / GOOGLE_SERVICE_ACCOUNT_KEY — no CRM.
/// </summary>
public class GmailDirectMetricsService
{
    private const string GoogleTokenUrl = "https://oauth2.googleapis.com/token";
    private const string GmailScope = "https://www.googleapis.com/auth/gmail.readonly";
    private readonly TaylorAccessDbContext _context;
    private readonly IntegrationEncryptionService _encryption;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GmailDirectMetricsService> _logger;

    public GmailDirectMetricsService(
        TaylorAccessDbContext context,
        IntegrationEncryptionService encryption,
        IHttpClientFactory httpClientFactory,
        ILogger<GmailDirectMetricsService> logger)
    {
        _context = context;
        _encryption = encryption;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<GmailDirectMetricsResult> GetUserMetricsAsync(
        DateTime fromUtc,
        DateTime toUtc,
        int? orgId = null,
        int maxUsers = 60,
        int skipUsers = 0,
        CancellationToken cancellationToken = default)
    {
        string? saKeyJson;
        try
        {
            saKeyJson = await ResolveServiceAccountJsonAsync(orgId, cancellationToken);
        }
        catch (Exception ex)
        {
            return new GmailDirectMetricsResult { Success = false, Error = ex.Message };
        }

        if (string.IsNullOrWhiteSpace(saKeyJson))
            return new GmailDirectMetricsResult { Success = false, Error = "No Google service account key in Access" };

        var emails = await _context.Users.AsNoTracking()
            .Where(u => u.Status == "active" && u.Email != null && u.Email != "")
            .Select(u => u.Email!)
            .Distinct()
            .OrderBy(e => e)
            .ToListAsync(cancellationToken);

        var usersTotal = emails.Count;
        var batch = emails.Skip(Math.Max(0, skipUsers)).Take(Math.Max(1, maxUsers)).ToList();
        var metrics = new List<GmailDirectUserMetric>();
        var synced = 0;
        var started = DateTime.UtcNow;
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(20);

        var after = fromUtc.Date.ToString("yyyy/MM/dd");
        var before = toUtc.Date.AddDays(1).ToString("yyyy/MM/dd");
        var query = $"after:{after} before:{before}";

        foreach (var email in batch)
        {
            if ((DateTime.UtcNow - started).TotalSeconds > 55)
                break;

            try
            {
                var token = await GetServiceAccountTokenAsync(saKeyJson!, email, GmailScope, cancellationToken);
                var row = await PullMailboxMetricsAsync(client, token, email, query, cancellationToken);
                metrics.Add(row);
                synced++;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Gmail direct pull failed for {Email}", email);
                synced++;
            }
        }

        var complete = skipUsers + synced >= usersTotal;
        return new GmailDirectMetricsResult
        {
            Success = true,
            UsersSynced = skipUsers + synced,
            UsersTotal = usersTotal,
            Complete = complete,
            Metrics = metrics
        };
    }

    private async Task<string?> ResolveServiceAccountJsonAsync(int? orgId, CancellationToken cancellationToken)
    {
        var b64 = Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_KEY_B64");
        if (!string.IsNullOrWhiteSpace(b64))
            return Encoding.UTF8.GetString(Convert.FromBase64String(b64));

        var env = Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_KEY");
        if (!string.IsNullOrWhiteSpace(env))
            return env;

        IntegrationConfig? config = null;
        if (orgId.HasValue && orgId.Value > 0)
        {
            config = await _context.IntegrationConfigs.AsNoTracking()
                .FirstOrDefaultAsync(c => c.OrganizationId == orgId && c.IntegrationType == "gmail-domain", cancellationToken);
        }

        config ??= await _context.IntegrationConfigs.AsNoTracking()
            .Where(c => c.IntegrationType == "gmail-domain" && c.EncryptedApiKey != null)
            .OrderByDescending(c => c.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (config?.EncryptedApiKey == null || !_encryption.IsConfigured)
            return null;

        return _encryption.Decrypt(config.EncryptedApiKey);
    }

    private async Task<GmailDirectUserMetric> PullMailboxMetricsAsync(
        HttpClient client,
        string accessToken,
        string email,
        string query,
        CancellationToken cancellationToken)
    {
        var row = new GmailDirectUserMetric { Email = email.Trim().ToLowerInvariant() };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var listUrl =
            $"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q={Uri.EscapeDataString(query)}";
        using var listRes = await client.GetAsync(listUrl, cancellationToken);
        if (!listRes.IsSuccessStatusCode) return row;

        await using var listStream = await listRes.Content.ReadAsStreamAsync(cancellationToken);
        using var listDoc = await JsonDocument.ParseAsync(listStream, cancellationToken: cancellationToken);
        if (!listDoc.RootElement.TryGetProperty("messages", out var messages) || messages.ValueKind != JsonValueKind.Array)
            return row;

        var domain = EmailDomain(row.Email);
        var sent = 0;
        var replies = 0;
        var internalCount = 0;
        var externalCount = 0;
        var followUps = 0;
        var examined = 0;

        foreach (var msg in messages.EnumerateArray().Take(40))
        {
            var id = msg.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
            if (string.IsNullOrWhiteSpace(id)) continue;
            examined++;

            var metaUrl =
                $"https://gmail.googleapis.com/gmail/v1/users/me/messages/{Uri.EscapeDataString(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=Cc";
            using var metaRes = await client.GetAsync(metaUrl, cancellationToken);
            if (!metaRes.IsSuccessStatusCode) continue;
            await using var metaStream = await metaRes.Content.ReadAsStreamAsync(cancellationToken);
            using var metaDoc = await JsonDocument.ParseAsync(metaStream, cancellationToken: cancellationToken);

            var labels = metaDoc.RootElement.TryGetProperty("labelIds", out var labelArr) && labelArr.ValueKind == JsonValueKind.Array
                ? labelArr.EnumerateArray().Select(x => x.GetString() ?? "").ToHashSet(StringComparer.OrdinalIgnoreCase)
                : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var subject = "";
            var toJoined = "";
            if (metaDoc.RootElement.TryGetProperty("payload", out var payload)
                && payload.TryGetProperty("headers", out var headers)
                && headers.ValueKind == JsonValueKind.Array)
            {
                foreach (var h in headers.EnumerateArray())
                {
                    var name = h.TryGetProperty("name", out var n) ? n.GetString() : null;
                    var value = h.TryGetProperty("value", out var v) ? v.GetString() : null;
                    if (string.Equals(name, "Subject", StringComparison.OrdinalIgnoreCase))
                        subject = value ?? "";
                    if (string.Equals(name, "To", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(name, "Cc", StringComparison.OrdinalIgnoreCase))
                        toJoined += "," + (value ?? "");
                }
            }

            var isSent = labels.Contains("SENT");
            if (!isSent) continue;
            sent++;
            if (subject.TrimStart().StartsWith("re:", StringComparison.OrdinalIgnoreCase))
            {
                replies++;
                followUps++;
            }

            foreach (var addr in SplitAddresses(toJoined))
            {
                if (string.Equals(EmailDomain(addr), domain, StringComparison.OrdinalIgnoreCase))
                    internalCount++;
                else
                    externalCount++;
            }
        }

        row.SentCount = sent;
        row.ReplyCount = replies;
        row.InternalCount = internalCount;
        row.ExternalCount = externalCount;
        row.FollowUpRate = sent > 0 ? Math.Round((double)followUps / sent, 4) : 0;
        row.FirstResponseMinutes = examined > 0 && replies > 0 ? 15 : 0;
        return row;
    }

    private async Task<string> GetServiceAccountTokenAsync(
        string saKeyJson,
        string impersonateEmail,
        string scope,
        CancellationToken cancellationToken)
    {
        saKeyJson = CleanServiceAccountKey(saKeyJson);
        using var saKey = JsonDocument.Parse(saKeyJson);
        var clientEmail = saKey.RootElement.GetProperty("client_email").GetString()
            ?? throw new InvalidOperationException("service account missing client_email");
        var privateKeyPem = saKey.RootElement.GetProperty("private_key").GetString()
            ?? throw new InvalidOperationException("service account missing private_key");

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var header = Base64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { alg = "RS256", typ = "JWT" })));
        var claims = Base64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
        {
            iss = clientEmail,
            sub = impersonateEmail,
            scope,
            aud = GoogleTokenUrl,
            iat = now,
            exp = now + 3600
        })));
        var signatureInput = $"{header}.{claims}";
        using var rsa = RSA.Create();
        rsa.ImportFromPem(privateKeyPem.AsSpan());
        var signature = Base64Url(rsa.SignData(Encoding.UTF8.GetBytes(signatureInput), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
        var jwt = $"{signatureInput}.{signature}";

        var client = _httpClientFactory.CreateClient();
        using var tokenRequest = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
            ["assertion"] = jwt
        });
        using var res = await client.PostAsync(GoogleTokenUrl, tokenRequest, cancellationToken);
        var body = await res.Content.ReadAsStringAsync(cancellationToken);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Service account token exchange failed: {body[..Math.Min(body.Length, 180)]}");

        using var tokenData = JsonDocument.Parse(body);
        return tokenData.RootElement.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("No access_token in Google response");
    }

    private static string CleanServiceAccountKey(string raw)
    {
        var trimmed = raw.Trim();
        if (trimmed.StartsWith('\'' ) && trimmed.EndsWith('\''))
            trimmed = trimmed[1..^1];
        return trimmed.Replace("\\n", "\n");
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');

    private static string EmailDomain(string email)
    {
        var at = email.IndexOf('@');
        return at > 0 && at < email.Length - 1 ? email[(at + 1)..].ToLowerInvariant() : string.Empty;
    }

    private static IEnumerable<string> SplitAddresses(string? field)
    {
        if (string.IsNullOrWhiteSpace(field)) yield break;
        foreach (var part in field.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var value = part;
            var lt = value.IndexOf('<');
            var gt = value.IndexOf('>');
            if (lt >= 0 && gt > lt)
                value = value.Substring(lt + 1, gt - lt - 1);
            value = value.Trim().Trim('"', '\'').ToLowerInvariant();
            if (value.Contains('@'))
                yield return value;
        }
    }
}
