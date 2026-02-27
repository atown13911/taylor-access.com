using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Terminal
{
    [Key]
    public int Id { get; set; }
    
    public int OrganizationId { get; set; }
    
    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }
    
    public int? SatelliteId { get; set; }
    
    [ForeignKey("SatelliteId")]
    public Satellite? Satellite { get; set; }
    
    public int? AgencyId { get; set; }
    
    [ForeignKey("AgencyId")]
    public Agency? Agency { get; set; }
    
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? Code { get; set; }
    
    [MaxLength(100)]
    public string Type { get; set; } = "warehouse";
    
    public string? Description { get; set; }
    
    [MaxLength(50)]
    public string Status { get; set; } = "active";
    
    [Required]
    [MaxLength(300)]
    public string Address { get; set; } = string.Empty;
    
    [MaxLength(200)]
    public string? AddressLine2 { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string City { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(50)]
    public string State { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(20)]
    public string ZipCode { get; set; } = string.Empty;
    
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
    public string? Phone { get; set; }
    
    [MaxLength(50)]
    public string? FaxNumber { get; set; }
    
    public int? DockDoors { get; set; }
    
    public int? LoadingBays { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal? StorageCapacitySqFt { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal? YardSpaceSqFt { get; set; }
    
    public int? ParkingSpaces { get; set; }
    
    public bool HasSecureStorage { get; set; }
    
    public bool HasRefrigeration { get; set; }
    
    public bool HasHazmatCertification { get; set; }
    
    [MaxLength(500)]
    public string? Equipment { get; set; }
    
    public int? ManagerUserId { get; set; }
    
    [ForeignKey("ManagerUserId")]
    public User? Manager { get; set; }
    
    [MaxLength(500)]
    public string? OperatingHours { get; set; }
    
    public bool Is24Hour { get; set; }
    
    public bool OperatesWeekends { get; set; }
    
    [MaxLength(50)]
    public string? ReceivingCutoffTime { get; set; }
    
    [MaxLength(50)]
    public string? ShippingCutoffTime { get; set; }
    
    public bool RequiresAppointment { get; set; }
    
    public int? AppointmentLeadTimeHours { get; set; }

    public int? PlaceId { get; set; }

    [ForeignKey("PlaceId")]
    public Place? Place { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public int? CreatedBy { get; set; }
    
    public int? UpdatedBy { get; set; }
    
    public ICollection<User>? AssignedUsers { get; set; }
}
