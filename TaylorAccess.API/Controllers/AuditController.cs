using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/audit")]
[Authorize]
public class AuditController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly IAuditService _auditService;
    private readonly CurrentUserService _currentUserService;

    public AuditController(TaylorAccessDbContext context, IAuditService auditService, CurrentUserService currentUserService)
    {
        _context = context;
        _auditService = auditService;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Create a test audit log entry (for debugging)
    /// </summary>
    [HttpPost("test")]
    public async Task<ActionResult<object>> CreateTestLog()
    {
        var user = await _currentUserService.GetUserAsync();
        
        var testLog = new AuditLog
        {
            Action = "test",
            EntityType = "Test",
            EntityId = 999,
            Description = "Test audit log entry created manually",
            OrganizationId = user?.OrganizationId,
            UserId = user?.Id,
            UserEmail = user?.Email,
            UserName = user?.Name,
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            Timestamp = DateTime.UtcNow,
            Severity = "info"
        };

        _context.AuditLogs.Add(testLog);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Test audit log created successfully!",
            log = testLog,
            willBeVisibleTo = user?.OrganizationId.HasValue == true 
                ? $"Organization ID {user.OrganizationId}"
                : "NO ORGANIZATION (will be filtered out!)"
        });
    }

    /// <summary>
    /// Get audit logs with filtering
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetLogs(
        [FromQuery] string? entityType,
        [FromQuery] int? entityId,
        [FromQuery] int? userId,
        [FromQuery] string? action,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? severity,
        [FromQuery] int limit = 100,
        [FromQuery] int page = 1)
    {
        try
        {
            // Get current user
            var user = await _currentUserService.GetUserAsync();
            if (user == null)
            {
                return Unauthorized(new { message = "User not found" });
            }
            
            // MULTI-TENANT: Filter by organization
            var role = user.Role?.ToLower();
            IQueryable<AuditLog> query;
            if (role == "product_owner" || role == "superadmin")
            {
                // Show ALL logs across all orgs for product owners/superadmins
                query = _context.AuditLogs.AsQueryable();
            }
            else if (user.OrganizationId.HasValue)
            {
                // Regular users only see their org's logs
                query = _context.AuditLogs
                    .Where(l => l.OrganizationId == user.OrganizationId.Value)
                    .AsQueryable();
            }
            else
            {
                return Unauthorized(new { message = "User must belong to an organization" });
            }

            if (!string.IsNullOrEmpty(entityType))
                query = query.Where(l => l.EntityType == entityType);
            if (entityId.HasValue)
                query = query.Where(l => l.EntityId == entityId);
            if (userId.HasValue)
                query = query.Where(l => l.UserId == userId);
            if (!string.IsNullOrEmpty(action))
                query = query.Where(l => l.Action == action);
            
            // PostgreSQL requires UTC DateTimes - create new UTC DateTime from components
            if (from.HasValue)
            {
                var fromUtc = from.Value.Kind == DateTimeKind.Utc 
                    ? from.Value 
                    : new DateTime(from.Value.Year, from.Value.Month, from.Value.Day, 
                                   from.Value.Hour, from.Value.Minute, from.Value.Second, 
                                   from.Value.Millisecond, DateTimeKind.Utc);
                query = query.Where(l => l.Timestamp >= fromUtc);
            }
            if (to.HasValue)
            {
                var toUtc = to.Value.Kind == DateTimeKind.Utc 
                    ? to.Value 
                    : new DateTime(to.Value.Year, to.Value.Month, to.Value.Day, 
                                   to.Value.Hour, to.Value.Minute, to.Value.Second, 
                                   to.Value.Millisecond, DateTimeKind.Utc);
                query = query.Where(l => l.Timestamp <= toUtc);
            }
            
            if (!string.IsNullOrEmpty(severity))
                query = query.Where(l => l.Severity == severity);

            var total = await query.CountAsync();
            var logs = await query
                .OrderByDescending(l => l.Timestamp)
                .Skip((page - 1) * limit)
                .Take(limit)
                .ToListAsync();

            return Ok(new
            {
                data = logs,
                meta = new { total, page, limit, pages = (int)Math.Ceiling((double)total / limit) }
            });
        }
        catch (Exception ex)
        {
            // Log the error and return 500 with details
            Console.WriteLine($"[AuditController] Error in GetLogs: {ex.Message}");
            Console.WriteLine($"[AuditController] Stack Trace: {ex.StackTrace}");
            return StatusCode(500, new { 
                error = "Internal server error while fetching audit logs",
                message = ex.Message,
                type = ex.GetType().Name
            });
        }
    }

    /// <summary>
    /// Get audit log by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<AuditLog>> GetLog(int id)
    {
        var log = await _context.AuditLogs.FindAsync(id);
        if (log == null)
            return NotFound(new { message = "Audit log not found" });

        return Ok(new { log });
    }

    /// <summary>
    /// Get audit history for a specific entity
    /// </summary>
    [HttpGet("entity/{entityType}/{entityId}")]
    public async Task<ActionResult<object>> GetEntityHistory(string entityType, int entityId, [FromQuery] int limit = 50)
    {
        var logs = await _context.AuditLogs
            .Where(l => l.EntityType == entityType && l.EntityId == entityId)
            .OrderByDescending(l => l.Timestamp)
            .Take(limit)
            .ToListAsync();

        return Ok(new { data = logs });
    }

    /// <summary>
    /// Get user activity
    /// </summary>
    [HttpGet("user/{userId}")]
    public async Task<ActionResult<object>> GetUserActivity(int userId, [FromQuery] int limit = 50)
    {
        var logs = await _context.AuditLogs
            .Where(l => l.UserId == userId)
            .OrderByDescending(l => l.Timestamp)
            .Take(limit)
            .ToListAsync();

        return Ok(new { data = logs });
    }

    /// <summary>
    /// Get audit summary/stats
    /// </summary>
    [HttpGet("summary")]
    public async Task<ActionResult<object>> GetSummary(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        // Ensure DateTimes are UTC for PostgreSQL - reconstruct with UTC kind
        var fromDate = from.HasValue 
            ? (from.Value.Kind == DateTimeKind.Utc 
                ? from.Value 
                : new DateTime(from.Value.Year, from.Value.Month, from.Value.Day, 
                               from.Value.Hour, from.Value.Minute, from.Value.Second, 
                               from.Value.Millisecond, DateTimeKind.Utc))
            : DateTime.UtcNow.AddDays(-30);
            
        var toDate = to.HasValue 
            ? (to.Value.Kind == DateTimeKind.Utc 
                ? to.Value 
                : new DateTime(to.Value.Year, to.Value.Month, to.Value.Day, 
                               to.Value.Hour, to.Value.Minute, to.Value.Second, 
                               to.Value.Millisecond, DateTimeKind.Utc))
            : DateTime.UtcNow;

        var logs = await _context.AuditLogs
            .Where(l => l.Timestamp >= fromDate && l.Timestamp <= toDate)
            .ToListAsync();

        return Ok(new
        {
            period = new { from = fromDate, to = toDate },
            totalEvents = logs.Count,
            byAction = logs.GroupBy(l => l.Action)
                .ToDictionary(g => g.Key, g => g.Count()),
            byEntityType = logs.GroupBy(l => l.EntityType)
                .ToDictionary(g => g.Key, g => g.Count()),
            bySeverity = logs.GroupBy(l => l.Severity)
                .ToDictionary(g => g.Key, g => g.Count()),
            byUser = logs.Where(l => l.UserEmail != null)
                .GroupBy(l => l.UserEmail)
                .OrderByDescending(g => g.Count())
                .Take(10)
                .ToDictionary(g => g.Key!, g => g.Count()),
            recentActivity = logs.OrderByDescending(l => l.Timestamp).Take(10)
        });
    }

    /// <summary>
    /// Get login history
    /// </summary>
    [HttpGet("logins")]
    public async Task<ActionResult<object>> GetLoginHistory(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int limit = 100)
    {
        // Ensure DateTimes are UTC for PostgreSQL
        var fromDate = from.HasValue 
            ? (from.Value.Kind == DateTimeKind.Unspecified 
                ? DateTime.SpecifyKind(from.Value, DateTimeKind.Utc) 
                : from.Value.ToUniversalTime())
            : DateTime.UtcNow.AddDays(-7);
            
        var toDate = to.HasValue 
            ? (to.Value.Kind == DateTimeKind.Unspecified 
                ? DateTime.SpecifyKind(to.Value, DateTimeKind.Utc) 
                : to.Value.ToUniversalTime())
            : DateTime.UtcNow;

        var logins = await _context.AuditLogs
            .Where(l => (l.Action == AuditActions.Login || l.Action == AuditActions.LoginFailed || l.Action == AuditActions.Logout))
            .Where(l => l.Timestamp >= fromDate && l.Timestamp <= toDate)
            .OrderByDescending(l => l.Timestamp)
            .Take(limit)
            .Select(l => new
            {
                l.Id,
                l.Action,
                l.UserEmail,
                l.IpAddress,
                l.UserAgent,
                l.Timestamp,
                success = l.Action == AuditActions.Login
            })
            .ToListAsync();

        return Ok(new { data = logins });
    }

    /// <summary>
    /// Export audit logs
    /// </summary>
    [HttpGet("export")]
    public async Task<ActionResult> ExportLogs(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string format = "json")
    {
        // Ensure DateTimes are UTC for PostgreSQL - reconstruct with UTC kind
        var fromDate = from.HasValue 
            ? (from.Value.Kind == DateTimeKind.Utc 
                ? from.Value 
                : new DateTime(from.Value.Year, from.Value.Month, from.Value.Day, 
                               from.Value.Hour, from.Value.Minute, from.Value.Second, 
                               from.Value.Millisecond, DateTimeKind.Utc))
            : DateTime.UtcNow.AddDays(-30);
            
        var toDate = to.HasValue 
            ? (to.Value.Kind == DateTimeKind.Utc 
                ? to.Value 
                : new DateTime(to.Value.Year, to.Value.Month, to.Value.Day, 
                               to.Value.Hour, to.Value.Minute, to.Value.Second, 
                               to.Value.Millisecond, DateTimeKind.Utc))
            : DateTime.UtcNow;

        var logs = await _context.AuditLogs
            .Where(l => l.Timestamp >= fromDate && l.Timestamp <= toDate)
            .OrderByDescending(l => l.Timestamp)
            .ToListAsync();

        if (format == "csv")
        {
            var csv = "Id,Timestamp,Action,EntityType,EntityId,UserEmail,IpAddress,Description\n";
            csv += string.Join("\n", logs.Select(l => 
                $"\"{l.Id}\",\"{l.Timestamp:O}\",\"{l.Action}\",\"{l.EntityType}\",\"{l.EntityId}\",\"{l.UserEmail}\",\"{l.IpAddress}\",\"{l.Description?.Replace("\"", "\"\"")}\""
            ));
            
            return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", $"audit_logs_{fromDate:yyyyMMdd}_{toDate:yyyyMMdd}.csv");
        }

        return Ok(new { data = logs });
    }
}




