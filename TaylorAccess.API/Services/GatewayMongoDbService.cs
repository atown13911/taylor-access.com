using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public class GatewayMongoDbService : IMongoDbService
{
    private readonly HttpClient _http;
    private readonly ILogger<GatewayMongoDbService> _logger;
    private readonly string _dbName;
    private readonly bool _isConnected;

    public bool IsConnected => _isConnected;

    public GatewayMongoDbService(ILogger<GatewayMongoDbService> logger, IConfiguration configuration)
    {
        _logger = logger;

        var gatewayUrl = Environment.GetEnvironmentVariable("GATEWAY_INTERNAL_URL")
            ?? configuration["GatewayInternalUrl"]
            ?? "http://inspiring-victory.railway.internal:8080";

        var apiKey = Environment.GetEnvironmentVariable("INTERNAL_API_KEY") ?? "ta-internal-2026";

        _dbName = Environment.GetEnvironmentVariable("MONGO_DB_NAME") ?? "taylor_access";

        _http = new HttpClient { BaseAddress = new Uri(gatewayUrl) };
        _http.DefaultRequestHeaders.Add("X-Internal-Key", apiKey);

        _isConnected = true;
        _logger.LogInformation("GatewayMongoDbService: routing all MongoDB operations through gateway at {Url}", gatewayUrl);
    }

    private async Task<string?> InsertAsync(string collection, BsonDocument doc)
    {
        try
        {
            var content = new StringContent(doc.ToJson(), Encoding.UTF8, "application/json");
            var res = await _http.PostAsync($"/internal/mongo/{_dbName}/{collection}", content);
            if (!res.IsSuccessStatusCode) return null;
            var json = await res.Content.ReadAsStringAsync();
            var result = JsonDocument.Parse(json);
            return result.RootElement.GetProperty("id").GetString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Gateway MongoDB insert failed for {Collection}", collection);
            return null;
        }
    }

    private async Task UpdateAsync(string collection, string id, BsonDocument updates)
    {
        try
        {
            var content = new StringContent(updates.ToJson(), Encoding.UTF8, "application/json");
            await _http.PutAsync($"/internal/mongo/{_dbName}/{collection}/{id}", content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Gateway MongoDB update failed for {Collection}/{Id}", collection, id);
        }
    }

    private async Task PushAsync(string collection, string id, BsonDocument pushDoc)
    {
        try
        {
            var content = new StringContent(pushDoc.ToJson(), Encoding.UTF8, "application/json");
            await _http.PostAsync($"/internal/mongo/{_dbName}/{collection}/push/{id}", content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Gateway MongoDB push failed for {Collection}/{Id}", collection, id);
        }
    }

    private async Task<List<T>> QueryAsync<T>(string collection, BsonDocument? filter = null, BsonDocument? sort = null, int limit = 100, int skip = 0)
    {
        try
        {
            var query = new BsonDocument
            {
                { "filter", filter ?? new BsonDocument() },
                { "sort", sort ?? new BsonDocument("_id", -1) },
                { "limit", limit },
                { "skip", skip }
            };
            var content = new StringContent(query.ToJson(), Encoding.UTF8, "application/json");
            var res = await _http.PostAsync($"/internal/mongo/{_dbName}/{collection}/query", content);
            if (!res.IsSuccessStatusCode) return new List<T>();

            var json = await res.Content.ReadAsStringAsync();
            var result = JsonDocument.Parse(json);
            var dataArray = result.RootElement.GetProperty("data");

            var items = new List<T>();
            foreach (var item in dataArray.EnumerateArray())
            {
                var bsonDoc = BsonDocument.Parse(item.GetString()!);
                items.Add(BsonSerializer.Deserialize<T>(bsonDoc));
            }
            return items;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Gateway MongoDB query failed for {Collection}", collection);
            return new List<T>();
        }
    }

    private async Task<long> CountAsync(string collection, BsonDocument? filter = null)
    {
        try
        {
            var content = new StringContent((filter ?? new BsonDocument()).ToJson(), Encoding.UTF8, "application/json");
            var res = await _http.PostAsync($"/internal/mongo/{_dbName}/{collection}/count", content);
            if (!res.IsSuccessStatusCode) return 0;
            var json = await res.Content.ReadAsStringAsync();
            var result = JsonDocument.Parse(json);
            return result.RootElement.GetProperty("count").GetInt64();
        }
        catch { return 0; }
    }

    private async Task<long> DeleteAsync(string collection, BsonDocument filter)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Delete, $"/internal/mongo/{_dbName}/{collection}")
            {
                Content = new StringContent(filter.ToJson(), Encoding.UTF8, "application/json")
            };
            var res = await _http.SendAsync(request);
            if (!res.IsSuccessStatusCode) return 0;
            var json = await res.Content.ReadAsStringAsync();
            var result = JsonDocument.Parse(json);
            return result.RootElement.GetProperty("deleted").GetInt64();
        }
        catch { return 0; }
    }

    // ========== IMongoDbService Implementation ==========

    public async Task LogAuditAsync(MongoAuditLog log)
    {
        var doc = log.ToBsonDocument();
        doc.Remove("_id");
        await InsertAsync("audit_logs", doc);
    }

    public async Task<List<MongoAuditLog>> GetAuditLogsAsync(string? entityType, int? entityId, int? userId, int? organizationId, DateTime? from, DateTime? to, int limit)
    {
        var filter = new BsonDocument();
        if (!string.IsNullOrEmpty(entityType)) filter["EntityType"] = entityType;
        if (entityId.HasValue) filter["EntityId"] = entityId.Value;
        if (userId.HasValue) filter["UserId"] = userId.Value;
        if (organizationId.HasValue) filter["OrganizationId"] = organizationId.Value;
        if (from.HasValue) filter["Timestamp"] = new BsonDocument("$gte", from.Value);
        if (to.HasValue) filter.Set("Timestamp", new BsonDocument { { "$gte", from ?? DateTime.MinValue }, { "$lte", to.Value } });

        return await QueryAsync<MongoAuditLog>("audit_logs", filter, new BsonDocument("Timestamp", -1), limit);
    }

    public async Task LogClickEventAsync(ClickEvent clickEvent)
    {
        var doc = clickEvent.ToBsonDocument();
        doc.Remove("_id");
        await InsertAsync("click_events", doc);
    }

    public async Task LogPageViewAsync(PageViewEvent pageView)
    {
        var doc = pageView.ToBsonDocument();
        doc.Remove("_id");
        await InsertAsync("page_views", doc);
    }

    public async Task<List<ClickEvent>> GetUserClicksAsync(int userId, DateTime? from, DateTime? to, int limit)
    {
        var filter = new BsonDocument("UserId", userId);
        if (from.HasValue) filter["Timestamp"] = new BsonDocument("$gte", from.Value);
        return await QueryAsync<ClickEvent>("click_events", filter, new BsonDocument("Timestamp", -1), limit);
    }

    public async Task<List<PageViewEvent>> GetUserPageViewsAsync(int userId, DateTime? from, DateTime? to, int limit)
    {
        var filter = new BsonDocument("UserId", userId);
        if (from.HasValue) filter["Timestamp"] = new BsonDocument("$gte", from.Value);
        return await QueryAsync<PageViewEvent>("page_views", filter, new BsonDocument("Timestamp", -1), limit);
    }

    public async Task<object> GetClickAnalyticsAsync(int? organizationId, DateTime? from, DateTime? to)
    {
        var clickFilter = new BsonDocument();
        var pvFilter = new BsonDocument();
        if (organizationId.HasValue) { clickFilter["OrganizationId"] = organizationId.Value; pvFilter["OrganizationId"] = organizationId.Value; }
        if (from.HasValue) { clickFilter["Timestamp"] = new BsonDocument("$gte", from.Value); pvFilter["Timestamp"] = new BsonDocument("$gte", from.Value); }

        var totalClicks = await CountAsync("click_events", clickFilter);
        var totalPageViews = await CountAsync("page_views", pvFilter);
        return new { totalClicks, totalPageViews };
    }

    public async Task<object> GetHeatmapDataAsync(string pageUrl, int? organizationId, DateTime? from, DateTime? to)
    {
        var filter = new BsonDocument("PageUrl", pageUrl);
        if (organizationId.HasValue) filter["OrganizationId"] = organizationId.Value;
        if (from.HasValue) filter["Timestamp"] = new BsonDocument("$gte", from.Value);

        var clicks = await QueryAsync<ClickEvent>("click_events", filter, null, 1000);
        return new { pageUrl, totalClicks = clicks.Count, clicks = clicks.Select(c => new { c.X, c.Y, c.ElementText, c.ElementType }) };
    }

    public async Task<string> LogSessionStartAsync(UserSession session)
    {
        var doc = session.ToBsonDocument();
        doc.Remove("_id");
        var id = await InsertAsync("user_sessions", doc);
        return id ?? "";
    }

    public async Task LogSessionEndAsync(string sessionId, string reason)
    {
        if (string.IsNullOrEmpty(sessionId)) return;
        var updates = new BsonDocument
        {
            { "LogoutTime", DateTime.UtcNow },
            { "LogoutReason", reason }
        };
        await UpdateAsync("user_sessions", sessionId, updates);
    }

    public async Task<List<UserSession>> GetUserSessionsAsync(int? userId, DateTime? from, DateTime? to, int limit)
    {
        var filter = new BsonDocument();
        if (userId.HasValue) filter["UserId"] = userId.Value;
        if (from.HasValue) filter["LoginTime"] = new BsonDocument("$gte", from.Value);
        return await QueryAsync<UserSession>("user_sessions", filter, new BsonDocument("LoginTime", -1), limit);
    }

    public async Task<UserSession?> GetActiveSessionAsync(string sessionId)
    {
        var results = await QueryAsync<UserSession>("user_sessions", new BsonDocument("_id", new ObjectId(sessionId)), null, 1);
        return results.FirstOrDefault();
    }

    public async Task<MongoJobLog> InsertJobLogAsync(MongoJobLog log)
    {
        var doc = log.ToBsonDocument();
        doc.Remove("_id");
        var id = await InsertAsync("scheduled_job_logs", doc);
        log.Id = id;
        return log;
    }

    public async Task UpdateJobLogAsync(string id, string status, long? durationMs, int? recordsAffected, string? resultMessage, string? errorDetails, int? apiStatusCode)
    {
        if (string.IsNullOrEmpty(id)) return;
        var updates = new BsonDocument
        {
            { "Status", status },
            { "CompletedAt", DateTime.UtcNow }
        };
        if (durationMs.HasValue) updates["DurationMs"] = durationMs.Value;
        if (recordsAffected.HasValue) updates["RecordsAffected"] = recordsAffected.Value;
        if (resultMessage != null) updates["ResultMessage"] = resultMessage;
        if (errorDetails != null) updates["ErrorDetails"] = errorDetails;
        if (apiStatusCode.HasValue) updates["ApiStatusCode"] = apiStatusCode.Value;
        await UpdateAsync("scheduled_job_logs", id, updates);
    }

    public async Task AppendApiRequestAsync(string id, ApiRequestEntry entry)
    {
        if (string.IsNullOrEmpty(id)) return;
        var pushDoc = new BsonDocument("ApiRequests", entry.ToBsonDocument());
        await PushAsync("scheduled_job_logs", id, pushDoc);
    }

    public async Task<(long total, List<MongoJobLog> data)> GetJobLogsAsync(string? jobKey, string? status, DateTime? from, DateTime? to, int limit, int offset)
    {
        var filter = new BsonDocument();
        if (!string.IsNullOrEmpty(jobKey)) filter["JobKey"] = jobKey;
        if (!string.IsNullOrEmpty(status)) filter["Status"] = status;
        if (from.HasValue) filter["StartedAt"] = new BsonDocument("$gte", from.Value);
        if (to.HasValue) filter.Set("StartedAt", new BsonDocument { { "$gte", from ?? DateTime.MinValue }, { "$lte", to.Value.AddDays(1) } });

        var total = await CountAsync("scheduled_job_logs", filter);
        var data = await QueryAsync<MongoJobLog>("scheduled_job_logs", filter, new BsonDocument("StartedAt", -1), limit, offset);
        return (total, data);
    }

    public async Task<MongoJobLog?> GetLastRunAsync(string jobKey)
    {
        var results = await QueryAsync<MongoJobLog>("scheduled_job_logs", new BsonDocument("JobKey", jobKey), new BsonDocument("StartedAt", -1), 1);
        return results.FirstOrDefault();
    }

    public async Task<Dictionary<string, MongoJobLog>> GetLastRunsAsync(IEnumerable<string> jobKeys)
    {
        var filter = new BsonDocument("JobKey", new BsonDocument("$in", new BsonArray(jobKeys)));
        var all = await QueryAsync<MongoJobLog>("scheduled_job_logs", filter, new BsonDocument("StartedAt", -1), 500);
        var result = new Dictionary<string, MongoJobLog>();
        foreach (var log in all)
        {
            if (!result.ContainsKey(log.JobKey))
                result[log.JobKey] = log;
        }
        return result;
    }

    public async Task<MongoJobLog?> GetRunningLogAsync(string jobKey)
    {
        var filter = new BsonDocument { { "JobKey", jobKey }, { "Status", "Running" } };
        var results = await QueryAsync<MongoJobLog>("scheduled_job_logs", filter, new BsonDocument("StartedAt", -1), 1);
        return results.FirstOrDefault();
    }

    public async Task<(int runs, int successes, int failures)> GetLogStatsAsync(DateTime since)
    {
        var sinceFilter = new BsonDocument("StartedAt", new BsonDocument("$gte", since));
        var runs = (int)await CountAsync("scheduled_job_logs", sinceFilter);

        var successFilter = new BsonDocument { { "StartedAt", new BsonDocument("$gte", since) }, { "Status", "Success" } };
        var successes = (int)await CountAsync("scheduled_job_logs", successFilter);

        var failFilter = new BsonDocument { { "StartedAt", new BsonDocument("$gte", since) }, { "Status", "Failed" } };
        var failures = (int)await CountAsync("scheduled_job_logs", failFilter);

        return (runs, successes, failures);
    }

    public async Task<long> DeleteOldLogsAsync(DateTime cutoff)
    {
        return await DeleteAsync("scheduled_job_logs", new BsonDocument("StartedAt", new BsonDocument("$lt", cutoff)));
    }

    public async Task<int> CleanupStaleLogsAsync(IEnumerable<string> activeJobKeys)
    {
        var filter = new BsonDocument("Status", "Running");
        var staleLogs = await QueryAsync<MongoJobLog>("scheduled_job_logs", filter, null, 500);
        var activeSet = activeJobKeys.ToHashSet();
        var cleaned = 0;

        foreach (var log in staleLogs)
        {
            if (activeSet.Contains(log.JobKey) || string.IsNullOrEmpty(log.Id)) continue;
            var updates = new BsonDocument
            {
                { "Status", "Failed" },
                { "CompletedAt", DateTime.UtcNow },
                { "ResultMessage", "Interrupted (cleaned up as stale)" }
            };
            await UpdateAsync("scheduled_job_logs", log.Id, updates);
            cleaned++;
        }
        return cleaned;
    }
}
