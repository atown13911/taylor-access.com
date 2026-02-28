using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models.Chat;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// REST API for Comm Link chat functionality
/// </summary>
[ApiController]
[Route("api/v1/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<ChatController> _logger;

    public ChatController(TaylorAccessDbContext context, ILogger<ChatController> logger)
    {
        _context = context;
        _logger = logger;
    }

    #region Channels

    /// <summary>
    /// Get all channels the current user is a member of (or all public channels)
    /// </summary>
    [HttpGet("channels")]
    [AllowAnonymous]
    public async Task<IActionResult> GetChannels()
    {
        var userId = GetUserId();

        // For anonymous users, just return public channels
        if (userId == null)
        {
            var publicChannels = await _context.ChatChannels
                .Where(c => !c.IsArchived && c.Type == "public")
                .Select(c => new
                {
                    c.Id,
                    c.Name,
                    c.Slug,
                    c.Description,
                    c.Type,
                    c.Icon,
                    c.LastMessageAt,
                    c.CreatedAt,
                    MemberCount = c.Members.Count,
                    IsMember = false,
                    UnreadCount = 0
                })
                .OrderByDescending(c => c.LastMessageAt ?? c.CreatedAt)
                .ToListAsync();

            return Ok(publicChannels);
        }

        var channels = await _context.ChatChannels
            .Where(c => !c.IsArchived && (c.Type == "public" || c.Members.Any(m => m.UserId == userId.Value)))
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.Slug,
                c.Description,
                c.Type,
                c.Icon,
                c.LastMessageAt,
                c.CreatedAt,
                MemberCount = c.Members.Count,
                IsMember = c.Members.Any(m => m.UserId == userId.Value),
                UnreadCount = c.Members
                    .Where(m => m.UserId == userId.Value)
                    .Select(m => c.Messages.Count(msg => msg.CreatedAt > (m.LastReadAt ?? DateTime.MinValue)))
                    .FirstOrDefault()
            })
            .OrderByDescending(c => c.LastMessageAt ?? c.CreatedAt)
            .ToListAsync();

        return Ok(channels);
    }

    /// <summary>
    /// Get a specific channel with messages
    /// </summary>
    [HttpGet("channels/{channelId}")]
    public async Task<IActionResult> GetChannel(int channelId, [FromQuery] int limit = 50, [FromQuery] DateTime? before = null)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var channel = await _context.ChatChannels
            .Include(c => c.Members)
            .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(c => c.Id == channelId);

        if (channel == null) return NotFound();

        // Check access
        if (channel.Type != "public" && !channel.Members.Any(m => m.UserId == userId.Value))
        {
            return Forbid();
        }

        var messagesQuery = _context.ChatMessages
            .Where(m => m.ChannelId == channelId && !m.IsDeleted);

        if (before.HasValue)
        {
            messagesQuery = messagesQuery.Where(m => m.CreatedAt < before.Value);
        }

        var messages = await messagesQuery
            .OrderByDescending(m => m.CreatedAt)
            .Take(limit)
            .Select(m => new
            {
                m.Id,
                m.Content,
                m.Type,
                m.CreatedAt,
                m.EditedAt,
                m.IsPinned,
                m.ParentMessageId,
                m.ReplyCount,
                Sender = new { m.Sender!.Id, m.Sender.Name, m.Sender.Email },
                Reactions = m.Reactions.GroupBy(r => r.Emoji).Select(g => new
                {
                    Emoji = g.Key,
                    Count = g.Count(),
                    UserIds = g.Select(r => r.UserId).ToList()
                }).ToList()
            })
            .ToListAsync();

        // Mark as read
        var membership = await _context.ChatChannelMembers
            .FirstOrDefaultAsync(m => m.ChannelId == channelId && m.UserId == userId.Value);
        if (membership != null)
        {
            membership.LastReadAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }

        return Ok(new
        {
            channel.Id,
            channel.Name,
            channel.Slug,
            channel.Description,
            channel.Type,
            channel.Icon,
            Members = channel.Members.Select(m => new
            {
                m.UserId,
                m.Role,
                m.JoinedAt,
                User = new { m.User!.Id, m.User.Name, m.User.Email }
            }),
            Messages = messages.OrderBy(m => m.CreatedAt)
        });
    }

    /// <summary>
    /// Create a new channel
    /// </summary>
    [HttpPost("channels")]
    public async Task<IActionResult> CreateChannel([FromBody] CreateChannelRequest request)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var slug = GenerateSlug(request.Name);

        // Check if slug exists
        var existingSlug = await _context.ChatChannels.AnyAsync(c => c.Slug == slug);
        if (existingSlug)
        {
            slug = $"{slug}-{0.ToString()[..6]}";
        }

        var channel = new ChatChannel
        {
            Name = request.Name,
            Slug = slug,
            Description = request.Description,
            Type = request.Type ?? "public",
            Icon = request.Icon,
            CreatedById = userId.Value
        };

        _context.ChatChannels.Add(channel);
        await _context.SaveChangesAsync();

        // Add creator as owner
        _context.ChatChannelMembers.Add(new ChatChannelMember
        {
            ChannelId = channel.Id,
            UserId = userId.Value,
            Role = "owner"
        });
        await _context.SaveChangesAsync();

        return Ok(new { channel.Id, channel.Name, channel.Slug });
    }

    /// <summary>
    /// Join a public channel
    /// </summary>
    [HttpPost("channels/{channelId}/join")]
    public async Task<IActionResult> JoinChannel(int channelId)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var channel = await _context.ChatChannels.FindAsync(channelId);
        if (channel == null) return NotFound();
        if (channel.Type != "public") return BadRequest("Cannot join private channel without invitation");

        var existingMember = await _context.ChatChannelMembers
            .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value);
        if (existingMember) return Ok(new { message = "Already a member" });

        _context.ChatChannelMembers.Add(new ChatChannelMember
        {
            ChannelId = channelId,
            UserId = userId.Value,
            Role = "member"
        });
        await _context.SaveChangesAsync();

        return Ok(new { message = "Joined channel" });
    }

    /// <summary>
    /// Leave a channel
    /// </summary>
    [HttpPost("channels/{channelId}/leave")]
    public async Task<IActionResult> LeaveChannel(int channelId)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var membership = await _context.ChatChannelMembers
            .FirstOrDefaultAsync(m => m.ChannelId == channelId && m.UserId == userId.Value);

        if (membership == null) return NotFound();
        if (membership.Role == "owner") return BadRequest("Owner cannot leave channel. Transfer ownership first.");

        _context.ChatChannelMembers.Remove(membership);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Left channel" });
    }

    #endregion

    #region Direct Messages

    /// <summary>
    /// Get all conversations for the current user
    /// </summary>
    [HttpGet("conversations")]
    public async Task<IActionResult> GetConversations()
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var conversations = await _context.ChatConversations
            .Where(c => c.Participants.Any(p => p.UserId == userId.Value && !p.IsArchived))
            .Select(c => new
            {
                c.Id,
                c.Type,
                c.Name,
                c.LastMessageAt,
                Participants = c.Participants.Select(p => new
                {
                    p.UserId,
                    User = new { p.User!.Id, p.User.Name, p.User.Email }
                }),
                LastMessage = c.Messages
                    .Where(m => !m.IsDeleted)
                    .OrderByDescending(m => m.CreatedAt)
                    .Select(m => new { m.Content, m.CreatedAt, SenderName = m.Sender!.Name })
                    .FirstOrDefault(),
                UnreadCount = c.Participants
                    .Where(p => p.UserId == userId.Value)
                    .Select(p => c.Messages.Count(m => m.CreatedAt > (p.LastReadAt ?? DateTime.MinValue) && m.SenderId != userId.Value))
                    .FirstOrDefault()
            })
            .OrderByDescending(c => c.LastMessageAt ?? DateTime.MinValue)
            .ToListAsync();

        return Ok(conversations);
    }

    /// <summary>
    /// Get messages from a conversation
    /// </summary>
    [HttpGet("conversations/{conversationId}")]
    public async Task<IActionResult> GetConversation(int conversationId, [FromQuery] int limit = 50, [FromQuery] DateTime? before = null)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var isParticipant = await _context.ChatConversationParticipants
            .AnyAsync(p => p.ConversationId == conversationId && p.UserId == userId.Value && !p.IsArchived);

        if (!isParticipant) return Forbid();

        var conversation = await _context.ChatConversations
            .Include(c => c.Participants)
            .ThenInclude(p => p.User)
            .FirstOrDefaultAsync(c => c.Id == conversationId);

        if (conversation == null) return NotFound();

        var messagesQuery = _context.ChatMessages
            .Where(m => m.ConversationId == conversationId && !m.IsDeleted);

        if (before.HasValue)
        {
            messagesQuery = messagesQuery.Where(m => m.CreatedAt < before.Value);
        }

        var messages = await messagesQuery
            .OrderByDescending(m => m.CreatedAt)
            .Take(limit)
            .Select(m => new
            {
                m.Id,
                m.Content,
                m.Type,
                m.CreatedAt,
                m.EditedAt,
                Sender = new { m.Sender!.Id, m.Sender.Name, m.Sender.Email },
                Reactions = m.Reactions.GroupBy(r => r.Emoji).Select(g => new
                {
                    Emoji = g.Key,
                    Count = g.Count(),
                    UserIds = g.Select(r => r.UserId).ToList()
                }).ToList()
            })
            .ToListAsync();

        // Mark as read
        var participant = await _context.ChatConversationParticipants
            .FirstOrDefaultAsync(p => p.ConversationId == conversationId && p.UserId == userId.Value);
        if (participant != null)
        {
            participant.LastReadAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }

        return Ok(new
        {
            conversation.Id,
            conversation.Type,
            conversation.Name,
            Participants = conversation.Participants.Select(p => new
            {
                p.UserId,
                User = new { p.User!.Id, p.User.Name, p.User.Email }
            }),
            Messages = messages.OrderBy(m => m.CreatedAt)
        });
    }

    /// <summary>
    /// Start or get existing DM with a user
    /// </summary>
    [HttpPost("conversations/dm/{recipientId}")]
    public async Task<IActionResult> StartDirectMessage(int recipientId)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        if (recipientId == userId.Value) return BadRequest("Cannot DM yourself");

        // Check if conversation already exists
        var existing = await _context.ChatConversations
            .Where(c => c.Type == "direct")
            .Where(c => c.Participants.Any(p => p.UserId == userId.Value) &&
                        c.Participants.Any(p => p.UserId == recipientId))
            .FirstOrDefaultAsync();

        if (existing != null)
        {
            return Ok(new { existing.Id });
        }

        // Create new conversation
        var conversation = new ChatConversation { Type = "direct" };
        _context.ChatConversations.Add(conversation);
        await _context.SaveChangesAsync();

        _context.ChatConversationParticipants.AddRange(new[]
        {
            new ChatConversationParticipant { ConversationId = conversation.Id, UserId = userId.Value },
            new ChatConversationParticipant { ConversationId = conversation.Id, UserId = recipientId }
        });
        await _context.SaveChangesAsync();

        return Ok(new { conversation.Id });
    }

    #endregion

    #region Messages

    /// <summary>
    /// Edit a message
    /// </summary>
    [HttpPut("messages/{messageId}")]
    public async Task<IActionResult> EditMessage(int messageId, [FromBody] EditMessageRequest request)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var message = await _context.ChatMessages.FindAsync(messageId);
        if (message == null) return NotFound();
        if (message.SenderId != userId.Value) return Forbid();

        message.Content = request.Content;
        message.EditedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { message.Id, message.Content, message.EditedAt });
    }

    /// <summary>
    /// Delete a message
    /// </summary>
    [HttpDelete("messages/{messageId}")]
    public async Task<IActionResult> DeleteMessage(int messageId)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var message = await _context.ChatMessages.FindAsync(messageId);
        if (message == null) return NotFound();
        
        // Allow message owner or admins to delete
        var currentUser = await _context.Users.FindAsync(userId.Value);
        var isAdmin = currentUser?.IsAdmin() ?? false;
        if (message.SenderId != userId.Value && !isAdmin) return Forbid();

        message.IsDeleted = true;
        message.Content = "[deleted]";
        await _context.SaveChangesAsync();

        return Ok(new { message = "Message deleted" });
    }

    /// <summary>
    /// Pin a message
    /// </summary>
    [HttpPost("messages/{messageId}/pin")]
    public async Task<IActionResult> PinMessage(int messageId)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var message = await _context.ChatMessages.FindAsync(messageId);
        if (message == null) return NotFound();

        message.IsPinned = !message.IsPinned;
        await _context.SaveChangesAsync();

        return Ok(new { message.Id, message.IsPinned });
    }

    /// <summary>
    /// Get pinned messages for a channel
    /// </summary>
    [HttpGet("channels/{channelId}/pinned")]
    public async Task<IActionResult> GetPinnedMessages(int channelId)
    {
        var messages = await _context.ChatMessages
            .Where(m => m.ChannelId == channelId && m.IsPinned && !m.IsDeleted)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id,
                m.Content,
                m.CreatedAt,
                Sender = new { m.Sender!.Id, m.Sender.Name }
            })
            .ToListAsync();

        return Ok(messages);
    }

    #endregion

    #region Users

    /// <summary>
    /// Get online users
    /// </summary>
    [HttpGet("users/online")]
    public async Task<IActionResult> GetOnlineUsers()
    {
        var users = await _context.ChatUserStatuses
            .Where(s => s.Status != "offline")
            .Select(s => new
            {
                Id = s.UserId,
                s.User!.Name,
                s.User.Email,
                s.Status,
                s.StatusMessage,
                s.LastSeenAt
            })
            .ToListAsync();

        return Ok(users);
    }

    /// <summary>
    /// Get all users for starting DMs
    /// </summary>
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] string? search)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var query = _context.Users
            .Where(u => u.Status == "active" && u.Id != userId.Value);

        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(u => u.Name.Contains(search) || u.Email.Contains(search));
        }

        var users = await query
            .Take(20)
            .Select(u => new
            {
                u.Id,
                u.Name,
                u.Email,
                Status = _context.ChatUserStatuses
                    .Where(s => s.UserId == u.Id)
                    .Select(s => s.Status)
                    .FirstOrDefault() ?? "offline"
            })
            .ToListAsync();

        return Ok(users);
    }

    #endregion

    #region Helpers

    private int? GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (int.TryParse(userIdClaim, out var userId))
        {
            return userId;
        }
        return null;
    }

    private static string GenerateSlug(string name)
    {
        return name.ToLower()
            .Replace(" ", "-")
            .Replace("_", "-")
            .Where(c => char.IsLetterOrDigit(c) || c == '-')
            .Aggregate("", (s, c) => s + c);
    }

    #endregion
}

#region DTOs

public class CreateChannelRequest
{
    public required string Name { get; set; }
    public string? Description { get; set; }
    public string? Type { get; set; }
    public string? Icon { get; set; }
}

public class EditMessageRequest
{
    public required string Content { get; set; }
}

#endregion




