using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class MotivDriverProfile
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int DriverId { get; set; }

    [ForeignKey("DriverId")]
    public Driver? Driver { get; set; }

    [MaxLength(100)]
    public string? MotivUserId { get; set; }

    [MaxLength(100)]
    public string? MotivVehicleId { get; set; }

    [MaxLength(50)]
    public string? MotivStatus { get; set; }

    [Column(TypeName = "decimal(10,7)")]
    public decimal? Latitude { get; set; }

    [Column(TypeName = "decimal(10,7)")]
    public decimal? Longitude { get; set; }

    public DateTime? LastLocationUpdate { get; set; }

    [MaxLength(50)]
    public string? VehicleNumber { get; set; }

    [MaxLength(50)]
    public string? VehicleMake { get; set; }

    [MaxLength(50)]
    public string? VehicleModel { get; set; }

    public int? VehicleYear { get; set; }

    [MaxLength(17)]
    public string? VehicleVin { get; set; }

    public string? RawJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
