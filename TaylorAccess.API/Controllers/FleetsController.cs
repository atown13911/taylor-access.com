using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class FleetsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<FleetsController> _logger;
    private readonly CurrentUserService _currentUserService;

    public FleetsController(TaylorAccessDbContext context, ILogger<FleetsController> logger, CurrentUserService currentUserService)
    {
        _context = context;
        _logger = logger;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetFleets([FromQuery] string? status, [FromQuery] int? organizationId, [FromQuery] int limit = 50)
    {
        var query = _context.Fleets
            .AsNoTracking()
            .Include(f => f.FleetDrivers)
            .Include(f => f.FleetVehicles)
            .Where(f => f.ParentFleetId == null)
            .AsQueryable();

        if (organizationId.HasValue)
            query = query.Where(f => f.OrganizationId == organizationId);

        if (!string.IsNullOrEmpty(status))
            query = query.Where(f => f.Status == status);

        var fleets = await query.OrderBy(f => f.Name).Take(limit).ToListAsync();
        return Ok(new { data = fleets });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Fleet>> GetFleet(int id)
    {
        var fleet = await _context.Fleets
            .AsNoTracking()
            .Include(f => f.FleetDrivers)
            .Include(f => f.FleetVehicles)
            .Include(f => f.SubFleets)
            .FirstOrDefaultAsync(f => f.Id == id);

        if (fleet == null) return NotFound(new { error = "Fleet not found" });
        return Ok(new { data = fleet });
    }

    [HttpPost]
    public async Task<ActionResult<Fleet>> CreateFleet([FromBody] Fleet fleet)
    {
        if (string.IsNullOrWhiteSpace(fleet.Name))
            return BadRequest(new { error = "Fleet Name is required" });

        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var orgId = user.OrganizationId ?? 0;
        if (orgId == 0)
        {
            var orgIds = await _currentUserService.GetUserOrganizationIdsAsync();
            orgId = orgIds.FirstOrDefault();
        }
        if (orgId == 0) return BadRequest(new { error = "No organization assigned" });

        fleet.Id = 0;
        fleet.OrganizationId = orgId;
        fleet.CreatedAt = DateTime.UtcNow;
        fleet.UpdatedAt = DateTime.UtcNow;

        _context.Fleets.Add(fleet);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetFleet), new { id = fleet.Id }, new { data = fleet });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<Fleet>> UpdateFleet(int id, [FromBody] Fleet updated)
    {
        var fleet = await _context.Fleets.FindAsync(id);
        if (fleet == null) return NotFound(new { error = "Fleet not found" });

        fleet.Name = updated.Name;
        fleet.Description = updated.Description;
        fleet.Status = updated.Status;
        fleet.Task = updated.Task;
        fleet.ParentFleetId = updated.ParentFleetId;
        fleet.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { data = fleet });
    }

    [HttpPost("{id}/assign-driver")]
    public async Task<ActionResult<Fleet>> AssignDriver(int id, [FromBody] AssignDriverRequest request)
    {
        var fleet = await _context.Fleets.FindAsync(id);
        if (fleet == null) return NotFound(new { error = "Fleet not found" });

        var existing = await _context.FleetDrivers.FirstOrDefaultAsync(fd => fd.FleetId == id && fd.DriverId == request.DriverId);
        if (existing == null)
        {
            _context.FleetDrivers.Add(new FleetDriver { FleetId = id, DriverId = request.DriverId, AssignedAt = DateTime.UtcNow });
            await _context.SaveChangesAsync();
        }
        return await GetFleet(id);
    }

    [HttpPost("{id}/remove-driver")]
    public async Task<ActionResult<Fleet>> RemoveDriver(int id, [FromBody] AssignDriverRequest request)
    {
        var assignment = await _context.FleetDrivers.FirstOrDefaultAsync(fd => fd.FleetId == id && fd.DriverId == request.DriverId);
        if (assignment != null)
        {
            _context.FleetDrivers.Remove(assignment);
            await _context.SaveChangesAsync();
        }
        return await GetFleet(id);
    }

    [HttpPost("{id}/assign-vehicle")]
    public async Task<ActionResult<Fleet>> AssignVehicle(int id, [FromBody] AssignVehicleRequest request)
    {
        var fleet = await _context.Fleets.FindAsync(id);
        if (fleet == null) return NotFound(new { error = "Fleet not found" });

        var existing = await _context.FleetVehicles.FirstOrDefaultAsync(fv => fv.FleetId == id && fv.VehicleId == request.VehicleId);
        if (existing == null)
        {
            _context.FleetVehicles.Add(new FleetVehicle { FleetId = id, VehicleId = request.VehicleId, AssignedAt = DateTime.UtcNow });
            await _context.SaveChangesAsync();
        }
        return await GetFleet(id);
    }

    [HttpPost("{id}/remove-vehicle")]
    public async Task<ActionResult<Fleet>> RemoveVehicle(int id, [FromBody] AssignVehicleRequest request)
    {
        var assignment = await _context.FleetVehicles.FirstOrDefaultAsync(fv => fv.FleetId == id && fv.VehicleId == request.VehicleId);
        if (assignment != null)
        {
            _context.FleetVehicles.Remove(assignment);
            await _context.SaveChangesAsync();
        }
        return await GetFleet(id);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteFleet(int id)
    {
        var fleet = await _context.Fleets.FindAsync(id);
        if (fleet == null) return NotFound(new { error = "Fleet not found" });

        _context.Fleets.Remove(fleet);
        await _context.SaveChangesAsync();
        return Ok(new { deleted = true });
    }
}

public record AssignDriverRequest(int DriverId);
public record AssignVehicleRequest(int VehicleId);
