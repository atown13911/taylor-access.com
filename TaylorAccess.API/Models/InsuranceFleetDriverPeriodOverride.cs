using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// Manual include/exclude override for a driver in insurance fleet billing for a specific period.
/// </summary>
public class InsuranceFleetDriverPeriodOverride
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

    [Required]
    public int DriverId { get; set; }

    [Required]
    [MaxLength(10)]
    public string InclusionState { get; set; } = "included";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
