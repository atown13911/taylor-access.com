using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

/// <summary>
/// Computes monthly insurance fleet-cost estimates (Fleet Cost vs. Driver Charges)
/// for Accounting actual-vs-estimate comparison when snapshots are missing.
/// </summary>
public class InsuranceChargingEstimateService
{
    private static readonly HashSet<string> CompanyExpensePolicyTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "cargo",
        "trailer_interchange"
    };

    private static readonly HashSet<string> ActiveDriverStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "active", "available", "dispatched", "en-route", "at-location", "online"
    };

    private static readonly HashSet<string> OnboardingStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "onboarding", "pending"
    };

    private readonly TaylorAccessDbContext _db;
    private readonly ILogger<InsuranceChargingEstimateService> _logger;

    public InsuranceChargingEstimateService(
        TaylorAccessDbContext db,
        ILogger<InsuranceChargingEstimateService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<int> ResolveOrganizationIdAsync(
        int? organizationId = null,
        string? organizationName = null,
        CancellationToken ct = default)
    {
        if (organizationId is > 0)
            return organizationId.Value;

        var name = (organizationName ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(name))
        {
            var byName = await _db.Organizations.AsNoTracking()
                .Where(o => o.Name == name)
                .Select(o => (int?)o.Id)
                .FirstOrDefaultAsync(ct);
            if (byName is > 0)
                return byName.Value;
        }

        // Prefer Landmark Trucking for Accounting OpEx comparisons.
        var landmark = await _db.Organizations.AsNoTracking()
            .Where(o => o.Name == "Landmark Trucking")
            .Select(o => (int?)o.Id)
            .FirstOrDefaultAsync(ct);
        if (landmark is > 0)
            return landmark.Value;

        var withPolicies = await _db.InsurancePolicies.AsNoTracking()
            .GroupBy(p => p.OrganizationId)
            .OrderByDescending(g => g.Count())
            .Select(g => (int?)g.Key)
            .FirstOrDefaultAsync(ct);
        if (withPolicies is > 0)
            return withPolicies.Value;

        return await _db.Organizations.AsNoTracking()
            .OrderBy(o => o.Id)
            .Select(o => o.Id)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<IReadOnlyList<InsuranceEstimateMonth>> GetOrComputeYearEstimatesAsync(
        int organizationId,
        int year,
        bool persistMissingSnapshots = true,
        CancellationToken ct = default)
    {
        var yearPrefix = $"{year}-";
        var existing = await _db.InsuranceChargingSnapshots
            .AsNoTracking()
            .Where(s => s.OrganizationId == organizationId
                && s.PeriodType == "monthly"
                && s.PeriodKey.StartsWith(yearPrefix))
            .ToListAsync(ct);

        var byMonth = existing
            .Where(s => s.PeriodKey.Length >= 7)
            .GroupBy(s => s.PeriodKey[..7])
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.UpdatedAt).First(), StringComparer.Ordinal);

        var missingMonths = Enumerable.Range(1, 12)
            .Select(m => $"{year}-{m:D2}")
            .Where(key => !byMonth.ContainsKey(key) || byMonth[key].TotalPeriod <= 0m)
            .ToList();

        if (missingMonths.Count > 0)
        {
            var computed = await ComputeYearMonthsAsync(organizationId, year, ct);
            foreach (var month in computed)
            {
                if (byMonth.TryGetValue(month.PeriodKey, out var snap) && snap.TotalPeriod > 0m)
                    continue;
                byMonth[month.PeriodKey] = new InsuranceChargingSnapshot
                {
                    OrganizationId = organizationId,
                    PeriodType = "monthly",
                    PeriodKey = month.PeriodKey,
                    ActiveTruckCount = month.ActiveTruckCount,
                    ActiveDriverHeadcount = month.ActiveDriverHeadcount,
                    DriverChargesPeriod = month.DriverChargesPeriod,
                    CompanyCostPeriod = month.CompanyCostPeriod,
                    TotalPeriod = month.TotalPeriod,
                    ComputedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
            }

            if (persistMissingSnapshots)
            {
                try
                {
                    await PersistComputedMonthsAsync(organizationId, computed, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to persist computed insurance charging snapshots for org {Org} year {Year}", organizationId, year);
                }
            }
        }

        return Enumerable.Range(1, 12)
            .Select(month =>
            {
                var key = $"{year}-{month:D2}";
                if (byMonth.TryGetValue(key, out var snap))
                {
                    return new InsuranceEstimateMonth(
                        key,
                        snap.ActiveTruckCount,
                        snap.ActiveDriverHeadcount,
                        snap.DriverChargesPeriod,
                        snap.CompanyCostPeriod,
                        snap.TotalPeriod,
                        snap.ComputedAt);
                }

                return new InsuranceEstimateMonth(key, 0, 0, 0m, 0m, 0m, null);
            })
            .ToList();
    }

    private async Task PersistComputedMonthsAsync(
        int organizationId,
        IReadOnlyList<InsuranceEstimateMonth> months,
        CancellationToken ct)
    {
        foreach (var month in months.Where(m => m.TotalPeriod > 0m || m.ActiveTruckCount > 0))
        {
            var snapshot = await _db.InsuranceChargingSnapshots
                .FirstOrDefaultAsync(s => s.OrganizationId == organizationId
                    && s.PeriodType == "monthly"
                    && s.PeriodKey == month.PeriodKey, ct);

            if (snapshot == null)
            {
                snapshot = new InsuranceChargingSnapshot
                {
                    OrganizationId = organizationId,
                    PeriodType = "monthly",
                    PeriodKey = month.PeriodKey,
                    SummaryLinesJson = "[]",
                    MatrixJson = "{}",
                    CreatedAt = DateTime.UtcNow
                };
                _db.InsuranceChargingSnapshots.Add(snapshot);
            }

            snapshot.ActiveTruckCount = month.ActiveTruckCount;
            snapshot.ActiveDriverHeadcount = month.ActiveDriverHeadcount;
            snapshot.DriverChargesPeriod = month.DriverChargesPeriod;
            snapshot.CompanyCostPeriod = month.CompanyCostPeriod;
            snapshot.TotalPeriod = month.TotalPeriod;
            snapshot.DriverChargesAnnual = RoundMoney(month.DriverChargesPeriod * 12m);
            snapshot.CompanyCostAnnual = RoundMoney(month.CompanyCostPeriod * 12m);
            snapshot.ComputedAt = DateTime.UtcNow;
            snapshot.UpdatedAt = DateTime.UtcNow;
            if (string.IsNullOrWhiteSpace(snapshot.SummaryLinesJson))
                snapshot.SummaryLinesJson = "[]";
            if (string.IsNullOrWhiteSpace(snapshot.MatrixJson))
                snapshot.MatrixJson = "{}";
        }

        await _db.SaveChangesAsync(ct);
    }

    private async Task<IReadOnlyList<InsuranceEstimateMonth>> ComputeYearMonthsAsync(
        int organizationId,
        int year,
        CancellationToken ct)
    {
        var policies = await _db.InsurancePolicies.AsNoTracking()
            .Where(p => p.OrganizationId == organizationId
                && (p.Status == "active" || p.Status == "expiring")
                && p.PremiumCost != null
                && p.PremiumCost > 0m)
            .ToListAsync(ct);

        var chargeable = SelectChargeablePolicies(policies);

        var drivers = await _db.Drivers.AsNoTracking()
            .Where(d => d.OrganizationId == organizationId && !d.IsDeleted)
            .Select(d => new DriverLite(
                d.Id,
                d.Status,
                d.TruckNumber,
                d.HireDate,
                d.TerminationDate))
            .ToListAsync(ct);

        var results = new List<InsuranceEstimateMonth>();
        var now = DateTime.UtcNow.Date;

        for (var month = 1; month <= 12; month++)
        {
            var monthStart = new DateOnly(year, month, 1);
            var monthEnd = monthStart.AddMonths(1).AddDays(-1);
            var isCurrentMonth = year == now.Year && month == now.Month;

            var eligible = drivers
                .Where(d => IsDriverEligible(d, monthStart, monthEnd, isCurrentMonth))
                .ToList();
            var truckCount = CountUniqueTrucks(eligible);
            var driverHeadcount = eligible.Count;

            decimal driverCharges = 0m;
            decimal companyCost = 0m;

            foreach (var policy in chargeable)
            {
                var monthly = ToMonthly(policy.PremiumCost ?? 0m, policy.BillingFrequency);
                if (monthly <= 0m) continue;

                var type = (policy.PolicyType ?? string.Empty).Trim().ToLowerInvariant();
                var basis = (policy.ExpenseBasis ?? string.Empty).Trim().ToLowerInvariant();
                var isCompany = CompanyExpensePolicyTypes.Contains(type)
                    || basis is "whole_policy" or "company";

                if (isCompany)
                    companyCost += monthly;
                else
                    driverCharges += monthly * truckCount;
            }

            driverCharges = RoundMoney(driverCharges);
            companyCost = RoundMoney(companyCost);
            results.Add(new InsuranceEstimateMonth(
                $"{year}-{month:D2}",
                truckCount,
                driverHeadcount,
                driverCharges,
                companyCost,
                RoundMoney(driverCharges + companyCost),
                DateTime.UtcNow));
        }

        return results;
    }

    private static List<InsurancePolicy> SelectChargeablePolicies(List<InsurancePolicy> policies)
    {
        // Prefer one current policy per type (latest effective date, then highest id).
        return policies
            .GroupBy(p => (p.PolicyType ?? string.Empty).Trim().ToLowerInvariant())
            .Where(g => !string.IsNullOrWhiteSpace(g.Key))
            .Select(g => g
                .OrderByDescending(p => p.EffectiveDate ?? DateTime.MinValue)
                .ThenByDescending(p => p.Id)
                .First())
            // Skip zero-cost bundled children that are typically included in parent policies.
            .Where(p => (p.PremiumCost ?? 0m) > 0m)
            .Where(p =>
            {
                var type = (p.PolicyType ?? string.Empty).Trim().ToLowerInvariant();
                if (type is "trailer_interchange" or "non_trucking")
                    return (p.PremiumCost ?? 0m) > 0m;
                return true;
            })
            .ToList();
    }

    private static bool IsDriverEligible(DriverLite driver, DateOnly start, DateOnly end, bool isCurrentMonth)
    {
        var status = (driver.Status ?? string.Empty).Trim().ToLowerInvariant();
        if (OnboardingStatuses.Contains(status)) return false;
        if (driver.HireDate.HasValue && driver.HireDate.Value > end) return false;

        if (isCurrentMonth)
            return ActiveDriverStatuses.Contains(status);

        if (ActiveDriverStatuses.Contains(status))
            return true;

        if (!driver.TerminationDate.HasValue) return false;
        if (driver.TerminationDate.Value < start) return false;
        var hire = driver.HireDate ?? driver.TerminationDate.Value;
        return hire <= end;
    }

    private static int CountUniqueTrucks(IEnumerable<DriverLite> drivers)
    {
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var driver in drivers)
        {
            var truck = NormalizeTruck(driver.TruckNumber);
            keys.Add(!string.IsNullOrWhiteSpace(truck) ? $"truck:{truck}" : $"driver:{driver.Id}");
        }
        return keys.Count;
    }

    private static string NormalizeTruck(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        return value.Replace(" ", "", StringComparison.Ordinal)
            .Replace("-", "", StringComparison.Ordinal)
            .Trim()
            .ToUpperInvariant();
    }

    private static decimal ToMonthly(decimal amount, string? billingFrequency)
    {
        return (billingFrequency ?? "monthly").Trim().ToLowerInvariant() switch
        {
            "quarterly" => amount / 3m,
            "semi_annual" => amount / 6m,
            "annual" or "yearly" => amount / 12m,
            _ => amount
        };
    }

    private static decimal RoundMoney(decimal amount) =>
        Math.Round(amount, 2, MidpointRounding.AwayFromZero);

    private sealed record DriverLite(
        int Id,
        string Status,
        string? TruckNumber,
        DateOnly? HireDate,
        DateOnly? TerminationDate);
}

public sealed record InsuranceEstimateMonth(
    string PeriodKey,
    int ActiveTruckCount,
    int ActiveDriverHeadcount,
    decimal DriverChargesPeriod,
    decimal CompanyCostPeriod,
    decimal TotalPeriod,
    DateTime? ComputedAt);
