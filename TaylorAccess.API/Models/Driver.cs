using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Driver
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Multi-tenancy: Organization that owns this driver
    /// </summary>
    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }
    
    /// <summary>
    /// Entity assignment - Driver belongs to Satellite, Agency, Terminal, or Corporate
    /// </summary>
    public int? SatelliteId { get; set; }
    
    [ForeignKey("SatelliteId")]
    public Satellite? Satellite { get; set; }
    
    public int? AgencyId { get; set; }
    
    [ForeignKey("AgencyId")]
    public Agency? Agency { get; set; }
    
    public int? HomeTerminalId { get; set; }
    
    [ForeignKey("HomeTerminalId")]
    public Terminal? HomeTerminal { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Email { get; set; }

    /// <summary>
    /// Personal email address (optional, separate from work email)
    /// </summary>
    [MaxLength(100)]
    public string? PersonalEmail { get; set; }

    [MaxLength(20)]
    public string? Phone { get; set; }

    [MaxLength(50)]
    public string? LicenseNumber { get; set; }

    // Alias for LicenseNumber for backwards compatibility
    [NotMapped]
    public string? DriverLicense => LicenseNumber;

    [MaxLength(20)]
    public string? LicenseClass { get; set; } // CDL-A, CDL-B, etc.

    [MaxLength(20)]
    public string? LicenseState { get; set; } // State that issued the license

    public DateOnly? LicenseExpiry { get; set; }

    public DateOnly? MedicalCardExpiry { get; set; }

    public DateOnly? DateOfBirth { get; set; }

    // ============ STATUS - String field with optional FK (3NF compatible) ============
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "available"; // available, dispatched, en-route, at-location, off-duty, sleeper, vacation, inactive

    public bool IsOnline { get; set; } = false;

    public int? DivisionId { get; set; }

    [ForeignKey("DivisionId")]
    public Division? Division { get; set; }

    public int? DriverTerminalId { get; set; }

    [ForeignKey("DriverTerminalId")]
    public DriverTerminal? DriverTerminal { get; set; }

    // GPS Location (current position - not home address)
    [Column(TypeName = "decimal(10,7)")]
    public decimal? Latitude { get; set; }

    [Column(TypeName = "decimal(10,7)")]
    public decimal? Longitude { get; set; }

    public DateTime? LastLocationUpdate { get; set; }

    [MaxLength(20)]
    public string? DriverType { get; set; } // company, owner_operator, lease

    // Profile Photo
    [MaxLength(500)]
    public string? PhotoUrl { get; set; }

    // Alias for consistency with User model
    [NotMapped]
    public string? AvatarUrl => PhotoUrl;

    // ============ ADDRESS - FK to Address table (3NF) ============
    public int? AddressId { get; set; }

    [ForeignKey("AddressId")]
    public Address? AddressRef { get; set; }

    // ============ TRANSIENT ADDRESS PROPERTIES (Not Mapped - backward compatibility) ============
    // DEPRECATED: Use AddressId FK for normalized storage.
    // Getters delegate to AddressRef, setters are transient only (not persisted).

    private string? _address;
    private string? _city;
    private string? _state;
    private string? _zipCode;
    private string? _country;

    [NotMapped]
    public string? Address
    {
        get => AddressRef?.Street1 ?? _address;
        [Obsolete("Use AddressId FK instead. Setter is transient only.")]
        set => _address = value;
    }

    [NotMapped]
    public string? City
    {
        get => AddressRef?.City ?? _city;
        [Obsolete("Use AddressId FK instead. Setter is transient only.")]
        set => _city = value;
    }

    [NotMapped]
    public string? State
    {
        get => AddressRef?.State ?? _state;
        [Obsolete("Use AddressId FK instead. Setter is transient only.")]
        set => _state = value;
    }

    [NotMapped]
    public string? ZipCode
    {
        get => AddressRef?.ZipCode ?? _zipCode;
        [Obsolete("Use AddressId FK instead. Setter is transient only.")]
        set => _zipCode = value;
    }

    [NotMapped]
    public string? Country
    {
        get => AddressRef?.Country ?? _country ?? "USA";
        [Obsolete("Use AddressId FK instead. Setter is transient only.")]
        set => _country = value;
    }

    // Computed display property
    [NotMapped]
    public string? FullAddress => AddressRef?.FullAddress 
        ?? (!string.IsNullOrEmpty(City) && !string.IsNullOrEmpty(State) 
            ? $"{City}, {State}" 
            : Address ?? "Unknown");

    // Emergency Contact
    [MaxLength(100)]
    public string? EmergencyContactName { get; set; }

    [MaxLength(20)]
    public string? EmergencyContactPhone { get; set; }

    // Employment Info
    public DateOnly? HireDate { get; set; }

    public DateOnly? TerminationDate { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal? PayRate { get; set; }

    [MaxLength(20)]
    public string? PayType { get; set; } // mile, hour, percentage, flat

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Optimistic concurrency token - prevents lost updates in multi-user scenarios.
    /// </summary>
    [Timestamp]
    public byte[]? RowVersion { get; set; }

    /// <summary>
    /// Soft delete flag - drivers are never physically deleted for compliance.
    /// </summary>
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    public string? DeletedBy { get; set; }
}

