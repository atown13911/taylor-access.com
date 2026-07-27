using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// One Drive file backed up to the Railway bucket. Unique per (UserEmail, FileId);
/// re-runs update the row when the file changes in Drive.
/// </summary>
public class GoogleDriveBackupFile
{
    [Key]
    public int Id { get; set; }

    [MaxLength(256)]
    public string UserEmail { get; set; } = string.Empty;

    [MaxLength(128)]
    public string FileId { get; set; } = string.Empty;

    [MaxLength(1024)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(256)]
    public string MimeType { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    [MaxLength(64)]
    public string? Md5 { get; set; }

    [MaxLength(64)]
    public string? ModifiedTime { get; set; }

    [MaxLength(2048)]
    public string S3Key { get; set; } = string.Empty;

    /// <summary>backedUp | failed</summary>
    [MaxLength(20)]
    public string Status { get; set; } = "backedUp";

    [MaxLength(500)]
    public string? Error { get; set; }

    public DateTime BackedUpAt { get; set; } = DateTime.UtcNow;
}
