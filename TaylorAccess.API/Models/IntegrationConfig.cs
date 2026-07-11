using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// Server-side encrypted storage for integration credentials (mirrors Taylor CRM).
/// </summary>
public class IntegrationConfig
{
    [Key] public int Id { get; set; }
    [Required] public int OrganizationId { get; set; }

    [Required][MaxLength(50)] public string IntegrationType { get; set; } = string.Empty;

    [MaxLength(100)] public string? Provider { get; set; }
    [MaxLength(200)] public string? DisplayName { get; set; }

    public string? EncryptedApiKey { get; set; }
    public string? EncryptedApiSecret { get; set; }
    public string? EncryptedAccessToken { get; set; }
    public string? EncryptedRefreshToken { get; set; }
    public string? EncryptedWebhookSecret { get; set; }

    public bool Enabled { get; set; } = true;
    [MaxLength(20)] public string Status { get; set; } = "connected";

    public DateTime? TokenExpiresAt { get; set; }
    [MaxLength(200)] public string? OAuthScope { get; set; }

    public DateTime? ConnectedAt { get; set; }
    public DateTime? LastSyncAt { get; set; }
    public DateTime? LastErrorAt { get; set; }
    [MaxLength(500)] public string? LastError { get; set; }

    public int? ConnectedByUserId { get; set; }
    [MaxLength(200)] public string? ConnectedByUserName { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
