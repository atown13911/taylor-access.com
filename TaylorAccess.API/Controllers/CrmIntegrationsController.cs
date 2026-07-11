using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/crm-integrations")]
[Authorize]
public class CrmIntegrationsController : ControllerBase
{
    private readonly CrmIntegrationCopyService _copyService;
    private readonly LocalIntegrationStatusService _statusService;
    private readonly CurrentUserService _currentUserService;

    public CrmIntegrationsController(
        CrmIntegrationCopyService copyService,
        LocalIntegrationStatusService statusService,
        CurrentUserService currentUserService)
    {
        _copyService = copyService;
        _statusService = statusService;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Copy Gmail/Zoom integration credentials from Taylor CRM database into Taylor Access.
    /// </summary>
    [HttpPost("sync-from-crm")]
    public async Task<ActionResult<object>> SyncFromCrm(CancellationToken cancellationToken)
    {
        var (_, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var result = await _copyService.CopyFromCrmAsync(cancellationToken);
        if (!result.Success)
            return BadRequest(new { message = result.Error, data = result });

        var google = await _statusService.GetGoogleStatusAsync(user.OrganizationId, cancellationToken);
        var zoom = await _statusService.GetZoomStatusAsync(user.OrganizationId, cancellationToken);

        return Ok(new
        {
            message = "CRM integration credentials copied to Taylor Access.",
            data = result,
            status = new
            {
                google,
                zoom
            }
        });
    }

    [HttpGet("status")]
    public async Task<ActionResult<object>> GetLocalStatus(CancellationToken cancellationToken)
    {
        var (orgId, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var google = await _statusService.GetGoogleStatusAsync(orgId ?? user.OrganizationId, cancellationToken);
        var zoom = await _statusService.GetZoomStatusAsync(orgId ?? user.OrganizationId, cancellationToken);

        return Ok(new
        {
            data = new
            {
                google,
                zoom,
                hasLocalCredentials = await _statusService.HasLocalCredentialsAsync(orgId ?? user.OrganizationId, cancellationToken),
                checkedAtUtc = DateTime.UtcNow
            }
        });
    }
}
