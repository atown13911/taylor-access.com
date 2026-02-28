using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class TimeOffRequest
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    public int EmployeeId { get; set; }

    [ForeignKey("EmployeeId")]
    public User? Employee { get; set; }

    [Required]
    [MaxLength(30)]
    public string Type { get; set; } = "pto";

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal Days { get; set; }

    [MaxLength(1000)]
    public string? Reason { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "pending";

    public int? ApprovedById { get; set; }

    [ForeignKey("ApprovedById")]
    public User? ApprovedBy { get; set; }

    public DateTime? ApprovedAt { get; set; }

    [MaxLength(500)]
    public string? ApprovalNotes { get; set; }

    [MaxLength(500)]
    public string? DenialReason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class TimeOffBalance
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    public int EmployeeId { get; set; }

    [ForeignKey("EmployeeId")]
    public User? Employee { get; set; }

    public int Year { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal PtoTotal { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal PtoUsed { get; set; }

    [NotMapped]
    public decimal PtoRemaining => PtoTotal - PtoUsed;

    [Column(TypeName = "decimal(10,2)")]
    public decimal SickTotal { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal SickUsed { get; set; }

    [NotMapped]
    public decimal SickRemaining => SickTotal - SickUsed;

    [Column(TypeName = "decimal(10,2)")]
    public decimal PersonalTotal { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal PersonalUsed { get; set; }

    [NotMapped]
    public decimal PersonalRemaining => PersonalTotal - PersonalUsed;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
