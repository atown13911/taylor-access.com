using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// User invitation for onboarding new users
/// </summary>
public class UserInvitation
{
    public int Id { get; set; }
    
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;
    
    public string? Name { get; set; }
    
    /// <summary>
    /// Role to assign upon acceptance
    /// </summary>
    public int? RoleId { get; set; }
    
    /// <summary>
    /// Organization the user will join
    /// </summary>
    public int? OrganizationId { get; set; }
    
    /// <summary>
    /// Unique invitation token
    /// </summary>
    [Required]
    public string Token { get; set; } = string.Empty;
    
    /// <summary>
    /// Current status: pending, accepted, expired, revoked
    /// </summary>
    public string Status { get; set; } = "pending";
    
    /// <summary>
    /// Expiration date
    /// </summary>
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(7);
    
    /// <summary>
    /// Who sent the invitation
    /// </summary>
    public int? InvitedBy { get; set; }
    
    /// <summary>
    /// Custom message in the invitation email
    /// </summary>
    public string? PersonalMessage { get; set; }
    
    /// <summary>
    /// When the invitation was accepted
    /// </summary>
    public DateTime? AcceptedAt { get; set; }
    
    /// <summary>
    /// The user created from this invitation
    /// </summary>
    public int? AcceptedUserId { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public bool IsValid => Status == "pending" && DateTime.UtcNow < ExpiresAt;
    
    // Navigation
    public virtual Role? Role { get; set; }
    public virtual Organization? Organization { get; set; }
}

// Request/Response DTOs
public record CreateInvitationRequest(
    string Email, 
    string? Name, 
    int? RoleId, 
    string? PersonalMessage
);

public record AcceptInvitationRequest(
    string Token,
    string Name,
    string Password,
    string ConfirmPassword,
    string? Phone
);

public record ResendInvitationRequest(Guid InvitationId);
public record RevokeInvitationRequest(Guid InvitationId);
