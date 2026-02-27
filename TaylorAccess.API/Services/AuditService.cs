using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public interface IAuditService
{
    Task LogAsync(string action, string entityType, int? entityId, string? description = null, object? oldValues = null, object? newValues = null);
    Task LogAsync(AuditLog log);
    Task<List<AuditLog>> GetLogsAsync(string? entityType = null, int? entityId = null, int? userId = null, DateTime? from = null, DateTime? to = null, int limit = 100);
}

public class AuditService : IAuditService
{
    private readonly TaylorAccessDbContext _context;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditService> _logger;
    private readonly IServiceProvider _serviceProvider;

    public AuditService(
        TaylorAccessDbContext context, 
        IHttpContextAccessor httpContextAccessor, 
        ILogger<AuditService> logger,
        IServiceProvider serviceProvider)
    {
        _context = context;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
        _serviceProvider = serviceProvider;
    }

    public async Task LogAsync(string action, string entityType, int? entityId, string? description = null, object? oldValues = null, object? newValues = null)
    {
        var httpContext = _httpContextAccessor.HttpContext;
        
        var log = new AuditLog
        {
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Description = description,
            OldValues = oldValues != null ? JsonSerializer.Serialize(oldValues) : null,
            NewValues = newValues != null ? JsonSerializer.Serialize(newValues) : null,
            Timestamp = DateTime.UtcNow
        };

        if (httpContext != null)
        {
            var userIdClaim = httpContext.User.FindFirst("userId")?.Value;
            if (int.TryParse(userIdClaim, out var userId))
                log.UserId = userId;
            
            var orgIdClaim = httpContext.User.FindFirst("organizationId")?.Value;
            if (!string.IsNullOrWhiteSpace(orgIdClaim) && int.TryParse(orgIdClaim, out var orgId))
                log.OrganizationId = orgId;
            
            log.UserName = httpContext.User.FindFirst("name")?.Value;
            log.UserEmail = httpContext.User.FindFirst("email")?.Value;
            log.IpAddress = httpContext.Connection.RemoteIpAddress?.ToString();
            log.UserAgent = httpContext.Request.Headers.UserAgent.ToString();
            log.Endpoint = httpContext.Request.Path;
            log.HttpMethod = httpContext.Request.Method;
        }

        if (oldValues != null && newValues != null)
            log.Changes = CalculateChanges(oldValues, newValues);

        await LogAsync(log);
    }

    public async Task LogAsync(AuditLog log)
    {
        try
        {
            _context.AuditLogs.Add(log);
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log to PostgreSQL");
        }
    }

    public async Task<List<AuditLog>> GetLogsAsync(string? entityType = null, int? entityId = null, int? userId = null, DateTime? from = null, DateTime? to = null, int limit = 100)
    {
        var query = _context.AuditLogs.AsQueryable();

        if (!string.IsNullOrEmpty(entityType))
            query = query.Where(l => l.EntityType == entityType);
        if (entityId.HasValue)
            query = query.Where(l => l.EntityId == entityId);
        if (userId.HasValue)
            query = query.Where(l => l.UserId == userId);
        if (from.HasValue)
            query = query.Where(l => l.Timestamp >= from.Value);
        if (to.HasValue)
            query = query.Where(l => l.Timestamp <= to.Value);

        return await query.OrderByDescending(l => l.Timestamp)
            .Take(limit)
            .ToListAsync();
    }

    private static string CalculateChanges(object oldValues, object newValues)
    {
        try
        {
            var oldJson = JsonSerializer.Serialize(oldValues);
            var newJson = JsonSerializer.Serialize(newValues);
            
            var oldDict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(oldJson) ?? new();
            var newDict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(newJson) ?? new();

            var changes = new List<object>();
            foreach (var key in newDict.Keys)
            {
                var oldEl = oldDict.GetValueOrDefault(key);
                var newEl = newDict[key];
                var oldVal = oldEl.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ? "" : oldEl.ToString();
                var newVal = newEl.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ? "" : newEl.ToString();
                if (oldVal != newVal)
                    changes.Add(new { field = key, from = oldVal, to = newVal });
            }

            return JsonSerializer.Serialize(changes);
        }
        catch
        {
            return "[]";
        }
    }
}
