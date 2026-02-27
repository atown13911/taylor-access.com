using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Department
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    [Required]
    public int OrganizationId { get; set; }
    
    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    public int? DivisionId { get; set; }

    [ForeignKey("DivisionId")]
    public Division? Division { get; set; }

    public int? ManagerUserId { get; set; }
    
    [ForeignKey("ManagerUserId")]
    public User? Manager { get; set; }
    
    [MaxLength(20)]
    public string Status { get; set; } = "active";

    [MaxLength(20)]
    public string? Code { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public virtual ICollection<User> Employees { get; set; } = new List<User>();
}
