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
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditService> _logger;
    private readonly IMongoDbService _mongoDbService;
    private readonly TaylorAccessDbContext _context;

    public AuditService(
        IHttpContextAccessor httpContextAccessor, 
        ILogger<AuditService> logger,
        IMongoDbService mongoDbService,
        TaylorAccessDbContext context)
    {
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
        _mongoDbService = mongoDbService;
        _context = context;
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
        // Always persist to PostgreSQL so audit history remains available
        // even when MongoDB/gateway is unavailable.
        try
        {
            var sqlLog = new AuditLog
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
            };

            _context.AuditLogs.Add(sqlLog);
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to write audit log to PostgreSQL");
            await WriteSqlAuditFallbackAsync(log);
        }

        // Write to central MongoDB audit_logs collection
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
            _logger.LogWarning(ex, "Failed to write audit log to MongoDB");
        }
    }

    public async Task<List<AuditLog>> GetLogsAsync(string? entityType = null, int? entityId = null, int? userId = null, DateTime? from = null, DateTime? to = null, int limit = 100)
    {
        // Read from central MongoDB audit_logs
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

    private async Task WriteSqlAuditFallbackAsync(AuditLog log)
    {
        try
        {
            // Minimal schema bootstrap if migrations/drift left the table missing.
            await _context.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS ""AuditLogs"" (
                    ""Id"" SERIAL PRIMARY KEY,
                    ""OrganizationId"" INTEGER NULL,
                    ""UserId"" INTEGER NULL,
                    ""UserName"" VARCHAR(200) NULL,
                    ""UserEmail"" VARCHAR(256) NULL,
                    ""IpAddress"" VARCHAR(64) NULL,
                    ""UserAgent"" TEXT NULL,
                    ""Action"" VARCHAR(120) NOT NULL,
                    ""EntityType"" VARCHAR(120) NOT NULL,
                    ""EntityId"" INTEGER NULL,
                    ""EntityName"" VARCHAR(300) NULL,
                    ""OldValues"" TEXT NULL,
                    ""NewValues"" TEXT NULL,
                    ""Changes"" TEXT NULL,
                    ""Description"" TEXT NULL,
                    ""Module"" VARCHAR(120) NULL,
                    ""Endpoint"" VARCHAR(500) NULL,
                    ""HttpMethod"" VARCHAR(20) NULL,
                    ""HttpStatusCode"" INTEGER NULL,
                    ""Timestamp"" TIMESTAMP NOT NULL DEFAULT NOW(),
                    ""Severity"" VARCHAR(20) NOT NULL DEFAULT 'info'
                );
            ");

            await _context.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO ""AuditLogs""
                (""Id"", ""OrganizationId"", ""UserId"", ""UserName"", ""UserEmail"", ""IpAddress"", ""UserAgent"", ""Action"", ""EntityType"", ""EntityId"", ""EntityName"", ""OldValues"", ""NewValues"", ""Changes"", ""Description"", ""Module"", ""Endpoint"", ""HttpMethod"", ""HttpStatusCode"", ""Timestamp"", ""Severity"")
                VALUES
                ((SELECT COALESCE(MAX(""Id""), 0) + 1 FROM ""AuditLogs""), {log.OrganizationId}, {log.UserId}, {log.UserName}, {log.UserEmail}, {log.IpAddress}, {log.UserAgent}, {log.Action}, {log.EntityType}, {log.EntityId}, {log.EntityName}, {log.OldValues}, {log.NewValues}, {log.Changes}, {log.Description}, {log.Module}, {log.Endpoint}, {log.HttpMethod}, {log.HttpStatusCode}, {log.Timestamp}, {log.Severity});
            ");
        }
        catch (Exception fallbackEx)
        {
            _logger.LogError(fallbackEx, "SQL audit fallback write failed");
        }
    }
}
