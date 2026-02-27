using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class ChatMessage
{
    [Key]
    public int Id { get; set; }

    public int SenderId { get; set; }

    [MaxLength(5000)]
    public string Content { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
