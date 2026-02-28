using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Push notifications controller
/// </summary>
[ApiController]
[Route("api/v1/push")]
[Authorize]
public class PushNotificationsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ILogger<PushNotificationsController> _logger;

    public PushNotificationsController(
        TaylorAccessDbContext context, 
        IAuditService auditService,
        ILogger<PushNotificationsController> logger)
    {
        _context = context;
        _auditService = auditService;
        _logger = logger;
    }

    /// <summary>
    /// Get VAPID public key for web push
    /// </summary>
    [HttpGet("vapid-key")]
    [AllowAnonymous]
    public ActionResult<object> GetVapidKey()
    {
        // In production, generate proper VAPID keys
        // npx web-push generate-vapid-keys
        return Ok(new
        {
            publicKey = "BNxqjIxYkpDOXt9WP3IAWsEI_VpJFEq2_j-tPNbKMKVzF8p3Xz6_QQWIuBNqKXHZ7mEy4rR8F9pN-PnJtMxWcO8",
            note = "This is a placeholder key. Generate real VAPID keys for production."
        });
    }

    /// <summary>
    /// Subscribe to push notifications
    /// </summary>
    [HttpPost("subscribe")]
    [Authorize]
    public async Task<ActionResult<object>> Subscribe([FromBody] SubscribePushRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        // Check for existing subscription
        var existing = await _context.PushSubscriptions
            .FirstOrDefaultAsync(s => s.UserId == userId && s.Token == request.Token);

        if (existing != null)
        {
            existing.IsActive = true;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            var subscription = new PushSubscription
            {
                UserId = userId.Value,
                Platform = request.Platform,
                Token = request.Token,
                P256dhKey = request.P256dhKey,
                AuthSecret = request.AuthSecret,
                DeviceName = request.DeviceName
            };
            _context.PushSubscriptions.Add(subscription);
        }

        await _context.SaveChangesAsync();

        return Ok(new { message = "Subscribed to push notifications" });
    }

    /// <summary>
    /// Unsubscribe from push notifications
    /// </summary>
    [HttpPost("unsubscribe")]
    [Authorize]
    public async Task<ActionResult<object>> Unsubscribe([FromBody] UnsubscribeRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var subscription = await _context.PushSubscriptions
            .FirstOrDefaultAsync(s => s.UserId == userId && s.Token == request.Token);

        if (subscription != null)
        {
            subscription.IsActive = false;
            subscription.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }

        return Ok(new { message = "Unsubscribed from push notifications" });
    }

    /// <summary>
    /// Get current user's subscriptions
    /// </summary>
    [HttpGet("subscriptions")]
    [Authorize]
    public async Task<ActionResult<object>> GetSubscriptions()
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var subscriptions = await _context.PushSubscriptions
            .Where(s => s.UserId == userId && s.IsActive)
            .Select(s => new
            {
                s.Id,
                s.Platform,
                s.DeviceName,
                s.LastPushAt,
                s.CreatedAt
            })
            .ToListAsync();

        return Ok(new { data = subscriptions });
    }

    /// <summary>
    /// Send push notification to a user
    /// </summary>
    [HttpPost("send")]
    [Authorize]
    public async Task<ActionResult<object>> SendPush([FromBody] SendPushRequest request)
    {
        var subscriptions = await _context.PushSubscriptions
            .Where(s => s.UserId == request.UserId && s.IsActive)
            .ToListAsync();

        if (!subscriptions.Any())
        {
            return Ok(new { message = "No active subscriptions for this user", sent = 0 });
        }

        // Log the notification
        var notification = new NotificationLog
        {
            UserId = request.UserId,
            Type = request.Type ?? "general",
            Title = request.Title,
            Body = request.Body,
            Data = request.Data != null ? System.Text.Json.JsonSerializer.Serialize(request.Data) : null,
            Channel = "push"
        };

        var sentCount = 0;
        var errors = new List<string>();

        foreach (var sub in subscriptions)
        {
            try
            {
                // In production, implement actual push sending
                // For Web Push: use WebPush library
                // For iOS: use APNs
                // For Android: use FCM

                _logger.LogInformation($"[PUSH] Would send to {sub.Platform}: {request.Title}");
                
                sub.LastPushAt = DateTime.UtcNow;
                sentCount++;
            }
            catch (Exception ex)
            {
                sub.FailedCount++;
                errors.Add($"{sub.Platform}: {ex.Message}");

                // Disable subscription after 5 failures
                if (sub.FailedCount >= 5)
                    sub.IsActive = false;
            }
        }

        notification.Status = sentCount > 0 ? "sent" : "failed";
        notification.SentAt = DateTime.UtcNow;
        notification.Error = errors.Any() ? string.Join("; ", errors) : null;

        _context.NotificationLogs.Add(notification);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = $"Push notification sent to {sentCount} device(s)",
            sent = sentCount,
            failed = errors.Count,
            errors
        });
    }

    /// <summary>
    /// Broadcast push to all users (or filtered by role)
    /// </summary>
    [HttpPost("broadcast")]
    [Authorize]
    public async Task<ActionResult<object>> Broadcast([FromBody] BroadcastPushRequest request)
    {
        IQueryable<PushSubscription> query = _context.PushSubscriptions
            .Where(s => s.IsActive);

        // Filter by role if specified
        if (!string.IsNullOrEmpty(request.Role))
        {
            var usersInRole = await _context.UserRoles
                .Include(ur => ur.Role)
                .Where(ur => ur.Role != null && ur.Role.Name == request.Role)
                .Select(ur => ur.UserId)
                .ToListAsync();

            query = query.Where(s => usersInRole.Contains(s.UserId));
        }

        var subscriptions = await query.ToListAsync();
        var sentCount = 0;

        foreach (var sub in subscriptions)
        {
            try
            {
                _logger.LogInformation($"[BROADCAST] Would send to {sub.UserId}: {request.Title}");
                sub.LastPushAt = DateTime.UtcNow;
                sentCount++;
            }
            catch
            {
                sub.FailedCount++;
            }
        }

        await _context.SaveChangesAsync();

        await _auditService.LogAsync("push_broadcast", "NotificationLog", null,
            $"Broadcast sent to {sentCount} devices");

        return Ok(new
        {
            message = $"Broadcast sent to {sentCount} device(s)",
            totalSubscriptions = subscriptions.Count,
            sent = sentCount
        });
    }

    /// <summary>
    /// Get notification history for current user
    /// </summary>
    [HttpGet("history")]
    [Authorize]
    public async Task<ActionResult<object>> GetHistory([FromQuery] int limit = 50)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var notifications = await _context.NotificationLogs
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAt)
            .Take(limit)
            .ToListAsync();

        return Ok(new { data = notifications });
    }

    /// <summary>
    /// Mark notification as read
    /// </summary>
    [HttpPost("{id}/read")]
    [Authorize]
    public async Task<ActionResult<object>> MarkAsRead(int id)
    {
        var notification = await _context.NotificationLogs.FindAsync(id);
        if (notification == null)
            return NotFound();

        notification.Status = "read";
        notification.ReadAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { message = "Marked as read" });
    }

    private int? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst("userId")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (int.TryParse(userIdClaim, out var userId))
            return userId;
        return null;
    }
}

public record UnsubscribeRequest(string Token);




