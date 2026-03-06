using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class CompanyPermit
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [Required]
    [MaxLength(100)]
    public string PermitNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string PermitType { get; set; } = "overweight";

    [MaxLength(5)]
    public string? State { get; set; }

    public DateTime? IssueDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    public decimal? Cost { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "active";

    public int? AssignedDriverId { get; set; }

    [ForeignKey("AssignedDriverId")]
    public Driver? AssignedDriver { get; set; }

    [MaxLength(50)]
    public string? AssignedTruckNumber { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
