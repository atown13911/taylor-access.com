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
    public string GivenName { get; set; } = "";
    public string FamilyName { get; set; } = "";
    public string OrgUnitPath { get; set; } = "";
    public string? RecoveryEmail { get; set; }
    public string? RecoveryPhone { get; set; }
    public bool IsAdmin { get; set; }
    public bool IsDelegatedAdmin { get; set; }
    public bool Suspended { get; set; }
    public bool Archived { get; set; }
    public bool Deleted { get; set; }
    public string? DeletionTime { get; set; }
    public string? SuspensionReason { get; set; }
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

public sealed class GoogleOAuthToken
{
    public string ClientId { get; set; } = "";
    public string DisplayText { get; set; } = "";
    public List<string> Scopes { get; set; } = new();
    public bool NativeApp { get; set; }
}

public sealed class GoogleAsp
{
    public long CodeId { get; set; }
    public string Name { get; set; } = "";
    public long CreationTime { get; set; }
    public long LastTimeUsed { get; set; }
}

public sealed class GoogleUserSecurity
{
    public List<GoogleOAuthToken> Tokens { get; set; } = new();
    public List<GoogleAsp> Asps { get; set; } = new();
    public List<string> BackupCodes { get; set; } = new();
}

/// <summary>
/// Lists Google Workspace domain users via the Admin SDK Directory API using the same
/// domain-wide-delegation service account as <see cref="GmailDirectMetricsService"/>.
/// </summary>
public class GoogleDirectoryService
{
    private const string GoogleTokenUrl = "https://oauth2.googleapis.com/token";
    private const string DirectoryScope = "https://www.googleapis.com/auth/admin.directory.user.readonly";
    private const string DirectoryWriteScope = "https://www.googleapis.com/auth/admin.directory.user";
    private const string DirectorySecurityScope = "https://www.googleapis.com/auth/admin.directory.user.security";

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
        var (token, tokenError) = await AcquireTokenAsync(DirectoryScope, cancellationToken);
        if (token == null)
            return new GoogleDirectoryResult { Success = false, Error = tokenError };

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var users = new List<GoogleWorkspaceUser>();

        var error = await FetchUsersAsync(client, users, showDeleted: false, cancellationToken);
        if (error != null)
            return new GoogleDirectoryResult { Success = false, Error = error };

        // Recently deleted users (recoverable ~20 days) only appear via showDeleted=true
        // and return a reduced field set. Non-fatal if this secondary query fails.
        var deletedError = await FetchUsersAsync(client, users, showDeleted: true, cancellationToken);
        if (deletedError != null)
            _logger.LogWarning("Google Directory deleted-users query failed: {Error}", deletedError);

