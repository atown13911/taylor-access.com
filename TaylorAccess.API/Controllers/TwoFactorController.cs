using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/2fa")]
[Authorize]
public class TwoFactorController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ITotpService _totpService;
    private readonly IAuditService _auditService;

    public TwoFactorController(TaylorAccessDbContext context, ITotpService totpService, IAuditService auditService)
    {
        _context = context;
        _totpService = totpService;
        _auditService = auditService;
    }

    /// <summary>
    /// Get 2FA status for current user
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult<object>> GetStatus()
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var settings = await _context.TwoFactorSettings.FirstOrDefaultAsync(t => t.UserId == userId);
        
        return Ok(new
        {
            isEnabled = settings?.IsEnabled ?? false,
            enabledAt = settings?.EnabledAt,
            lastVerifiedAt = settings?.LastVerifiedAt
        });
    }

    /// <summary>
    /// Generate setup data for enabling 2FA
    /// </summary>
    [HttpPost("setup")]
    public async Task<ActionResult<TwoFactorSetupResponse>> Setup()
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var user = await _context.Users.FindAsync(userId);
        if (user == null) return NotFound(new { message = "User not found" });

        // Check if already enabled
        var existing = await _context.TwoFactorSettings.FirstOrDefaultAsync(t => t.UserId == userId);
        if (existing?.IsEnabled == true)
        {
            return BadRequest(new { message = "2FA is already enabled. Disable it first to reconfigure." });
        }

        // Generate secret key
        var secretKey = _totpService.GenerateSecretKey();
        var qrCodeUri = _totpService.GenerateQrCodeUri(user.Email, secretKey);
        var backupCodes = _totpService.GenerateBackupCodes();

        // Save (but not enabled yet)
        if (existing != null)
        {
            existing.SecretKey = secretKey;
            existing.BackupCodes = JsonSerializer.Serialize(backupCodes);
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _context.TwoFactorSettings.Add(new TwoFactorSettings
            {
                UserId = userId.Value,
                SecretKey = secretKey,
                BackupCodes = JsonSerializer.Serialize(backupCodes),
                IsEnabled = false
            });
        }

        await _context.SaveChangesAsync();

        return Ok(new TwoFactorSetupResponse
        {
            SecretKey = secretKey,
            QrCodeUri = qrCodeUri,
            BackupCodes = backupCodes
        });
    }

    /// <summary>
    /// Enable 2FA after verifying setup code
    /// </summary>
    [HttpPost("enable")]
    public async Task<ActionResult<object>> Enable([FromBody] Enable2FARequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var settings = await _context.TwoFactorSettings.FirstOrDefaultAsync(t => t.UserId == userId);
        if (settings == null || string.IsNullOrEmpty(settings.SecretKey))
        {
            return BadRequest(new { message = "Please run setup first" });
        }

        if (settings.IsEnabled)
        {
            return BadRequest(new { message = "2FA is already enabled" });
        }

        // Validate the code
        if (!_totpService.ValidateCode(settings.SecretKey, request.Code))
        {
            return BadRequest(new { message = "Invalid verification code" });
        }

        settings.IsEnabled = true;
        settings.EnabledAt = DateTime.UtcNow;
        settings.LastVerifiedAt = DateTime.UtcNow;
        settings.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _auditService.LogAsync("2fa_enabled", "User", userId, "Two-factor authentication enabled");

        return Ok(new { message = "Two-factor authentication enabled successfully" });
    }

    /// <summary>
    /// Verify 2FA code (used during login)
    /// </summary>
    [HttpPost("verify")]
    [AllowAnonymous]
    public async Task<ActionResult<object>> Verify([FromBody] Verify2FARequest request, [FromQuery] int userId)
    {
        var settings = await _context.TwoFactorSettings.FirstOrDefaultAsync(t => t.UserId == userId);
        if (settings == null || !settings.IsEnabled)
        {
            return BadRequest(new { message = "2FA is not enabled for this user" });
        }

        // Check lockout
        if (settings.LockoutEnd.HasValue && settings.LockoutEnd > DateTime.UtcNow)
        {
            return BadRequest(new { message = "Account is temporarily locked. Please try again later." });
        }

        // Validate code
        if (!_totpService.ValidateCode(settings.SecretKey!, request.Code))
        {
            settings.FailedAttempts++;
            
            // Lock after 5 failed attempts
            if (settings.FailedAttempts >= 5)
            {
                settings.LockoutEnd = DateTime.UtcNow.AddMinutes(15);
            }
            
            await _context.SaveChangesAsync();
            return BadRequest(new { message = "Invalid verification code" });
        }

        // Success - reset counters
        settings.FailedAttempts = 0;
        settings.LockoutEnd = null;
        settings.LastVerifiedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { verified = true });
    }

    /// <summary>
    /// Disable 2FA
    /// </summary>
    [HttpPost("disable")]
    public async Task<ActionResult<object>> Disable([FromBody] Disable2FARequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var user = await _context.Users.FindAsync(userId);
        if (user == null) return NotFound();

        // Verify password
        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return BadRequest(new { message = "Invalid password" });
        }

        var settings = await _context.TwoFactorSettings.FirstOrDefaultAsync(t => t.UserId == userId);
        if (settings == null || !settings.IsEnabled)
        {
            return BadRequest(new { message = "2FA is not enabled" });
        }

        // Verify 2FA code
        if (!_totpService.ValidateCode(settings.SecretKey!, request.Code))
        {
            return BadRequest(new { message = "Invalid verification code" });
        }

        settings.IsEnabled = false;
        settings.SecretKey = null;
        settings.BackupCodes = null;
        settings.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _auditService.LogAsync("2fa_disabled", "User", userId, "Two-factor authentication disabled");

        return Ok(new { message = "Two-factor authentication disabled" });
    }

    /// <summary>
    /// Use a backup code
    /// </summary>
    [HttpPost("backup-code")]
    [AllowAnonymous]
    public async Task<ActionResult<object>> UseBackupCode([FromBody] UseBackupCodeRequest request, [FromQuery] int userId)
    {
        var settings = await _context.TwoFactorSettings.FirstOrDefaultAsync(t => t.UserId == userId);
        if (settings == null || !settings.IsEnabled || string.IsNullOrEmpty(settings.BackupCodes))
        {
            return BadRequest(new { message = "Invalid request" });
        }

        var backupCodes = JsonSerializer.Deserialize<List<string>>(settings.BackupCodes) ?? new();
        
        if (!backupCodes.Contains(request.BackupCode))
        {
            return BadRequest(new { message = "Invalid backup code" });
        }

        // Remove used backup code
        backupCodes.Remove(request.BackupCode);
        settings.BackupCodes = JsonSerializer.Serialize(backupCodes);
        settings.LastVerifiedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        await _auditService.LogAsync("2fa_backup_used", "User", userId, "Backup code used for 2FA verification");

        return Ok(new 
        { 
            verified = true,
            remainingBackupCodes = backupCodes.Count
        });
    }

    /// <summary>
    /// Regenerate backup codes
    /// </summary>
    [HttpPost("regenerate-backup-codes")]
    public async Task<ActionResult<object>> RegenerateBackupCodes([FromBody] Verify2FARequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var settings = await _context.TwoFactorSettings.FirstOrDefaultAsync(t => t.UserId == userId);
        if (settings == null || !settings.IsEnabled)
        {
            return BadRequest(new { message = "2FA is not enabled" });
        }

        // Verify code first
        if (!_totpService.ValidateCode(settings.SecretKey!, request.Code))
        {
            return BadRequest(new { message = "Invalid verification code" });
        }

        var newBackupCodes = _totpService.GenerateBackupCodes();
        settings.BackupCodes = JsonSerializer.Serialize(newBackupCodes);
        settings.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _auditService.LogAsync("2fa_backup_regenerated", "User", userId, "Backup codes regenerated");

        return Ok(new { backupCodes = newBackupCodes });
    }

    private int? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst("userId")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (int.TryParse(userIdClaim, out var userId))
            return userId;
        return null;
    }
}




