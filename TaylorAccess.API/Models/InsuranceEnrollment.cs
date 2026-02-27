using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

/// <summary>
/// Links a Driver to an InsurancePolicy with per-driver deduction and coverage details.
/// </summary>
public class InsuranceEnrollment
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int InsurancePolicyId { get; set; }

    [ForeignKey("InsurancePolicyId")]
    public InsurancePolicy? InsurancePolicy { get; set; }

    [Required]
    public int DriverId { get; set; }

    [ForeignKey("DriverId")]
    public Driver? Driver { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [MaxLength(20)]
    public string? CoverageLevel { get; set; } // basic, standard, premium, custom

    [Column(TypeName = "decimal(10,2)")]
    public decimal? DeductionAmount { get; set; }

    [MaxLength(20)]
    public string? DeductionFrequency { get; set; } // weekly, biweekly, monthly, per_load

    [MaxLength(100)]
    public string? PaymentTerms { get; set; }

    [MaxLength(200)]
    public string? Beneficiary { get; set; }

    public DateTime? EffectiveDate { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "active"; // active, inactive (opted in/out)

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

