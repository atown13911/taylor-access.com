using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/employee-documents")]
[Authorize]
public class EmployeeDocumentsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public EmployeeDocumentsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetEmployeeDocuments(
        [FromQuery] int? employeeId,
        [FromQuery] string? documentType,
        [FromQuery] bool? requiresSignature,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 50)
    {
        var user = await _currentUserService.GetUserAsync();
        var hasUnrestrictedAccess = user?.IsProductOwner() == true || user?.IsSuperAdmin() == true;
        
        if (!hasUnrestrictedAccess && user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var query = _context.EmployeeDocuments
            .Include(d => d.Employee)
            .AsQueryable();
        
        // Non-admin users can only see their org's documents
        if (!hasUnrestrictedAccess)
            query = query.Where(d => d.OrganizationId == user!.OrganizationId!.Value);

        if (employeeId.HasValue)
            query = query.Where(d => d.EmployeeId == employeeId);
        if (!string.IsNullOrEmpty(documentType))
            query = query.Where(d => d.DocumentType == documentType);
        if (requiresSignature.HasValue)
            query = query.Where(d => d.RequiresSignature == requiresSignature.Value && !d.IsSigned);

        var total = await query.CountAsync();
        var documents = await query
            .OrderByDescending(d => d.CreatedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(d => new {
                d.Id, d.EmployeeId, d.DocumentType, d.FileName, d.ContentType, d.FileSize,
                d.Description, d.ExpiresAt, d.IsExpired, d.RequiresSignature,
                d.IsSigned, d.SignedAt, d.Status, d.CreatedAt,
                EmployeeName = d.Employee!.Name
            })
            .ToListAsync();

        return Ok(new { data = documents, meta = new { total, page, limit } });
    }

    [HttpPost]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<ActionResult> UploadDocument(
        [FromForm] IFormFile file,
        [FromForm] int employeeId,
        [FromForm] string documentType,
        [FromForm] string? description,
        [FromForm] DateOnly? expiresAt,
        [FromForm] bool requiresSignature = false)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
            return Unauthorized(new { message = "User not authenticated" });

        if (file == null || file.Length == 0)
            return BadRequest(new { message = "No file provided" });

        // Use the employee's org, not the uploader's org
        var employee = await _context.Users.FindAsync(employeeId);
        if (employee == null)
            return NotFound(new { message = "Employee not found" });
        var orgId = employee.OrganizationId ?? user.OrganizationId ?? 1;

        using var memoryStream = new MemoryStream();
        await file.CopyToAsync(memoryStream);
        var base64Content = Convert.ToBase64String(memoryStream.ToArray());

        var document = new EmployeeDocument
        {
            OrganizationId = orgId,
            EmployeeId = employeeId,
            DocumentType = documentType,
            FileName = file.FileName,
            ContentType = file.ContentType,
            FileSize = file.Length,
            FileContent = base64Content,
            Description = description,
            ExpiresAt = expiresAt,
            RequiresSignature = requiresSignature,
            UploadedBy = user.Email,
            CreatedAt = DateTime.UtcNow
        };

        _context.EmployeeDocuments.Add(document);
        await _context.SaveChangesAsync();

        return Ok(new { document = new { document.Id, document.FileName }, message = "Document uploaded" });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult> UpdateDocument(int id, [FromBody] UpdateDocumentRequest request)
    {
        var doc = await _context.EmployeeDocuments.FindAsync(id);
        if (doc == null) return NotFound(new { error = "Document not found" });

        if (request.ExpirationDate != null)
        {
            doc.ExpiresAt = DateOnly.Parse(request.ExpirationDate);
        }
        if (request.DocumentType != null)
        {
            doc.DocumentType = request.DocumentType;
        }
        if (request.Description != null)
        {
            doc.Description = request.Description;
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "Document updated", document = new { doc.Id, doc.ExpiresAt } });
    }

    [HttpGet("{id}/download")]
    public async Task<ActionResult> DownloadDocument(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        var hasUnrestrictedAccess = user?.IsProductOwner() == true || user?.IsSuperAdmin() == true;

        var document = hasUnrestrictedAccess
            ? await _context.EmployeeDocuments.FirstOrDefaultAsync(d => d.Id == id)
            : await _context.EmployeeDocuments.FirstOrDefaultAsync(d => d.Id == id && d.OrganizationId == user!.OrganizationId!.Value);

        if (document == null || string.IsNullOrEmpty(document.FileContent))
            return NotFound(new { message = "Document not found" });

        var fileBytes = Convert.FromBase64String(document.FileContent);
        var safeName = document.FileName ?? "document";
        return File(fileBytes, document.ContentType ?? "application/octet-stream", safeName);
    }

    [HttpGet("{id}/view")]
    public async Task<ActionResult> ViewDocument(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        var hasUnrestrictedAccess = user?.IsProductOwner() == true || user?.IsSuperAdmin() == true;

        var document = hasUnrestrictedAccess
            ? await _context.EmployeeDocuments.FirstOrDefaultAsync(d => d.Id == id)
            : await _context.EmployeeDocuments.FirstOrDefaultAsync(d => d.Id == id && d.OrganizationId == user!.OrganizationId!.Value);

        if (document == null || string.IsNullOrEmpty(document.FileContent))
            return NotFound(new { message = "Document not found" });

        var fileBytes = Convert.FromBase64String(document.FileContent);
        var contentType = document.ContentType ?? "application/octet-stream";
        var safeFileName = Uri.EscapeDataString(document.FileName ?? "document");
        Response.Headers.Append("Content-Disposition", $"inline; filename*=UTF-8''{safeFileName}");
        return File(fileBytes, contentType);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteDocument(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        var hasUnrestrictedAccess = user?.IsProductOwner() == true || user?.IsSuperAdmin() == true;

        var document = hasUnrestrictedAccess
            ? await _context.EmployeeDocuments.FirstOrDefaultAsync(d => d.Id == id)
            : await _context.EmployeeDocuments.FirstOrDefaultAsync(d => d.Id == id && d.OrganizationId == user!.OrganizationId!.Value);

        if (document == null)
            return NotFound(new { message = "Document not found" });

        _context.EmployeeDocuments.Remove(document);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Document deleted" });
    }

    [HttpPost("{id}/sign")]
    public async Task<ActionResult> SignDocument(int id, [FromBody] SignDocumentRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var document = await _context.EmployeeDocuments
            .FirstOrDefaultAsync(d => d.Id == id && d.OrganizationId == user.OrganizationId.Value);

        if (document == null)
            return NotFound(new { message = "Document not found" });

        if (!document.RequiresSignature)
            return BadRequest(new { message = "Document does not require signature" });

        document.IsSigned = true;
        document.SignedAt = DateTime.UtcNow;
        document.SignatureData = request.SignatureData;
        document.SignedBy = user.Email;
        document.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { message = "Document signed successfully" });
    }
}

public record SignDocumentRequest(string SignatureData);
public record UpdateDocumentRequest(string? ExpirationDate, string? DocumentType, string? Description);

