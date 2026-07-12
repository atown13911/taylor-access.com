using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace TaylorAccess.API.Services;

public sealed class ZoomDirectUserMetric
{
    public string? ZoomUserId { get; set; }
    public string? Email { get; set; }
    public string? DisplayName { get; set; }
    public int TotalCalls { get; set; }
    public double TotalCallMinutes { get; set; }
    public int SmsSessionCount { get; set; }
    public int MeetingsHosted { get; set; }
    public int MeetingsJoined { get; set; }
    public double MeetingMinutes { get; set; }
}

public sealed class ZoomDirectMetricsResult
{
    public bool Success { get; init; }
    public string? Error { get; init; }
    public int CallLogRows { get; init; }
    public int UserRows { get; init; }
    public int SmsRows { get; init; }
    public List<ZoomDirectUserMetric> Metrics { get; init; } = new();
}

/// <summary>
/// Pulls Zoom Phone / Meetings metrics straight from Zoom APIs using Access S2S credentials.
/// Bypasses Taylor CRM for performance-review Zoom columns.
/// </summary>
public class ZoomDirectMetricsService
{
    private readonly LocalIntegrationStatusService _integrations;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ZoomDirectMetricsService> _logger;

    public ZoomDirectMetricsService(
        LocalIntegrationStatusService integrations,
        IHttpClientFactory httpClientFactory,
        ILogger<ZoomDirectMetricsService> logger)
    {
        _integrations = integrations;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<ZoomDirectMetricsResult> GetUserMetricsAsync(
        DateTime fromUtc,
        DateTime toUtc,
        int? orgId = null,
        CancellationToken cancellationToken = default)
    {
        var token = await _integrations.GetValidZoomAccessTokenAsync(orgId, cancellationToken);
        if (string.IsNullOrWhiteSpace(token))
        {
            return new ZoomDirectMetricsResult
            {
                Success = false,
                Error = "No valid Zoom S2S token available in Access"
            };
        }

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(25);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var fromDate = fromUtc.Date.ToString("yyyy-MM-dd");
        var toDate = toUtc.Date.ToString("yyyy-MM-dd");

        try
        {
            var users = await ListUsersAsync(client, cancellationToken);
            var emailByZoomId = users
                .Where(u => !string.IsNullOrWhiteSpace(u.Id) && !string.IsNullOrWhiteSpace(u.Email))
                .ToDictionary(u => u.Id!, u => u.Email!, StringComparer.OrdinalIgnoreCase);
            var nameByZoomId = users
                .Where(u => !string.IsNullOrWhiteSpace(u.Id))
                .ToDictionary(
                    u => u.Id!,
                    u => string.IsNullOrWhiteSpace(u.DisplayName) ? u.Email ?? u.Id! : u.DisplayName!,
                    StringComparer.OrdinalIgnoreCase);

            var metricsByKey = new Dictionary<string, ZoomDirectUserMetric>(StringComparer.OrdinalIgnoreCase);
            ZoomDirectUserMetric Ensure(string key, string? zoomUserId, string? email, string? displayName)
            {
                if (metricsByKey.TryGetValue(key, out var existing))
                {
                    if (string.IsNullOrWhiteSpace(existing.ZoomUserId) && !string.IsNullOrWhiteSpace(zoomUserId))
                        existing.ZoomUserId = zoomUserId;
                    if (string.IsNullOrWhiteSpace(existing.Email) && !string.IsNullOrWhiteSpace(email))
                        existing.Email = email;
                    if (string.IsNullOrWhiteSpace(existing.DisplayName) && !string.IsNullOrWhiteSpace(displayName))
                        existing.DisplayName = displayName;
                    return existing;
                }

                var row = new ZoomDirectUserMetric
                {
                    ZoomUserId = zoomUserId,
                    Email = email,
                    DisplayName = displayName
                };
                metricsByKey[key] = row;
                return row;
            }

            var callRows = 0;
            var callLogs = await FetchCallHistoryAsync(client, fromDate, toDate, cancellationToken);
            foreach (var log in callLogs)
            {
                callRows++;
                var ownerId = log.OwnerId;
                var email = FirstEmail(
                    ownerId != null && emailByZoomId.TryGetValue(ownerId, out var mapped) ? mapped : null,
                    log.CallerEmail,
                    log.CalleeEmail);
                var minutes = Math.Max(0, log.DurationSeconds) / 60d;
                var displayName = ownerId != null && nameByZoomId.TryGetValue(ownerId, out var n) ? n : null;
                var key = !string.IsNullOrWhiteSpace(email)
                    ? email!
                    : (!string.IsNullOrWhiteSpace(ownerId) ? $"id:{ownerId}" : null);
                if (string.IsNullOrWhiteSpace(key)) continue;

                var row = Ensure(key, ownerId, email, displayName);
                row.TotalCalls += 1;
                row.TotalCallMinutes += minutes;
            }

            var smsRows = 0;
            // Sample phone users with emails — keep bounded for latency.
            foreach (var user in users.Where(u => !string.IsNullOrWhiteSpace(u.Id) && !string.IsNullOrWhiteSpace(u.Email)).Take(40))
            {
                try
                {
                    var url =
                        $"https://api.zoom.us/v2/phone/users/{Uri.EscapeDataString(user.Id!)}/sms/sessions?from={fromDate}&to={toDate}&page_size=100";
                    using var smsRes = await client.GetAsync(url, cancellationToken);
                    if (!smsRes.IsSuccessStatusCode) continue;
                    await using var stream = await smsRes.Content.ReadAsStreamAsync(cancellationToken);
                    using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                    if (!doc.RootElement.TryGetProperty("sms_sessions", out var sessions)
                        || sessions.ValueKind != JsonValueKind.Array)
                        continue;

                    var count = sessions.GetArrayLength();
                    if (count <= 0) continue;
                    smsRows += count;
                    var row = Ensure(user.Email!, user.Id, user.Email, user.DisplayName);
                    row.SmsSessionCount += count;
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Zoom SMS sessions pull failed for {UserId}", user.Id);
                }
            }

            // Meeting report (account-level daily users) — best-effort for hosted minutes.
            try
            {
                var reportUrl =
                    $"https://api.zoom.us/v2/report/users?from={fromDate}&to={toDate}&page_size=300&type=active";
                using var reportRes = await client.GetAsync(reportUrl, cancellationToken);
                if (reportRes.IsSuccessStatusCode)
                {
                    await using var stream = await reportRes.Content.ReadAsStreamAsync(cancellationToken);
                    using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                    if (doc.RootElement.TryGetProperty("users", out var reportUsers)
                        && reportUsers.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var u in reportUsers.EnumerateArray())
                        {
                            var email = ReadString(u, "email")?.Trim().ToLowerInvariant();
                            if (string.IsNullOrWhiteSpace(email)) continue;
                            var meetings = ReadInt(u, "meetings");
                            var participants = ReadInt(u, "participants");
                            var meetingMinutes = ReadDouble(u, "meeting_minutes");
                            if (meetings <= 0 && participants <= 0 && meetingMinutes <= 0) continue;
                            var row = Ensure(email!, ReadString(u, "id"), email, ReadString(u, "user_name"));
                            row.MeetingsHosted = Math.Max(row.MeetingsHosted, meetings);
                            row.MeetingsJoined = Math.Max(row.MeetingsJoined, Math.Max(participants, meetings));
                            row.MeetingMinutes = Math.Max(row.MeetingMinutes, meetingMinutes);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Zoom report/users pull failed");
            }

            var metrics = metricsByKey.Values
                .Where(m => m.TotalCalls > 0 || m.SmsSessionCount > 0 || m.MeetingsHosted > 0 || m.MeetingMinutes > 0)
                .OrderByDescending(m => m.TotalCalls)
                .ToList();

            return new ZoomDirectMetricsResult
            {
                Success = true,
                CallLogRows = callRows,
                UserRows = users.Count,
                SmsRows = smsRows,
                Metrics = metrics
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Direct Zoom metrics pull failed");
            return new ZoomDirectMetricsResult
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    private async Task<List<ZoomUserLite>> ListUsersAsync(HttpClient client, CancellationToken cancellationToken)
    {
        var users = new List<ZoomUserLite>();
        string? nextToken = null;
        var page = 1;
        do
        {
            var url = $"https://api.zoom.us/v2/users?page_size=300&status=active&page_number={page}";
            if (!string.IsNullOrWhiteSpace(nextToken))
                url += $"&next_page_token={Uri.EscapeDataString(nextToken)}";

            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode) break;
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (doc.RootElement.TryGetProperty("users", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var u in arr.EnumerateArray())
                {
                    var id = ReadString(u, "id");
                    var email = ReadString(u, "email")?.Trim().ToLowerInvariant();
                    var first = ReadString(u, "first_name") ?? "";
                    var last = ReadString(u, "last_name") ?? "";
                    var display = $"{first} {last}".Trim();
                    if (string.IsNullOrWhiteSpace(display))
                        display = ReadString(u, "display_name") ?? email ?? id ?? "";
                    if (string.IsNullOrWhiteSpace(id) && string.IsNullOrWhiteSpace(email)) continue;
                    users.Add(new ZoomUserLite(id, email, display));
                }
            }

            nextToken = doc.RootElement.TryGetProperty("next_page_token", out var npt)
                ? npt.GetString()
                : null;
            page++;
        } while (!string.IsNullOrWhiteSpace(nextToken) && page <= 10);

        return users;
    }

    private async Task<List<ZoomCallLite>> FetchCallHistoryAsync(
        HttpClient client,
        string fromDate,
        string toDate,
        CancellationToken cancellationToken)
    {
        var results = new List<ZoomCallLite>();
        string? nextToken = null;
        var pages = 0;
        var started = DateTime.UtcNow;

        do
        {
            if ((DateTime.UtcNow - started).TotalSeconds > 40)
                break;

            var url =
                $"https://api.zoom.us/v2/phone/call_history?from={fromDate}&to={toDate}&page_size=300";
            if (!string.IsNullOrWhiteSpace(nextToken))
                url += $"&next_page_token={Uri.EscapeDataString(nextToken)}";

            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Zoom call_history HTTP {Status}: {Body}", (int)response.StatusCode,
                    body[..Math.Min(body.Length, 180)]);
                break;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (doc.RootElement.TryGetProperty("call_logs", out var logs) && logs.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in logs.EnumerateArray())
                {
                    results.Add(new ZoomCallLite(
                        ReadString(item, "owner", "id")
                            ?? ReadString(item, "user_id")
                            ?? ReadString(item, "owner_id"),
                        ReadString(item, "caller_email"),
                        ReadString(item, "callee_email"),
                        ReadInt(item, "duration")));
                }
            }

            nextToken = doc.RootElement.TryGetProperty("next_page_token", out var npt)
                ? npt.GetString()
                : null;
            pages++;
        } while (!string.IsNullOrWhiteSpace(nextToken) && pages < 40);

        return results;
    }

    private static string? FirstEmail(params string?[] values)
    {
        foreach (var v in values)
        {
            if (!string.IsNullOrWhiteSpace(v))
                return v.Trim().ToLowerInvariant();
        }
        return null;
    }

    private static string? ReadString(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Object) return null;
        if (!el.TryGetProperty(name, out var prop)) return null;
        return prop.ValueKind == JsonValueKind.String ? prop.GetString() : prop.ToString();
    }

    private static string? ReadString(JsonElement el, string nestedObject, string nestedProp)
    {
        if (el.ValueKind != JsonValueKind.Object) return null;
        if (!el.TryGetProperty(nestedObject, out var obj) || obj.ValueKind != JsonValueKind.Object) return null;
        return ReadString(obj, nestedProp);
    }

    private static int ReadInt(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var prop)) return 0;
        if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt32(out var i)) return i;
        if (prop.ValueKind == JsonValueKind.String && int.TryParse(prop.GetString(), out var parsed)) return parsed;
        return 0;
    }

    private static double ReadDouble(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var prop)) return 0;
        if (prop.ValueKind == JsonValueKind.Number && prop.TryGetDouble(out var d)) return d;
        if (prop.ValueKind == JsonValueKind.String && double.TryParse(prop.GetString(), out var parsed)) return parsed;
        return 0;
    }

    private sealed record ZoomUserLite(string? Id, string? Email, string? DisplayName);
    private sealed record ZoomCallLite(string? OwnerId, string? CallerEmail, string? CalleeEmail, int DurationSeconds);
}
