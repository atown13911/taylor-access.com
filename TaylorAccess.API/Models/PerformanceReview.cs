using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class PerformanceReview
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    public int EmployeeId { get; set; }

    [ForeignKey("EmployeeId")]
    public User? Employee { get; set; }

    public int? ReviewerId { get; set; }

    [ForeignKey("ReviewerId")]
    public User? Reviewer { get; set; }

    [MaxLength(100)]
    public string? EmployeeName { get; set; }

    [MaxLength(100)]
    public string? ReviewerName { get; set; }

    [MaxLength(30)]
    public string ReviewType { get; set; } = "monthly";

    [Required]
    public int Year { get; set; }

    [Required]
    public int Month { get; set; }

    [MaxLength(20)]
    public string Period { get; set; } = string.Empty; // yyyy-MM

    [Range(1, 5)]
    public int OverallRating { get; set; } = 3;

    public string? Strengths { get; set; }
    public string? AreasForImprovement { get; set; }
    public string? Goals { get; set; }
    public string? Comments { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "pending";

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

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
