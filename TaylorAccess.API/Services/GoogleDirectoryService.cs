using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public sealed class GoogleWorkspaceUser
{
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";
    public string FullName { get; set; } = "";
    public string OrgUnitPath { get; set; } = "";
    public bool IsAdmin { get; set; }
    public bool IsDelegatedAdmin { get; set; }
    public bool Suspended { get; set; }
    public bool Archived { get; set; }
    public bool IsEnrolledIn2Sv { get; set; }
    public string? LastLoginTime { get; set; }
    public string? CreationTime { get; set; }
    public string? ThumbnailPhotoUrl { get; set; }
    public List<string> Aliases { get; set; } = new();
}

public sealed class GoogleDirectoryResult
{
    public bool Success { get; init; }
    public string? Error { get; init; }
    public List<GoogleWorkspaceUser> Users { get; init; } = new();
}

/// <summary>
/// Lists Google Workspace domain users via the Admin SDK Directory API using the same
/// domain-wide-delegation service account as <see cref="GmailDirectMetricsService"/>.
/// </summary>
public class GoogleDirectoryService
{
    private const string GoogleTokenUrl = "https://oauth2.googleapis.com/token";
    private const string DirectoryScope = "https://www.googleapis.com/auth/admin.directory.user.readonly";

    private readonly TaylorAccessDbContext _context;
    private readonly IntegrationEncryptionService _encryption;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GoogleDirectoryService> _logger;

    public GoogleDirectoryService(
        TaylorAccessDbContext context,
        IntegrationEncryptionService encryption,
        IHttpClientFactory httpClientFactory,
        ILogger<GoogleDirectoryService> logger)
    {
        _context = context;
        _encryption = encryption;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<GoogleDirectoryResult> ListDomainUsersAsync(CancellationToken cancellationToken = default)
    {
        string? saKeyJson;
        try
        {
            saKeyJson = await ResolveServiceAccountJsonAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            return new GoogleDirectoryResult { Success = false, Error = ex.Message };
        }

        if (string.IsNullOrWhiteSpace(saKeyJson))
            return new GoogleDirectoryResult { Success = false, Error = "No Google service account key configured" };

        var adminEmail = Environment.GetEnvironmentVariable("GOOGLE_ADMIN_EMAIL") ?? "van-tac@taylor-corp.net";

        string token;
        try
        {
            token = await GetServiceAccountTokenAsync(saKeyJson, adminEmail, DirectoryScope, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Google Directory token exchange failed");
            return new GoogleDirectoryResult
            {
                Success = false,
                Error = "Google authorization failed. Ensure the service account has the " +
                        "admin.directory.user.readonly scope in domain-wide delegation. " + ex.Message
            };
        }

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var users = new List<GoogleWorkspaceUser>();
        string? pageToken = null;

        do
        {
            var url = "https://admin.googleapis.com/admin/directory/v1/users" +
                      "?customer=my_customer&maxResults=500&orderBy=email";
            if (!string.IsNullOrEmpty(pageToken))
                url += $"&pageToken={Uri.EscapeDataString(pageToken)}";

            using var res = await client.GetAsync(url, cancellationToken);
            var body = await res.Content.ReadAsStringAsync(cancellationToken);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Google Directory users.list failed ({Status}): {Body}",
                    (int)res.StatusCode, body[..Math.Min(body.Length, 300)]);
                return new GoogleDirectoryResult
                {
                    Success = false,
                    Error = $"Directory API error {(int)res.StatusCode}: {body[..Math.Min(body.Length, 200)]}"
                };
            }

            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("users", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var u in arr.EnumerateArray())
                    users.Add(MapUser(u));
            }

            pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var next) ? next.GetString() : null;
        } while (!string.IsNullOrEmpty(pageToken));

        return new GoogleDirectoryResult { Success = true, Users = users };
    }

    private static GoogleWorkspaceUser MapUser(JsonElement u)
    {
        var user = new GoogleWorkspaceUser
        {
            Id = GetString(u, "id"),
            Email = GetString(u, "primaryEmail"),
            OrgUnitPath = GetString(u, "orgUnitPath"),
            IsAdmin = GetBool(u, "isAdmin"),
            IsDelegatedAdmin = GetBool(u, "isDelegatedAdmin"),
            Suspended = GetBool(u, "suspended"),
            Archived = GetBool(u, "archived"),
            IsEnrolledIn2Sv = GetBool(u, "isEnrolledIn2Sv"),
            ThumbnailPhotoUrl = NullIfEmpty(GetString(u, "thumbnailPhotoUrl")),
            CreationTime = NullIfEmpty(GetString(u, "creationTime"))
        };

        if (u.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.Object)
            user.FullName = GetString(name, "fullName");

        // Google reports epoch (1970) for users that never logged in
        var lastLogin = GetString(u, "lastLoginTime");
        user.LastLoginTime = lastLogin.StartsWith("1970") ? null : NullIfEmpty(lastLogin);

        if (u.TryGetProperty("aliases", out var aliases) && aliases.ValueKind == JsonValueKind.Array)
            user.Aliases = aliases.EnumerateArray()
                .Select(a => a.GetString() ?? "")
                .Where(a => a.Length > 0)
                .ToList();

        return user;
    }

    private static string GetString(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";

    private static bool GetBool(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.True;

    private static string? NullIfEmpty(string value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private async Task<string?> ResolveServiceAccountJsonAsync(CancellationToken cancellationToken)
    {
        var b64 = Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_KEY_B64");
        if (!string.IsNullOrWhiteSpace(b64))
            return Encoding.UTF8.GetString(Convert.FromBase64String(b64));

        var env = Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_KEY");
        if (!string.IsNullOrWhiteSpace(env))
            return env;

        var config = await _context.IntegrationConfigs.AsNoTracking()
            .Where(c => c.IntegrationType == "gmail-domain" && c.EncryptedApiKey != null)
            .OrderByDescending(c => c.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (config?.EncryptedApiKey == null || !_encryption.IsConfigured)
            return null;

        return _encryption.Decrypt(config.EncryptedApiKey);
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
        if (trimmed.StartsWith('\'') && trimmed.EndsWith('\''))
            trimmed = trimmed[1..^1];
        return trimmed.Replace("\\n", "\n");
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
}
