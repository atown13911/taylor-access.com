using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// Persisted insurance charging table snapshot for an org and billing period.
/// </summary>
public class InsuranceChargingSnapshot
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    [MaxLength(10)]
    public string PeriodType { get; set; } = "monthly";

    [Required]
    [MaxLength(20)]
    public string PeriodKey { get; set; } = string.Empty;

    public int ActiveTruckCount { get; set; }

    public int ActiveDriverHeadcount { get; set; }

    public decimal DriverChargesAnnual { get; set; }

    public decimal CompanyCostAnnual { get; set; }

    public decimal DriverChargesPeriod { get; set; }

    public decimal CompanyCostPeriod { get; set; }

    public decimal TotalPeriod { get; set; }

    /// <summary>JSON array of summary calculation lines.</summary>
    [Required]
    public string SummaryLinesJson { get; set; } = "[]";

    /// <summary>JSON object with matrix columns, rows, and totals.</summary>
    [Required]
    public string MatrixJson { get; set; } = "{}";

    /// <summary>JSON metadata for generated reports (stats, labels, etc.).</summary>
    public string? ReportMetaJson { get; set; }

    public DateTime ComputedAt { get; set; } = DateTime.UtcNow;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
