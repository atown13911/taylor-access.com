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

    private static string CalculateStatus(DateTime? expiryDate)
    {
        if (!expiryDate.HasValue) return "active";
        var days = (expiryDate.Value - DateTime.UtcNow).Days;
        if (days < 0) return "expired";
        if (days <= 30) return "expiring";
        return "active";
    }
}

