using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/satellites")]
[Authorize]
public class SatellitesController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public SatellitesController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get all satellites (corporate users see all, satellite users see only theirs, adminReport bypasses all filters)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetSatellites(
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
        
        var query = _context.Satellites
            .Include(s => s.Manager)
            .Include(s => s.Organization)
            .AsQueryable();

        // ADMIN REPORTS: Bypass all filtering (product_owner or superadmin)
        if (adminReport && includeAll && hasUnrestrictedAccess)
        {
            // No user context filtering - apply only explicit filters
            if (organizationId.HasValue)
                query = query.Where(s => s.OrganizationId == organizationId.Value);
        }
        // NORMAL MODE: DATA ISOLATION
        else if (hasUnrestrictedAccess)
        {
            // product_owner/superadmin see everything, optionally filtered by org
            if (organizationId.HasValue)
                query = query.Where(s => s.OrganizationId == organizationId.Value);
        }
        else
        {
            // Satellite users can only see their own satellite
            if (user.SatelliteId.HasValue)
            {
                query = query.Where(s => s.Id == user.SatelliteId.Value);
            }
            // Corporate users see all satellites in their org
            else if (user.OrganizationId.HasValue)
            {
                query = query.Where(s => s.OrganizationId == user.OrganizationId.Value);
            }
        }

        // Filters
        if (!string.IsNullOrEmpty(status))
        {
            query = query.Where(s => s.Status.ToLower() == status.ToLower());
        }

        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(s => 
                s.Name.Contains(search) || 
                (s.Code != null && s.Code.Contains(search)) ||
                (s.City != null && s.City.Contains(search)));
        }

        var total = await query.CountAsync();
        var satellites = await query
            .OrderBy(s => s.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new
        {
            data = satellites,
            total,
            page,
            pageSize,
            totalPages = (int)Math.Ceiling(total / (double)pageSize)
        });
    }

    /// <summary>
    /// Get satellite by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<Satellite>> GetSatellite(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var satellite = await _context.Satellites
            .Include(s => s.Manager)
            .Include(s => s.Organization)
            .Include(s => s.Terminals)
            .FirstOrDefaultAsync(s => s.Id == id);

        if (satellite == null)
        {
            return NotFound(new { message = "Satellite not found" });
        }

        // DATA ISOLATION: Verify user can access this satellite
        if (user.SatelliteId.HasValue && user.SatelliteId.Value != id)
        {
            return Forbid();
        }

        return Ok(satellite);
    }

    /// <summary>
    /// Create new satellite (corporate only)
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult<Satellite>> CreateSatellite([FromBody] Satellite satellite)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        // Set organization from current user (unless superadmin specifies)
        if (satellite.OrganizationId == 0)
        {
            satellite.OrganizationId = user.OrganizationId.Value;
        }

        satellite.CreatedAt = DateTime.UtcNow;
        satellite.UpdatedAt = DateTime.UtcNow;
        satellite.CreatedBy = user.Id;

        _context.Satellites.Add(satellite);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetSatellite), new { id = satellite.Id }, satellite);
    }

    /// <summary>
    /// Update satellite (corporate and satellite manager can edit)
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<Satellite>> UpdateSatellite(int id, [FromBody] Satellite input)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var satellite = await _context.Satellites.FindAsync(id);
        if (satellite == null)
        {
            return NotFound(new { message = "Satellite not found" });
        }

        // AUTHORIZATION: Only corporate or satellite manager can update
        var isCorporate = user.SatelliteId == null && user.AgencyId == null && user.TerminalId == null;
        var isSatelliteManager = user.SatelliteId == id && (user.Role == "admin" || satellite.ManagerUserId == user.Id);
        
        if (!isCorporate && !isSatelliteManager)
        {
            return Forbid();
        }

        // Update fields
        satellite.Name = input.Name;
        satellite.Code = input.Code;
        satellite.DbaName = input.DbaName;
        satellite.Description = input.Description;
        satellite.Status = input.Status;
        satellite.LegalBusinessName = input.LegalBusinessName;
        satellite.BusinessStructure = input.BusinessStructure;
        satellite.EinTaxId = input.EinTaxId;
        satellite.StateTaxId = input.StateTaxId;
        satellite.BusinessLicenseNumber = input.BusinessLicenseNumber;
        satellite.StateOfIncorporation = input.StateOfIncorporation;
        satellite.IncorporationDate = input.IncorporationDate;
        satellite.Address = input.Address;
        satellite.AddressLine2 = input.AddressLine2;
        satellite.City = input.City;
        satellite.State = input.State;
        satellite.ZipCode = input.ZipCode;
        satellite.Country = input.Country;
        satellite.Latitude = input.Latitude;
        satellite.Longitude = input.Longitude;
        satellite.Timezone = input.Timezone;
        satellite.ContactName = input.ContactName;
        satellite.ContactEmail = input.ContactEmail;
        satellite.ContactPhone = input.ContactPhone;
        satellite.FaxNumber = input.FaxNumber;
        satellite.Website = input.Website;
        satellite.ManagerUserId = input.ManagerUserId;
        satellite.OperatingHours = input.OperatingHours;
        satellite.EmployeeCount = input.EmployeeCount;
        satellite.ServiceArea = input.ServiceArea;
        satellite.CommissionRate = input.CommissionRate;
        satellite.RevenueSharePercent = input.RevenueSharePercent;
        satellite.BankName = input.BankName;
        satellite.AccountNumber = input.AccountNumber;
        satellite.RoutingNumber = input.RoutingNumber;
        satellite.PaymentTerms = input.PaymentTerms;
        satellite.DotNumber = input.DotNumber;
        satellite.McNumber = input.McNumber;
        satellite.InsuranceCarrier = input.InsuranceCarrier;
        satellite.InsurancePolicyNumber = input.InsurancePolicyNumber;
        satellite.CargoInsuranceLimit = input.CargoInsuranceLimit;
        satellite.LiabilityInsuranceLimit = input.LiabilityInsuranceLimit;
        satellite.InsuranceExpirationDate = input.InsuranceExpirationDate;
        satellite.LogoBase64 = input.LogoBase64;
        satellite.PrimaryColor = input.PrimaryColor;
        satellite.SecondaryColor = input.SecondaryColor;
        satellite.ContractStartDate = input.ContractStartDate;
        satellite.ContractEndDate = input.ContractEndDate;
        satellite.ContractType = input.ContractType;
        satellite.ContractTerms = input.ContractTerms;
        satellite.UpdatedAt = DateTime.UtcNow;
        satellite.UpdatedBy = user.Id;

        await _context.SaveChangesAsync();

        return Ok(satellite);
    }

    /// <summary>
    /// Delete satellite (corporate only)
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult> DeleteSatellite(int id)
    {
        var satellite = await _context.Satellites.FindAsync(id);
        if (satellite == null)
        {
            return NotFound(new { message = "Satellite not found" });
        }

        // Check if satellite has users
        var hasUsers = await _context.Users.AnyAsync(u => u.SatelliteId == id);
        if (hasUsers)
        {
            return BadRequest(new { message = "Cannot delete satellite with assigned users. Please reassign users first." });
        }

        _context.Satellites.Remove(satellite);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// Get satellite statistics
    /// </summary>
    [HttpGet("{id}/stats")]
    public async Task<ActionResult<object>> GetSatelliteStats(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        // Verify access
        if (user.SatelliteId.HasValue && user.SatelliteId.Value != id)
        {
            return Forbid();
        }

        var userCount = await _context.Users.CountAsync(u => u.SatelliteId == id);
        var terminalCount = await _context.Terminals.CountAsync(t => t.SatelliteId == id);

        return Ok(new
        {
            users = userCount,
            terminals = terminalCount,
        });
    }

    // ============ SATELLITE OWNERS ============

    [HttpGet("{satelliteId}/owners")]
    public async Task<ActionResult<object>> GetOwners(int satelliteId)
    {
        var owners = await _context.SatelliteOwners
            .Where(o => o.SatelliteId == satelliteId)
            .Include(o => o.User)
            .OrderByDescending(o => o.OwnershipPercent)
            .Select(o => new
            {
                o.Id, o.SatelliteId, o.UserId, o.Name, o.Role, o.OwnershipPercent,
                o.Email, o.Phone, o.CreatedAt,
                userName = o.User != null ? o.User.Name : null,
                userEmail = o.User != null ? o.User.Email : null
            })
            .ToListAsync();

        return Ok(new { data = owners });
    }

    [HttpPost("{satelliteId}/owners")]
    public async Task<ActionResult<object>> AddOwner(int satelliteId, [FromBody] AddOwnerRequest req)
    {
        var satellite = await _context.Satellites.FindAsync(satelliteId);
        if (satellite == null) return NotFound(new { error = "Satellite not found" });

        var owner = new SatelliteOwner
        {
            SatelliteId = satelliteId,
            UserId = req.UserId,
            Name = req.Name ?? "",
            Role = req.Role ?? "owner",
            OwnershipPercent = req.OwnershipPercent,
            Email = req.Email,
            Phone = req.Phone
        };

        if (owner.UserId.HasValue)
        {
            var user = await _context.Users.FindAsync(owner.UserId.Value);
            if (user != null && string.IsNullOrEmpty(owner.Name))
                owner.Name = user.Name;
        }

        _context.SatelliteOwners.Add(owner);
        await _context.SaveChangesAsync();

        return Ok(new { data = owner, message = "Owner added" });
    }

    [HttpPut("{satelliteId}/owners/{ownerId}")]
    public async Task<ActionResult<object>> UpdateOwner(int satelliteId, int ownerId, [FromBody] AddOwnerRequest req)
    {
        var owner = await _context.SatelliteOwners.FirstOrDefaultAsync(o => o.Id == ownerId && o.SatelliteId == satelliteId);
        if (owner == null) return NotFound(new { error = "Owner not found" });

        if (req.Name != null) owner.Name = req.Name;
        if (req.Role != null) owner.Role = req.Role;
        owner.OwnershipPercent = req.OwnershipPercent;
        if (req.Email != null) owner.Email = req.Email;
        if (req.Phone != null) owner.Phone = req.Phone;
        if (req.UserId.HasValue) owner.UserId = req.UserId;

        await _context.SaveChangesAsync();
        return Ok(new { data = owner, message = "Owner updated" });
    }

    [HttpDelete("{satelliteId}/owners/{ownerId}")]
    public async Task<ActionResult> DeleteOwner(int satelliteId, int ownerId)
    {
        var owner = await _context.SatelliteOwners.FirstOrDefaultAsync(o => o.Id == ownerId && o.SatelliteId == satelliteId);
        if (owner == null) return NotFound(new { error = "Owner not found" });

        _context.SatelliteOwners.Remove(owner);
        await _context.SaveChangesAsync();
        return Ok(new { deleted = true });
    }
}

public record AddOwnerRequest(string? Name, string? Role, decimal OwnershipPercent, string? Email, string? Phone, int? UserId);


