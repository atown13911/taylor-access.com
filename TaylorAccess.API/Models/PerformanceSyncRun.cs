using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class PerformanceSyncRun
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [MaxLength(20)]
    public string PeriodMode { get; set; } = "weekly";

    [Column(TypeName = "date")]
    public DateTime FromDate { get; set; }

    [Column(TypeName = "date")]
    public DateTime ToDate { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "running";

    [MaxLength(40)]
    public string Trigger { get; set; } = "manual-update";

    public string? CompletenessJson { get; set; }

    public string? ErrorMessage { get; set; }

    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? FinishedAt { get; set; }
}
