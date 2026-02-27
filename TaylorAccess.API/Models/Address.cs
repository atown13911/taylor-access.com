using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Address
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(500)]
    public string Street1 { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Street2 { get; set; }

    [Required]
    [MaxLength(100)]
    public string City { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? County { get; set; }

    [Required]
    [MaxLength(50)]
    public string State { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string ZipCode { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string Country { get; set; } = "USA";

    [Column(TypeName = "decimal(10,7)")]
    public decimal? Latitude { get; set; }

    [Column(TypeName = "decimal(10,7)")]
    public decimal? Longitude { get; set; }

    [NotMapped]
    public string FullAddress
    {
        get
        {
            var parts = new List<string>();
            if (!string.IsNullOrEmpty(Street1)) parts.Add(Street1);
            if (!string.IsNullOrEmpty(Street2)) parts.Add(Street2);
            
            var cityStateZip = new List<string>();
            if (!string.IsNullOrEmpty(City)) cityStateZip.Add(City);
            if (!string.IsNullOrEmpty(State)) cityStateZip.Add(State);
            if (!string.IsNullOrEmpty(ZipCode)) cityStateZip.Add(ZipCode);
            
            if (cityStateZip.Count > 0)
                parts.Add(string.Join(", ", cityStateZip.Take(2)) + (cityStateZip.Count > 2 ? " " + cityStateZip[2] : ""));
            
            if (!string.IsNullOrEmpty(Country) && Country != "USA")
                parts.Add(Country);
                
            return string.Join(", ", parts);
        }
    }

    [NotMapped]
    public string CityState => !string.IsNullOrEmpty(City) && !string.IsNullOrEmpty(State)
        ? $"{City}, {State}"
        : City ?? State ?? "";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
