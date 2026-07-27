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

public class GoogleUserUpdateRequest
{
    public string? Email { get; set; }
    public string? GivenName { get; set; }
    public string? FamilyName { get; set; }
    public string? OrgUnitPath { get; set; }
    public string? RecoveryEmail { get; set; }
    public string? RecoveryPhone { get; set; }
    public string? PrimaryEmail { get; set; }
    public string? Password { get; set; }
    public bool? ChangePasswordAtNextLogin { get; set; }
}

public class GoogleUserAliasRequest
{
    public string Alias { get; set; } = "";
    public string? Email { get; set; }
}

[ApiController]
[Route("api/v1/google")]
[Authorize]
public class GoogleWorkspaceController : ControllerBase
{
    private static readonly HashSet<string> AllowedActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "suspend", "unsuspend", "archive", "unarchive", "undelete", "signout", "makeadmin", "revokeadmin"
    };

    private readonly GoogleDirectoryService _directory;
    private readonly IAuditService _auditService;
    private readonly CurrentUserService _currentUser;

    public GoogleWorkspaceController(
        GoogleDirectoryService directory,
        IAuditService auditService,
        CurrentUserService currentUser)
    {
        _directory = directory;
        _auditService = auditService;
        _currentUser = currentUser;
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

        // Granting/revoking super admin is restricted to the product owner
        if ((action == "makeadmin" || action == "revokeadmin") && !_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can grant or revoke super admin" });

        var (success, error) = await _directory.ExecuteUserActionAsync(id, action, request.OrgUnitPath, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        var target = string.IsNullOrWhiteSpace(request.Email) ? id : request.Email;
        await _auditService.LogAsync(action, "GoogleWorkspaceUser", null,
            $"Google Workspace: {action} on {target}");

        return Ok(new { success = true });
    }

    /// <summary>
    /// Partially updates a Workspace account: name, org unit, recovery contacts,
    /// primary email (rename), password reset.
    /// </summary>
    [HttpPatch("workspace-users/{id}")]
    public async Task<ActionResult> UpdateUser(
        string id,
        [FromBody] GoogleUserUpdateRequest request,
        CancellationToken cancellationToken)
    {
        var payload = new Dictionary<string, object>();
        var changed = new List<string>();

        if (!string.IsNullOrWhiteSpace(request.GivenName) || !string.IsNullOrWhiteSpace(request.FamilyName))
        {
            var name = new Dictionary<string, object>();
            if (!string.IsNullOrWhiteSpace(request.GivenName)) name["givenName"] = request.GivenName.Trim();
            if (!string.IsNullOrWhiteSpace(request.FamilyName)) name["familyName"] = request.FamilyName.Trim();
            payload["name"] = name;
            changed.Add("name");
        }
        if (!string.IsNullOrWhiteSpace(request.OrgUnitPath)) { payload["orgUnitPath"] = request.OrgUnitPath.Trim(); changed.Add("orgUnit"); }
        if (request.RecoveryEmail != null) { payload["recoveryEmail"] = request.RecoveryEmail.Trim(); changed.Add("recoveryEmail"); }
        if (request.RecoveryPhone != null) { payload["recoveryPhone"] = request.RecoveryPhone.Trim(); changed.Add("recoveryPhone"); }
        if (!string.IsNullOrWhiteSpace(request.PrimaryEmail)) { payload["primaryEmail"] = request.PrimaryEmail.Trim(); changed.Add("primaryEmail"); }
        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            if (request.Password.Length < 8)
                return BadRequest(new { error = "Password must be at least 8 characters" });
            payload["password"] = request.Password;
            changed.Add("password");
        }
        if (request.ChangePasswordAtNextLogin.HasValue)
        {
            payload["changePasswordAtNextLogin"] = request.ChangePasswordAtNextLogin.Value;
            changed.Add("changePasswordAtNextLogin");
        }

        if (payload.Count == 0)
            return BadRequest(new { error = "No fields to update" });

        var (success, error) = await _directory.PatchUserAsync(id, payload, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        var target = string.IsNullOrWhiteSpace(request.Email) ? id : request.Email;
        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: updated {string.Join(", ", changed)} on {target}");

        return Ok(new { success = true });
    }

    [HttpPost("workspace-users/{id}/aliases")]
    public async Task<ActionResult> AddAlias(
        string id,
        [FromBody] GoogleUserAliasRequest request,
        CancellationToken cancellationToken)
    {
        var alias = (request.Alias ?? "").Trim();
        if (string.IsNullOrWhiteSpace(alias) || !alias.Contains('@'))
            return BadRequest(new { error = "A full alias email address is required" });

        var (success, error) = await _directory.AddAliasAsync(id, alias, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        var target = string.IsNullOrWhiteSpace(request.Email) ? id : request.Email;
        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: added alias {alias} to {target}");

        return Ok(new { success = true });
    }

    [HttpDelete("workspace-users/{id}/aliases/{alias}")]
    public async Task<ActionResult> RemoveAlias(
        string id,
        string alias,
        [FromQuery] string? email,
        CancellationToken cancellationToken)
    {
        var (success, error) = await _directory.RemoveAliasAsync(id, alias, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        var target = string.IsNullOrWhiteSpace(email) ? id : email;
        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: removed alias {alias} from {target}");

        return Ok(new { success = true });
    }

    /// <summary>
    /// Security surface for a user: OAuth tokens (connected apps),
    /// app-specific passwords, and 2SV backup codes.
    /// </summary>
    [HttpGet("workspace-users/{id}/security")]
    public async Task<ActionResult> GetUserSecurity(string id, CancellationToken cancellationToken)
    {
        var (security, error) = await _directory.GetUserSecurityAsync(id, cancellationToken);
        if (security == null)
            return StatusCode(502, new { error });

        return Ok(new { data = security });
    }

    [HttpDelete("workspace-users/{id}/tokens/{clientId}")]
    public async Task<ActionResult> RevokeToken(
        string id, string clientId, [FromQuery] string? email, CancellationToken cancellationToken)
    {
        var (success, error) = await _directory.RevokeTokenAsync(id, clientId, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: revoked OAuth token {clientId} for {email ?? id}");

        return Ok(new { success = true });
    }

    [HttpDelete("workspace-users/{id}/asps/{codeId:long}")]
    public async Task<ActionResult> DeleteAsp(
        string id, long codeId, [FromQuery] string? email, CancellationToken cancellationToken)
    {
        var (success, error) = await _directory.DeleteAspAsync(id, codeId, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: deleted app-specific password {codeId} for {email ?? id}");

        return Ok(new { success = true });
    }

    [HttpPost("workspace-users/{id}/backup-codes/generate")]
    public async Task<ActionResult> GenerateBackupCodes(
        string id, [FromQuery] string? email, CancellationToken cancellationToken)
    {
        var (success, error) = await _directory.GenerateBackupCodesAsync(id, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: generated 2SV backup codes for {email ?? id}");

        return Ok(new { success = true });
    }

    [HttpPost("workspace-users/{id}/backup-codes/invalidate")]
    public async Task<ActionResult> InvalidateBackupCodes(
        string id, [FromQuery] string? email, CancellationToken cancellationToken)
    {
        var (success, error) = await _directory.InvalidateBackupCodesAsync(id, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: invalidated 2SV backup codes for {email ?? id}");

        return Ok(new { success = true });
    }
}
