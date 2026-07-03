using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/trailer-photos")]
[Authorize]
public class TrailerPhotosController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public TrailerPhotosController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    private IQueryable<TrailerPhoto> FilterPhotosByUser(IQueryable<TrailerPhoto> query, Models.User user, bool hasUnrestrictedAccess)
    {
        if (hasUnrestrictedAccess)
            return query;

        if (user.OrganizationId is int orgId && orgId > 0)
            return query.Where(p => p.OrganizationId == orgId || p.OrganizationId == 0);

        return query.Where(p => p.OrganizationId == 0);
    }

    private IQueryable<TrailerPhoto> BuildPhotoQuery(Models.User user, bool hasUnrestrictedAccess) =>
        FilterPhotosByUser(_context.TrailerPhotos.AsNoTracking().AsQueryable(), user, hasUnrestrictedAccess);

    [HttpGet]
    public async Task<ActionResult<object>> GetTrailerPhotos([FromQuery] string? trailerIds)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var organizationId = user.OrganizationId ?? 0;

        var idList = (trailerIds ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var query = BuildPhotoQuery(user, hasUnrestrictedAccess);

        var assignmentQuery = _context.TrailerAssignments.AsNoTracking().AsQueryable();
        if (!hasUnrestrictedAccess && organizationId > 0)
            assignmentQuery = assignmentQuery.Where(a => a.OrganizationId == organizationId || a.OrganizationId == 0);

        var assignments = await assignmentQuery.ToListAsync();
        var expandedIds = ExpandTrailerIdAliases(idList, assignments);

        var allPhotos = await query
            .OrderByDescending(p => p.UpdatedAt)
            .ThenByDescending(p => p.Id)
            .Select(p => new
            {
                p.TrailerId,
                p.Id,
                p.UpdatedAt
            })
            .ToListAsync();

        var photos = idList.Length == 0
            ? allPhotos
            : allPhotos.Where(p => expandedIds.Contains(p.TrailerId)).ToList();

        var result = photos
            .GroupBy(p => p.TrailerId, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var latest = g.First();
                var canonicalTrailerId = ResolveCanonicalTrailerId(g.Key, idList, assignments);
                return new
                {
                    trailerId = canonicalTrailerId,
                    sourceTrailerId = g.Key,
                    photoCount = g.Count(),
                    latestPhotoId = latest.Id,
                    photoUrl = BuildPhotoViewUrl(latest.Id),
                    updatedAt = latest.UpdatedAt
                };
            })
            .GroupBy(p => p.trailerId, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var best = g.OrderByDescending(x => x.updatedAt).First();
                return new
                {
                    best.trailerId,
                    photoCount = g.Sum(x => x.photoCount),
                    latestPhotoId = best.latestPhotoId,
                    photoUrl = best.photoUrl,
                    updatedAt = best.updatedAt
                };
            })
            .ToList();

        return Ok(new { data = result });
    }

    private static HashSet<string> ExpandTrailerIdAliases(
        IEnumerable<string> seedIds,
        IReadOnlyList<TrailerAssignment> assignments)
    {
        var expanded = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var seed in seedIds)
        {
            var normalizedSeed = NormalizeTrailerId(seed);
            if (string.IsNullOrWhiteSpace(normalizedSeed)) continue;
            expanded.Add(normalizedSeed);
        }

        var changed = true;
        while (changed)
        {
            changed = false;
            foreach (var assignment in assignments)
            {
                var aliases = new[]
                {
                    assignment.TrailerId,
                    assignment.PermitNumber,
                    assignment.AssignedTruckNumber
                };

                var touches = aliases.Any(alias =>
                    !string.IsNullOrWhiteSpace(alias) && expanded.Contains(alias.Trim()));

                if (!touches) continue;

                foreach (var alias in aliases)
                {
                    var normalized = NormalizeTrailerId(alias);
                    if (string.IsNullOrWhiteSpace(normalized)) continue;
                    if (expanded.Add(normalized))
                        changed = true;
                }
            }
        }

        return expanded;
    }

    private static string ResolveCanonicalTrailerId(
        string photoTrailerId,
        string[] requestedIds,
        IReadOnlyList<TrailerAssignment> assignments)
    {
        if (requestedIds.Contains(photoTrailerId, StringComparer.OrdinalIgnoreCase))
            return photoTrailerId;

        foreach (var assignment in assignments)
        {
            if (!TrailerIdMatches(photoTrailerId, assignment.TrailerId)
                && !TrailerIdMatches(photoTrailerId, assignment.PermitNumber)
                && !TrailerIdMatches(photoTrailerId, assignment.AssignedTruckNumber))
                continue;

            if (requestedIds.Contains(assignment.TrailerId, StringComparer.OrdinalIgnoreCase))
                return assignment.TrailerId;
            if (!string.IsNullOrWhiteSpace(assignment.PermitNumber)
                && requestedIds.Contains(assignment.PermitNumber, StringComparer.OrdinalIgnoreCase))
                return assignment.PermitNumber;
            if (!string.IsNullOrWhiteSpace(assignment.AssignedTruckNumber)
                && requestedIds.Contains(assignment.AssignedTruckNumber, StringComparer.OrdinalIgnoreCase))
                return assignment.AssignedTruckNumber;
            return assignment.TrailerId;
        }

        return photoTrailerId;
    }

    private static bool TrailerIdMatches(string left, string? right) =>
        !string.IsNullOrWhiteSpace(right)
        && string.Equals(NormalizeTrailerId(left), NormalizeTrailerId(right), StringComparison.OrdinalIgnoreCase);

    [HttpPost("{trailerId}/upload")]
    [RequestSizeLimit(25 * 1024 * 1024)]
    public async Task<ActionResult<object>> UploadTrailerPhoto([FromRoute] string trailerId, [FromForm] IFormFile file)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var normalizedTrailerId = NormalizeTrailerId(trailerId);
        if (string.IsNullOrWhiteSpace(normalizedTrailerId))
            return BadRequest(new { error = "Trailer id is required" });
        if (file == null || file.Length <= 0)
            return BadRequest(new { error = "No file provided" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var organizationId = user.OrganizationId ?? 0;
        if (!hasUnrestrictedAccess && organizationId <= 0)
            organizationId = 0;

        var assignmentQuery = _context.TrailerAssignments.AsNoTracking().AsQueryable();
        if (!hasUnrestrictedAccess && organizationId > 0)
            assignmentQuery = assignmentQuery.Where(a => a.OrganizationId == organizationId || a.OrganizationId == 0);

        var assignments = await assignmentQuery.ToListAsync();
        var expandedIds = ExpandTrailerIdAliases(new[] { normalizedTrailerId }, assignments);
        var preferredTrailerId = assignments
            .Where(a =>
                expandedIds.Contains(a.TrailerId)
                || (!string.IsNullOrWhiteSpace(a.PermitNumber) && expandedIds.Contains(a.PermitNumber))
                || (!string.IsNullOrWhiteSpace(a.AssignedTruckNumber) && expandedIds.Contains(a.AssignedTruckNumber)))
            .Select(a => a.PermitNumber)
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
            ?? normalizedTrailerId;

        using var memoryStream = new MemoryStream();
        await file.CopyToAsync(memoryStream);
        var base64Content = Convert.ToBase64String(memoryStream.ToArray());

        var photo = new TrailerPhoto
        {
            TrailerId = NormalizeTrailerId(preferredTrailerId),
            OrganizationId = organizationId,
            FileName = file.FileName,
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            FileSize = file.Length,
            FileContent = base64Content,
            UploadedByUserId = user.Id > 0 ? user.Id : null,
            UploadedBy = user.Email,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _context.TrailerPhotos.Add(photo);

        await _context.SaveChangesAsync();

        return Ok(new
        {
            id = photo.Id,
            trailerId = photo.TrailerId,
            photoUrl = BuildPhotoViewUrl(photo.Id),
            latestPhotoUrl = BuildViewUrl(photo.TrailerId)
        });
    }

    [HttpGet("{trailerId}/photos")]
    public async Task<ActionResult<object>> GetTrailerPhotoList([FromRoute] string trailerId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();

        var normalizedTrailerId = NormalizeTrailerId(trailerId);
        if (string.IsNullOrWhiteSpace(normalizedTrailerId))
            return BadRequest(new { error = "Trailer id is required" });

        var query = BuildPhotoQuery(user, hasUnrestrictedAccess);

        var organizationId = user.OrganizationId ?? 0;
        var assignmentQuery = _context.TrailerAssignments.AsNoTracking().AsQueryable();
        if (!hasUnrestrictedAccess && organizationId > 0)
            assignmentQuery = assignmentQuery.Where(a => a.OrganizationId == organizationId || a.OrganizationId == 0);

        var assignments = await assignmentQuery.ToListAsync();
        var expandedIds = ExpandTrailerIdAliases(new[] { normalizedTrailerId }, assignments);

        var allPhotos = await query
            .OrderByDescending(p => p.CreatedAt)
            .ThenByDescending(p => p.Id)
            .Select(p => new
            {
                p.Id,
                p.TrailerId,
                p.FileName,
                p.ContentType,
                p.FileSize,
                p.UploadedBy,
                p.CreatedAt,
                p.UpdatedAt
            })
            .ToListAsync();

        var photos = allPhotos
            .Where(p => expandedIds.Contains(p.TrailerId))
            .Select(p => new
            {
                p.Id,
                p.TrailerId,
                p.FileName,
                p.ContentType,
                p.FileSize,
                p.UploadedBy,
                p.CreatedAt,
                p.UpdatedAt,
                photoUrl = BuildPhotoViewUrl(p.Id)
            })
            .ToList();

        return Ok(new { data = photos });
    }

    [HttpGet("{trailerId}/view")]
    public async Task<ActionResult> ViewTrailerPhoto([FromRoute] string trailerId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();

        var normalizedTrailerId = NormalizeTrailerId(trailerId);
        if (string.IsNullOrWhiteSpace(normalizedTrailerId))
            return BadRequest(new { error = "Trailer id is required" });

        var query = BuildPhotoQuery(user, hasUnrestrictedAccess);

        var organizationId = user.OrganizationId ?? 0;
        var assignmentQuery = _context.TrailerAssignments.AsNoTracking().AsQueryable();
        if (!hasUnrestrictedAccess && organizationId > 0)
            assignmentQuery = assignmentQuery.Where(a => a.OrganizationId == organizationId || a.OrganizationId == 0);

        var assignments = await assignmentQuery.ToListAsync();
        var expandedIds = ExpandTrailerIdAliases(new[] { normalizedTrailerId }, assignments);

        var candidates = await query
            .OrderByDescending(p => p.UpdatedAt)
            .ToListAsync();

        var photo = candidates.FirstOrDefault(p => expandedIds.Contains(p.TrailerId));

        if (photo == null || string.IsNullOrWhiteSpace(photo.FileContent))
            return NotFound(new { error = "Trailer photo not found" });

        var bytes = Convert.FromBase64String(photo.FileContent);
        var contentType = string.IsNullOrWhiteSpace(photo.ContentType) ? "application/octet-stream" : photo.ContentType;
        var safeFileName = string.IsNullOrWhiteSpace(photo.FileName) ? $"trailer-{normalizedTrailerId}" : photo.FileName;
        Response.Headers.Append("Content-Disposition", $"inline; filename=\"{safeFileName}\"");
        return File(bytes, contentType);
    }

    [HttpGet("photo/{photoId:int}/view")]
    public async Task<ActionResult> ViewTrailerPhotoById([FromRoute] int photoId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();

        var query = BuildPhotoQuery(user, hasUnrestrictedAccess);

        var photo = await query.FirstOrDefaultAsync(p => p.Id == photoId);
        if (photo == null || string.IsNullOrWhiteSpace(photo.FileContent))
            return NotFound(new { error = "Trailer photo not found" });

        var bytes = Convert.FromBase64String(photo.FileContent);
        var contentType = string.IsNullOrWhiteSpace(photo.ContentType) ? "application/octet-stream" : photo.ContentType;
        var safeFileName = string.IsNullOrWhiteSpace(photo.FileName) ? $"trailer-{photo.TrailerId}-{photo.Id}" : photo.FileName;
        Response.Headers.Append("Content-Disposition", $"inline; filename=\"{safeFileName}\"");
        return File(bytes, contentType);
    }

    [HttpDelete("photo/{photoId:int}")]
    public async Task<ActionResult<object>> DeleteTrailerPhoto([FromRoute] int photoId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();

        var query = FilterPhotosByUser(_context.TrailerPhotos.AsQueryable(), user, hasUnrestrictedAccess);

        var photo = await query.FirstOrDefaultAsync(p => p.Id == photoId);
        if (photo == null)
            return NotFound(new { error = "Trailer photo not found" });

        _context.TrailerPhotos.Remove(photo);
        await _context.SaveChangesAsync();
        return Ok(new { success = true, id = photoId });
    }

    private static string NormalizeTrailerId(string? trailerId) =>
        (trailerId ?? string.Empty).Trim();

    private string BuildViewUrl(string trailerId)
    {
        var encodedTrailerId = Uri.EscapeDataString(trailerId);
        return $"/api/v1/trailer-photos/{encodedTrailerId}/view";
    }

    private static string BuildPhotoViewUrl(int photoId) =>
        $"/api/v1/trailer-photos/photo/{photoId}/view";
}
