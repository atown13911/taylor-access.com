using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;

namespace TaylorAccess.API.Services;

/// <summary>
/// Keeps the Gmail-to-bucket backup fresh: checks hourly and starts a pass whenever
/// the last completed run is more than 24 hours old. Interrupted runs resume on the
/// next check, skipping messages already stored.
/// Disable with GOOGLE_GMAIL_BACKUP_ENABLED=false.
/// </summary>
public sealed class GoogleGmailBackupScheduler : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<GoogleGmailBackupScheduler> _logger;

    public GoogleGmailBackupScheduler(
        IServiceScopeFactory scopeFactory,
        ILogger<GoogleGmailBackupScheduler> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var flag = Environment.GetEnvironmentVariable("GOOGLE_GMAIL_BACKUP_ENABLED");
        if (string.Equals(flag?.Trim(), "false", StringComparison.OrdinalIgnoreCase) || flag?.Trim() == "0")
        {
            _logger.LogInformation("[Gmail backup] Scheduler disabled via GOOGLE_GMAIL_BACKUP_ENABLED.");
            return;
        }

        try
        {
            // Staggered behind the Drive scheduler so both don't spin up at once.
            await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!GoogleGmailBackupWorker.IsRunning && await IsDueAsync(stoppingToken))
                {
                    await using var scope = _scopeFactory.CreateAsyncScope();
                    var worker = scope.ServiceProvider.GetRequiredService<GoogleGmailBackupWorker>();
                    await worker.RunAsync("scheduled", stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Gmail backup] Scheduler pass failed.");
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
        var recent = await db.GoogleGmailBackupRuns.AsNoTracking()
            .AnyAsync(r => r.Status == "completed" && r.FinishedAt >= cutoff, ct);
        return !recent;
    }
}
