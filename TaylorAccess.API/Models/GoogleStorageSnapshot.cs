using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// Daily per-user Google Workspace storage snapshot captured from the Reports usage API.
/// One row per user per report date; includes restricted (hidden) accounts.
/// </summary>
public class GoogleStorageSnapshot
{
    [Key]
    public int Id { get; set; }

    /// <summary>Google usage report date (yyyy-MM-dd), which lags real time by ~2 days.</summary>
    public DateTime ReportDate { get; set; }

    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    public long UsedMb { get; set; }

    public long DriveMb { get; set; }

    public long GmailMb { get; set; }

    public long PhotosMb { get; set; }

    public double UsedPercent { get; set; }

    public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
}
