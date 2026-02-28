using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// Push notification subscription (for web push or mobile)
/// </summary>
public class PushSubscription
{
    public int Id { get; set; }
    
    [Required]
    public int UserId { get; set; }
    
    /// <summary>
    /// Platform: web, ios, android
    /// </summary>
    [Required]
    public string Platform { get; set; } = "web";
    
    /// <summary>
    /// Device token or subscription endpoint
    /// </summary>
    [Required]
    public string Token { get; set; } = string.Empty;
    
    /// <summary>
    /// For web push: P256DH key
    /// </summary>
    public string? P256dhKey { get; set; }
    
    /// <summary>
    /// For web push: Auth secret
    /// </summary>
    public string? AuthSecret { get; set; }
    
    /// <summary>
    /// Device name/identifier
    /// </summary>
    public string? DeviceName { get; set; }
    
    /// <summary>
    /// Whether this subscription is active
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Last successful push
    /// </summary>
    public DateTime? LastPushAt { get; set; }
    
    /// <summary>
    /// Number of failed pushes
    /// </summary>
    public int FailedCount { get; set; } = 0;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation
    public virtual User? User { get; set; }
}

/// <summary>
/// Notification history
/// </summary>
public class NotificationLog
{
    public int Id { get; set; }
    
    public int? UserId { get; set; }
    
    /// <summary>
    /// Type: order_update, driver_alert, payment_received, etc.
    /// </summary>
    [Required]
    public string Type { get; set; } = string.Empty;
    
    [Required]
    public string Title { get; set; } = string.Empty;
    
    [Required]
    public string Body { get; set; } = string.Empty;
    
    /// <summary>
    /// Additional data payload (JSON)
    /// </summary>
    public string? Data { get; set; }
    
    /// <summary>
    /// Channel: push, email, sms, in_app
    /// </summary>
    public string Channel { get; set; } = "push";
    
    /// <summary>
    /// Status: pending, sent, delivered, failed, read
    /// </summary>
    public string Status { get; set; } = "pending";
    
    /// <summary>
    /// Error message if failed
    /// </summary>
    public string? Error { get; set; }
    
    public DateTime? SentAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
    public DateTime? ReadAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Request DTOs
public record SubscribePushRequest(
    string Platform,
    string Token,
    string? P256dhKey,
    string? AuthSecret,
    string? DeviceName
);

public record SendPushRequest(
    int UserId,
    string Title,
    string Body,
    string? Type,
    Dictionary<string, string>? Data
);

public record BroadcastPushRequest(
    string Title,
    string Body,
    string? Type,
    Dictionary<string, string>? Data,
    string? Role // Optional: only send to users with this role
);




