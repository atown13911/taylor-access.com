using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class EmployeeBenefit
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    public int OrganizationId { get; set; }
    
    [Required]
    public int EmployeeId { get; set; }
    
    [ForeignKey("EmployeeId")]
    public User? Employee { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string BenefitType { get; set; } = "health_insurance";
    
    [Required]
    [MaxLength(100)]
    public string PlanName { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? Provider { get; set; }
    
    [MaxLength(100)]
    public string? PolicyNumber { get; set; }
    
    [MaxLength(50)]
    public string? CoverageLevel { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal EmployeeContribution { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal EmployerContribution { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal TotalCost => EmployeeContribution + EmployerContribution;
    
    [Required]
    [MaxLength(20)]
    public string ContributionFrequency { get; set; } = "monthly";
    
    public DateOnly EffectiveDate { get; set; }
    public DateOnly? EndDate { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "active";
    
    public string? Dependents { get; set; }
    
    [MaxLength(500)]
    public string? Notes { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
