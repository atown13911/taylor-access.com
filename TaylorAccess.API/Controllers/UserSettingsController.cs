using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/user-settings")]
[Authorize]
public class UserSettingsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public UserSettingsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get all settings for the current user
    /// </summary>
    [HttpGet]
    public async Task<ActionResult> GetAll()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var settings = await _context.UserSettings
            .Where(s => s.UserId == user.Id)
            .Select(s => new { s.Key, s.Value, s.UpdatedAt })
            .ToListAsync();

        return Ok(new { data = settings });
    }

    /// <summary>
    /// Get a single setting by key
    /// </summary>
    [HttpGet("{key}")]
    public async Task<ActionResult> Get(string key)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var setting = await _context.UserSettings
            .FirstOrDefaultAsync(s => s.UserId == user.Id && s.Key == key);

        if (setting == null)
            return Ok(new { key, value = (string?)null, updatedAt = (DateTime?)null });

        return Ok(new { key = setting.Key, value = setting.Value, updatedAt = setting.UpdatedAt });
    }

    /// <summary>
    /// Create or update a setting
    /// </summary>
    [HttpPut("{key}")]
    public async Task<ActionResult> Upsert(string key, [FromBody] UserSettingRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        if (key.Length > 100)
            return BadRequest(new { error = "Key must be 100 characters or less" });

        var existing = await _context.UserSettings
            .FirstOrDefaultAsync(s => s.UserId == user.Id && s.Key == key);

        if (existing != null)
        {
            existing.Value = request.Value;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _context.UserSettings.Add(new UserSetting
            {
                UserId = user.Id,
                Key = key,
                Value = request.Value
            });
        }

        await _context.SaveChangesAsync();

        return Ok(new { key, saved = true, updatedAt = DateTime.UtcNow });
    }

    /// <summary>
    /// Delete a setting
    /// </summary>
    [HttpDelete("{key}")]
    public async Task<ActionResult> Delete(string key)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var setting = await _context.UserSettings
            .FirstOrDefaultAsync(s => s.UserId == user.Id && s.Key == key);

        if (setting == null)
            return NotFound(new { error = "Setting not found" });

        _context.UserSettings.Remove(setting);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }

    /// <summary>
    /// Bulk upsert multiple settings at once
    /// </summary>
    [HttpPost("bulk")]
    public async Task<ActionResult> BulkUpsert([FromBody] List<UserSettingBulkItem> items)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var existingKeys = await _context.UserSettings
            .Where(s => s.UserId == user.Id && items.Select(i => i.Key).Contains(s.Key))
            .ToListAsync();

        foreach (var item in items)
        {
            var existing = existingKeys.FirstOrDefault(e => e.Key == item.Key);
            if (existing != null)
            {
                existing.Value = item.Value;
                existing.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                _context.UserSettings.Add(new UserSetting
                {
                    UserId = user.Id,
                    Key = item.Key,
                    Value = item.Value
                });
            }
        }

        await _context.SaveChangesAsync();

        return Ok(new { saved = items.Count, updatedAt = DateTime.UtcNow });
    }
}

public record UserSettingRequest(string Value);
public record UserSettingBulkItem(string Key, string Value);


