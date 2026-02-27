using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Division
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(20)]
    public string DivisionType { get; set; } = "operational";

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
    public string Status { get; set; } = "active";

    [MaxLength(200)]
    public string? ManagerName { get; set; }

    [MaxLength(200)]
    public string? Location { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
