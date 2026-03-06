using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/carriers")]
[Authorize]
public class CarriersController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;
    private readonly IAuditService _auditService;

    public CarriersController(TaylorAccessDbContext context, CurrentUserService currentUserService, IAuditService auditService)
    {
        _context = context;
        _currentUserService = currentUserService;
        _auditService = auditService;
    }

    [HttpGet]
    public async Task<ActionResult> GetCarriers(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] int limit = 500)
    {
        var query = _context.Carriers.AsNoTracking().AsQueryable();

        if (!string.IsNullOrEmpty(search))
        {
            var s = search.ToLower();
            query = query.Where(c =>
                c.Name.ToLower().Contains(s) ||
                (c.McNumber != null && c.McNumber.ToLower().Contains(s)) ||
                (c.DotNumber != null && c.DotNumber.ToLower().Contains(s)) ||
                (c.City != null && c.City.ToLower().Contains(s))
            );
        }

        if (!string.IsNullOrEmpty(status))
            query = query.Where(c => c.Status == status);

        var carriers = await query.OrderBy(c => c.Name).Take(limit).ToListAsync();
        return Ok(new { data = carriers });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult> GetCarrier(int id)
    {
        var carrier = await _context.Carriers.FindAsync(id);
        if (carrier == null) return NotFound(new { error = "Carrier not found" });
        return Ok(new { data = carrier });
    }

    [HttpPost]
    public async Task<ActionResult> CreateCarrier([FromBody] Carrier carrier)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId != null) carrier.OrganizationId = user.OrganizationId.Value;

        carrier.CreatedAt = DateTime.UtcNow;
        carrier.UpdatedAt = DateTime.UtcNow;

        _context.Carriers.Add(carrier);
        await _context.SaveChangesAsync();
        await _auditService.LogAsync("create", "Carrier", carrier.Id, $"Created carrier {carrier.Name} (MC: {carrier.McNumber})");

        return Ok(new { data = carrier });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult> UpdateCarrier(int id, [FromBody] Carrier update)
    {
        var carrier = await _context.Carriers.FindAsync(id);
        if (carrier == null) return NotFound(new { error = "Carrier not found" });

        carrier.Name = update.Name ?? carrier.Name;
        carrier.McNumber = update.McNumber ?? carrier.McNumber;
        carrier.DotNumber = update.DotNumber ?? carrier.DotNumber;
        carrier.ScacCode = update.ScacCode ?? carrier.ScacCode;
        carrier.ContactName = update.ContactName ?? carrier.ContactName;
        carrier.Phone = update.Phone ?? carrier.Phone;
        carrier.Email = update.Email ?? carrier.Email;
        carrier.Address = update.Address ?? carrier.Address;
        carrier.City = update.City ?? carrier.City;
        carrier.State = update.State ?? carrier.State;
        carrier.ZipCode = update.ZipCode ?? carrier.ZipCode;
        carrier.InsuranceProvider = update.InsuranceProvider ?? carrier.InsuranceProvider;
        if (update.InsuranceExpiry.HasValue) carrier.InsuranceExpiry = update.InsuranceExpiry;
        if (update.InsuranceAmount.HasValue) carrier.InsuranceAmount = update.InsuranceAmount;
        carrier.PaymentTerms = update.PaymentTerms ?? carrier.PaymentTerms;
        carrier.Rating = update.Rating;
        carrier.SafetyRating = update.SafetyRating ?? carrier.SafetyRating;
        carrier.CsaScore = update.CsaScore;
        carrier.Status = update.Status ?? carrier.Status;
        carrier.TotalLoads = update.TotalLoads;
        carrier.OnTimeRate = update.OnTimeRate;
        carrier.AvgRate = update.AvgRate;
        carrier.Notes = update.Notes ?? carrier.Notes;
        carrier.IsActive = update.IsActive;
        carrier.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        await _auditService.LogAsync("update", "Carrier", carrier.Id, $"Updated carrier {carrier.Name}");

        return Ok(new { data = carrier });
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteCarrier(int id)
    {
        var carrier = await _context.Carriers.FindAsync(id);
        if (carrier == null) return NotFound(new { error = "Carrier not found" });

        _context.Carriers.Remove(carrier);
        await _context.SaveChangesAsync();
        await _auditService.LogAsync("delete", "Carrier", id, $"Deleted carrier {carrier.Name}");

        return Ok(new { message = $"Carrier '{carrier.Name}' deleted" });
    }
}
