using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;
using System.Security.Cryptography;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/password")]
public class PasswordController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly IEmailService _emailService;
    private readonly IAuditService _auditService;

    public PasswordController(TaylorAccessDbContext context, IEmailService emailService, IAuditService auditService)
    {
        _context = context;
        _emailService = emailService;
        _auditService = auditService;
    }

    /// <summary>
    /// Request a password reset email
    /// </summary>
    [HttpPost("forgot")]
    [AllowAnonymous]
    public async Task<ActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        // Always return success to prevent email enumeration
        var successMessage = new { message = "If an account with that email exists, a password reset link has been sent." };

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());
        if (user == null)
        {
            // Log failed attempt but return success message
            await _auditService.LogAsync(AuditActions.PasswordReset, "User", null, 
                $"Password reset requested for non-existent email: {request.Email}");
            return Ok(successMessage);
        }

        // Invalidate any existing tokens for this user
        var existingTokens = await _context.PasswordResetTokens
            .Where(t => t.UserId == user.Id && !t.IsUsed)
            .ToListAsync();
        foreach (var t in existingTokens)
            t.IsUsed = true;

        // Generate new token
        var token = GenerateSecureToken();
        var resetToken = new PasswordResetToken
        {
            UserId = user.Id,
            Email = user.Email,
            Token = token,
            ExpiresAt = DateTime.UtcNow.AddHours(1)
        };

        _context.PasswordResetTokens.Add(resetToken);
        await _context.SaveChangesAsync();

        // Send email
        await _emailService.SendPasswordResetAsync(user.Email, token);

        await _auditService.LogAsync(AuditActions.PasswordReset, "User", user.Id, 
            "Password reset token generated and sent");

        return Ok(successMessage);
    }

    /// <summary>
    /// Verify a password reset token is valid
    /// </summary>
    [HttpGet("verify-token")]
    [AllowAnonymous]
    public async Task<ActionResult> VerifyToken([FromQuery] string token)
    {
        var resetToken = await _context.PasswordResetTokens
            .FirstOrDefaultAsync(t => t.Token == token);

        if (resetToken == null || !resetToken.IsValid)
        {
            return BadRequest(new { valid = false, message = "Invalid or expired token" });
        }

        return Ok(new { valid = true, email = resetToken.Email });
    }

    /// <summary>
    /// Reset password using token
    /// </summary>
    [HttpPost("reset")]
    [AllowAnonymous]
    public async Task<ActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        if (request.NewPassword != request.ConfirmPassword)
        {
            return BadRequest(new { message = "Passwords do not match" });
        }

        if (request.NewPassword.Length < 8)
        {
            return BadRequest(new { message = "Password must be at least 8 characters" });
        }

        var resetToken = await _context.PasswordResetTokens
            .FirstOrDefaultAsync(t => t.Token == request.Token);

        if (resetToken == null || !resetToken.IsValid)
        {
            return BadRequest(new { message = "Invalid or expired token" });
        }

        var user = await _context.Users.FindAsync(resetToken.UserId);
        if (user == null)
        {
            return BadRequest(new { message = "User not found" });
        }

        // Update password
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;

        // Mark token as used
        resetToken.IsUsed = true;

        await _context.SaveChangesAsync();

        await _auditService.LogAsync(AuditActions.PasswordChange, "User", user.Id, 
            "Password reset completed");

        return Ok(new { message = "Password has been reset successfully" });
    }

    /// <summary>
    /// Change password for authenticated user
    /// </summary>
    [HttpPost("change")]
    [Authorize]
    public async Task<ActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        if (request.NewPassword != request.ConfirmPassword)
        {
            return BadRequest(new { message = "New passwords do not match" });
        }

        if (request.NewPassword.Length < 8)
        {
            return BadRequest(new { message = "Password must be at least 8 characters" });
        }

        var userIdClaim = User.FindFirst("userId")?.Value;
        if (!int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { message = "Invalid token" });
        }

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return NotFound(new { message = "User not found" });
        }

        // Verify current password
        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
        {
            await _auditService.LogAsync(AuditActions.PasswordChange, "User", user.Id, 
                "Password change failed - incorrect current password", severity: "warning");
            return BadRequest(new { message = "Current password is incorrect" });
        }

        // Update password
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _auditService.LogAsync(AuditActions.PasswordChange, "User", user.Id, 
            "Password changed successfully");

        return Ok(new { message = "Password changed successfully" });
    }

    private static string GenerateSecureToken()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }
}

// Extension for audit with severity
public static class AuditServiceExtensions
{
    public static Task LogAsync(this IAuditService auditService, string action, string entityType, int? entityId, 
        string? description, string severity = "info", object? oldValues = null, object? newValues = null)
    {
        return auditService.LogAsync(action, entityType, entityId, description, oldValues, newValues);
    }
}




