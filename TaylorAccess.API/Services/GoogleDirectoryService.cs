using System.Collections.Concurrent;
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

public sealed class GoogleGroupInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Description { get; set; } = "";
    public long DirectMembersCount { get; set; }
    public bool AdminCreated { get; set; }
    public List<string> Aliases { get; set; } = new();
}

/// <summary>One member of a Workspace group (Directory Members API).</summary>
public sealed class GoogleGroupMemberInfo
{
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";
    /// <summary>OWNER | MANAGER | MEMBER</summary>
    public string Role { get; set; } = "";
    /// <summary>USER | GROUP | CUSTOMER</summary>
    public string Type { get; set; } = "";
    /// <summary>ACTIVE | SUSPENDED | ARCHIVED (empty for nested groups)</summary>
    public string Status { get; set; } = "";
}

public sealed class GoogleLicenseInfo
{
    public string ProductId { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string SkuId { get; set; } = "";
    public string SkuName { get; set; } = "";
}

public sealed class GoogleLoginEvent
{
    public string? Time { get; set; }
    public string Name { get; set; } = "";
    public string? IpAddress { get; set; }
}

/// <summary>An admin role assigned to a user (Directory API roleAssignments + roles).</summary>
public sealed class GoogleRoleAssignmentInfo
{
    public string RoleAssignmentId { get; set; } = "";
    public string RoleId { get; set; } = "";
    public string RoleName { get; set; } = "";
    public string RoleDescription { get; set; } = "";
    public bool IsSuperAdminRole { get; set; }
    public bool IsSystemRole { get; set; }
    /// <summary>CUSTOMER (entire domain) or ORG_UNIT.</summary>
    public string ScopeType { get; set; } = "";
    public string? OrgUnitId { get; set; }
}

/// <summary>Most recent OAuth token audit event per connected app (Reports API `token` log).</summary>
public sealed class GoogleTokenActivity
{
    public string ClientId { get; set; } = "";
    public string AppName { get; set; } = "";
    /// <summary>ISO timestamp of the newest authorize/request event; null if none in the audit window.</summary>
    public string? LastActivityTime { get; set; }
    /// <summary>authorize | request | revoke</summary>
    public string LastEvent { get; set; } = "";
}

public sealed class GoogleTransferApp
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
}

public sealed class GoogleUserStorage
{
    public string Email { get; set; } = "";
    public long UsedMb { get; set; }
    public long DriveMb { get; set; }
    public long GmailMb { get; set; }
    public long PhotosMb { get; set; }
    public double UsedPercent { get; set; }
}

public sealed class GoogleTransferInfo
{
    public string Id { get; set; } = "";
    public string? RequestTime { get; set; }
    public string Status { get; set; } = "";
    public string NewOwnerUserId { get; set; } = "";
    public List<string> Apps { get; set; } = new();
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
    private const string GroupReadScope = "https://www.googleapis.com/auth/admin.directory.group.readonly";
    private const string LicensingScope = "https://www.googleapis.com/auth/apps.licensing";
    private const string ReportsScope = "https://www.googleapis.com/auth/admin.reports.audit.readonly";
    private const string UsageReportScope = "https://www.googleapis.com/auth/admin.reports.usage.readonly";
    private const string DataTransferScope = "https://www.googleapis.com/auth/admin.datatransfer";
    public const string DriveReadScope = "https://www.googleapis.com/auth/drive.readonly";
    public const string GmailReadScope = "https://www.googleapis.com/auth/gmail.readonly";
    private const string RoleManagementScope = "https://www.googleapis.com/auth/admin.directory.rolemanagement";

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

    public async Task<GoogleDirectoryResult> ListDomainUsersAsync(
        bool restrictedOnly = false,
        CancellationToken cancellationToken = default)
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

        await EnsureDynamicHiddenLoadedAsync(cancellationToken);

        if (restrictedOnly)
            users.RemoveAll(u =>
                !IsHiddenUser(u.Email) && !u.Aliases.Any(IsHiddenUser));
        else
            users.RemoveAll(u =>
                IsHiddenUser(u.Email) || u.Aliases.Any(IsHiddenUser));

