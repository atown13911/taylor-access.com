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

    private static readonly Dictionary<string, string[]> AppPermissionMap = new()
    {
        ["Taylor Access"] = new[] { "users", "roles", "organizations", "orders", "shipments", "loads", "drivers", "vehicles", "fleet", "contacts", "places", "invoices", "payables", "finance", "maintenance", "telematics", "reports", "settings", "audit", "system" },
        ["Van-Tac TMS"] = new[] { "orders", "shipments", "loads", "drivers", "vehicles", "fleet", "contacts", "places", "invoices", "payables", "finance", "maintenance", "telematics", "reports", "settings", "organizations" },
        ["TSS Portal"] = new[] { "users", "roles", "apps", "audit", "analytics", "system" },
        ["Taylor CRM"] = new[] { "contacts", "orders", "reports", "settings" },
        ["Taylor Academy"] = new[] { "users", "reports", "settings" },
        ["TSS Accounting"] = new[] { "invoices", "payables", "finance", "reports", "settings" },
        ["Taylor Assets"] = new[] { "fleet", "vehicles", "maintenance", "reports", "settings" },
        ["Landstar"] = new[] { "shipments", "loads", "reports", "settings" },
        ["TSS Stream"] = new[] { "reports", "settings", "analytics" },
        ["CommLink"] = new[] { "users", "contacts", "settings" },
        ["TaylorCommLink"] = new[] { "users", "contacts", "settings" },
        ["Taylor Legal"] = new[] { "contracts", "reports", "settings" },
        ["Taylor Echo"] = new[] { "audit", "analytics", "reports", "settings" },
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

        var allPerms = typeof(Permissions)
            .GetFields()
            .Where(f => f.FieldType == typeof(string) && f.Name != "Descriptions")
            .Select(f => f.GetValue(null)?.ToString() ?? "")
            .Where(v => !string.IsNullOrEmpty(v))
            .GroupBy(p => p.Split(':')[0])
            .ToDictionary(
                g => g.Key,
                g => new
                {
                    label = char.ToUpper(g.Key[0]) + g.Key[1..],
                    permissions = g.ToList()
                }
            );

        var apps = await _context.OAuthClients
            .Where(c => c.Status == "active")
            .Select(c => new { c.ClientId, c.Name })
            .ToListAsync();

        var defaultCategories = new[] { "users", "reports", "settings" };

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
            permissionCategories = allPerms,
            appPermissionMap = appMap
        });
    }
}
