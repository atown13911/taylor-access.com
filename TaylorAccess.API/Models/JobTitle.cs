using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

/// <summary>
/// Job titles/positions in the organization
/// </summary>
public class JobTitle
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }
    
    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Code { get; set; }

    public string? Description { get; set; }

    public int? DepartmentId { get; set; }
    [ForeignKey("DepartmentId")]
    public Department? Department { get; set; }

    [MaxLength(50)]
    public string? Level { get; set; } // entry, junior, mid, senior, lead, manager, director, executive

    [MaxLength(50)]
    public string? Category { get; set; } // operations, admin, sales, technical, management

    // Compensation ranges
    public decimal? SalaryMin { get; set; }
    public decimal? SalaryMax { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

}

