using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class OrganizationsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly MetricCacheService _cache;

    public OrganizationsController(TaylorAccessDbContext context, MetricCacheService cache)
    {
        _context = context;
        _cache = cache;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<object>> GetOrganizations(
        [FromQuery] string? status,
        [FromQuery] bool adminReport = false,
        [FromQuery] bool includeAll = false,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 25,
        [FromQuery] int pageSize = 25)
    {
        try
        {
            var query = _context.Organizations.AsQueryable();

            if (!string.IsNullOrEmpty(status))
                query = query.Where(o => o.Status == status);

            var total = await query.CountAsync();
            
            var effectiveLimit = (adminReport && pageSize > 0) ? pageSize : limit;
            
            var orgs = await query
                .OrderBy(o => o.Name)
                .Skip((page - 1) * effectiveLimit)
                .Take(effectiveLimit)
                .Select(o => new {
                    o.Id, o.Name, o.Description, o.Email, o.Phone, o.Website,
                    o.Country, o.Timezone, o.Status, o.CreatedAt, o.UpdatedAt,
                    UserCount = _context.Users.Count(u => u.OrganizationId == o.Id && u.Status == "active"),
                    DivisionCount = _context.Divisions.Count(d => d.OrganizationId == o.Id),
                    DepartmentCount = _context.Departments.Count(d => d.OrganizationId == o.Id),
                    PositionCount = _context.Positions.Count(p => p.Department!.OrganizationId == o.Id)
                })
                .AsNoTracking()
                .ToListAsync();

            var result = new { data = orgs, total, page, limit = effectiveLimit };
            return Ok(result);
        }
        catch { throw; }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetOrganization(int id)
    {
        var org = await _context.Organizations
            .Include(o => o.Users)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (org == null)
            return NotFound(new { error = "Organization not found" });

        return Ok(new { data = org });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<object>> UpdateOrganization(int id, [FromBody] Organization updated)
    {
        var org = await _context.Organizations.FindAsync(id);
        if (org == null)
            return NotFound(new { error = "Organization not found" });

        org.Name = updated.Name;
        org.Description = updated.Description;
        org.Email = updated.Email;
        org.Phone = updated.Phone;
        org.Website = updated.Website;
        org.Address = updated.Address;
        org.City = updated.City;
        org.State = updated.State;
        org.ZipCode = updated.ZipCode;
        org.Country = updated.Country;
        org.Timezone = updated.Timezone; // FIX: Save timezone
        org.McNumber = updated.McNumber;
        org.DotNumber = updated.DotNumber;
        org.ScacCode = updated.ScacCode;
        org.TaxId = updated.TaxId;
        org.Logo = updated.Logo;
        org.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = org });
    }

    [HttpGet("{id}/users")]
    public async Task<ActionResult<object>> GetOrganizationUsers(int id)
    {
        var users = await _context.Users
            .Where(u => u.OrganizationId == id)
            .Select(u => new UserDto(u))
            .ToListAsync();

        return Ok(new { data = users });
    }

    [HttpPost]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult<object>> CreateOrganization([FromBody] CreateOrgRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Organization name is required" });

        var org = new Organization
        {
            Name = request.Name,
            Email = request.Email,
            Phone = request.Phone,
            Description = request.Description,
            Website = request.Website,
            Country = request.Country ?? "USA",
            Timezone = request.Timezone ?? "America/New_York",
            Status = "active",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Organizations.Add(org);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetOrganization), new { id = org.Id }, new { data = org });
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "product_owner")]
    public async Task<ActionResult> DeleteOrganization(int id)
    {
        var org = await _context.Organizations.FindAsync(id);
        if (org == null)
            return NotFound(new { error = "Organization not found" });

        // Check if organization has any users
        var hasUsers = await _context.Users.AnyAsync(u => u.OrganizationId == id);
        if (hasUsers)
        {
            return BadRequest(new { error = "Cannot delete organization with active users. Please reassign or delete users first." });
        }

        // Check if organization has any data (shipments, orders, etc.)
        var hasShipments = await _context.Shipments.AnyAsync(s => s.OrganizationId == id);
        var hasOrders = await _context.Orders.AnyAsync(o => o.OrganizationId == id);
        var hasLoads = await _context.Loads.AnyAsync(l => l.OrganizationId == id);

        if (hasShipments || hasOrders || hasLoads)
        {
            return BadRequest(new { error = "Cannot delete organization with existing data. Archive it instead by setting status to 'inactive'." });
        }

        _context.Organizations.Remove(org);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true, message = "Organization deleted successfully" });
    }
}

public record CreateOrgRequest(
    string Name,
    string? Email,
    string? Phone,
    string? Description,
    string? Website,
    string? Country,
    string? Timezone
);





