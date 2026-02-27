using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/agencies")]
[Authorize]
public class AgenciesController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public AgenciesController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get all agencies (corporate users see all, agency users see only theirs, adminReport bypasses all filters)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetAgencies(
        [FromQuery] int? organizationId = null,
        [FromQuery] bool adminReport = false,
        [FromQuery] bool includeAll = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized(new { message = "User not found" });
        }

        var isProductOwner = user.Role == "product_owner";
        var isSuperAdmin = user.Role == "superadmin";
        var hasUnrestrictedAccess = isProductOwner || isSuperAdmin;
        
        var query = _context.Agencies
            .Include(a => a.Manager)
            .Include(a => a.RegionalManager)
            .Include(a => a.Organization)
            .AsNoTracking()
            .AsQueryable();

        // ADMIN REPORTS: Bypass all filtering (product_owner or superadmin)
        if (adminReport && includeAll && hasUnrestrictedAccess)
        {
            // No user context filtering - apply only explicit filters
            if (organizationId.HasValue)
                query = query.Where(a => a.OrganizationId == organizationId.Value);
        }
        // NORMAL MODE: DATA ISOLATION
        else
        {
            // Agency users can only see their own agency
            if (user.AgencyId.HasValue)
            {
                query = query.Where(a => a.Id == user.AgencyId.Value);
            }
            // Corporate users see all agencies in their org
            else if (user.OrganizationId.HasValue && !hasUnrestrictedAccess)
            {
                query = query.Where(a => a.OrganizationId == user.OrganizationId.Value);
            }
            // product_owner/superadmin see everything (no filter) in normal mode
            else if (organizationId.HasValue)
            {
                query = query.Where(a => a.OrganizationId == organizationId.Value);
            }
        }

        // Filters
        if (!string.IsNullOrEmpty(status))
        {
            query = query.Where(a => a.Status.ToLower() == status.ToLower());
        }

        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(a => 
                a.Name.Contains(search) || 
                (a.Code != null && a.Code.Contains(search)) ||
                (a.City != null && a.City.Contains(search)));
        }

        var total = await query.CountAsync();
        var agencies = await query
            .OrderBy(a => a.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new {
                a.Id, a.Name, a.Code, a.Division, a.Status,
                a.Address, a.City, a.State, a.ZipCode, a.Country,
                a.ContactName, ContactPhone = a.ContactPhone, ContactEmail = a.ContactEmail,
                a.OrganizationId,
                OrganizationName = a.Organization != null ? a.Organization.Name : null,
                Manager = a.Manager != null ? new { a.Manager.Id, a.Manager.Name } : null,
                RegionalManager = a.RegionalManager != null ? new { a.RegionalManager.Id, a.RegionalManager.Name } : null,
                EmployeeCount = _context.Users.Count(u => u.AgencyId == a.Id && u.Status == "active"),
                a.CreatedAt
            })
            .ToListAsync();

        return Ok(new
        {
            data = agencies,
            total,
            page,
            pageSize,
            totalPages = (int)Math.Ceiling(total / (double)pageSize)
        });
    }

    /// <summary>
    /// Get agency by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<Agency>> GetAgency(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var agency = await _context.Agencies
            .Include(a => a.Manager)
            .Include(a => a.RegionalManager)
            .Include(a => a.Organization)
            .Include(a => a.Terminals)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (agency == null)
        {
            return NotFound(new { message = "Agency not found" });
        }

        // DATA ISOLATION
        if (user.AgencyId.HasValue && user.AgencyId.Value != id)
        {
            return Forbid();
        }

        return Ok(agency);
    }

    /// <summary>
    /// Create new agency (corporate only)
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult<Agency>> CreateAgency([FromBody] Agency agency)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        // Corporate users only
        if (user.SatelliteId.HasValue || user.AgencyId.HasValue || user.TerminalId.HasValue)
        {
            return Forbid();
        }

        if (agency.OrganizationId == 0)
        {
            agency.OrganizationId = user.OrganizationId.Value;
        }

        if (!string.IsNullOrEmpty(agency.Code))
        {
            var exists = await _context.Agencies.AnyAsync(a => a.Code == agency.Code);
            if (exists)
                return Conflict(new { message = $"Agency with code '{agency.Code}' already exists" });
        }

        agency.CreatedAt = DateTime.UtcNow;
        agency.UpdatedAt = DateTime.UtcNow;
        agency.CreatedBy = user.Id;

        _context.Agencies.Add(agency);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAgency), new { id = agency.Id }, agency);
    }

    /// <summary>
    /// Update agency (corporate and agency manager can edit)
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<Agency>> UpdateAgency(int id, [FromBody] Agency input)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var agency = await _context.Agencies.FindAsync(id);
        if (agency == null)
        {
            return NotFound(new { message = "Agency not found" });
        }

        // AUTHORIZATION
        var isCorporate = user.SatelliteId == null && user.AgencyId == null && user.TerminalId == null;
        var isAgencyManager = user.AgencyId == id && (user.Role == "admin" || agency.ManagerUserId == user.Id);
        
        if (!isCorporate && !isAgencyManager)
        {
            return Forbid();
        }

        // Update all fields
        agency.Name = input.Name;
        agency.Code = input.Code;
        agency.Division = input.Division;
        agency.Description = input.Description;
        agency.Status = input.Status;
        agency.Address = input.Address;
        agency.AddressLine2 = input.AddressLine2;
        agency.City = input.City;
        agency.State = input.State;
        agency.ZipCode = input.ZipCode;
        agency.Country = input.Country;
        agency.Latitude = input.Latitude;
        agency.Longitude = input.Longitude;
        agency.Timezone = input.Timezone;
        agency.ContactName = input.ContactName;
        agency.ContactEmail = input.ContactEmail;
        agency.ContactPhone = input.ContactPhone;
        agency.FaxNumber = input.FaxNumber;
        agency.ManagerUserId = input.ManagerUserId;
        agency.RegionalManagerUserId = input.RegionalManagerUserId;
        agency.EmployeeCount = input.EmployeeCount;
        agency.OperatingHours = input.OperatingHours;
        agency.ServiceArea = input.ServiceArea;
        agency.ServiceTypes = input.ServiceTypes;
        agency.MonthlyBudget = input.MonthlyBudget;
        agency.QuarterlyBudget = input.QuarterlyBudget;
        agency.AnnualBudget = input.AnnualBudget;
        agency.TargetMarginPercent = input.TargetMarginPercent;
        agency.CostCenter = input.CostCenter;
        agency.ProfitCenter = input.ProfitCenter;
        agency.OnTimePerformance = input.OnTimePerformance;
        agency.ActiveShipmentsCount = input.ActiveShipmentsCount;
        agency.MonthlyShipmentGoal = input.MonthlyShipmentGoal;
        agency.LogoBase64 = input.LogoBase64;
        agency.PrimaryColor = input.PrimaryColor;
        agency.UpdatedAt = DateTime.UtcNow;
        agency.UpdatedBy = user.Id;

        await _context.SaveChangesAsync();

        return Ok(agency);
    }

    /// <summary>
    /// Delete agency (corporate only)
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult> DeleteAgency(int id)
    {
        var agency = await _context.Agencies.FindAsync(id);
        if (agency == null)
        {
            return NotFound(new { message = "Agency not found" });
        }

        // Check dependencies
        var hasUsers = await _context.Users.AnyAsync(u => u.AgencyId == id);
        if (hasUsers)
        {
            return BadRequest(new { message = "Cannot delete agency with assigned users. Please reassign users first." });
        }

        _context.Agencies.Remove(agency);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// Get agency statistics
    /// </summary>
    [HttpGet("{id}/stats")]
    public async Task<ActionResult<object>> GetAgencyStats(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        // Verify access
        if (user.AgencyId.HasValue && user.AgencyId.Value != id)
        {
            return Forbid();
        }

        var userCount = await _context.Users.CountAsync(u => u.AgencyId == id);
        var terminalCount = await _context.Terminals.CountAsync(t => t.AgencyId == id);

        return Ok(new
        {
            users = userCount,
            terminals = terminalCount,
        });
    }
}


