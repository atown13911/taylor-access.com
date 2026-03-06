using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/webhooks")]
[Authorize(Roles = "product_owner,superadmin")]
public class WebhooksController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly WebhookService _webhookService;

    public WebhooksController(TaylorAccessDbContext context, WebhookService webhookService)
    {
        _context = context;
        _webhookService = webhookService;
    }

    [HttpPost("replay-all")]
    public async Task<ActionResult> ReplayAll()
    {
        var users = await _context.Users.AsNoTracking().ToListAsync();
        _webhookService.FireEmployeeBulk(users);
        return Ok(new { message = $"Replaying {users.Count} employees to all webhook URLs" });
    }
}
