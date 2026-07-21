using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/office-inventory")]
[Authorize]
public class OfficeInventoryController : ControllerBase
{
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "computer", "phone", "monitor", "headset", "badge", "keys"
    };

    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public OfficeInventoryController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult> List(
        [FromQuery] string? assetType,
        [FromQuery] string? status,
        [FromQuery] int? organizationId,
        [FromQuery] int limit = 1000)
    {
        var orgId = await ResolveOrgIdAsync(organizationId);
        var query = _context.OfficeInventoryItems
            .AsNoTracking()
            .Include(i => i.AssignedUser)
            .AsQueryable();

        if (orgId.HasValue)
            query = query.Where(i => i.OrganizationId == orgId.Value);

        if (!string.IsNullOrWhiteSpace(assetType))
            query = query.Where(i => i.AssetType == assetType);

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(i => i.Status == status);

        var rows = await query
            .OrderBy(i => i.AssetType)
            .ThenBy(i => i.AssetTag)
            .Take(Math.Clamp(limit, 1, 2000))
            .ToListAsync();

        var items = rows.Select(i => new
        {
            i.Id,
            i.OrganizationId,
            i.AssetType,
            i.AssetTag,
            i.Label,
            i.Make,
            i.Model,
            i.SerialNumber,
            i.Status,
            i.AssignedUserId,
            AssignedUserName = i.AssignedUser?.Name,
            i.Notes,
            i.CreatedAt,
            i.UpdatedAt,
            DisplayName = BuildDisplayName(i.AssetTag, i.Label, i.Make, i.Model)
        }).ToList();

        return Ok(new { data = items });
    }

    [HttpPost]
    public async Task<ActionResult> Create([FromBody] OfficeInventoryUpsertRequest body)
    {
        var type = NormalizeType(body.AssetType);
        if (type == null)
            return BadRequest(new { error = "Invalid assetType. Use computer, phone, monitor, headset, badge, or keys." });

        var tag = (body.AssetTag || "").Trim();
        if (string.IsNullOrWhiteSpace(tag))
            return BadRequest(new { error = "Asset tag is required." });

        var orgId = await ResolveOrgIdAsync(body.OrganizationId);
        if (!orgId.HasValue)
            return BadRequest(new { error = "Organization is required." });

        var duplicate = await _context.OfficeInventoryItems
            .AnyAsync(i => i.OrganizationId == orgId.Value && i.AssetTag == tag);
        if (duplicate)
            return BadRequest(new { error = $"Asset tag '{tag}' already exists." });

        var item = new OfficeInventoryItem
        {
            OrganizationId = orgId.Value,
            AssetType = type,
            AssetTag = tag,
            Label = NullIfEmpty(body.Label),
            Make = NullIfEmpty(body.Make),
            Model = NullIfEmpty(body.Model),
            SerialNumber = NullIfEmpty(body.SerialNumber),
            Notes = NullIfEmpty(body.Notes),
            Status = string.IsNullOrWhiteSpace(body.Status) ? "available" : body.Status.Trim().ToLowerInvariant(),
            AssignedUserId = body.AssignedUserId
        };

        if (item.AssignedUserId.HasValue)
            item.Status = "assigned";

        _context.OfficeInventoryItems.Add(item);
        await _context.SaveChangesAsync();

        return Ok(new { data = await ProjectItemAsync(item.Id) });
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult> Update(int id, [FromBody] OfficeInventoryUpsertRequest body)
    {
        var item = await _context.OfficeInventoryItems.FindAsync(id);
        if (item == null) return NotFound(new { error = "Inventory item not found." });

        if (!string.IsNullOrWhiteSpace(body.AssetType))
        {
            var type = NormalizeType(body.AssetType);
            if (type == null)
                return BadRequest(new { error = "Invalid assetType." });
            item.AssetType = type;
        }

        if (!string.IsNullOrWhiteSpace(body.AssetTag))
        {
            var tag = body.AssetTag.Trim();
            var duplicate = await _context.OfficeInventoryItems
                .AnyAsync(i => i.OrganizationId == item.OrganizationId && i.AssetTag == tag && i.Id != id);
            if (duplicate)
                return BadRequest(new { error = $"Asset tag '{tag}' already exists." });
            item.AssetTag = tag;
        }

        if (body.Label != null) item.Label = NullIfEmpty(body.Label);
        if (body.Make != null) item.Make = NullIfEmpty(body.Make);
        if (body.Model != null) item.Model = NullIfEmpty(body.Model);
        if (body.SerialNumber != null) item.SerialNumber = NullIfEmpty(body.SerialNumber);
        if (body.Notes != null) item.Notes = NullIfEmpty(body.Notes);
        if (!string.IsNullOrWhiteSpace(body.Status))
            item.Status = body.Status.Trim().ToLowerInvariant();

        if (body.AssignedUserId.HasValue)
        {
            item.AssignedUserId = body.AssignedUserId;
            item.Status = body.AssignedUserId.Value > 0 ? "assigned" : "available";
            if (body.AssignedUserId.Value <= 0)
                item.AssignedUserId = null;
        }
        else if (body.ClearAssignment == true)
        {
            item.AssignedUserId = null;
            if (item.Status == "assigned") item.Status = "available";
        }

        item.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new { data = await ProjectItemAsync(item.Id) });
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id)
    {
        var item = await _context.OfficeInventoryItems.FindAsync(id);
        if (item == null) return NotFound(new { error = "Inventory item not found." });

        _context.OfficeInventoryItems.Remove(item);
        await _context.SaveChangesAsync();
        return Ok(new { message = "Inventory item deleted." });
    }

    /// <summary>
    /// Assign inventory selections to an employee and sync user equipment fields.
    /// </summary>
    [HttpPost("assign")]
    public async Task<ActionResult> Assign([FromBody] OfficeInventoryAssignRequest body)
    {
        if (body.UserId <= 0)
            return BadRequest(new { error = "UserId is required." });

        var user = await _context.Users.FindAsync(body.UserId);
        if (user == null) return NotFound(new { error = "User not found." });

        try
        {
            await ApplySlotAsync(user, "computer", body.ComputerId, v => user.Laptop = v);
            await ApplySlotAsync(user, "phone", body.PhoneId, v => user.IssuedPhone = v);
            await ApplySlotAsync(user, "monitor", body.MonitorId, v => user.Monitor = v);
            await ApplySlotAsync(user, "headset", body.HeadsetId, v => user.Headset = v);
            await ApplySlotAsync(user, "badge", body.BadgeId, v => user.AccessBadge = v);
            await ApplySlotAsync(user, "keys", body.KeysId, v => user.KeysFob = v);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }

        if (body.EquipmentNotes != null)
            user.EquipmentNotes = NullIfEmpty(body.EquipmentNotes);

        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new
        {
            data = new
            {
                user.Id,
                user.Laptop,
                user.IssuedPhone,
                user.AccessBadge,
                user.Headset,
                user.Monitor,
                user.KeysFob,
                user.EquipmentNotes
            }
        });
    }

    private async Task ApplySlotAsync(User user, string assetType, int? itemId, Action<string?> setUserField)
    {
        var currentlyAssigned = await _context.OfficeInventoryItems
            .Where(i => i.AssignedUserId == user.Id && i.AssetType == assetType)
            .ToListAsync();

        foreach (var existing in currentlyAssigned)
        {
            if (itemId.HasValue && existing.Id == itemId.Value) continue;
            existing.AssignedUserId = null;
            if (existing.Status == "assigned") existing.Status = "available";
            existing.UpdatedAt = DateTime.UtcNow;
        }

        if (!itemId.HasValue || itemId.Value <= 0)
        {
            setUserField(null);
            return;
        }

        var item = await _context.OfficeInventoryItems.FindAsync(itemId.Value);
        if (item == null || !string.Equals(item.AssetType, assetType, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Inventory item {itemId} is not a valid {assetType}.");

        if (item.AssignedUserId.HasValue && item.AssignedUserId.Value != user.Id)
        {
            // Reassign away from previous holder — clear that user's matching field if it points to this asset.
            var previous = await _context.Users.FindAsync(item.AssignedUserId.Value);
            if (previous != null)
                ClearUserFieldIfMatches(previous, assetType, BuildDisplayName(item.AssetTag, item.Label, item.Make, item.Model));
        }

        item.AssignedUserId = user.Id;
        item.Status = "assigned";
        item.UpdatedAt = DateTime.UtcNow;
        setUserField(BuildDisplayName(item.AssetTag, item.Label, item.Make, item.Model));
    }

    private static void ClearUserFieldIfMatches(User user, string assetType, string displayName)
    {
        switch (assetType)
        {
            case "computer":
                if (string.Equals(user.Laptop, displayName, StringComparison.OrdinalIgnoreCase)) user.Laptop = null;
                break;
            case "phone":
                if (string.Equals(user.IssuedPhone, displayName, StringComparison.OrdinalIgnoreCase)) user.IssuedPhone = null;
                break;
            case "monitor":
                if (string.Equals(user.Monitor, displayName, StringComparison.OrdinalIgnoreCase)) user.Monitor = null;
                break;
            case "headset":
                if (string.Equals(user.Headset, displayName, StringComparison.OrdinalIgnoreCase)) user.Headset = null;
                break;
            case "badge":
                if (string.Equals(user.AccessBadge, displayName, StringComparison.OrdinalIgnoreCase)) user.AccessBadge = null;
                break;
            case "keys":
                if (string.Equals(user.KeysFob, displayName, StringComparison.OrdinalIgnoreCase)) user.KeysFob = null;
                break;
        }
    }

    private async Task<object?> ProjectItemAsync(int id)
    {
        var i = await _context.OfficeInventoryItems
            .AsNoTracking()
            .Include(x => x.AssignedUser)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (i == null) return null;
        return new
        {
            i.Id,
            i.OrganizationId,
            i.AssetType,
            i.AssetTag,
            i.Label,
            i.Make,
            i.Model,
            i.SerialNumber,
            i.Status,
            i.AssignedUserId,
            AssignedUserName = i.AssignedUser?.Name,
            i.Notes,
            i.CreatedAt,
            i.UpdatedAt,
            DisplayName = BuildDisplayName(i.AssetTag, i.Label, i.Make, i.Model)
        };
    }

    private async Task<int?> ResolveOrgIdAsync(int? requested)
    {
        if (requested.HasValue && requested.Value > 0) return requested.Value;
        var user = await _currentUserService.GetUserAsync();
        return user?.OrganizationId;
    }

    private static string? NormalizeType(string? raw)
    {
        var type = (raw || "").Trim().ToLowerInvariant();
        return AllowedTypes.Contains(type) ? type : null;
    }

    private static string? NullIfEmpty(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string BuildDisplayName(string assetTag, string? label, string? make, string? model)
    {
        if (!string.IsNullOrWhiteSpace(label)) return $"{assetTag} — {label.Trim()}";
        var makeModel = string.Join(" ", new[] { make, model }.Where(s => !string.IsNullOrWhiteSpace(s))).Trim();
        return string.IsNullOrWhiteSpace(makeModel) ? assetTag : $"{assetTag} — {makeModel}";
    }
}

public class OfficeInventoryUpsertRequest
{
    public int? OrganizationId { get; set; }
    public string? AssetType { get; set; }
    public string? AssetTag { get; set; }
    public string? Label { get; set; }
    public string? Make { get; set; }
    public string? Model { get; set; }
    public string? SerialNumber { get; set; }
    public string? Status { get; set; }
    public int? AssignedUserId { get; set; }
    public bool? ClearAssignment { get; set; }
    public string? Notes { get; set; }
}

public class OfficeInventoryAssignRequest
{
    public int UserId { get; set; }
    public int? ComputerId { get; set; }
    public int? PhoneId { get; set; }
    public int? MonitorId { get; set; }
    public int? HeadsetId { get; set; }
    public int? BadgeId { get; set; }
    public int? KeysId { get; set; }
    public string? EquipmentNotes { get; set; }
}
