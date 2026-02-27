using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class EmployeeSnapshot
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(7)]
    public string Month { get; set; } = "";

    public int ActiveCount { get; set; }

    public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
}
