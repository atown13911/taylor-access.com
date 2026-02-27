using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Position
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string Title { get; set; } = string.Empty;
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    [Required]
    public int DepartmentId { get; set; }
    
    [ForeignKey("DepartmentId")]
    public Department? Department { get; set; }

    [MaxLength(50)]
    public string? Level { get; set; }

    public int? HeadCount { get; set; }

    public decimal? MinSalary { get; set; }
    public decimal? MaxSalary { get; set; }
    
    [MaxLength(20)]
    public string Status { get; set; } = "active";

    [MaxLength(20)]
    public string? Code { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public virtual ICollection<User> Employees { get; set; } = new List<User>();
}
