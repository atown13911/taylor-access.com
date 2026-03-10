using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Internal service-to-service endpoints for VanTac TMS and other trusted services.
/// Protected by X-Service-Key header instead of JWT — no user context required.
/// </summary>
[ApiController]
[Route("internal")]
[AllowAnonymous]
public class InternalServiceController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly IConfiguration _config;
    private readonly ILogger<InternalServiceController> _logger;

    public InternalServiceController(
        TaylorAccessDbContext context,
        IConfiguration config,
        ILogger<InternalServiceController> logger)
    {
        _context = context;
        _config = config;
        _logger = logger;
    }

    private bool IsAuthorized()
    {
        var key = _config["INTERNAL_SERVICE_KEY"]
            ?? Environment.GetEnvironmentVariable("INTERNAL_SERVICE_KEY")
            ?? "ta-internal-service-key-2026";
        var header = Request.Headers["X-Service-Key"].FirstOrDefault();
        return header == key;
    }

    /// <summary>Drivers list for VanTac Fleet Management.</summary>
    [HttpGet("drivers")]
    public async Task<IActionResult> GetDrivers(
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] int limit = 1000)
    {
        if (!IsAuthorized())
            return Unauthorized(new { error = "Invalid service key" });

        var query = _context.Drivers.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(d => d.Status == status);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(d =>
                d.Name.ToLower().Contains(s) ||
                (d.Email != null && d.Email.ToLower().Contains(s)) ||
                (d.Phone != null && d.Phone.Contains(s)) ||
                (d.LicenseNumber != null && d.LicenseNumber.ToLower().Contains(s))
            );
        }

        var drivers = await query
            .OrderBy(d => d.Name)
            .Take(limit)
            .Select(d => new
            {
                d.Id, d.Name, d.Email, d.Phone, d.Status,
                d.LicenseNumber, d.LicenseState, d.LicenseClass,
                d.LicenseExpiry, d.MedicalCardExpiry,
                d.HireDate, d.DriverType, d.TruckNumber,
                d.OrganizationId, d.CreatedAt, d.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = drivers, total = drivers.Count });
    }

    /// <summary>Carriers list for VanTac.</summary>
    [HttpGet("carriers")]
    public async Task<IActionResult> GetCarriers(
        [FromQuery] string? search,
        [FromQuery] int limit = 500)
    {
        if (!IsAuthorized())
            return Unauthorized(new { error = "Invalid service key" });

        var query = _context.Carriers.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(c =>
                c.Name.ToLower().Contains(s) ||
                (c.McNumber != null && c.McNumber.Contains(s)) ||
                (c.DotNumber != null && c.DotNumber.Contains(s))
            );
        }

        var carriers = await query
            .OrderBy(c => c.Name)
            .Take(limit)
            .Select(c => new
            {
                c.Id, c.Name, c.McNumber, c.DotNumber,
                c.Email, c.Phone, c.Status,
                c.OrganizationId, c.CreatedAt
            })
            .ToListAsync();

        return Ok(new { data = carriers, total = carriers.Count });
    }

    /// <summary>Fleets list for VanTac.</summary>
    [HttpGet("fleets")]
    public async Task<IActionResult> GetFleets([FromQuery] int limit = 200)
    {
        if (!IsAuthorized())
            return Unauthorized(new { error = "Invalid service key" });

        var fleets = await _context.Fleets
            .AsNoTracking()
            .OrderBy(f => f.Name)
            .Take(limit)
            .Select(f => new { f.Id, f.Name, f.Description, f.OrganizationId })
            .ToListAsync();

        return Ok(new { data = fleets, total = fleets.Count });
    }
}
