using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/service-sync")]
public class ServiceSyncController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly string _syncKey;

    private static readonly Dictionary<string, object> FeatureCatalog = new()
    {
        ["dashboard"]     = new { label = "Dashboard",         permissions = new[] { "reports:view", "reports:export", "reports:create", "dashboard:view" } },
        ["users"]         = new { label = "Employee Roster",   permissions = new[] { "users:view", "users:create", "users:edit", "users:delete", "users:manage_roles", "users:invite" } },
        ["drivers"]       = new { label = "Drivers",           permissions = new[] { "drivers:view", "drivers:create", "drivers:edit", "drivers:delete", "drivers:assign" } },
        ["vehicles"]      = new { label = "Vehicles",          permissions = new[] { "vehicles:view", "vehicles:create", "vehicles:edit", "vehicles:delete", "vehicles:assign" } },
        ["fleet"]         = new { label = "Fleet & Equipment", permissions = new[] { "fleet:view", "fleet:manage", "equipment:view", "equipment:manage" } },
        ["contacts"]      = new { label = "Contacts",          permissions = new[] { "contacts:view", "contacts:create", "contacts:edit", "contacts:delete" } },
        ["places"]        = new { label = "Places",            permissions = new[] { "places:view", "places:create", "places:edit", "places:delete" } },
        ["orders"]        = new { label = "Orders",            permissions = new[] { "orders:view", "orders:create", "orders:edit", "orders:delete", "orders:dispatch" } },
        ["shipments"]     = new { label = "Shipments",         permissions = new[] { "shipments:view", "shipments:create", "shipments:edit", "shipments:delete", "shipments:dispatch", "shipments:track" } },
        ["loads"]         = new { label = "Loads",             permissions = new[] { "loads:view", "loads:create", "loads:edit", "loads:delete" } },
        ["invoices"]      = new { label = "Invoices",          permissions = new[] { "invoices:view", "invoices:create", "invoices:edit", "invoices:send", "invoices:void", "invoices:approve" } },
        ["payables"]      = new { label = "Payables",          permissions = new[] { "payables:view", "payables:create", "payables:approve", "payables:pay" } },
        ["finance"]       = new { label = "Finance",           permissions = new[] { "finance:view", "finance:manage", "rates:view", "rates:manage" } },
        ["maintenance"]   = new { label = "Maintenance",       permissions = new[] { "maintenance:view", "maintenance:create", "maintenance:edit", "maintenance:approve" } },
        ["telematics"]    = new { label = "Telematics",        permissions = new[] { "telematics:view", "telematics:manage", "devices:view", "devices:manage" } },
        ["timeclock"]     = new { label = "Time Clock",        permissions = new[] { "timeclock:view", "timeclock:manage" } },
        ["hr"]            = new { label = "HR & People",       permissions = new[] { "hr:view", "hr:manage" } },
        ["payroll"]       = new { label = "Payroll",           permissions = new[] { "payroll:view", "payroll:manage" } },
        ["compliance"]    = new { label = "Compliance",        permissions = new[] { "compliance:view", "compliance:manage", "compliance:audit" } },
        ["audit"]         = new { label = "Audit",             permissions = new[] { "audit:view", "audit:export" } },
        ["settings"]      = new { label = "Settings & Apps",   permissions = new[] { "settings:view", "settings:edit", "integrations:view", "integrations:manage" } },
        ["organizations"] = new { label = "Organizations",     permissions = new[] { "organizations:view", "organizations:manage", "organizations:switch" } },
        ["roles"]         = new { label = "Roles",             permissions = new[] { "roles:view", "roles:create", "roles:edit", "roles:delete", "roles:assign" } },
        ["apps"]          = new { label = "Apps",              permissions = new[] { "apps:view", "apps:manage", "apps:grant", "apps:revoke" } },
        ["analytics"]     = new { label = "Analytics",         permissions = new[] { "analytics:view", "analytics:export" } },
        ["system"]        = new { label = "System",            permissions = new[] { "system:manage", "system:sync", "admin:full" } },
        ["contracts"]     = new { label = "Contracts",         permissions = new[] { "contracts:view", "contracts:create", "contracts:edit", "contracts:delete", "contracts:approve" } },
    };

    private static readonly Dictionary<string, string[]> AppPermissionMap = new()
    {
        ["Taylor Access"]  = new[] { "dashboard", "users", "drivers", "fleet", "timeclock", "hr", "payroll", "compliance", "audit", "settings", "organizations" },
        ["Van-Tac TMS"]    = new[] { "dashboard", "orders", "shipments", "loads", "drivers", "vehicles", "fleet", "contacts", "places", "invoices", "payables", "finance", "maintenance", "telematics", "settings", "organizations" },
        ["TSS Portal"]     = new[] { "users", "roles", "apps", "audit", "analytics", "system" },
        ["Taylor CRM"]     = new[] { "contacts", "orders", "dashboard", "settings" },
        ["Taylor Academy"] = new[] { "users", "dashboard", "settings" },
        ["TSS Accounting"] = new[] { "invoices", "payables", "finance", "dashboard", "settings" },
        ["Taylor Assets"]  = new[] { "fleet", "vehicles", "maintenance", "dashboard", "settings" },
        ["Landstar"]       = new[] { "shipments", "loads", "dashboard", "settings" },
        ["TSS Stream"]     = new[] { "dashboard", "settings", "analytics" },
        ["CommLink"]       = new[] { "users", "contacts", "settings" },
        ["TaylorCommLink"] = new[] { "users", "contacts", "settings" },
        ["Taylor Legal"]   = new[] { "contracts", "dashboard", "settings" },
        ["Taylor Echo"]    = new[] { "audit", "analytics", "dashboard", "settings" },
    };

    public ServiceSyncController(TaylorAccessDbContext context, IConfiguration config)
    {
        _context = context;
        _syncKey = Environment.GetEnvironmentVariable("SERVICE_SYNC_KEY")
            ?? config["ServiceSync:Key"]
            ?? "tss-sync-key-2026";
    }

    private bool ValidateKey()
    {
        var key = Request.Headers["X-Sync-Key"].FirstOrDefault()
            ?? Request.Query["syncKey"].FirstOrDefault();
        return !string.IsNullOrEmpty(key) && key == _syncKey;
    }

    [HttpGet("users")]
    public async Task<ActionResult> GetAllUsers()
    {
        if (!ValidateKey()) return Unauthorized(new { error = "Invalid sync key" });

        var users = await _context.Users
            .Select(u => new
            {
                u.Id, u.Name, u.Alias, u.Email, u.Phone, u.Role, u.Status,
                u.Avatar, u.JobTitle, u.OrganizationId, u.DepartmentId,
                u.City, u.Country, u.LastLoginAt, u.CreatedAt,
                u.PasswordHash
            })
            .ToListAsync();

        return Ok(new { data = users, total = users.Count });
    }

    [HttpGet("organizations")]
    public async Task<ActionResult> GetAllOrganizations()
    {
        if (!ValidateKey()) return Unauthorized(new { error = "Invalid sync key" });

        var orgs = await _context.Organizations
            .Select(o => new { o.Id, o.Name, o.Status, o.CreatedAt })
            .ToListAsync();

        return Ok(new { data = orgs });
    }

    [HttpGet("oauth-clients")]
    public async Task<ActionResult> GetAllClients()
    {
        if (!ValidateKey()) return Unauthorized(new { error = "Invalid sync key" });

        var clients = await _context.OAuthClients
            .Where(c => c.Status == "active")
            .Select(c => new { c.ClientId, c.Name, c.Description, c.HomepageUrl, c.Status })
            .ToListAsync();

        return Ok(new { data = clients });
    }

    [HttpGet("app-permissions")]
    public async Task<ActionResult> GetAppPermissions()
    {
        if (!ValidateKey()) return Unauthorized(new { error = "Invalid sync key" });

        var apps = await _context.OAuthClients
            .Where(c => c.Status == "active")
            .Select(c => new { c.ClientId, c.Name })
            .ToListAsync();

        var defaultCategories = new[] { "users", "dashboard", "settings" };

        var appMap = apps.ToDictionary(
            a => a.ClientId,
            a => new
            {
                a.Name,
                categories = AppPermissionMap.TryGetValue(a.Name, out var cats) ? cats : defaultCategories
            }
        );

        return Ok(new
        {
            permissionCategories = FeatureCatalog,
            appPermissionMap = appMap
        });
    }
}
