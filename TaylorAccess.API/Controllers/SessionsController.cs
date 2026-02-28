using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/sessions")]
[Authorize]
public class SessionsController : ControllerBase
{
    private readonly IMongoDbService _mongo;
    private readonly CurrentUserService _currentUser;

    public SessionsController(IMongoDbService mongo, CurrentUserService currentUser)
    {
        _mongo = mongo;
        _currentUser = currentUser;
    }

    [HttpPost("start")]
    public async Task<ActionResult> StartSession()
    {
        var user = await _currentUser.GetUserAsync();
        if (user == null) return Unauthorized();

        var session = new UserSession
        {
            UserId = user.Id,
            UserName = user.Name,
            UserEmail = user.Email,
            OrganizationId = user.OrganizationId,
            LoginTime = DateTime.UtcNow,
            LogoutReason = "active",
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = Request.Headers.UserAgent.ToString()
        };

        var sessionId = await _mongo.LogSessionStartAsync(session);
        return Ok(new { sessionId });
    }

    [HttpPost("end")]
    public async Task<ActionResult> EndSession([FromBody] EndSessionRequest request)
    {
        if (string.IsNullOrEmpty(request.SessionId)) return BadRequest(new { error = "sessionId required" });
        await _mongo.LogSessionEndAsync(request.SessionId, request.Reason ?? "manual");
        return Ok(new { ended = true });
    }

    [HttpGet]
    public async Task<ActionResult> GetSessions(
        [FromQuery] int? userId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int limit = 50)
    {
        var sessions = await _mongo.GetUserSessionsAsync(userId, from, to, limit);
        return Ok(new { data = sessions });
    }

    [HttpGet("summary")]
    public async Task<ActionResult> GetSummary([FromQuery] int? userId)
    {
        var user = await _currentUser.GetUserAsync();
        var targetUserId = userId ?? user?.Id ?? 0;

        var now = DateTime.UtcNow;
        var todayStart = now.Date;
        var weekStart = todayStart.AddDays(-(int)todayStart.DayOfWeek);
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        var todaySessions = await _mongo.GetUserSessionsAsync(targetUserId, todayStart, now, 100);
        var weekSessions = await _mongo.GetUserSessionsAsync(targetUserId, weekStart, now, 500);
        var monthSessions = await _mongo.GetUserSessionsAsync(targetUserId, monthStart, now, 1000);

        double hoursToday = todaySessions.Sum(s => s.DurationMinutes ?? 0) / 60.0;
        double hoursWeek = weekSessions.Sum(s => s.DurationMinutes ?? 0) / 60.0;
        double hoursMonth = monthSessions.Sum(s => s.DurationMinutes ?? 0) / 60.0;

        return Ok(new
        {
            hoursToday = Math.Round(hoursToday, 1),
            hoursWeek = Math.Round(hoursWeek, 1),
            hoursMonth = Math.Round(hoursMonth, 1),
            sessionsToday = todaySessions.Count,
            sessionsWeek = weekSessions.Count,
            sessionsMonth = monthSessions.Count
        });
    }
    [HttpGet("dashboard")]
    public async Task<ActionResult> GetDashboardStats()
    {
        var now = DateTime.UtcNow;
        var thirtyDaysAgo = now.AddDays(-30);
        var weekStart = now.Date.AddDays(-(int)now.DayOfWeek);
        var todayStart = now.Date;

        var allSessions = await _mongo.GetUserSessionsAsync(null, thirtyDaysAgo, now, 5000);

        // Daily hours (last 30 days)
        var dailyHours = allSessions
            .GroupBy(s => s.LoginTime.Date)
            .Select(g => new {
                date = g.Key.ToString("yyyy-MM-dd"),
                totalHours = Math.Round(g.Sum(s => s.DurationMinutes ?? 0) / 60.0, 1),
                sessionCount = g.Count()
            })
            .OrderBy(d => d.date)
            .ToList();

        // Employee hours this week (top 10)
        var weekSessions = allSessions.Where(s => s.LoginTime >= weekStart).ToList();
        var employeeHoursThisWeek = weekSessions
            .GroupBy(s => s.UserName ?? "Unknown")
            .Select(g => new {
                name = g.Key,
                hours = Math.Round(g.Sum(s => s.DurationMinutes ?? 0) / 60.0, 1)
            })
            .OrderByDescending(e => e.hours)
            .Take(10)
            .ToList();

        // Clock-in distribution
        var todaySessions = allSessions.Where(s => s.LoginTime >= todayStart).ToList();
        var clockInDist = new {
            morning = todaySessions.Count(s => s.LoginTime.Hour >= 5 && s.LoginTime.Hour < 12),
            afternoon = todaySessions.Count(s => s.LoginTime.Hour >= 12 && s.LoginTime.Hour < 17),
            evening = todaySessions.Count(s => s.LoginTime.Hour >= 17 && s.LoginTime.Hour < 21),
            night = todaySessions.Count(s => s.LoginTime.Hour >= 21 || s.LoginTime.Hour < 5)
        };

        // Unique users today vs total users
        var uniqueUsersToday = todaySessions.Select(s => s.UserId).Distinct().Count();

        return Ok(new {
            dailyHours,
            employeeHoursThisWeek,
            clockInDistribution = clockInDist,
            uniqueUsersToday,
            totalSessionsToday = todaySessions.Count
        });
    }
}

public record EndSessionRequest(string? SessionId, string? Reason);
