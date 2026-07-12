using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public sealed class CrmPerformanceBackfillRequest
{
    public string PeriodMode { get; set; } = "monthly";
    public DateTime FromDate { get; set; }
    public DateTime ToDate { get; set; }
    /// <summary>Bearer JWT used when calling CRM through the gateway.</summary>
    public string? BearerToken { get; set; }
}

public sealed class CrmPerformanceBackfillResult
{
    public int SyncRunId { get; init; }
    public string Status { get; init; } = "complete";
    public string PeriodMode { get; init; } = "monthly";
    public string From { get; init; } = "";
    public string To { get; init; } = "";
    public int Employees { get; init; }
    public int ScorecardUpserted { get; init; }
    public int ZoomMatched { get; init; }
    public int GmailMatched { get; init; }
    public int CallLogRows { get; init; }
    public int SmsRows { get; init; }
    public int GmailRows { get; init; }
    public string? Note { get; init; }
    public string? Error { get; init; }
}

/// <summary>
/// One-shot CRM → Access warehouse import for scorecard Zoom/Gmail columns only.
/// </summary>
public class CrmPerformanceBackfillService
{
    private readonly TaylorAccessDbContext _context;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CrmPerformanceBackfillService> _logger;

    public CrmPerformanceBackfillService(
        TaylorAccessDbContext context,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<CrmPerformanceBackfillService> logger)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<CrmPerformanceBackfillResult> RunAsync(
        int organizationId,
        CrmPerformanceBackfillRequest request,
        CancellationToken cancellationToken = default)
    {
        var from = request.FromDate.Date;
        var to = request.ToDate.Date;
        if (to < from) (from, to) = (to, from);
        var periodMode = string.IsNullOrWhiteSpace(request.PeriodMode)
            ? "monthly"
            : request.PeriodMode.Trim().ToLowerInvariant();

        var run = new PerformanceSyncRun
        {
            OrganizationId = organizationId,
            PeriodMode = periodMode,
            FromDate = from,
            ToDate = to,
            Status = "running",
            Trigger = "crm-backfill",
            StartedAt = DateTime.UtcNow
        };
        _context.PerformanceSyncRuns.Add(run);
        await _context.SaveChangesAsync(cancellationToken);

        try
        {
            var employees = await _context.Users.AsNoTracking()
                .Where(u => u.Status == "active")
                .Select(u => new EmpLite(u.Id, u.Name, u.Email, u.ZoomEmail, u.PersonalEmail, u.ZoomUserId))
                .ToListAsync(cancellationToken);

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(6);
            ConfigureGatewayClient(client, request.BearerToken);

            var gatewayBase = ResolveGatewayOpenBase();
            var zoomBase = $"{gatewayBase.TrimEnd('/')}/taylor-crm/api/v1/zoom";
            var gmailBase = $"{gatewayBase.TrimEnd('/')}/taylor-crm/api/v1/gmail";
            var fromKey = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var toKey = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var days = Math.Max(1, (int)(to - from).TotalDays + 1);
            var trailingSafe = to >= DateTime.UtcNow.Date.AddDays(-2);

            var zoomByEmp = new Dictionary<int, ZoomAgg>();
            var gmailByEmp = new Dictionary<int, GmailAgg>();
            var callLogRows = 0;
            var smsRows = 0;
            var gmailRows = 0;
            string? note = null;

            // Use CRM-stored metrics only (skip live Zoom sync/compute — too slow for gateway).
            if (trailingSafe)
            {
                try
                {
                    var metricsRes = await client.GetAsync($"{zoomBase}/metrics/users?days={days}", cancellationToken);
                    if (metricsRes.IsSuccessStatusCode)
                    {
                        var body = await metricsRes.Content.ReadAsStringAsync(cancellationToken);
                        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
                        if (TryProp(doc.RootElement, "data", out var data) && data.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in data.EnumerateArray())
                            {
                                var email = ReadStr(item, "email", "userEmail", "user_email");
                                var zoomUserId = ReadStr(item, "zoomUserId", "zoom_user_id", "userId", "user_id");
                                var displayName = ReadStr(item, "displayName", "display_name", "name");
                                var calls = ReadInt(item, "totalCalls", "total_calls", "calls");
                                var minutes = ReadDouble(item, "totalCallDuration", "total_call_duration", "totalCallMinutes", "total_call_minutes");
                                // CRM often stores duration in seconds.
                                if (minutes > calls * 180) minutes /= 60d;
                                var texts = ReadInt(item, "smsSessionCount", "sms_session_count", "texts", "textCount");
                                var empId = MatchEmployee(employees, email, zoomUserId, displayName);
                                if (empId <= 0) continue;
                                MergeZoom(zoomByEmp, empId, calls, minutes, texts);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "CRM zoom metrics/users backfill failed");
                    note = "zoom-metrics-partial";
                }
            }
            else
            {
                note = "zoom-metrics-skipped-historical-use-call-logs";
            }

            // True from/to Zoom call logs.
            try
            {
                var callRes = await client.GetAsync(
                    $"{zoomBase}/phone/call-logs?from={fromKey}&to={toKey}&pageSize=500",
                    cancellationToken);
                if (callRes.IsSuccessStatusCode)
                {
                    var body = await callRes.Content.ReadAsStringAsync(cancellationToken);
                    using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
                    if (TryProp(doc.RootElement, "data", out var data) && data.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in data.EnumerateArray())
                        {
                            callLogRows++;
                            var ownerEmail = ReadStr(item, "ownerEmail", "owner_email", "userEmail", "user_email");
                            var callerEmail = ReadStr(item, "caller_email", "callerEmail");
                            var calleeEmail = ReadStr(item, "callee_email", "calleeEmail");
                            var ownerUserId = ReadStr(item, "ownerUserId", "owner_user_id", "userId", "user_id", "agentId");
                            var ownerName = ReadStr(item, "ownerName", "owner_name", "agentName");
                            if (TryProp(item, "owner", out var owner) && owner.ValueKind == JsonValueKind.Object)
                            {
                                ownerEmail ??= ReadStr(owner, "email");
                                ownerUserId ??= ReadStr(owner, "id", "userId", "zoomUserId");
                                ownerName ??= ReadStr(owner, "name", "displayName");
                            }
                            var mins = ReadDouble(item, "durationMinutes", "duration_minutes", "duration");
                            var secs = ReadDouble(item, "durationSeconds", "duration_seconds");
                            if (mins <= 0 && secs > 0) mins = secs / 60d;

                            var empId = 0;
                            foreach (var key in new[] { ownerEmail, callerEmail, calleeEmail })
                            {
                                empId = MatchEmployee(employees, key, ownerUserId, ownerName);
                                if (empId > 0) break;
                            }
                            if (empId <= 0) continue;
                            MergeZoom(zoomByEmp, empId, 1, Math.Max(0, mins), 0);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "CRM call-logs backfill failed");
            }

            // True from/to SMS.
            try
            {
                var smsRes = await client.GetAsync(
                    $"{zoomBase}/phone/sms?from={fromKey}&to={toKey}&pageSize=500",
                    cancellationToken);
                if (smsRes.IsSuccessStatusCode)
                {
                    var body = await smsRes.Content.ReadAsStringAsync(cancellationToken);
                    using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
                    if (TryProp(doc.RootElement, "data", out var data) && data.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in data.EnumerateArray())
                        {
                            smsRows++;
                            var email = ReadStr(item, "ownerEmail", "owner_email", "userEmail", "email");
                            var zoomUserId = ReadStr(item, "ownerUserId", "owner_user_id", "userId", "zoomUserId");
                            var name = ReadStr(item, "ownerName", "owner_name", "displayName");
                            var empId = MatchEmployee(employees, email, zoomUserId, name);
                            if (empId <= 0) continue;
                            MergeZoom(zoomByEmp, empId, 0, 0, 1);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "CRM SMS backfill failed");
            }

            // Skip live gmail sync — read CRM performance-metrics warehouse only.
            try
            {
                var gmailRes = await client.GetAsync(
                    $"{gmailBase}/domain/performance-metrics?from={fromKey}&to={toKey}",
                    cancellationToken);
                if (gmailRes.IsSuccessStatusCode)
                {
                    var body = await gmailRes.Content.ReadAsStringAsync(cancellationToken);
                    using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
                    if (TryProp(doc.RootElement, "data", out var data) && data.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in data.EnumerateArray())
                        {
                            gmailRows++;
                            var email = ReadStr(item, "email", "userEmail");
                            var empId = MatchEmployee(employees, email, null, null);
                            if (empId <= 0) continue;
                            gmailByEmp[empId] = new GmailAgg
                            {
                                Sent = ReadInt(item, "sentCount", "sent_count"),
                                Replies = ReadInt(item, "replyCount", "reply_count"),
                                FirstResponseMinutes = ReadDouble(item, "firstResponseMinutes", "first_response_minutes"),
                                FollowUpRate = ReadDouble(item, "followUpRate", "follow_up_rate"),
                                Internal = ReadInt(item, "internalCount", "internal_count"),
                                External = ReadInt(item, "externalCount", "external_count")
                            };
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "CRM Gmail backfill failed");
                note = string.IsNullOrWhiteSpace(note) ? "gmail-partial" : note + ";gmail-partial";
            }

            var existing = await _context.PerformanceScorecardSnapshots
                .Where(r => r.OrganizationId == organizationId
                    && r.PeriodMode == periodMode
                    && r.FromDate == from
                    && r.ToDate == to)
                .ToListAsync(cancellationToken);
            var byEmp = existing.ToDictionary(r => r.EmployeeId);
            var now = DateTime.UtcNow;
            var upserted = 0;

            var touchedIds = zoomByEmp.Keys.Union(gmailByEmp.Keys).ToHashSet();
            foreach (var emp in employees.Where(e => touchedIds.Contains(e.Id) || byEmp.ContainsKey(e.Id)))
            {
                zoomByEmp.TryGetValue(emp.Id, out var z);
                gmailByEmp.TryGetValue(emp.Id, out var g);
                var hasZoom = z.Calls > 0 || z.Minutes > 0 || z.Texts > 0;
                var hasGmail = g.Sent > 0 || g.Replies > 0 || g.External > 0 || g.Internal > 0;
                if (!hasZoom && !hasGmail && !byEmp.ContainsKey(emp.Id)) continue;

                if (!byEmp.TryGetValue(emp.Id, out var row))
                {
                    row = new PerformanceScorecardSnapshot
                    {
                        OrganizationId = organizationId,
                        EmployeeId = emp.Id,
                        PeriodMode = periodMode,
                        FromDate = from,
                        ToDate = to,
                        CreatedAt = now
                    };
                    _context.PerformanceScorecardSnapshots.Add(row);
                    byEmp[emp.Id] = row;
                }

                row.EmployeeName = emp.Name;
                row.SyncRunId = run.Id;

                if (hasZoom)
                {
                    row.CallVolume = Math.Max(row.CallVolume, z.Calls);
                    row.TotalCallMinutes = Math.Max(row.TotalCallMinutes, Math.Round(z.Minutes, 2));
                    row.AvgCallMinutes = row.CallVolume > 0
                        ? Math.Round(row.TotalCallMinutes / row.CallVolume, 2)
                        : 0;
                    row.TextVolume = Math.Max(row.TextVolume, z.Texts);
                }

                if (hasGmail)
                {
                    row.SentCount = Math.Max(row.SentCount, g.Sent);
                    row.ReplyCount = Math.Max(row.ReplyCount, g.Replies);
                    if (g.FirstResponseMinutes > 0 && (row.FirstResponseMinutes <= 0 || g.FirstResponseMinutes < row.FirstResponseMinutes))
                        row.FirstResponseMinutes = Math.Round(g.FirstResponseMinutes, 2);
                    row.FollowUpRate = Math.Max(row.FollowUpRate, g.FollowUpRate);
                    row.InternalCount = Math.Max(row.InternalCount, g.Internal);
                    row.ExternalCount = Math.Max(row.ExternalCount, g.External);
                }

                var busy = (double)row.BusyRate;
                row.Score = Math.Clamp(
                    (int)Math.Round(
                        Math.Min(40, row.CallVolume * 0.4)
                        + Math.Min(20, row.TextVolume * 0.5)
                        + Math.Min(20, row.SentCount * 0.3 + row.ReplyCount * 0.4)
                        + Math.Min(20, busy * 20)),
                    0, 100);
                if (row.CallVolume > 0) row.BusySource = "zoom";
                else if (row.SentCount > 0) row.BusySource = "gmail";
                else if (row.ClockedHours > 0) row.BusySource ??= "system";

                row.Source = string.Equals(row.Source, "access-direct", StringComparison.OrdinalIgnoreCase)
                    ? "access-direct+crm-backfill"
                    : "crm-backfill";
                row.UpdatedAt = now;
                upserted++;
            }

            await _context.SaveChangesAsync(cancellationToken);

            var status = (zoomByEmp.Count == 0 && gmailByEmp.Count == 0) ? "partial" : "complete";
            run.Status = status;
            run.FinishedAt = DateTime.UtcNow;
            run.CompletenessJson = JsonSerializer.Serialize(new
            {
                zoomMatched = zoomByEmp.Count,
                gmailMatched = gmailByEmp.Count,
                callLogRows,
                smsRows,
                gmailRows,
                scorecardUpserted = upserted,
                note
            });
            await _context.SaveChangesAsync(cancellationToken);

            return new CrmPerformanceBackfillResult
            {
                SyncRunId = run.Id,
                Status = status,
                PeriodMode = periodMode,
                From = fromKey,
                To = toKey,
                Employees = employees.Count,
                ScorecardUpserted = upserted,
                ZoomMatched = zoomByEmp.Count,
                GmailMatched = gmailByEmp.Count,
                CallLogRows = callLogRows,
                SmsRows = smsRows,
                GmailRows = gmailRows,
                Note = note
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CRM performance backfill failed");
            run.Status = "failed";
            run.FinishedAt = DateTime.UtcNow;
            run.ErrorMessage = ex.Message;
            await _context.SaveChangesAsync(CancellationToken.None);
            return new CrmPerformanceBackfillResult
            {
                SyncRunId = run.Id,
                Status = "failed",
                PeriodMode = periodMode,
                From = from.ToString("yyyy-MM-dd"),
                To = to.ToString("yyyy-MM-dd"),
                Error = ex.Message
            };
        }
    }

    private void ConfigureGatewayClient(HttpClient client, string? bearerToken)
    {
        client.DefaultRequestHeaders.Remove("Authorization");
        client.DefaultRequestHeaders.Remove("X-Service-Key");
        client.DefaultRequestHeaders.Remove("X-Internal-Key");
        client.DefaultRequestHeaders.Remove("X-GW-Internal");

        var serviceKey = Environment.GetEnvironmentVariable("INTERNAL_SERVICE_KEY")
            ?? Environment.GetEnvironmentVariable("INTERNAL_API_KEY")
            ?? _configuration["INTERNAL_SERVICE_KEY"];
        if (!string.IsNullOrWhiteSpace(serviceKey))
        {
            client.DefaultRequestHeaders.TryAddWithoutValidation("X-Service-Key", serviceKey.Trim());
            client.DefaultRequestHeaders.TryAddWithoutValidation("X-Internal-Key", serviceKey.Trim());
        }
        client.DefaultRequestHeaders.TryAddWithoutValidation("X-GW-Internal", "1");
        if (!string.IsNullOrWhiteSpace(bearerToken))
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken.Trim());
    }

    private string ResolveGatewayOpenBase()
    {
        var internalUrl = Environment.GetEnvironmentVariable("GATEWAY_INTERNAL_URL");
        if (!string.IsNullOrWhiteSpace(internalUrl))
        {
            var trimmed = internalUrl.Trim().TrimEnd('/');
            return trimmed.EndsWith("/api/v1/open", StringComparison.OrdinalIgnoreCase)
                ? trimmed
                : $"{trimmed}/api/v1/open";
        }
        return _configuration["GatewayPublicOpenUrl"]
            ?? Environment.GetEnvironmentVariable("GATEWAY_PUBLIC_OPEN_URL")
            ?? "https://ttac-gateway-production.up.railway.app/api/v1/open";
    }

    private static void MergeZoom(Dictionary<int, ZoomAgg> map, int empId, int calls, double minutes, int texts)
    {
        if (!map.TryGetValue(empId, out var cur)) cur = default;
        cur.Calls += Math.Max(0, calls);
        cur.Minutes += Math.Max(0, minutes);
        cur.Texts += Math.Max(0, texts);
        map[empId] = cur;
    }

    private static int MatchEmployee(List<EmpLite> employees, string? email, string? zoomUserId, string? name)
    {
        var emailKey = (email ?? "").Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(emailKey))
        {
            var byEmail = employees.FirstOrDefault(e =>
                string.Equals(e.Email, emailKey, StringComparison.OrdinalIgnoreCase)
                || string.Equals(e.ZoomEmail, emailKey, StringComparison.OrdinalIgnoreCase)
                || string.Equals(e.PersonalEmail, emailKey, StringComparison.OrdinalIgnoreCase));
            if (byEmail != null) return byEmail.Id;

            var local = emailKey.Contains('@') ? emailKey.Split('@')[0] : emailKey;
            byEmail = employees.FirstOrDefault(e =>
                (e.Email ?? "").StartsWith(local + "@", StringComparison.OrdinalIgnoreCase)
                || (e.ZoomEmail ?? "").StartsWith(local + "@", StringComparison.OrdinalIgnoreCase));
            if (byEmail != null) return byEmail.Id;
        }

        if (!string.IsNullOrWhiteSpace(zoomUserId))
        {
            var byZoom = employees.FirstOrDefault(e =>
                string.Equals(e.ZoomUserId, zoomUserId.Trim(), StringComparison.OrdinalIgnoreCase));
            if (byZoom != null) return byZoom.Id;
        }

        var nameKey = NormalizeName(name);
        if (!string.IsNullOrWhiteSpace(nameKey))
        {
            var byName = employees.FirstOrDefault(e => NormalizeName(e.Name) == nameKey);
            if (byName != null) return byName.Id;
        }
        return 0;
    }

    private static string NormalizeName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var chars = value.Trim().ToLowerInvariant()
            .Where(c => char.IsLetterOrDigit(c) || char.IsWhiteSpace(c))
            .ToArray();
        return string.Join(' ', new string(chars).Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private static bool TryProp(JsonElement el, string name, out JsonElement value)
    {
        foreach (var p in el.EnumerateObject())
        {
            if (string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = p.Value;
                return true;
            }
        }
        value = default;
        return false;
    }

    private static string? ReadStr(JsonElement el, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryProp(el, name, out var v)) continue;
            if (v.ValueKind == JsonValueKind.String) return v.GetString();
            if (v.ValueKind == JsonValueKind.Number) return v.GetRawText();
        }
        return null;
    }

    private static int ReadInt(JsonElement el, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryProp(el, name, out var v)) continue;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n)) return n;
            if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var p)) return p;
        }
        return 0;
    }

    private static double ReadDouble(JsonElement el, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryProp(el, name, out var v)) continue;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var n)) return n;
            if (v.ValueKind == JsonValueKind.String
                && double.TryParse(v.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var p))
                return p;
        }
        return 0;
    }

    private sealed record EmpLite(int Id, string? Name, string? Email, string? ZoomEmail, string? PersonalEmail, string? ZoomUserId);
    private struct ZoomAgg { public int Calls; public double Minutes; public int Texts; }
    private struct GmailAgg
    {
        public int Sent;
        public int Replies;
        public double FirstResponseMinutes;
        public double FollowUpRate;
        public int Internal;
        public int External;
    }
}
