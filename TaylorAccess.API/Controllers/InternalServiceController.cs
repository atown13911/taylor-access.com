using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Internal service-to-service endpoints for VanTac and other trusted services.
/// Protected by X-Service-Key header — no user JWT required.
/// </summary>
[ApiController]
[Route("internal")]
[AllowAnonymous]
public class InternalServiceController : ControllerBase
{
    private readonly TaylorAccessDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<InternalServiceController> _logger;

    public InternalServiceController(TaylorAccessDbContext db, IConfiguration config, ILogger<InternalServiceController> logger)
    {
        _db = db;
        _config = config;
        _logger = logger;
    }

    private bool ValidateServiceKey()
    {
        var expected = _config["INTERNAL_SERVICE_KEY"]
            ?? Environment.GetEnvironmentVariable("INTERNAL_SERVICE_KEY")
            ?? "ta-internal-service-key-2026";
        var provided = Request.Headers["X-Service-Key"].FirstOrDefault();
        return !string.IsNullOrEmpty(provided) && provided == expected;
    }

    private bool IsGatewayRequest()
    {
        return Request.Headers["X-GW-Internal"].FirstOrDefault() == "1";
    }

    private bool AllowLegacyServiceKey()
    {
        return bool.TryParse(_config["ALLOW_LEGACY_INTERNAL_SERVICE_KEY"]
                ?? Environment.GetEnvironmentVariable("ALLOW_LEGACY_INTERNAL_SERVICE_KEY"), out var allow)
            && allow;
    }

    private bool IsAuthorizedInternalCall()
    {
        if (IsGatewayRequest())
            return true;

        if (AllowLegacyServiceKey())
            return ValidateServiceKey();

        return false;
    }

    /// <summary>Get drivers for internal service consumers.</summary>
    [HttpGet("drivers")]
    public async Task<ActionResult> GetDrivers(
        [FromQuery] int limit = 500,
        [FromQuery] int page = 1,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        IQueryable<TaylorAccess.API.Models.Driver> query = _db.Drivers.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalizedStatus = status.Trim().ToLower();
            query = query.Where(d => (d.Status ?? "").ToLower() == normalizedStatus);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var normalizedSearch = search.Trim().ToLower();
            query = query.Where(d =>
                (d.Name ?? "").ToLower().Contains(normalizedSearch) ||
                (d.Email ?? "").ToLower().Contains(normalizedSearch) ||
                (d.Phone ?? "").ToLower().Contains(normalizedSearch));
        }

        var total = await query.CountAsync();
        var drivers = await query
            .OrderBy(d => d.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(d => new {
                d.Id,
                d.Name,
                d.Email,
                d.Phone,
                d.Status,
                d.LicenseNumber,
                d.LicenseState,
                d.LicenseExpiry,
                d.HireDate,
                d.DriverType,
                d.OrganizationId,
                d.CreatedAt,
                d.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = drivers, total });
    }

    /// <summary>Get employees/users for internal service consumers.</summary>
    [HttpGet("employees")]
    public async Task<ActionResult> GetEmployees(
        [FromQuery] int limit = 500,
        [FromQuery] int page = 1,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var query = _db.Users
            .AsNoTracking()
            .OrderBy(u => u.Name)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalizedStatus = status.Trim().ToLower();
            query = query.Where(u => (u.Status ?? "").ToLower() == normalizedStatus);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var normalizedSearch = search.Trim().ToLower();
            query = query.Where(u =>
                (u.Name ?? "").ToLower().Contains(normalizedSearch) ||
                (u.Email ?? "").ToLower().Contains(normalizedSearch) ||
                (u.Phone ?? "").ToLower().Contains(normalizedSearch));
        }

        var total = await query.CountAsync();
        var employees = await query
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(u => new
            {
                u.Id,
                u.Name,
                u.Email,
                u.Phone,
                u.Role,
                u.Status,
                u.OrganizationId,
                u.DepartmentId,
                u.PositionId,
                u.CreatedAt,
                u.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = employees, total });
    }

    /// <summary>Get all active carriers (for VanTac Fleet Management)</summary>
    [HttpGet("carriers")]
    public async Task<ActionResult> GetCarriers([FromQuery] int limit = 500, [FromQuery] int page = 1)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        // Return carriers from the Carriers table or driver records with type=carrier
        var carriers = await _db.Drivers
            .AsNoTracking()
            .Where(d => d.DriverType == "carrier" || d.DriverType == "owner_operator")
            .OrderBy(d => d.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(d => new {
                d.Id,
                d.Name,
                d.Phone,
                d.Email,
                d.Status,
                d.DriverType,
                d.OrganizationId
            })
            .ToListAsync();

        return Ok(new { data = carriers, total = carriers.Count });
    }

    /// <summary>Get fleet summary (for VanTac Fleet Management)</summary>
    [HttpGet("fleets")]
    public async Task<ActionResult> GetFleets()
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var totalDrivers  = await _db.Drivers.CountAsync(d => d.Status == "active" || d.Status == "Active");
        var activeDrivers = totalDrivers;

        return Ok(new {
            totalDrivers,
            activeDrivers,
            source = "taylor-access"
        });
    }

    /// <summary>Lightweight data health counts for internal diagnostics.</summary>
    [HttpGet("health/data-counts")]
    public async Task<ActionResult> GetDataCounts()
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var totalDrivers = await _db.Drivers.AsNoTracking().CountAsync();
        var activeDrivers = await _db.Drivers.AsNoTracking()
            .CountAsync(d => d.Status != null && d.Status.ToLower() == "active");
        var archivedDrivers = await _db.Drivers.AsNoTracking()
            .CountAsync(d => d.Status != null && d.Status.ToLower() == "archived");

        var totalEmployees = await _db.Users.AsNoTracking().CountAsync();
        var activeEmployees = await _db.Users.AsNoTracking()
            .CountAsync(u => u.Status != null && u.Status.ToLower() == "active");

        return Ok(new
        {
            source = "taylor-access",
            drivers = new
            {
                total = totalDrivers,
                active = activeDrivers,
                archived = archivedDrivers
            },
            employees = new
            {
                total = totalEmployees,
                active = activeEmployees
            },
            utc = DateTime.UtcNow
        });
    }
}
