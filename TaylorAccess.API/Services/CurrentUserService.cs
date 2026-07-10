using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public class CurrentUserService
{
    private static readonly HashSet<string> InactiveStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "inactive", "archived", "deleted", "disabled", "suspended", "terminated", "locked"
    };

    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly TaylorAccessDbContext _context;
    private readonly IConfiguration _configuration;
    private User? _cachedUser;
    private bool _userLoaded;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor, TaylorAccessDbContext context, IConfiguration configuration)
    {
        _httpContextAccessor = httpContextAccessor;
        _context = context;
        _configuration = configuration;
    }

    public int? UserId
    {
        get
        {
            var userIdClaim =
                GetClaimValue(ClaimTypes.NameIdentifier, "sub", "userId", "userid", "user_id", "id");
            return int.TryParse(userIdClaim, out var userId) ? userId : null;
        }
    }

    public string? Email =>
        GetClaimValue(ClaimTypes.Email, "email", "preferred_username", "upn", "unique_name");

    public string? Name =>
        GetClaimValue(ClaimTypes.Name, "name", "given_name", "preferred_username")
        ?? _httpContextAccessor.HttpContext?.User.Identity?.Name;

    public string? Role => ResolveEffectiveRole();

    private static readonly HashSet<string> AdminRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "product_owner", "superadmin", "admin", "development"
    };

    private string? ResolveEffectiveRole()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        if (user == null) return null;

        var roles = user.FindAll("role")
            .Concat(user.FindAll(ClaimTypes.Role))
            .Select(c => c.Value?.Trim().ToLowerInvariant())
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var appRole = user.FindFirst("app_role")?.Value?.Trim().ToLowerInvariant();

        foreach (var role in roles)
        {
            if (AdminRoles.Contains(role))
                return role;
        }

        if (!string.IsNullOrEmpty(appRole))
            return appRole;

        return roles.FirstOrDefault() ?? GetClaimValue(ClaimTypes.Role, "roles")?.Trim().ToLowerInvariant();
    }

    public static bool IsPortalAdminRole(string? role)
    {
        var normalized = (role ?? string.Empty).Trim().ToLowerInvariant();
        return normalized is "product_owner" or "superadmin" or "super_admin" or "development"
            or "admin" or "administrator";
    }

    public bool CanBypassOrgFilter => IsPortalAdminRole(Role);

    public bool IsAuthenticated => 
        _httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated ?? false;

    public async Task<bool> IsPortalAccessAllowedAsync()
    {
        if (!IsAuthenticated) return false;

        var claimStatus = _httpContextAccessor.HttpContext?.User.FindFirst("status")?.Value;
        if (IsInactiveStatus(claimStatus)) return false;

        var lookup = await TryGetPortalUserStatusAsync();
        if (lookup.lookedUp && lookup.found)
            return !IsInactiveStatus(lookup.status);

        var user = await GetUserAsync();
        return user != null && !IsInactiveStatus(user.Status);
    }

    public async Task<User?> GetUserAsync()
    {
        if (_userLoaded) return _cachedUser;

        // Email is authoritative — same across Portal and Taylor Access JWTs
        var email = Email;
        if (!string.IsNullOrEmpty(email))
        {
            var claimUserId = UserId;
            var claimRole = (Role ?? string.Empty).Trim().ToLowerInvariant();

            _cachedUser = await _context.Users
                .AsNoTracking()
                .Where(u => u.Email.ToLower() == email.ToLower())
                .OrderByDescending(u => claimUserId.HasValue && u.Id == claimUserId.Value)
                .ThenByDescending(u => !string.IsNullOrWhiteSpace(claimRole) && u.Role.ToLower() == claimRole)
                .ThenByDescending(u => u.Status.ToLower() == "active")
                .ThenByDescending(u => u.OrganizationId.HasValue)
                .ThenByDescending(u => u.UpdatedAt)
                .FirstOrDefaultAsync();
        }

        // Fall back to numeric ID only if no email claim (native TA JWTs without email)
        if (_cachedUser == null)
        {
            var userId = UserId;
            if (userId.HasValue)
            {
                _cachedUser = await _context.Users
                    .AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Id == userId.Value);
            }
        }

        // Fallback for authenticated users that are not yet synced into local Users table.
        // This keeps read paths and org-filtered queries functional based on JWT claims.
        if (_cachedUser == null && IsAuthenticated)
        {
            var role = Role?.Trim();
            var orgIdsFromClaims = GetOrganizationIdsFromClaims();
            int? orgId = orgIdsFromClaims.FirstOrDefault();
            if (orgId <= 0) orgId = null;
            var userId = UserId;
            var claimEmail = Email;
            var claimName = Name;

            _cachedUser = new User
            {
                Id = userId ?? 0,
                Email = string.IsNullOrWhiteSpace(claimEmail) ? $"claim-user-{Guid.NewGuid():N}@local" : claimEmail.Trim(),
                Name = string.IsNullOrWhiteSpace(claimName) ? "Authenticated User" : claimName.Trim(),
                Role = string.IsNullOrWhiteSpace(role) ? "user" : role.ToLowerInvariant(),
                Status = "active",
                OrganizationId = orgId
            };
        }

        if (_cachedUser != null)
        {
            var effectiveRole = Role?.Trim().ToLowerInvariant();
            if (!string.IsNullOrWhiteSpace(effectiveRole))
                _cachedUser.Role = effectiveRole;

            if (!_cachedUser.OrganizationId.HasValue || _cachedUser.OrganizationId.Value <= 0)
            {
                var claimOrgIds = GetOrganizationIdsFromClaims();
                var claimOrgId = claimOrgIds.FirstOrDefault(id => id > 0);
                if (claimOrgId > 0)
                    _cachedUser.OrganizationId = claimOrgId;
            }
        }

        _userLoaded = true;
        return _cachedUser;
    }

    public async Task<bool> IsAdminAsync()
    {
        var user = await GetUserAsync();
        return user?.IsAdmin() ?? false;
    }

    public async Task<bool> HasRoleOrHigherAsync(string requiredRole)
    {
        var user = await GetUserAsync();
        return user?.HasRoleOrHigher(requiredRole) ?? false;
    }

    public string DisplayName => Name ?? Email ?? "System";

    public bool IsProductOwner => Role == "product_owner";

    public bool CanSeeAllOrganizations => CanBypassOrgFilter;

    public async Task<bool> ShouldBypassOrgFilterAsync()
    {
        if (CanBypassOrgFilter) return true;

        var user = await GetUserAsync();
        return user != null && IsPortalAdminRole(user.Role);
    }

    public async Task<HashSet<int>> GetAllowedOrganizationIdsAsync()
    {
        var allowed = new HashSet<int>();

        foreach (var id in GetOrganizationIdsFromClaims())
        {
            if (id > 0) allowed.Add(id);
        }

        foreach (var id in await GetUserOrganizationIdsAsync())
        {
            if (id > 0) allowed.Add(id);
        }

        var user = await GetUserAsync();
        if (user?.OrganizationId is > 0)
            allowed.Add(user.OrganizationId.Value);

        return allowed;
    }

    public async Task<(int? orgId, User? user, string? error)> ResolveOrgFilterAsync()
    {
        var user = await GetUserAsync();
        if (user == null) return (null, null, "Not authenticated");

        if (user.Role == "product_owner" || user.Role == "superadmin" || user.Role == "super_admin" || user.Role == "development" || IsPortalAdminRole(user.Role))
            return (null, user, null);

        if (user.OrganizationId == null)
            return (null, user, "User must belong to an organization");

        return (user.OrganizationId.Value, user, null);
    }

    public async Task<List<int>> GetUserOrganizationIdsAsync()
    {
        var orgIds = new HashSet<int>();

        // 0) Organization ids from JWT claims (supports multi-org tokens).
        foreach (var id in GetOrganizationIdsFromClaims())
        {
            if (id > 0) orgIds.Add(id);
        }

        // 1) Token userId claim (works when token subject matches Taylor Access user id).
        var claimUserId = UserId;
        if (claimUserId.HasValue && claimUserId.Value > 0)
        {
            var fromClaim = await _context.UserOrganizations
                .Where(uo => uo.UserId == claimUserId.Value)
                .Select(uo => uo.OrganizationId)
                .ToListAsync();
            foreach (var id in fromClaim)
                if (id > 0) orgIds.Add(id);
        }

        // 2) Local Taylor Access user resolved by email/id (handles Portal-vs-local id mismatches).
        var localUser = await GetUserAsync();
        if (localUser != null)
        {
            if (localUser.OrganizationId.HasValue && localUser.OrganizationId.Value > 0)
                orgIds.Add(localUser.OrganizationId.Value);

            if (localUser.Id > 0)
            {
                var fromLocalUser = await _context.UserOrganizations
                    .Where(uo => uo.UserId == localUser.Id)
                    .Select(uo => uo.OrganizationId)
                    .ToListAsync();
                foreach (var id in fromLocalUser)
                    if (id > 0) orgIds.Add(id);
            }
        }

        // 3) Defensive fallback: if duplicate/local-migrated user rows exist, gather org memberships
        // across any Users that share this authenticated email.
        var email = (Email ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(email))
        {
            var emailUsers = await _context.Users
                .AsNoTracking()
                .Where(u => u.Email.ToLower() == email.ToLower())
                .ToListAsync();

            if (emailUsers.Count > 0)
            {
                foreach (var emailUser in emailUsers)
                {
                    if (emailUser.OrganizationId.HasValue && emailUser.OrganizationId.Value > 0)
                        orgIds.Add(emailUser.OrganizationId.Value);
                }

                var emailUserIds = emailUsers.Select(u => u.Id).ToList();
                var fromEmailUsers = await _context.UserOrganizations
                    .Where(uo => emailUserIds.Contains(uo.UserId))
                    .Select(uo => uo.OrganizationId)
                    .ToListAsync();
                foreach (var id in fromEmailUsers)
                    if (id > 0) orgIds.Add(id);
            }
        }

        return orgIds.ToList();
    }

    private string? GetClaimValue(params string[] claimTypes)
    {
        var user = _httpContextAccessor.HttpContext?.User;
        if (user == null || claimTypes == null || claimTypes.Length == 0) return null;

        foreach (var claimType in claimTypes)
        {
            if (string.IsNullOrWhiteSpace(claimType)) continue;
            var value = user.FindFirst(claimType)?.Value;
            if (!string.IsNullOrWhiteSpace(value)) return value;
        }

        return null;
    }

    private List<int> GetOrganizationIdsFromClaims()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        if (user == null) return new List<int>();

        var claimKeys = new[]
        {
            "orgId",
            "organizationId",
            "org_id",
            "orgIds",
            "organizationIds",
            "organizations"
        };

        var values = user.Claims
            .Where(c => claimKeys.Contains(c.Type, StringComparer.OrdinalIgnoreCase))
            .Select(c => c.Value)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .ToList();

        var ids = new HashSet<int>();
        foreach (var raw in values)
        {
            foreach (Match match in Regex.Matches(raw, @"\d+"))
            {
                if (int.TryParse(match.Value, out var id) && id > 0)
                {
                    ids.Add(id);
                }
            }
        }

        return ids.ToList();
    }

    private async Task<(bool lookedUp, bool found, string? status)> TryGetPortalUserStatusAsync()
    {
        var conn = ResolvePortalDbConnectionString();
        if (string.IsNullOrWhiteSpace(conn))
            return (false, false, null);

        var email = (Email ?? string.Empty).Trim();
        var userId = UserId;
        if (string.IsNullOrWhiteSpace(email) && !userId.HasValue)
            return (true, false, null);

        try
        {
            await using var db = new NpgsqlConnection(conn);
            await db.OpenAsync();

            await using var cmd = db.CreateCommand();
            cmd.CommandText = @"
                select ""Status""
                from ""Users""
                where (@email <> '' and lower(""Email"") = lower(@email))
                   or (@userId > 0 and ""Id"" = @userId)
                order by case when @email <> '' and lower(""Email"") = lower(@email) then 0 else 1 end
                limit 1;";
            cmd.Parameters.AddWithValue("email", email);
            cmd.Parameters.AddWithValue("userId", userId ?? 0);

            var value = await cmd.ExecuteScalarAsync();
            if (value == null || value == DBNull.Value)
                return (false, false, null);

            return (true, true, value.ToString());
        }
        catch
        {
            // Fail open to local user checks to avoid locking active users out during transient portal DB issues.
            return (false, false, null);
        }
    }

    private string? ResolvePortalDbConnectionString()
    {
        var raw = _configuration.GetConnectionString("PortalDbConnection")
            ?? Environment.GetEnvironmentVariable("PORTAL_DB_CONNECTION")
            ?? Environment.GetEnvironmentVariable("PORTAL_DATABASE_URL");
        if (string.IsNullOrWhiteSpace(raw)) return null;

        if (raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
            raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(raw);
            var userInfo = uri.UserInfo.Split(':');
            if (userInfo.Length >= 2)
            {
                return $"Host={uri.Host};Port={uri.Port};Database={uri.AbsolutePath.TrimStart('/')};Username={userInfo[0]};Password={userInfo[1]};SSL Mode=Disable;Trust Server Certificate=true";
            }
        }

        return raw;
    }

    private static bool IsInactiveStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return false;
        return InactiveStatuses.Contains(status.Trim());
    }
}
