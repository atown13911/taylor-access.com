using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class PasswordResetToken
{
    public int Id { get; set; }
    
    [Required]
    public int UserId { get; set; }
    
    [Required]
    public string Token { get; set; } = string.Empty;
    
    [Required]
    public string Email { get; set; } = string.Empty;
    
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddHours(1);
    
    public bool IsUsed { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public bool IsValid => !IsUsed && DateTime.UtcNow < ExpiresAt;
}

public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Token, string NewPassword, string ConfirmPassword);
