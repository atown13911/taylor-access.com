using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/google")]
[Authorize]
public class GoogleWorkspaceController : ControllerBase
{
    private readonly GoogleDirectoryService _directory;

    public GoogleWorkspaceController(GoogleDirectoryService directory)
    {
        _directory = directory;
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
}
