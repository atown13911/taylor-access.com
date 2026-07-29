using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// What Google currently holds for one account: total Drive files (counted the
/// same way the Drive backup enumerates them) and total Gmail messages (from
/// the Gmail profile, includes spam/trash like the backup does). Compared
/// against the bucket backup counts to verify backup coverage.
/// </summary>
public class GoogleAccountTotal
{
    [Key]
    public int Id { get; set; }

    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    /// <summary>Null when the Drive count failed for this account.</summary>
    public long? DriveFiles { get; set; }

    /// <summary>Null when the Gmail count failed for this account.</summary>
    public long? GmailMessages { get; set; }

    [MaxLength(500)]
    public string? Error { get; set; }

    public DateTime FetchedAt { get; set; } = DateTime.UtcNow;
}