        return new GoogleDirectoryResult { Success = true, Users = users };
    }

    /// <summary>
    /// Executes an admin action against a Workspace account. Supported actions:
    /// suspend, unsuspend, archive, unarchive, undelete, signout.
    /// </summary>
    public async Task<(bool Success, string? Error)> ExecuteUserActionAsync(
        string userKey,
        string action,
        string? orgUnitPath,
        CancellationToken cancellationToken = default)
    {
        var baseUrl = UserUrl(userKey);
        HttpRequestMessage request = action switch
        {
            "suspend" => JsonRequest(HttpMethod.Put, baseUrl, new { suspended = true }),
            "unsuspend" => JsonRequest(HttpMethod.Put, baseUrl, new { suspended = false }),
            "archive" => JsonRequest(HttpMethod.Put, baseUrl, new { archived = true }),
            "unarchive" => JsonRequest(HttpMethod.Put, baseUrl, new { archived = false }),
            "undelete" => JsonRequest(HttpMethod.Post, $"{baseUrl}/undelete", new { orgUnitPath = string.IsNullOrWhiteSpace(orgUnitPath) ? "/" : orgUnitPath }),
            "makeadmin" => JsonRequest(HttpMethod.Post, $"{baseUrl}/makeAdmin", new { status = true }),
            "revokeadmin" => JsonRequest(HttpMethod.Post, $"{baseUrl}/makeAdmin", new { status = false }),
            "signout" => new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/signOut"),
            _ => throw new ArgumentException($"Unknown action '{action}'")
        };

        var scope = action == "signout" ? DirectorySecurityScope : DirectoryWriteScope;
        return await SendDirectoryRequestAsync(request, scope, $"action {action} on {userKey}", cancellationToken);
    }

    /// <summary>
    /// Partially updates a Workspace user (name, org unit, recovery contacts, primary email, password).
    /// </summary>
    public Task<(bool Success, string? Error)> PatchUserAsync(
        string userKey,
        Dictionary<string, object> payload,
        CancellationToken cancellationToken = default) =>
        SendDirectoryRequestAsync(
            JsonRequest(HttpMethod.Patch, UserUrl(userKey), payload),
            DirectoryWriteScope, $"patch on {userKey}", cancellationToken);

    public Task<(bool Success, string? Error)> AddAliasAsync(
        string userKey, string alias, CancellationToken cancellationToken = default) =>
        SendDirectoryRequestAsync(
            JsonRequest(HttpMethod.Post, $"{UserUrl(userKey)}/aliases", new { alias }),
            DirectoryWriteScope, $"add alias on {userKey}", cancellationToken);

    public Task<(bool Success, string? Error)> RemoveAliasAsync(
        string userKey, string alias, CancellationToken cancellationToken = default) =>
        SendDirectoryRequestAsync(
            new HttpRequestMessage(HttpMethod.Delete, $"{UserUrl(userKey)}/aliases/{Uri.EscapeDataString(alias)}"),
            DirectoryWriteScope, $"remove alias on {userKey}", cancellationToken);

    /// <summary>
    /// Fetches a user's security surface: OAuth tokens (connected third-party apps),
    /// app-specific passwords, and 2SV backup verification codes.
    /// </summary>
    public async Task<(GoogleUserSecurity? Security, string? Error)> GetUserSecurityAsync(
        string userKey,
        CancellationToken cancellationToken = default)
    {
        var (token, tokenError) = await AcquireTokenAsync(DirectorySecurityScope, cancellationToken);
        if (token == null)
            return (null, tokenError);

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var baseUrl = UserUrl(userKey);
        var security = new GoogleUserSecurity();

        var (tokensDoc, tokensError) = await GetJsonAsync(client, $"{baseUrl}/tokens", $"tokens for {userKey}", cancellationToken);
        if (tokensDoc == null)
            return (null, tokensError);
        using (tokensDoc)
        {
            if (tokensDoc.RootElement.TryGetProperty("items", out var items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    var t = new GoogleOAuthToken
                    {
                        ClientId = item.TryGetProperty("clientId", out var ci) ? ci.GetString() ?? "" : "",
                        DisplayText = item.TryGetProperty("displayText", out var dt) ? dt.GetString() ?? "" : "",
                        NativeApp = item.TryGetProperty("nativeApp", out var na) && na.GetBoolean()
                    };
                    if (item.TryGetProperty("scopes", out var scopes) && scopes.ValueKind == JsonValueKind.Array)
                        t.Scopes = scopes.EnumerateArray().Select(s => s.GetString() ?? "").Where(s => s.Length > 0).ToList();
                    security.Tokens.Add(t);
                }
            }
        }

        var (aspsDoc, aspsError) = await GetJsonAsync(client, $"{baseUrl}/asps", $"asps for {userKey}", cancellationToken);
        if (aspsDoc == null)
            return (null, aspsError);
        using (aspsDoc)
        {
            if (aspsDoc.RootElement.TryGetProperty("items", out var items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    security.Asps.Add(new GoogleAsp
                    {
                        CodeId = ReadLong(item, "codeId"),
                        Name = item.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "",
                        CreationTime = ReadLong(item, "creationTime"),
                        LastTimeUsed = ReadLong(item, "lastTimeUsed")
                    });
                }
            }
        }

        var (codesDoc, codesError) = await GetJsonAsync(client, $"{baseUrl}/verificationCodes", $"verification codes for {userKey}", cancellationToken);
        if (codesDoc == null)
            return (null, codesError);
        using (codesDoc)
        {
            if (codesDoc.RootElement.TryGetProperty("items", out var items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    var code = item.TryGetProperty("verificationCode", out var vc) ? vc.GetString() : null;
                    if (!string.IsNullOrWhiteSpace(code))
                        security.BackupCodes.Add(code);
                }
            }
        }

        return (security, null);
    }

    public Task<(bool Success, string? Error)> RevokeTokenAsync(
        string userKey, string clientId, CancellationToken cancellationToken = default) =>
        SendDirectoryRequestAsync(
            new HttpRequestMessage(HttpMethod.Delete, $"{UserUrl(userKey)}/tokens/{Uri.EscapeDataString(clientId)}"),
            DirectorySecurityScope, $"revoke token on {userKey}", cancellationToken);

    public Task<(bool Success, string? Error)> DeleteAspAsync(
        string userKey, long codeId, CancellationToken cancellationToken = default) =>
        SendDirectoryRequestAsync(
            new HttpRequestMessage(HttpMethod.Delete, $"{UserUrl(userKey)}/asps/{codeId}"),
            DirectorySecurityScope, $"delete ASP on {userKey}", cancellationToken);

    public Task<(bool Success, string? Error)> GenerateBackupCodesAsync(
        string userKey, CancellationToken cancellationToken = default) =>
        SendDirectoryRequestAsync(
            new HttpRequestMessage(HttpMethod.Post, $"{UserUrl(userKey)}/verificationCodes/generate"),
            DirectorySecurityScope, $"generate backup codes on {userKey}", cancellationToken);

    public Task<(bool Success, string? Error)> InvalidateBackupCodesAsync(
        string userKey, CancellationToken cancellationToken = default) =>
        SendDirectoryRequestAsync(
            new HttpRequestMessage(HttpMethod.Post, $"{UserUrl(userKey)}/verificationCodes/invalidate"),
            DirectorySecurityScope, $"invalidate backup codes on {userKey}", cancellationToken);

    // Google renders int64 values as JSON strings; accept both forms.
    private static long ReadLong(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value)) return 0;
        return value.ValueKind switch
        {
            JsonValueKind.Number => value.GetInt64(),
            JsonValueKind.String when long.TryParse(value.GetString(), out var parsed) => parsed,
            _ => 0
        };
    }

    private async Task<(JsonDocument? Doc, string? Error)> GetJsonAsync(
        HttpClient client, string url, string context, CancellationToken cancellationToken)
    {
        using var res = await client.GetAsync(url, cancellationToken);
        var body = await res.Content.ReadAsStringAsync(cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            _logger.LogWarning("Google Directory {Context} failed ({Status}): {Body}",
                context, (int)res.StatusCode, body[..Math.Min(body.Length, 300)]);
            return (null, $"Google API error {(int)res.StatusCode}: {body[..Math.Min(body.Length, 200)]}");
        }

        return (JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body), null);
    }

    private static string UserUrl(string userKey) =>
        $"https://admin.googleapis.com/admin/directory/v1/users/{Uri.EscapeDataString(userKey)}";

    private static HttpRequestMessage JsonRequest(HttpMethod method, string url, object payload) =>
        new(method, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };

    private async Task<(bool Success, string? Error)> SendDirectoryRequestAsync(
        HttpRequestMessage request,
        string scope,
        string context,
        CancellationToken cancellationToken)
    {
        var (token, tokenError) = await AcquireTokenAsync(scope, cancellationToken);
        if (token == null)
        {
            request.Dispose();
            return (false, tokenError);
        }

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using (request)
        using (var res = await client.SendAsync(request, cancellationToken))
        {
            if (res.IsSuccessStatusCode)
                return (true, null);

            var body = await res.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning("Google Directory {Context} failed ({Status}): {Body}",
                context, (int)res.StatusCode, body[..Math.Min(body.Length, 300)]);

            var error = $"Google API error {(int)res.StatusCode}: {body[..Math.Min(body.Length, 200)]}";
            if ((int)res.StatusCode == 403 || body.Contains("unauthorized", StringComparison.OrdinalIgnoreCase))
                error += scope == DirectorySecurityScope
                    ? " — the admin.directory.user.security scope may be missing from domain-wide delegation."
                    : " — the admin.directory.user (write) scope may be missing from domain-wide delegation.";
            return (false, error);
        }
    }

    private async Task<(string? Token, string? Error)> AcquireTokenAsync(string scope, CancellationToken cancellationToken)
    {
        string? saKeyJson;
        try
        {
            saKeyJson = await ResolveServiceAccountJsonAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            return (null, ex.Message);
        }

        if (string.IsNullOrWhiteSpace(saKeyJson))
            return (null, "No Google service account key configured");

        var adminEmail = Environment.GetEnvironmentVariable("GOOGLE_ADMIN_EMAIL") ?? "van-tac@taylor-corp.net";
        try
        {
            return (await GetServiceAccountTokenAsync(saKeyJson, adminEmail, scope, cancellationToken), null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Google Directory token exchange failed for scope {Scope}", scope);
            return (null, $"Google authorization failed for scope {scope}. " +
                          "Ensure it is authorized in domain-wide delegation. " + ex.Message);
        }
    }

    private async Task<string?> FetchUsersAsync(
        HttpClient client,
        List<GoogleWorkspaceUser> users,
        bool showDeleted,
        CancellationToken cancellationToken)
    {
        string? pageToken = null;

        do
        {
            var url = "https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=500";
            url += showDeleted ? "&showDeleted=true" : "&orderBy=email";
            if (!string.IsNullOrEmpty(pageToken))
                url += $"&pageToken={Uri.EscapeDataString(pageToken)}";

            using var res = await client.GetAsync(url, cancellationToken);
            var body = await res.Content.ReadAsStringAsync(cancellationToken);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Google Directory users.list failed ({Status}, showDeleted={ShowDeleted}): {Body}",
                    (int)res.StatusCode, showDeleted, body[..Math.Min(body.Length, 300)]);
                return $"Directory API error {(int)res.StatusCode}: {body[..Math.Min(body.Length, 200)]}";
            }

            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("users", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var u in arr.EnumerateArray())
                {
                    var user = MapUser(u);
                    user.Deleted = showDeleted;
                    users.Add(user);
                }
            }

            pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var next) ? next.GetString() : null;
        } while (!string.IsNullOrEmpty(pageToken));

        return null;
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
            CreationTime = NullIfEmpty(GetString(u, "creationTime")),
            DeletionTime = NullIfEmpty(GetString(u, "deletionTime")),
            SuspensionReason = NullIfEmpty(GetString(u, "suspensionReason")),
            RecoveryEmail = NullIfEmpty(GetString(u, "recoveryEmail")),
            RecoveryPhone = NullIfEmpty(GetString(u, "recoveryPhone"))
        };

        if (u.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.Object)
        {
            user.FullName = GetString(name, "fullName");
            user.GivenName = GetString(name, "givenName");
            user.FamilyName = GetString(name, "familyName");
        }

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
        using var saKey = ParseServiceAccountKey(saKeyJson);
        var clientEmail = saKey.RootElement.GetProperty("client_email").GetString()
            ?? throw new InvalidOperationException("service account missing client_email");
        var privateKeyPem = saKey.RootElement.GetProperty("private_key").GetString()
            ?? throw new InvalidOperationException("service account missing private_key");
        // Keys pasted with double-escaped newlines leave literal "\n" text in the PEM
        if (privateKeyPem.Contains("\\n"))
            privateKeyPem = privateKeyPem.Replace("\\n", "\n");

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

    private static JsonDocument ParseServiceAccountKey(string raw)
    {
        var trimmed = raw.Trim();
        if (trimmed.StartsWith('\'') && trimmed.EndsWith('\''))
            trimmed = trimmed[1..^1].Trim();

        // A well-formed key file parses as-is; rewriting "\n" escapes first would
        // inject raw newlines into the private_key string and corrupt the JSON.
        try
        {
            return JsonDocument.Parse(trimmed);
        }
        catch (JsonException)
        {
            return JsonDocument.Parse(trimmed.Replace("\\n", "\n"));
        }
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
}
