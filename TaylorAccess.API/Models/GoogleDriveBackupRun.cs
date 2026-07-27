using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>Summary of one Drive-to-bucket backup run.</summary>
public class GoogleDriveBackupRun
{
    [Key]
    public int Id { get; set; }

    public DateTime StartedAt { get; set; } = DateTime.UtcNow;

    public DateTime? FinishedAt { get; set; }

    /// <summary>running | completed | failed</summary>
    [MaxLength(20)]
    public string Status { get; set; } = "running";

    [MaxLength(50)]
    public string Trigger { get; set; } = "scheduled";

    public int UsersProcessed { get; set; }

    public int FilesBackedUp { get; set; }

    public int FilesSkipped { get; set; }

    public int FilesFailed { get; set; }

    public long BytesUploaded { get; set; }

    [MaxLength(1000)]
    public string? Error { get; set; }
}
