using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class TimeOffRequest
{
    [Key]
    public int Id { get; set; }

    public int EmployeeId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
