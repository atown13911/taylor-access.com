using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class ZoomUserRecord
{
    [Key]
    public int Id { get; set; }

    [MaxLength(255)]
    public string? Email { get; set; }

    [MaxLength(100)]
    public string? ZoomUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
