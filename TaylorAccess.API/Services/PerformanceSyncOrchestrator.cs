using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public sealed class PerformanceSyncRequest
{
    public string PeriodMode { get; set; } = "weekly";
    public DateTime FromDate { get; set; }
    public DateTime ToDate { get; set; }
    public string Trigger { get; set; } = "manual-update";
    public int GmailSkipUsers { get; set; }
}

public sealed class PerformanceSyncResult
{
    public int SyncRunId { get; init; }
    public string Status { get; init; } = "complete";
    public object Completeness { get; init; } = new { };
    public int ScorecardRows { get; init; }
    public int AdditionalRows { get; init; }
    public string? Error { get; init; }
}

public class PerformanceSyncOrchestrator
{
    private readonly TaylorAccessDbContext _context;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PerformanceSyncOrchestrator> _logger;

    public PerformanceSyncOrchestrator(
        TaylorAccessDbContext context,
        IServiceScopeFactory scopeFactory,
        ILogger<PerformanceSyncOrchestrator> logger)
    {
        _context = context;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task<PerformanceSyncResult> RunAsync(
        int organizationId,
        PerformanceSyncRequest request,
        CancellationToken cancellationToken = default)
    {
        var from = request.FromDate.Date;
        var to = request.ToDate.Date;
        if (to < from) (from, to) = (to, from);
        var periodMode = string.IsNullOrWhiteSpace(request.PeriodMode) ? "weekly" : request.PeriodMode.Trim().ToLowerInvariant();

        var run = new PerformanceSyncRun
        {
            OrganizationId = organizationId,
            PeriodMode = periodMode,
            FromDate = from,
            ToDate = to,
            Status = "running",
            Trigger = request.Trigger,
            StartedAt = DateTime.UtcNow
        };
        _context.PerformanceSyncRuns.Add(run);
        await _context.SaveChangesAsync(cancellationToken);

        try
        {
            var employees = await _context.Users.AsNoTracking()
                .Where(u => u.Status == "active")
                .Select(u => new { u.Id, u.Name, u.Email, u.ZoomEmail, u.PersonalEmail })
                .ToListAsync(cancellationToken);

            // Separate scopes so Zoom + Gmail can run in parallel without sharing DbContext.
            ZoomDirectMetricsResult zoom;
            GmailDirectMetricsResult gmail;
            using (var zoomScope = _scopeFactory.CreateScope())
            using (var gmailScope = _scopeFactory.CreateScope())
            {
                var zoomSvc = zoomScope.ServiceProvider.GetRequiredService<ZoomDirectMetricsService>();
                var gmailSvc = gmailScope.ServiceProvider.GetRequiredService<GmailDirectMetricsService>();
                var zoomTask = zoomSvc.GetUserMetricsAsync(from, to, organizationId, cancellationToken);
                var gmailTask = gmailSvc.GetUserMetricsAsync(
                    from, to, organizationId, maxUsers: 50, skipUsers: request.GmailSkipUsers, cancellationToken);
                await Task.WhenAll(zoomTask, gmailTask);
                zoom = await zoomTask;
                gmail = await gmailTask;
            }

            var timeclock = await AggregateTimeclockAsync(from, to, cancellationToken);

            var zoomByEmail = zoom.Metrics
                .Where(m => !string.IsNullOrWhiteSpace(m.Email))
                .GroupBy(m => m.Email!.Trim().ToLowerInvariant())
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            var gmailByEmail = gmail.Metrics
                .Where(m => !string.IsNullOrWhiteSpace(m.Email))
                .GroupBy(m => m.Email.Trim().ToLowerInvariant())
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            var existingScore = await _context.PerformanceScorecardSnapshots
                .Where(r => r.OrganizationId == organizationId
                    && r.PeriodMode == periodMode
                    && r.FromDate == from
                    && r.ToDate == to)
                .ToListAsync(cancellationToken);
            var scoreByEmp = existingScore.ToDictionary(r => r.EmployeeId);

            var existingExtra = await _context.PerformanceAdditionalMetrics
                .Where(r => r.OrganizationId == organizationId
                    && r.PeriodMode == periodMode
                    && r.FromDate == from
                    && r.ToDate == to)
                .ToListAsync(cancellationToken);
            var extraByEmp = existingExtra.ToDictionary(r => r.EmployeeId);

            var now = DateTime.UtcNow;
            var scoreCount = 0;
            var extraCount = 0;

            foreach (var emp in employees)
            {
                var emails = new[] { emp.Email, emp.ZoomEmail, emp.PersonalEmail }
                    .Where(e => !string.IsNullOrWhiteSpace(e))
                    .Select(e => e!.Trim().ToLowerInvariant())
                    .Distinct()
                    .ToList();

                ZoomDirectUserMetric? z = null;
                foreach (var e in emails)
                {
                    if (zoomByEmail.TryGetValue(e, out z)) break;
                }

                GmailDirectUserMetric? g = null;
                foreach (var e in emails)
                {
                    if (gmailByEmail.TryGetValue(e, out g)) break;
                }

                timeclock.TryGetValue(emp.Id, out var tc);
                var clocked = tc.ClockedHours;
                var active = tc.ActiveHours;
                var idle = tc.IdleHours;
                var clicks = tc.ClickCount;
                var interactions = tc.InteractionCount;
                var presence = clocked > 0 ? Math.Round((double)(active / clocked), 4) : 0;
                var busy = Math.Max(presence, 0);

                if (!scoreByEmp.TryGetValue(emp.Id, out var scoreRow))
                {
                    scoreRow = new PerformanceScorecardSnapshot
                    {
                        OrganizationId = organizationId,
                        EmployeeId = emp.Id,
                        PeriodMode = periodMode,
                        FromDate = from,
                        ToDate = to,
                        CreatedAt = now
                    };
                    _context.PerformanceScorecardSnapshots.Add(scoreRow);
                    scoreByEmp[emp.Id] = scoreRow;
                }

                scoreRow.EmployeeName = emp.Name;
                scoreRow.SyncRunId = run.Id;

                // Zoom: never wipe prior call/SMS values when this run was incomplete or lacked a row.
                if (z != null)
                {
                    var nextCalls = z.TotalCalls;
                    var nextMinutes = Math.Round(z.TotalCallMinutes, 2);
                    var nextSms = z.SmsSessionCount;
                    scoreRow.CallVolume = zoom.CallsComplete
                        ? nextCalls
                        : Math.Max(scoreRow.CallVolume, nextCalls);
                    scoreRow.TotalCallMinutes = zoom.CallsComplete
                        ? nextMinutes
                        : Math.Max(scoreRow.TotalCallMinutes, nextMinutes);
                    scoreRow.AvgCallMinutes = scoreRow.CallVolume > 0
                        ? Math.Round(scoreRow.TotalCallMinutes / scoreRow.CallVolume, 2)
                        : 0;
                    scoreRow.TextVolume = zoom.SmsComplete
                        ? nextSms
                        : Math.Max(scoreRow.TextVolume, nextSms);
                }

                // Gmail is batched (~50 users/pass). Only overwrite when this pass returned a row.
                if (g != null)
                {
                    scoreRow.SentCount = g.SentCount;
                    scoreRow.ReplyCount = g.ReplyCount;
                    scoreRow.FirstResponseMinutes = g.FirstResponseMinutes;
                    scoreRow.FollowUpRate = g.FollowUpRate;
                    scoreRow.InternalCount = g.InternalCount;
                    scoreRow.ExternalCount = g.ExternalCount;
                }

                var callVol = scoreRow.CallVolume;
                var textVol = scoreRow.TextVolume;
                var sent = scoreRow.SentCount;
                var replies = scoreRow.ReplyCount;
                var score = Math.Clamp(
                    (int)Math.Round(
                        Math.Min(40, callVol * 0.4)
                        + Math.Min(20, textVol * 0.5)
                        + Math.Min(20, sent * 0.3 + replies * 0.4)
                        + Math.Min(20, busy * 20)),
                    0, 100);

                scoreRow.ClockedHours = clocked;
                scoreRow.ActiveHours = active;
                scoreRow.IdleHours = idle;
                scoreRow.PresenceRate = (decimal)presence;
                scoreRow.SystemRate = (decimal)presence;
                scoreRow.BusyRate = (decimal)busy;
                scoreRow.ClickCount = clicks;
                scoreRow.InteractionCount = interactions;
                scoreRow.Score = score;
                scoreRow.BusySource = callVol > 0 ? "zoom" : (sent > 0 ? "gmail" : (clocked > 0 ? "system" : "none"));
                scoreRow.Source = "access-direct";
                scoreRow.UpdatedAt = now;
                scoreCount++;

                if (!extraByEmp.TryGetValue(emp.Id, out var extraRow))
                {
                    extraRow = new PerformanceAdditionalMetric
                    {
                        OrganizationId = organizationId,
                        EmployeeId = emp.Id,
                        PeriodMode = periodMode,
                        FromDate = from,
                        ToDate = to,
                        CreatedAt = now
                    };
                    _context.PerformanceAdditionalMetrics.Add(extraRow);
                    extraByEmp[emp.Id] = extraRow;
                }

                extraRow.EmployeeName = emp.Name;
                extraRow.SyncRunId = run.Id;
                if (z != null)
                {
                    if (zoom.CallsComplete)
                    {
                        extraRow.Voicemails = z.Voicemails;
                        extraRow.VoicemailMinutes = Math.Round(z.VoicemailMinutes, 2);
                        extraRow.PhoneRecordings = z.PhoneRecordings;
                        extraRow.RecordingMinutes = Math.Round(z.RecordingMinutes, 2);
                        extraRow.MeetingsHosted = z.MeetingsHosted;
                        extraRow.MeetingsJoined = z.MeetingsJoined;
                        extraRow.MeetingMinutes = Math.Round(z.MeetingMinutes, 2);
                        extraRow.InboundCalls = z.InboundCalls;
                        extraRow.OutboundCalls = z.OutboundCalls;
                        extraRow.MissedCalls = z.MissedCalls;
                    }
                    else
                    {
                        extraRow.Voicemails = Math.Max(extraRow.Voicemails, z.Voicemails);
                        extraRow.VoicemailMinutes = Math.Max(extraRow.VoicemailMinutes, Math.Round(z.VoicemailMinutes, 2));
                        extraRow.PhoneRecordings = Math.Max(extraRow.PhoneRecordings, z.PhoneRecordings);
                        extraRow.RecordingMinutes = Math.Max(extraRow.RecordingMinutes, Math.Round(z.RecordingMinutes, 2));
                        extraRow.MeetingsHosted = Math.Max(extraRow.MeetingsHosted, z.MeetingsHosted);
                        extraRow.MeetingsJoined = Math.Max(extraRow.MeetingsJoined, z.MeetingsJoined);
                        extraRow.MeetingMinutes = Math.Max(extraRow.MeetingMinutes, Math.Round(z.MeetingMinutes, 2));
                        extraRow.InboundCalls = Math.Max(extraRow.InboundCalls, z.InboundCalls);
                        extraRow.OutboundCalls = Math.Max(extraRow.OutboundCalls, z.OutboundCalls);
                        extraRow.MissedCalls = Math.Max(extraRow.MissedCalls, z.MissedCalls);
                    }
                }
                extraRow.Source = "zoom-api-direct";
                extraRow.UpdatedAt = now;
                extraCount++;
            }

            var complete = zoom.Success
                && zoom.CallsComplete
                && zoom.SmsComplete
                && gmail.Success
                && gmail.Complete;
            var status = !zoom.Success && !gmail.Success ? "failed" : (complete ? "complete" : "partial");

            var completeness = new
            {
                zoomSuccess = zoom.Success,
                zoomError = zoom.Error,
                zoomCallPages = zoom.CallPages,
                zoomCallRows = zoom.CallLogRows,
                zoomCallsComplete = zoom.CallsComplete,
                zoomSmsUsersSynced = zoom.SmsUsersSynced,
                zoomSmsUsersTotal = zoom.SmsUsersTotal,
                zoomSmsComplete = zoom.SmsComplete,
                gmailSuccess = gmail.Success,
                gmailError = gmail.Error,
                gmailUsersSynced = gmail.UsersSynced,
                gmailUsersTotal = gmail.UsersTotal,
                gmailComplete = gmail.Complete,
                gmailNextSkip = gmail.Complete ? 0 : gmail.UsersSynced
            };

            run.Status = status;
            run.CompletenessJson = JsonSerializer.Serialize(completeness);
            run.FinishedAt = DateTime.UtcNow;
            if (status == "failed")
                run.ErrorMessage = zoom.Error ?? gmail.Error ?? "Sync failed";
            await _context.SaveChangesAsync(cancellationToken);

            return new PerformanceSyncResult
            {
                SyncRunId = run.Id,
                Status = status,
                Completeness = completeness,
                ScorecardRows = scoreCount,
                AdditionalRows = extraCount,
                Error = status == "failed" ? run.ErrorMessage : null
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Performance sync run {RunId} failed", run.Id);
            run.Status = "failed";
            run.ErrorMessage = ex.Message;
            run.FinishedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(cancellationToken);
            return new PerformanceSyncResult
            {
                SyncRunId = run.Id,
                Status = "failed",
                Error = ex.Message
            };
        }
    }

    private async Task<Dictionary<int, (decimal ClockedHours, decimal ActiveHours, decimal IdleHours, int ClickCount, int InteractionCount)>> AggregateTimeclockAsync(
        DateTime from,
        DateTime to,
        CancellationToken cancellationToken)
    {
        var fromDay = from.Date;
        var toDay = to.Date.AddDays(1);
        var sessions = await _context.TimeclockSessions.AsNoTracking()
            .Where(s => s.UserId != null && s.Date >= fromDay && s.Date < toDay)
            .Select(s => new
            {
                UserId = s.UserId!.Value,
                s.ActiveSeconds,
                s.IdleSeconds,
                s.ClickCount,
                s.KeypressCount,
                s.ScrollCount,
                s.RouteChangeCount
            })
            .ToListAsync(cancellationToken);

        var map = new Dictionary<int, (decimal ClockedHours, decimal ActiveHours, decimal IdleHours, int ClickCount, int InteractionCount)>();
        foreach (var group in sessions.GroupBy(s => s.UserId))
        {
            var activeSec = group.Sum(s => s.ActiveSeconds);
            var idleSec = group.Sum(s => s.IdleSeconds);
            var clicks = group.Sum(s => s.ClickCount);
            var interactions = group.Sum(s => s.ClickCount + s.KeypressCount + s.ScrollCount + s.RouteChangeCount);
            map[group.Key] = (
                Math.Round((decimal)(activeSec + idleSec) / 3600m, 2),
                Math.Round((decimal)activeSec / 3600m, 2),
                Math.Round((decimal)idleSec / 3600m, 2),
                clicks,
                interactions);
        }

        return map;
    }
}
