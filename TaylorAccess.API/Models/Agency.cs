using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Agency
{
    [Key]
    public int Id { get; set; }
    
    public int OrganizationId { get; set; }
    
    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }
    
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? Code { get; set; }
    
    [MaxLength(200)]
    public string? Division { get; set; }
    
    public string? Description { get; set; }
    
    [MaxLength(50)]
    public string Status { get; set; } = "active";
    
    [MaxLength(300)]
    public string? Address { get; set; }
    
    [MaxLength(200)]
    public string? AddressLine2 { get; set; }
    
    [MaxLength(100)]
    public string? City { get; set; }
    
    [MaxLength(50)]
    public string? State { get; set; }
    
    [MaxLength(20)]
    public string? ZipCode { get; set; }
    
    [MaxLength(100)]
    public string? Country { get; set; } = "USA";
    
    [Column(TypeName = "decimal(10,7)")]
    public decimal? Latitude { get; set; }
    
    [Column(TypeName = "decimal(10,7)")]
    public decimal? Longitude { get; set; }
    
    [MaxLength(50)]
    public string? Timezone { get; set; }
    
    [MaxLength(100)]
    public string? ContactName { get; set; }
    
    [MaxLength(100)]
    public string? ContactEmail { get; set; }
    
    [MaxLength(50)]
    public string? ContactPhone { get; set; }
    
    [MaxLength(50)]
    public string? FaxNumber { get; set; }
    
    public int? ManagerUserId { get; set; }
    
    [ForeignKey("ManagerUserId")]
    public User? Manager { get; set; }
    
    public int? RegionalManagerUserId { get; set; }
    
    [ForeignKey("RegionalManagerUserId")]
    public User? RegionalManager { get; set; }
    
    public int? EmployeeCount { get; set; }
    
    [MaxLength(500)]
    public string? OperatingHours { get; set; }
    
    [MaxLength(500)]
    public string? ServiceArea { get; set; }
    
    [MaxLength(500)]
    public string? ServiceTypes { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal? MonthlyBudget { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal? QuarterlyBudget { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal? AnnualBudget { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal? TargetMarginPercent { get; set; }
    
    [MaxLength(50)]
    public string? CostCenter { get; set; }
    
    [MaxLength(50)]
    public string? ProfitCenter { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal? OnTimePerformance { get; set; }
    
    public int? ActiveShipmentsCount { get; set; }
    
    public int? MonthlyShipmentGoal { get; set; }
    
    public string? LogoBase64 { get; set; }
    
    [MaxLength(20)]
    public string? PrimaryColor { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public int? CreatedBy { get; set; }
    
    public int? UpdatedBy { get; set; }
    
    public ICollection<User>? Users { get; set; }
    public ICollection<Terminal>? Terminals { get; set; }
}
