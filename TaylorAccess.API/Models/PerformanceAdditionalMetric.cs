using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class PerformanceAdditionalMetric
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

    public int Voicemails { get; set; }
    public double VoicemailMinutes { get; set; }
    public int PhoneRecordings { get; set; }
    public double RecordingMinutes { get; set; }
    public int MeetingsHosted { get; set; }
    public int MeetingsJoined { get; set; }
    public double MeetingMinutes { get; set; }
    public int InboundCalls { get; set; }
    public int OutboundCalls { get; set; }
    public int MissedCalls { get; set; }
    public int ChatChannels { get; set; }

    [MaxLength(40)]
    public string Source { get; set; } = "zoom-api-direct";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
