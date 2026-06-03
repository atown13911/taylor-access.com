using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Text.Json;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class RolesController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly IRoleService _roleService;
    private readonly IAuditService _auditService;
    private readonly IConfiguration _configuration;

    public RolesController(TaylorAccessDbContext context, IRoleService roleService, IAuditService auditService, IConfiguration configuration)
    {
        _context = context;
        _roleService = roleService;
        _auditService = auditService;
        _configuration = configuration;
    }

    /// <summary>
    /// Get all roles
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetRoles()
    {
        var roles = await _roleService.GetAllRolesAsync();
        
        // Ensure product_owner and superadmin always have ALL permissions (dynamically)
        var allPermissions = typeof(Permissions)
            .GetFields()
            .Where(f => f.FieldType == typeof(string) && f.Name != "Descriptions")
            .Select(f => f.GetValue(null)?.ToString())
            .Where(v => v != null)
            .ToList();
        var allPermissionsJson = JsonSerializer.Serialize(allPermissions);

        // Ensure superadmin exists
        var superadminExists = roles.Any(r => r.Name == "superadmin");
        if (!superadminExists)
        {
            var superadminRole = new Role
            {
                Name = "superadmin",
                Description = "Super Administrator - Full unrestricted access but cannot modify Product Owner",
                Permissions = allPermissionsJson,
                IsSystem = true,
                CreatedAt = DateTime.UtcNow
            };
            _context.Roles.Add(superadminRole);
            await _context.SaveChangesAsync();
            roles = await _roleService.GetAllRolesAsync(); // Reload
        }

        var result = roles.Select(r => 
        {
            if (r.Name == "product_owner" || r.Name == "superadmin")
            {
                r.Permissions = allPermissionsJson;
            }
            return r;
        }).OrderBy(r => 
            r.Name == "product_owner" ? 0 :
            r.Name == "superadmin" ? 1 :
            r.IsSystem ? 2 : 3
        ).ThenBy(r => r.Name).ToList();

        return Ok(new { data = result });
    }

    /// <summary>
    /// Get role by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<Role>> GetRole(int id)
    {
        var role = await _roleService.GetRoleByIdAsync(id);
        if (role == null)
            return NotFound(new { message = "Role not found" });

        return Ok(new { role });
    }

    /// <summary>
    /// Create a new role
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult<Role>> CreateRole([FromBody] CreateRoleRequest request)
    {
        var existingRole = await _roleService.GetRoleByNameAsync(request.Name);
        if (existingRole != null)
            return BadRequest(new { message = "Role with this name already exists" });

        var role = new Role
        {
            Name = request.Name.ToLower(),
            Description = request.Description,
            Permissions = JsonSerializer.Serialize(request.Permissions ?? new List<string>()),
            IsSystem = false
        };

        _context.Roles.Add(role);
        await _context.SaveChangesAsync();

        await _auditService.LogAsync(AuditActions.Create, "Role", role.Id, $"Created role: {role.Name}");

        return CreatedAtAction(nameof(GetRole), new { id = role.Id }, new { role });
    }

    /// <summary>
    /// Update a role
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult<Role>> UpdateRole(int id, [FromBody] UpdateRoleRequest request)
    {
        var role = await _context.Roles.FindAsync(id);
        if (role == null)
            return NotFound(new { message = "Role not found" });

        // Product Owner role is always fully protected
        if (role.Name == "product_owner")
            return BadRequest(new { message = "Product Owner role cannot be modified" });

        var currentUserRole = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.Role)?.Value
            ?? User.Claims.FirstOrDefault(c => c.Type == "role")?.Value;

        // Superadmin role can only be modified by product_owner
        if (role.Name == "superadmin" && currentUserRole != "product_owner")
            return BadRequest(new { message = "Only the Product Owner can modify the Superadmin role" });

        // Non-product_owner, non-superadmin users cannot modify any system roles
        if (role.IsSystem && currentUserRole != "product_owner" && currentUserRole != "superadmin")
            return BadRequest(new { message = "Only Product Owner or Superadmin can modify system roles" });

        role.Description = request.Description ?? role.Description;
        if (request.Permissions != null)
            role.Permissions = JsonSerializer.Serialize(request.Permissions);

        await _context.SaveChangesAsync();

        await _auditService.LogAsync(AuditActions.Update, "Role", role.Id, $"Updated role: {role.Name}");

        return Ok(new { role });
    }

    /// <summary>
    /// Delete a role
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult> DeleteRole(int id)
    {
        var role = await _context.Roles.FindAsync(id);
        if (role == null)
            return NotFound(new { message = "Role not found" });

        // Protect system roles (product_owner and superadmin)
        if (role.IsSystem || role.Name == "product_owner" || role.Name == "superadmin")
            return BadRequest(new { message = "System roles (Product Owner, Superadmin) cannot be deleted" });

        // Remove all user assignments first
        var userRoles = await _context.UserRoles.Where(ur => ur.RoleId == id).ToListAsync();
        _context.UserRoles.RemoveRange(userRoles);

        _context.Roles.Remove(role);
        await _context.SaveChangesAsync();

        await _auditService.LogAsync(AuditActions.Delete, "Role", id, $"Deleted role: {role.Name}");

        return Ok(new { success = true, message = "Role deleted" });
    }

    /// <summary>
    /// Get available permissions with descriptions
    /// </summary>
    [HttpGet("permissions")]
    public ActionResult<object> GetPermissions()
    {
        var permissions = typeof(Permissions)
            .GetFields()
            .Where(f => f.FieldType == typeof(string) && f.Name != "Descriptions")
            .Select(f => {
                var value = f.GetValue(null)?.ToString() ?? "";
                Permissions.Descriptions.TryGetValue(value, out var description);
                return new
                {
                    key = f.Name,
                    value = value,
                    category = value.Split(':').FirstOrDefault(),
                    description = description ?? ""
                };
            })
            .GroupBy(p => p.category)
            .ToDictionary(g => g.Key ?? "other", g => g.Select(p => new { p.key, p.value, p.description }).ToList());

        return Ok(new { permissions });
    }

    /// <summary>
    /// Get all roles with user counts
    /// </summary>
    [HttpGet("with-counts")]
    public async Task<ActionResult<object>> GetRolesWithCounts()
    {
        // Get all available permissions for product_owner and superadmin
        var allPermissions = typeof(Permissions)
            .GetFields()
            .Where(f => f.FieldType == typeof(string) && f.Name != "Descriptions")
            .Select(f => f.GetValue(null)?.ToString())
            .Where(v => v != null)
            .ToList();
        var allPermissionsJson = JsonSerializer.Serialize(allPermissions);

        var roles = await _context.Roles
            .Select(r => new
            {
                r.Id,
                r.Name,
                r.Description,
                r.Permissions,
                r.IsSystem,
                r.CreatedAt,
                UserCount = _context.Users.Count(u => u.Role.ToLower() == r.Name.ToLower())
            })
            .ToListAsync();

        // Ensure superadmin role exists as system role
        var superadminExists = roles.Any(r => r.Name == "superadmin");
        if (!superadminExists)
        {
            var superadminRole = new Role
            {
                Name = "superadmin",
                Description = "Super Administrator - Full unrestricted access but cannot modify Product Owner",
                Permissions = allPermissionsJson,
                IsSystem = true,
                CreatedAt = DateTime.UtcNow
            };
            _context.Roles.Add(superadminRole);
            await _context.SaveChangesAsync();
            
            // Add to roles list
            roles.Add(new
            {
                superadminRole.Id,
                superadminRole.Name,
                Description = superadminRole.Description ?? "",
                superadminRole.Permissions,
                superadminRole.IsSystem,
                superadminRole.CreatedAt,
                UserCount = 0
            });
        }

        // Sort: product_owner first, then superadmin, then others
        var sortedRoles = roles.OrderBy(r => 
            r.Name == "product_owner" ? 0 :
            r.Name == "superadmin" ? 1 :
            r.IsSystem ? 2 : 3
        ).ThenBy(r => r.Name).ToList();

        // Ensure product_owner and superadmin have ALL standard permissions + preserve nav: permissions
        var result = sortedRoles.Select(r => new
        {
            r.Id,
            r.Name,
            r.Description,
            Permissions = (r.Name == "product_owner" || r.Name == "superadmin") 
                ? MergePermissionsWithNav(allPermissions, r.Permissions) 
                : r.Permissions,
            r.IsSystem,
            r.CreatedAt,
            r.UserCount,
            Type = r.Name == "product_owner" ? "OWNER" : r.IsSystem ? "SYSTEM" : "CUSTOM"
        }).ToList();

        return Ok(new { data = result });
    }

    /// <summary>
    /// Get roles for a user
    /// </summary>
    [HttpGet("user/{userId}")]
    public async Task<ActionResult<object>> GetUserRoles(int userId)
    {
        var roles = await _roleService.GetUserRolesAsync(userId);
        var permissions = await _roleService.GetUserPermissionsAsync(userId);

        return Ok(new { roles, permissions });
    }

    /// <summary>
    /// Get users assigned to a specific role id (direct UserRoles source).
    /// </summary>
    [HttpGet("{roleId}/users")]
    public async Task<ActionResult<object>> GetUsersByRoleId(int roleId)
    {
        // Prefer explicit portal_db role source when configured
        var portalUsers = await TryGetUsersByRoleIdFromPortalDb(roleId);
        if (portalUsers.Count > 0)
            return Ok(new { data = portalUsers, source = "portal_db" });

        var users = await _context.UserRoles
            .AsNoTracking()
            .Where(ur => ur.RoleId == roleId)
            .Join(
                _context.Users.AsNoTracking(),
                ur => ur.UserId,
                u => u.Id,
                (ur, u) => new
                {
                    ur,
                    u
                }
            )
            .GroupJoin(
                _context.Positions.AsNoTracking(),
                row => row.u.PositionId,
                p => (int?)p.Id,
                (row, positions) => new
                {
                    row.ur,
                    row.u,
                    Position = positions.Select(p => p.Title).FirstOrDefault()
                }
            )
            .Select(row => new
            {
                row.u.Id,
                row.u.Name,
                row.u.Email,
                row.u.Phone,
                row.u.WorkPhone,
                row.u.CellPhone,
                row.u.JobTitle,
                row.Position,
                row.u.Status,
                row.ur.RoleId,
                row.ur.AssignedAt
            })
            .OrderBy(u => u.Name)
            .ToListAsync();

        return Ok(new { data = users, source = "default_db" });
    }

    private async Task<List<object>> TryGetUsersByRoleIdFromPortalDb(int roleId)
    {
        var conn = ResolvePortalDbConnectionString();
        if (string.IsNullOrWhiteSpace(conn)) return new List<object>();

        try
        {
            await using var db = new NpgsqlConnection(conn);
            await db.OpenAsync();

            var userColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var userColumnLookup = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            await using (var colsCmd = db.CreateCommand())
            {
                colsCmd.CommandText = @"
                    select column_name
                    from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'Users';";

                await using var colsReader = await colsCmd.ExecuteReaderAsync();
                while (await colsReader.ReadAsync())
                {
                    var col = colsReader["column_name"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(col))
                    {
                        userColumns.Add(col);
                        if (!userColumnLookup.ContainsKey(col))
                            userColumnLookup[col] = col;
                    }
                }
            }

            string FirstExisting(params string[] candidates)
            {
                foreach (var candidate in candidates)
                {
                    if (userColumnLookup.TryGetValue(candidate, out var actual))
                        return actual;
                }
                return string.Empty;
            }

            var phoneColumns = new[] { "Phone", "WorkPhone", "CellPhone", "Cellphone", "phone", "work_phone", "cell_phone", "phone_number" }
                .Select(candidate => FirstExisting(candidate))
                .Where(c => !string.IsNullOrWhiteSpace(c))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(c => $@"u.""{c}""")
                .ToList();
            var phoneExpr = phoneColumns.Count > 0
                ? $"coalesce({string.Join(", ", phoneColumns)})"
                : "null";

            var titleColumn = FirstExisting("JobTitle", "Title", "Position", "job_title");
            var statusColumn = FirstExisting("Status", "status");
            var titleExpr = string.IsNullOrWhiteSpace(titleColumn) ? "null" : $@"u.""{titleColumn}""";
            var statusExpr = string.IsNullOrWhiteSpace(statusColumn) ? "'active'" : $@"u.""{statusColumn}""";

            await using var cmd = db.CreateCommand();
            cmd.CommandText = $@"
                select
                    u.""Id"",
                    u.""Name"",
                    u.""Email"",
                    {phoneExpr} as ""Phone"",
                    {titleExpr} as ""JobTitle"",
                    {titleExpr} as ""Position"",
                    {statusExpr} as ""Status"",
                    ur.""RoleId"",
                    ur.""AssignedAt""
                from ""UserRoles"" ur
                join ""Users"" u on u.""Id"" = ur.""UserId""
                where ur.""RoleId"" = @roleId
                order by u.""Name"";";
            cmd.Parameters.AddWithValue("@roleId", roleId);

            var results = new List<object>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(new
                {
                    Id = reader.GetInt32(reader.GetOrdinal("Id")),
                    Name = reader["Name"]?.ToString() ?? "",
                    Email = reader["Email"]?.ToString() ?? "",
                    Phone = reader["Phone"]?.ToString() ?? "",
                    JobTitle = reader["JobTitle"]?.ToString() ?? "",
                    Position = reader["Position"]?.ToString() ?? "",
                    Status = reader["Status"]?.ToString() ?? "active",
                    RoleId = reader.GetInt32(reader.GetOrdinal("RoleId")),
                    AssignedAt = reader["AssignedAt"] is DBNull ? (DateTime?)null : reader.GetDateTime(reader.GetOrdinal("AssignedAt"))
                });
            }

            return results;
        }
        catch
        {
            // Graceful fallback to default DB query when portal schema doesn't match expectations.
            return new List<object>();
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

    /// <summary>
    /// Assign role to user
    /// </summary>
    [HttpPost("assign")]
    public async Task<ActionResult> AssignRole([FromBody] AssignRoleRequest request)
    {
        var user = await _context.Users.FindAsync(request.UserId);
        if (user == null)
            return NotFound(new { message = "User not found" });

        var role = await _context.Roles.FindAsync(request.RoleId);
        if (role == null)
            return NotFound(new { message = "Role not found" });

        var assignedBy = User.FindFirst("email")?.Value;
        await _roleService.AssignRoleAsync(request.UserId, request.RoleId, assignedBy);

        await _auditService.LogAsync(AuditActions.RoleAssign, "UserRole", null, 
            $"Assigned role '{role.Name}' to user '{user.Email}'");

        return Ok(new { message = $"Role '{role.Name}' assigned to user" });
    }

    /// <summary>
    /// Remove role from user
    /// </summary>
    [HttpPost("remove")]
    public async Task<ActionResult> RemoveRole([FromBody] AssignRoleRequest request)
    {
        var user = await _context.Users.FindAsync(request.UserId);
        var role = await _context.Roles.FindAsync(request.RoleId);

        var removed = await _roleService.RemoveRoleAsync(request.UserId, request.RoleId);
        if (!removed)
            return NotFound(new { message = "User does not have this role" });

        await _auditService.LogAsync(AuditActions.RoleRemove, "UserRole", null, 
            $"Removed role '{role?.Name}' from user '{user?.Email}'");

        return Ok(new { message = "Role removed from user" });
    }

    /// <summary>
    /// Merge standard permissions with any nav: permissions stored in the role's DB record
    /// </summary>
    private static string MergePermissionsWithNav(List<string?> standardPerms, string storedPermissionsJson)
    {
        var merged = new HashSet<string>(standardPerms.Where(p => p != null).Select(p => p!));
        try
        {
            var stored = JsonSerializer.Deserialize<List<string>>(storedPermissionsJson) ?? new();
            foreach (var p in stored.Where(p => p.StartsWith("nav:")))
            {
                merged.Add(p);
            }
        }
        catch { }
        return JsonSerializer.Serialize(merged.ToList());
    }
}

// Request DTOs
public record CreateRoleRequest(string Name, string? Description, List<string>? Permissions);
public record UpdateRoleRequest(string? Description, List<string>? Permissions);
public record AssignRoleRequest(int UserId, int RoleId);





