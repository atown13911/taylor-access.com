using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models.Chat;

/// <summary>
/// Represents a chat message in a channel or direct message
/// </summary>
public class ChatMessage
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// The message content (supports markdown)
    /// </summary>
    [Required]
    public string Content { get; set; } = string.Empty;

    /// <summary>
    /// Message type: text, file, system, announcement
    /// </summary>
    [MaxLength(20)]
    public string Type { get; set; } = "text";

    /// <summary>
    /// User who sent the message
    /// </summary>
    public int SenderId { get; set; }

    [ForeignKey("SenderId")]
    public User? Sender { get; set; }

    /// <summary>
    /// Channel this message belongs to (null for DMs)
    /// </summary>
    public int? ChannelId { get; set; }

    [ForeignKey("ChannelId")]
    public ChatChannel? Channel { get; set; }

    /// <summary>
    /// Direct message conversation (null for channel messages)
    /// </summary>
    public int? ConversationId { get; set; }

    [ForeignKey("ConversationId")]
    public ChatConversation? Conversation { get; set; }

    /// <summary>
    /// Parent message ID for threading/replies
    /// </summary>
    public int? ParentMessageId { get; set; }

    [ForeignKey("ParentMessageId")]
    public ChatMessage? ParentMessage { get; set; }

    /// <summary>
    /// Thread reply count
    /// </summary>
    public int ReplyCount { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public bool IsDeleted { get; set; } = false;

    /// <summary>
    /// Pinned messages appear at top
    /// </summary>
    public bool IsPinned { get; set; } = false;

    // Navigation properties
    public ICollection<ChatMessage> Replies { get; set; } = new List<ChatMessage>();
    public ICollection<ChatMessageReaction> Reactions { get; set; } = new List<ChatMessageReaction>();
    public ICollection<ChatMessageAttachment> Attachments { get; set; } = new List<ChatMessageAttachment>();
    public ICollection<ChatMessageMention> Mentions { get; set; } = new List<ChatMessageMention>();
}

/// <summary>
/// Emoji reactions on messages
/// </summary>
public class ChatMessageReaction
{
    [Key]
    public int Id { get; set; }

    public int MessageId { get; set; }

    [ForeignKey("MessageId")]
    public ChatMessage? Message { get; set; }

    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    /// <summary>
    /// Emoji code (e.g., "👍", ":thumbsup:")
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Emoji { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// File attachments on messages
/// </summary>
public class ChatMessageAttachment
{
    [Key]
    public int Id { get; set; }

    public int MessageId { get; set; }

    [ForeignKey("MessageId")]
    public ChatMessage? Message { get; set; }

    [Required]
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string ContentType { get; set; } = string.Empty;

    public long FileSize { get; set; }

    [Required]
    [MaxLength(500)]
    public string FilePath { get; set; } = string.Empty;

    /// <summary>
    /// Thumbnail path for images/videos
    /// </summary>
    [MaxLength(500)]
    public string? ThumbnailPath { get; set; }

    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// User mentions in messages (@user)
/// </summary>
public class ChatMessageMention
{
    [Key]
    public int Id { get; set; }

    public int MessageId { get; set; }

    [ForeignKey("MessageId")]
    public ChatMessage? Message { get; set; }

    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    /// <summary>
    /// Has the user seen this mention
    /// </summary>
    public bool IsRead { get; set; } = false;
}



