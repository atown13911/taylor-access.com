using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

internal static class MotivActivityLogReadHelper
{
    internal static DateTime? ParseDateBoundary(string? input, bool endOfDay)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        if (!DateTime.TryParse(input, out var dt)) return null;

        var boundary = endOfDay
            ? dt.Date.AddDays(1).AddTicks(-1)
            : dt.Date;

        return DateTime.SpecifyKind(boundary, DateTimeKind.Utc);
    }

    internal static async Task<IQueryable<MotivActivityLog>> ApplyUserOrgScopeAsync(
        IQueryable<MotivActivityLog> query,
        CurrentUserService currentUserService,
        Func<Task<int>> resolvePrimaryOrgIdAsync)
    {
        if (await currentUserService.ShouldBypassOrgFilterAsync())
            return query;

        var allowedOrgIds = (await currentUserService.GetUserOrganizationIdsAsync())
            .Where(id => id > 0)
            .Distinct()
            .ToList();

        var primaryOrgId = await resolvePrimaryOrgIdAsync();
        if (primaryOrgId > 0 && !allowedOrgIds.Contains(primaryOrgId))
            allowedOrgIds.Add(primaryOrgId);

        if (allowedOrgIds.Count == 0)
            return query.Where(x => x.OrganizationId == null);

        return query.Where(x =>
            x.OrganizationId == null
            || (x.OrganizationId.HasValue && allowedOrgIds.Contains(x.OrganizationId.Value)));
    }

    internal static IQueryable<MotivActivityLog> ApplyFilters(
        IQueryable<MotivActivityLog> query,
        string? kind,
        string? scope,
        string? search,
        string? driverName,
        DateTime? fromUtc,
        DateTime? toUtc)
    {
        var normalizedKind = NormalizeActivityKind(kind);
        var normalizedScope = (scope ?? "").Trim().ToLowerInvariant();
        var normalizedSearch = (search ?? "").Trim();
        var normalizedDriver = (driverName ?? "").Trim();

        if (!string.IsNullOrWhiteSpace(normalizedKind))
            query = query.Where(x => x.Kind == normalizedKind);

        if (fromUtc.HasValue)
            query = query.Where(x => x.EventAt >= fromUtc.Value);

        if (toUtc.HasValue)
            query = query.Where(x => x.EventAt <= toUtc.Value);

        if (!string.IsNullOrWhiteSpace(normalizedDriver))
            query = query.Where(x => x.DriverName != null && EF.Functions.ILike(x.DriverName, $"%{normalizedDriver}%"));

        if (normalizedScope == "driver")
            query = query.Where(x => x.DriverName != null && x.DriverName != "");
        else if (normalizedScope == "system")
            query = query.Where(x => x.DriverName == null || x.DriverName == "");

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            query = query.Where(x =>
                EF.Functions.ILike(x.Title, $"%{normalizedSearch}%")
                || EF.Functions.ILike(x.Details, $"%{normalizedSearch}%")
                || (x.DriverName != null && EF.Functions.ILike(x.DriverName, $"%{normalizedSearch}%")));
        }

        return query;
    }

    internal static string? NormalizeActivityKind(string? kind)
    {
        var normalized = (kind ?? "").Trim().ToLowerInvariant();
        return normalized switch
        {
            "info" => "info",
            "success" => "success",
            "warning" => "warning",
            "error" => "error",
            "" => null,
            _ => "info"
        };
    }
}
