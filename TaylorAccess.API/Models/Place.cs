using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Place
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Required]
    public int AddressId { get; set; }

    [ForeignKey("AddressId")]
    public Address? AddressRef { get; set; }

    [NotMapped]
    public string? Street1 => AddressRef?.Street1;

    [NotMapped]
    public string? City => AddressRef?.City;

    [NotMapped]
    public string? State => AddressRef?.State;

    [NotMapped]
    public string? ZipCode => AddressRef?.ZipCode;

    [NotMapped]
    public string? Country => AddressRef?.Country;

    [NotMapped]
    public decimal? Latitude => AddressRef?.Latitude;

    [NotMapped]
    public decimal? Longitude => AddressRef?.Longitude;

    [NotMapped]
    public string? FullAddress => AddressRef?.FullAddress;

    [MaxLength(20)]
    public string? Phone { get; set; }

    [MaxLength(100)]
    public string? Email { get; set; }

    [MaxLength(50)]
    public string? PlaceType { get; set; }

    public string? OperatingHours { get; set; }

    public string? Notes { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
