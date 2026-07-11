using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/zoom")]
[Authorize]
public class ZoomController : ControllerBase
{
    private readonly LocalIntegrationStatusService _statusService;
    private readonly CurrentUserService _currentUserService;

    public ZoomController(LocalIntegrationStatusService statusService, CurrentUserService currentUserService)
    {
        _statusService = statusService;
        _currentUserService = currentUserService;
    }

    [HttpGet("status")]
    public async Task<ActionResult<object>> GetStatus(CancellationToken cancellationToken)
    {
        var (orgId, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var status = await _statusService.GetZoomStatusAsync(orgId ?? user.OrganizationId, cancellationToken);
        return Ok(new
        {
            connected = status.Connected,
            status = status.Status,
            message = status.Message,
            source = status.Source
        });
    }
}
