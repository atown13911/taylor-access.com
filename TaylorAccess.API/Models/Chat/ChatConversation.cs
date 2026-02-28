using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models.Chat;

/// <summary>
/// Represents a direct message conversation between users
/// </summary>
public class ChatConversation
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Conversation type: direct (2 users), group (multiple users)
    /// </summary>
    [MaxLength(20)]
    public string Type { get; set; } = "direct";

    /// <summary>
    /// Optional name for group conversations
    /// </summary>
    [MaxLength(100)]
    public string? Name { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Last message timestamp for sorting
    /// </summary>
    public DateTime? LastMessageAt { get; set; }

    // Navigation properties
    public ICollection<ChatConversationParticipant> Participants { get; set; } = new List<ChatConversationParticipant>();
    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
}

/// <summary>
/// Participants in a direct message conversation
/// </summary>
public class ChatConversationParticipant
{
    [Key]
    public int Id { get; set; }

    public int ConversationId { get; set; }

    [ForeignKey("ConversationId")]
    public ChatConversation? Conversation { get; set; }

    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Last time user read messages in this conversation
    /// </summary>
    public DateTime? LastReadAt { get; set; }

    /// <summary>
    /// Has user left/deleted this conversation
    /// </summary>
    public bool IsArchived { get; set; } = false;
}

/// <summary>
/// User online/presence status
/// </summary>
public class ChatUserStatus
{
    [Key]
    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    /// <summary>
    /// Status: online, away, busy, offline
    /// </summary>
    [MaxLength(20)]
    public string Status { get; set; } = "offline";

    /// <summary>
    /// Custom status message
    /// </summary>
    [MaxLength(200)]
    public string? StatusMessage { get; set; }

    /// <summary>
    /// Last activity timestamp
    /// </summary>
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// SignalR connection IDs for this user (can have multiple)
    /// </summary>
    public string? ConnectionIds { get; set; }
}



