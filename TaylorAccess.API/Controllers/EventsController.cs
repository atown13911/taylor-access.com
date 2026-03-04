using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
    public async Task<ActionResult> TrackPageView([FromBody] PageViewEvent pageView)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user != null)
        {
            pageView.UserId = user.Id;
            pageView.OrganizationId = user.OrganizationId ?? 0;
        }
        pageView.Timestamp = DateTime.UtcNow;
        pageView.IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        pageView.UserAgent = Request.Headers["User-Agent"].FirstOrDefault();

        await _mongo.LogPageViewAsync(pageView);
        return Ok(new { success = true });
    }

    [HttpPost("batch")]
    public async Task<ActionResult> TrackBatch([FromBody] List<ClickEvent> events)
    {
        var user = await _currentUserService.GetUserAsync();
        foreach (var evt in events)
        {
            if (user != null)
            {
                evt.UserId = user.Id;
                evt.OrganizationId = user.OrganizationId ?? 0;
            }
            if (evt.Timestamp == default) evt.Timestamp = DateTime.UtcNow;
            await _mongo.LogClickEventAsync(evt);
        }
        return Ok(new { success = true, count = events.Count });
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
}
