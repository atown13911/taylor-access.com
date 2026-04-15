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

    [HttpGet]
    public async Task<ActionResult<object>> GetTrailerPhotos([FromQuery] string? trailerIds)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        if (!hasUnrestrictedAccess && user.OrganizationId == null)
            return Unauthorized(new { message = "User must belong to an organization" });

        var idList = (trailerIds ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (idList.Length == 0) return Ok(new { data = Array.Empty<object>() });

        var query = _context.TrailerPhotos.AsNoTracking().AsQueryable();
        if (!hasUnrestrictedAccess)
            query = query.Where(p => p.OrganizationId == user.OrganizationId!.Value);

        var photos = await query
            .Where(p => idList.Contains(p.TrailerId))
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new
            {
                p.TrailerId,
                p.UpdatedAt
            })
            .ToListAsync();

        var result = photos
            .GroupBy(p => p.TrailerId, StringComparer.OrdinalIgnoreCase)
            .Select(g => new
            {
                trailerId = g.Key,
                photoUrl = BuildViewUrl(g.Key),
                updatedAt = g.First().UpdatedAt
            })
            .ToList();

        return Ok(new { data = result });
    }

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
            return Unauthorized(new { message = "User must belong to an organization" });

        using var memoryStream = new MemoryStream();
        await file.CopyToAsync(memoryStream);
        var base64Content = Convert.ToBase64String(memoryStream.ToArray());

        var existing = await _context.TrailerPhotos
            .FirstOrDefaultAsync(p => p.TrailerId == normalizedTrailerId && p.OrganizationId == organizationId);

        if (existing == null)
        {
            existing = new TrailerPhoto
            {
                TrailerId = normalizedTrailerId,
                OrganizationId = organizationId,
                CreatedAt = DateTime.UtcNow
            };
            _context.TrailerPhotos.Add(existing);
        }

        existing.FileName = file.FileName;
        existing.ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType;
        existing.FileSize = file.Length;
        existing.FileContent = base64Content;
        existing.UploadedByUserId = user.Id > 0 ? user.Id : null;
        existing.UploadedBy = user.Email;
        existing.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            id = existing.Id,
            trailerId = existing.TrailerId,
            photoUrl = BuildViewUrl(existing.TrailerId)
        });
    }

    [HttpGet("{trailerId}/view")]
    public async Task<ActionResult> ViewTrailerPhoto([FromRoute] string trailerId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        if (!hasUnrestrictedAccess && user.OrganizationId == null)
            return Unauthorized(new { message = "User must belong to an organization" });

        var normalizedTrailerId = NormalizeTrailerId(trailerId);
        var query = _context.TrailerPhotos.AsNoTracking().AsQueryable();
        if (!hasUnrestrictedAccess)
            query = query.Where(p => p.OrganizationId == user.OrganizationId!.Value);

        var photo = await query
            .Where(p => p.TrailerId == normalizedTrailerId)
            .OrderByDescending(p => p.UpdatedAt)
            .FirstOrDefaultAsync();

        if (photo == null || string.IsNullOrWhiteSpace(photo.FileContent))
            return NotFound(new { error = "Trailer photo not found" });

        var bytes = Convert.FromBase64String(photo.FileContent);
        var contentType = string.IsNullOrWhiteSpace(photo.ContentType) ? "application/octet-stream" : photo.ContentType;
        var safeFileName = string.IsNullOrWhiteSpace(photo.FileName) ? $"trailer-{normalizedTrailerId}" : photo.FileName;
        Response.Headers.Append("Content-Disposition", $"inline; filename=\"{safeFileName}\"");
        return File(bytes, contentType);
    }

    private static string NormalizeTrailerId(string? trailerId) =>
        (trailerId ?? string.Empty).Trim();

    private string BuildViewUrl(string trailerId)
    {
        var encodedTrailerId = Uri.EscapeDataString(trailerId);
        return $"/api/v1/trailer-photos/{encodedTrailerId}/view";
    }
}
