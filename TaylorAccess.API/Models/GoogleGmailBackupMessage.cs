using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// One Gmail message backed up to the Railway bucket as a raw .eml file.
/// Messages are immutable in Gmail, so a backed-up row is never re-fetched.
/// Unique per (UserEmail, MessageId).
/// </summary>
public class GoogleGmailBackupMessage
{
    [Key]
    public int Id { get; set; }

    [MaxLength(256)]
    public string UserEmail { get; set; } = string.Empty;

    [MaxLength(64)]
    public string MessageId { get; set; } = string.Empty;

    [MaxLength(64)]
    public string? ThreadId { get; set; }

    public long SizeBytes { get; set; }

    /// <summary>Gmail internalDate (epoch ms) converted to UTC.</summary>
    public DateTime? InternalDate { get; set; }

    [MaxLength(512)]
    public string S3Key { get; set; } = string.Empty;

    /// <summary>backedUp | failed</summary>
    [MaxLength(20)]
    public string Status { get; set; } = "backedUp";

    [MaxLength(500)]
    public string? Error { get; set; }

    public DateTime BackedUpAt { get; set; } = DateTime.UtcNow;
}
