using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class MotivActivityLog
{
    [Key]
    public int Id { get; set; }

    public int? OrganizationId { get; set; }

    [MaxLength(20)]
    public string Kind { get; set; } = "info";

    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? DriverName { get; set; }

    [MaxLength(2000)]
    public string Details { get; set; } = string.Empty;

    public DateTime EventAt { get; set; } = DateTime.UtcNow;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

