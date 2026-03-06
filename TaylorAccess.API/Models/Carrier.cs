using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Carrier
{
    [Key]
    public int Id { get; set; }

    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? McNumber { get; set; }

    [MaxLength(50)]
    public string? DotNumber { get; set; }

    [MaxLength(10)]
    public string? ScacCode { get; set; }

    [MaxLength(100)]
    public string? ContactName { get; set; }

    [MaxLength(30)]
    public string? Phone { get; set; }

    [MaxLength(100)]
    public string? Email { get; set; }

    [MaxLength(200)]
    public string? Address { get; set; }

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(5)]
    public string? State { get; set; }

    [MaxLength(10)]
    public string? ZipCode { get; set; }

    [MaxLength(100)]
    public string? InsuranceProvider { get; set; }

    public DateTime? InsuranceExpiry { get; set; }

    public decimal? InsuranceAmount { get; set; }

    [MaxLength(20)]
    public string? PaymentTerms { get; set; } = "net_30";

    public int Rating { get; set; } = 0;

    [MaxLength(20)]
    public string? SafetyRating { get; set; } = "none";

    public int CsaScore { get; set; } = 0;

    [MaxLength(20)]
    public string Status { get; set; } = "active";

    public int TotalLoads { get; set; } = 0;

    public decimal OnTimeRate { get; set; } = 0;

    public decimal AvgRate { get; set; } = 0;

    public string? Notes { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
