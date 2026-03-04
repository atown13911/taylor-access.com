using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/driver-documents")]
[Authorize]
public class DriverDocumentsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<DriverDocumentsController> _logger;
    private readonly CurrentUserService _currentUserService;
    private readonly IAuditService _auditService;

    public DriverDocumentsController(TaylorAccessDbContext context, ILogger<DriverDocumentsController> logger, CurrentUserService currentUserService, IAuditService auditService)
    {
        _context = context;
        _logger = logger;
        _currentUserService = currentUserService;
        _auditService = auditService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetDocuments(
        [FromQuery] int? driverId,
        [FromQuery] string? category,
        [FromQuery] string? status,
        [FromQuery] int limit = 200)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var query = _context.DriverDocuments
            .AsNoTracking()
            .Include(d => d.Driver)
            .AsQueryable();

        if (!user.IsProductOwner() && !user.IsSuperAdmin() && user.OrganizationId.HasValue)
            query = query.Where(d => d.OrganizationId == user.OrganizationId.Value);

        if (driverId.HasValue) query = query.Where(d => d.DriverId == driverId.Value);
        if (!string.IsNullOrEmpty(category)) query = query.Where(d => d.Category == category);
        if (!string.IsNullOrEmpty(status)) query = query.Where(d => d.Status == status);

        var docs = await query
            .OrderByDescending(d => d.CreatedAt)
            .Take(limit)
            .Select(d => new {
                d.Id, d.DriverId, DriverName = d.Driver != null ? d.Driver.Name : null,
                d.OrganizationId, d.Category, d.SubCategory,
                d.DocumentName, d.DocumentNumber, d.IssueDate, d.ExpiryDate,
                d.Status, d.Notes, d.FileName, d.FileSize, d.RemindExpiry,
                d.CreatedAt, d.UpdatedAt, HasFile = d.FileContent != null
            })
            .ToListAsync();

        return Ok(new { data = docs });
    }

    [HttpGet("summary")]
    public async Task<ActionResult<object>> GetSummary([FromQuery] int? driverId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var query = _context.DriverDocuments.AsNoTracking().AsQueryable();
        if (!user.IsProductOwner() && !user.IsSuperAdmin() && user.OrganizationId.HasValue)
            query = query.Where(d => d.OrganizationId == user.OrganizationId.Value);
        if (driverId.HasValue) query = query.Where(d => d.DriverId == driverId.Value);

        var all = await query.ToListAsync();
        var summary = all.GroupBy(d => d.Category).Select(g => new {
            category = g.Key,
            total = g.Count(),
            active = g.Count(d => d.Status == "active"),
            expiring = g.Count(d => d.Status == "expiring"),
            expired = g.Count(d => d.Status == "expired"),
            pending = g.Count(d => d.Status == "pending")
        }).ToList();

        return Ok(new {
            data = summary,
            totalDocuments = all.Count,
            expiring = all.Count(d => d.Status == "expiring"),
            expired = all.Count(d => d.Status == "expired")
        });
    }

    [HttpPost]
    public async Task<ActionResult<object>> CreateDocument(
        [FromForm] int driverId, [FromForm] string category, [FromForm] string? subCategory,
        [FromForm] string documentName, [FromForm] string? documentNumber,
        [FromForm] DateTime? issueDate, [FromForm] DateTime? expiryDate,
        [FromForm] string? notes, [FromForm] bool? remindExpiry,
        IFormFile? file)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        var driver = await _context.Drivers.FindAsync(driverId);
        if (driver == null) return BadRequest(new { error = "Driver not found" });

        var orgId = user.OrganizationId ?? driver.OrganizationId;

        var doc = new DriverDocument
        {
            DriverId = driverId,
            OrganizationId = orgId,
            Category = category,
            SubCategory = subCategory,
            DocumentName = documentName,
            DocumentNumber = documentNumber,
            IssueDate = issueDate,
            ExpiryDate = expiryDate,
            Status = CalculateStatus(expiryDate),
            Notes = notes,
            RemindExpiry = remindExpiry ?? true
        };

        if (file != null && file.Length > 0)
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            doc.FileContent = Convert.ToBase64String(ms.ToArray());
            doc.FileName = file.FileName;
            doc.ContentType = file.ContentType;
            doc.FileSize = file.Length;
        }

        _context.DriverDocuments.Add(doc);
        await _context.SaveChangesAsync();

        await _auditService.LogAsync(AuditActions.DocumentUploaded, "DriverDocument", doc.Id,
            $"Uploaded {doc.Category}/{doc.SubCategory}: {doc.DocumentName} for driver {driverId}");

        return CreatedAtAction(nameof(GetDocuments), new { driverId = doc.DriverId }, new { data = doc });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<object>> UpdateDocument(int id,
        [FromForm] string? documentName, [FromForm] string? documentNumber,
        [FromForm] string? category, [FromForm] string? subCategory,
        [FromForm] DateTime? issueDate, [FromForm] DateTime? expiryDate,
        [FromForm] string? notes, [FromForm] string? status, [FromForm] bool? remindExpiry,
        IFormFile? file)
    {
        var doc = await _context.DriverDocuments.FindAsync(id);
        if (doc == null) return NotFound(new { error = "Document not found" });

        if (!string.IsNullOrEmpty(documentName)) doc.DocumentName = documentName;
        if (documentNumber != null) doc.DocumentNumber = documentNumber;
        if (!string.IsNullOrEmpty(category)) doc.Category = category;
        if (subCategory != null) doc.SubCategory = subCategory;
        if (issueDate.HasValue) doc.IssueDate = issueDate;
        if (expiryDate.HasValue) doc.ExpiryDate = expiryDate;
        if (notes != null) doc.Notes = notes;
        if (remindExpiry.HasValue) doc.RemindExpiry = remindExpiry.Value;
        if (!string.IsNullOrEmpty(status)) doc.Status = status;
        else doc.Status = CalculateStatus(doc.ExpiryDate);

        if (file != null && file.Length > 0)
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            doc.FileContent = Convert.ToBase64String(ms.ToArray());
            doc.FileName = file.FileName;
            doc.ContentType = file.ContentType;
            doc.FileSize = file.Length;
        }

        doc.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        await _auditService.LogAsync(AuditActions.DocumentUpdated, "DriverDocument", doc.Id,
            $"Updated {doc.Category}: {doc.DocumentName}");

        return Ok(new { data = doc });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteDocument(int id)
    {
        var doc = await _context.DriverDocuments.FindAsync(id);
        if (doc == null) return NotFound(new { error = "Document not found" });
        await _auditService.LogAsync(AuditActions.DocumentDeleted, "DriverDocument", doc.Id,
            $"Deleted {doc.Category}: {doc.DocumentName}");

        _context.DriverDocuments.Remove(doc);
        await _context.SaveChangesAsync();
        return Ok(new { deleted = true });
    }

    [HttpGet("{id}/view")]
    public async Task<ActionResult> ViewDocument(int id)
    {
        var doc = await _context.DriverDocuments.FindAsync(id);
        if (doc?.FileContent == null) return NotFound(new { error = "Document not found" });
        var bytes = Convert.FromBase64String(doc.FileContent);
        Response.Headers.Append("Content-Disposition", $"inline; filename=\"{doc.FileName}\"");
        return File(bytes, doc.ContentType ?? "application/pdf");
    }

    [HttpGet("{id}/download")]
    public async Task<ActionResult> DownloadDocument(int id)
    {
        var doc = await _context.DriverDocuments.FindAsync(id);
        if (doc?.FileContent == null) return NotFound(new { error = "Document not found" });
        var bytes = Convert.FromBase64String(doc.FileContent);
        return File(bytes, doc.ContentType ?? "application/pdf", doc.FileName ?? "document");
    }

    [HttpPost("fix-categories")]
    public async Task<ActionResult> FixDocumentCategories()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null || (user.Role != "product_owner" && user.Role != "superadmin" && user.Role != "admin"))
            return Unauthorized(new { error = "Admin access required" });

        var docs = await _context.DriverDocuments.ToListAsync();
        int updated = 0;

        var rules = new (string category, string subCategory, string[] terms)[]
        {
            ("cdl_endorsements", "cdl_license", new[] { "cdl", "license", "commercial driver", "class a", "class b" }),
            ("medical", "medical_card", new[] { "medical", "dot physical", "med cert", "medical certificate", "medical card" }),
            ("mvr", "annual_mvr", new[] { "mvr", "motor vehicle record", "driving record", "motor vehicle" }),
            ("drug_tests", "pre_employment", new[] { "drug", "alcohol", "substance", "drug test", "drug & alcohol", "pre-employment" }),
            ("dqf", "application", new[] { "dqf", "driver qualification", "qualification file" }),
            ("employment", "offer_letter", new[] { "employment", "verification", "offer letter", "employment verification" }),
            ("training", "entry_level_driver", new[] { "training", "orientation", "entry level", "safety training" }),
            ("insurance", "certificate_of_insurance", new[] { "insurance", "liability", "policy", "certificate of insurance", "cargo" }),
            ("vehicle", "registration", new[] { "vehicle", "registration", "inspection", "truck registration", "annual inspection" }),
            ("permits", "oversize", new[] { "permit", "twic", "hazmat", "oversize", "overweight" }),
            ("ifta", "ifta_license", new[] { "ifta", "irp", "fuel tax" }),
            ("safety", "safe_driver", new[] { "safety", "award", "safe driver" }),
            ("violations", "moving_violation", new[] { "violation", "accident", "incident", "citation" }),
            ("i9", "i9_form", new[] { "i-9", "i9", "eligibility", "employment eligibility" }),
            ("w9", "w9_form", new[] { "w-9", "w9", "tax form", "taxpayer" }),
            ("direct_deposit", "direct_deposit_form", new[] { "direct deposit", "bank", "ach", "routing" }),
            ("deduction", "deduction_form", new[] { "deduction", "payroll deduction", "garnishment" }),
        };

        foreach (var doc in docs)
        {
            var searchText = $"{doc.DocumentName} {doc.Category} {doc.SubCategory}".ToLower();
            bool needsUpdate = string.IsNullOrWhiteSpace(doc.Category) || 
                               doc.Category == "other" || 
                               doc.Category == "general" ||
                               string.IsNullOrWhiteSpace(doc.SubCategory);

            if (!needsUpdate) continue;

            foreach (var (cat, sub, terms) in rules)
            {
                if (terms.Any(t => searchText.Contains(t)))
                {
                    doc.Category = cat;
                    doc.SubCategory = sub;
                    doc.UpdatedAt = DateTime.UtcNow;
                    doc.Status = CalculateStatus(doc.ExpiryDate);
                    updated++;
                    break;
                }
            }
        }

        await _context.SaveChangesAsync();

        return Ok(new { message = $"Fixed {updated} documents out of {docs.Count} total", updated, total = docs.Count });
    }

    [HttpPost("refresh-status")]
    public async Task<ActionResult> RefreshDocumentStatus()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null || (user.Role != "product_owner" && user.Role != "superadmin" && user.Role != "admin"))
            return Unauthorized(new { error = "Admin access required" });

        var docs = await _context.DriverDocuments.ToListAsync();
        int updated = 0;

        foreach (var doc in docs)
        {
            var newStatus = CalculateStatus(doc.ExpiryDate);
            if (doc.Status != newStatus)
            {
                doc.Status = newStatus;
                doc.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = $"Updated status on {updated} documents", updated, total = docs.Count });
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

