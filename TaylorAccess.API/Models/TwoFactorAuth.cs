using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class TwoFactorSettings
{
    public int Id { get; set; }
    
    [Required]
    public int UserId { get; set; }
    
    public bool IsEnabled { get; set; } = false;
    
    public string? SecretKey { get; set; }
    
    public string? BackupCodes { get; set; }
    
    public DateTime? EnabledAt { get; set; }
    
    public DateTime? LastVerifiedAt { get; set; }
    
    public int FailedAttempts { get; set; } = 0;
    
    public DateTime? LockoutEnd { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public virtual User? User { get; set; }
}

public record Enable2FARequest(string Code);
public record Verify2FARequest(string Code);
public record Disable2FARequest(string Password, string Code);
public record UseBackupCodeRequest(string BackupCode);

public class TwoFactorSetupResponse
{
    public string SecretKey { get; set; } = string.Empty;
    public string QrCodeUri { get; set; } = string.Empty;
    public List<string> BackupCodes { get; set; } = new();
}
