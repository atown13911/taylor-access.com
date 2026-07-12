using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class PerformanceScorecardSnapshot
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    public int EmployeeId { get; set; }

    [MaxLength(120)]
    public string? EmployeeName { get; set; }

    [MaxLength(20)]
    public string PeriodMode { get; set; } = "weekly";

    [Column(TypeName = "date")]
    public DateTime FromDate { get; set; }

    [Column(TypeName = "date")]
    public DateTime ToDate { get; set; }

    public int? SyncRunId { get; set; }

    public int CallVolume { get; set; }
    public double TotalCallMinutes { get; set; }
    public double AvgCallMinutes { get; set; }
    public int TextVolume { get; set; }

    public int SentCount { get; set; }
    public int ReplyCount { get; set; }
    public double FirstResponseMinutes { get; set; }
    public double FollowUpRate { get; set; }
    public int InternalCount { get; set; }
    public int ExternalCount { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal ClockedHours { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal ActiveHours { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal IdleHours { get; set; }

    [Column(TypeName = "decimal(6,4)")]
    public decimal PresenceRate { get; set; }

    [Column(TypeName = "decimal(6,4)")]
    public decimal SystemRate { get; set; }

    [Column(TypeName = "decimal(6,4)")]
    public decimal BusyRate { get; set; }

    public int ClickCount { get; set; }
    public int InteractionCount { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal InvoicedRevenue { get; set; }

    public int Score { get; set; }

    [MaxLength(20)]
    public string? BusySource { get; set; }

    [MaxLength(40)]
    public string Source { get; set; } = "access-direct";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
