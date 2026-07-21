using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class TrailerAssignmentLog
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string TrailerId { get; set; } = string.Empty;

    [Required]
    public int OrganizationId { get; set; }

    /// <summary>
    /// assigned | unassigned | updated | deactivated | reactivated | photo_uploaded | agreement_uploaded
    /// </summary>
    [Required]
    [MaxLength(40)]
    public string EventType { get; set; } = string.Empty;

    public int? DriverId { get; set; }

    [MaxLength(150)]
    public string? DriverName { get; set; }

    public int? PreviousDriverId { get; set; }

    [MaxLength(150)]
    public string? PreviousDriverName { get; set; }

    [MaxLength(50)]
    public string? TruckNumber { get; set; }

    [MaxLength(20)]
    public string? TrailerStatus { get; set; }

    public int? PhotoId { get; set; }

    [MaxLength(255)]
    public string? PhotoFileName { get; set; }

    public int? ChangedByUserId { get; set; }

    [MaxLength(150)]
    public string? ChangedBy { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
