using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class InsurancePolicy
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [Required]
    [MaxLength(50)]
    public string PolicyType { get; set; } = string.Empty;
    // general_liability, auto_liability, cargo, workers_comp, mcs90,
    // umbrella, physical_damage, bobtail, non_trucking, occupational_accident

    [Required]
    [MaxLength(200)]
    public string ProviderName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? PolicyNumber { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal? CoverageAmount { get; set; }

    public DateTime? EffectiveDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "active"; // active, expiring, expired

    public string? Notes { get; set; }

    // Billing & Cost
    [Column(TypeName = "decimal(18,2)")]
    public decimal? PremiumCost { get; set; }

    [MaxLength(20)]
    public string? BillingFrequency { get; set; } // monthly, quarterly, semi_annual, annual

    [MaxLength(20)]
    public string? PaymentMethod { get; set; } // ach, check, credit_card, wire, auto_debit

    public int? DueDayOfMonth { get; set; }

    public DateTime? NextPaymentDate { get; set; }

    [MaxLength(5)]
    public string? AutoRenew { get; set; } // yes, no

    public string? BillingNotes { get; set; }

    // Reminder settings
    public bool Remind3Months { get; set; } = false;
    public bool Remind30Days { get; set; } = true;
    public bool Remind15Days { get; set; } = true;
    public bool RemindDayOf { get; set; } = true;
    public bool RemindDailyPastDue { get; set; } = true;

    // File storage (base64)
    [MaxLength(200)]
    public string? FileName { get; set; }

    public string? FileContent { get; set; }

    [MaxLength(100)]
    public string? ContentType { get; set; }

    public long? FileSize { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

