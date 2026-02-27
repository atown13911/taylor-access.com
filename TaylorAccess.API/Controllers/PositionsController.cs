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
public class PositionsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public PositionsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get all positions in a department (or all if adminReport=true)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetPositions(
        [FromQuery] int? departmentId = null,
        [FromQuery] bool adminReport = false,
        [FromQuery] bool includeAll = false,
        [FromQuery] int pageSize = 50)
    {
        var currentUser = await _currentUserService.GetUserAsync();
        var userRole = currentUser?.Role?.ToLower();
        var isProductOwner = userRole == "product_owner";
        var isSuperAdmin = userRole == "superadmin";
        var hasUnrestrictedAccess = isProductOwner || isSuperAdmin;
        
        var query = _context.Positions.Include(p => p.Department).AsNoTracking().AsQueryable();
        
        // ADMIN REPORTS: Bypass all filtering for unrestricted access (product_owner or superadmin)
        if (adminReport && includeAll && hasUnrestrictedAccess)
        {
            if (departmentId.HasValue)
                query = query.Where(p => p.DepartmentId == departmentId.Value);
            
            var allPositions = await query
                .Include(p => p.Employees)
                .Include(p => p.Department.Organization)
                .Select(p => new {
                    p.Id,
                    p.Title,
                    p.Description,
                    p.Code,
                    p.Level,
                    p.HeadCount,
                    p.MinSalary,
                    p.MaxSalary,
                    p.Status,
                    p.DepartmentId,
                    DepartmentName = p.Department!.Name,
                    OrganizationId = p.Department.OrganizationId,
                    OrganizationName = p.Department.Organization != null ? p.Department.Organization.Name : null,
                    CurrentCount = p.Employees.Count(e => e.Status == "active"),
                    p.CreatedAt,
                    p.UpdatedAt
                })
                .OrderBy(p => p.OrganizationId).ThenBy(p => p.DepartmentName).ThenBy(p => p.Title)
                .Take(pageSize)
                .ToListAsync();
            
            return Ok(new { data = allPositions });
        }
        
        // NORMAL MODE: SECURITY: Non-product-owner can only see positions in their organization
        if (!isProductOwner && currentUser?.OrganizationId != null)
        {
            // Filter to positions in departments that belong to their org
            query = query.Where(p => p.Department!.OrganizationId == currentUser.OrganizationId);
        }
        
        if (departmentId.HasValue)
            query = query.Where(p => p.DepartmentId == departmentId.Value);

        var positions = await query
            .Include(p => p.Employees)
            .Select(p => new {
                p.Id,
                p.Title,
                p.Description,
                p.Code,
                p.Level,
                p.HeadCount,
                p.MinSalary,
                p.MaxSalary,
                p.Status,
                p.DepartmentId,
                DepartmentName = p.Department!.Name,
                CurrentCount = p.Employees.Count(e => e.Status == "active"),
                p.CreatedAt,
                p.UpdatedAt
            })
            .OrderBy(p => p.Title)
            .ToListAsync();

        return Ok(new { data = positions });
    }

    /// <summary>
    /// Get single position
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetPosition(int id)
    {
        var position = await _context.Positions
            .Include(p => p.Department)
            .Include(p => p.Employees)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (position == null)
            return NotFound(new { error = "Position not found" });

        return Ok(new { data = position });
    }

    /// <summary>
    /// Create new position
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "product_owner,superadmin,admin,manager")]
    public async Task<ActionResult<object>> CreatePosition([FromBody] CreatePositionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            return BadRequest(new { error = "Position title is required" });

        var position = new Position
        {
            Title = request.Title,
            Description = request.Description,
            Code = request.Code,
            Level = request.Level,
            DepartmentId = request.DepartmentId,
            HeadCount = request.HeadCount,
            MinSalary = request.MinSalary,
            MaxSalary = request.MaxSalary,
            Status = "active"
        };

        _context.Positions.Add(position);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetPosition), new { id = position.Id }, new { data = position });
    }

    /// <summary>
    /// Update position
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "product_owner,superadmin,admin,manager")]
    public async Task<ActionResult<object>> UpdatePosition(int id, [FromBody] UpdatePositionRequest request)
    {
        var position = await _context.Positions.FindAsync(id);
        if (position == null)
            return NotFound(new { error = "Position not found" });

        if (!string.IsNullOrWhiteSpace(request.Title))
            position.Title = request.Title;
        
        if (request.Description != null)
            position.Description = request.Description;
        
        if (request.Code != null)
            position.Code = request.Code;
        
        if (request.Level != null)
            position.Level = request.Level;
        
        if (request.Status != null)
            position.Status = request.Status;
        
        if (request.HeadCount.HasValue)
            position.HeadCount = request.HeadCount;
        
        if (request.MinSalary.HasValue)
            position.MinSalary = request.MinSalary;
        
        if (request.MaxSalary.HasValue)
            position.MaxSalary = request.MaxSalary;

        position.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = position });
    }

    /// <summary>
    /// Delete position
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult> DeletePosition(int id)
    {
        var position = await _context.Positions.FindAsync(id);
        if (position == null)
            return NotFound(new { error = "Position not found" });

        // Auto-unassign all employees from this position before deleting
        var assignedEmployees = await _context.Users.Where(u => u.PositionId == id).ToListAsync();
        foreach (var emp in assignedEmployees)
            emp.PositionId = null;

        _context.Positions.Remove(position);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }
}

public record CreatePositionRequest(
    string Title,
    string? Description,
    string? Code,
    string? Level,
    int DepartmentId,
    int? HeadCount,
    decimal? MinSalary,
    decimal? MaxSalary
);

public record UpdatePositionRequest(
    string? Title,
    string? Description,
    string? Code,
    string? Level,
    string? Status,
    int? HeadCount,
    decimal? MinSalary,
    decimal? MaxSalary
);

