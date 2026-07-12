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
    public int InboundCalls { get; set; }
    public int OutboundCalls { get; set; }
    public int MissedCalls { get; set; }
    public double TotalCallMinutes { get; set; }
    public int SmsSessionCount { get; set; }
    public int MeetingsHosted { get; set; }
    public int MeetingsJoined { get; set; }
    public double MeetingMinutes { get; set; }
    public int Voicemails { get; set; }
    public double VoicemailMinutes { get; set; }
    public int PhoneRecordings { get; set; }
    public double RecordingMinutes { get; set; }
}

public sealed class ZoomDirectMetricsResult
{
    public bool Success { get; init; }
    public string? Error { get; init; }
    public int CallLogRows { get; init; }
    public int UserRows { get; init; }
    public int SmsRows { get; init; }
    public int SmsUsersSynced { get; init; }
    public int SmsUsersTotal { get; init; }
    public int CallPages { get; init; }
    public bool SmsComplete { get; init; }
    public bool CallsComplete { get; init; }
    public List<ZoomDirectUserMetric> Metrics { get; init; } = new();
}

/// <summary>
/// Pulls Zoom Phone / Meetings metrics straight from Zoom APIs using Access S2S credentials.
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
        client.Timeout = TimeSpan.FromSeconds(120);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var fromDate = fromUtc.Date.ToString("yyyy-MM-dd");
        var toDate = toUtc.Date.ToString("yyyy-MM-dd");
        var budgetStarted = DateTime.UtcNow;

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

            var (callLogs, callPages, callsComplete) = await FetchCallHistoryAsync(client, fromDate, toDate, budgetStarted, cancellationToken);
            var callRows = 0;
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
                var direction = (log.Direction ?? "").Trim().ToLowerInvariant();
                if (direction is "inbound" or "incoming") row.InboundCalls += 1;
                else if (direction is "outbound" or "outgoing") row.OutboundCalls += 1;
                var result = (log.Result ?? "").Trim().ToLowerInvariant();
                if (result.Contains("miss") || result.Contains("no_answer") || result.Contains("no answer"))
                    row.MissedCalls += 1;
            }

            var phoneUsers = users.Where(u => !string.IsNullOrWhiteSpace(u.Id) && !string.IsNullOrWhiteSpace(u.Email)).ToList();
            var smsRows = 0;
            var smsUsersSynced = 0;
            var smsComplete = true;
            foreach (var user in phoneUsers)
            {
                if ((DateTime.UtcNow - budgetStarted).TotalSeconds > 110)
                {
                    smsComplete = false;
                    break;
                }

                try
                {
                    var (count, pagesLeft) = await CountSmsSessionsAsync(client, user.Id!, fromDate, toDate, cancellationToken);
                    smsUsersSynced++;
                    if (pagesLeft) smsComplete = false;
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

            await EnrichMeetingsAsync(client, fromDate, toDate, Ensure, cancellationToken);
            await EnrichVoicemailsAsync(client, fromDate, toDate, emailByZoomId, nameByZoomId, Ensure, cancellationToken);
            await EnrichRecordingsAsync(client, fromDate, toDate, emailByZoomId, nameByZoomId, Ensure, cancellationToken);

            var metrics = metricsByKey.Values
                .Where(m =>
                    m.TotalCalls > 0 || m.SmsSessionCount > 0 || m.MeetingsHosted > 0 || m.MeetingMinutes > 0
                    || m.Voicemails > 0 || m.PhoneRecordings > 0)
                .OrderByDescending(m => m.TotalCalls)
                .ToList();

            return new ZoomDirectMetricsResult
            {
                Success = true,
                CallLogRows = callRows,
                UserRows = users.Count,
                SmsRows = smsRows,
                SmsUsersSynced = smsUsersSynced,
                SmsUsersTotal = phoneUsers.Count,
                CallPages = callPages,
                SmsComplete = smsComplete && smsUsersSynced >= phoneUsers.Count,
                CallsComplete = callsComplete,
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

    private async Task EnrichMeetingsAsync(
        HttpClient client,
        string fromDate,
        string toDate,
        Func<string, string?, string?, string?, ZoomDirectUserMetric> ensure,
        CancellationToken cancellationToken)
    {
        try
        {
            string? nextToken = null;
            var pages = 0;
            do
            {
                var reportUrl =
                    $"https://api.zoom.us/v2/report/users?from={fromDate}&to={toDate}&page_size=300&type=active";
                if (!string.IsNullOrWhiteSpace(nextToken))
                    reportUrl += $"&next_page_token={Uri.EscapeDataString(nextToken)}";

                using var reportRes = await client.GetAsync(reportUrl, cancellationToken);
                if (!reportRes.IsSuccessStatusCode) break;
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
                        var row = ensure(email!, ReadString(u, "id"), email, ReadString(u, "user_name"));
                        row.MeetingsHosted = Math.Max(row.MeetingsHosted, meetings);
                        row.MeetingsJoined = Math.Max(row.MeetingsJoined, Math.Max(participants, meetings));
                        row.MeetingMinutes = Math.Max(row.MeetingMinutes, meetingMinutes);
                    }
                }

                nextToken = doc.RootElement.TryGetProperty("next_page_token", out var npt) ? npt.GetString() : null;
                pages++;
            } while (!string.IsNullOrWhiteSpace(nextToken) && pages < 10);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Zoom report/users pull failed");
        }
    }

    private async Task EnrichVoicemailsAsync(
        HttpClient client,
        string fromDate,
        string toDate,
        Dictionary<string, string> emailByZoomId,
        Dictionary<string, string> nameByZoomId,
        Func<string, string?, string?, string?, ZoomDirectUserMetric> ensure,
        CancellationToken cancellationToken)
    {
        try
        {
            string? nextToken = null;
            var pages = 0;
            do
            {
                var url = $"https://api.zoom.us/v2/phone/voice_mails?from={fromDate}&to={toDate}&page_size=100";
                if (!string.IsNullOrWhiteSpace(nextToken))
                    url += $"&next_page_token={Uri.EscapeDataString(nextToken)}";
                using var res = await client.GetAsync(url, cancellationToken);
                if (!res.IsSuccessStatusCode) break;
                await using var stream = await res.Content.ReadAsStreamAsync(cancellationToken);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                var arrName = doc.RootElement.TryGetProperty("voice_mails", out _) ? "voice_mails" : "voicemails";
                if (doc.RootElement.TryGetProperty(arrName, out var items) && items.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in items.EnumerateArray())
                    {
                        var ownerId = ReadString(item, "owner", "id")
                            ?? ReadString(item, "callee_user_id")
                            ?? ReadString(item, "owner_id");
                        var email = ownerId != null && emailByZoomId.TryGetValue(ownerId, out var mapped)
                            ? mapped
                            : FirstEmail(ReadString(item, "callee_email"), ReadString(item, "owner_email"));
                        var key = !string.IsNullOrWhiteSpace(email)
                            ? email!
                            : (!string.IsNullOrWhiteSpace(ownerId) ? $"id:{ownerId}" : null);
                        if (string.IsNullOrWhiteSpace(key)) continue;
                        var display = ownerId != null && nameByZoomId.TryGetValue(ownerId, out var n) ? n : null;
                        var row = ensure(key, ownerId, email, display);
                        row.Voicemails += 1;
                        row.VoicemailMinutes += Math.Max(0, ReadInt(item, "duration")) / 60d;
                    }
                }

                nextToken = doc.RootElement.TryGetProperty("next_page_token", out var npt) ? npt.GetString() : null;
                pages++;
            } while (!string.IsNullOrWhiteSpace(nextToken) && pages < 20);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Zoom voicemails pull failed");
        }
    }

    private async Task EnrichRecordingsAsync(
        HttpClient client,
        string fromDate,
        string toDate,
        Dictionary<string, string> emailByZoomId,
        Dictionary<string, string> nameByZoomId,
        Func<string, string?, string?, string?, ZoomDirectUserMetric> ensure,
        CancellationToken cancellationToken)
    {
        try
        {
            string? nextToken = null;
            var pages = 0;
            do
            {
                var url = $"https://api.zoom.us/v2/phone/recordings?from={fromDate}&to={toDate}&page_size=100";
                if (!string.IsNullOrWhiteSpace(nextToken))
                    url += $"&next_page_token={Uri.EscapeDataString(nextToken)}";
                using var res = await client.GetAsync(url, cancellationToken);
                if (!res.IsSuccessStatusCode) break;
                await using var stream = await res.Content.ReadAsStreamAsync(cancellationToken);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                if (doc.RootElement.TryGetProperty("recordings", out var items) && items.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in items.EnumerateArray())
                    {
                        var ownerId = ReadString(item, "owner", "id")
                            ?? ReadString(item, "owner_id")
                            ?? ReadString(item, "user_id");
                        var email = ownerId != null && emailByZoomId.TryGetValue(ownerId, out var mapped)
                            ? mapped
                            : FirstEmail(ReadString(item, "owner_email"), ReadString(item, "caller_email"));
                        var key = !string.IsNullOrWhiteSpace(email)
                            ? email!
                            : (!string.IsNullOrWhiteSpace(ownerId) ? $"id:{ownerId}" : null);
                        if (string.IsNullOrWhiteSpace(key)) continue;
                        var display = ownerId != null && nameByZoomId.TryGetValue(ownerId, out var n) ? n : null;
                        var row = ensure(key, ownerId, email, display);
                        row.PhoneRecordings += 1;
                        row.RecordingMinutes += Math.Max(0, ReadInt(item, "duration")) / 60d;
                    }
                }

                nextToken = doc.RootElement.TryGetProperty("next_page_token", out var npt) ? npt.GetString() : null;
                pages++;
            } while (!string.IsNullOrWhiteSpace(nextToken) && pages < 20);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Zoom recordings pull failed");
        }
    }

    private async Task<(int Count, bool HitPageCap)> CountSmsSessionsAsync(
        HttpClient client,
        string userId,
        string fromDate,
        string toDate,
        CancellationToken cancellationToken)
    {
        var total = 0;
        string? nextToken = null;
        var pages = 0;
        do
        {
            var url =
                $"https://api.zoom.us/v2/phone/users/{Uri.EscapeDataString(userId)}/sms/sessions?from={fromDate}&to={toDate}&page_size=100";
            if (!string.IsNullOrWhiteSpace(nextToken))
                url += $"&next_page_token={Uri.EscapeDataString(nextToken)}";
            using var smsRes = await client.GetAsync(url, cancellationToken);
            if (!smsRes.IsSuccessStatusCode) break;
            await using var stream = await smsRes.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (doc.RootElement.TryGetProperty("sms_sessions", out var sessions)
                && sessions.ValueKind == JsonValueKind.Array)
                total += sessions.GetArrayLength();
            nextToken = doc.RootElement.TryGetProperty("next_page_token", out var npt) ? npt.GetString() : null;
            pages++;
        } while (!string.IsNullOrWhiteSpace(nextToken) && pages < 10);

        return (total, !string.IsNullOrWhiteSpace(nextToken));
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

    private async Task<(List<ZoomCallLite> Logs, int Pages, bool Complete)> FetchCallHistoryAsync(
        HttpClient client,
        string fromDate,
        string toDate,
        DateTime budgetStarted,
        CancellationToken cancellationToken)
    {
        var results = new List<ZoomCallLite>();
        string? nextToken = null;
        var pages = 0;

        do
        {
            if ((DateTime.UtcNow - budgetStarted).TotalSeconds > 75)
                return (results, pages, false);

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
                        ReadInt(item, "duration"),
                        ReadString(item, "direction"),
                        ReadString(item, "result") ?? ReadString(item, "call_end_reason")));
                }
            }

            nextToken = doc.RootElement.TryGetProperty("next_page_token", out var npt)
                ? npt.GetString()
                : null;
            pages++;
        } while (!string.IsNullOrWhiteSpace(nextToken) && pages < 250);

        return (results, pages, string.IsNullOrWhiteSpace(nextToken));
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
    private sealed record ZoomCallLite(
        string? OwnerId,
        string? CallerEmail,
        string? CalleeEmail,
        int DurationSeconds,
        string? Direction,
        string? Result);
}
