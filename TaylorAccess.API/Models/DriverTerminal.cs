using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

/// <summary>
/// Driver Terminal -- operational terminal within a Division.
/// Hierarchy: Fleet > Division > DriverTerminal > Driver
/// Separate from admin Terminals which are organizational entities.
/// </summary>
public class DriverTerminal
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// The division this terminal belongs to
    /// </summary>
    [Required]
    public int DivisionId { get; set; }

    [ForeignKey("DivisionId")]
    public Division? Division { get; set; }

    /// <summary>
    /// Multi-tenancy: Organization that owns this terminal
    /// </summary>
    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "active"; // active, inactive

    [MaxLength(200)]
    public string? ManagerName { get; set; }

    [MaxLength(500)]
    public string? Location { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

