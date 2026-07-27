using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

public class GoogleUserActionRequest
{
    public string Action { get; set; } = "";
    public string? Email { get; set; }
    public string? OrgUnitPath { get; set; }
}

[ApiController]
[Route("api/v1/google")]
[Authorize]
public class GoogleWorkspaceController : ControllerBase
{
    private static readonly HashSet<string> AllowedActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "suspend", "unsuspend", "archive", "unarchive", "undelete", "signout"
    };

    private readonly GoogleDirectoryService _directory;
    private readonly IAuditService _auditService;

    public GoogleWorkspaceController(GoogleDirectoryService directory, IAuditService auditService)
    {
        _directory = directory;
        _auditService = auditService;
    }

    /// <summary>
    /// Lists all Google Workspace domain users via the Admin SDK Directory API.
    /// </summary>
    [HttpGet("workspace-users")]
    public async Task<ActionResult> GetWorkspaceUsers(CancellationToken cancellationToken)
    {
        var result = await _directory.ListDomainUsersAsync(cancellationToken);
        if (!result.Success)
            return StatusCode(502, new { error = result.Error });

        return Ok(new { data = result.Users });
    }

    /// <summary>
    /// Executes an admin action on a Workspace account:
    /// suspend, unsuspend, archive, unarchive, undelete, signout.
    /// </summary>
    [HttpPost("workspace-users/{id}/actions")]
    public async Task<ActionResult> ExecuteAction(
        string id,
        [FromBody] GoogleUserActionRequest request,
        CancellationToken cancellationToken)
    {
        var action = (request.Action ?? "").Trim().ToLowerInvariant();
        if (!AllowedActions.Contains(action))
            return BadRequest(new { error = $"Unknown action '{request.Action}'" });

        var (success, error) = await _directory.ExecuteUserActionAsync(id, action, request.OrgUnitPath, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        var target = string.IsNullOrWhiteSpace(request.Email) ? id : request.Email;
        await _auditService.LogAsync(action, "GoogleWorkspaceUser", null,
            $"Google Workspace: {action} on {target}");

        return Ok(new { success = true });
    }
}
