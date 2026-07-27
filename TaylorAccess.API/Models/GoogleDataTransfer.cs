using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// Permanent record of a Google Workspace data transfer (e.g. Drive/Calendar ownership
/// moved between accounts during offboarding) started from Taylor Access.
/// </summary>
public class GoogleDataTransfer
{
    [Key]
    public int Id { get; set; }

    [MaxLength(100)]
    public string? GoogleTransferId { get; set; }

    [MaxLength(100)]
    public string SourceGoogleUserId { get; set; } = string.Empty;

    [MaxLength(256)]
    public string SourceEmail { get; set; } = string.Empty;

    [MaxLength(100)]
    public string TargetGoogleUserId { get; set; } = string.Empty;

    [MaxLength(256)]
    public string TargetEmail { get; set; } = string.Empty;

    /// <summary>Comma-separated application names (e.g. "Drive and Docs, Calendar").</summary>
    [MaxLength(500)]
    public string Applications { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Status { get; set; } = "inProgress";

    public int? RequestedByUserId { get; set; }

    [MaxLength(256)]
    public string? RequestedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
