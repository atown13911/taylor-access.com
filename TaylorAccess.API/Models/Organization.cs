using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Organization
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(500)]
    public string? Logo { get; set; }

    [MaxLength(100)]
    public string? Email { get; set; }

    [MaxLength(20)]
    public string? Phone { get; set; }

    [MaxLength(500)]
    public string? Website { get; set; }

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
    private decimal? _latitude;
    private decimal? _longitude;

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

    // Country moved to direct field below (line ~113) for business logic

    [NotMapped]
    public decimal? Latitude
    {
        get => AddressRef?.Latitude ?? _latitude;
        [Obsolete("Use AddressId FK instead. Setter is transient only.")]
        set => _latitude = value;
    }

    [NotMapped]
    public decimal? Longitude
    {
        get => AddressRef?.Longitude ?? _longitude;
        [Obsolete("Use AddressId FK instead. Setter is transient only.")]
        set => _longitude = value;
    }

    // Computed display property
    [NotMapped]
    public string? FullAddress => AddressRef?.FullAddress 
        ?? (!string.IsNullOrEmpty(City) && !string.IsNullOrEmpty(State) 
            ? $"{City}, {State}" 
            : Address ?? "Unknown");

    // ============ LOCATION & LOCALE ============
    [MaxLength(100)]
    public string Country { get; set; } = "USA"; // Primary country of operation
    
    [MaxLength(50)]
    public string? Timezone { get; set; } // Organization's primary timezone
    
    // Business Info
    [MaxLength(20)]
    public string? McNumber { get; set; }

    [MaxLength(20)]
    public string? DotNumber { get; set; }

    [MaxLength(50)]
    public string? ScacCode { get; set; }

    [MaxLength(20)]
    public string? TaxId { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "active"; // active, inactive, suspended

    [MaxLength(20)]
    public string? Plan { get; set; } = "free"; // free, starter, professional, enterprise

    // Settings stored as JSON
    public string? Settings { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<User> Users { get; set; } = new List<User>();
}
