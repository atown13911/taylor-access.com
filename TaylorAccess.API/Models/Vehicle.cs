using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class Vehicle
{
    public int Id { get; set; }

    [Required]
    public string Name { get; set; } = string.Empty;

    public string? Make { get; set; }
    public string? Model { get; set; }
    public int? Year { get; set; }
    public string? Vin { get; set; }
    public string? PlateNumber { get; set; }
    public string? PlateState { get; set; }
    public string Status { get; set; } = "active";
    public int? OrganizationId { get; set; }
    public int? FleetId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
