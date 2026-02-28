using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models.Chat;

/// <summary>
/// Represents a chat channel (group chat room)
/// </summary>
public class ChatChannel
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Channel type: public, private, or announcement
    /// </summary>
    [MaxLength(20)]
    public string Type { get; set; } = "public";

    /// <summary>
    /// URL-friendly slug for the channel
    /// </summary>
    [MaxLength(100)]
    public string Slug { get; set; } = string.Empty;

    /// <summary>
    /// Channel icon (emoji or icon name)
    /// </summary>
    [MaxLength(50)]
    public string? Icon { get; set; }

    /// <summary>
    /// User who created the channel (null for system-created channels)
    /// </summary>
    public int? CreatedById { get; set; }

    [ForeignKey("CreatedById")]
    public User? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Last message timestamp for sorting
    /// </summary>
    public DateTime? LastMessageAt { get; set; }

    /// <summary>
    /// Is the channel archived
    /// </summary>
    public bool IsArchived { get; set; } = false;

    // Navigation properties
    public ICollection<ChatChannelMember> Members { get; set; } = new List<ChatChannelMember>();
    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
}

/// <summary>
/// Channel membership - tracks who is in each channel
/// </summary>
public class ChatChannelMember
{
    [Key]
    public int Id { get; set; }

    public int ChannelId { get; set; }

    [ForeignKey("ChannelId")]
    public ChatChannel? Channel { get; set; }

    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    /// <summary>
    /// Role in channel: owner, admin, member
    /// </summary>
    [MaxLength(20)]
    public string Role { get; set; } = "member";

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Last time user read messages in this channel
    /// </summary>
    public DateTime? LastReadAt { get; set; }

    /// <summary>
    /// Notification preference: all, mentions, none
    /// </summary>
    [MaxLength(20)]
    public string NotificationPreference { get; set; } = "all";
}



