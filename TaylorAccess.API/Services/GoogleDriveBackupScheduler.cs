using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;

namespace TaylorAccess.API.Services;

/// <summary>
/// Keeps the Drive-to-bucket backup fresh: checks hourly and starts a pass whenever the
/// last completed run is more than 24 hours old. Interrupted runs (deploys/restarts)
/// resume on the next check, skipping files already backed up.
/// Disable with GOOGLE_DRIVE_BACKUP_ENABLED=false.
/// </summary>
public sealed class GoogleDriveBackupScheduler : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<GoogleDriveBackupScheduler> _logger;

    public GoogleDriveBackupScheduler(
        IServiceScopeFactory scopeFactory,
        ILogger<GoogleDriveBackupScheduler> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var flag = Environment.GetEnvironmentVariable("GOOGLE_DRIVE_BACKUP_ENABLED");
        if (string.Equals(flag?.Trim(), "false", StringComparison.OrdinalIgnoreCase) || flag?.Trim() == "0")
        {
            _logger.LogInformation("[Drive backup] Scheduler disabled via GOOGLE_DRIVE_BACKUP_ENABLED.");
            return;
        }

        try
        {
            await Task.Delay(TimeSpan.FromMinutes(3), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!GoogleDriveBackupWorker.IsRunning && await IsDueAsync(stoppingToken))
                {
                    await using var scope = _scopeFactory.CreateAsyncScope();
                    var worker = scope.ServiceProvider.GetRequiredService<GoogleDriveBackupWorker>();
                    await worker.RunAsync("scheduled", stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Drive backup] Scheduler pass failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task<bool> IsDueAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaylorAccessDbContext>();
        var cutoff = DateTime.UtcNow.AddHours(-24);
        var recent = await db.GoogleDriveBackupRuns.AsNoTracking()
            .AnyAsync(r => r.Status == "completed" && r.FinishedAt >= cutoff, ct);
        return !recent;
    }
}
