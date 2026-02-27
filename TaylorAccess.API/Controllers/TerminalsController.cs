using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/terminals")]
[Authorize]
public class TerminalsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public TerminalsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get all terminals (filtered by user's entity scope)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetTerminals(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? status = null,
        [FromQuery] string? type = null,
        [FromQuery] string? search = null)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized(new { message = "User not found" });
        }

        var query = _context.Terminals
            .Include(t => t.Manager)
            .Include(t => t.Satellite)
            .Include(t => t.Agency)
            .Include(t => t.Organization)
            .AsQueryable();

        // DATA ISOLATION based on user's entity assignment
        if (user.TerminalId.HasValue)
        {
            // Terminal users see only their terminal
            query = query.Where(t => t.Id == user.TerminalId.Value);
        }
        else if (user.SatelliteId.HasValue)
        {
            // Satellite users see their satellite's terminals
            query = query.Where(t => t.SatelliteId == user.SatelliteId.Value);
        }
        else if (user.AgencyId.HasValue)
        {
            // Agency users see their agency's terminals
            query = query.Where(t => t.AgencyId == user.AgencyId.Value);
        }
        else if (user.OrganizationId.HasValue && user.Role != "product_owner" && user.Role != "superadmin")
        {
            // Corporate users see all terminals in their org
            query = query.Where(t => t.OrganizationId == user.OrganizationId.Value);
        }
        // product_owner/superadmin see everything

        // Filters
        if (!string.IsNullOrEmpty(status))
        {
            query = query.Where(t => t.Status.ToLower() == status.ToLower());
        }

        if (!string.IsNullOrEmpty(type))
        {
            query = query.Where(t => t.Type.ToLower() == type.ToLower());
        }

        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(t => 
                t.Name.Contains(search) || 
                (t.Code != null && t.Code.Contains(search)) ||
                t.City.Contains(search));
        }

        var total = await query.CountAsync();
        var terminals = await query
            .OrderBy(t => t.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new
        {
            data = terminals,
            total,
            page,
            pageSize,
            totalPages = (int)Math.Ceiling(total / (double)pageSize)
        });
    }

    /// <summary>
    /// Get terminal by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<Terminal>> GetTerminal(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var terminal = await _context.Terminals
            .Include(t => t.Manager)
            .Include(t => t.Satellite)
            .Include(t => t.Agency)
            .Include(t => t.Organization)
            .Include(t => t.Place)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (terminal == null)
        {
            return NotFound(new { message = "Terminal not found" });
        }

        // DATA ISOLATION
        if (user.TerminalId.HasValue && user.TerminalId.Value != id)
        {
            return Forbid();
        }
        if (user.SatelliteId.HasValue && terminal.SatelliteId != user.SatelliteId.Value)
        {
            return Forbid();
        }
        if (user.AgencyId.HasValue && terminal.AgencyId != user.AgencyId.Value)
        {
            return Forbid();
        }

        return Ok(terminal);
    }

    /// <summary>
    /// Create new terminal
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult<Terminal>> CreateTerminal([FromBody] Terminal terminal)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        if (terminal.OrganizationId == 0)
        {
            terminal.OrganizationId = user.OrganizationId.Value;
        }

        // Satellite/Agency users can only create terminals under their entity
        if (user.SatelliteId.HasValue)
        {
            terminal.SatelliteId = user.SatelliteId.Value;
            terminal.AgencyId = null;
        }
        else if (user.AgencyId.HasValue)
        {
            terminal.AgencyId = user.AgencyId.Value;
            terminal.SatelliteId = null;
        }

        terminal.CreatedAt = DateTime.UtcNow;
        terminal.UpdatedAt = DateTime.UtcNow;
        terminal.CreatedBy = user.Id;

        _context.Terminals.Add(terminal);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetTerminal), new { id = terminal.Id }, terminal);
    }

    /// <summary>
    /// Update terminal
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<Terminal>> UpdateTerminal(int id, [FromBody] Terminal input)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var terminal = await _context.Terminals.FindAsync(id);
        if (terminal == null)
        {
            return NotFound(new { message = "Terminal not found" });
        }

        // AUTHORIZATION
        var isCorporate = user.SatelliteId == null && user.AgencyId == null && user.TerminalId == null;
        var isEntityManager = (user.SatelliteId == terminal.SatelliteId || user.AgencyId == terminal.AgencyId) && user.Role == "admin";
        var isTerminalManager = terminal.ManagerUserId == user.Id;
        
        if (!isCorporate && !isEntityManager && !isTerminalManager)
        {
            return Forbid();
        }

        // Update fields
        terminal.Name = input.Name;
        terminal.Code = input.Code;
        terminal.Type = input.Type;
        terminal.Description = input.Description;
        terminal.Status = input.Status;
        terminal.Address = input.Address;
        terminal.AddressLine2 = input.AddressLine2;
        terminal.City = input.City;
        terminal.State = input.State;
        terminal.ZipCode = input.ZipCode;
        terminal.Country = input.Country;
        terminal.Latitude = input.Latitude;
        terminal.Longitude = input.Longitude;
        terminal.Timezone = input.Timezone;
        terminal.ContactName = input.ContactName;
        terminal.ContactEmail = input.ContactEmail;
        terminal.Phone = input.Phone;
        terminal.FaxNumber = input.FaxNumber;
        terminal.DockDoors = input.DockDoors;
        terminal.LoadingBays = input.LoadingBays;
        terminal.StorageCapacitySqFt = input.StorageCapacitySqFt;
        terminal.YardSpaceSqFt = input.YardSpaceSqFt;
        terminal.ParkingSpaces = input.ParkingSpaces;
        terminal.HasSecureStorage = input.HasSecureStorage;
        terminal.HasRefrigeration = input.HasRefrigeration;
        terminal.HasHazmatCertification = input.HasHazmatCertification;
        terminal.Equipment = input.Equipment;
        terminal.ManagerUserId = input.ManagerUserId;
        terminal.OperatingHours = input.OperatingHours;
        terminal.Is24Hour = input.Is24Hour;
        terminal.OperatesWeekends = input.OperatesWeekends;
        terminal.ReceivingCutoffTime = input.ReceivingCutoffTime;
        terminal.ShippingCutoffTime = input.ShippingCutoffTime;
        terminal.RequiresAppointment = input.RequiresAppointment;
        terminal.AppointmentLeadTimeHours = input.AppointmentLeadTimeHours;
        terminal.PlaceId = input.PlaceId;
        terminal.UpdatedAt = DateTime.UtcNow;
        terminal.UpdatedBy = user.Id;

        await _context.SaveChangesAsync();

        return Ok(terminal);
    }

    /// <summary>
    /// Delete terminal
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult> DeleteTerminal(int id)
    {
        var terminal = await _context.Terminals.FindAsync(id);
        if (terminal == null)
        {
            return NotFound(new { message = "Terminal not found" });
        }

        // Check dependencies
        var hasUsers = await _context.Users.AnyAsync(u => u.TerminalId == id);
        if (hasUsers)
        {
            return BadRequest(new { message = "Cannot delete terminal with assigned users. Please reassign users first." });
        }

        _context.Terminals.Remove(terminal);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// Get terminal statistics
    /// </summary>
    [HttpGet("{id}/stats")]
    public async Task<ActionResult<object>> GetTerminalStats(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        // Verify access
        if (user.TerminalId.HasValue && user.TerminalId.Value != id)
        {
            return Forbid();
        }

        var userCount = await _context.Users.CountAsync(u => u.TerminalId == id);

        return Ok(new
        {
            users = userCount,
            // Will add: active shipments, daily throughput, capacity utilization
        });
    }
}


