using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class UserOrganization
{
    [Key]
    public int Id { get; set; }
    public int UserId { get; set; }
    public int OrganizationId { get; set; }
    public bool IsPrimary { get; set; } = false;
    public string? Role { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(UserId))]
    public User? User { get; set; }

    [ForeignKey(nameof(OrganizationId))]
    public Organization? Organization { get; set; }
}
