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

    public record NavigationClickRequest(
        string? Route,
        string? Label,
        string? Section,
        string? Source
    );

    public record ClientActivityRequest(
        string Action,
        string? EntityType,
        string? Description,
        string? Endpoint
    );

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
        var mongoConnected = _mongo.IsConnected;

        var fromUtc = from?.ToUniversalTime();
        var toUtc = to?.ToUniversalTime();
        var mongoLogs = await _mongo.GetAuditLogsAsync(
            entityType: entityType,
            entityId: entityId,
            userId: userId,
            organizationId: orgFilter,
            from: fromUtc,
            to: toUtc,
            limit: limit * page,
            includeUnscopedOrganization: orgFilter.HasValue
        );
        if (mongoLogs.Count == 0 && orgFilter.HasValue)
        {
            var unscopedMongo = await _mongo.GetAuditLogsAsync(
                entityType: entityType,
                entityId: entityId,
                userId: userId,
                organizationId: null,
                from: fromUtc,
                to: toUtc,
                limit: limit * page * 2,
                includeUnscopedOrganization: false
            );

            mongoLogs = unscopedMongo
                .Where(l => !l.OrganizationId.HasValue || l.OrganizationId == orgFilter.Value)
                .ToList();
        }
        var logs = mongoLogs.Select(MapMongoAuditLog).ToList();

        if (!string.IsNullOrEmpty(action))
            logs = logs.Where(l => string.Equals(l.Action, action, StringComparison.OrdinalIgnoreCase)).ToList();
        if (!string.IsNullOrEmpty(severity))
            logs = logs.Where(l => string.Equals(l.Severity, severity, StringComparison.OrdinalIgnoreCase)).ToList();

        var sqlFallbackUsed = false;
        int total;
        List<AuditLog> paged;
        if (logs.Count > 0)
        {
            total = logs.Count;
            paged = logs.Skip((page - 1) * limit).Take(limit).ToList();
        }
        else
        {
            sqlFallbackUsed = true;
            (total, paged) = await QuerySqlLogsAsync(
                entityType: entityType,
                entityId: entityId,
                userId: userId,
                organizationId: orgFilter,
                action: action,
                severity: severity,
                from: fromUtc,
                to: toUtc,
                page: page,
                limit: limit
            );
        }
        
        if (total == 0)
        {
            await EnsureBootstrapAuditRecordAsync(user, orgFilter);
            (total, paged) = await QuerySqlLogsAsync(
                entityType: entityType,
                entityId: entityId,
                userId: userId,
                organizationId: orgFilter,
                action: action,
                severity: severity,
                from: fromUtc,
                to: toUtc,
                page: page,
                limit: limit
            );
            sqlFallbackUsed = true;
        }

        var warning = !mongoConnected
            ? "Audit storage is currently unavailable (MongoDB not connected). Showing PostgreSQL fallback results."
            : null;
        if (total == 0)
        {
            warning = "No audit rows found for the selected filters and date range.";
        }

        return Ok(new
        {
            data = paged,
            meta = new { total, page, limit, pages = (int)Math.Ceiling((double)total / limit) },
            mongoConnected,
            dataSource = sqlFallbackUsed ? "postgres" : "mongo",
            warning
        });
    }

    [HttpPost("activity")]
    public async Task<ActionResult<object>> LogClientActivity([FromBody] ClientActivityRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not found" });

        if (string.IsNullOrWhiteSpace(request.Action))
            return BadRequest(new { error = "Action is required" });

        var details = request.Description ?? request.Action;
        if (!string.IsNullOrWhiteSpace(request.Endpoint))
            details = $"{details} @ {request.Endpoint}";

        await _auditService.LogAsync(new AuditLog
        {
            OrganizationId = user.OrganizationId,
            UserId = user.Id > 0 ? user.Id : null,
            UserName = user.Name,
            UserEmail = user.Email,
            Action = request.Action,
            EntityType = request.EntityType ?? "user_activity",
            Description = details,
            Endpoint = request.Endpoint,
            HttpMethod = "CLIENT",
            Module = "Taylor Access",
            Severity = "info",
            Timestamp = DateTime.UtcNow
        });

        return Ok(new { logged = true });
    }

    [HttpPost("navigation-click")]
    public async Task<ActionResult<object>> LogNavigationClick([FromBody] NavigationClickRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { message = "User not found" });

        var route = string.IsNullOrWhiteSpace(request.Route) ? "unknown" : request.Route.Trim();
        var label = string.IsNullOrWhiteSpace(request.Label) ? "Unknown" : request.Label.Trim();
        var section = string.IsNullOrWhiteSpace(request.Section) ? "General" : request.Section.Trim();
        var source = string.IsNullOrWhiteSpace(request.Source) ? "sidebar" : request.Source.Trim();

        await _auditService.LogAsync(new AuditLog
        {
            OrganizationId = user.OrganizationId,
            UserId = user.Id > 0 ? user.Id : null,
            UserName = user.Name,
            UserEmail = user.Email,
            Action = "navigation_click",
            EntityType = "Navigation",
            EntityName = label,
            Description = $"{label} clicked ({route}) from {section} [{source}]",
            Module = "navigation",
            Endpoint = route,
            HttpMethod = "NAVIGATE",
            Timestamp = DateTime.UtcNow,
            Severity = "info"
        });

        return Ok(new { success = true });
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
        var mongoConnected = _mongo.IsConnected;

        var fromDate = from?.ToUniversalTime() ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to?.ToUniversalTime() ?? DateTime.UtcNow;

        var mongoLogs = await _mongo.GetAuditLogsAsync(
            organizationId: orgFilter,
            from: fromDate,
            to: toDate,
            limit: 10000,
            includeUnscopedOrganization: orgFilter.HasValue
        );
        if (mongoLogs.Count == 0 && orgFilter.HasValue)
        {
            var unscopedMongo = await _mongo.GetAuditLogsAsync(
                organizationId: null,
                from: fromDate,
                to: toDate,
                limit: 10000,
                includeUnscopedOrganization: false
            );

            mongoLogs = unscopedMongo
                .Where(l => !l.OrganizationId.HasValue || l.OrganizationId == orgFilter.Value)
                .ToList();
        }
        var logs = mongoLogs.Select(MapMongoAuditLog).ToList();

        var sqlFallbackUsed = false;
        if (logs.Count == 0)
        {
            sqlFallbackUsed = true;
            await EnsureBootstrapAuditRecordAsync(user, orgFilter);
            logs = await QuerySqlLogsForSummaryAsync(
                organizationId: orgFilter,
                from: fromDate,
                to: toDate
            );
        }

        var warning = !mongoConnected
            ? "Audit storage is currently unavailable (MongoDB not connected). Summary is using PostgreSQL fallback."
            : null;
        if (logs.Count == 0)
        {
            warning = "Audit summary has no rows for the selected date range.";
        }

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
            recentActivity = logs.OrderByDescending(l => l.Timestamp).Take(10),
            mongoConnected,
            dataSource = sqlFallbackUsed ? "postgres" : "mongo",
            warning
        });
    }

    private async Task<(int total, List<AuditLog> data)> QuerySqlLogsAsync(
        string? entityType,
        int? entityId,
        int? userId,
        int? organizationId,
        string? action,
        string? severity,
        DateTime? from,
        DateTime? to,
        int page,
        int limit)
    {
        var query = BuildSqlAuditQuery(entityType, entityId, userId, organizationId, action, severity, from, to);

        var total = await query.CountAsync();
        var data = await query
            .OrderByDescending(l => l.Timestamp)
            .Skip((page - 1) * limit)
            .Take(limit)
            .ToListAsync();

        return (total, data);
    }

    private async Task<List<AuditLog>> QuerySqlLogsForSummaryAsync(
        int? organizationId,
        DateTime? from,
        DateTime? to)
    {
        return await BuildSqlAuditQuery(
                entityType: null,
                entityId: null,
                userId: null,
                organizationId: organizationId,
                action: null,
                severity: null,
                from: from,
                to: to
            )
            .OrderByDescending(l => l.Timestamp)
            .Take(10000)
            .ToListAsync();
    }

    private IQueryable<AuditLog> BuildSqlAuditQuery(
        string? entityType,
        int? entityId,
        int? userId,
        int? organizationId,
        string? action,
        string? severity,
        DateTime? from,
        DateTime? to)
    {
        var query = _context.AuditLogs.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(l => l.EntityType == entityType);
        if (entityId.HasValue)
            query = query.Where(l => l.EntityId == entityId);
        if (userId.HasValue)
            query = query.Where(l => l.UserId == userId);
        if (organizationId.HasValue)
            query = query.Where(l => l.OrganizationId == organizationId || l.OrganizationId == null);
        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(l => (l.Action ?? string.Empty).ToLower() == action.ToLower());
        if (!string.IsNullOrWhiteSpace(severity))
            query = query.Where(l => (l.Severity ?? string.Empty).ToLower() == severity.ToLower());
        if (from.HasValue)
            query = query.Where(l => l.Timestamp >= from.Value);
        if (to.HasValue)
            query = query.Where(l => l.Timestamp <= to.Value);

        return query;
    }

    private async Task EnsureBootstrapAuditRecordAsync(User user, int? organizationId)
    {
        try
        {
            var exists = await _context.AuditLogs
                .AsNoTracking()
                .AnyAsync(l => l.Action == "audit_bootstrap");
            if (exists) return;

            _context.AuditLogs.Add(new AuditLog
            {
                // Keep FK fields null to avoid hard failures when claims IDs
                // don't exist in local SQL user/org tables.
                OrganizationId = null,
                UserId = null,
                UserName = string.IsNullOrWhiteSpace(user.Name) ? "System" : user.Name,
                UserEmail = string.IsNullOrWhiteSpace(user.Email) ? "system@taylor-access.local" : user.Email,
                Action = "audit_bootstrap",
                EntityType = "System",
                EntityName = "AuditLogs",
                Description = "Bootstrap audit record created because audit history was empty.",
                Endpoint = "/api/v1/audit",
                HttpMethod = "GET",
                Timestamp = DateTime.UtcNow,
                Severity = "info"
            });

            await _context.SaveChangesAsync();
        }
        catch
        {
            // Never allow bootstrap creation to break audit reads.
        }
    }

    private static AuditLog MapMongoAuditLog(MongoAuditLog log) => new()
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
