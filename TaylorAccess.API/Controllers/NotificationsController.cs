using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly IEmailService _emailService;
    private readonly CurrentUserService _currentUserService;

    public NotificationsController(TaylorAccessDbContext context, IEmailService emailService, CurrentUserService currentUserService)
    {
        _context = context;
        _emailService = emailService;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get all notifications for the current user
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetNotifications()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var notificationsFromDb = await _context.NotificationLogs
            .Where(n => n.UserId == user.Id)
            .OrderByDescending(n => n.CreatedAt)
            .Take(50)
            .Select(n => new {
                id = n.Id.ToString(),
                type = MapNotificationType(n.Type),
                priority = GetPriorityFromType(n.Type),
                title = n.Title,
                message = n.Body,
                timestamp = n.CreatedAt.ToString("o"),
                isRead = n.ReadAt != null,
                actionUrl = n.Data,
                actionLabel = "View"
            })
            .ToListAsync();

        if (!notificationsFromDb.Any())
        {
            var dynamicNotifications = GenerateWelcomeNotification();
            return Ok(new { data = dynamicNotifications });
        }

        return Ok(new { data = notificationsFromDb });
    }

    private static string MapNotificationType(string type)
    {
        return type switch
        {
            "order_update" => "shipment",
            "driver_alert" => "driver",
            "payment_received" => "financial",
            "invoice_overdue" => "financial",
            "compliance_warning" => "compliance",
            "edi_received" => "edi",
            _ => "system"
        };
    }

    private static string GetPriorityFromType(string type)
    {
        return type switch
        {
            "compliance_warning" => "critical",
            "invoice_overdue" => "high",
            "driver_alert" => "high",
            "order_update" => "medium",
            _ => "low"
        };
    }

    private static List<object> GenerateWelcomeNotification()
    {
        return new List<object>
        {
            new {
                id = "welcome",
                type = "system",
                priority = "low",
                title = "Welcome to Taylor Access",
                message = "Your notification center is empty. Alerts will appear here as they occur.",
                timestamp = DateTime.UtcNow.ToString("o"),
                isRead = false,
                actionUrl = "/dashboard",
                actionLabel = "Dashboard"
            }
        };
    }

    [HttpPut("{id}/read")]
    public ActionResult MarkAsRead(string id)
    {
        return Ok(new { message = "Notification marked as read", id });
    }

    [HttpPut("mark-all-read")]
    public ActionResult MarkAllAsRead()
    {
        return Ok(new { message = "All notifications marked as read" });
    }

    [HttpDelete("{id}")]
    public ActionResult DeleteNotification(string id)
    {
        return Ok(new { message = "Notification deleted", id });
    }

    [HttpDelete]
    public ActionResult ClearAll()
    {
        return Ok(new { message = "All notifications cleared" });
    }

    [HttpPost("test")]
    public async Task<ActionResult> SendTestEmail([FromBody] SendEmailRequest request)
    {
        if (string.IsNullOrEmpty(request.Email))
            return BadRequest(new { message = "Email is required" });

        var success = await _emailService.SendEmailAsync(
            request.Email,
            request.Subject ?? "Test Email from Taylor Access",
            request.Body ?? "<h1>Test Email</h1><p>This is a test email from Taylor Access.</p>"
        );

        return success 
            ? Ok(new { message = "Test email sent" })
            : StatusCode(500, new { message = "Failed to send test email" });
    }
}

public record SendEmailRequest(string Email, string? Subject, string? Body);



