using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/service-sync")]
public class ServiceSyncController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly string _syncKey;

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
}
