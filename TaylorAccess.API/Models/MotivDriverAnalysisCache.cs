using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class MotivDriverAnalysisCache
{
    [Key]
    public int Id { get; set; }

    public int? OrganizationId { get; set; }

    [Column(TypeName = "date")]
    public DateTime StartDate { get; set; }

    [Column(TypeName = "date")]
    public DateTime EndDate { get; set; }

    public bool Connected { get; set; }

    public int DriverCount { get; set; }

    [Required]
    public string PayloadJson { get; set; } = "[]";

    public DateTime RefreshedAt { get; set; } = DateTime.UtcNow;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
