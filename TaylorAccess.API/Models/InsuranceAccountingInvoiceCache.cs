using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// Cached Taylor Accounting insurance vendor invoices for an org and month applicable.
/// </summary>
public class InsuranceAccountingInvoiceCache
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    /// <summary>Period cache key (YYYY-MM or periodType:periodKey).</summary>
    [Required]
    [MaxLength(30)]
    public string MonthApplicable { get; set; } = string.Empty;

    [Required]
    public string InvoicesJson { get; set; } = "[]";

    public DateTime FetchedAt { get; set; } = DateTime.UtcNow;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
