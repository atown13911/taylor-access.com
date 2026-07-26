using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/fuel-card-assignments")]
[Authorize]
public class FuelCardAssignmentsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public FuelCardAssignmentsController(
        TaylorAccessDbContext context,
        CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetAssignments()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var query = _context.FuelCardAssignments.AsNoTracking().AsQueryable();
        if (!hasUnrestrictedAccess)
        {
            var orgId = user.OrganizationId ?? 0;
            query = orgId > 0
                ? query.Where(a => a.OrganizationId == orgId || a.OrganizationId == 0)
                : query.Where(a => a.OrganizationId == 0);
        }

        var preferredOrgId = user.OrganizationId ?? 0;
        var entities = await query
            .OrderByDescending(a => a.UpdatedAt)
            .Take(5000)
            .ToListAsync();

        // The same card may have rows in multiple orgs; show the preferred-org (then newest) row.
        var rows = entities
            .GroupBy(a => a.CardId, StringComparer.OrdinalIgnoreCase)
            .Select(g => g
                .OrderByDescending(a => preferredOrgId > 0 && a.OrganizationId == preferredOrgId)
                .ThenByDescending(a => a.UpdatedAt)
                .First())
            .Select(MapAssignment)
            .ToList();

        return Ok(new { data = rows });
    }

    [HttpPost("bulk-upsert")]
    public async Task<ActionResult<object>> BulkUpsert([FromBody] FuelCardAssignmentBulkUpsertRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not authenticated" });

        var items = request.Items ?? new List<FuelCardAssignmentItem>();
        if (items.Count == 0)
            return Ok(new { upserted = 0, removed = 0 });

        var hasUnrestrictedAccess = user.IsProductOwner() || user.IsSuperAdmin();
        var organizationId = user.OrganizationId ?? 0;
        if (!hasUnrestrictedAccess && organizationId <= 0)
            organizationId = 0;

        var upserted = 0;
        var removed = 0;

        foreach (var item in items)
        {
            var cardId = (item.CardId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(cardId))
                continue;

            var assignment = await _context.FuelCardAssignments
                .FirstOrDefaultAsync(a => a.CardId == cardId && a.OrganizationId == organizationId);

            if (item.Remove == true)
            {
                if (assignment != null)
                {
                    _context.FuelCardAssignments.Remove(assignment);
                    removed++;
                }
                continue;
            }

            if (assignment == null)
            {
                assignment = new FuelCardAssignment
                {
                    CardId = cardId,
                    OrganizationId = organizationId,
                    CreatedAt = DateTime.UtcNow
                };
                _context.FuelCardAssignments.Add(assignment);
            }

            assignment.DriverId = (item.DriverId ?? string.Empty).Trim();
            assignment.DriverName = string.IsNullOrWhiteSpace(item.DriverName) ? null : item.DriverName.Trim();
            assignment.DriverEmail = string.IsNullOrWhiteSpace(item.DriverEmail) ? null : item.DriverEmail.Trim();
            assignment.AssignedByUserId = user.Id > 0 ? user.Id : null;
            assignment.AssignedBy = ResolveActorName(user);
            assignment.UpdatedAt = DateTime.UtcNow;
            upserted++;
        }

        await _context.SaveChangesAsync();
        return Ok(new { upserted, removed });
    }

    private static string ResolveActorName(Models.User user)
    {
        if (!string.IsNullOrWhiteSpace(user.Name)) return user.Name.Trim();
        if (!string.IsNullOrWhiteSpace(user.Email)) return user.Email;
        return $"User {user.Id}";
    }

    private static object MapAssignment(FuelCardAssignment a) => new
    {
        cardId = a.CardId,
        organizationId = a.OrganizationId,
        driverId = a.DriverId,
        driverName = a.DriverName,
        driverEmail = a.DriverEmail,
        assignedBy = a.AssignedBy,
        updatedAt = a.UpdatedAt
    };
}

public class FuelCardAssignmentBulkUpsertRequest
{
    public List<FuelCardAssignmentItem>? Items { get; set; }
}

public class FuelCardAssignmentItem
{
    public string CardId { get; set; } = string.Empty;
    public string? DriverId { get; set; }
    public string? DriverName { get; set; }
    public string? DriverEmail { get; set; }
    /// <summary>When true, deletes the override so Motive's own assignment shows again.</summary>
    public bool? Remove { get; set; }
}
