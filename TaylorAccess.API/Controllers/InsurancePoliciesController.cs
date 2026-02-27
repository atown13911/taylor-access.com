using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/insurance-policies")]
[Authorize]
public class InsurancePoliciesController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<InsurancePoliciesController> _logger;
    private readonly CurrentUserService _currentUserService;
    private readonly IAuditService _auditService;

    public InsurancePoliciesController(TaylorAccessDbContext context, ILogger<InsurancePoliciesController> logger, CurrentUserService currentUserService, IAuditService auditService)
    {
        _context = context;
        _logger = logger;
        _currentUserService = currentUserService;
        _auditService = auditService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetPolicies([FromQuery] string? policyType, [FromQuery] int limit = 100)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var query = _context.InsurancePolicies.AsNoTracking().AsQueryable();

        if (!user.IsProductOwner() && !user.IsSuperAdmin() && user.OrganizationId.HasValue)
            query = query.Where(p => p.OrganizationId == user.OrganizationId.Value);

        if (!string.IsNullOrEmpty(policyType))
            query = query.Where(p => p.PolicyType == policyType);

        var policies = await query
            .OrderBy(p => p.PolicyType)
            .Take(limit)
            .Select(p => new
            {
                p.Id, p.OrganizationId, p.PolicyType, p.ProviderName, p.PolicyNumber,
                p.CoverageAmount, p.EffectiveDate, p.ExpiryDate, p.Status, p.Notes,
                p.FileName, p.FileSize,
                p.PremiumCost, p.BillingFrequency, p.PaymentMethod,
                p.DueDayOfMonth, p.NextPaymentDate, p.AutoRenew, p.BillingNotes,
                p.Remind3Months, p.Remind30Days, p.Remind15Days, p.RemindDayOf, p.RemindDailyPastDue,
                p.CreatedAt, p.UpdatedAt,
                HasFile = p.FileContent != null
            })
            .ToListAsync();

        return Ok(new { data = policies });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetPolicy(int id)
    {
        var policy = await _context.InsurancePolicies.FindAsync(id);
        if (policy == null) return NotFound(new { error = "Policy not found" });

        return Ok(new { data = new {
            policy.Id, policy.OrganizationId, policy.PolicyType, policy.ProviderName,
            policy.PolicyNumber, policy.CoverageAmount, policy.EffectiveDate, policy.ExpiryDate,
            policy.Status, policy.Notes, policy.FileName, policy.FileSize,
            policy.CreatedAt, policy.UpdatedAt, HasFile = policy.FileContent != null
        }});
    }

    [HttpPost]
    public async Task<ActionResult<object>> CreatePolicy([FromForm] string policyType, [FromForm] string providerName,
        [FromForm] string? policyNumber, [FromForm] decimal? coverageAmount,
        [FromForm] DateTime? effectiveDate, [FromForm] DateTime? expiryDate,
        [FromForm] string? notes,
        [FromForm] bool? remind3Months, [FromForm] bool? remind30Days, [FromForm] bool? remind15Days,
        [FromForm] bool? remindDayOf, [FromForm] bool? remindDailyPastDue,
        IFormFile? file)
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

        var policy = new InsurancePolicy
        {
            OrganizationId = orgId,
            PolicyType = policyType,
            ProviderName = providerName,
            PolicyNumber = policyNumber,
            CoverageAmount = coverageAmount,
            EffectiveDate = effectiveDate,
            ExpiryDate = expiryDate,
            Status = CalculateStatus(expiryDate),
            Notes = notes,
            Remind3Months = remind3Months ?? false,
            Remind30Days = remind30Days ?? true,
            Remind15Days = remind15Days ?? true,
            RemindDayOf = remindDayOf ?? true,
            RemindDailyPastDue = remindDailyPastDue ?? true
        };

        if (file != null && file.Length > 0)
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            policy.FileContent = Convert.ToBase64String(ms.ToArray());
            policy.FileName = file.FileName;
            policy.ContentType = file.ContentType;
            policy.FileSize = file.Length;
        }

        _context.InsurancePolicies.Add(policy);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created insurance policy {Type} from {Provider}", policy.PolicyType, policy.ProviderName);
        await _auditService.LogAsync(AuditActions.InsurancePolicyCreated, "InsurancePolicy", policy.Id,
            $"Created {policy.PolicyType} policy from {policy.ProviderName} - #{policy.PolicyNumber}");

        return CreatedAtAction(nameof(GetPolicy), new { id = policy.Id }, new { data = policy });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<object>> UpdatePolicy(int id, [FromForm] string? policyType, [FromForm] string? providerName,
        [FromForm] string? policyNumber, [FromForm] decimal? coverageAmount,
        [FromForm] DateTime? effectiveDate, [FromForm] DateTime? expiryDate,
        [FromForm] string? notes, [FromForm] string? status,
        [FromForm] bool? remind3Months, [FromForm] bool? remind30Days, [FromForm] bool? remind15Days,
        [FromForm] bool? remindDayOf, [FromForm] bool? remindDailyPastDue,
        IFormFile? file)
    {
        var policy = await _context.InsurancePolicies.FindAsync(id);
        if (policy == null) return NotFound(new { error = "Policy not found" });

        if (!string.IsNullOrEmpty(policyType)) policy.PolicyType = policyType;
        if (!string.IsNullOrEmpty(providerName)) policy.ProviderName = providerName;
        if (policyNumber != null) policy.PolicyNumber = policyNumber;
        if (coverageAmount.HasValue) policy.CoverageAmount = coverageAmount;
        if (effectiveDate.HasValue) policy.EffectiveDate = effectiveDate;
        if (expiryDate.HasValue) policy.ExpiryDate = expiryDate;
        if (notes != null) policy.Notes = notes;
        if (remind3Months.HasValue) policy.Remind3Months = remind3Months.Value;
        if (remind30Days.HasValue) policy.Remind30Days = remind30Days.Value;
        if (remind15Days.HasValue) policy.Remind15Days = remind15Days.Value;
        if (remindDayOf.HasValue) policy.RemindDayOf = remindDayOf.Value;
        if (remindDailyPastDue.HasValue) policy.RemindDailyPastDue = remindDailyPastDue.Value;
        if (!string.IsNullOrEmpty(status)) policy.Status = status;
        else policy.Status = CalculateStatus(policy.ExpiryDate);

        if (file != null && file.Length > 0)
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            policy.FileContent = Convert.ToBase64String(ms.ToArray());
            policy.FileName = file.FileName;
            policy.ContentType = file.ContentType;
            policy.FileSize = file.Length;
        }

        policy.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = policy });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePolicy(int id)
    {
        var policy = await _context.InsurancePolicies.FindAsync(id);
        if (policy == null) return NotFound(new { error = "Policy not found" });

        await _auditService.LogAsync(AuditActions.InsurancePolicyDeleted, "InsurancePolicy", policy.Id,
            $"Deleted {policy.PolicyType} policy from {policy.ProviderName}");

        _context.InsurancePolicies.Remove(policy);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }

    [HttpGet("{id}/view")]
    public async Task<ActionResult> ViewDocument(int id)
    {
        var policy = await _context.InsurancePolicies.FindAsync(id);
        if (policy == null || policy.FileContent == null)
            return NotFound(new { error = "Document not found" });

        var bytes = Convert.FromBase64String(policy.FileContent);
        Response.Headers.Append("Content-Disposition", $"inline; filename=\"{policy.FileName}\"");
        return File(bytes, policy.ContentType ?? "application/pdf");
    }

    [HttpGet("{id}/download")]
    public async Task<ActionResult> DownloadDocument(int id)
    {
        var policy = await _context.InsurancePolicies.FindAsync(id);
        if (policy == null || policy.FileContent == null)
            return NotFound(new { error = "Document not found" });

        var bytes = Convert.FromBase64String(policy.FileContent);
        return File(bytes, policy.ContentType ?? "application/pdf", policy.FileName ?? "document");
    }

    /// <summary>
    /// Update billing & cost settings for a policy
    /// </summary>
    [HttpPut("{id}/billing")]
    public async Task<ActionResult<object>> UpdateBilling(int id, [FromBody] UpdateBillingRequest request)
    {
        var policy = await _context.InsurancePolicies.FindAsync(id);
        if (policy == null) return NotFound(new { error = "Policy not found" });

        if (request.PremiumCost.HasValue) policy.PremiumCost = request.PremiumCost;
        if (request.BillingFrequency != null) policy.BillingFrequency = request.BillingFrequency;
        if (request.PaymentMethod != null) policy.PaymentMethod = request.PaymentMethod;
        if (request.DueDayOfMonth.HasValue) policy.DueDayOfMonth = request.DueDayOfMonth;
        if (request.NextPaymentDate.HasValue) policy.NextPaymentDate = request.NextPaymentDate;
        if (request.AutoRenew != null) policy.AutoRenew = request.AutoRenew;
        if (request.BillingNotes != null) policy.BillingNotes = request.BillingNotes;

        policy.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = policy });
    }

    // ========== ENROLLMENTS ==========

    [HttpGet("{policyId}/enrollments")]
    public async Task<ActionResult<object>> GetEnrollments(int policyId)
    {
        var enrollments = await _context.InsuranceEnrollments
            .AsNoTracking()
            .Include(e => e.Driver)
            .Where(e => e.InsurancePolicyId == policyId)
            .OrderBy(e => e.Driver!.Name)
            .Select(e => new {
                e.Id, e.InsurancePolicyId, e.DriverId,
                DriverName = e.Driver != null ? e.Driver.Name : null,
                e.CoverageLevel, e.DeductionAmount, e.DeductionFrequency,
                e.PaymentTerms, e.Beneficiary, e.EffectiveDate, e.Status,
                e.CreatedAt, e.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = enrollments });
    }

    [HttpPost("{policyId}/enrollments")]
    public async Task<ActionResult<object>> CreateEnrollment(int policyId, [FromBody] CreateEnrollmentRequest request)
    {
        if (request.DriverId <= 0) return BadRequest(new { error = "Driver is required" });

        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var policy = await _context.InsurancePolicies.FindAsync(policyId);
        if (policy == null) return NotFound(new { error = "Policy not found" });

        var enrollment = new InsuranceEnrollment
        {
            InsurancePolicyId = policyId,
            DriverId = request.DriverId,
            OrganizationId = policy.OrganizationId,
            CoverageLevel = request.CoverageLevel ?? "standard",
            DeductionAmount = request.DeductionAmount,
            DeductionFrequency = request.DeductionFrequency ?? "monthly",
            PaymentTerms = request.PaymentTerms,
            Beneficiary = request.Beneficiary,
            EffectiveDate = request.EffectiveDate,
            Status = request.Status ?? "active"
        };

        _context.InsuranceEnrollments.Add(enrollment);
        await _context.SaveChangesAsync();

        await _auditService.LogAsync(AuditActions.InsuranceEnrollment, "InsuranceEnrollment", enrollment.Id,
            $"Enrolled driver {request.DriverId} in policy {policyId} - {enrollment.CoverageLevel} coverage");

        return CreatedAtAction(nameof(GetEnrollments), new { policyId }, new { data = enrollment });
    }

    [HttpPut("{policyId}/enrollments/{enrollmentId}")]
    public async Task<ActionResult<object>> UpdateEnrollment(int policyId, int enrollmentId, [FromBody] UpdateEnrollmentRequest request)
    {
        var enrollment = await _context.InsuranceEnrollments.FindAsync(enrollmentId);
        if (enrollment == null) return NotFound(new { error = "Enrollment not found" });

        if (request.CoverageLevel != null) enrollment.CoverageLevel = request.CoverageLevel;
        if (request.DeductionAmount.HasValue) enrollment.DeductionAmount = request.DeductionAmount;
        if (request.DeductionFrequency != null) enrollment.DeductionFrequency = request.DeductionFrequency;
        if (request.PaymentTerms != null) enrollment.PaymentTerms = request.PaymentTerms;
        if (request.Beneficiary != null) enrollment.Beneficiary = request.Beneficiary;
        if (request.EffectiveDate.HasValue) enrollment.EffectiveDate = request.EffectiveDate;
        if (!string.IsNullOrEmpty(request.Status)) enrollment.Status = request.Status;

        enrollment.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = enrollment });
    }

    [HttpDelete("{policyId}/enrollments/{enrollmentId}")]
    public async Task<IActionResult> DeleteEnrollment(int policyId, int enrollmentId)
    {
        var enrollment = await _context.InsuranceEnrollments.FindAsync(enrollmentId);
        if (enrollment == null) return NotFound(new { error = "Enrollment not found" });

        await _auditService.LogAsync(AuditActions.InsuranceUnenrollment, "InsuranceEnrollment", enrollment.Id,
            $"Removed driver enrollment {enrollmentId} from policy {policyId}");

        _context.InsuranceEnrollments.Remove(enrollment);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }

    private static string CalculateStatus(DateTime? expiryDate)
    {
        if (!expiryDate.HasValue) return "active";
        var days = (expiryDate.Value - DateTime.UtcNow).Days;
        if (days < 0) return "expired";
        if (days <= 30) return "expiring";
        return "active";
    }
}

public record CreateEnrollmentRequest(
    int DriverId,
    string? CoverageLevel,
    decimal? DeductionAmount,
    string? DeductionFrequency,
    string? PaymentTerms,
    string? Beneficiary,
    DateTime? EffectiveDate,
    string? Status
);

public record UpdateBillingRequest(
    decimal? PremiumCost,
    string? BillingFrequency,
    string? PaymentMethod,
    int? DueDayOfMonth,
    DateTime? NextPaymentDate,
    string? AutoRenew,
    string? BillingNotes
);

public record UpdateEnrollmentRequest(
    string? CoverageLevel,
    decimal? DeductionAmount,
    string? DeductionFrequency,
    string? PaymentTerms,
    string? Beneficiary,
    DateTime? EffectiveDate,
    string? Status
);

