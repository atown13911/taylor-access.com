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
public class DivisionsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<DivisionsController> _logger;
    private readonly CurrentUserService _currentUserService;
    private readonly IAuditService _auditService;

    public DivisionsController(TaylorAccessDbContext context, ILogger<DivisionsController> logger, CurrentUserService currentUserService, IAuditService auditService)
    {
        _context = context;
        _logger = logger;
        _currentUserService = currentUserService;
        _auditService = auditService;
    }

    /// <summary>
    /// Get all divisions, optionally filtered by organizationId
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetDivisions(
        [FromQuery] int? organizationId,
        [FromQuery] string? divisionType,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 100)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
            return Unauthorized(new { error = "Not authenticated" });

        var query = _context.Divisions
            .AsNoTracking()
            .Include(d => d.Organization)
            .AsQueryable();

        if (user.IsProductOwner() || user.IsSuperAdmin())
        {
            if (organizationId.HasValue)
                query = query.Where(d => d.OrganizationId == organizationId.Value);
        }
        else if (user.OrganizationId.HasValue)
        {
            query = query.Where(d => d.OrganizationId == user.OrganizationId.Value);
        }

        if (!string.IsNullOrEmpty(divisionType))
            query = query.Where(d => d.DivisionType == divisionType);

        if (!string.IsNullOrEmpty(status))
            query = query.Where(d => d.Status == status);

        var total = await query.CountAsync();
        var divisions = await query
            .OrderBy(d => d.DivisionType).ThenBy(d => d.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(d => new
            {
                d.Id,
                d.DivisionType,
                d.OrganizationId,
                OrganizationName = d.Organization != null ? d.Organization.Name : null,
                d.Name,
                d.Description,
                d.Status,
                d.ManagerName,
                d.Location,
                DepartmentCount = _context.Departments.Count(dep => dep.DivisionId == d.Id),
                d.CreatedAt,
                d.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = divisions, total, page, limit });
    }

    /// <summary>
    /// Get a single division by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetDivision(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
            return Unauthorized(new { error = "Not authenticated" });

        var division = await _context.Divisions
            .Include(d => d.Organization)
            .FirstOrDefaultAsync(d => d.Id == id);

        if (division == null)
            return NotFound(new { error = "Division not found" });

        return Ok(new
        {
            data = new
            {
                division.Id,
                division.OrganizationId,
                OrganizationName = division.Organization?.Name,
                division.Name,
                division.Description,
                division.Status,
                division.ManagerName,
                division.Location,
                division.CreatedAt,
                division.UpdatedAt
            }
        });
    }

    /// <summary>
    /// Create a new division
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<object>> CreateDivision([FromBody] CreateDivisionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Division name is required" });

        var user = await _currentUserService.GetUserAsync();
        if (user == null)
            return Unauthorized(new { error = "Not authenticated" });

        var divType = request.DivisionType ?? "operational";

        var orgId = request.OrganizationId ?? user.OrganizationId ?? 0;
        if (orgId == 0) return BadRequest(new { error = "Organization is required" });

        var division = new Division
        {
            DivisionType = divType,
            OrganizationId = orgId,
            Name = request.Name,
            Description = request.Description,
            Status = request.Status ?? "active",
            ManagerName = request.ManagerName,
            Location = request.Location
        };

        _context.Divisions.Add(division);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created division {Name} (ID: {Id})", division.Name, division.Id);
        await _auditService.LogAsync(AuditActions.DivisionCreated, "Division", division.Id,
            $"Created division {division.Name}");

        return CreatedAtAction(nameof(GetDivision), new { id = division.Id }, new { data = division });
    }

    /// <summary>
    /// Update a division
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<object>> UpdateDivision(int id, [FromBody] UpdateDivisionRequest request)
    {
        var division = await _context.Divisions.FindAsync(id);
        if (division == null)
            return NotFound(new { error = "Division not found" });

        if (!string.IsNullOrEmpty(request.Name)) division.Name = request.Name;
        if (request.Description != null) division.Description = request.Description;
        if (!string.IsNullOrEmpty(request.Status)) division.Status = request.Status;
        if (request.ManagerName != null) division.ManagerName = request.ManagerName;
        if (request.Location != null) division.Location = request.Location;
        if (request.DivisionType != null) division.DivisionType = request.DivisionType;

        division.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated division {Name} (ID: {Id})", division.Name, division.Id);

        return Ok(new { data = division });
    }

    /// <summary>
    /// Delete a division
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteDivision(int id)
    {
        var division = await _context.Divisions.FindAsync(id);
        if (division == null)
            return NotFound(new { error = "Division not found" });

        _context.Divisions.Remove(division);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Deleted division {Name}", division.Name);

        return Ok(new { deleted = true });
    }
}

public record CreateDivisionRequest(
    string Name,
    string? DivisionType,
    int? OrganizationId,
    string? Description,
    string? Status,
    string? ManagerName,
    string? Location
);

public record UpdateDivisionRequest(
    string? Name,
    string? Description,
    string? Status,
    string? ManagerName,
    string? Location,
    string? DivisionType
);
