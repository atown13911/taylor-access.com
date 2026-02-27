using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/driver-payments")]
[Authorize]
public class DriverPaymentsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<DriverPaymentsController> _logger;
    private readonly CurrentUserService _currentUserService;

    public DriverPaymentsController(TaylorAccessDbContext context, ILogger<DriverPaymentsController> logger, CurrentUserService currentUserService)
    {
        _context = context;
        _logger = logger;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetPayments([FromQuery] int? driverId, [FromQuery] int limit = 200)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var query = _context.DriverPayments
            .AsNoTracking()
            .Include(p => p.Driver)
            .AsQueryable();

        if (!user.IsProductOwner() && !user.IsSuperAdmin() && user.OrganizationId.HasValue)
            query = query.Where(p => p.OrganizationId == user.OrganizationId.Value);

        if (driverId.HasValue)
            query = query.Where(p => p.DriverId == driverId.Value);

        var payments = await query
            .OrderBy(p => p.Driver!.Name)
            .Take(limit)
            .Select(p => new
            {
                p.Id, p.DriverId,
                DriverName = p.Driver != null ? p.Driver.Name : null,
                p.OrganizationId, p.PaymentMethod,
                p.BankName, p.RoutingNumber, p.AccountNumber, p.AccountType,
                p.CardType, p.CardLastFour, p.CardHolderName,
                p.MailingAddress, p.Status, p.CreatedAt, p.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = payments });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetPayment(int id)
    {
        var payment = await _context.DriverPayments
            .Include(p => p.Driver)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (payment == null) return NotFound(new { error = "Payment method not found" });

        return Ok(new { data = payment });
    }

    [HttpPost]
    public async Task<ActionResult<object>> CreatePayment([FromBody] CreateDriverPaymentRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var orgId = user.OrganizationId ?? 0;
        if (orgId == 0)
        {
            var orgIds = await _currentUserService.GetUserOrganizationIdsAsync();
            orgId = orgIds.FirstOrDefault();
        }
        if (orgId == 0) return BadRequest(new { error = "No organization assigned" });

        var payment = new DriverPayment
        {
            DriverId = request.DriverId > 0 ? request.DriverId : null,
            OrganizationId = orgId,
            PaymentMethod = request.PaymentMethod ?? "direct_deposit",
            BankName = request.BankName,
            RoutingNumber = request.RoutingNumber,
            AccountNumber = request.AccountNumber,
            AccountType = request.AccountType,
            CardType = request.CardType,
            CardLastFour = request.CardLastFour,
            CardHolderName = request.CardHolderName,
            MailingAddress = request.MailingAddress,
            Status = request.Status ?? "active"
        };

        _context.DriverPayments.Add(payment);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created payment method {Method} for driver {DriverId}", payment.PaymentMethod, payment.DriverId);

        return CreatedAtAction(nameof(GetPayment), new { id = payment.Id }, new { data = payment });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<object>> UpdatePayment(int id, [FromBody] UpdateDriverPaymentRequest request)
    {
        var payment = await _context.DriverPayments.FindAsync(id);
        if (payment == null) return NotFound(new { error = "Payment method not found" });

        if (!string.IsNullOrEmpty(request.PaymentMethod)) payment.PaymentMethod = request.PaymentMethod;
        if (request.BankName != null) payment.BankName = request.BankName;
        if (request.RoutingNumber != null) payment.RoutingNumber = request.RoutingNumber;
        if (request.AccountNumber != null) payment.AccountNumber = request.AccountNumber;
        if (request.AccountType != null) payment.AccountType = request.AccountType;
        if (request.CardType != null) payment.CardType = request.CardType;
        if (request.CardLastFour != null) payment.CardLastFour = request.CardLastFour;
        if (request.CardHolderName != null) payment.CardHolderName = request.CardHolderName;
        if (request.MailingAddress != null) payment.MailingAddress = request.MailingAddress;
        if (!string.IsNullOrEmpty(request.Status)) payment.Status = request.Status;

        payment.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = payment });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePayment(int id)
    {
        var payment = await _context.DriverPayments.FindAsync(id);
        if (payment == null) return NotFound(new { error = "Payment method not found" });

        _context.DriverPayments.Remove(payment);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }
}

public record CreateDriverPaymentRequest(
    int? DriverId,
    string? PaymentMethod,
    string? BankName, string? RoutingNumber, string? AccountNumber, string? AccountType,
    string? CardType, string? CardLastFour, string? CardHolderName,
    string? MailingAddress, string? Status
);

public record UpdateDriverPaymentRequest(
    string? PaymentMethod,
    string? BankName, string? RoutingNumber, string? AccountNumber, string? AccountType,
    string? CardType, string? CardLastFour, string? CardHolderName,
    string? MailingAddress, string? Status
);

