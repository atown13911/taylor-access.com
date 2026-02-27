using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Satellite
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
    public string? DbaName { get; set; }
    
    public string? Description { get; set; }
    
    [MaxLength(50)]
    public string Status { get; set; } = "active";
    
    [MaxLength(200)]
    public string? LegalBusinessName { get; set; }
    
    [MaxLength(50)]
    public string? BusinessStructure { get; set; }
    
    [MaxLength(50)]
    public string? EinTaxId { get; set; }
    
    [MaxLength(50)]
    public string? StateTaxId { get; set; }
    
    [MaxLength(50)]
    public string? BusinessLicenseNumber { get; set; }
    
    [MaxLength(100)]
    public string? StateOfIncorporation { get; set; }
    
    public DateOnly? IncorporationDate { get; set; }
    
    [MaxLength(13)]
    public string? Jib { get; set; }
    
    [MaxLength(20)]
    public string? PdvNumber { get; set; }
    
    [MaxLength(100)]
    public string? CourtRegistration { get; set; }
    
    [MaxLength(50)]
    public string? ActivityCode { get; set; }
    
    [MaxLength(50)]
    public string? RegistrationNumber { get; set; }
    
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
    
    [MaxLength(200)]
    public string? Website { get; set; }
    
    public int? ManagerUserId { get; set; }
    
    [ForeignKey("ManagerUserId")]
    public User? Manager { get; set; }
    
    [MaxLength(500)]
    public string? OperatingHours { get; set; }
    
    public int? EmployeeCount { get; set; }
    
    [MaxLength(500)]
    public string? ServiceArea { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal? CommissionRate { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal? RevenueSharePercent { get; set; }
    
    [MaxLength(100)]
    public string? BankName { get; set; }
    
    [MaxLength(50)]
    public string? AccountNumber { get; set; }
    
    [MaxLength(50)]
    public string? RoutingNumber { get; set; }
    
    [MaxLength(34)]
    public string? Iban { get; set; }
    
    [MaxLength(11)]
    public string? SwiftBic { get; set; }
    
    [MaxLength(50)]
    public string? PaymentTerms { get; set; }
    
    [MaxLength(50)]
    public string? DotNumber { get; set; }
    
    [MaxLength(50)]
    public string? McNumber { get; set; }
    
    [MaxLength(100)]
    public string? InsuranceCarrier { get; set; }
    
    [MaxLength(50)]
    public string? InsurancePolicyNumber { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal? CargoInsuranceLimit { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal? LiabilityInsuranceLimit { get; set; }
    
    public DateOnly? InsuranceExpirationDate { get; set; }
    
    public string? LogoBase64 { get; set; }
    
    [MaxLength(20)]
    public string? PrimaryColor { get; set; }
    
    [MaxLength(20)]
    public string? SecondaryColor { get; set; }
    
    public DateOnly? ContractStartDate { get; set; }
    
    public DateOnly? ContractEndDate { get; set; }
    
    [MaxLength(50)]
    public string? ContractType { get; set; }
    
    public string? ContractTerms { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public int? CreatedBy { get; set; }
    
    public int? UpdatedBy { get; set; }
    
    public ICollection<User>? Users { get; set; }
    public ICollection<Terminal>? Terminals { get; set; }
}
