using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/driver-terminals")]
[Authorize]
public class DriverTerminalsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<DriverTerminalsController> _logger;
    private readonly CurrentUserService _currentUserService;

    public DriverTerminalsController(TaylorAccessDbContext context, ILogger<DriverTerminalsController> logger, CurrentUserService currentUserService)
    {
        _context = context;
        _logger = logger;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetDriverTerminals(
        [FromQuery] int? divisionId,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 100)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var query = _context.DriverTerminals
            .AsNoTracking()
            .Include(t => t.Division)
            .AsQueryable();

        if (!user.IsProductOwner() && !user.IsSuperAdmin() && user.OrganizationId.HasValue)
            query = query.Where(t => t.OrganizationId == user.OrganizationId.Value);

        if (divisionId.HasValue)
            query = query.Where(t => t.DivisionId == divisionId.Value);

        if (!string.IsNullOrEmpty(status))
            query = query.Where(t => t.Status == status);

        var total = await query.CountAsync();
        var terminals = await query
            .OrderBy(t => t.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(t => new
            {
                t.Id,
                t.DivisionId,
                DivisionName = t.Division != null ? t.Division.Name : null,
                t.OrganizationId,
                t.Name,
                t.Description,
                t.Status,
                t.ManagerName,
                t.Location,
                DriverCount = _context.Drivers.Count(d => d.DriverTerminalId == t.Id),
                t.CreatedAt,
                t.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = terminals, total, page, limit });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetDriverTerminal(int id)
    {
        var terminal = await _context.DriverTerminals
            .Include(t => t.Division)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (terminal == null)
            return NotFound(new { error = "Driver terminal not found" });

        var driverCount = await _context.Drivers.CountAsync(d => d.DriverTerminalId == id);

        return Ok(new { data = new {
            terminal.Id, terminal.DivisionId,
            DivisionName = terminal.Division?.Name,
            terminal.OrganizationId, terminal.Name, terminal.Description,
            terminal.Status, terminal.ManagerName, terminal.Location,
            DriverCount = driverCount, terminal.CreatedAt, terminal.UpdatedAt
        }});
    }

    [HttpPost]
    public async Task<ActionResult<object>> CreateDriverTerminal([FromBody] CreateDriverTerminalRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Terminal name is required" });
        if (request.DivisionId <= 0)
            return BadRequest(new { error = "DivisionId is required" });

        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var division = await _context.Divisions.FindAsync(request.DivisionId);
        if (division == null)
            return BadRequest(new { error = "Division not found" });

        var orgId = user.OrganizationId ?? division.OrganizationId;

        var terminal = new DriverTerminal
        {
            DivisionId = request.DivisionId,
            OrganizationId = orgId,
            Name = request.Name,
            Description = request.Description,
            Status = request.Status ?? "active",
            ManagerName = request.ManagerName,
            Location = request.Location
        };

        _context.DriverTerminals.Add(terminal);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created driver terminal {Name} in division {DivisionId}", terminal.Name, terminal.DivisionId);

        return CreatedAtAction(nameof(GetDriverTerminal), new { id = terminal.Id }, new { data = terminal });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<object>> UpdateDriverTerminal(int id, [FromBody] UpdateDriverTerminalRequest request)
    {
        var terminal = await _context.DriverTerminals.FindAsync(id);
        if (terminal == null)
            return NotFound(new { error = "Driver terminal not found" });

        if (!string.IsNullOrEmpty(request.Name)) terminal.Name = request.Name;
        if (request.Description != null) terminal.Description = request.Description;
        if (!string.IsNullOrEmpty(request.Status)) terminal.Status = request.Status;
        if (request.ManagerName != null) terminal.ManagerName = request.ManagerName;
        if (request.Location != null) terminal.Location = request.Location;

        terminal.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = terminal });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteDriverTerminal(int id)
    {
        var terminal = await _context.DriverTerminals.FindAsync(id);
        if (terminal == null)
            return NotFound(new { error = "Driver terminal not found" });

        // Unassign drivers
        var drivers = await _context.Drivers.Where(d => d.DriverTerminalId == id).ToListAsync();
        foreach (var driver in drivers) driver.DriverTerminalId = null;

        _context.DriverTerminals.Remove(terminal);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }
}

public record CreateDriverTerminalRequest(
    int DivisionId,
    string Name,
    string? Description,
    string? Status,
    string? ManagerName,
    string? Location
);

public record UpdateDriverTerminalRequest(
    string? Name,
    string? Description,
    string? Status,
    string? ManagerName,
    string? Location
);

