using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Order
{
    [Key]
    public int Id { get; set; }

    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
