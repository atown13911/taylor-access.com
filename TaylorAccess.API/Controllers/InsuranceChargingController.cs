using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/insurance-charging")]
[Authorize]
public class InsuranceChargingController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public InsuranceChargingController(
        TaylorAccessDbContext context,
        CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet("snapshots")]
    public async Task<ActionResult<object>> GetSnapshot(
        [FromQuery] string periodType,
        [FromQuery] string periodKey)
    {
        var (organizationId, error) = await ResolveOrganizationIdAsync();
        if (error != null) return error;

        var normalizedType = NormalizePeriodType(periodType);
        var normalizedKey = (periodKey ?? string.Empty).Trim();
        if (normalizedType == null || string.IsNullOrWhiteSpace(normalizedKey))
            return BadRequest(new { error = "periodType and periodKey are required" });

        var snapshot = await _context.InsuranceChargingSnapshots
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.OrganizationId == organizationId
                && s.PeriodType == normalizedType
                && s.PeriodKey == normalizedKey);

        if (snapshot == null)
            return Ok(new { data = (object?)null });

        return Ok(new { data = MapSnapshot(snapshot) });
    }

    [HttpPut("snapshots")]
    public async Task<ActionResult<object>> UpsertSnapshot([FromBody] InsuranceChargingSnapshotUpsertRequest request)
    {
        var (organizationId, error) = await ResolveOrganizationIdAsync();
        if (error != null) return error;

        var normalizedType = NormalizePeriodType(request.PeriodType);
        var normalizedKey = (request.PeriodKey ?? string.Empty).Trim();
        if (normalizedType == null || string.IsNullOrWhiteSpace(normalizedKey))
            return BadRequest(new { error = "periodType and periodKey are required" });

        var summaryLinesJson = NormalizeJsonArray(request.SummaryLinesJson ?? request.SummaryLines);
        var matrixJson = NormalizeJsonObject(request.MatrixJson ?? request.Matrix);
        var reportMetaJson = NormalizeJsonObject(request.ReportMetaJson ?? request.ReportMeta);

        var snapshot = await _context.InsuranceChargingSnapshots
            .FirstOrDefaultAsync(s => s.OrganizationId == organizationId
                && s.PeriodType == normalizedType
                && s.PeriodKey == normalizedKey);

        if (snapshot == null)
        {
            snapshot = new InsuranceChargingSnapshot
            {
                OrganizationId = organizationId,
                PeriodType = normalizedType,
                PeriodKey = normalizedKey,
                CreatedAt = DateTime.UtcNow
            };
            _context.InsuranceChargingSnapshots.Add(snapshot);
        }

        snapshot.ActiveTruckCount = request.ActiveTruckCount;
        snapshot.ActiveDriverHeadcount = request.ActiveDriverHeadcount;
        snapshot.DriverChargesAnnual = request.DriverChargesAnnual;
        snapshot.CompanyCostAnnual = request.CompanyCostAnnual;
        snapshot.DriverChargesPeriod = request.DriverChargesPeriod;
        snapshot.CompanyCostPeriod = request.CompanyCostPeriod;
        snapshot.TotalPeriod = request.TotalPeriod;
        snapshot.SummaryLinesJson = summaryLinesJson;
        snapshot.MatrixJson = matrixJson;
        snapshot.ReportMetaJson = reportMetaJson == "{}" ? null : reportMetaJson;
        snapshot.ComputedAt = request.ComputedAt ?? DateTime.UtcNow;
        snapshot.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { data = MapSnapshot(snapshot) });
    }

    [HttpGet("accounting-invoices")]
    public async Task<ActionResult<object>> GetAccountingInvoiceCache([FromQuery] string monthApplicable)
    {
        var (organizationId, error) = await ResolveOrganizationIdAsync();
        if (error != null) return error;

        var normalizedKey = NormalizeInvoiceCacheKey(monthApplicable);
        if (normalizedKey == null)
            return BadRequest(new { error = "monthApplicable is required" });

        var cache = await _context.InsuranceAccountingInvoiceCaches
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.OrganizationId == organizationId
                && c.MonthApplicable == normalizedKey);

        if (cache == null)
            return Ok(new { data = Array.Empty<object>(), fetchedAt = (DateTime?)null });

        var invoices = ParseJsonArray(cache.InvoicesJson);
        return Ok(new { data = invoices, fetchedAt = cache.FetchedAt, monthApplicable = cache.MonthApplicable });
    }

    [HttpPut("accounting-invoices")]
    public async Task<ActionResult<object>> UpsertAccountingInvoiceCache([FromBody] InsuranceAccountingInvoiceCacheUpsertRequest request)
    {
        var (organizationId, error) = await ResolveOrganizationIdAsync();
        if (error != null) return error;

        var normalizedKey = NormalizeInvoiceCacheKey(request.MonthApplicable);
        if (normalizedKey == null)
            return BadRequest(new { error = "monthApplicable is required" });

        var invoicesJson = NormalizeJsonArray(request.InvoicesJson ?? request.Invoices);

        var cache = await _context.InsuranceAccountingInvoiceCaches
            .FirstOrDefaultAsync(c => c.OrganizationId == organizationId
                && c.MonthApplicable == normalizedKey);

        if (cache == null)
        {
            cache = new InsuranceAccountingInvoiceCache
            {
                OrganizationId = organizationId,
                MonthApplicable = normalizedKey,
                CreatedAt = DateTime.UtcNow
            };
            _context.InsuranceAccountingInvoiceCaches.Add(cache);
        }

        cache.InvoicesJson = invoicesJson;
        cache.FetchedAt = request.FetchedAt ?? DateTime.UtcNow;
        cache.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            monthApplicable = cache.MonthApplicable,
            count = ParseJsonArray(cache.InvoicesJson).Count,
            fetchedAt = cache.FetchedAt
        });
    }

    private static object MapSnapshot(InsuranceChargingSnapshot snapshot) => new
    {
        periodType = snapshot.PeriodType,
        periodKey = snapshot.PeriodKey,
        activeTruckCount = snapshot.ActiveTruckCount,
        activeDriverHeadcount = snapshot.ActiveDriverHeadcount,
        driverChargesAnnual = snapshot.DriverChargesAnnual,
        companyCostAnnual = snapshot.CompanyCostAnnual,
        driverChargesPeriod = snapshot.DriverChargesPeriod,
        companyCostPeriod = snapshot.CompanyCostPeriod,
        totalPeriod = snapshot.TotalPeriod,
        summaryLines = ParseJsonArray(snapshot.SummaryLinesJson),
        matrix = ParseJsonObject(snapshot.MatrixJson),
        reportMeta = string.IsNullOrWhiteSpace(snapshot.ReportMetaJson)
            ? null
            : ParseJsonObject(snapshot.ReportMetaJson),
        computedAt = snapshot.ComputedAt,
        updatedAt = snapshot.UpdatedAt
    };

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

    private static string? NormalizeInvoiceCacheKey(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized)) return null;
        if (System.Text.RegularExpressions.Regex.IsMatch(normalized, @"^\d{4}-\d{2}$")) return normalized;
        if (System.Text.RegularExpressions.Regex.IsMatch(normalized, @"^\d{4}$")) return normalized;
        if (System.Text.RegularExpressions.Regex.IsMatch(normalized, @"^(daily|weekly|monthly|yearly):.+$")) return normalized;
        if (normalized.Length >= 7 && System.Text.RegularExpressions.Regex.IsMatch(normalized[..7], @"^\d{4}-\d{2}$"))
            return normalized[..7];
        return normalized.Length <= 30 ? normalized : null;
    }

    private static string NormalizeJsonArray(object? value)
    {
        if (value == null) return "[]";
        if (value is string raw)
            return string.IsNullOrWhiteSpace(raw) ? "[]" : raw;
        return JsonSerializer.Serialize(value);
    }

    private static string NormalizeJsonObject(object? value)
    {
        if (value == null) return "{}";
        if (value is string raw)
            return string.IsNullOrWhiteSpace(raw) ? "{}" : raw;
        return JsonSerializer.Serialize(value);
    }

    private static List<object> ParseJsonArray(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "[]" : json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
                return new List<object>();
            return doc.RootElement.EnumerateArray()
                .Select(e => JsonSerializer.Deserialize<object>(e.GetRawText())!)
                .ToList();
        }
        catch
        {
            return new List<object>();
        }
    }

    private static object? ParseJsonObject(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            return JsonSerializer.Deserialize<object>(doc.RootElement.GetRawText());
        }
        catch
        {
            return new { };
        }
    }
}

public class InsuranceChargingSnapshotUpsertRequest
{
    public string PeriodType { get; set; } = string.Empty;
    public string PeriodKey { get; set; } = string.Empty;
    public int ActiveTruckCount { get; set; }
    public int ActiveDriverHeadcount { get; set; }
    public decimal DriverChargesAnnual { get; set; }
    public decimal CompanyCostAnnual { get; set; }
    public decimal DriverChargesPeriod { get; set; }
    public decimal CompanyCostPeriod { get; set; }
    public decimal TotalPeriod { get; set; }
    public object? SummaryLines { get; set; }
    public string? SummaryLinesJson { get; set; }
    public object? Matrix { get; set; }
    public string? MatrixJson { get; set; }
    public object? ReportMeta { get; set; }
    public string? ReportMetaJson { get; set; }
    public DateTime? ComputedAt { get; set; }
}

public class InsuranceAccountingInvoiceCacheUpsertRequest
{
    public string MonthApplicable { get; set; } = string.Empty;
    public object? Invoices { get; set; }
    public string? InvoicesJson { get; set; }
    public DateTime? FetchedAt { get; set; }
}
