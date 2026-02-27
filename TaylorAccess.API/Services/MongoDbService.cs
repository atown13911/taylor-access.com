using MongoDB.Driver;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public interface IMongoDbService
{
    Task LogClickEventAsync(ClickEvent clickEvent);
    Task LogPageViewAsync(PageViewEvent pageView);
    Task<List<ClickEvent>> GetUserClicksAsync(int userId, DateTime? from = null, DateTime? to = null, int limit = 100);
    Task<List<PageViewEvent>> GetUserPageViewsAsync(int userId, DateTime? from = null, DateTime? to = null, int limit = 100);
    Task<object> GetClickAnalyticsAsync(int? organizationId = null, DateTime? from = null, DateTime? to = null);
    Task<object> GetHeatmapDataAsync(string pageUrl, int? organizationId = null, DateTime? from = null, DateTime? to = null);

    // Audit log methods
    Task LogAuditAsync(MongoAuditLog log);
    Task<List<MongoAuditLog>> GetAuditLogsAsync(string? entityType = null, int? entityId = null, int? userId = null, int? organizationId = null, DateTime? from = null, DateTime? to = null, int limit = 100);

    // Scheduled job log methods
    Task<MongoJobLog> InsertJobLogAsync(MongoJobLog log);
    Task UpdateJobLogAsync(string id, string status, long? durationMs, int? recordsAffected, string? resultMessage, string? errorDetails, int? apiStatusCode);
    Task AppendApiRequestAsync(string id, ApiRequestEntry entry);
    Task<(long total, List<MongoJobLog> data)> GetJobLogsAsync(string? jobKey, string? status, DateTime? from, DateTime? to, int limit, int offset);
    Task<MongoJobLog?> GetLastRunAsync(string jobKey);
    Task<Dictionary<string, MongoJobLog>> GetLastRunsAsync(IEnumerable<string> jobKeys);
    Task<MongoJobLog?> GetRunningLogAsync(string jobKey);
    Task<(int runs, int successes, int failures)> GetLogStatsAsync(DateTime since);
    Task<long> DeleteOldLogsAsync(DateTime cutoff);
    Task<int> CleanupStaleLogsAsync(IEnumerable<string> activeJobKeys);

    bool IsConnected { get; }
}

public class ApiRequestEntry
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string Method { get; set; } = "GET";
    public string Url { get; set; } = string.Empty;
    public string? RequestBody { get; set; }
    public int StatusCode { get; set; }
    public string? ResponsePreview { get; set; }
    public long DurationMs { get; set; }
}

public class MongoJobLog
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }
    public string JobKey { get; set; } = string.Empty;
    public string JobName { get; set; } = string.Empty;
    public string Status { get; set; } = "Running";
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public long? DurationMs { get; set; }
    public int? RecordsAffected { get; set; }
    public string? ResultMessage { get; set; }
    public string? ErrorDetails { get; set; }
    public int? ApiStatusCode { get; set; }
    public List<ApiRequestEntry> ApiRequests { get; set; } = new();
}

