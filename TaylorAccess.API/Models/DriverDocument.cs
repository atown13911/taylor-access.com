using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

/// <summary>
/// Driver document management -- stores uploaded documents with category, expiry tracking, and compliance status.
/// </summary>
public class DriverDocument
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int DriverId { get; set; }

    [ForeignKey("DriverId")]
    public Driver? Driver { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    /// <summary>
    /// Top-level category (tab): cdl_endorsements, medical, mvr, drug_tests, dqf, employment, training, insurance, vehicle, permits, ifta, safety, violations
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty;

    /// <summary>
    /// Subcategory within the tab (e.g., "cdl_license", "hazmat_endorsement", "tanker_endorsement", "medical_card", "pre_employment_drug_test")
    /// </summary>
    [MaxLength(50)]
    public string? SubCategory { get; set; }

    [Required]
    [MaxLength(200)]
    public string DocumentName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? DocumentNumber { get; set; }

    public DateTime? IssueDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "active"; // active, expiring, expired, pending, revoked

    public string? Notes { get; set; }

    // File storage
    [MaxLength(200)]
    public string? FileName { get; set; }

    public string? FileContent { get; set; }

    [MaxLength(100)]
    public string? ContentType { get; set; }

    public long? FileSize { get; set; }

    // Reminder settings
    public bool RemindExpiry { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

