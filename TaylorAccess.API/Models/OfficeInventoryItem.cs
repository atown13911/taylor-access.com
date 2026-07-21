using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class OfficeInventoryItem
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey(nameof(OrganizationId))]
    public Organization? Organization { get; set; }

    /// <summary>computer | phone | monitor | headset | badge | keys</summary>
    [Required]
    [MaxLength(40)]
    public string AssetType { get; set; } = "computer";

    [Required]
    [MaxLength(100)]
    public string AssetTag { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Label { get; set; }

    [MaxLength(100)]
    public string? Make { get; set; }

    [MaxLength(100)]
    public string? Model { get; set; }

    [MaxLength(100)]
    public string? SerialNumber { get; set; }

    /// <summary>available | assigned | retired</summary>
    [MaxLength(30)]
    public string Status { get; set; } = "available";

    public int? AssignedUserId { get; set; }

    [ForeignKey(nameof(AssignedUserId))]
    public User? AssignedUser { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
