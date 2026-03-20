using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class MotivFuelPurchase
{
    [Key]
    public int Id { get; set; }

    public int? OrganizationId { get; set; }

    [Required]
    [MaxLength(100)]
    public string ExternalId { get; set; } = string.Empty;

    public DateTime? TransactionTime { get; set; }
    public DateTime? PostedAt { get; set; }

    public int? DriverId { get; set; }
    public int? VehicleId { get; set; }

    [MaxLength(100)]
    public string? CardId { get; set; }

    [MaxLength(200)]
    public string? MerchantName { get; set; }

    [MaxLength(100)]
    public string? MerchantCity { get; set; }

    [MaxLength(50)]
    public string? MerchantState { get; set; }

    [MaxLength(50)]
    public string? Status { get; set; }

    [MaxLength(20)]
    public string? Currency { get; set; }

    [MaxLength(100)]
    public string? Category { get; set; }

    [MaxLength(100)]
    public string? ProductType { get; set; }

    [Column(TypeName = "decimal(12,3)")]
    public decimal? Quantity { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal? Amount { get; set; }

    public string? RawJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

