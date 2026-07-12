using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class TimeclockSession
{
    [Key]
    public int Id { get; set; }

    public int? UserId { get; set; }
    [ForeignKey("UserId")]
    public User? User { get; set; }

    [Required, MaxLength(256)]
    public string UserEmail { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? UserName { get; set; }

    /// <summary>UTC date this session belongs to (date part only, for grouping)</summary>
    public DateTime Date { get; set; }

    public DateTime LoginTime { get; set; } = DateTime.UtcNow;
    public DateTime? LogoutTime { get; set; }

    /// <summary>Last heartbeat received from the client</summary>
    public DateTime LastHeartbeat { get; set; } = DateTime.UtcNow;

    /// <summary>Total seconds the user was actively using the app</summary>
    public int ActiveSeconds { get; set; } = 0;

    /// <summary>Total seconds the user was idle (tab open but no input)</summary>
    public int IdleSeconds { get; set; } = 0;

    /// <summary>Pointer clicks / taps attributed to this session</summary>
    public int ClickCount { get; set; } = 0;

    /// <summary>Keypresses attributed to this session</summary>
    public int KeypressCount { get; set; } = 0;

    /// <summary>Scroll events attributed to this session</summary>
    public int ScrollCount { get; set; } = 0;

    /// <summary>Pointer-move samples (throttled client-side)</summary>
    public int PointerMoveCount { get; set; } = 0;

    /// <summary>In-app route / page changes</summary>
    public int RouteChangeCount { get; set; } = 0;

    /// <summary>
    /// Suite app that owns this session (access, vantac, accounting, crm, …).
    /// One open session per email+date+app so apps don't collide.
    /// </summary>
    [MaxLength(40)]
    public string AppSource { get; set; } = "access";

    /// <summary>active | idle | offline</summary>
    [MaxLength(20)]
    public string Status { get; set; } = "active";

    [MaxLength(50)]
    public string? IpAddress { get; set; }

    // Computed helpers
    [NotMapped]
    public int TotalSeconds => (int)((LogoutTime ?? LastHeartbeat) - LoginTime).TotalSeconds;

    [NotMapped]
    public bool IsActive => Status != "offline" &&
                            (DateTime.UtcNow - LastHeartbeat).TotalMinutes < 3;
}
