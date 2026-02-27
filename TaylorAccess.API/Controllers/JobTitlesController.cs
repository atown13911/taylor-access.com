using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Manage job titles/positions for recruiting
/// </summary>
[ApiController]
[Route("api/v1/job-titles")]
[Authorize]
public class JobTitlesController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public JobTitlesController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get all job titles (or all if adminReport=true)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetJobTitles(
        [FromQuery] string? search,
        [FromQuery] int? departmentId,
        [FromQuery] string? level,
        [FromQuery] bool? activeOnly,
        [FromQuery] bool adminReport = false,
        [FromQuery] bool includeAll = false,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 100,
        [FromQuery] int pageSize = 100)
    {
        var user = await _currentUserService.GetUserAsync();
        var isProductOwner = user?.Role == "product_owner";
        var isSuperAdmin = user?.Role == "superadmin";
        var hasUnrestrictedAccess = isProductOwner || isSuperAdmin;
        
        var query = _context.JobTitles
            .Include(j => j.Department)
            .Include(j => j.Organization)
            .AsQueryable();
        
        // ADMIN REPORTS: Bypass all filtering for unrestricted access (product_owner or superadmin)
        if (adminReport && includeAll && hasUnrestrictedAccess)
        {
            // Apply only explicit filters, no user context
            if (!string.IsNullOrEmpty(search))
            {
                query = query.Where(j => j.Title.Contains(search) || 
                                        (j.Code != null && j.Code.Contains(search)));
            }

            if (departmentId.HasValue)
                query = query.Where(j => j.DepartmentId == departmentId);

            if (!string.IsNullOrEmpty(level))
                query = query.Where(j => j.Level == level);

            if (activeOnly == true)
                query = query.Where(j => j.IsActive);

            var allTotal = await query.CountAsync();
            
            var allJobTitles = await query
                .OrderBy(j => j.OrganizationId).ThenBy(j => j.Title)
                .Take(pageSize > 0 ? pageSize : limit)
                .Select(j => new {
                    j.Id,
                    j.Title,
                    j.Code,
                    j.Description,
                    j.Level,
                    j.Category,
                    j.SalaryMin,
                    j.SalaryMax,
                    j.IsActive,
                    j.OrganizationId,
                    OrganizationName = j.Organization != null ? j.Organization.Name : null,
                    j.DepartmentId,
                    DepartmentName = j.Department != null ? j.Department.Name : null,
                    j.CreatedAt,
                    j.UpdatedAt
                })
                .ToListAsync();

            return Ok(new { 
                data = allJobTitles,
                meta = new { 
                    total = allTotal,
                    page = 1,
                    limit = pageSize > 0 ? pageSize : limit
                }
            });
        }
        
        // NORMAL MODE: SECURITY filtering
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        query = query.Where(j => j.OrganizationId == user.OrganizationId.Value);

        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(j => j.Title.Contains(search) || 
                                    (j.Code != null && j.Code.Contains(search)));
        }

        if (departmentId.HasValue)
            query = query.Where(j => j.DepartmentId == departmentId);

        if (!string.IsNullOrEmpty(level))
            query = query.Where(j => j.Level == level);

        if (activeOnly == true)
            query = query.Where(j => j.IsActive);

        var total = await query.CountAsync();
        
        var jobTitles = await query
            .OrderBy(j => j.Title)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(j => new
            {
                j.Id,
                j.Title,
                j.Code,
                j.Description,
                j.Level,
                j.Category,
                Department = j.Department != null ? new { j.Department.Id, j.Department.Name } : null,
                j.SalaryMin,
                j.SalaryMax,
                j.IsActive,
                j.CreatedAt
            })
            .ToListAsync();

        return Ok(new
        {
            data = jobTitles,
            meta = new { total, page, limit, pages = (int)Math.Ceiling((double)total / limit) }
        });
    }

    /// <summary>
    /// Create job title
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "admin,manager,hr")]
    public async Task<ActionResult<object>> CreateJobTitle([FromBody] JobTitle jobTitle)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        jobTitle.OrganizationId = user.OrganizationId.Value;
        jobTitle.CreatedAt = DateTime.UtcNow;
        jobTitle.UpdatedAt = DateTime.UtcNow;

        _context.JobTitles.Add(jobTitle);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetJobTitles), new { id = jobTitle.Id }, jobTitle);
    }

    /// <summary>
    /// Update job title
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "admin,manager,hr")]
    public async Task<ActionResult> UpdateJobTitle(int id, [FromBody] JobTitle updatedJobTitle)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var jobTitle = await _context.JobTitles
            .FirstOrDefaultAsync(j => j.Id == id && j.OrganizationId == user.OrganizationId.Value);

        if (jobTitle == null)
            return NotFound(new { message = "Job title not found" });

        jobTitle.Title = updatedJobTitle.Title;
        jobTitle.Code = updatedJobTitle.Code;
        jobTitle.Description = updatedJobTitle.Description;
        jobTitle.DepartmentId = updatedJobTitle.DepartmentId;
        jobTitle.Level = updatedJobTitle.Level;
        jobTitle.Category = updatedJobTitle.Category;
        jobTitle.SalaryMin = updatedJobTitle.SalaryMin;
        jobTitle.SalaryMax = updatedJobTitle.SalaryMax;
        jobTitle.IsActive = updatedJobTitle.IsActive;
        jobTitle.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(jobTitle);
    }

    /// <summary>
    /// Delete job title
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<ActionResult> DeleteJobTitle(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var jobTitle = await _context.JobTitles
            .FirstOrDefaultAsync(j => j.Id == id && j.OrganizationId == user.OrganizationId.Value);

        if (jobTitle == null)
            return NotFound(new { message = "Job title not found" });

        _context.JobTitles.Remove(jobTitle);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Job title deleted successfully" });
    }
}

