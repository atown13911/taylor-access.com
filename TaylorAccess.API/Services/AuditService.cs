using System.Text.Json;
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
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditService> _logger;
    private readonly IMongoDbService _mongoDbService;

    public AuditService(
        IHttpContextAccessor httpContextAccessor, 
        ILogger<AuditService> logger,
        IMongoDbService mongoDbService)
    {
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
        _mongoDbService = mongoDbService;
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
        // MongoDB only -- no PostgreSQL
        try
        {
            await _mongoDbService.LogAuditAsync(new MongoAuditLog
            {
                OrganizationId = log.OrganizationId,
                UserId = log.UserId,
                UserName = log.UserName,
                UserEmail = log.UserEmail,
                IpAddress = log.IpAddress,
                UserAgent = log.UserAgent,
                Action = log.Action,
                EntityType = log.EntityType,
                EntityId = log.EntityId,
                EntityName = log.EntityName,
                OldValues = log.OldValues,
                NewValues = log.NewValues,
                Changes = log.Changes,
                Description = log.Description,
                Module = log.Module,
                Endpoint = log.Endpoint,
                HttpMethod = log.HttpMethod,
                HttpStatusCode = log.HttpStatusCode,
                Timestamp = log.Timestamp,
                Severity = log.Severity
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log to MongoDB");
        }
    }

    public async Task<List<AuditLog>> GetLogsAsync(string? entityType = null, int? entityId = null, int? userId = null, DateTime? from = null, DateTime? to = null, int limit = 100)
    {
        // Read from MongoDB, convert to AuditLog format
        try
        {
            var mongoLogs = await _mongoDbService.GetAuditLogsAsync(entityType, entityId, userId, null, from, to, limit);
            return mongoLogs.Select(m => new AuditLog
            {
                OrganizationId = m.OrganizationId,
                UserId = m.UserId,
                UserName = m.UserName,
                UserEmail = m.UserEmail,
                IpAddress = m.IpAddress,
                UserAgent = m.UserAgent,
                Action = m.Action,
                EntityType = m.EntityType,
                EntityId = m.EntityId,
                EntityName = m.EntityName,
                OldValues = m.OldValues,
                NewValues = m.NewValues,
                Changes = m.Changes,
                Description = m.Description,
                Module = m.Module,
                Endpoint = m.Endpoint,
                HttpMethod = m.HttpMethod,
                HttpStatusCode = m.HttpStatusCode,
                Timestamp = m.Timestamp,
                Severity = m.Severity
            }).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read audit logs from MongoDB");
            return new List<AuditLog>();
        }
    }

    private string CalculateChanges(object oldValues, object newValues)
    {
        try
        {
            var oldJson = JsonSerializer.Serialize(oldValues);
            var newJson = JsonSerializer.Serialize(newValues);
            
            var oldDict = JsonSerializer.Deserialize<Dictionary<string, object>>(oldJson) ?? new();
            var newDict = JsonSerializer.Deserialize<Dictionary<string, object>>(newJson) ?? new();

            var changes = new List<object>();
            foreach (var key in newDict.Keys)
            {
                var oldVal = oldDict.GetValueOrDefault(key)?.ToString();
                var newVal = newDict[key]?.ToString();
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