        return new GoogleDirectoryResult { Success = true, Users = users };
    }

    public static bool IsHiddenUser(string email) =>
        !string.IsNullOrWhiteSpace(email) &&
        (EnvHiddenUsers.Contains(email) || DynamicHiddenUsers.ContainsKey(email));

    // Seed / env allowlist — always restricted (comma-separated override).
    private static readonly HashSet<string> EnvHiddenUsers =
        (Environment.GetEnvironmentVariable("GOOGLE_HIDDEN_WORKSPACE_USERS")
            ?? "austin.taylor@taylor-corp.net,anatomic@taylor-corp.net,ana.t@landmark-trucking.com")
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    // Runtime additions from GoogleRestrictedWorkspaceUsers (product-owner UI).
    private static readonly ConcurrentDictionary<string, byte> DynamicHiddenUsers =
        new(StringComparer.OrdinalIgnoreCase);
    private static int _dynamicHiddenLoaded; // 0 = not loaded, 1 = loaded

    public async Task EnsureRestrictedUsersLoadedAsync(CancellationToken cancellationToken = default)
        => await EnsureDynamicHiddenLoadedAsync(cancellationToken);

    private async Task EnsureDynamicHiddenLoadedAsync(CancellationToken cancellationToken = default)
    {
        if (Interlocked.CompareExchange(ref _dynamicHiddenLoaded, 1, 0) != 0)
            return;

        try
        {
            var emails = await _context.GoogleRestrictedWorkspaceUsers
                .AsNoTracking()
                .Select(r => r.Email)
                .ToListAsync(cancellationToken);
            foreach (var email in emails)
            {
                if (!string.IsNullOrWhiteSpace(email))
                    DynamicHiddenUsers.TryAdd(email.Trim(), 0);
            }
        }
        catch (Exception ex)
        {
            // Allow retry on next call if the table isn't ready yet.
            Interlocked.Exchange(ref _dynamicHiddenLoaded, 0);
            _logger.LogWarning(ex, "Failed to load restricted Workspace users from database");
        }
    }

    /// <summary>
    /// Adds an account to Restricted Access (DB + in-memory cache). Idempotent.
    /// Returns true when newly added, false when already restricted.
    /// </summary>
    public async Task<(bool Added, string? Error)> AddRestrictedUserAsync(
        string email,
        string? createdByEmail,
        CancellationToken cancellationToken = default)
    {
        var normalized = (email ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(normalized) || !normalized.Contains('@'))
            return (false, "A valid email is required");

        await EnsureDynamicHiddenLoadedAsync(cancellationToken);

        if (IsHiddenUser(normalized))
            return (false, null);

        try
        {
            _context.GoogleRestrictedWorkspaceUsers.Add(new GoogleRestrictedWorkspaceUser
            {
                Email = normalized,
                CreatedAt = DateTime.UtcNow,
                CreatedByEmail = string.IsNullOrWhiteSpace(createdByEmail) ? null : createdByEmail.Trim()
            });
            await _context.SaveChangesAsync(cancellationToken);
            DynamicHiddenUsers.TryAdd(normalized, 0);
            return (true, null);
        }
        catch (DbUpdateException)
        {
            // Unique index race — treat as already restricted.
            DynamicHiddenUsers.TryAdd(normalized, 0);
            return (false, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to restrict Workspace user {Email}", normalized);
            return (false, "Failed to move account to Restricted Access");
        }
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
    /// Removes every admin role assignment for a user (delegated admin roles).
    /// Super admin status is separate — use the revokeadmin action for that.
    /// </summary>
    public async Task<(bool Success, string? Error, int Removed)> RemoveAdminRolesAsync(
        string userKey,
        CancellationToken cancellationToken = default)
    {
        var (token, tokenError) = await AcquireTokenAsync(RoleManagementScope, cancellationToken);
        if (token == null)
            return (false, tokenError, 0);

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var assignmentIds = new List<string>();
        string? pageToken = null;
        do
        {
            var url = "https://admin.googleapis.com/admin/directory/v1/customer/my_customer/roleassignments" +
                      $"?userKey={Uri.EscapeDataString(userKey)}&maxResults=200" +
                      (pageToken != null ? "&pageToken=" + Uri.EscapeDataString(pageToken) : "");
            var (doc, error) = await GetJsonAsync(client, url, $"role assignments for {userKey}", cancellationToken);
            if (doc == null)
                return (false, error, 0);
            using (doc)
            {
                if (doc.RootElement.TryGetProperty("items", out var items))
                    foreach (var item in items.EnumerateArray())
                        if (item.TryGetProperty("roleAssignmentId", out var raId))
                            assignmentIds.Add(raId.GetString() ?? "");
                pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
            }
        } while (!string.IsNullOrEmpty(pageToken));

        assignmentIds.RemoveAll(string.IsNullOrEmpty);
        if (assignmentIds.Count == 0)
            return (true, null, 0);

        var removed = 0;
        foreach (var assignmentId in assignmentIds)
        {
            var url = "https://admin.googleapis.com/admin/directory/v1/customer/my_customer/roleassignments/" +
                      Uri.EscapeDataString(assignmentId);
            using var res = await client.DeleteAsync(url, cancellationToken);
            if (res.IsSuccessStatusCode)
            {
                removed++;
                continue;
            }

            var body = await res.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning("Google role assignment delete failed for {User} assignment {Assignment}: {Status} {Body}",
                userKey, assignmentId, (int)res.StatusCode, body[..Math.Min(body.Length, 200)]);
            return (false, $"Removed {removed} of {assignmentIds.Count} role assignments; delete failed with HTTP {(int)res.StatusCode}", removed);
        }

        return (true, null, removed);
    }

    /// <summary>
    /// Lists the admin role assignments for a user, resolved against the domain's
    /// role definitions so names and descriptions are included.
    /// </summary>
    public async Task<(List<GoogleRoleAssignmentInfo>? Roles, string? Error)> ListUserRolesAsync(
        string userKey,
        CancellationToken cancellationToken = default)
    {
        var (token, tokenError) = await AcquireTokenAsync(RoleManagementScope, cancellationToken);
        if (token == null)
            return (null, tokenError);

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Google serializes int64 ids as JSON strings, but be tolerant of numbers too.
        static string ReadId(JsonElement el, string prop)
        {
            if (!el.TryGetProperty(prop, out var v)) return "";
            return v.ValueKind == JsonValueKind.Number ? v.GetRawText() : v.GetString() ?? "";
        }

        var assignments = new List<GoogleRoleAssignmentInfo>();
        string? pageToken = null;
        do
        {
            var url = "https://admin.googleapis.com/admin/directory/v1/customer/my_customer/roleassignments" +
                      $"?userKey={Uri.EscapeDataString(userKey)}&maxResults=200" +
                      (pageToken != null ? "&pageToken=" + Uri.EscapeDataString(pageToken) : "");
            var (doc, error) = await GetJsonAsync(client, url, $"role assignments for {userKey}", cancellationToken);
            if (doc == null)
                return (null, error);
            using (doc)
            {
                if (doc.RootElement.TryGetProperty("items", out var items))
                    foreach (var item in items.EnumerateArray())
                        assignments.Add(new GoogleRoleAssignmentInfo
                        {
                            RoleAssignmentId = ReadId(item, "roleAssignmentId"),
                            RoleId = ReadId(item, "roleId"),
                            ScopeType = GetString(item, "scopeType"),
                            OrgUnitId = NullIfEmpty(GetString(item, "orgUnitId"))
                        });
                pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
            }
        } while (!string.IsNullOrEmpty(pageToken));

        if (assignments.Count == 0)
            return (assignments, null);

        // Resolve role ids to names/descriptions. Non-fatal on failure — raw ids still render.
        pageToken = null;
        var rolesById = new Dictionary<string, JsonElement>();
        var roleDocs = new List<JsonDocument>();
        try
        {
            do
            {
                var url = "https://admin.googleapis.com/admin/directory/v1/customer/my_customer/roles?maxResults=100" +
                          (pageToken != null ? "&pageToken=" + Uri.EscapeDataString(pageToken) : "");
                var (doc, error) = await GetJsonAsync(client, url, "domain role definitions", cancellationToken);
                if (doc == null)
                {
                    _logger.LogWarning("Google Directory role definitions lookup failed: {Error}", error);
                    break;
                }
                roleDocs.Add(doc);
                if (doc.RootElement.TryGetProperty("items", out var items))
                    foreach (var item in items.EnumerateArray())
                        rolesById[ReadId(item, "roleId")] = item;
                pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
            } while (!string.IsNullOrEmpty(pageToken));

            foreach (var assignment in assignments)
            {
                if (!rolesById.TryGetValue(assignment.RoleId, out var role)) continue;
                assignment.RoleName = GetString(role, "roleName");
                assignment.RoleDescription = GetString(role, "roleDescription");
                assignment.IsSuperAdminRole = GetBool(role, "isSuperAdminRole");
                assignment.IsSystemRole = GetBool(role, "isSystemRole");
            }
        }
        finally
        {
            foreach (var doc in roleDocs) doc.Dispose();
        }

        return (assignments, null);
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

    /// <summary>Groups the user is a member of (Directory Groups API).</summary>
    public async Task<(List<GoogleGroupInfo>? Groups, string? Error)> GetUserGroupsAsync(
        string userKey, CancellationToken cancellationToken = default)
    {
        var groups = new List<GoogleGroupInfo>();
        string? pageToken = null;
        do
        {
            var url = $"https://admin.googleapis.com/admin/directory/v1/groups?userKey={Uri.EscapeDataString(userKey)}&maxResults=200"
                      + (pageToken != null ? $"&pageToken={Uri.EscapeDataString(pageToken)}" : "");
            var (doc, error) = await GetJsonWithScopeAsync(url, GroupReadScope, $"groups for {userKey}", cancellationToken);
            if (doc == null)
                return (null, error);

            using (doc)
            {
                if (doc.RootElement.TryGetProperty("groups", out var items))
                {
                    foreach (var item in items.EnumerateArray())
                    {
                        groups.Add(new GoogleGroupInfo
                        {
                            Id = ReadString(item, "id"),
                            Name = ReadString(item, "name"),
                            Email = ReadString(item, "email"),
                            Description = ReadString(item, "description"),
                            DirectMembersCount = ReadLong(item, "directMembersCount")
                        });
                    }
                }

                pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
            }
        } while (!string.IsNullOrEmpty(pageToken));

        return (groups, null);
    }

    /// <summary>All groups on the domain (Directory Groups API).</summary>
    public async Task<(List<GoogleGroupInfo>? Groups, string? Error)> ListDomainGroupsAsync(
        CancellationToken cancellationToken = default)
    {
        var groups = new List<GoogleGroupInfo>();
        string? pageToken = null;
        do
        {
            var url = "https://admin.googleapis.com/admin/directory/v1/groups?customer=my_customer&maxResults=200"
                      + (pageToken != null ? $"&pageToken={Uri.EscapeDataString(pageToken)}" : "");
            var (doc, error) = await GetJsonWithScopeAsync(url, GroupReadScope, "domain groups", cancellationToken);
            if (doc == null)
                return (null, error);

            using (doc)
            {
                if (doc.RootElement.TryGetProperty("groups", out var items))
                {
                    foreach (var item in items.EnumerateArray())
                    {
                        var group = new GoogleGroupInfo
                        {
                            Id = ReadString(item, "id"),
                            Name = ReadString(item, "name"),
                            Email = ReadString(item, "email"),
                            Description = ReadString(item, "description"),
                            DirectMembersCount = ReadLong(item, "directMembersCount"),
                            AdminCreated = item.TryGetProperty("adminCreated", out var ac) &&
                                           ac.ValueKind == JsonValueKind.True
                        };
                        if (item.TryGetProperty("aliases", out var aliases) && aliases.ValueKind == JsonValueKind.Array)
                            group.Aliases = aliases.EnumerateArray()
                                .Select(a => a.GetString() ?? "")
                                .Where(a => a.Length > 0)
                                .ToList();
                        groups.Add(group);
                    }
                }

                pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
            }
        } while (!string.IsNullOrEmpty(pageToken));

        return (groups, null);
    }

    /// <summary>Direct members of a group (Directory Members API).</summary>
    public async Task<(List<GoogleGroupMemberInfo>? Members, string? Error)> GetGroupMembersAsync(
        string groupKey, CancellationToken cancellationToken = default)
    {
        var members = new List<GoogleGroupMemberInfo>();
        string? pageToken = null;
        do
        {
            var url = $"https://admin.googleapis.com/admin/directory/v1/groups/{Uri.EscapeDataString(groupKey)}/members?maxResults=200"
                      + (pageToken != null ? $"&pageToken={Uri.EscapeDataString(pageToken)}" : "");
            var (doc, error) = await GetJsonWithScopeAsync(url, GroupReadScope, $"members of {groupKey}", cancellationToken);
            if (doc == null)
                return (null, error);

            using (doc)
            {
                if (doc.RootElement.TryGetProperty("members", out var items))
                {
                    foreach (var item in items.EnumerateArray())
                    {
                        members.Add(new GoogleGroupMemberInfo
                        {
                            Id = ReadString(item, "id"),
                            Email = ReadString(item, "email"),
                            Role = ReadString(item, "role"),
                            Type = ReadString(item, "type"),
                            Status = ReadString(item, "status")
                        });
                    }
                }

                pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
            }
        } while (!string.IsNullOrEmpty(pageToken));

        return (members, null);
    }

    // Products checked for license assignments (Enterprise License Manager API has no per-user query).
    private static readonly string[] LicensingProductIds = { "Google-Apps", "Google-Vault" };

    /// <summary>License assignments for a user across known Workspace products.</summary>
    public async Task<(List<GoogleLicenseInfo>? Licenses, string? Error)> GetUserLicensesAsync(
        string userEmail, CancellationToken cancellationToken = default)
    {
        var adminEmail = Environment.GetEnvironmentVariable("GOOGLE_ADMIN_EMAIL") ?? "van-tac@taylor-corp.net";
        var customerId = adminEmail.Contains('@') ? adminEmail.Split('@')[1] : adminEmail;

        var licenses = new List<GoogleLicenseInfo>();
        string? firstError = null;

        foreach (var productId in LicensingProductIds)
        {
            string? pageToken = null;
            do
            {
                var url = $"https://licensing.googleapis.com/apps/licensing/v1/product/{Uri.EscapeDataString(productId)}/users" +
                          $"?customerId={Uri.EscapeDataString(customerId)}&maxResults=1000" +
                          (pageToken != null ? $"&pageToken={Uri.EscapeDataString(pageToken)}" : "");
                var (doc, error) = await GetJsonWithScopeAsync(url, LicensingScope, $"licenses {productId}", cancellationToken);
                if (doc == null)
                {
                    // Auth errors are fatal; per-product errors (e.g. product not owned) are skipped.
                    if (error != null && error.Contains("authorization failed", StringComparison.OrdinalIgnoreCase))
                        return (null, error);
                    firstError ??= error;
                    break;
                }

                using (doc)
                {
                    if (doc.RootElement.TryGetProperty("items", out var items))
                    {
                        foreach (var item in items.EnumerateArray())
                        {
                            if (!string.Equals(ReadString(item, "userId"), userEmail, StringComparison.OrdinalIgnoreCase))
                                continue;
                            licenses.Add(new GoogleLicenseInfo
                            {
                                ProductId = ReadString(item, "productId"),
                                ProductName = ReadString(item, "productName"),
                                SkuId = ReadString(item, "skuId"),
                                SkuName = ReadString(item, "skuName")
                            });
                        }
                    }

                    pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
                }
            } while (!string.IsNullOrEmpty(pageToken));
        }

        if (licenses.Count == 0 && firstError != null)
            return (null, firstError);

        return (licenses, null);
    }

    /// <summary>Recent login audit events for a user (Reports API).</summary>
    public async Task<(List<GoogleLoginEvent>? Events, string? Error)> GetLoginEventsAsync(
        string userKey, CancellationToken cancellationToken = default)
    {
        var url = $"https://admin.googleapis.com/admin/reports/v1/activity/users/{Uri.EscapeDataString(userKey)}/applications/login?maxResults=100";
        var (doc, error) = await GetJsonWithScopeAsync(url, ReportsScope, $"login events for {userKey}", cancellationToken);
        if (doc == null)
            return (null, error);

        var events = new List<GoogleLoginEvent>();
        using (doc)
        {
            if (doc.RootElement.TryGetProperty("items", out var items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    string? time = null;
                    if (item.TryGetProperty("id", out var idEl))
                        time = ReadString(idEl, "time");

                    var ip = item.TryGetProperty("ipAddress", out var ipEl) ? ipEl.GetString() : null;

                    if (item.TryGetProperty("events", out var evts) && evts.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var evt in evts.EnumerateArray())
                        {
                            events.Add(new GoogleLoginEvent
                            {
                                Time = time,
                                Name = ReadString(evt, "name"),
                                IpAddress = ip
                            });
                        }
                    }
                }
            }
        }

        return (events, null);
    }

    /// <summary>
    /// Recent OAuth token audit activity for a user (Reports API `token` application).
    /// Apps exchange refresh tokens when actually in use, so the newest event per
    /// client is a good "last active" proxy for the connected-apps list.
    /// </summary>
    public async Task<(List<GoogleTokenActivity>? Activity, string? Error)> GetTokenActivityAsync(
        string userKey, CancellationToken cancellationToken = default)
    {
        var url = $"https://admin.googleapis.com/admin/reports/v1/activity/users/{Uri.EscapeDataString(userKey)}/applications/token?maxResults=1000";
        var (doc, error) = await GetJsonWithScopeAsync(url, ReportsScope, $"token activity for {userKey}", cancellationToken);
        if (doc == null)
            return (null, error);

        // Reports API returns items newest-first, so the first event seen per client wins.
        var byClient = new Dictionary<string, GoogleTokenActivity>(StringComparer.Ordinal);
        using (doc)
        {
            if (doc.RootElement.TryGetProperty("items", out var items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    string? time = null;
                    if (item.TryGetProperty("id", out var idEl))
                        time = ReadString(idEl, "time");

                    if (!item.TryGetProperty("events", out var evts) || evts.ValueKind != JsonValueKind.Array)
                        continue;

                    foreach (var evt in evts.EnumerateArray())
                    {
                        string clientId = "", appName = "";
                        if (evt.TryGetProperty("parameters", out var pars) && pars.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var p in pars.EnumerateArray())
                            {
                                var pName = ReadString(p, "name");
                                if (pName == "client_id") clientId = ReadString(p, "value");
                                else if (pName == "app_name") appName = ReadString(p, "value");
                            }
                        }

                        if (clientId.Length == 0 && appName.Length == 0)
                            continue;

                        var key = clientId.Length > 0 ? clientId : appName;
                        if (!byClient.ContainsKey(key))
                        {
                            byClient[key] = new GoogleTokenActivity
                            {
                                ClientId = clientId,
                                AppName = appName,
                                LastActivityTime = time,
                                LastEvent = ReadString(evt, "name")
                            };
                        }
                    }
                }
            }
        }

        return (byClient.Values.ToList(), null);
    }

    /// <summary>Applications available for data transfer (Drive, Calendar, ...).</summary>
    public async Task<(List<GoogleTransferApp>? Apps, string? Error)> GetTransferApplicationsAsync(
        CancellationToken cancellationToken = default)
    {
        var (doc, error) = await GetTransferApplicationsRawAsync(cancellationToken);
        if (doc == null)
            return (null, error);

        var apps = new List<GoogleTransferApp>();
        using (doc)
        {
            if (doc.RootElement.TryGetProperty("applications", out var items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    apps.Add(new GoogleTransferApp
                    {
                        Id = ReadLong(item, "id"),
                        Name = ReadString(item, "name")
                    });
                }
            }
        }

        return (apps, null);
    }

    /// <summary>Starts a data transfer from one user to another for the selected applications.</summary>
    public async Task<(bool Success, string? Error, string? TransferId)> InsertTransferAsync(
        string oldOwnerUserId,
        string newOwnerUserId,
        List<long> applicationIds,
        CancellationToken cancellationToken = default)
    {
        var (appsDoc, appsError) = await GetTransferApplicationsRawAsync(cancellationToken);
        if (appsDoc == null)
            return (false, appsError, null);

        var appTransfers = new List<object>();
        using (appsDoc)
        {
            if (appsDoc.RootElement.TryGetProperty("applications", out var items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    var appId = ReadLong(item, "id");
                    if (!applicationIds.Contains(appId))
                        continue;

                    // Include every transfer parameter the app supports with all allowed values
                    // (e.g. Drive PRIVACY_LEVEL: PRIVATE + SHARED) so everything moves.
                    var transferParams = new List<object>();
                    if (item.TryGetProperty("transferParams", out var tp) && tp.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var param in tp.EnumerateArray())
                        {
                            var key = ReadString(param, "key");
                            var values = param.TryGetProperty("value", out var vals) && vals.ValueKind == JsonValueKind.Array
                                ? vals.EnumerateArray().Select(v => v.GetString() ?? "").Where(v => v.Length > 0).ToList()
                                : new List<string>();
                            if (key.Length > 0 && values.Count > 0)
                                transferParams.Add(new { key, value = values });
                        }
                    }

                    appTransfers.Add(transferParams.Count > 0
                        ? new { applicationId = appId, applicationTransferParams = transferParams }
                        : (object)new { applicationId = appId });
                }
            }
        }

        if (appTransfers.Count == 0)
            return (false, "No matching transferable applications found", null);

        var body = new
        {
            oldOwnerUserId,
            newOwnerUserId,
            applicationDataTransfers = appTransfers
        };

        var (token, tokenError) = await AcquireTokenAsync(DataTransferScope, cancellationToken);
        if (token == null)
            return (false, tokenError, null);

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        using var request = JsonRequest(HttpMethod.Post, "https://admin.googleapis.com/admin/datatransfer/v1/transfers", body);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var res = await client.SendAsync(request, cancellationToken);
        var resBody = await res.Content.ReadAsStringAsync(cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            _logger.LogWarning("Google data transfer {Old} -> {New} failed ({Status}): {Body}",
                oldOwnerUserId, newOwnerUserId, (int)res.StatusCode, resBody[..Math.Min(resBody.Length, 300)]);
            return (false, $"Google API error {(int)res.StatusCode}: {resBody[..Math.Min(resBody.Length, 200)]}", null);
        }

        string? transferId = null;
        try
        {
            using var doc = JsonDocument.Parse(resBody);
            transferId = ReadString(doc.RootElement, "id");
        }
        catch (JsonException) { /* id is best-effort */ }

        return (true, null, transferId);
    }

    /// <summary>Past/in-flight transfers where this user is the source.</summary>
    public async Task<(List<GoogleTransferInfo>? Transfers, string? Error)> GetTransfersAsync(
        string oldOwnerUserId, CancellationToken cancellationToken = default)
    {
        var url = $"https://admin.googleapis.com/admin/datatransfer/v1/transfers?oldOwnerUserId={Uri.EscapeDataString(oldOwnerUserId)}";
        var (doc, error) = await GetJsonWithScopeAsync(url, DataTransferScope, $"transfers for {oldOwnerUserId}", cancellationToken);
        if (doc == null)
            return (null, error);

        var transfers = new List<GoogleTransferInfo>();
        using (doc)
        {
            if (doc.RootElement.TryGetProperty("dataTransfers", out var items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    var info = new GoogleTransferInfo
                    {
                        Id = ReadString(item, "id"),
                        RequestTime = item.TryGetProperty("requestTime", out var rt) ? rt.GetString() : null,
                        Status = ReadString(item, "overallTransferStatusCode"),
                        NewOwnerUserId = ReadString(item, "newOwnerUserId")
                    };
                    if (item.TryGetProperty("applicationDataTransfers", out var adt) && adt.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var app in adt.EnumerateArray())
                            info.Apps.Add($"{ReadLong(app, "applicationId")}: {ReadString(app, "applicationTransferStatus")}");
                    }
                    transfers.Add(info);
                }
            }
        }

        return (transfers, null);
    }

    /// <summary>
    /// Per-user storage usage from the Reports usage API. Usage reports lag ~2 days,
    /// so we walk back from 2 to 6 days until Google has data.
    /// </summary>
    public async Task<(List<GoogleUserStorage>? Usage, string? ReportDate, string? Error)> GetStorageUsageAsync(
        bool includeHidden = false,
        CancellationToken cancellationToken = default)
    {
        string? firstError = null;
        for (var daysBack = 2; daysBack <= 6; daysBack++)
        {
            var date = DateTime.UtcNow.AddDays(-daysBack).ToString("yyyy-MM-dd");
            var (usage, error) = await FetchUsageForDateAsync(date, includeHidden, cancellationToken);
            if (usage != null && usage.Count > 0)
                return (usage, date, null);

            if (error != null)
            {
                if (error.Contains("authorization failed", StringComparison.OrdinalIgnoreCase))
                    return (null, null, error);
                firstError ??= error;
            }
        }

        return firstError != null
            ? (null, null, firstError)
            : (new List<GoogleUserStorage>(), null, null);
    }

    private async Task<(List<GoogleUserStorage>? Usage, string? Error)> FetchUsageForDateAsync(
        string date, bool includeHidden, CancellationToken cancellationToken)
    {
        await EnsureDynamicHiddenLoadedAsync(cancellationToken);

        const string parameters = "accounts:used_quota_in_mb,accounts:drive_used_quota_in_mb," +
                                  "accounts:gmail_used_quota_in_mb,accounts:gplus_photos_used_quota_in_mb," +
                                  "accounts:used_quota_in_percentage";

        var usage = new List<GoogleUserStorage>();
        string? pageToken = null;
        do
        {
            var url = $"https://admin.googleapis.com/admin/reports/v1/usage/users/all/dates/{date}" +
                      $"?parameters={Uri.EscapeDataString(parameters)}&maxResults=500" +
                      (pageToken != null ? $"&pageToken={Uri.EscapeDataString(pageToken)}" : "");
            var (doc, error) = await GetJsonWithScopeAsync(url, UsageReportScope, $"usage report {date}", cancellationToken);
            if (doc == null)
                return (null, error);

            using (doc)
            {
                if (doc.RootElement.TryGetProperty("usageReports", out var reports))
                {
                    foreach (var report in reports.EnumerateArray())
                    {
                        var email = report.TryGetProperty("entity", out var entity) ? ReadString(entity, "userEmail") : "";
                        if (string.IsNullOrEmpty(email) || (!includeHidden && IsHiddenUser(email)))
                            continue;

                        var row = new GoogleUserStorage { Email = email };
                        if (report.TryGetProperty("parameters", out var pars) && pars.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var p in pars.EnumerateArray())
                            {
                                var name = ReadString(p, "name");
                                switch (name)
                                {
                                    case "accounts:used_quota_in_mb": row.UsedMb = ReadLong(p, "intValue"); break;
                                    case "accounts:drive_used_quota_in_mb": row.DriveMb = ReadLong(p, "intValue"); break;
                                    case "accounts:gmail_used_quota_in_mb": row.GmailMb = ReadLong(p, "intValue"); break;
                                    case "accounts:gplus_photos_used_quota_in_mb": row.PhotosMb = ReadLong(p, "intValue"); break;
                                    case "accounts:used_quota_in_percentage":
                                        if (p.TryGetProperty("intValue", out var iv) &&
                                            double.TryParse(iv.ValueKind == JsonValueKind.String ? iv.GetString() : iv.GetRawText(), out var pct))
                                            row.UsedPercent = pct;
                                        break;
                                }
                            }
                        }
                        usage.Add(row);
                    }
                }

                pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
            }
        } while (!string.IsNullOrEmpty(pageToken));

        return (usage, null);
    }

    private Task<(JsonDocument? Doc, string? Error)> GetTransferApplicationsRawAsync(CancellationToken cancellationToken) =>
        GetJsonWithScopeAsync(
            "https://admin.googleapis.com/admin/datatransfer/v1/applications?customerId=my_customer",
            DataTransferScope, "transfer applications", cancellationToken);

    private async Task<(JsonDocument? Doc, string? Error)> GetJsonWithScopeAsync(
        string url, string scope, string context, CancellationToken cancellationToken)
    {
        var (token, tokenError) = await AcquireTokenAsync(scope, cancellationToken);
        if (token == null)
            return (null, tokenError);

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await GetJsonAsync(client, url, context, cancellationToken);
    }

    private static string ReadString(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";

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

    /// <summary>Token impersonating a specific user (Drive backups etc), not the admin.</summary>
    public async Task<(string? Token, string? Error)> AcquireUserTokenAsync(
        string userEmail, string scope, CancellationToken cancellationToken = default)
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

        try
        {
            return (await GetServiceAccountTokenAsync(saKeyJson, userEmail, scope, cancellationToken), null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Google token exchange failed for {User} scope {Scope}", userEmail, scope);
            return (null, $"Google authorization failed for scope {scope} impersonating {userEmail}. {ex.Message}");
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
