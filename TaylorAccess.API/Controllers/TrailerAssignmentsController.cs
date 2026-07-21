using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
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
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TrailerAssignmentsController> _logger;

    public TrailerAssignmentsController(
        TaylorAccessDbContext context,
        CurrentUserService currentUserService,
        IHttpClientFactory httpClientFactory,
        ILogger<TrailerAssignmentsController> logger)
    {
        _context = context;
        _currentUserService = currentUserService;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
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
            query = query.Where(a => idList.Contains(a.TrailerId) || (a.PermitNumber != null && idList.Contains(a.PermitNumber)));

        var preferredOrgId = user.OrganizationId ?? 0;
        var entities = await query
            .OrderByDescending(a => a.UpdatedAt)
            .Take(Math.Clamp(limit * 2, limit, 5000))
            .ToListAsync();

        var rows = entities
            .GroupBy(a => a.TrailerId, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var candidates = g.ToList();
                var primary = candidates
                    .OrderByDescending(a => preferredOrgId > 0 && a.OrganizationId == preferredOrgId)
                    .ThenByDescending(a => a.DriverOverride)
                    .ThenByDescending(a => a.UpdatedAt)
                    .First();
                var documentSource = candidates
                    .FirstOrDefault(a => !string.IsNullOrWhiteSpace(a.FileContent));
                return new
                {
                    UpdatedAt = primary.UpdatedAt,
                    Row = MapAssignment(primary, documentSource)
                };
            })
            .OrderByDescending(x => x.UpdatedAt)
            .Take(limit)
            .Select(x => x.Row)
            .ToList();

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

        var isNew = assignment == null;
        var previousDriverId = assignment?.AssignedDriverId;
        var previousDriverName = assignment?.AssignedDriverName;
        var previousTruck = assignment?.AssignedTruckNumber;
        var previousStatus = assignment?.TrailerStatus;

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

        AppendAssignmentChangeLog(
            assignment,
            user,
            isNew,
            previousDriverId,
            previousDriverName,
            previousTruck,
            previousStatus);

        await _context.SaveChangesAsync();
        return Ok(new { data = MapAssignment(assignment) });
    }

    [HttpGet("{trailerId}/history")]
    public async Task<ActionResult<object>> GetAssignmentHistory([FromRoute] string trailerId, [FromQuery] int limit = 200)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var normalizedTrailerId = NormalizeTrailerId(trailerId);
        if (string.IsNullOrWhiteSpace(normalizedTrailerId))
            return BadRequest(new { error = "Trailer id is required" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var organizationId = user.OrganizationId ?? 0;

        var assignmentQuery = FilterAssignmentsByUser(_context.TrailerAssignments.AsNoTracking(), user, hasUnrestrictedAccess);
        var assignments = await assignmentQuery
            .Where(a => a.TrailerId == normalizedTrailerId
                || (a.PermitNumber != null && a.PermitNumber == normalizedTrailerId)
                || (a.AssignedTruckNumber != null && a.AssignedTruckNumber == normalizedTrailerId))
            .ToListAsync();

        var aliases = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { normalizedTrailerId };
        foreach (var a in assignments)
        {
            if (!string.IsNullOrWhiteSpace(a.TrailerId)) aliases.Add(a.TrailerId);
            if (!string.IsNullOrWhiteSpace(a.PermitNumber)) aliases.Add(a.PermitNumber);
            if (!string.IsNullOrWhiteSpace(a.AssignedTruckNumber)) aliases.Add(a.AssignedTruckNumber);
        }

        var logQuery = _context.TrailerAssignmentLogs.AsNoTracking().AsQueryable();
        if (!hasUnrestrictedAccess)
        {
            logQuery = organizationId > 0
                ? logQuery.Where(l => l.OrganizationId == organizationId || l.OrganizationId == 0)
                : logQuery.Where(l => l.OrganizationId == 0);
        }

        var aliasList = aliases.ToList();
        var rows = await logQuery
            .Where(l => aliasList.Contains(l.TrailerId))
            .OrderByDescending(l => l.CreatedAt)
            .ThenByDescending(l => l.Id)
            .Take(Math.Clamp(limit, 1, 500))
            .ToListAsync();

        // Include existing photos that pre-date the log table so History is useful immediately.
        var loggedPhotoIds = rows
            .Where(r => r.PhotoId.HasValue)
            .Select(r => r.PhotoId!.Value)
            .ToHashSet();

        var photoQuery = _context.TrailerPhotos.AsNoTracking().AsQueryable();
        if (!hasUnrestrictedAccess)
        {
            photoQuery = organizationId > 0
                ? photoQuery.Where(p => p.OrganizationId == organizationId || p.OrganizationId == 0)
                : photoQuery.Where(p => p.OrganizationId == 0);
        }

        var orphanPhotos = await photoQuery
            .Where(p => aliasList.Contains(p.TrailerId) && !loggedPhotoIds.Contains(p.Id))
            .OrderByDescending(p => p.CreatedAt)
            .Take(200)
            .ToListAsync();

        var combined = rows
            .Select(l => (CreatedAt: l.CreatedAt, Row: MapLog(l)))
            .Concat(orphanPhotos.Select(p => (
                CreatedAt: p.CreatedAt,
                Row: (object)new
                {
                    id = -p.Id,
                    trailerId = p.TrailerId,
                    organizationId = p.OrganizationId,
                    eventType = "photo_uploaded",
                    driverId = (int?)null,
                    driverName = (string?)null,
                    previousDriverId = (int?)null,
                    previousDriverName = (string?)null,
                    truckNumber = (string?)null,
                    trailerStatus = (string?)null,
                    photoId = (int?)p.Id,
                    photoFileName = p.FileName,
                    changedByUserId = p.UploadedByUserId,
                    changedBy = p.UploadedBy,
                    notes = "Historical photo",
                    createdAt = p.CreatedAt,
                    photoUrl = $"/api/v1/trailer-photos/photo/{p.Id}/view"
                }
            )))
            .OrderByDescending(x => x.CreatedAt)
            .Take(Math.Clamp(limit, 1, 500))
            .Select(x => x.Row)
            .ToList();

        return Ok(new { data = combined });
    }

    [HttpPost("{trailerId}/unassign-driver")]
    public async Task<ActionResult<object>> UnassignDriver([FromRoute] string trailerId)
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

        var targets = await FindWritableAssignmentsAsync(normalizedTrailerId, hasUnrestrictedAccess, organizationId);
        if (targets.Count == 0)
        {
            targets.Add(new TrailerAssignment
            {
                TrailerId = normalizedTrailerId,
                OrganizationId = organizationId,
                CreatedAt = DateTime.UtcNow
            });
            _context.TrailerAssignments.Add(targets[0]);
        }

        foreach (var assignment in targets)
        {
            var previousDriverId = assignment.AssignedDriverId;
            var previousDriverName = assignment.AssignedDriverName;

            assignment.AssignedDriverId = null;
            assignment.AssignedDriverName = null;
            assignment.DriverOverride = true;
            assignment.UpdatedAt = DateTime.UtcNow;

            if (previousDriverId.HasValue || !string.IsNullOrWhiteSpace(previousDriverName))
            {
                AddAssignmentLog(new TrailerAssignmentLog
                {
                    TrailerId = assignment.TrailerId,
                    OrganizationId = assignment.OrganizationId,
                    EventType = "unassigned",
                    PreviousDriverId = previousDriverId,
                    PreviousDriverName = previousDriverName,
                    TruckNumber = assignment.AssignedTruckNumber,
                    TrailerStatus = assignment.TrailerStatus,
                    ChangedByUserId = user.Id > 0 ? user.Id : null,
                    ChangedBy = ResolveActorName(user),
                    Notes = "Driver unassigned"
                });
            }
        }

        await _context.SaveChangesAsync();

        var assetsSynced = await TryClearAssetsDriverAssignmentAsync(normalizedTrailerId);

        var primary = targets
            .OrderByDescending(a => organizationId > 0 && a.OrganizationId == organizationId)
            .ThenByDescending(a => a.UpdatedAt)
            .First();

        return Ok(new
        {
            data = MapAssignment(primary),
            assetsSynced,
            cleared = targets.Count
        });
    }

    [HttpPost("{trailerId}/deactivate")]
    public async Task<ActionResult<object>> DeactivateTrailer([FromRoute] string trailerId)
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

        var targets = await FindWritableAssignmentsAsync(normalizedTrailerId, hasUnrestrictedAccess, organizationId);
        if (targets.Count == 0)
        {
            targets.Add(new TrailerAssignment
            {
                TrailerId = normalizedTrailerId,
                OrganizationId = organizationId,
                CreatedAt = DateTime.UtcNow
            });
            _context.TrailerAssignments.Add(targets[0]);
        }

        foreach (var assignment in targets)
        {
            var previousDriverId = assignment.AssignedDriverId;
            var previousDriverName = assignment.AssignedDriverName;

            if (assignment.AssignedDriverId.HasValue || !string.IsNullOrWhiteSpace(assignment.AssignedDriverName))
            {
                assignment.LastAssignedDriverId = assignment.AssignedDriverId;
                assignment.LastAssignedDriverName = assignment.AssignedDriverName;
            }

            assignment.AssignedDriverId = null;
            assignment.AssignedDriverName = null;
            assignment.TrailerStatus = "inactive";
            assignment.DriverOverride = true;
            assignment.InactivatedAt = DateTime.UtcNow;
            assignment.UpdatedAt = DateTime.UtcNow;

            AddAssignmentLog(new TrailerAssignmentLog
            {
                TrailerId = assignment.TrailerId,
                OrganizationId = assignment.OrganizationId,
                EventType = "deactivated",
                PreviousDriverId = previousDriverId,
                PreviousDriverName = previousDriverName,
                DriverId = assignment.LastAssignedDriverId,
                DriverName = assignment.LastAssignedDriverName,
                TruckNumber = assignment.AssignedTruckNumber,
                TrailerStatus = "inactive",
                ChangedByUserId = user.Id > 0 ? user.Id : null,
                ChangedBy = ResolveActorName(user),
                Notes = "Trailer moved to inactive"
            });
        }

        await _context.SaveChangesAsync();

        var primary = targets
            .OrderByDescending(a => organizationId > 0 && a.OrganizationId == organizationId)
            .ThenByDescending(a => a.UpdatedAt)
            .First();

        return Ok(new { data = MapAssignment(primary) });
    }

    private async Task<List<TrailerAssignment>> FindWritableAssignmentsAsync(
        string normalizedTrailerId,
        bool hasUnrestrictedAccess,
        int organizationId)
    {
        var query = _context.TrailerAssignments.AsQueryable();
        if (!hasUnrestrictedAccess)
            query = query.Where(a => a.OrganizationId == organizationId || a.OrganizationId == 0);

        return await query
            .Where(a => a.TrailerId == normalizedTrailerId
                || (a.PermitNumber != null && a.PermitNumber == normalizedTrailerId))
            .ToListAsync();
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

        AddAssignmentLog(new TrailerAssignmentLog
        {
            TrailerId = assignment.TrailerId,
            OrganizationId = assignment.OrganizationId,
            EventType = "agreement_uploaded",
            DriverId = assignment.AssignedDriverId,
            DriverName = assignment.AssignedDriverName,
            TruckNumber = assignment.AssignedTruckNumber,
            TrailerStatus = assignment.TrailerStatus,
            PhotoFileName = file.FileName,
            ChangedByUserId = user.Id > 0 ? user.Id : null,
            ChangedBy = ResolveActorName(user),
            Notes = "Agreement document uploaded"
        });

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
        var preferredOrgId = user.OrganizationId ?? 0;
        var matches = await query
            .Where(a => a.TrailerId == normalizedTrailerId
                || (a.PermitNumber != null && a.PermitNumber == normalizedTrailerId))
            .ToListAsync();

        if (matches.Count == 0)
            return null;

        return matches
            .OrderByDescending(a => !string.IsNullOrWhiteSpace(a.FileContent))
            .ThenByDescending(a => preferredOrgId > 0 && a.OrganizationId == preferredOrgId)
            .ThenByDescending(a => a.UpdatedAt)
            .First();
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

    private void AppendAssignmentChangeLog(
        TrailerAssignment assignment,
        Models.User user,
        bool isNew,
        int? previousDriverId,
        string? previousDriverName,
        string? previousTruck,
        string? previousStatus)
    {
        var driverChanged =
            previousDriverId != assignment.AssignedDriverId
            || !string.Equals(
                previousDriverName ?? string.Empty,
                assignment.AssignedDriverName ?? string.Empty,
                StringComparison.OrdinalIgnoreCase);

        var truckChanged = !string.Equals(
            previousTruck ?? string.Empty,
            assignment.AssignedTruckNumber ?? string.Empty,
            StringComparison.OrdinalIgnoreCase);

        var statusChanged = !string.Equals(
            previousStatus ?? string.Empty,
            assignment.TrailerStatus ?? string.Empty,
            StringComparison.OrdinalIgnoreCase);

        if (!isNew && !driverChanged && !truckChanged && !statusChanged)
            return;

        string eventType;
        string notes;
        if (isNew)
        {
            eventType = assignment.AssignedDriverId.HasValue || !string.IsNullOrWhiteSpace(assignment.AssignedDriverName)
                ? "assigned"
                : "updated";
            notes = "Trailer assignment record created";
        }
        else if (statusChanged
                 && string.Equals(assignment.TrailerStatus, "active", StringComparison.OrdinalIgnoreCase)
                 && string.Equals(previousStatus, "inactive", StringComparison.OrdinalIgnoreCase))
        {
            eventType = "reactivated";
            notes = "Trailer reactivated";
        }
        else if (statusChanged
                 && string.Equals(assignment.TrailerStatus, "inactive", StringComparison.OrdinalIgnoreCase))
        {
            eventType = "deactivated";
            notes = "Trailer deactivated";
        }
        else if (driverChanged
                 && (assignment.AssignedDriverId.HasValue || !string.IsNullOrWhiteSpace(assignment.AssignedDriverName)))
        {
            eventType = "assigned";
            notes = previousDriverId.HasValue || !string.IsNullOrWhiteSpace(previousDriverName)
                ? "Driver reassigned"
                : "Driver assigned";
        }
        else if (driverChanged)
        {
            eventType = "unassigned";
            notes = "Driver cleared";
        }
        else
        {
            eventType = "updated";
            notes = truckChanged ? "Truck assignment updated" : "Trailer assignment updated";
        }

        AddAssignmentLog(new TrailerAssignmentLog
        {
            TrailerId = assignment.TrailerId,
            OrganizationId = assignment.OrganizationId,
            EventType = eventType,
            DriverId = assignment.AssignedDriverId,
            DriverName = assignment.AssignedDriverName,
            PreviousDriverId = previousDriverId,
            PreviousDriverName = previousDriverName,
            TruckNumber = assignment.AssignedTruckNumber,
            TrailerStatus = assignment.TrailerStatus,
            ChangedByUserId = user.Id > 0 ? user.Id : null,
            ChangedBy = ResolveActorName(user),
            Notes = notes
        });
    }

    private void AddAssignmentLog(TrailerAssignmentLog log)
    {
        log.CreatedAt = DateTime.UtcNow;
        _context.TrailerAssignmentLogs.Add(log);
    }

    private static string ResolveActorName(Models.User user)
    {
        if (!string.IsNullOrWhiteSpace(user.Name)) return user.Name.Trim();
        if (!string.IsNullOrWhiteSpace(user.Email)) return user.Email;
        return $"User {user.Id}";
    }

    private static object MapLog(TrailerAssignmentLog log) => new
    {
        id = log.Id,
        trailerId = log.TrailerId,
        organizationId = log.OrganizationId,
        eventType = log.EventType,
        driverId = log.DriverId,
        driverName = log.DriverName,
        previousDriverId = log.PreviousDriverId,
        previousDriverName = log.PreviousDriverName,
        truckNumber = log.TruckNumber,
        trailerStatus = log.TrailerStatus,
        photoId = log.PhotoId,
        photoFileName = log.PhotoFileName,
        changedByUserId = log.ChangedByUserId,
        changedBy = log.ChangedBy,
        notes = log.Notes,
        createdAt = log.CreatedAt,
        photoUrl = log.PhotoId.HasValue ? $"/api/v1/trailer-photos/photo/{log.PhotoId.Value}/view" : null
    };

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
        if (request.LastAssignedDriverId.HasValue) assignment.LastAssignedDriverId = request.LastAssignedDriverId;
        if (request.LastAssignedDriverName != null) assignment.LastAssignedDriverName = request.LastAssignedDriverName;
        if (request.InactivatedAt.HasValue) assignment.InactivatedAt = request.InactivatedAt;
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

    private static object MapAssignment(TrailerAssignment a, TrailerAssignment? documentSource = null)
    {
        var doc = documentSource ?? a;
        var hasFile = !string.IsNullOrWhiteSpace(a.FileContent) || !string.IsNullOrWhiteSpace(doc.FileContent);
        var fileName = !string.IsNullOrWhiteSpace(a.FileName) ? a.FileName : doc.FileName;

        return new
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
            lastAssignedDriverId = a.LastAssignedDriverId,
            lastAssignedDriverName = a.LastAssignedDriverName,
            inactivatedAt = a.InactivatedAt,
            assignedTruckNumber = a.AssignedTruckNumber,
            notes = a.Notes,
            fileName,
            hasFile,
            createdAt = a.CreatedAt,
            updatedAt = a.UpdatedAt
        };
    }

    private static string NormalizeTrailerId(string? trailerId) =>
        (trailerId ?? string.Empty).Trim();

    private async Task<bool> TryClearAssetsDriverAssignmentAsync(string trailerId)
    {
        if (!int.TryParse(trailerId, out var numericId) || numericId <= 0)
            return false;

        var clearPayload = JsonSerializer.Serialize(new
        {
            assignedDriverId = (int?)null,
            driverId = (int?)null,
            assignedDriverName = (string?)null,
            ownerName = (string?)null,
            status = "available"
        });

        var client = _httpClientFactory.CreateClient();
        ConfigureAssetsClient(client);

        foreach (var url in BuildAssetsClearUrls(numericId))
        {
            try
            {
                using var request = new HttpRequestMessage(new HttpMethod("PATCH"), url)
                {
                    Content = new StringContent(clearPayload, Encoding.UTF8, "application/json")
                };
                using var response = await client.SendAsync(request);
                if (response.IsSuccessStatusCode)
                    return true;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Assets unassign attempt failed for {Url}", url);
            }
        }

        return false;
    }

    private static void ConfigureAssetsClient(HttpClient client)
    {
        client.DefaultRequestHeaders.Remove("X-Service-Key");
        client.DefaultRequestHeaders.Remove("X-Internal-Key");
        client.DefaultRequestHeaders.Remove("X-GW-Internal");

        var serviceKey = Environment.GetEnvironmentVariable("INTERNAL_SERVICE_KEY")
            ?? Environment.GetEnvironmentVariable("INTERNAL_API_KEY");
        if (!string.IsNullOrWhiteSpace(serviceKey))
        {
            client.DefaultRequestHeaders.TryAddWithoutValidation("X-Service-Key", serviceKey.Trim());
            client.DefaultRequestHeaders.TryAddWithoutValidation("X-Internal-Key", serviceKey.Trim());
        }

        client.DefaultRequestHeaders.TryAddWithoutValidation("X-GW-Internal", "1");
    }

    private static IEnumerable<string> BuildAssetsClearUrls(int trailerId)
    {
        var bases = new[]
        {
            Environment.GetEnvironmentVariable("RAILWAY_SERVICE_TAYLOR_ASSETS_URL"),
            Environment.GetEnvironmentVariable("TTAC_TAYLOR_ASSETS_BACKEND_URL"),
            Environment.GetEnvironmentVariable("TAYLOR_ASSETS_API_URL"),
            "https://taylor-assets-production.up.railway.app",
            "https://ttac-gateway-production.up.railway.app/api/v1/open/taylor-assets"
        }
        .Where(v => !string.IsNullOrWhiteSpace(v))
        .Select(v => v!.Trim().TrimEnd('/'))
        .Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (var b in bases)
        {
            yield return $"{b}/internal/trailers/{trailerId}";
            yield return $"{b}/internal/equipment/{trailerId}";
            yield return $"{b}/api/v1/trailers/{trailerId}";
            yield return $"{b}/api/v1/equipment/{trailerId}";
        }
    }
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
    public int? LastAssignedDriverId { get; set; }
    public string? LastAssignedDriverName { get; set; }
    public DateTime? InactivatedAt { get; set; }
}

public class TrailerAssignmentBulkUpsertRequest
{
    public List<TrailerAssignmentBulkItem>? Items { get; set; }
}

public class TrailerAssignmentBulkItem : TrailerAssignmentUpsertRequest
{
    public string TrailerId { get; set; } = string.Empty;
}
