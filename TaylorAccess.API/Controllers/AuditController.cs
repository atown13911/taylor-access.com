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
    private readonly IMongoDbService _mongo;
    private readonly IAuditService _auditService;
    private readonly CurrentUserService _currentUserService;
    private readonly TaylorAccessDbContext _context;

    public AuditController(IMongoDbService mongo, IAuditService auditService, CurrentUserService currentUserService, TaylorAccessDbContext context)
    {
        _mongo = mongo;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _context = context;
    }

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
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not found" });

        var role = user.Role?.ToLowerInvariant();
        int? orgFilter = (role == "product_owner" || role == "superadmin" || role == "development")
            ? null
            : user.OrganizationId;

        var logs = await _mongo.GetAuditLogsAsync(
            entityType: entityType,
            entityId: entityId,
            userId: userId,
            organizationId: orgFilter,
            from: from?.ToUniversalTime(),
            to: to?.ToUniversalTime(),
            limit: limit * page,
            includeUnscopedOrganization: orgFilter.HasValue
        );

        if (!string.IsNullOrEmpty(action))
            logs = logs.Where(l => l.Action == action).ToList();
        if (!string.IsNullOrEmpty(severity))
            logs = logs.Where(l => l.Severity == severity).ToList();

        var total = logs.Count;
        var paged = logs.Skip((page - 1) * limit).Take(limit).ToList();

        return Ok(new
        {
            data = paged,
            meta = new { total, page, limit, pages = (int)Math.Ceiling((double)total / limit) }
        });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult> GetLog(string id)
    {
        var logs = await _mongo.GetAuditLogsAsync(limit: 1);
        var log = logs.FirstOrDefault(l => l.Id == id);
        if (log == null) return NotFound(new { message = "Audit log not found" });
        return Ok(new { log });
    }

    [HttpGet("entity/{entityType}/{entityId}")]
    public async Task<ActionResult<object>> GetEntityHistory(string entityType, int entityId, [FromQuery] int limit = 50)
    {
        var logs = await _mongo.GetAuditLogsAsync(entityType: entityType, entityId: entityId, limit: limit);
        return Ok(new { data = logs });
    }

    [HttpGet("user/{userId}")]
    public async Task<ActionResult<object>> GetUserActivity(int userId, [FromQuery] int limit = 50)
    {
        var logs = await _mongo.GetAuditLogsAsync(userId: userId, limit: limit);
        return Ok(new { data = logs });
    }

    [HttpGet("summary")]
    public async Task<ActionResult<object>> GetSummary([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not found" });

        var role = user.Role?.ToLowerInvariant();
        int? orgFilter = (role == "product_owner" || role == "superadmin" || role == "development")
            ? null
            : user.OrganizationId;

        var fromDate = from?.ToUniversalTime() ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to?.ToUniversalTime() ?? DateTime.UtcNow;

        var logs = await _mongo.GetAuditLogsAsync(
            organizationId: orgFilter,
            from: fromDate,
            to: toDate,
            limit: 10000,
            includeUnscopedOrganization: orgFilter.HasValue
        );

        return Ok(new
        {
            period = new { from = fromDate, to = toDate },
            totalEvents = logs.Count,
            byAction = logs.GroupBy(l => l.Action).ToDictionary(g => g.Key ?? "unknown", g => g.Count()),
            byEntityType = logs.GroupBy(l => l.EntityType).ToDictionary(g => g.Key ?? "unknown", g => g.Count()),
            bySeverity = logs.GroupBy(l => l.Severity).ToDictionary(g => g.Key ?? "info", g => g.Count()),
            byUser = logs.Where(l => l.UserEmail != null).GroupBy(l => l.UserEmail)
                .OrderByDescending(g => g.Count()).Take(10)
                .ToDictionary(g => g.Key!, g => g.Count()),
            recentActivity = logs.OrderByDescending(l => l.Timestamp).Take(10)
        });
    }

    /// <summary>
    /// Get activity logs for a specific user on a specific day (used by Time Clock drawer)
    /// </summary>
    [HttpGet("employee-day")]
    public async Task<ActionResult<object>> GetEmployeeDay([FromQuery] string email, [FromQuery] string date)
    {
        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(date))
            return BadRequest(new { error = "email and date are required" });

        if (!DateTime.TryParse(date, out var parsedDate))
            return BadRequest(new { error = "Invalid date format" });

        var dayStart = DateTime.SpecifyKind(parsedDate.Date, DateTimeKind.Utc);
        var dayEnd   = dayStart.AddDays(1).AddTicks(-1);

        // Query central MongoDB audit_logs by email + date
        var mongoLogs = await _mongo.GetAuditLogsAsync(
            from: dayStart, to: dayEnd, limit: 500);

        var logs = mongoLogs
            .Where(l => !string.IsNullOrEmpty(l.UserEmail) &&
                        l.UserEmail.Equals(email, StringComparison.OrdinalIgnoreCase))
            .OrderBy(l => l.Timestamp)
            .Select(l => new
            {
                l.Id, l.Action, l.UserEmail, l.UserName,
                l.EntityType, l.EntityId, Description = l.Description,
                l.Timestamp, l.IpAddress
            })
            .ToList();

        return Ok(new { data = logs });
    }

    [HttpGet("logins")]
    public async Task<ActionResult<object>> GetLoginHistory([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int limit = 100)
    {
        var fromDate = from?.ToUniversalTime() ?? DateTime.UtcNow.AddDays(-7);
        var toDate = to?.ToUniversalTime() ?? DateTime.UtcNow;

        var logs = await _mongo.GetAuditLogsAsync(from: fromDate, to: toDate, limit: limit * 5);
        var logins = logs.Where(l => l.Action == "login" || l.Action == "login_failed" || l.Action == "logout")
            .Take(limit)
            .Select(l => new { l.Id, l.Action, l.UserEmail, l.IpAddress, l.UserAgent, l.Timestamp, success = l.Action == "login" })
            .ToList();

        return Ok(new { data = logins });
    }

    [HttpGet("export")]
    public async Task<ActionResult> ExportLogs([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string format = "json")
    {
        var fromDate = from?.ToUniversalTime() ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to?.ToUniversalTime() ?? DateTime.UtcNow;

        var logs = await _mongo.GetAuditLogsAsync(from: fromDate, to: toDate, limit: 50000);

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

    [HttpPost("test")]
    public async Task<ActionResult<object>> CreateTestLog()
    {
        var user = await _currentUserService.GetUserAsync();
        await _auditService.LogAsync("test", "Test", 999, "Test audit log entry created manually");
        return Ok(new { message = "Test audit log created in MongoDB" });
    }
}
