using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Fleet
{
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [Required]
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    [Required]
    public string Status { get; set; } = "active";

    public string? Task { get; set; }

    public int? ParentFleetId { get; set; }
    public Fleet? ParentFleet { get; set; }

    public ICollection<FleetDriver> FleetDrivers { get; set; } = new List<FleetDriver>();
    public ICollection<FleetVehicle> FleetVehicles { get; set; } = new List<FleetVehicle>();
    public ICollection<Fleet> SubFleets { get; set; } = new List<Fleet>();
    public ICollection<Division> Divisions { get; set; } = new List<Division>();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class FleetDriver
{
    public int FleetId { get; set; }
    public Fleet? Fleet { get; set; }

    public int DriverId { get; set; }
    public Driver? Driver { get; set; }

    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
}

public class FleetVehicle
{
    public int FleetId { get; set; }
    public Fleet? Fleet { get; set; }

    public int VehicleId { get; set; }
    public Vehicle? Vehicle { get; set; }

    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
}
