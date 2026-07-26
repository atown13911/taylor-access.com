using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// Persisted driver assignment override for a Motive fuel card.
/// An empty DriverId means the card is explicitly unassigned (overriding Motive's own assignment).
/// </summary>
public class FuelCardAssignment
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(120)]
    public string CardId { get; set; } = string.Empty;

    [Required]
    public int OrganizationId { get; set; }

    [MaxLength(50)]
    public string DriverId { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? DriverName { get; set; }

    [MaxLength(200)]
    public string? DriverEmail { get; set; }

    public int? AssignedByUserId { get; set; }

    [MaxLength(150)]
    public string? AssignedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
