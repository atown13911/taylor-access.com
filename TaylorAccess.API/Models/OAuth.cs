using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Security.Cryptography;

namespace TaylorAccess.API.Models;

public class OAuthClient
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string ClientId { get; set; } = string.Empty;

    [Required]
    public string ClientSecret { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(500)]
    public string? LogoUrl { get; set; }

    [Required]
    public string RedirectUris { get; set; } = "[]";

    [MaxLength(500)]
    public string? HomepageUrl { get; set; }

    [MaxLength(50)]
    public string Status { get; set; } = "active";

    public string Scopes { get; set; } = "[\"openid\",\"profile\",\"email\",\"roles\"]";

    public int? OrganizationId { get; set; }

    public int? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public static string GenerateClientId() => $"ta_{Guid.NewGuid():N}"[..24];

    public static string GenerateClientSecret()
    {
        var bytes = new byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }
}

public class OAuthAuthorizationCode
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(128)]
    public string Code { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ClientId { get; set; } = string.Empty;

    public int UserId { get; set; }

    [Required]
    public string RedirectUri { get; set; } = string.Empty;

    public string Scopes { get; set; } = "openid profile email";

    [MaxLength(128)]
    public string? CodeChallenge { get; set; }

    [MaxLength(10)]
    public string? CodeChallengeMethod { get; set; }

    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddMinutes(5);

    public bool IsUsed { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsValid => !IsUsed && DateTime.UtcNow < ExpiresAt;

    public static string Generate()
    {
        var bytes = new byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }
}

public class OAuthAccessToken
{
    [Key]
    public int Id { get; set; }

    [Required]
    public string Token { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ClientId { get; set; } = string.Empty;

    public int UserId { get; set; }

    public string Scopes { get; set; } = "openid profile email";

    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddHours(1);

    public bool IsRevoked { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsValid => !IsRevoked && DateTime.UtcNow < ExpiresAt;
}

public class OAuthRefreshToken
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(128)]
    public string Token { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ClientId { get; set; } = string.Empty;

    public int UserId { get; set; }

    public string Scopes { get; set; } = "openid profile email";

    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(30);

    public bool IsRevoked { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsValid => !IsRevoked && DateTime.UtcNow < ExpiresAt;

    public static string Generate()
    {
        var bytes = new byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }
}

public class AppRoleAssignment
{
    [Key]
    public int Id { get; set; }

    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    [Required]
    [MaxLength(100)]
    public string AppClientId { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string Role { get; set; } = "user";

    public string? Permissions { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "active";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// DTOs
public record RegisterClientRequest(string Name, string? Description, string[] RedirectUris, string? HomepageUrl);
public record TokenRequest(string GrantType, string? Code, string? RedirectUri, string? ClientId, string? ClientSecret, string? RefreshToken);
public record TokenResponse(string AccessToken, string TokenType, int ExpiresIn, string? RefreshToken, string Scope);
