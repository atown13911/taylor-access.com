using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/timeclock")]
[Authorize]
public class TimeclockController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUser;

    public TimeclockController(TaylorAccessDbContext context, CurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    // ── Session lifecycle ──────────────────────────────────────────────────

    /// <summary>Called when user opens / logs in to Taylor Access.</summary>
    [HttpPost("session/start")]
    public async Task<ActionResult> StartSession()
    {
        var user = await _currentUser.GetUserAsync();
        var email = user?.Email ?? _currentUser.Email ?? "";
        var name  = user?.Name  ?? _currentUser.Name;

        if (string.IsNullOrEmpty(email))
            return BadRequest(new { error = "Could not identify user" });

        var now  = DateTime.UtcNow;
        var date = now.Date;

        // Auto-close any stale open sessions from PREVIOUS dates
        // (happens when user closes browser without logging out, or midnight rollover)
        var staleSessions = await _context.TimeclockSessions
            .Where(s => s.UserEmail == email &&
                        s.Date < date &&
                        s.LogoutTime == null)
            .ToListAsync();

        foreach (var stale in staleSessions)
        {
            // Cap logout at end of the session's day (11:59:59 PM UTC)
            var endOfDay = stale.Date.AddDays(1).AddSeconds(-1);
            stale.LogoutTime     = endOfDay < stale.LastHeartbeat ? endOfDay : stale.LastHeartbeat;
            stale.Status         = "offline";
        }

        if (staleSessions.Count > 0)
            await _context.SaveChangesAsync();

        // Check for an already-open session today (e.g. page refresh)
        var existing = await _context.TimeclockSessions
            .Where(s => s.UserEmail == email &&
                        s.Date == date &&
                        s.LogoutTime == null)
            .OrderByDescending(s => s.LoginTime)
            .FirstOrDefaultAsync();

        if (existing != null)
        {
            // Reuse the existing session — just update heartbeat + status
            existing.LastHeartbeat = now;
            existing.Status = "active";
            await _context.SaveChangesAsync();
            return Ok(new { sessionId = existing.Id, resumed = true });
        }

        var session = new TimeclockSession
        {
            UserId        = user?.Id,
            UserEmail     = email,
            UserName      = name,
            Date          = date,
            LoginTime     = now,
            LastHeartbeat = now,
            Status        = "active",
            IpAddress     = HttpContext.Connection.RemoteIpAddress?.ToString()
        };

        _context.TimeclockSessions.Add(session);
        await _context.SaveChangesAsync();

        return Ok(new { sessionId = session.Id, resumed = false });
    }

    /// <summary>
    /// Heartbeat — sent every 30 s by the frontend.
    /// isActive = true  → user interacted recently (mouse/keyboard)
    /// isActive = false → tab is idle / hidden
    /// </summary>
    [HttpPost("session/heartbeat")]
    public async Task<ActionResult> Heartbeat([FromBody] HeartbeatRequest req)
    {
        var session = await _context.TimeclockSessions.FindAsync(req.SessionId);
        if (session == null) return NotFound();

        var now     = DateTime.UtcNow;
        var elapsed = (int)(now - session.LastHeartbeat).TotalSeconds;

        // Attribute elapsed time to active or idle bucket (cap at 60 s to avoid huge gaps)
        var capped = Math.Min(elapsed, 60);
        if (req.IsActive)
            session.ActiveSeconds += capped;
        else
            session.IdleSeconds += capped;

        session.LastHeartbeat = now;
        session.Status        = req.IsActive ? "active" : "idle";

        await _context.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    /// <summary>Called when user explicitly logs out.</summary>
    [HttpPost("session/end")]
    public async Task<ActionResult> EndSession([FromBody] TimeclockEndRequest req)
    {
        var session = await _context.TimeclockSessions.FindAsync(req.SessionId);
        if (session == null) return NotFound();

        var now     = DateTime.UtcNow;
        var elapsed = (int)(now - session.LastHeartbeat).TotalSeconds;
        var capped  = Math.Min(elapsed, 60);
        session.ActiveSeconds += capped;
        session.LastHeartbeat  = now;
        session.LogoutTime     = now;
        session.Status         = "offline";

        await _context.SaveChangesAsync();
        return Ok(new { ok = true, totalSeconds = session.TotalSeconds });
    }

    // ── Queries ────────────────────────────────────────────────────────────

    /// <summary>All sessions for a specific day (for the time clock drawer).</summary>
    [HttpGet("sessions")]
    public async Task<ActionResult> GetSessions(
        [FromQuery] string? date,
        [FromQuery] string? email)
    {
        var targetDate = DateTime.TryParse(date, out var d)
            ? DateTime.SpecifyKind(d.Date, DateTimeKind.Utc)
            : DateTime.UtcNow.Date;

        var query = _context.TimeclockSessions
            .Where(s => s.Date == targetDate);

        if (!string.IsNullOrEmpty(email))
            query = query.Where(s => s.UserEmail.ToLower() == email.ToLower());

        var sessions = await query
            .OrderBy(s => s.LoginTime)
            .Select(s => new
            {
                s.Id, s.UserId, s.UserEmail, s.UserName,
                s.Date, s.LoginTime, s.LogoutTime, s.LastHeartbeat,
                s.ActiveSeconds, s.IdleSeconds, s.Status, s.IpAddress,
                // Use tracked bucket totals — not wall-clock (prevents overnight bleed)
                totalSeconds = s.ActiveSeconds + s.IdleSeconds
            })
            .ToListAsync();

        return Ok(new { data = sessions });
    }

    /// <summary>Daily summary — one row per user showing totals for the day.
    /// Falls back to Users.LastLoginAt when no session records exist yet.</summary>
    [HttpGet("daily-summary")]
    public async Task<ActionResult> GetDailySummary([FromQuery] string? date)
    {
        var targetDate = DateTime.TryParse(date, out var d)
            ? DateTime.SpecifyKind(d.Date, DateTimeKind.Utc)
            : DateTime.UtcNow.Date;

        var dayStart  = targetDate;
        var dayEnd    = targetDate.AddDays(1);
        var isToday   = targetDate.Date == DateTime.UtcNow.Date;
        // For past days, cap session end at midnight; for today, cap at now
        var maxEndTime = isToday ? DateTime.UtcNow : dayEnd;

        var sessions = await _context.TimeclockSessions
            .Where(s => s.Date >= dayStart && s.Date < dayEnd)
            .ToListAsync();

        // Build map from real session data
        var byUser = sessions
            .GroupBy(s => s.UserEmail)
            .Select(g =>
            {
                var all      = g.OrderBy(s => s.LoginTime).ToList();
                var firstIn  = all.First().LoginTime;
                var lastOut  = all.Any(s => s.LogoutTime.HasValue)
                                ? all.Where(s => s.LogoutTime.HasValue).Max(s => s.LogoutTime!.Value)
                                : (DateTime?)null;
                var lastBeat = all.Max(s => s.LastHeartbeat);
                var active   = all.Sum(s => s.ActiveSeconds);
                var idle     = all.Sum(s => s.IdleSeconds);

                // Total = sum of tracked heartbeat buckets (active + idle).
                // This is accurate regardless of how long the tab has been open,
                // and avoids the overnight bleed issue where wall-clock time >> actual work time.
                var total = all.Sum(s => s.ActiveSeconds + s.IdleSeconds);

                // A session is only "active/idle" if it received a heartbeat in the last 5 minutes
                var recentBeat = (DateTime.UtcNow - lastBeat).TotalMinutes < 5;
                var status   = isToday && recentBeat && all.Any(s => s.Status == "active") ? "active"
                             : isToday && recentBeat && all.Any(s => s.Status == "idle")   ? "idle"
                             : "offline";

                return new
                {
                    userEmail     = g.Key,
                    userName      = all.First().UserName,
                    userId        = all.First().UserId,
                    firstLogin    = (DateTime?)firstIn,
                    lastLogout    = lastOut,
                    lastHeartbeat = (DateTime?)lastBeat,
                    activeSeconds = active,
                    idleSeconds   = idle,
                    totalSeconds  = total,
                    status,
                    sessions      = all.Count,
                    source        = "tracked"
                };
            })
            .ToDictionary(u => (u.userEmail ?? "").ToLower());

        // Fallback: include users whose LastLoginAt falls on this day
        // but who have no session records yet (data before new tracking deployed)
        var usersLoggedIn = await _context.Users
            .Where(u => u.LastLoginAt >= dayStart && u.LastLoginAt < dayEnd)
            .Select(u => new { u.Id, u.Name, u.Email, u.LastLoginAt })
            .ToListAsync();

        foreach (var u in usersLoggedIn)
        {
            var key = (u.Email ?? "").ToLower();
            if (!byUser.ContainsKey(key) && u.LastLoginAt.HasValue)
            {
                byUser[key] = new
                {
                    userEmail     = u.Email,
                    userName      = u.Name,
                    userId        = (int?)u.Id,
                    firstLogin    = u.LastLoginAt,
                    lastLogout    = (DateTime?)null,
                    lastHeartbeat = u.LastLoginAt,
                    activeSeconds = 0,
                    idleSeconds   = 0,
                    totalSeconds  = 0,
                    status        = "offline",
                    sessions      = 1,
                    source        = "lastlogin"
                };
            }
        }

        var result = byUser.Values
            .OrderBy(u => u.firstLogin)
            .ToList();

        return Ok(new
        {
            date         = targetDate.ToString("yyyy-MM-dd"),
            activeNow    = result.Count(u => u.status == "active"),
            totalUsers   = result.Count,
            data         = result
        });
    }

    /// <summary>
    /// Admin endpoint: close all stale open sessions older than the given threshold (default 2h).
    /// Also closes any sessions whose Date is in the past but still have no LogoutTime.
    /// </summary>
    [HttpPost("cleanup-stale")]
    public async Task<ActionResult> CleanupStaleSessions([FromQuery] int thresholdHours = 2)
    {
        var now       = DateTime.UtcNow;
        var cutoff    = now.AddHours(-thresholdHours);
        var today     = now.Date;

        // Sessions with no logout that either:
        // (a) are from a past date, OR
        // (b) haven't had a heartbeat for > thresholdHours
        var stale = await _context.TimeclockSessions
            .Where(s => s.LogoutTime == null &&
                        (s.Date < today || s.LastHeartbeat < cutoff))
            .ToListAsync();

        foreach (var s in stale)
        {
            var endOfDay = s.Date.AddDays(1).AddSeconds(-1);
            // Use the earlier of: end-of-day OR lastHeartbeat
            s.LogoutTime = s.LastHeartbeat < endOfDay ? s.LastHeartbeat : endOfDay;
            s.Status     = "offline";
        }

        await _context.SaveChangesAsync();

        return Ok(new
        {
            cleaned = stale.Count,
            sessions = stale.Select(s => new
            {
                s.Id, s.UserEmail, s.Date,
                s.LoginTime, closedAt = s.LogoutTime,
                totalSeconds = (int)(s.LogoutTime!.Value - s.LoginTime).TotalSeconds
            })
        });
    }

    /// <summary>Weekly summary for a user — total hours per day for the past 7 days.</summary>
    [HttpGet("weekly/{email}")]
    public async Task<ActionResult> GetWeeklySummary(string email,
        [FromQuery] string? endDate)
    {
        var end   = DateTime.TryParse(endDate, out var d)
            ? DateTime.SpecifyKind(d.Date, DateTimeKind.Utc)
            : DateTime.UtcNow.Date;
        var start = end.AddDays(-6);

        var sessions = await _context.TimeclockSessions
            .Where(s => s.UserEmail.ToLower() == email.ToLower() &&
                        s.Date >= start && s.Date <= end)
            .ToListAsync();

        var byDay = Enumerable.Range(0, 7)
            .Select(i => start.AddDays(i))
            .Select(day =>
            {
                var daySessions = sessions.Where(s => s.Date.Date == day.Date).ToList();
                return new
                {
                    date          = day.ToString("yyyy-MM-dd"),
                    activeSeconds = daySessions.Sum(s => s.ActiveSeconds),
                    idleSeconds   = daySessions.Sum(s => s.IdleSeconds),
                    totalSeconds  = daySessions.Sum(s => s.ActiveSeconds + s.IdleSeconds),
                    sessions      = daySessions.Count
                };
            })
            .ToList();

        return Ok(new { email, data = byDay });
    }
}

public record HeartbeatRequest(int SessionId, bool IsActive);
public record TimeclockEndRequest(int SessionId);
