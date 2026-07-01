using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaylorAccess.API.Controllers;
using TaylorAccess.API.Data;

namespace TaylorAccess.API.Services;

/// <summary>
/// Nightly Motive driver-analysis pull (scorecard, utilization, HOS, safety, inspections)
/// saved to <see cref="Models.MotivDriverAnalysisCache"/> for VanTac Analysis / Driver Breakdown.
/// Runs every day at 23:00 America/New_York.
/// </summary>
public sealed class MotiveDriverAnalysisScheduledRefreshService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<MotiveDriverAnalysisScheduledRefreshService> _logger;

    private static readonly TimeZoneInfo EasternZone = ResolveEasternZone();

    public MotiveDriverAnalysisScheduledRefreshService(
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<MotiveDriverAnalysisScheduledRefreshService> logger)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!IsEnabled())
        {
            _logger.LogInformation("[Motive cron] Nightly driver-analysis refresh is disabled.");
            return;
        }

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken);
            await RunRefreshAsync("startup-catchup", stoppingToken, onlyIfStale: true);
        }
        catch (OperationCanceledException)
        {
            return;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Motive cron] Startup catch-up failed.");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = ComputeDelayUntilNextRun(DateTimeOffset.UtcNow);
            _logger.LogInformation(
                "[Motive cron] Next 11:00 PM ET Motive refresh scheduled in ~{Hours:F1}h.",
                delay.TotalHours);

            try
            {
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            try
            {
                await RunRefreshAsync("nightly-2300-et", stoppingToken, onlyIfStale: false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Motive cron] Nightly Motive refresh failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private bool IsEnabled()
    {
        var flag = _config["MotiveAnalysis:NightlyRefreshEnabled"]
            ?? Environment.GetEnvironmentVariable("MOTIVE_ANALYSIS_NIGHTLY_REFRESH_ENABLED");
        if (string.IsNullOrWhiteSpace(flag))
            return true;
        return !string.Equals(flag.Trim(), "false", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(flag.Trim(), "0", StringComparison.OrdinalIgnoreCase);
    }

    private async Task RunRefreshAsync(string trigger, CancellationToken ct, bool onlyIfStale)
    {
        var todayEt = TodayEt();
        var ranges = BuildAnalysisRanges(todayEt).ToList();

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaylorAccessDbContext>();

        var orgIds = await db.Organizations.AsNoTracking()
            .OrderBy(o => o.Id)
            .Select(o => (int?)o.Id)
            .ToListAsync(ct);

        if (orgIds.Count == 0)
            orgIds.Add(null);

        if (onlyIfStale)
        {
            var ytd = ranges.First(r => r.Label == "ytd");
            var orgKey = orgIds[0];
            var freshEnough = await db.MotivDriverAnalysisCaches.AsNoTracking()
                .AnyAsync(x =>
                    x.OrganizationId == orgKey
                    && x.StartDate == ytd.Start
                    && x.EndDate == ytd.End
                    && x.RefreshedAt >= DateTime.UtcNow.AddHours(-20),
                    ct);
            if (freshEnough)
            {
                _logger.LogInformation("[Motive cron] YTD cache is fresh; skipping startup catch-up.");
                return;
            }
        }

        _logger.LogInformation(
            "[Motive cron] Driver-analysis refresh starting (trigger={Trigger}, orgs={OrgCount}, ranges={RangeCount}).",
            trigger,
            orgIds.Count,
            ranges.Count);

        var completed = 0;
        foreach (var orgId in orgIds)
        {
            foreach (var range in ranges)
            {
                ct.ThrowIfCancellationRequested();
                var refreshKey = MotiveDriverAnalysisHelpers.BuildRefreshKey(orgId, range.Start, range.End);
                if (!MotiveDriverAnalysisRefreshTracker.TryStart(refreshKey))
                {
                    _logger.LogInformation(
                        "[Motive cron] Skipping {Label} {Start:yyyy-MM-dd}..{End:yyyy-MM-dd} org={OrgId} (refresh already active).",
                        range.Label,
                        range.Start,
                        range.End,
                        orgId);
                    continue;
                }

                try
                {
                    await using var workerScope = _scopeFactory.CreateAsyncScope();
                    var worker = ActivatorUtilities.CreateInstance<MotivController>(workerScope.ServiceProvider);
                    await worker.ExecuteDriverAnalysisRefreshAsync(orgId, range.Start, range.End);
                    completed++;
                    _logger.LogInformation(
                        "[Motive cron] Cached {Label} {Start:yyyy-MM-dd}..{End:yyyy-MM-dd} org={OrgId}.",
                        range.Label,
                        range.Start,
                        range.End,
                        orgId);
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "[Motive cron] Refresh failed for {Label} {Start:yyyy-MM-dd}..{End:yyyy-MM-dd} org={OrgId}.",
                        range.Label,
                        range.Start,
                        range.End,
                        orgId);
                }
                finally
                {
                    MotiveDriverAnalysisRefreshTracker.Complete(refreshKey);
                }
            }
        }

        _logger.LogInformation(
            "[Motive cron] Driver-analysis refresh finished (trigger={Trigger}, completed={Completed}).",
            trigger,
            completed);
    }

    /// <summary>Match VanTac Analysis tab period ranges anchored to today (ET).</summary>
    private static IEnumerable<(DateTime Start, DateTime End, string Label)> BuildAnalysisRanges(DateTime todayEt)
    {
        yield return (todayEt, todayEt, "day");

        var dow = (int)todayEt.DayOfWeek;
        var mondayOffset = dow == 0 ? -6 : 1 - dow;
        var weekStart = todayEt.AddDays(mondayOffset);
        var weekEnd = weekStart.AddDays(6);
        yield return (weekStart, weekEnd, "week");

        var monthStart = new DateTime(todayEt.Year, todayEt.Month, 1);
        var monthEnd = new DateTime(todayEt.Year, todayEt.Month, DateTime.DaysInMonth(todayEt.Year, todayEt.Month));
        yield return (monthStart, monthEnd, "month");

        var ytdStart = new DateTime(todayEt.Year, 1, 1);
        yield return (ytdStart, todayEt, "ytd");
    }

    private static DateTime TodayEt()
        => TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, EasternZone).Date;

    private TimeSpan ComputeDelayUntilNextRun(DateTimeOffset utcNow)
    {
        var hour = 23;
        var minute = 0;
        if (int.TryParse(_config["MotiveAnalysis:NightlyRefreshHourEt"], out var cfgHour))
            hour = Math.Clamp(cfgHour, 0, 23);
        if (int.TryParse(_config["MotiveAnalysis:NightlyRefreshMinute"], out var cfgMinute))
            minute = Math.Clamp(cfgMinute, 0, 59);
        if (int.TryParse(Environment.GetEnvironmentVariable("MOTIVE_ANALYSIS_NIGHTLY_HOUR_ET"), out var envHour))
            hour = Math.Clamp(envHour, 0, 23);

        var nowEt = TimeZoneInfo.ConvertTime(utcNow, EasternZone);
        for (var dayOffset = 0; dayOffset <= 1; dayOffset++)
        {
            var date = nowEt.Date.AddDays(dayOffset);
            var localUnspecified = new DateTime(date.Year, date.Month, date.Day, hour, minute, 0, DateTimeKind.Unspecified);
            var offset = EasternZone.GetUtcOffset(localUnspecified);
            var candidate = new DateTimeOffset(localUnspecified, offset);
            if (candidate > utcNow)
                return candidate - utcNow;
        }

        return TimeSpan.FromHours(24);
    }

    private static TimeZoneInfo ResolveEasternZone()
    {
        foreach (var id in new[] { "America/New_York", "Eastern Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch
            {
                // Try next tz id (Linux vs Windows).
            }
        }

        return TimeZoneInfo.Utc;
    }
}
