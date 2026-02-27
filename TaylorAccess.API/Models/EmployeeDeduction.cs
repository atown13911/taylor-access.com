using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class EmployeeDeduction
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = "other";

    [MaxLength(200)]
    public string? Description { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal Amount { get; set; }

    [MaxLength(20)]
    public string Frequency { get; set; } = "monthly";

    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "active";

    [Column(TypeName = "decimal(12,2)")]
    public decimal TotalDeducted { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
