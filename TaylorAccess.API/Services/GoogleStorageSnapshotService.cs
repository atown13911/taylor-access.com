using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

/// <summary>
/// Captures a daily per-user Google Workspace storage snapshot into GoogleStorageSnapshots.
/// Runs shortly after startup and then every 12 hours; the unique (ReportDate, Email) index
/// makes repeat runs for the same report date no-ops, so history accrues one row per user per day.
/// Snapshots include restricted (hidden) accounts even though the UI filters them.
/// </summary>
public sealed class GoogleStorageSnapshotService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(12);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<GoogleStorageSnapshotService> _logger;

    public GoogleStorageSnapshotService(
        IServiceScopeFactory scopeFactory,
        ILogger<GoogleStorageSnapshotService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CaptureAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Google storage] Snapshot capture failed.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task CaptureAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var directory = scope.ServiceProvider.GetRequiredService<GoogleDirectoryService>();
        var db = scope.ServiceProvider.GetRequiredService<TaylorAccessDbContext>();

        var (usage, reportDate, error) = await directory.GetStorageUsageAsync(includeHidden: true, ct);
        if (usage == null || usage.Count == 0 || reportDate == null)
        {
            if (error != null)
                _logger.LogWarning("[Google storage] Usage fetch failed: {Error}", error);
            return;
        }

        var date = DateTime.Parse(reportDate);
        var existing = await db.GoogleStorageSnapshots
            .Where(s => s.ReportDate == date)
            .Select(s => s.Email)
            .ToListAsync(ct);
        var existingSet = existing.ToHashSet(StringComparer.OrdinalIgnoreCase);

        var added = 0;
        foreach (var row in usage)
        {
            // Guards against both prior runs and duplicate emails within one report.
            if (!existingSet.Add(row.Email))
                continue;

            db.GoogleStorageSnapshots.Add(new GoogleStorageSnapshot
            {
                ReportDate = date,
                Email = row.Email,
                UsedMb = row.UsedMb,
                DriveMb = row.DriveMb,
                GmailMb = row.GmailMb,
                PhotosMb = row.PhotosMb,
                UsedPercent = row.UsedPercent
            });
            added++;
        }

        if (added > 0)
        {
            await db.SaveChangesAsync(ct);
            _logger.LogInformation(
                "[Google storage] Saved {Count} storage snapshots for report date {Date}.", added, reportDate);
        }
        else
        {
            _logger.LogInformation(
                "[Google storage] Snapshots for report date {Date} already captured.", reportDate);
        }
    }
}
