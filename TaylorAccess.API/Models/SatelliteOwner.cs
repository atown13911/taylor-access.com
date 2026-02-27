using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class SatelliteOwner
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int SatelliteId { get; set; }

    [ForeignKey("SatelliteId")]
    public Satellite? Satellite { get; set; }

    public int? UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Role { get; set; } = "owner";

    [Column(TypeName = "decimal(5,2)")]
    public decimal OwnershipPercent { get; set; }

    [MaxLength(100)]
    public string? Email { get; set; }

    [MaxLength(50)]
    public string? Phone { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