/// <summary>
/// MongoDB audit log document
/// </summary>
public class MongoAuditLog
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }
    public int? OrganizationId { get; set; }
    public int? UserId { get; set; }
    public string? UserName { get; set; }
    public string? UserEmail { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public int? EntityId { get; set; }
    public string? EntityName { get; set; }
    public string? OldValues { get; set; }
    public string? NewValues { get; set; }
    public string? Changes { get; set; }
    public string? Description { get; set; }
    public string? Module { get; set; }
    public string? Endpoint { get; set; }
    public string? HttpMethod { get; set; }
    public int? HttpStatusCode { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string Severity { get; set; } = "info";
}

public class MongoDbService : IMongoDbService
{
    private readonly ILogger<MongoDbService> _logger;
    private readonly IMongoDatabase? _database;
    private readonly IMongoCollection<MongoAuditLog>? _auditLogs;
    private readonly IMongoCollection<ClickEvent>? _clickEvents;
    private readonly IMongoCollection<PageViewEvent>? _pageViews;
    private readonly IMongoCollection<MongoJobLog>? _jobLogs;
    private readonly bool _isConnected;

    public bool IsConnected => _isConnected;

    public MongoDbService(ILogger<MongoDbService> logger, IConfiguration configuration)
    {
        _logger = logger;

        var connectionString = Environment.GetEnvironmentVariable("MONGODB_URL")
            ?? configuration.GetConnectionString("MongoDB")
            ?? "mongodb://mongo:kKDhBeGiRQeUCWlIDTqfmzLINycCDvNf@caboose.proxy.rlwy.net:24075";

        if (!connectionString.Contains("authSource"))
            connectionString += (connectionString.Contains('?') ? "&" : "?") + "authSource=admin";

        _logger.LogInformation("MongoDB: Attempting connection...");

        try
        {
            var settings = MongoClientSettings.FromConnectionString(connectionString);
            settings.ServerSelectionTimeout = TimeSpan.FromSeconds(3);
            settings.ConnectTimeout = TimeSpan.FromSeconds(3);
            settings.SocketTimeout = TimeSpan.FromSeconds(5);

            var client = new MongoClient(settings);
            var connUrl = new MongoUrl(connectionString);
            var dbName = !string.IsNullOrEmpty(connUrl.DatabaseName) ? connUrl.DatabaseName : "test";
            _database = client.GetDatabase(dbName);

            // Don't ping on startup -- lazy connect on first write
            _auditLogs = _database.GetCollection<MongoAuditLog>("audit_logs");

            _clickEvents = _database.GetCollection<ClickEvent>("click_events");
            _pageViews = _database.GetCollection<PageViewEvent>("page_views");
            _jobLogs = _database.GetCollection<MongoJobLog>("scheduled_job_logs");

            // Create indexes for fast job log queries
            try
            {
                var indexKeys = Builders<MongoJobLog>.IndexKeys
                    .Ascending(l => l.JobKey)
                    .Descending(l => l.StartedAt);
                _jobLogs.Indexes.CreateOne(new CreateIndexModel<MongoJobLog>(indexKeys));

                var statusIndex = Builders<MongoJobLog>.IndexKeys.Ascending(l => l.Status);
                _jobLogs.Indexes.CreateOne(new CreateIndexModel<MongoJobLog>(statusIndex));
            }
            catch { }

            _isConnected = true;
            _logger.LogInformation("✅ MongoDB connected successfully -- audit logs will be stored in MongoDB");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "❌ Failed to connect to MongoDB -- falling back to PostgreSQL only. Error: {Message}", ex.Message);
            _isConnected = false;
        }
    }

    // ========== AUDIT LOGS ==========

    public async Task LogAuditAsync(MongoAuditLog log)
    {
        if (_auditLogs == null) return;
        try
        {
            await _auditLogs.InsertOneAsync(log);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log to MongoDB");
        }
    }

    public async Task<List<MongoAuditLog>> GetAuditLogsAsync(string? entityType = null, int? entityId = null, int? userId = null, int? organizationId = null, DateTime? from = null, DateTime? to = null, int limit = 100)
    {
        if (_auditLogs == null) return new List<MongoAuditLog>();
        try
        {
            var builder = Builders<MongoAuditLog>.Filter;
            var filter = builder.Empty;

            if (!string.IsNullOrEmpty(entityType)) filter &= builder.Eq(a => a.EntityType, entityType);
            if (entityId.HasValue) filter &= builder.Eq(a => a.EntityId, entityId);
            if (userId.HasValue) filter &= builder.Eq(a => a.UserId, userId);
            if (organizationId.HasValue) filter &= builder.Eq(a => a.OrganizationId, organizationId);
            if (from.HasValue) filter &= builder.Gte(a => a.Timestamp, from.Value);
            if (to.HasValue) filter &= builder.Lte(a => a.Timestamp, to.Value);

            return await _auditLogs
                .Find(filter)
                .SortByDescending(a => a.Timestamp)
                .Limit(limit)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read audit logs from MongoDB");
            return new List<MongoAuditLog>();
        }
    }

    // ========== EVENT TRACKING ==========

    public async Task LogClickEventAsync(ClickEvent clickEvent)
    {
        if (_clickEvents == null) return;
        try { await _clickEvents.InsertOneAsync(clickEvent); }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to log click event"); }
    }

    public async Task LogPageViewAsync(PageViewEvent pageView)
    {
        if (_pageViews == null) return;
        try { await _pageViews.InsertOneAsync(pageView); }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to log page view"); }
    }

    public async Task<List<ClickEvent>> GetUserClicksAsync(int userId, DateTime? from = null, DateTime? to = null, int limit = 100)
    {
        if (_clickEvents == null) return new List<ClickEvent>();
        try
        {
            var filter = Builders<ClickEvent>.Filter.Eq(c => c.UserId, userId);
            if (from.HasValue) filter &= Builders<ClickEvent>.Filter.Gte(c => c.Timestamp, from.Value);
            if (to.HasValue) filter &= Builders<ClickEvent>.Filter.Lte(c => c.Timestamp, to.Value);
            return await _clickEvents.Find(filter).SortByDescending(c => c.Timestamp).Limit(limit).ToListAsync();
        }
        catch { return new List<ClickEvent>(); }
    }

    public async Task<List<PageViewEvent>> GetUserPageViewsAsync(int userId, DateTime? from = null, DateTime? to = null, int limit = 100)
    {
        if (_pageViews == null) return new List<PageViewEvent>();
        try
        {
            var filter = Builders<PageViewEvent>.Filter.Eq(p => p.UserId, userId);
            if (from.HasValue) filter &= Builders<PageViewEvent>.Filter.Gte(p => p.Timestamp, from.Value);
            if (to.HasValue) filter &= Builders<PageViewEvent>.Filter.Lte(p => p.Timestamp, to.Value);
            return await _pageViews.Find(filter).SortByDescending(p => p.Timestamp).Limit(limit).ToListAsync();
        }
        catch { return new List<PageViewEvent>(); }
    }

    public async Task<object> GetClickAnalyticsAsync(int? organizationId = null, DateTime? from = null, DateTime? to = null)
    {
        if (_clickEvents == null || _pageViews == null)
            return new { totalClicks = 0, totalPageViews = 0, message = "MongoDB not connected" };
        try
        {
            var clickFilter = Builders<ClickEvent>.Filter.Empty;
            var pvFilter = Builders<PageViewEvent>.Filter.Empty;
            if (organizationId.HasValue)
            {
                clickFilter = Builders<ClickEvent>.Filter.Eq(c => c.OrganizationId, organizationId);
                pvFilter = Builders<PageViewEvent>.Filter.Eq(p => p.OrganizationId, organizationId);
            }
            if (from.HasValue)
            {
                clickFilter &= Builders<ClickEvent>.Filter.Gte(c => c.Timestamp, from.Value);
                pvFilter &= Builders<PageViewEvent>.Filter.Gte(p => p.Timestamp, from.Value);
            }

            var totalClicks = await _clickEvents.CountDocumentsAsync(clickFilter);
            var totalPageViews = await _pageViews.CountDocumentsAsync(pvFilter);

            return new { totalClicks, totalPageViews };
        }
        catch { return new { totalClicks = 0, totalPageViews = 0 }; }
    }

    public async Task<object> GetHeatmapDataAsync(string pageUrl, int? organizationId = null, DateTime? from = null, DateTime? to = null)
    {
        if (_clickEvents == null) return new { pageUrl, totalClicks = 0 };
        try
        {
            var filter = Builders<ClickEvent>.Filter.Eq(c => c.PageUrl, pageUrl);
            if (organizationId.HasValue) filter &= Builders<ClickEvent>.Filter.Eq(c => c.OrganizationId, organizationId);
            if (from.HasValue) filter &= Builders<ClickEvent>.Filter.Gte(c => c.Timestamp, from.Value);

            var clicks = await _clickEvents.Find(filter).Limit(1000).ToListAsync();
            var totalClicks = clicks.Count;

            return new { pageUrl, totalClicks, clicks = clicks.Select(c => new { c.X, c.Y, c.ElementText, c.ElementType }) };
        }
        catch { return new { pageUrl, totalClicks = 0 }; }
    }

    // ========== SCHEDULED JOB LOGS ==========

    public async Task<MongoJobLog> InsertJobLogAsync(MongoJobLog log)
    {
        if (_jobLogs == null) return log;
        try { await _jobLogs.InsertOneAsync(log); }
        catch (Exception ex) { _logger.LogError(ex, "Failed to insert job log to MongoDB"); }
        return log;
    }

    public async Task UpdateJobLogAsync(string id, string status, long? durationMs, int? recordsAffected, string? resultMessage, string? errorDetails, int? apiStatusCode)
    {
        if (_jobLogs == null || string.IsNullOrEmpty(id)) return;
        try
        {
            var update = Builders<MongoJobLog>.Update
                .Set(l => l.Status, status)
                .Set(l => l.CompletedAt, DateTime.UtcNow);
            if (durationMs.HasValue) update = update.Set(l => l.DurationMs, durationMs);
            if (recordsAffected.HasValue) update = update.Set(l => l.RecordsAffected, recordsAffected);
            if (resultMessage != null) update = update.Set(l => l.ResultMessage, resultMessage);
            if (errorDetails != null) update = update.Set(l => l.ErrorDetails, errorDetails);
            if (apiStatusCode.HasValue) update = update.Set(l => l.ApiStatusCode, apiStatusCode);

            await _jobLogs.UpdateOneAsync(
                Builders<MongoJobLog>.Filter.Eq(l => l.Id, id),
                update);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to update job log in MongoDB"); }
    }

    public async Task AppendApiRequestAsync(string id, ApiRequestEntry entry)
    {
        if (_jobLogs == null || string.IsNullOrEmpty(id)) return;
        try
        {
            var update = Builders<MongoJobLog>.Update
                .Push(l => l.ApiRequests, entry)
                .Set(l => l.ApiStatusCode, entry.StatusCode);
            await _jobLogs.UpdateOneAsync(Builders<MongoJobLog>.Filter.Eq(l => l.Id, id), update);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to append API request to MongoDB"); }
    }

    public async Task<(long total, List<MongoJobLog> data)> GetJobLogsAsync(string? jobKey, string? status, DateTime? from, DateTime? to, int limit, int offset)
    {
        if (_jobLogs == null) return (0, new List<MongoJobLog>());
        try
        {
            var filter = Builders<MongoJobLog>.Filter.Empty;
            if (!string.IsNullOrEmpty(jobKey)) filter &= Builders<MongoJobLog>.Filter.Eq(l => l.JobKey, jobKey);
            if (!string.IsNullOrEmpty(status)) filter &= Builders<MongoJobLog>.Filter.Eq(l => l.Status, status);
            if (from.HasValue) filter &= Builders<MongoJobLog>.Filter.Gte(l => l.StartedAt, from.Value);
            if (to.HasValue) filter &= Builders<MongoJobLog>.Filter.Lte(l => l.StartedAt, to.Value.AddDays(1));

            var total = await _jobLogs.CountDocumentsAsync(filter);
            var data = await _jobLogs.Find(filter)
                .SortByDescending(l => l.StartedAt)
                .Skip(offset)
                .Limit(limit)
                .ToListAsync();
            return (total, data);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to query job logs from MongoDB"); return (0, new List<MongoJobLog>()); }
    }

    public async Task<MongoJobLog?> GetLastRunAsync(string jobKey)
    {
        if (_jobLogs == null) return null;
        try
        {
            return await _jobLogs.Find(Builders<MongoJobLog>.Filter.Eq(l => l.JobKey, jobKey))
                .SortByDescending(l => l.StartedAt)
                .Limit(1)
                .FirstOrDefaultAsync();
        }
        catch { return null; }
    }

    public async Task<Dictionary<string, MongoJobLog>> GetLastRunsAsync(IEnumerable<string> jobKeys)
    {
        if (_jobLogs == null) return new Dictionary<string, MongoJobLog>();
        try
        {
            var filter = Builders<MongoJobLog>.Filter.In(l => l.JobKey, jobKeys);
            var all = await _jobLogs.Find(filter).SortByDescending(l => l.StartedAt).ToListAsync();
            var result = new Dictionary<string, MongoJobLog>();
            foreach (var log in all)
            {
                if (!result.ContainsKey(log.JobKey))
                    result[log.JobKey] = log;
            }
            return result;
        }
        catch { return new Dictionary<string, MongoJobLog>(); }
    }

    public async Task<MongoJobLog?> GetRunningLogAsync(string jobKey)
    {
        if (_jobLogs == null) return null;
        try
        {
            var filter = Builders<MongoJobLog>.Filter.Eq(l => l.JobKey, jobKey)
                       & Builders<MongoJobLog>.Filter.Eq(l => l.Status, "Running");
            return await _jobLogs.Find(filter).SortByDescending(l => l.StartedAt).Limit(1).FirstOrDefaultAsync();
        }
        catch { return null; }
    }

    public async Task<(int runs, int successes, int failures)> GetLogStatsAsync(DateTime since)
    {
        if (_jobLogs == null) return (0, 0, 0);
        try
        {
            var sinceFilter = Builders<MongoJobLog>.Filter.Gte(l => l.StartedAt, since);
            var runs = (int)await _jobLogs.CountDocumentsAsync(sinceFilter);
            var successes = (int)await _jobLogs.CountDocumentsAsync(sinceFilter & Builders<MongoJobLog>.Filter.Eq(l => l.Status, "Success"));
            var failures = (int)await _jobLogs.CountDocumentsAsync(sinceFilter & Builders<MongoJobLog>.Filter.Eq(l => l.Status, "Failed"));
            return (runs, successes, failures);
        }
        catch { return (0, 0, 0); }
    }

    public async Task<long> DeleteOldLogsAsync(DateTime cutoff)
    {
        if (_jobLogs == null) return 0;
        try
        {
            var result = await _jobLogs.DeleteManyAsync(Builders<MongoJobLog>.Filter.Lt(l => l.StartedAt, cutoff));
            return result.DeletedCount;
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to delete old job logs from MongoDB"); return 0; }
    }

    public async Task<int> CleanupStaleLogsAsync(IEnumerable<string> activeJobKeys)
    {
        if (_jobLogs == null) return 0;
        try
        {
            var runningFilter = Builders<MongoJobLog>.Filter.Eq(l => l.Status, "Running");
            var staleLogs = await _jobLogs.Find(runningFilter).ToListAsync();
            var activeSet = activeJobKeys.ToHashSet();
            var cleaned = 0;
            foreach (var log in staleLogs)
            {
                if (activeSet.Contains(log.JobKey)) continue;
                var update = Builders<MongoJobLog>.Update
                    .Set(l => l.Status, "Failed")
                    .Set(l => l.CompletedAt, DateTime.UtcNow)
                    .Set(l => l.ResultMessage, "Interrupted (cleaned up as stale)");
                await _jobLogs.UpdateOneAsync(Builders<MongoJobLog>.Filter.Eq(l => l.Id, log.Id), update);
                cleaned++;
            }
            return cleaned;
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to cleanup stale job logs"); return 0; }
    }
}

