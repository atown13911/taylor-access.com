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
public class DriversController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<DriversController> _logger;
    private readonly CurrentUserService _currentUserService;
    private readonly IAuditService _auditService;

    public DriversController(TaylorAccessDbContext context, ILogger<DriversController> logger, CurrentUserService currentUserService, IAuditService auditService)
    {
        _context = context;
        _logger = logger;
        _currentUserService = currentUserService;
        _auditService = auditService;
    }

    /// <summary>
    /// Get all drivers with optional filtering
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetDrivers(
        [FromQuery] string? status,
        [FromQuery] bool? isOnline,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 25)
    {
        var (orgId, user, orgErr) = await _currentUserService.ResolveOrgFilterAsync();
        if (orgErr != null) return Unauthorized(new { message = orgErr });

        var query = _context.Drivers
            .AsNoTracking()
            .Include(d => d.Division)
            .Include(d => d.DriverTerminal)
            .AsQueryable();

        // Organization filter (product_owner/superadmin see all)
        var isSuperAdmin = user!.Role == "superadmin" || user.Role == "product_owner";
        query = query.Where(d => !orgId.HasValue || d.OrganizationId == orgId);

        // MULTI-TENANT DATA ISOLATION: Filter by user's entity (skip for admin roles and fleet_manager)
        if (!isSuperAdmin && user.Role != "fleet_manager" && user.Role != "admin")
        {
            if (user.SatelliteId.HasValue)
                query = query.Where(d => d.SatelliteId == user.SatelliteId.Value);
            else if (user.AgencyId.HasValue)
                query = query.Where(d => d.AgencyId == user.AgencyId.Value);
            else if (user.TerminalId.HasValue)
                query = query.Where(d => d.HomeTerminalId == user.TerminalId.Value);
        }

        if (!string.IsNullOrEmpty(status))
            query = query.Where(d => d.Status == status);

        if (isOnline.HasValue)
            query = query.Where(d => d.IsOnline == isOnline.Value);

        if (!string.IsNullOrEmpty(search))
            query = query.Where(d => 
                d.Name.Contains(search) || 
                (d.Email != null && d.Email.Contains(search)) ||
                (d.Phone != null && d.Phone.Contains(search)));

        var total = await query.CountAsync();
        var drivers = await query
            .OrderBy(d => d.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .ToListAsync();

        return Ok(new
        {
            data = drivers,
            total,
            page,
            limit,
            totalPages = (int)Math.Ceiling((double)total / limit)
        });
    }

    /// <summary>
    /// Get a single driver by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<Driver>> GetDriver(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();
        var isSA = user.Role == "superadmin" || user.Role == "product_owner";

        var driver = await _context.Drivers
            .Include(d => d.Division)
            .Include(d => d.DriverTerminal)
            .Include(d => d.AddressRef)
            .FirstOrDefaultAsync(d => d.Id == id && (isSA || d.OrganizationId == (user.OrganizationId ?? 0)));

        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        return Ok(new { data = driver });
    }

    /// <summary>
    /// Create a new driver
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<Driver>> CreateDriver([FromBody] CreateDriverRequest request)
    {
        // Input validation
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Full Name is required" });
        if (string.IsNullOrWhiteSpace(request.Phone))
            return BadRequest(new { error = "Phone number is required" });

        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        // Resolve org: direct property first, then query UserOrganizations table
        var orgId = user.OrganizationId ?? 0;
        if (orgId == 0)
        {
            var orgIds = await _currentUserService.GetUserOrganizationIdsAsync();
            orgId = orgIds.FirstOrDefault();
        }
        if (orgId == 0)
            return BadRequest(new { error = "Cannot create driver — no organization assigned to your account. Contact an admin." });

        // Verify the organization actually exists in the DB
        var orgExists = await _context.Organizations.AnyAsync(o => o.Id == orgId);
        if (!orgExists)
            return BadRequest(new { error = $"Organization (ID: {orgId}) not found. Contact an admin." });

        try
        {
            var driver = new Driver
            {
                OrganizationId = orgId,
                DivisionId = request.DivisionId,
                DriverTerminalId = request.DriverTerminalId,
                Name = request.Name,
                Email = request.Email,
                Phone = request.Phone,
                // License Info
                LicenseNumber = request.LicenseNumber,
                LicenseClass = request.LicenseClass,
                LicenseState = request.LicenseState,
                LicenseExpiry = request.LicenseExpiry,
                MedicalCardExpiry = request.MedicalCardExpiry,
                DateOfBirth = request.DateOfBirth,
                // Status
                Status = request.Status ?? "available",
                DriverType = request.DriverType,
                // Emergency Contact
                EmergencyContactName = request.EmergencyContactName ?? request.EmergencyContact,
                EmergencyContactPhone = request.EmergencyContactPhone ?? request.EmergencyPhone,
                // Employment
                HireDate = request.HireDate,
                PayRate = request.PayRate,
                PayType = request.PayType,
                // Other
                PhotoUrl = request.PhotoUrl,
                Notes = request.Notes
            };

            // Create Address record if address fields provided
            if (!string.IsNullOrEmpty(request.Address) || !string.IsNullOrEmpty(request.City))
            {
                var addr = new Address
                {
                    Name = request.Name ?? "Home",
                    Street1 = request.Address ?? "",
                    City = request.City ?? "",
                    State = request.State ?? "",
                    ZipCode = request.ZipCode ?? request.Zip ?? ""
                };
                _context.Set<Address>().Add(addr);
                await _context.SaveChangesAsync();
                driver.AddressId = addr.Id;
            }

            _context.Drivers.Add(driver);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Created driver {Name} in org {OrgId}", driver.Name, orgId);
            
            await _auditService.LogAsync(AuditActions.Create, "Driver", driver.Id, 
                $"Created driver {driver.Name} - {driver.LicenseNumber}");

            return CreatedAtAction(nameof(GetDriver), new { id = driver.Id }, new { data = driver });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create driver {Name}", request.Name);
            return StatusCode(500, new { error = $"Failed to create driver: {ex.InnerException?.Message ?? ex.Message}" });
        }
    }

    /// <summary>
    /// Update a driver
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<Driver>> UpdateDriver(int id, [FromBody] UpdateDriverRequest request)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        // Basic Info
        if (!string.IsNullOrEmpty(request.Name)) driver.Name = request.Name;
        if (request.Email != null) driver.Email = request.Email;
        if (request.Phone != null) driver.Phone = request.Phone;
        
        // License Info
        if (request.LicenseNumber != null) driver.LicenseNumber = request.LicenseNumber;
        if (request.LicenseClass != null) driver.LicenseClass = request.LicenseClass;
        if (request.LicenseState != null) driver.LicenseState = request.LicenseState;
        if (request.LicenseExpiry.HasValue) driver.LicenseExpiry = request.LicenseExpiry;
        if (request.MedicalCardExpiry.HasValue) driver.MedicalCardExpiry = request.MedicalCardExpiry;
        if (request.DateOfBirth.HasValue) driver.DateOfBirth = request.DateOfBirth;
        
        if (request.DivisionId.HasValue) driver.DivisionId = request.DivisionId.Value == 0 ? null : request.DivisionId;
        if (request.DriverTerminalId.HasValue) driver.DriverTerminalId = request.DriverTerminalId.Value == 0 ? null : request.DriverTerminalId;
        
        // Status
        if (!string.IsNullOrEmpty(request.Status)) driver.Status = request.Status;
        if (request.IsOnline.HasValue) driver.IsOnline = request.IsOnline.Value;
        if (request.DriverType != null) driver.DriverType = request.DriverType;
        
        // Address: create or update the linked Address record
        var hasAddressFields = request.Address != null || request.City != null || request.State != null || request.ZipCode != null || request.Zip != null;
        if (hasAddressFields)
        {
            if (driver.AddressId.HasValue)
            {
                var addr = await _context.Set<Address>().FindAsync(driver.AddressId.Value);
                if (addr != null)
                {
                    if (request.Address != null) addr.Street1 = request.Address;
                    if (request.City != null) addr.City = request.City;
                    if (request.State != null) addr.State = request.State;
                    if (request.ZipCode != null) addr.ZipCode = request.ZipCode;
                    if (request.Zip != null) addr.ZipCode = request.Zip;
                    addr.UpdatedAt = DateTime.UtcNow;
                }
            }
            else
            {
                var addr = new Address
                {
                    Name = driver.Name ?? "Home",
                    Street1 = request.Address ?? "",
                    City = request.City ?? "",
                    State = request.State ?? "",
                    ZipCode = request.ZipCode ?? request.Zip ?? ""
                };
                _context.Set<Address>().Add(addr);
                await _context.SaveChangesAsync();
                driver.AddressId = addr.Id;
            }
        }
        
        // Emergency Contact (support both naming conventions)
        if (request.EmergencyContactName != null) driver.EmergencyContactName = request.EmergencyContactName;
        if (request.EmergencyContact != null) driver.EmergencyContactName = request.EmergencyContact;
        if (request.EmergencyContactPhone != null) driver.EmergencyContactPhone = request.EmergencyContactPhone;
        if (request.EmergencyPhone != null) driver.EmergencyContactPhone = request.EmergencyPhone;
        
        // Employment
        if (request.HireDate.HasValue) driver.HireDate = request.HireDate;
        if (request.TerminationDate.HasValue) driver.TerminationDate = request.TerminationDate;
        if (request.PayRate.HasValue) driver.PayRate = request.PayRate;
        if (request.PayType != null) driver.PayType = request.PayType;
        
        // GPS
        if (request.Latitude.HasValue) driver.Latitude = request.Latitude;
        if (request.Longitude.HasValue) driver.Longitude = request.Longitude;
        
        // Other
        if (request.PhotoUrl != null) driver.PhotoUrl = request.PhotoUrl;
        if (request.Notes != null) driver.Notes = request.Notes;

        driver.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated driver {Name} (ID: {Id})", driver.Name, driver.Id);
        
        await _auditService.LogAsync(AuditActions.Update, "Driver", driver.Id, 
            $"Updated driver {driver.Name}");

        return Ok(new { data = driver });
    }

    /// <summary>
    /// Delete a driver
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteDriver(int id)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        await _auditService.LogAsync(AuditActions.Delete, "Driver", driver.Id, 
            $"Deleted driver {driver.Name}");

        _context.Drivers.Remove(driver);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Deleted driver {Name}", driver.Name);

        return Ok(new { deleted = true });
    }

    /// <summary>
    /// Toggle driver online/offline status
    /// </summary>
    [HttpPost("{id}/toggle-online")]
    public async Task<ActionResult<Driver>> ToggleOnline(int id)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        driver.IsOnline = !driver.IsOnline;
        driver.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = driver });
    }

    /// <summary>
    /// Update driver location (GPS)
    /// </summary>
    [HttpPost("{id}/location")]
    public async Task<ActionResult<Driver>> UpdateLocation(int id, [FromBody] UpdateLocationRequest request)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        driver.Latitude = request.Latitude;
        driver.Longitude = request.Longitude;
        driver.LastLocationUpdate = DateTime.UtcNow;
        driver.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = driver });
    }

    /// <summary>
    /// Simulate driver movement (for testing)
    /// </summary>
    [HttpPost("{id}/simulate")]
    public async Task<ActionResult<Driver>> SimulateMovement(int id, [FromBody] SimulateRequest request)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        // Simulate random movement around current position
        var random = new Random();
        var latOffset = (decimal)(random.NextDouble() - 0.5) * 0.01m;
        var lngOffset = (decimal)(random.NextDouble() - 0.5) * 0.01m;

        driver.Latitude = (driver.Latitude ?? request.StartLatitude ?? 34.0522m) + latOffset;
        driver.Longitude = (driver.Longitude ?? request.StartLongitude ?? -118.2437m) + lngOffset;
        driver.LastLocationUpdate = DateTime.UtcNow;
        driver.IsOnline = true;
        driver.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = driver });
    }
}

