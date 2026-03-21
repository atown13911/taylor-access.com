using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/events")]
[Authorize]
public class EventsController : ControllerBase
{
    private readonly IMongoDbService _mongo;
    private readonly CurrentUserService _currentUserService;

    public EventsController(IMongoDbService mongo, CurrentUserService currentUserService)
    {
        _mongo = mongo;
        _currentUserService = currentUserService;
    }

    [HttpPost("page-view")]
    public Task<ActionResult> TrackPageView([FromBody] PageViewEvent pageView)
    {
        var userId = TryParseUserId(User);
        var organizationId = TryParseOrgId(User);
        if (userId.HasValue) pageView.UserId = userId.Value;
        if (organizationId.HasValue) pageView.OrganizationId = organizationId.Value;
        pageView.Timestamp = DateTime.UtcNow;
        pageView.IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        pageView.UserAgent = Request.Headers["User-Agent"].FirstOrDefault();

        // Best-effort telemetry write: return immediately to avoid gateway timeouts on non-critical analytics.
        _ = Task.Run(async () =>
        {
            try
            {
                await _mongo.LogPageViewAsync(pageView);
            }
            catch
            {
                // Intentionally swallow analytics persistence failures.
            }
        });

        return Task.FromResult<ActionResult>(Ok(new { success = true }));
    }

    [HttpPost("batch")]
    public Task<ActionResult> TrackBatch([FromBody] List<ClickEvent> events)
    {
        var safeEvents = (events ?? new List<ClickEvent>())
            .Take(250)
            .ToList();
        if (safeEvents.Count == 0)
            return Task.FromResult<ActionResult>(Ok(new { success = true, count = 0 }));

        var userId = TryParseUserId(User);
        var organizationId = TryParseOrgId(User);
        var now = DateTime.UtcNow;
        foreach (var evt in safeEvents)
        {
            if (userId.HasValue) evt.UserId = userId.Value;
            if (organizationId.HasValue) evt.OrganizationId = organizationId.Value;
            if (evt.Timestamp == default) evt.Timestamp = now;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                foreach (var evt in safeEvents)
                {
                    await _mongo.LogClickEventAsync(evt);
                }
            }
            catch
            {
                // Intentionally swallow analytics persistence failures.
            }
        });

        return Task.FromResult<ActionResult>(Ok(new { success = true, count = safeEvents.Count }));
    }

    [HttpGet("page-views")]
    public async Task<ActionResult> GetPageViews([FromQuery] int? userId, [FromQuery] int limit = 100)
    {
        var user = await _currentUserService.GetUserAsync();
        var targetUserId = userId ?? user?.Id ?? 0;
        var views = await _mongo.GetUserPageViewsAsync(targetUserId, limit: limit);
        return Ok(new { data = views });
    }

    [HttpGet("clicks")]
    public async Task<ActionResult> GetClicks([FromQuery] int? userId, [FromQuery] int limit = 100)
    {
        var user = await _currentUserService.GetUserAsync();
        var targetUserId = userId ?? user?.Id ?? 0;
        var clicks = await _mongo.GetUserClicksAsync(targetUserId, limit: limit);
        return Ok(new { data = clicks });
    }

    private static int? TryParseUserId(ClaimsPrincipal user)
    {
        var userIdValue = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub");
        return int.TryParse(userIdValue, out var userId) && userId > 0 ? userId : null;
    }

    private static int? TryParseOrgId(ClaimsPrincipal user)
    {
        var orgIdValue = user.FindFirstValue("orgId")
            ?? user.FindFirstValue("organizationId");
        return int.TryParse(orgIdValue, out var orgId) && orgId > 0 ? orgId : null;
    }
}
