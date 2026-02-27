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
public class DepartmentsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public DepartmentsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get all departments in user's organization (or all if adminReport=true)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetDepartments(
        [FromQuery] int? organizationId = null,
        [FromQuery] bool adminReport = false,
        [FromQuery] bool includeAll = false,
        [FromQuery] int pageSize = 50)
    {
        var user = await _currentUserService.GetUserAsync();
        var hasUnrestrictedAccess = user?.IsProductOwner() == true || user?.IsSuperAdmin() == true;
        
        // ADMIN REPORTS: Bypass org filtering for unrestricted access (product_owner or superadmin)
        if (adminReport && includeAll && hasUnrestrictedAccess)
        {
            var adminQuery = _context.Departments
                .Include(d => d.Manager)
                .Include(d => d.Employees)
                .Include(d => d.Organization)
                .Include(d => d.Division)
                .AsNoTracking()
                .AsQueryable();

            // Still allow filtering by specific org if requested
            if (organizationId.HasValue)
                adminQuery = adminQuery.Where(d => d.OrganizationId == organizationId.Value);

            var allDepartments = await adminQuery
                .Select(d => new {
                    d.Id,
                    d.Name,
                    d.Description,
                    d.Code,
                    d.Status,
                    d.OrganizationId,
                    OrganizationName = d.Organization != null ? d.Organization.Name : null,
                    d.DivisionId,
                    DivisionName = d.Division != null ? d.Division.Name : null,
                    ManagerId = d.ManagerUserId,
                    ManagerName = d.Manager != null ? d.Manager.Name : null,
                    ManagerRole = d.Manager != null ? d.Manager.Role : null,
                    EmployeeCount = d.Employees.Count(e => e.Status == "active"),
                    PositionCount = _context.Positions.Count(p => p.DepartmentId == d.Id),
                    d.CreatedAt,
                    d.UpdatedAt
                })
                .OrderBy(d => d.OrganizationId).ThenBy(d => d.Name)
                .Take(pageSize)
                .ToListAsync();
            
            return Ok(new { data = allDepartments });
        }
        
        // NORMAL MODE: Superadmin/product_owner can pick org; others forced to their own
        int? targetOrgId;
        if (hasUnrestrictedAccess)
        {
            targetOrgId = organizationId ?? user?.OrganizationId;
            // If still null, return all departments
            if (targetOrgId == null)
            {
                var allDepts = await _context.Departments
                    .Include(d => d.Manager)
                    .Include(d => d.Employees)
                    .Include(d => d.Organization)
                    .AsNoTracking()
                    .Select(d => new {
                        d.Id, d.Name, d.Description, d.Code, d.Status, d.OrganizationId,
                        OrganizationName = d.Organization != null ? d.Organization.Name : null,
                        ManagerId = d.ManagerUserId,
                        ManagerName = d.Manager != null ? d.Manager.Name : null,
                        ManagerEmail = d.Manager != null ? d.Manager.Email : null,
                        ManagerRole = d.Manager != null ? d.Manager.Role : null,
                        EmployeeCount = d.Employees.Count(e => e.Status == "active"),
                        PositionCount = _context.Positions.Count(p => p.DepartmentId == d.Id),
                        d.CreatedAt, d.UpdatedAt
                    })
                    .OrderBy(d => d.Name)
                    .Take(pageSize)
                    .ToListAsync();
                return Ok(new { data = allDepts });
            }
        }
        else
        {
            targetOrgId = user?.OrganizationId;
        }
        
        if (targetOrgId == null)
            return BadRequest(new { error = "Organization not specified" });

        var departments = await _context.Departments
            .Where(d => d.OrganizationId == targetOrgId)
            .Include(d => d.Manager)
            .Include(d => d.Employees)
            .Include(d => d.Organization)
            .AsNoTracking()
            .Select(d => new {
                d.Id,
                d.Name,
                d.Description,
                d.Code,
                d.Status,
                d.OrganizationId,
                OrganizationName = d.Organization != null ? d.Organization.Name : null,
                ManagerId = d.ManagerUserId,
                ManagerName = d.Manager != null ? d.Manager.Name : null,
                ManagerEmail = d.Manager != null ? d.Manager.Email : null,
                ManagerRole = d.Manager != null ? d.Manager.Role : null,
                EmployeeCount = d.Employees.Count(e => e.Status == "active"),
                PositionCount = _context.Positions.Count(p => p.DepartmentId == d.Id),
                d.CreatedAt,
                d.UpdatedAt
            })
            .OrderBy(d => d.Name)
            .ToListAsync();

        return Ok(new { data = departments });
    }

    /// <summary>
    /// Get single department by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetDepartment(int id)
    {
        var department = await _context.Departments
            .Include(d => d.Organization)
            .Include(d => d.Manager)
            .Include(d => d.Employees)
            .AsNoTracking()
            .Where(d => d.Id == id)
            .Select(d => new {
                d.Id,
                d.Name,
                d.Description,
                d.Code,
                d.Status,
                d.OrganizationId,
                OrganizationName = d.Organization != null ? d.Organization.Name : null,
                d.DivisionId,
                d.ManagerUserId,
                ManagerName = d.Manager != null ? d.Manager.Name : null,
                ManagerEmail = d.Manager != null ? d.Manager.Email : null,
                EmployeeCount = d.Employees.Count(e => e.Status == "active"),
                d.CreatedAt,
                d.UpdatedAt
            })
            .FirstOrDefaultAsync();

        if (department == null)
            return NotFound(new { error = "Department not found" });

        return Ok(new { data = department });
    }

    /// <summary>
    /// Get employees in a department
    /// </summary>
    [HttpGet("{id}/employees")]
    public async Task<ActionResult<object>> GetDepartmentEmployees(int id)
    {
        var employees = await _context.Users
            .Where(u => u.DepartmentId == id && u.Status == "active")
            .Select(u => new {
                u.Id,
                u.Name,
                u.Email,
                u.Phone,
                u.JobTitle,
                u.Role,
                u.Status
            })
            .OrderBy(u => u.Name)
            .ToListAsync();

        return Ok(new { data = employees });
    }

    /// <summary>
    /// Create new department
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "product_owner,superadmin,admin,manager")]
    public async Task<ActionResult<object>> CreateDepartment([FromBody] CreateDepartmentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Department name is required" });

        // SECURITY: Non-product-owner can only create departments in their organization
        var currentUser = await _currentUserService.GetUserAsync();
        var isProductOwner = currentUser?.Role == "product_owner";
        
        var targetOrgId = request.OrganizationId;
        if (!isProductOwner && targetOrgId != currentUser?.OrganizationId)
        {
            return Forbid(); // Can't create departments in other organizations
        }

        var department = new Department
        {
            Name = request.Name,
            Description = request.Description,
            Code = request.Code,
            OrganizationId = targetOrgId,
            ManagerUserId = request.ManagerUserId,
            Status = "active"
        };

        _context.Departments.Add(department);
        await _context.SaveChangesAsync();

        // Auto-assign manager to this department
        if (request.ManagerUserId.HasValue)
        {
            var manager = await _context.Users.FindAsync(request.ManagerUserId.Value);
            if (manager != null)
            {
                manager.DepartmentId = department.Id;
                await _context.SaveChangesAsync();
            }
        }

        return CreatedAtAction(nameof(GetDepartment), new { id = department.Id }, new { data = department });
    }

    /// <summary>
    /// Update department
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "product_owner,superadmin,admin,manager")]
    public async Task<ActionResult<object>> UpdateDepartment(int id, [FromBody] UpdateDepartmentRequest request)
    {
        var department = await _context.Departments.FindAsync(id);
        if (department == null)
            return NotFound(new { error = "Department not found" });

        // SECURITY: Non-admin can only edit departments in their organization
        var currentUser = await _currentUserService.GetUserAsync();
        var hasUnrestrictedAccess = currentUser?.IsProductOwner() == true || currentUser?.IsSuperAdmin() == true;
        
        if (!hasUnrestrictedAccess && department.OrganizationId != currentUser?.OrganizationId)
        {
            return Forbid(); // Can't edit departments from other organizations
        }

        if (!string.IsNullOrWhiteSpace(request.Name))
            department.Name = request.Name;
        
        if (request.Description != null)
            department.Description = request.Description;
        
        if (request.Code != null)
            department.Code = request.Code;
        
        if (request.Status != null)
            department.Status = request.Status;
        
        // Always update ManagerUserId (null = unassign manager)
        // Also set the manager's departmentId to this department
        if (request.ManagerUserId != department.ManagerUserId)
        {
            // Unassign old manager from this department (if they were assigned)
            if (department.ManagerUserId.HasValue)
            {
                var oldManager = await _context.Users.FindAsync(department.ManagerUserId.Value);
                if (oldManager != null && oldManager.DepartmentId == department.Id)
                {
                    oldManager.DepartmentId = null;
                }
            }
            // Assign new manager to this department
            if (request.ManagerUserId.HasValue)
            {
                var newManager = await _context.Users.FindAsync(request.ManagerUserId.Value);
                if (newManager != null)
                {
                    newManager.DepartmentId = department.Id;
                }
            }
        }
        department.ManagerUserId = request.ManagerUserId;

        // Allow updating DivisionId if provided
        if (request.DivisionId.HasValue)
            department.DivisionId = request.DivisionId.Value == 0 ? null : request.DivisionId;
        
        // Allow updating OrganizationId if provided
        if (request.OrganizationId.HasValue && request.OrganizationId.Value > 0)
            department.OrganizationId = request.OrganizationId.Value;

        department.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = department });
    }

    /// <summary>
    /// Delete department
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult> DeleteDepartment(int id)
    {
        var department = await _context.Departments.FindAsync(id);
        if (department == null)
            return NotFound(new { error = "Department not found" });

        // SECURITY: Non-product-owner can only delete departments in their organization
        var currentUser = await _currentUserService.GetUserAsync();
        var isProductOwner = currentUser?.Role == "product_owner";
        
        if (!isProductOwner && department.OrganizationId != currentUser?.OrganizationId)
        {
            return Forbid(); // Can't delete departments from other organizations
        }

        // Auto-unassign all employees from this department before deleting
        var assignedEmployees = await _context.Users.Where(u => u.DepartmentId == id).ToListAsync();
        foreach (var emp in assignedEmployees)
            emp.DepartmentId = null;

        _context.Departments.Remove(department);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }
}

public record CreateDepartmentRequest(
    string Name,
    string? Description,
    string? Code,
    int OrganizationId,
    int? ManagerUserId
);

public record UpdateDepartmentRequest(
    string? Name,
    string? Description,
    string? Code,
    string? Status,
    int? ManagerUserId,
    int? DivisionId,
    int? OrganizationId
);


