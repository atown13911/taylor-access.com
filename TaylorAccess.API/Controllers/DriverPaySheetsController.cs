using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/driver-pay-sheets")]
[Authorize]
public class DriverPaySheetsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<DriverPaySheetsController> _logger;
    private readonly CurrentUserService _currentUserService;

    public DriverPaySheetsController(TaylorAccessDbContext context, ILogger<DriverPaySheetsController> logger, CurrentUserService currentUserService)
    {
        _context = context;
        _logger = logger;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetDriverPaySheets(
        [FromQuery] int? driverId,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 25)
    {
        // Get current user
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var query = _context.DriverPaySheets
            .Where(p => p.OrganizationId == user.OrganizationId.Value)
            .Include(p => p.Driver)
            .Include(p => p.ApprovedBy)
            .AsQueryable();

        // MULTI-TENANT: Driver pay sheets inherit entity from Driver
        if (user.SatelliteId.HasValue || user.AgencyId.HasValue)
        {
            query = query.Where(p => _context.Drivers.Any(d => 
                d.Id == p.DriverId && 
                (user.SatelliteId.HasValue ? d.SatelliteId == user.SatelliteId.GetValueOrDefault() : d.AgencyId == user.AgencyId.GetValueOrDefault())
            ));
        }

        if (driverId.HasValue)
            query = query.Where(p => p.DriverId == driverId);
        if (!string.IsNullOrEmpty(status))
            query = query.Where(p => p.Status == status);

        var total = await query.CountAsync();
        var paySheets = await query
            .OrderByDescending(p => p.PeriodEnd)
            .Skip((page - 1) * limit)
            .Take(limit)
            .ToListAsync();

        return Ok(new { data = paySheets, total, page, limit });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<DriverPaySheet>> GetDriverPaySheet(int id)
    {
        // Get current user
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var paySheet = await _context.DriverPaySheets
            .Where(p => p.OrganizationId == user.OrganizationId.Value)
            .Include(p => p.Driver)
            .Include(p => p.ApprovedBy)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (paySheet == null)
            return NotFound(new { error = "Pay sheet not found" });

        // MULTI-TENANT: Verify access through driver entity
        if (user.SatelliteId.HasValue || user.AgencyId.HasValue)
        {
            var hasAccess = await _context.Drivers.AnyAsync(d => 
                d.Id == paySheet.DriverId && 
                (user.SatelliteId.HasValue ? d.SatelliteId == user.SatelliteId.GetValueOrDefault() : d.AgencyId == user.AgencyId.GetValueOrDefault())
            );

            if (!hasAccess)
                return NotFound(new { error = "Pay sheet not found" });
        }

        return Ok(new { data = paySheet });
    }

    [HttpPost]
    public async Task<ActionResult<DriverPaySheet>> CreateDriverPaySheet([FromBody] DriverPaySheet paySheet)
    {
        // Get current user
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        // Verify driver belongs to user's organization
        var driver = await _context.Drivers
            .FirstOrDefaultAsync(d => d.Id == paySheet.DriverId && d.OrganizationId == user.OrganizationId.Value);

        if (driver == null)
            return BadRequest(new { error = "Driver not found or access denied" });

        // MULTI-TENANT: Verify user has access to this driver
        if (user.SatelliteId.HasValue && driver.SatelliteId != user.SatelliteId.GetValueOrDefault())
            return BadRequest(new { error = "Cannot create pay sheet for driver from different satellite" });
        if (user.AgencyId.HasValue && driver.AgencyId != user.AgencyId.GetValueOrDefault())
            return BadRequest(new { error = "Cannot create pay sheet for driver from different agency" });

        paySheet.Id = 0;
        paySheet.OrganizationId = user.OrganizationId.Value;
        paySheet.PaySheetNumber = DriverPaySheet.GenerateNumber();
        paySheet.CreatedAt = DateTime.UtcNow;
        paySheet.UpdatedAt = DateTime.UtcNow;

        // Calculate totals
        paySheet.MileagePay = paySheet.TotalMiles * paySheet.RatePerMile;
        paySheet.StopPay = paySheet.TotalStops * paySheet.RatePerStop;
        paySheet.HourlyPay = paySheet.HourlyHours * paySheet.HourlyRate;
        paySheet.PercentagePay = paySheet.PercentageLoads * paySheet.PercentageRate;
        paySheet.GrossPay = paySheet.MileagePay + paySheet.StopPay + paySheet.HourlyPay + paySheet.PercentagePay + paySheet.Bonus + paySheet.Reimbursements;
        paySheet.NetPay = paySheet.GrossPay - paySheet.TotalDeductions;

        _context.DriverPaySheets.Add(paySheet);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created pay sheet {PaySheetNumber} for driver {DriverId}", paySheet.PaySheetNumber, paySheet.DriverId);

        return CreatedAtAction(nameof(GetDriverPaySheet), new { id = paySheet.Id }, new { data = paySheet });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<DriverPaySheet>> UpdateDriverPaySheet(int id, [FromBody] DriverPaySheet updated)
    {
        // Get current user
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var paySheet = await _context.DriverPaySheets
            .Include(p => p.Driver)
            .FirstOrDefaultAsync(p => p.Id == id && p.OrganizationId == user.OrganizationId.Value);

        if (paySheet == null)
            return NotFound(new { error = "Pay sheet not found" });

        // MULTI-TENANT: Verify access through driver entity
        if (user.SatelliteId.HasValue || user.AgencyId.HasValue)
        {
            var hasAccess = await _context.Drivers.AnyAsync(d => 
                d.Id == paySheet.DriverId && 
                (user.SatelliteId.HasValue ? d.SatelliteId == user.SatelliteId.GetValueOrDefault() : d.AgencyId == user.AgencyId.GetValueOrDefault())
            );

            if (!hasAccess)
                return NotFound(new { error = "Pay sheet not found" });
        }

        if (paySheet.Status == "paid")
            return BadRequest(new { error = "Cannot modify a paid pay sheet" });

        paySheet.PeriodStart = updated.PeriodStart;
        paySheet.PeriodEnd = updated.PeriodEnd;
        paySheet.TotalMiles = updated.TotalMiles;
        paySheet.RatePerMile = updated.RatePerMile;
        paySheet.TotalStops = updated.TotalStops;
        paySheet.RatePerStop = updated.RatePerStop;
        paySheet.HourlyHours = updated.HourlyHours;
        paySheet.HourlyRate = updated.HourlyRate;
        paySheet.PercentageLoads = updated.PercentageLoads;
        paySheet.PercentageRate = updated.PercentageRate;
        paySheet.Bonus = updated.Bonus;
        paySheet.Reimbursements = updated.Reimbursements;
        paySheet.Deductions = updated.Deductions;
        paySheet.TotalDeductions = updated.TotalDeductions;
        paySheet.Notes = updated.Notes;

        // Recalculate totals
        paySheet.MileagePay = paySheet.TotalMiles * paySheet.RatePerMile;
        paySheet.StopPay = paySheet.TotalStops * paySheet.RatePerStop;
        paySheet.HourlyPay = paySheet.HourlyHours * paySheet.HourlyRate;
        paySheet.PercentagePay = paySheet.PercentageLoads * paySheet.PercentageRate;
        paySheet.GrossPay = paySheet.MileagePay + paySheet.StopPay + paySheet.HourlyPay + paySheet.PercentagePay + paySheet.Bonus + paySheet.Reimbursements;
        paySheet.NetPay = paySheet.GrossPay - paySheet.TotalDeductions;
        paySheet.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = paySheet });
    }

    [HttpPost("{id}/submit")]
    public async Task<ActionResult<DriverPaySheet>> SubmitPaySheet(int id)
    {
        // Get current user
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var paySheet = await _context.DriverPaySheets
            .FirstOrDefaultAsync(p => p.Id == id && p.OrganizationId == user.OrganizationId.Value);

        if (paySheet == null)
            return NotFound(new { error = "Pay sheet not found" });

        // MULTI-TENANT: Verify access
        if (user.SatelliteId.HasValue || user.AgencyId.HasValue)
        {
            var hasAccess = await _context.Drivers.AnyAsync(d => 
                d.Id == paySheet.DriverId && 
                (user.SatelliteId.HasValue ? d.SatelliteId == user.SatelliteId.GetValueOrDefault() : d.AgencyId == user.AgencyId.GetValueOrDefault())
            );

            if (!hasAccess)
                return NotFound(new { error = "Pay sheet not found" });
        }

        if (paySheet.Status != "draft")
            return BadRequest(new { error = "Pay sheet has already been submitted" });

        paySheet.Status = "pending";
        paySheet.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = paySheet });
    }

    [HttpPost("{id}/approve")]
    public async Task<ActionResult<DriverPaySheet>> ApprovePaySheet(int id, [FromBody] ApprovePaySheetRequest? request)
    {
        // Get current user
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var paySheet = await _context.DriverPaySheets
            .FirstOrDefaultAsync(p => p.Id == id && p.OrganizationId == user.OrganizationId.Value);

        if (paySheet == null)
            return NotFound(new { error = "Pay sheet not found" });

        // MULTI-TENANT: Verify access
        if (user.SatelliteId.HasValue || user.AgencyId.HasValue)
        {
            var hasAccess = await _context.Drivers.AnyAsync(d => 
                d.Id == paySheet.DriverId && 
                (user.SatelliteId.HasValue ? d.SatelliteId == user.SatelliteId.GetValueOrDefault() : d.AgencyId == user.AgencyId.GetValueOrDefault())
            );

            if (!hasAccess)
                return NotFound(new { error = "Pay sheet not found" });
        }

        if (paySheet.Status != "pending")
            return BadRequest(new { error = "Pay sheet must be pending to approve" });

        paySheet.Status = "approved";
        paySheet.ApprovedById = request?.ApprovedById;
        paySheet.ApprovedAt = DateTime.UtcNow;
        paySheet.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Approved pay sheet {PaySheetNumber}", paySheet.PaySheetNumber);

        return Ok(new { data = paySheet });
    }

    [HttpPost("{id}/mark-paid")]
    public async Task<ActionResult<DriverPaySheet>> MarkPaid(int id, [FromBody] MarkPaidRequest? request)
    {
        // Get current user
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var paySheet = await _context.DriverPaySheets
            .FirstOrDefaultAsync(p => p.Id == id && p.OrganizationId == user.OrganizationId.Value);

        if (paySheet == null)
            return NotFound(new { error = "Pay sheet not found" });

        // MULTI-TENANT: Verify access
        if (user.SatelliteId.HasValue || user.AgencyId.HasValue)
        {
            var hasAccess = await _context.Drivers.AnyAsync(d => 
                d.Id == paySheet.DriverId && 
                (user.SatelliteId.HasValue ? d.SatelliteId == user.SatelliteId.GetValueOrDefault() : d.AgencyId == user.AgencyId.GetValueOrDefault())
            );

            if (!hasAccess)
                return NotFound(new { error = "Pay sheet not found" });
        }

        if (paySheet.Status != "approved")
            return BadRequest(new { error = "Pay sheet must be approved before marking paid" });

        paySheet.Status = "paid";
        paySheet.PaidAt = DateTime.UtcNow;
        paySheet.PaymentMethod = request?.PaymentMethod;
        paySheet.PaymentReference = request?.PaymentReference;
        paySheet.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Marked pay sheet {PaySheetNumber} as paid", paySheet.PaySheetNumber);

        return Ok(new { data = paySheet });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteDriverPaySheet(int id)
    {
        // Get current user
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var paySheet = await _context.DriverPaySheets
            .FirstOrDefaultAsync(p => p.Id == id && p.OrganizationId == user.OrganizationId.Value);

        if (paySheet == null)
            return NotFound(new { error = "Pay sheet not found" });

        // MULTI-TENANT: Verify access
        if (user.SatelliteId.HasValue || user.AgencyId.HasValue)
        {
            var hasAccess = await _context.Drivers.AnyAsync(d => 
                d.Id == paySheet.DriverId && 
                (user.SatelliteId.HasValue ? d.SatelliteId == user.SatelliteId.GetValueOrDefault() : d.AgencyId == user.AgencyId.GetValueOrDefault())
            );

            if (!hasAccess)
                return NotFound(new { error = "Pay sheet not found" });
        }

        if (paySheet.Status == "paid")
            return BadRequest(new { error = "Cannot delete a paid pay sheet" });

        _context.DriverPaySheets.Remove(paySheet);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }
}

public record ApprovePaySheetRequest(int? ApprovedById);
public record MarkPaidRequest(string? PaymentMethod, string? PaymentReference);




