using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/trailer-assignments")]
[Authorize]
public class TrailerAssignmentsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public TrailerAssignmentsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetAssignments([FromQuery] string? trailerIds, [FromQuery] int limit = 2000)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var query = FilterAssignmentsByUser(_context.TrailerAssignments.AsNoTracking(), user, hasUnrestrictedAccess);

        var idList = (trailerIds ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (idList.Length > 0)
            query = query.Where(a => idList.Contains(a.TrailerId));

        var rows = await query
            .OrderByDescending(a => a.UpdatedAt)
            .Take(limit)
            .Select(a => MapAssignment(a))
            .ToListAsync();

        return Ok(new { data = rows });
    }

    [HttpPut("{trailerId}")]
    public async Task<ActionResult<object>> UpsertAssignment([FromRoute] string trailerId, [FromBody] TrailerAssignmentUpsertRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var normalizedTrailerId = NormalizeTrailerId(trailerId);
        if (string.IsNullOrWhiteSpace(normalizedTrailerId))
            return BadRequest(new { error = "Trailer id is required" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var organizationId = user.OrganizationId ?? 0;
        if (!hasUnrestrictedAccess && organizationId <= 0)
            organizationId = 0;

        var assignment = await _context.TrailerAssignments
            .FirstOrDefaultAsync(a => a.TrailerId == normalizedTrailerId && a.OrganizationId == organizationId);

        if (assignment == null)
        {
            assignment = new TrailerAssignment
            {
                TrailerId = normalizedTrailerId,
                OrganizationId = organizationId,
                CreatedAt = DateTime.UtcNow
            };
            _context.TrailerAssignments.Add(assignment);
        }

        ApplyUpsert(assignment, request);
        assignment.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { data = MapAssignment(assignment) });
    }

    [HttpPost("bulk-upsert")]
    public async Task<ActionResult<object>> BulkUpsertAssignments([FromBody] TrailerAssignmentBulkUpsertRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var items = request.Items ?? new List<TrailerAssignmentBulkItem>();
        if (items.Count == 0)
            return Ok(new { data = Array.Empty<object>(), migrated = 0 });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var organizationId = user.OrganizationId ?? 0;
        if (!hasUnrestrictedAccess && organizationId <= 0)
            organizationId = 0;

        var migrated = 0;
        foreach (var item in items)
        {
            var normalizedTrailerId = NormalizeTrailerId(item.TrailerId);
            if (string.IsNullOrWhiteSpace(normalizedTrailerId))
                continue;

            var assignment = await _context.TrailerAssignments
                .FirstOrDefaultAsync(a => a.TrailerId == normalizedTrailerId && a.OrganizationId == organizationId);

            if (assignment == null)
            {
                assignment = new TrailerAssignment
                {
                    TrailerId = normalizedTrailerId,
                    OrganizationId = organizationId,
                    CreatedAt = DateTime.UtcNow
                };
                _context.TrailerAssignments.Add(assignment);
            }

            ApplyUpsert(assignment, item);
            assignment.UpdatedAt = DateTime.UtcNow;
            migrated++;
        }

        await _context.SaveChangesAsync();
        return Ok(new { migrated });
    }

    [HttpPost("{trailerId}/upload")]
    [RequestSizeLimit(25 * 1024 * 1024)]
    public async Task<ActionResult<object>> UploadDocument([FromRoute] string trailerId, IFormFile file)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var normalizedTrailerId = NormalizeTrailerId(trailerId);
        if (string.IsNullOrWhiteSpace(normalizedTrailerId))
            return BadRequest(new { error = "Trailer id is required" });
        if (file == null || file.Length <= 0)
            return BadRequest(new { error = "No file provided" });

        var assignment = await GetOrCreateWritableAssignment(user, normalizedTrailerId);
        if (assignment == null) return Forbid();

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        assignment.FileContent = Convert.ToBase64String(ms.ToArray());
        assignment.FileName = file.FileName;
        assignment.ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType;
        assignment.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { message = "Document uploaded", fileName = file.FileName, hasFile = true });
    }

    [HttpGet("{trailerId}/document")]
    public async Task<ActionResult> ViewDocument([FromRoute] string trailerId)
    {
        var assignment = await FindReadableAssignment(trailerId);
        if (assignment?.FileContent == null)
            return NotFound(new { error = "No document attached" });

        var bytes = Convert.FromBase64String(assignment.FileContent);
        var safeFileName = string.IsNullOrWhiteSpace(assignment.FileName) ? $"trailer-{assignment.TrailerId}" : assignment.FileName;
        Response.Headers.Append("Content-Disposition", $"inline; filename=\"{safeFileName}\"");
        return File(bytes, assignment.ContentType ?? "application/pdf");
    }

    [HttpGet("{trailerId}/download")]
    public async Task<ActionResult> DownloadDocument([FromRoute] string trailerId)
    {
        var assignment = await FindReadableAssignment(trailerId);
        if (assignment?.FileContent == null)
            return NotFound(new { error = "No document attached" });

        var bytes = Convert.FromBase64String(assignment.FileContent);
        var safeFileName = string.IsNullOrWhiteSpace(assignment.FileName) ? $"trailer-{assignment.TrailerId}" : assignment.FileName;
        return File(bytes, assignment.ContentType ?? "application/pdf", safeFileName);
    }

    [HttpDelete("{trailerId}/document")]
    public async Task<ActionResult<object>> DeleteDocument([FromRoute] string trailerId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var normalizedTrailerId = NormalizeTrailerId(trailerId);
        var assignment = await GetOrCreateWritableAssignment(user, normalizedTrailerId);
        if (assignment == null) return NotFound(new { error = "Trailer assignment not found" });

        assignment.FileContent = null;
        assignment.FileName = null;
        assignment.ContentType = null;
        assignment.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { message = "Document removed" });
    }

    private async Task<TrailerAssignment?> FindReadableAssignment(string trailerId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return null;

        var normalizedTrailerId = NormalizeTrailerId(trailerId);
        if (string.IsNullOrWhiteSpace(normalizedTrailerId)) return null;

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var query = FilterAssignmentsByUser(_context.TrailerAssignments.AsNoTracking(), user, hasUnrestrictedAccess);
        return await query.FirstOrDefaultAsync(a => a.TrailerId == normalizedTrailerId);
    }

    private async Task<TrailerAssignment?> GetOrCreateWritableAssignment(Models.User user, string normalizedTrailerId)
    {
        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var organizationId = user.OrganizationId ?? 0;
        if (!hasUnrestrictedAccess && organizationId <= 0)
            organizationId = 0;

        var assignment = await _context.TrailerAssignments
            .FirstOrDefaultAsync(a => a.TrailerId == normalizedTrailerId && a.OrganizationId == organizationId);

        if (assignment != null)
            return assignment;

        assignment = new TrailerAssignment
        {
            TrailerId = normalizedTrailerId,
            OrganizationId = organizationId,
            TrailerStatus = "active",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _context.TrailerAssignments.Add(assignment);
        return assignment;
    }

    private static IQueryable<TrailerAssignment> FilterAssignmentsByUser(
        IQueryable<TrailerAssignment> query,
        Models.User user,
        bool hasUnrestrictedAccess)
    {
        if (hasUnrestrictedAccess)
            return query;

        if (user.OrganizationId is int orgId && orgId > 0)
            return query.Where(a => a.OrganizationId == orgId || a.OrganizationId == 0);

        return query.Where(a => a.OrganizationId == 0);
    }

    private static void ApplyUpsert(TrailerAssignment assignment, TrailerAssignmentUpsertRequest request)
    {
        if (request.PermitNumber != null) assignment.PermitNumber = request.PermitNumber;
        if (request.PermitType != null) assignment.PermitType = request.PermitType;
        if (request.State != null) assignment.State = request.State;
        if (request.IssueDate.HasValue) assignment.IssueDate = request.IssueDate;
        if (request.ExpiryDate.HasValue) assignment.ExpiryDate = request.ExpiryDate;
        if (request.Cost.HasValue) assignment.Cost = request.Cost;
        if (request.Vendor != null) assignment.Vendor = request.Vendor;
        if (request.ChargeFrequency != null) assignment.ChargeFrequency = request.ChargeFrequency;
        if (!string.IsNullOrWhiteSpace(request.TrailerStatus)) assignment.TrailerStatus = request.TrailerStatus.Trim();
        if (request.ClearAssignedDriver == true)
        {
            assignment.AssignedDriverId = null;
            assignment.AssignedDriverName = null;
            assignment.DriverOverride = true;
        }
        else if (request.AssignedDriverId.HasValue || request.AssignedDriverName != null)
        {
            if (request.AssignedDriverId.HasValue) assignment.AssignedDriverId = request.AssignedDriverId;
            if (request.AssignedDriverName != null) assignment.AssignedDriverName = request.AssignedDriverName;
            assignment.DriverOverride = true;
        }
        else if (request.DriverOverride == true)
        {
            assignment.DriverOverride = true;
        }
        if (request.AssignedTruckNumber != null) assignment.AssignedTruckNumber = request.AssignedTruckNumber;
        if (request.Notes != null) assignment.Notes = request.Notes;
    }

    private static void ApplyUpsert(TrailerAssignment assignment, TrailerAssignmentBulkItem item)
    {
        ApplyUpsert(assignment, new TrailerAssignmentUpsertRequest
        {
            PermitNumber = item.PermitNumber,
            PermitType = item.PermitType,
            State = item.State,
            IssueDate = item.IssueDate,
            ExpiryDate = item.ExpiryDate,
            Cost = item.Cost,
            Vendor = item.Vendor,
            ChargeFrequency = item.ChargeFrequency,
            TrailerStatus = item.TrailerStatus,
            AssignedDriverId = item.AssignedDriverId,
            AssignedDriverName = item.AssignedDriverName,
            AssignedTruckNumber = item.AssignedTruckNumber,
            Notes = item.Notes,
            ClearAssignedDriver = item.ClearAssignedDriver
        });
    }

    private static object MapAssignment(TrailerAssignment a) => new
    {
        trailerId = a.TrailerId,
        organizationId = a.OrganizationId,
        permitNumber = a.PermitNumber,
        permitType = a.PermitType,
        state = a.State,
        issueDate = a.IssueDate,
        expiryDate = a.ExpiryDate,
        cost = a.Cost,
        vendor = a.Vendor,
        chargeFrequency = a.ChargeFrequency,
        trailerStatus = a.TrailerStatus,
        assignedDriverId = a.AssignedDriverId,
        assignedDriverName = a.AssignedDriverName,
        driverOverride = a.DriverOverride,
        assignedTruckNumber = a.AssignedTruckNumber,
        notes = a.Notes,
        fileName = a.FileName,
        hasFile = !string.IsNullOrWhiteSpace(a.FileContent),
        createdAt = a.CreatedAt,
        updatedAt = a.UpdatedAt
    };

    private static string NormalizeTrailerId(string? trailerId) =>
        (trailerId ?? string.Empty).Trim();
}

public class TrailerAssignmentUpsertRequest
{
    public string? PermitNumber { get; set; }
    public string? PermitType { get; set; }
    public string? State { get; set; }
    public DateTime? IssueDate { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public decimal? Cost { get; set; }
    public string? Vendor { get; set; }
    public string? ChargeFrequency { get; set; }
    public string? TrailerStatus { get; set; }
    public int? AssignedDriverId { get; set; }
    public string? AssignedDriverName { get; set; }
    public string? AssignedTruckNumber { get; set; }
    public string? Notes { get; set; }
    public bool? ClearAssignedDriver { get; set; }
    public bool? DriverOverride { get; set; }
}

public class TrailerAssignmentBulkUpsertRequest
{
    public List<TrailerAssignmentBulkItem>? Items { get; set; }
}

public class TrailerAssignmentBulkItem : TrailerAssignmentUpsertRequest
{
    public string TrailerId { get; set; } = string.Empty;
}