// Request DTOs
public record CreateDriverRequest(
    string Name,
    string? Email,
    string? Phone,
    int? DivisionId,
    int? DriverTerminalId,
    string? LicenseNumber,
    string? LicenseClass,
    string? LicenseState,
    DateOnly? LicenseExpiry,
    DateOnly? MedicalCardExpiry,
    DateOnly? DateOfBirth,
    string? Status,
    string? DriverType,
    string? Address,
    string? City,
    string? State,
    string? ZipCode,
    string? Zip,
    string? EmergencyContactName,
    string? EmergencyContact,
    string? EmergencyContactPhone,
    string? EmergencyPhone,
    DateOnly? HireDate,
    decimal? PayRate,
    string? PayType,
    string? PhotoUrl,
    string? Notes
);

public record UpdateDriverRequest(
    string? Name,
    string? Email,
    string? Phone,
    int? DivisionId,
    int? DriverTerminalId,
    string? LicenseNumber,
    string? LicenseClass,
    string? LicenseState,
    DateOnly? LicenseExpiry,
    DateOnly? MedicalCardExpiry,
    DateOnly? DateOfBirth,
    string? Status,
    bool? IsOnline,
    string? DriverType,
    string? Address,
    string? City,
    string? State,
    string? Zip,
    string? ZipCode,
    string? EmergencyContact,
    string? EmergencyContactName,
    string? EmergencyPhone,
    string? EmergencyContactPhone,
    DateOnly? HireDate,
    DateOnly? TerminationDate,
    decimal? PayRate,
    string? PayType,
    decimal? Latitude,
    decimal? Longitude,
    string? PhotoUrl,
    string? Notes
);

public record UpdateLocationRequest(decimal Latitude, decimal Longitude);

public record SimulateRequest(decimal? StartLatitude, decimal? StartLongitude);




