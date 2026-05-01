using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class EmployeePerformanceDailyMetric
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    public int EmployeeId { get; set; }

    [MaxLength(100)]
    public string? EmployeeName { get; set; }

    [Column(TypeName = "date")]
    public DateTime MetricDate { get; set; }

    public int CallVolume { get; set; }
    public int TextVolume { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal ClockedHours { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal WorkHours { get; set; }

    [Column(TypeName = "decimal(6,4)")]
    public decimal ActivityRate { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal InvoicedRevenue { get; set; }

    public int Score { get; set; }

    [MaxLength(60)]
    public string Source { get; set; } = "zoom-google-sync";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
