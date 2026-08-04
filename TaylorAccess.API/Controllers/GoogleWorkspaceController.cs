using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
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

public class GoogleRestrictedUserRequest
{
    public string Email { get; set; } = "";
}

[ApiController]
[Route("api/v1/google")]
[Authorize]
public class GoogleWorkspaceController : ControllerBase
{
    private static readonly HashSet<string> AllowedActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "suspend", "unsuspend", "archive", "unarchive", "undelete", "signout", "makeadmin", "revokeadmin",
        "removeadminroles"
    };

    private readonly GoogleDirectoryService _directory;
    private readonly IAuditService _auditService;
    private readonly CurrentUserService _currentUser;
    private readonly TaylorAccessDbContext _context;

    public GoogleWorkspaceController(
        GoogleDirectoryService directory,
        IAuditService auditService,
        CurrentUserService currentUser,
        TaylorAccessDbContext context)
    {
        _directory = directory;
        _auditService = auditService;
        _currentUser = currentUser;
        _context = context;
    }

    /// <summary>
    /// Lists all Google Workspace domain users via the Admin SDK Directory API.
    /// </summary>
    [HttpGet("workspace-users")]
    public async Task<ActionResult> GetWorkspaceUsers(CancellationToken cancellationToken)
    {
        var result = await _directory.ListDomainUsersAsync(restrictedOnly: false, cancellationToken);
        if (!result.Success)
            return StatusCode(502, new { error = result.Error });

        return Ok(new { data = result.Users });
    }

    /// <summary>
    /// Lists only the restricted (hidden) Workspace accounts. Product owner only.
    /// </summary>
    [HttpGet("workspace-users/restricted")]
    public async Task<ActionResult> GetRestrictedWorkspaceUsers(CancellationToken cancellationToken)
    {
        if (!_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can view restricted accounts" });

        var result = await _directory.ListDomainUsersAsync(restrictedOnly: true, cancellationToken);
        if (!result.Success)
            return StatusCode(502, new { error = result.Error });

        return Ok(new { data = result.Users });
    }

    /// <summary>
    /// Moves a Workspace account into Restricted Access (hidden from Domain /
    /// Data Storage for non–product-owners). Product owner only.
    /// </summary>
    [HttpPost("workspace-users/restricted")]
    public async Task<ActionResult> AddRestrictedWorkspaceUser(
        [FromBody] GoogleRestrictedUserRequest request,
        CancellationToken cancellationToken)
    {
        if (!_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can move accounts to Restricted Access" });

        var email = (request.Email ?? "").Trim();
        if (string.IsNullOrEmpty(email))
            return BadRequest(new { error = "email is required" });

        var (added, error) = await _directory.AddRestrictedUserAsync(
            email, _currentUser.Email, cancellationToken);
        if (error != null)
            return StatusCode(500, new { error });

        await _auditService.LogAsync("restrict", "GoogleWorkspaceUser", null,
            $"Google Workspace: moved {email} to Restricted Access");

        return Ok(new { success = true, added, email = email.ToLowerInvariant() });
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

        // Granting/revoking admin privileges is restricted to the product owner
        if ((action == "makeadmin" || action == "revokeadmin" || action == "removeadminroles") && !_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can grant or revoke admin privileges" });

        bool success;
        string? error;
        if (action == "removeadminroles")
            (success, error, _) = await _directory.RemoveAdminRolesAsync(id, cancellationToken);
        else
            (success, error) = await _directory.ExecuteUserActionAsync(id, action, request.OrgUnitPath, cancellationToken);
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
            if (request.Password.Length < 12)
                return BadRequest(new { error = "Password must be at least 12 characters (domain password policy)" });
            if (request.Password.Length > 100)
                return BadRequest(new { error = "Password must be 100 characters or fewer" });
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

    /// <summary>Admin roles assigned to a user, resolved with role names from the domain.</summary>
    [HttpGet("workspace-users/{id}/roles")]
    public async Task<ActionResult> GetUserRoles(string id, CancellationToken cancellationToken)
    {
        var (roles, error) = await _directory.ListUserRolesAsync(id, cancellationToken);
        if (roles == null)
            return StatusCode(502, new { error });

        return Ok(new { data = roles });
    }

    [HttpGet("workspace-users/{id}/groups")]
    public async Task<ActionResult> GetUserGroups(string id, CancellationToken cancellationToken)
    {
        var (groups, error) = await _directory.GetUserGroupsAsync(id, cancellationToken);
        if (groups == null)
            return StatusCode(502, new { error });

        return Ok(new { data = groups });
    }

    /// <summary>All Google groups on the domain.</summary>
    [HttpGet("groups")]
    public async Task<ActionResult> GetDomainGroups(CancellationToken cancellationToken)
    {
        var (groups, error) = await _directory.ListDomainGroupsAsync(cancellationToken);
        if (groups == null)
            return StatusCode(502, new { error });

        return Ok(new { data = groups.OrderBy(g => g.Name, StringComparer.OrdinalIgnoreCase).ToList() });
    }

    /// <summary>Direct members of a group — owners first, then managers, then members.</summary>
    [HttpGet("groups/{id}/members")]
    public async Task<ActionResult> GetGroupMembers(string id, CancellationToken cancellationToken)
    {
        var (members, error) = await _directory.GetGroupMembersAsync(id, cancellationToken);
        if (members == null)
            return StatusCode(502, new { error });

        await _directory.EnsureRestrictedUsersLoadedAsync(cancellationToken);
        if (!_currentUser.IsProductOwner)
            members = members.Where(m => !GoogleDirectoryService.IsHiddenUser(m.Email)).ToList();

        var roleOrder = new Dictionary<string, int> { ["OWNER"] = 0, ["MANAGER"] = 1, ["MEMBER"] = 2 };
        var sorted = members
            .OrderBy(m => roleOrder.TryGetValue(m.Role, out var order) ? order : 3)
            .ThenBy(m => m.Email, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Ok(new { data = sorted });
    }

    [HttpGet("workspace-users/{id}/licenses")]
    public async Task<ActionResult> GetUserLicenses(
        string id, [FromQuery] string email, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new { error = "email query parameter is required" });

        var (licenses, error) = await _directory.GetUserLicensesAsync(email, cancellationToken);
        if (licenses == null)
            return StatusCode(502, new { error });

        return Ok(new { data = licenses });
    }

    [HttpGet("workspace-users/{id}/login-events")]
    public async Task<ActionResult> GetLoginEvents(string id, CancellationToken cancellationToken)
    {
        var (events, error) = await _directory.GetLoginEventsAsync(id, cancellationToken);
        if (events == null)
            return StatusCode(502, new { error });

        return Ok(new { data = events });
    }

    /// <summary>Last OAuth token activity per connected app — "is this grant actually in use".</summary>
    [HttpGet("workspace-users/{id}/token-activity")]
    public async Task<ActionResult> GetTokenActivity(string id, CancellationToken cancellationToken)
    {
        var (activity, error) = await _directory.GetTokenActivityAsync(id, cancellationToken);
        if (activity == null)
            return StatusCode(502, new { error });

        return Ok(new { data = activity });
    }

    /// <summary>Per-user storage usage across the domain (Drive, Gmail, Photos).
    /// Product owners also see Restricted Access accounts.</summary>
    [HttpGet("storage-usage")]
    public async Task<ActionResult> GetStorageUsage(CancellationToken cancellationToken)
    {
        var (usage, reportDate, error) = await _directory.GetStorageUsageAsync(
            includeHidden: _currentUser.IsProductOwner, cancellationToken);
        if (usage == null)
            return StatusCode(502, new { error });

        return Ok(new { data = usage, reportDate });
    }

    /// <summary>
    /// Saved storage history: per-user rows when an email is given,
    /// otherwise daily domain totals. Backed by GoogleStorageSnapshots.
    /// </summary>
    [HttpGet("storage-history")]
    public async Task<ActionResult> GetStorageHistory(
        [FromQuery] string? email,
        [FromQuery] int days = 90,
        CancellationToken cancellationToken = default)
    {
        var cutoff = DateTime.UtcNow.Date.AddDays(-Math.Clamp(days, 1, 3650));

        await _directory.EnsureRestrictedUsersLoadedAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(email))
        {
            if (GoogleDirectoryService.IsHiddenUser(email) && !_currentUser.IsProductOwner)
                return StatusCode(403, new { error = "Not authorized for this account" });

            var normalized = email.ToLower();
            var rows = await _context.GoogleStorageSnapshots
                .AsNoTracking()
                .Where(s => s.Email.ToLower() == normalized && s.ReportDate >= cutoff)
                .OrderBy(s => s.ReportDate)
                .ToListAsync(cancellationToken);
            return Ok(new { data = rows });
        }

        var snapshots = await _context.GoogleStorageSnapshots
            .AsNoTracking()
            .Where(s => s.ReportDate >= cutoff)
            .ToListAsync(cancellationToken);

        if (!_currentUser.IsProductOwner)
            snapshots = snapshots.Where(s => !GoogleDirectoryService.IsHiddenUser(s.Email)).ToList();

        var daily = snapshots
            .GroupBy(s => s.ReportDate)
            .OrderBy(g => g.Key)
            .Select(g => new
            {
                reportDate = g.Key,
                usedMb = g.Sum(x => x.UsedMb),
                driveMb = g.Sum(x => x.DriveMb),
                gmailMb = g.Sum(x => x.GmailMb),
                photosMb = g.Sum(x => x.PhotosMb),
                accounts = g.Count()
            })
            .ToList();

        return Ok(new { data = daily });
    }

    [HttpGet("transfer-applications")]
    public async Task<ActionResult> GetTransferApplications(CancellationToken cancellationToken)
    {
        var (apps, error) = await _directory.GetTransferApplicationsAsync(cancellationToken);
        if (apps == null)
            return StatusCode(502, new { error });

        return Ok(new { data = apps });
    }

    [HttpGet("workspace-users/{id}/transfers")]
    public async Task<ActionResult> GetTransfers(string id, CancellationToken cancellationToken)
    {
        var (googleTransfers, error) = await _directory.GetTransfersAsync(id, cancellationToken);
        if (googleTransfers == null)
            return StatusCode(502, new { error });

        var saved = await _context.GoogleDataTransfers
            .Where(t => t.SourceGoogleUserId == id)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(cancellationToken);

        // Sync live Google status onto our saved records
        var changed = false;
        foreach (var record in saved.Where(r => !string.IsNullOrEmpty(r.GoogleTransferId)))
        {
            var live = googleTransfers.FirstOrDefault(g => g.Id == record.GoogleTransferId);
            if (live != null && !string.IsNullOrEmpty(live.Status) && live.Status != record.Status)
            {
                record.Status = live.Status;
                record.UpdatedAt = DateTime.UtcNow;
                changed = true;
            }
        }
        if (changed)
            await _context.SaveChangesAsync(cancellationToken);

        var result = saved.Select(r => new
        {
            id = $"db-{r.Id}",
            targetEmail = r.TargetEmail,
            targetUserId = r.TargetGoogleUserId,
            applications = r.Applications,
            status = r.Status,
            requestedBy = r.RequestedBy,
            time = r.CreatedAt.ToString("o")
        }).ToList();

        // Include transfers Google knows about that weren't started from Taylor Access
        var knownIds = saved.Select(s => s.GoogleTransferId).Where(gid => !string.IsNullOrEmpty(gid)).ToHashSet();
        foreach (var g in googleTransfers.Where(g => !knownIds.Contains(g.Id)))
        {
            result.Add(new
            {
                id = $"g-{g.Id}",
                targetEmail = (string?)null ?? "",
                targetUserId = g.NewOwnerUserId,
                applications = string.Join(", ", g.Apps),
                status = g.Status,
                requestedBy = (string?)null,
                time = g.RequestTime ?? ""
            });
        }

        return Ok(new { data = result.OrderByDescending(r => r.time).ToList() });
    }

    [HttpPost("workspace-users/{id}/transfers")]
    public async Task<ActionResult> StartTransfer(
        string id,
        [FromBody] GoogleTransferRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.NewOwnerUserId))
            return BadRequest(new { error = "A destination user is required" });
        if (request.ApplicationIds == null || request.ApplicationIds.Count == 0)
            return BadRequest(new { error = "At least one application must be selected" });

        var (success, error, transferId) = await _directory.InsertTransferAsync(
            id, request.NewOwnerUserId, request.ApplicationIds, cancellationToken);
        if (!success)
            return StatusCode(502, new { error });

        _context.GoogleDataTransfers.Add(new GoogleDataTransfer
        {
            GoogleTransferId = transferId,
            SourceGoogleUserId = id,
            SourceEmail = request.Email ?? "",
            TargetGoogleUserId = request.NewOwnerUserId,
            TargetEmail = request.NewOwnerEmail ?? "",
            Applications = request.ApplicationNames ?? string.Join(",", request.ApplicationIds),
            Status = "inProgress",
            RequestedByUserId = _currentUser.UserId,
            RequestedBy = _currentUser.DisplayName
        });
        await _context.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: started data transfer from {request.Email ?? id} to {request.NewOwnerEmail ?? request.NewOwnerUserId} " +
            $"(apps: {request.ApplicationNames ?? string.Join(",", request.ApplicationIds)})");

        return Ok(new { success = true, transferId });
    }

    // ----- Drive-to-bucket backup -----

    /// <summary>
    /// Starts a Drive backup pass in the background (product owner only).
    /// With ?email= it backs up just that account instead of the whole domain.
    /// </summary>
    [HttpPost("drive-backup/run")]
    public async Task<ActionResult> RunDriveBackup(
        [FromServices] IServiceScopeFactory scopeFactory,
        [FromQuery] string? email = null)
    {
        if (!_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can run Drive backups" });

        if (GoogleDriveBackupWorker.IsRunning)
            return Ok(new { started = false, message = "A backup run is already in progress" });

        var target = string.IsNullOrWhiteSpace(email) ? null : email.Trim();
        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: manually started Drive-to-bucket backup{(target != null ? $" for {target}" : "")}");

        _ = Task.Run(async () =>
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var worker = scope.ServiceProvider.GetRequiredService<GoogleDriveBackupWorker>();
            await worker.RunAsync(target != null ? $"manual:{target}" : "manual", CancellationToken.None, target);
        });

        return Ok(new { started = true });
    }

    /// <summary>Latest backup runs plus per-user bucket totals (product owner only).</summary>
    [HttpGet("drive-backup/status")]
    public async Task<ActionResult> GetDriveBackupStatus(CancellationToken cancellationToken)
    {
        if (!_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can view Drive backup status" });

        var runs = await _context.GoogleDriveBackupRuns.AsNoTracking()
            .OrderByDescending(r => r.StartedAt)
            .Take(10)
            .ToListAsync(cancellationToken);

        var perUser = await _context.GoogleDriveBackupFiles.AsNoTracking()
            .Where(f => f.Status == "backedUp")
            .GroupBy(f => f.UserEmail)
            .Select(g => new
            {
                email = g.Key,
                files = g.Count(),
                bytes = g.Sum(x => x.SizeBytes),
                lastBackedUpAt = g.Max(x => x.BackedUpAt)
            })
            .OrderByDescending(x => x.bytes)
            .ToListAsync(cancellationToken);

        var failed = await _context.GoogleDriveBackupFiles.AsNoTracking()
            .CountAsync(f => f.Status == "failed", cancellationToken);

        return Ok(new
        {
            running = GoogleDriveBackupWorker.IsRunning,
            progress = GoogleDriveBackupWorker.Progress,
            runs,
            perUser,
            failedFiles = failed
        });
    }

    // ----- Gmail-to-bucket backup -----

    /// <summary>
    /// Starts a Gmail backup pass in the background (product owner only).
    /// With ?email= it backs up just that account instead of the whole domain.
    /// </summary>
    [HttpPost("gmail-backup/run")]
    public async Task<ActionResult> RunGmailBackup(
        [FromServices] IServiceScopeFactory scopeFactory,
        [FromQuery] string? email = null)
    {
        if (!_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can run Gmail backups" });

        if (GoogleGmailBackupWorker.IsRunning)
            return Ok(new { started = false, message = "A Gmail backup run is already in progress" });

        var target = string.IsNullOrWhiteSpace(email) ? null : email.Trim();
        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            $"Google Workspace: manually started Gmail-to-bucket backup{(target != null ? $" for {target}" : "")}");

        _ = Task.Run(async () =>
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var worker = scope.ServiceProvider.GetRequiredService<GoogleGmailBackupWorker>();
            await worker.RunAsync(target != null ? $"manual:{target}" : "manual", CancellationToken.None, target);
        });

        return Ok(new { started = true });
    }

    /// <summary>Latest Gmail backup runs plus per-user bucket totals (product owner only).</summary>
    [HttpGet("gmail-backup/status")]
    public async Task<ActionResult> GetGmailBackupStatus(CancellationToken cancellationToken)
    {
        if (!_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can view Gmail backup status" });

        var runs = await _context.GoogleGmailBackupRuns.AsNoTracking()
            .OrderByDescending(r => r.StartedAt)
            .Take(10)
            .ToListAsync(cancellationToken);

        var perUser = await _context.GoogleGmailBackupMessages.AsNoTracking()
            .Where(m => m.Status == "backedUp")
            .GroupBy(m => m.UserEmail)
            .Select(g => new
            {
                email = g.Key,
                messages = g.Count(),
                bytes = g.Sum(x => x.SizeBytes),
                lastBackedUpAt = g.Max(x => x.BackedUpAt)
            })
            .OrderByDescending(x => x.bytes)
            .ToListAsync(cancellationToken);

        var failed = await _context.GoogleGmailBackupMessages.AsNoTracking()
            .CountAsync(m => m.Status == "failed", cancellationToken);

        return Ok(new
        {
            running = GoogleGmailBackupWorker.IsRunning,
            progress = GoogleGmailBackupWorker.Progress,
            runs,
            perUser,
            failedMessages = failed
        });
    }

    // ----- Per-account Google totals (in Google vs in bucket) -----

    /// <summary>
    /// Cached "what Google holds" counts per account (product owner only).
    /// Auto-starts a background recount when empty or older than 24 hours.
    /// </summary>
    [HttpGet("account-totals")]
    public async Task<ActionResult> GetAccountTotals(
        [FromServices] IServiceScopeFactory scopeFactory,
        CancellationToken cancellationToken)
    {
        if (!_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can view Google account totals" });

        var totals = await _context.GoogleAccountTotals.AsNoTracking()
            .OrderBy(t => t.Email)
            .ToListAsync(cancellationToken);

        var stale = totals.Count == 0 || totals.Max(t => t.FetchedAt) < DateTime.UtcNow.AddHours(-24);
        if (stale && !GoogleAccountTotalsWorker.IsRunning)
            StartAccountTotalsScan(scopeFactory);

        return Ok(new
        {
            running = GoogleAccountTotalsWorker.IsRunning,
            progress = GoogleAccountTotalsWorker.Progress,
            data = totals
        });
    }

    /// <summary>Starts a Google account recount in the background (product owner only).</summary>
    [HttpPost("account-totals/refresh")]
    public async Task<ActionResult> RefreshAccountTotals([FromServices] IServiceScopeFactory scopeFactory)
    {
        if (!_currentUser.IsProductOwner)
            return StatusCode(403, new { error = "Only the product owner can refresh Google account totals" });

        if (GoogleAccountTotalsWorker.IsRunning)
            return Ok(new { started = false, message = "A recount is already in progress" });

        await _auditService.LogAsync("update", "GoogleWorkspaceUser", null,
            "Google Workspace: manually started per-account Google totals recount");

        StartAccountTotalsScan(scopeFactory);
        return Ok(new { started = true });
    }

    private static void StartAccountTotalsScan(IServiceScopeFactory scopeFactory)
    {
        _ = Task.Run(async () =>
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var worker = scope.ServiceProvider.GetRequiredService<GoogleAccountTotalsWorker>();
            await worker.RunAsync(CancellationToken.None);
        });
    }
}

public class GoogleTransferRequest
{
    public string? NewOwnerUserId { get; set; }
    public string? NewOwnerEmail { get; set; }
    public List<long>? ApplicationIds { get; set; }
    public string? ApplicationNames { get; set; }
    public string? Email { get; set; }
}
