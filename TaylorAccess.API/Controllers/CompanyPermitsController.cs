using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/company-permits")]
[Authorize]
public class CompanyPermitsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;
    private readonly IAuditService _auditService;

    public CompanyPermitsController(TaylorAccessDbContext context, CurrentUserService currentUserService, IAuditService auditService)
    {
        _context = context;
        _currentUserService = currentUserService;
        _auditService = auditService;
    }

    [HttpGet]
    public async Task<ActionResult> GetPermits([FromQuery] string? type, [FromQuery] string? status, [FromQuery] int limit = 500)
    {
        var query = _context.CompanyPermits
            .Include(p => p.AssignedDriver)
            .AsNoTracking()
            .AsQueryable();

        if (!string.IsNullOrEmpty(type)) query = query.Where(p => p.PermitType == type);
        if (!string.IsNullOrEmpty(status)) query = query.Where(p => p.Status == status);

        var permits = await query.OrderByDescending(p => p.CreatedAt).Take(limit)
            .Select(p => new
            {
                p.Id, p.OrganizationId, p.PermitNumber, p.PermitType, p.State,
                p.IssueDate, p.ExpiryDate, p.Cost, p.Status,
                p.AssignedDriverId, AssignedDriverName = p.AssignedDriver != null ? p.AssignedDriver.Name : null,
                p.AssignedTruckNumber, p.Notes, p.CreatedAt, p.UpdatedAt,
                p.FileName, HasFile = p.FileContent != null
            })
            .ToListAsync();

        return Ok(new { data = permits });
    }

    [HttpPost]
    public async Task<ActionResult> CreatePermit([FromBody] CompanyPermit permit)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId != null) permit.OrganizationId = user.OrganizationId.Value;

        _context.CompanyPermits.Add(permit);
        await _context.SaveChangesAsync();
        await _auditService.LogAsync("create", "CompanyPermit", permit.Id, $"Created {permit.PermitType} permit #{permit.PermitNumber}");

        return Ok(new { data = permit });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult> UpdatePermit(int id, [FromBody] CompanyPermit update)
    {
        var permit = await _context.CompanyPermits.FindAsync(id);
        if (permit == null) return NotFound();

        permit.PermitNumber = update.PermitNumber;
        permit.PermitType = update.PermitType;
        permit.State = update.State;
        permit.IssueDate = update.IssueDate;
        permit.ExpiryDate = update.ExpiryDate;
        permit.Cost = update.Cost;
        permit.Status = update.Status;
        permit.AssignedDriverId = update.AssignedDriverId;
        permit.AssignedTruckNumber = update.AssignedTruckNumber;
        permit.Notes = update.Notes;
        permit.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        await _auditService.LogAsync("update", "CompanyPermit", permit.Id, $"Updated permit #{permit.PermitNumber}");

        return Ok(new { data = permit });
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeletePermit(int id)
    {
        var permit = await _context.CompanyPermits.FindAsync(id);
        if (permit == null) return NotFound();

        _context.CompanyPermits.Remove(permit);
        await _context.SaveChangesAsync();
        await _auditService.LogAsync("delete", "CompanyPermit", id, $"Deleted permit #{permit.PermitNumber}");

        return Ok(new { message = "Permit deleted" });
    }

    // ── Document upload ────────────────────────────────────────────────────

    [HttpPost("{id}/upload")]
    public async Task<ActionResult> UploadDocument(int id, IFormFile file)
    {
        var permit = await _context.CompanyPermits.FindAsync(id);
        if (permit == null) return NotFound();

        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided" });

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        permit.FileContent = Convert.ToBase64String(ms.ToArray());
        permit.FileName    = file.FileName;
        permit.ContentType = file.ContentType;
        permit.UpdatedAt   = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        await _auditService.LogAsync("upload", "CompanyPermit", id, $"Uploaded document for permit #{permit.PermitNumber}");

        return Ok(new { message = "Document uploaded", fileName = file.FileName });
    }

    [HttpGet("{id}/document")]
    public async Task<ActionResult> ViewDocument(int id)
    {
        var permit = await _context.CompanyPermits.FindAsync(id);
        if (permit?.FileContent == null) return NotFound(new { error = "No document attached" });

        var bytes = Convert.FromBase64String(permit.FileContent);
        Response.Headers.Append("Content-Disposition", $"inline; filename=\"{permit.FileName}\"");
        return File(bytes, permit.ContentType ?? "application/pdf");
    }

    [HttpGet("{id}/download")]
    public async Task<ActionResult> DownloadDocument(int id)
    {
        var permit = await _context.CompanyPermits.FindAsync(id);
        if (permit?.FileContent == null) return NotFound(new { error = "No document attached" });

        var bytes = Convert.FromBase64String(permit.FileContent);
        return File(bytes, permit.ContentType ?? "application/pdf", permit.FileName ?? "permit-document");
    }

    [HttpDelete("{id}/document")]
    public async Task<ActionResult> DeleteDocument(int id)
    {
        var permit = await _context.CompanyPermits.FindAsync(id);
        if (permit == null) return NotFound();

        permit.FileContent = null;
        permit.FileName    = null;
        permit.ContentType = null;
        permit.UpdatedAt   = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { message = "Document removed" });
    }
}
