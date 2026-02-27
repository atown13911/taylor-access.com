using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public class CurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly TaylorAccessDbContext _context;
    private User? _cachedUser;
    private bool _userLoaded;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor, TaylorAccessDbContext context)
    {
        _httpContextAccessor = httpContextAccessor;
        _context = context;
    }

    public int? UserId
    {
        get
        {
            var userIdClaim = _httpContextAccessor.HttpContext?.User
                .FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(userIdClaim, out var userId) ? userId : null;
        }
    }

    public string? Email => _httpContextAccessor.HttpContext?.User
        .FindFirst(ClaimTypes.Email)?.Value;

    public string? Name => _httpContextAccessor.HttpContext?.User
        .FindFirst(ClaimTypes.Name)?.Value 
        ?? _httpContextAccessor.HttpContext?.User.Identity?.Name;

    public string? Role => _httpContextAccessor.HttpContext?.User
        .FindFirst(ClaimTypes.Role)?.Value;

    public bool IsAuthenticated => 
        _httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated ?? false;

    public async Task<User?> GetUserAsync()
    {
        if (_userLoaded) return _cachedUser;

        var userId = UserId;
        if (userId.HasValue)
        {
            _cachedUser = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == userId.Value);
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

    public bool CanSeeAllOrganizations => Role == "product_owner" || Role == "superadmin";

    public async Task<bool> ShouldBypassOrgFilterAsync()
    {
        if (CanSeeAllOrganizations) return true;
        
        var user = await GetUserAsync();
        return user?.Role == "product_owner" || user?.Role == "superadmin";
    }

    public async Task<(int? orgId, User? user, string? error)> ResolveOrgFilterAsync()
    {
        var user = await GetUserAsync();
        if (user == null) return (null, null, "Not authenticated");

        if (user.Role == "product_owner" || user.Role == "superadmin")
            return (null, user, null);

        if (user.OrganizationId == null)
            return (null, user, "User must belong to an organization");

        return (user.OrganizationId.Value, user, null);
    }

    public async Task<List<int>> GetUserOrganizationIdsAsync()
    {
        var userId = UserId;
        if (!userId.HasValue) return new List<int>();

        var orgIds = await _context.UserOrganizations
            .Where(uo => uo.UserId == userId.Value)
            .Select(uo => uo.OrganizationId)
            .ToListAsync();

        return orgIds;
    }
}
