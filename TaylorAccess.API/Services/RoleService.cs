using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public interface IRoleService
{
    Task<List<Role>> GetAllRolesAsync();
    Task<Role?> GetRoleByIdAsync(int id);
    Task<Role?> GetRoleByNameAsync(string name);
    Task<List<string>> GetUserPermissionsAsync(int userId);
    Task<List<Role>> GetUserRolesAsync(int userId);
    Task<bool> AssignRoleAsync(int userId, int roleId, string? assignedBy = null);
    Task<bool> RemoveRoleAsync(int userId, int roleId);
    Task<bool> UserHasPermissionAsync(int userId, string permission);
    Task<bool> UserHasAnyPermissionAsync(int userId, params string[] permissions);
    Task SeedDefaultRolesAsync();
}

public class RoleService : IRoleService
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<RoleService> _logger;

    public RoleService(TaylorAccessDbContext context, ILogger<RoleService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<Role>> GetAllRolesAsync() =>
        await _context.Roles.OrderBy(r => r.Name).ToListAsync();

    public async Task<Role?> GetRoleByIdAsync(int id) =>
        await _context.Roles.FindAsync(id);

    public async Task<Role?> GetRoleByNameAsync(string name) =>
        await _context.Roles.FirstOrDefaultAsync(r => r.Name.ToLower() == name.ToLower());

    public async Task<List<string>> GetUserPermissionsAsync(int userId)
    {
        var roles = await GetUserRolesAsync(userId);
        var allPermissions = new HashSet<string>();

        foreach (var role in roles)
        {
            try
            {
                var permissions = JsonSerializer.Deserialize<List<string>>(role.Permissions) ?? new();
                foreach (var p in permissions)
                {
                    if (p == Permissions.AdminFull)
                    {
                        foreach (var field in typeof(Permissions).GetFields())
                        {
                            var val = field.GetValue(null)?.ToString();
                            if (!string.IsNullOrEmpty(val)) allPermissions.Add(val);
                        }
                    }
                    allPermissions.Add(p);
                }
            }
            catch { }
        }

        return allPermissions.ToList();
    }

    public async Task<List<Role>> GetUserRolesAsync(int userId)
    {
        var roles = await _context.UserRoles
            .Where(ur => ur.UserId == userId)
            .Include(ur => ur.Role)
            .Select(ur => ur.Role!)
            .ToListAsync();

        if (roles.Count == 0)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user != null && !string.IsNullOrEmpty(user.Role))
            {
                var role = await _context.Roles.FirstOrDefaultAsync(r => r.Name.ToLower() == user.Role.ToLower());
                if (role != null) roles.Add(role);
            }
        }

        return roles;
    }

    public async Task<bool> AssignRoleAsync(int userId, int roleId, string? assignedBy = null)
    {
        var existing = await _context.UserRoles
            .FirstOrDefaultAsync(ur => ur.UserId == userId && ur.RoleId == roleId);
        
        if (existing != null) return true;

        var userRole = new UserRole
        {
            UserId = userId,
            RoleId = roleId,
            AssignedBy = assignedBy,
            AssignedAt = DateTime.UtcNow
        };

        _context.UserRoles.Add(userRole);
        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Role {RoleId} assigned to user {UserId}", roleId, userId);
        return true;
    }

    public async Task<bool> RemoveRoleAsync(int userId, int roleId)
    {
        var userRole = await _context.UserRoles
            .FirstOrDefaultAsync(ur => ur.UserId == userId && ur.RoleId == roleId);
        
        if (userRole == null) return false;

        _context.UserRoles.Remove(userRole);
        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Role {RoleId} removed from user {UserId}", roleId, userId);
        return true;
    }

    public async Task<bool> UserHasPermissionAsync(int userId, string permission)
    {
        var permissions = await GetUserPermissionsAsync(userId);
        return permissions.Contains(permission) || permissions.Contains(Permissions.AdminFull);
    }

    public async Task<bool> UserHasAnyPermissionAsync(int userId, params string[] permissions)
    {
        var userPermissions = await GetUserPermissionsAsync(userId);
        if (userPermissions.Contains(Permissions.AdminFull)) return true;
        return permissions.Any(p => userPermissions.Contains(p));
    }

    public async Task SeedDefaultRolesAsync()
    {
        foreach (var (name, description, permissions) in DefaultRoles.All)
        {
            var existingRole = await _context.Roles.FirstOrDefaultAsync(r => r.Name == name);
            if (existingRole == null)
            {
                var role = new Role
                {
                    Name = name,
                    Description = description,
                    Permissions = JsonSerializer.Serialize(permissions),
                    IsSystem = true
                };
                _context.Roles.Add(role);
                _logger.LogInformation("Created default role: {RoleName}", name);
            }
        }
        await _context.SaveChangesAsync();
    }
}
