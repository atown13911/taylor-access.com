using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/insurance-fleet-driver-overrides")]
[Authorize]
public class InsuranceFleetDriverOverridesController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public InsuranceFleetDriverOverridesController(
        TaylorAccessDbContext context,
        CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetOverrides(
        [FromQuery] string periodType,
        [FromQuery] string periodKey)
    {
        var (organizationId, error) = await ResolveOrganizationIdAsync();
        if (error != null) return error;

        if (string.IsNullOrWhiteSpace(periodType) || string.IsNullOrWhiteSpace(periodKey))
            return BadRequest(new { error = "periodType and periodKey are required" });

        var normalizedType = NormalizePeriodType(periodType);
        var normalizedKey = periodKey.Trim();
        if (normalizedType == null)
            return BadRequest(new { error = "Invalid periodType" });

        var rows = await _context.InsuranceFleetDriverPeriodOverrides
            .AsNoTracking()
            .Where(o => o.OrganizationId == organizationId
                && o.PeriodType == normalizedType
                && o.PeriodKey == normalizedKey)
            .OrderBy(o => o.DriverId)
            .Select(o => new { o.DriverId, o.InclusionState, o.UpdatedAt })
            .ToListAsync();

        var data = rows.ToDictionary(
            r => r.DriverId.ToString(),
            r => r.InclusionState,
            StringComparer.Ordinal);

        return Ok(new
        {
            periodType = normalizedType,
            periodKey = normalizedKey,
            organizationId,
            data,
            updatedAt = rows.Count == 0 ? (DateTime?)null : rows.Max(r => r.UpdatedAt)
        });
    }

    [HttpPut("{driverId:int}")]
    public async Task<ActionResult<object>> UpsertOverride(
        int driverId,
        [FromBody] InsuranceFleetDriverOverrideUpsertRequest request)
    {
        if (driverId <= 0)
            return BadRequest(new { error = "Invalid driver id" });

        var (organizationId, error) = await ResolveOrganizationIdAsync();
        if (error != null) return error;

        var normalizedType = NormalizePeriodType(request.PeriodType);
        var normalizedKey = (request.PeriodKey ?? string.Empty).Trim();
        if (normalizedType == null || string.IsNullOrWhiteSpace(normalizedKey))
            return BadRequest(new { error = "periodType and periodKey are required" });

        var inclusionState = NormalizeInclusionState(request.InclusionState);
        if (request.InclusionState != null && inclusionState == null)
            return BadRequest(new { error = "Invalid inclusionState" });

        var existing = await _context.InsuranceFleetDriverPeriodOverrides
            .FirstOrDefaultAsync(o => o.OrganizationId == organizationId
                && o.PeriodType == normalizedType
                && o.PeriodKey == normalizedKey
                && o.DriverId == driverId);

        if (inclusionState == null)
        {
            if (existing != null)
            {
                _context.InsuranceFleetDriverPeriodOverrides.Remove(existing);
                await _context.SaveChangesAsync();
            }

            return Ok(new
            {
                driverId,
                periodType = normalizedType,
                periodKey = normalizedKey,
                inclusionState = (string?)null,
                deleted = existing != null
            });
        }

        if (existing == null)
        {
            existing = new InsuranceFleetDriverPeriodOverride
            {
                OrganizationId = organizationId,
                PeriodType = normalizedType,
                PeriodKey = normalizedKey,
                DriverId = driverId,
                InclusionState = inclusionState,
                CreatedAt = DateTime.UtcNow
            };
            _context.InsuranceFleetDriverPeriodOverrides.Add(existing);
        }
        else
        {
            existing.InclusionState = inclusionState;
        }

        existing.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new
        {
            driverId,
            periodType = normalizedType,
            periodKey = normalizedKey,
            inclusionState,
            updatedAt = existing.UpdatedAt
        });
    }

    [HttpDelete]
    public async Task<ActionResult<object>> DeleteOverridesForPeriod(
        [FromQuery] string periodType,
        [FromQuery] string periodKey)
    {
        var (organizationId, error) = await ResolveOrganizationIdAsync();
        if (error != null) return error;

        var normalizedType = NormalizePeriodType(periodType);
        var normalizedKey = (periodKey ?? string.Empty).Trim();
        if (normalizedType == null || string.IsNullOrWhiteSpace(normalizedKey))
            return BadRequest(new { error = "periodType and periodKey are required" });

        var rows = await _context.InsuranceFleetDriverPeriodOverrides
            .Where(o => o.OrganizationId == organizationId
                && o.PeriodType == normalizedType
                && o.PeriodKey == normalizedKey)
            .ToListAsync();

        if (rows.Count > 0)
        {
            _context.InsuranceFleetDriverPeriodOverrides.RemoveRange(rows);
            await _context.SaveChangesAsync();
        }

        return Ok(new
        {
            periodType = normalizedType,
            periodKey = normalizedKey,
            deleted = rows.Count
        });
    }

    [HttpPost("bulk-migrate")]
    public async Task<ActionResult<object>> BulkMigrate([FromBody] InsuranceFleetDriverOverrideBulkMigrateRequest request)
    {
        var (organizationId, error) = await ResolveOrganizationIdAsync();
        if (error != null) return error;

        var items = request.Items ?? new List<InsuranceFleetDriverOverrideBulkItem>();
        if (items.Count == 0)
            return Ok(new { migrated = 0 });

        var migrated = 0;
        foreach (var item in items)
        {
            if (item.DriverId <= 0) continue;

            var normalizedType = NormalizePeriodType(item.PeriodType);
            var normalizedKey = (item.PeriodKey ?? string.Empty).Trim();
            var inclusionState = NormalizeInclusionState(item.InclusionState);
            if (normalizedType == null || string.IsNullOrWhiteSpace(normalizedKey) || inclusionState == null)
                continue;

            var existing = await _context.InsuranceFleetDriverPeriodOverrides
                .FirstOrDefaultAsync(o => o.OrganizationId == organizationId
                    && o.PeriodType == normalizedType
                    && o.PeriodKey == normalizedKey
                    && o.DriverId == item.DriverId);

            if (existing == null)
            {
                existing = new InsuranceFleetDriverPeriodOverride
                {
                    OrganizationId = organizationId,
                    PeriodType = normalizedType,
                    PeriodKey = normalizedKey,
                    DriverId = item.DriverId,
                    InclusionState = inclusionState,
                    CreatedAt = DateTime.UtcNow
                };
                _context.InsuranceFleetDriverPeriodOverrides.Add(existing);
            }
            else
            {
                existing.InclusionState = inclusionState;
            }

            existing.UpdatedAt = DateTime.UtcNow;
            migrated++;
        }

        await _context.SaveChangesAsync();
        return Ok(new { migrated });
    }

    private async Task<(int organizationId, ActionResult? error)> ResolveOrganizationIdAsync()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
            return (0, Unauthorized(new { error = "Not authenticated" }));

        var organizationId = user.OrganizationId ?? 0;
        if (organizationId <= 0)
        {
            var orgIds = await _currentUserService.GetUserOrganizationIdsAsync();
            organizationId = orgIds.FirstOrDefault();
        }

        if (organizationId <= 0)
            return (0, BadRequest(new { error = "No organization assigned" }));

        if (!await _currentUserService.ShouldBypassOrgFilterAsync())
        {
            var allowedOrgIds = await _currentUserService.GetAllowedOrganizationIdsAsync();
            if (!allowedOrgIds.Contains(organizationId))
                return (0, Forbid());
        }

        return (organizationId, null);
    }

    private static string? NormalizePeriodType(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "daily" or "weekly" or "monthly" or "yearly" => normalized,
            _ => null
        };
    }

    private static string? NormalizeInclusionState(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "" or "null" => null,
            "included" or "excluded" => normalized,
            _ => null
        };
    }
}

public class InsuranceFleetDriverOverrideUpsertRequest
{
    public string PeriodType { get; set; } = string.Empty;
    public string PeriodKey { get; set; } = string.Empty;
    public string? InclusionState { get; set; }
}

public class InsuranceFleetDriverOverrideBulkMigrateRequest
{
    public List<InsuranceFleetDriverOverrideBulkItem>? Items { get; set; }
}

public class InsuranceFleetDriverOverrideBulkItem
{
    public string PeriodType { get; set; } = string.Empty;
    public string PeriodKey { get; set; } = string.Empty;
    public int DriverId { get; set; }
    public string InclusionState { get; set; } = string.Empty;
}
