using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class MotivSafetyEvent
{
    [Key]
    public int Id { get; set; }

    public int? OrganizationId { get; set; }

    [Required]
    [MaxLength(120)]
    public string ExternalId { get; set; } = string.Empty;

    public DateTime? EventAt { get; set; }

    [MaxLength(120)]
    public string? EventType { get; set; }

    [MaxLength(60)]
    public string? Severity { get; set; }

    [MaxLength(200)]
    public string? DriverName { get; set; }

    [MaxLength(80)]
    public string? VehicleLabel { get; set; }

    [MaxLength(300)]
    public string? Location { get; set; }

    [MaxLength(80)]
    public string? Status { get; set; }

    public bool HasVideo { get; set; }

    [MaxLength(500)]
    public string? VideoUrl { get; set; }

    public string? RawJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
