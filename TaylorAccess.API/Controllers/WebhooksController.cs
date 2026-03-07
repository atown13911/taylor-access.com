using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/webhooks")]
public class WebhooksController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly WebhookService _webhookService;
    private readonly string _webhookSecret;

    public WebhooksController(TaylorAccessDbContext context, WebhookService webhookService, IConfiguration configuration)
    {
        _context = context;
        _webhookService = webhookService;
        _webhookSecret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET")
            ?? configuration["Webhooks:Secret"] ?? "";
    }

    [Authorize(Roles = "product_owner,superadmin")]
    [HttpPost("replay-all")]
    public async Task<ActionResult> ReplayAll()
    {
        var users = await _context.Users.AsNoTracking().ToListAsync();
        _webhookService.FireEmployeeBulk(users);
        return Ok(new { message = $"Replaying {users.Count} employees to all webhook URLs" });
    }

    [AllowAnonymous]
    [HttpGet("roster")]
    public async Task<ActionResult> GetRosterForSync()
    {
        if (!ValidateSecret())
            return Unauthorized(new { error = "Invalid webhook secret" });

        var users = await _context.Users
            .AsNoTracking()
            .Select(u => new
            {
                u.Id,
                u.Name,
                u.Email,
                u.Role,
                u.Status,
                u.OrganizationId,
                u.SatelliteId,
                u.AgencyId,
                u.TerminalId,
                u.Phone,
                u.JobTitle,
                u.CreatedAt
            })
            .ToListAsync();

        return Ok(new { data = users, total = users.Count });
    }

    [AllowAnonymous]
    [HttpGet("drivers")]
    public async Task<ActionResult> GetDriversForSync()
    {
        if (!ValidateSecret())
            return Unauthorized(new { error = "Invalid webhook secret" });

        var drivers = await _context.Drivers
            .AsNoTracking()
            .Select(d => new
            {
                d.Id,
                d.Name,
                d.Email,
                d.Phone,
                d.Status,
                d.DriverType,
                d.OrganizationId,
                d.SatelliteId,
                d.AgencyId,
                d.HomeTerminalId,
                d.LicenseNumber,
                d.LicenseClass,
                d.LicenseState,
                d.LicenseExpiry,
                d.MedicalCardExpiry,
                d.TruckNumber,
                d.PayRate,
                d.PayType,
                d.HireDate,
                d.CreatedAt
            })
            .ToListAsync();

        return Ok(new { data = drivers, total = drivers.Count });
    }

    private bool ValidateSecret()
    {
        if (string.IsNullOrEmpty(_webhookSecret)) return true;
        var provided = Request.Headers["X-Webhook-Secret"].FirstOrDefault();
        return provided == _webhookSecret;
    }
}
