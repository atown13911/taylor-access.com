using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class TrailerAssignment
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string TrailerId { get; set; } = string.Empty;

    [Required]
    public int OrganizationId { get; set; }

    [MaxLength(100)]
    public string? PermitNumber { get; set; }

    [MaxLength(50)]
    public string? PermitType { get; set; }

    [MaxLength(5)]
    public string? State { get; set; }

    public DateTime? IssueDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    public decimal? Cost { get; set; }

    [MaxLength(30)]
    public string? Vendor { get; set; }

    [MaxLength(30)]
    public string? ChargeFrequency { get; set; }

    [MaxLength(20)]
    public string TrailerStatus { get; set; } = "active";

    public int? AssignedDriverId { get; set; }

    [MaxLength(150)]
    public string? AssignedDriverName { get; set; }

    /// <summary>
    /// When true, Taylor Access driver assignment takes precedence over Taylor Assets.
    /// </summary>
    public bool DriverOverride { get; set; }

    [MaxLength(50)]
    public string? AssignedTruckNumber { get; set; }

    public string? Notes { get; set; }

    public string? FileName { get; set; }

    public string? FileContent { get; set; }

    public string? ContentType { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
