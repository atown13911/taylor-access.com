using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/performance-reviews")]
[Authorize]
public class PerformanceReviewsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly IJwtService _jwtService;
    private readonly ILogger<PerformanceReviewsController> _logger;

    public PerformanceReviewsController(
        TaylorAccessDbContext context,
        CurrentUserService currentUserService,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IJwtService jwtService,
        ILogger<PerformanceReviewsController> logger)
    {
        _context = context;
        _currentUserService = currentUserService;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _jwtService = jwtService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetReviews(
        [FromQuery] int? year,
        [FromQuery] int? month,
        [FromQuery] int? employeeId,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 200)
    {
        var (orgId, _, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null) return Unauthorized(new { message = error });

        var now = DateTime.UtcNow;
        var effectiveYear = year ?? now.Year;
        var effectiveMonth = month ?? now.Month;

        var query = _context.PerformanceReviews.AsNoTracking().AsQueryable();

        if (orgId.HasValue)
            query = query.Where(r => r.OrganizationId == orgId.Value);

        query = query.Where(r => r.Year == effectiveYear && r.Month == effectiveMonth);

        if (employeeId.HasValue)
            query = query.Where(r => r.EmployeeId == employeeId.Value);

        var total = await query.CountAsync();
        var data = await query
            .OrderByDescending(r => r.UpdatedAt)
            .Skip((Math.Max(page, 1) - 1) * Math.Max(limit, 1))
            .Take(Math.Max(limit, 1))
            .ToListAsync();

        return Ok(new
        {
            data,
            meta = new
            {
                total,
                page = Math.Max(page, 1),
                limit = Math.Max(limit, 1),
                year = effectiveYear,
                month = effectiveMonth
            }
        });
    }

    [HttpPost("monthly-upsert")]
    public async Task<ActionResult<object>> UpsertMonthlyReview([FromBody] UpsertMonthlyPerformanceReviewRequest request)
    {
        if (request.EmployeeId <= 0)
            return BadRequest(new { message = "employeeId is required" });

        var (orgId, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var (year, month) = ResolvePeriod(request);
        if (month is < 1 or > 12)
            return BadRequest(new { message = "month must be between 1 and 12" });

        var organizationId = orgId ?? user.OrganizationId ?? request.OrganizationId ?? 0;
        if (organizationId <= 0)
            return BadRequest(new { message = "organizationId is required" });

        var employee = await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == request.EmployeeId);
        if (employee == null)
            return NotFound(new { message = "Employee not found" });

        var period = $"{year:D4}-{month:D2}";
        var normalizedStatus = request.Status == "completed" ? "completed" : "pending";

        var existing = await _context.PerformanceReviews
            .FirstOrDefaultAsync(r =>
                r.OrganizationId == organizationId
                && r.EmployeeId == request.EmployeeId
                && r.Year == year
                && r.Month == month);

        if (existing == null)
        {
            existing = new PerformanceReview
            {
                OrganizationId = organizationId,
                EmployeeId = request.EmployeeId,
                ReviewerId = user.Id,
                ReviewerName = user.Name,
                EmployeeName = employee.Name,
                Year = year,
                Month = month,
                Period = period,
                CreatedAt = DateTime.UtcNow
            };
            _context.PerformanceReviews.Add(existing);
        }

        existing.ReviewType = "monthly";
        existing.Period = period;
        existing.OverallRating = Math.Clamp(request.OverallRating, 1, 5);
        existing.Strengths = request.Strengths?.Trim();
        existing.AreasForImprovement = request.AreasForImprovement?.Trim();
        existing.Goals = request.Goals?.Trim();
        existing.Comments = request.Comments?.Trim();
        existing.Status = normalizedStatus;
        existing.ReviewerId = user.Id;
        existing.ReviewerName = user.Name;
        existing.EmployeeName = employee.Name;
        existing.CallVolume = Math.Max(request.CallVolume, 0);
        existing.TextVolume = Math.Max(request.TextVolume, 0);
        existing.ClockedHours = ToMoney(request.ClockedHours);
        existing.WorkHours = ToMoney(request.WorkHours);
        existing.ActivityRate = ToRate(request.ActivityRate);
        existing.InvoicedRevenue = ToMoney(request.InvoicedRevenue);
        existing.Score = Math.Clamp(request.Score, 0, 100);
        existing.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = existing });
    }

    [HttpGet("zoom-metrics")]
    public async Task<ActionResult<object>> GetZoomMetrics(
        [FromQuery] int? year,
        [FromQuery] int? month,
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] bool sync = true)
    {
        var (orgId, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var now = DateTime.UtcNow;
        var hasCustomRange = !string.IsNullOrWhiteSpace(from) && !string.IsNullOrWhiteSpace(to);
        DateTime targetStart;
        DateTime rangeEnd;
        int targetYear;
        int targetMonth;

        if (hasCustomRange)
        {
            if (!DateTime.TryParse(from, out var parsedFrom) || !DateTime.TryParse(to, out var parsedTo))
                return BadRequest(new { message = "from/to must be valid ISO dates" });
            targetStart = DateTime.SpecifyKind(parsedFrom.Date, DateTimeKind.Utc);
            rangeEnd = DateTime.SpecifyKind(parsedTo.Date, DateTimeKind.Utc);
            if (rangeEnd < targetStart) (targetStart, rangeEnd) = (rangeEnd, targetStart);
            targetYear = rangeEnd.Year;
            targetMonth = rangeEnd.Month;
        }
        else
        {
            targetYear = year ?? now.Year;
            targetMonth = month ?? now.Month;
            targetStart = new DateTime(targetYear, targetMonth, 1, 0, 0, 0, DateTimeKind.Utc);
            rangeEnd = now.Date;
        }
        var nextMonth = targetStart.AddMonths(1);

        // CRM endpoint only supports "last N days". For exact historical months, use saved snapshots.
        if (!hasCustomRange && (targetStart.Month != now.Month || targetStart.Year != now.Year))
        {
            return Ok(new
            {
                data = Array.Empty<object>(),
                meta = new
                {
                    year = targetYear,
                    month = targetMonth,
                    source = "ttac-gateway->taylor-crm/zoom",
                    note = "Live Zoom monthly pull is only available for current month. Historical months are served from saved review snapshots."
                }
            });
        }

        // Align with employee-roster behavior used by the frontend table (global active users).
        var orgFilter = 0;
        var employeeSource = "users-active";

        // Keep employee population aligned with the roster table, which is Users-based.
        var employees = await _context.Users
            .AsNoTracking()
            .Where(u => u.Status == "active")
            .Select(u => new ZoomEmployeeCandidate
            {
                EmployeeId = u.Id,
                Email = u.Email,
                Name = u.Name,
                EmploymentStatus = u.Status,
                Status = u.Status,
                ZoomEmail = u.ZoomEmail,
                ZoomUserId = u.ZoomUserId,
                PersonalEmail = u.PersonalEmail
            })
            .ToListAsync();

        // Fallback: some records can exist only in EmployeeRosters in edge cases.
        if (employees.Count == 0)
        {
            employeeSource = "employee-rosters-fallback";
            employees = await _context.EmployeeRosters
                .AsNoTracking()
                .Include(er => er.User)
                .Where(er => er.User != null)
                .Select(er => new ZoomEmployeeCandidate
                {
                    EmployeeId = er.UserId,
                    Email = er.User!.Email,
                    Name = er.User.Name,
                    EmploymentStatus = er.EmploymentStatus,
                    Status = er.User.Status,
                    ZoomEmail = er.User.ZoomEmail,
                    ZoomUserId = er.User.ZoomUserId,
                    PersonalEmail = er.User.PersonalEmail
                })
                .Where(emp => IsActiveEmploymentStatus(emp.EmploymentStatus ?? emp.Status))
                .ToListAsync();
        }

        if (employees.Count == 0)
            return Ok(new { data = Array.Empty<object>(), meta = new { year = targetYear, month = targetMonth, note = "No active employees found", employeeSource, orgFilter } });

        var zoomUserIdByEmail = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var zoomRecords = await _context.ZoomUserRecords
                .AsNoTracking()
                .Where(z => z.Email != null && z.ZoomUserId != null)
                .Select(z => new { z.Email, z.ZoomUserId })
                .ToListAsync();

            zoomUserIdByEmail = zoomRecords
                .Where(z => !string.IsNullOrWhiteSpace(z.Email) && !string.IsNullOrWhiteSpace(z.ZoomUserId))
                .GroupBy(z => z.Email!.Trim().ToLowerInvariant())
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(x => x.ZoomUserId!.Trim()).FirstOrDefault() ?? string.Empty,
                    StringComparer.OrdinalIgnoreCase
                );
        }
        catch (Exception ex)
        {
            // Do not fail the endpoint if Zoom user cache table is unavailable.
            _logger.LogWarning(ex, "ZoomUserRecords lookup failed; continuing without cached zoom-user mapping");
        }

        var days = Math.Max(1, (int)Math.Ceiling((rangeEnd.Date - targetStart.Date).TotalDays) + 1);
        var gatewayBase = _configuration["GatewayPublicOpenUrl"]
            ?? Environment.GetEnvironmentVariable("GATEWAY_PUBLIC_OPEN_URL")
            ?? "https://ttac-gateway-production.up.railway.app/api/v1/open";
        var crmBase = $"{gatewayBase.TrimEnd('/')}/taylor-crm/api/v1/zoom";

        var incomingAuth = Request.Headers.Authorization.ToString();
        var client = _httpClientFactory.CreateClient();
        var serviceToken = _jwtService.GenerateToken(user);
        if (!string.IsNullOrWhiteSpace(serviceToken))
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", serviceToken);
        }
        else if (!string.IsNullOrWhiteSpace(incomingAuth) && incomingAuth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            client.DefaultRequestHeaders.Authorization = AuthenticationHeaderValue.Parse(incomingAuth);
        }

        if (sync)
        {
            var syncSucceeded = false;
            string? syncError = null;
            try
            {
                var syncResponse = await client.PostAsync($"{crmBase}/sync?days={days}", content: null);
                var syncBody = await syncResponse.Content.ReadAsStringAsync();
                syncSucceeded = syncResponse.IsSuccessStatusCode;

                if (syncSucceeded && !string.IsNullOrWhiteSpace(syncBody))
                {
                    try
                    {
                        using var syncDoc = JsonDocument.Parse(syncBody);
                        if (TryGetPropertyIgnoreCase(syncDoc.RootElement, "success", out var successProp)
                            && successProp.ValueKind == JsonValueKind.False)
                        {
                            syncSucceeded = false;
                            if (TryGetPropertyIgnoreCase(syncDoc.RootElement, "error", out var syncErrorProp))
                                syncError = syncErrorProp.GetString();
                        }
                    }
                    catch
                    {
                        // Ignore parse failures and continue with compute fallback.
                    }
                }

                var computeResponse = await client.PostAsync($"{crmBase}/metrics/compute?days={days}", content: null);
                if (!computeResponse.IsSuccessStatusCode && string.IsNullOrWhiteSpace(syncError))
                {
                    syncError = $"Compute returned HTTP {(int)computeResponse.StatusCode}";
                }
                if (!syncSucceeded && string.IsNullOrWhiteSpace(syncError))
                {
                    syncError = "Zoom sync endpoint did not report success";
                }

                if (!syncSucceeded && !string.IsNullOrWhiteSpace(syncError))
                {
                    _logger.LogWarning("Zoom sync/compute preflight was not fully successful: {Error}", syncError);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Zoom metrics compute call via gateway failed; continuing with available CRM data");
            }
        }

        var skipWindowUnsupportedMetrics = false;
        JsonDocument? metricsDoc = null;
        if (!skipWindowUnsupportedMetrics)
        {
            var metricsResponse = await client.GetAsync($"{crmBase}/metrics/users?days={days}");
            if (!metricsResponse.IsSuccessStatusCode)
            {
                return Ok(new
                {
                    data = Array.Empty<object>(),
                    meta = new
                    {
                        year = targetYear,
                        month = targetMonth,
                        source = "ttac-gateway->taylor-crm/zoom",
                        error = $"Failed to fetch zoom metrics: {(int)metricsResponse.StatusCode}",
                        authMode = !string.IsNullOrWhiteSpace(serviceToken) ? "service-jwt" : "incoming-bearer"
                    }
                });
            }

            var metricsJson = await metricsResponse.Content.ReadAsStringAsync();
            metricsDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(metricsJson) ? "{}" : metricsJson);
        }
        else
        {
            metricsDoc = JsonDocument.Parse("{}");
        }
        using (metricsDoc)
        {
            var metricsByEmail = new Dictionary<string, ZoomUserMetricLite>(StringComparer.OrdinalIgnoreCase);
            var metricsByEmailLocal = new Dictionary<string, ZoomUserMetricLite>(StringComparer.OrdinalIgnoreCase);
            var metricsByName = new Dictionary<string, ZoomUserMetricLite>(StringComparer.OrdinalIgnoreCase);
            var metricsByZoomUserId = new Dictionary<string, ZoomUserMetricLite>(StringComparer.OrdinalIgnoreCase);

            var crmMetricsRows = 0;
            var crmMetricsRowsWithCalls = 0;
            var crmMetricsRowsWithTexts = 0;
            if (!skipWindowUnsupportedMetrics
                && TryGetPropertyIgnoreCase(metricsDoc.RootElement, "data", out var metricsData)
                && metricsData.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in metricsData.EnumerateArray())
                {
                    crmMetricsRows++;
                    var metricElement = item;
                    if (TryGetPropertyIgnoreCase(item, "metrics", out var metricsNode) && metricsNode.ValueKind == JsonValueKind.Object)
                        metricElement = metricsNode;
                    var userElement = item;
                    if (TryGetPropertyIgnoreCase(item, "user", out var userNode) && userNode.ValueKind == JsonValueKind.Object)
                        userElement = userNode;

                    var totalCalls = ReadIntAny(metricElement, "totalCalls", "total_calls", "calls", "callCount", "call_count", "phoneCalls", "phone_calls");
                    if (totalCalls <= 0)
                    {
                        var outboundCalls = ReadIntAny(metricElement, "outboundCalls", "outbound_calls");
                        var inboundCalls = ReadIntAny(metricElement, "inboundCalls", "inbound_calls");
                        totalCalls = outboundCalls + inboundCalls;
                    }
                    if (totalCalls <= 0)
                        totalCalls = ReadIntAny(item, "totalCalls", "total_calls", "calls", "callCount", "call_count", "phoneCalls", "phone_calls");
                    var totalCallMinutes = ReadDoubleAny(metricElement, "totalCallMinutes", "total_call_minutes", "callDurationMinutes", "call_duration_minutes", "totalCallDuration", "total_call_duration");
                    if (totalCallMinutes <= 0)
                        totalCallMinutes = ReadDoubleAny(item, "totalCallMinutes", "total_call_minutes", "callDurationMinutes", "call_duration_minutes", "totalCallDuration", "total_call_duration");
                    var totalCallSeconds = ReadDoubleAny(metricElement, "totalCallSeconds", "total_call_seconds", "callDurationSeconds", "call_duration_seconds", "totalCallDurationSeconds", "total_call_duration_seconds");
                    if (totalCallSeconds <= 0)
                        totalCallSeconds = ReadDoubleAny(item, "totalCallSeconds", "total_call_seconds", "callDurationSeconds", "call_duration_seconds", "totalCallDurationSeconds", "total_call_duration_seconds");
                    if (totalCallMinutes <= 0 && totalCallSeconds > 0)
                        totalCallMinutes = totalCallSeconds / 60d;

                    var meetingsHosted =
                        ReadIntAny(metricElement, "meetingsHosted", "meetings_hosted", "hostedMeetings", "hosted_meetings", "meetings", "meetingCount", "meeting_count")
                        + ReadIntAny(item, "meetingsHosted", "meetings_hosted", "hostedMeetings", "hosted_meetings", "meetings", "meetingCount", "meeting_count");
                    var meetingsJoined =
                        ReadIntAny(metricElement, "meetingsJoined", "meetings_joined", "joinedMeetings", "joined_meetings")
                        + ReadIntAny(item, "meetingsJoined", "meetings_joined", "joinedMeetings", "joined_meetings");
                    var meetingMinutes = ReadDoubleAny(metricElement, "meetingMinutes", "meeting_minutes", "meetingsMinutes", "meetings_minutes", "totalMeetingMinutes", "total_meeting_minutes");
                    if (meetingMinutes <= 0)
                        meetingMinutes = ReadDoubleAny(item, "meetingMinutes", "meeting_minutes", "meetingsMinutes", "meetings_minutes", "totalMeetingMinutes", "total_meeting_minutes");
                    if (meetingsHosted <= 0 && meetingMinutes > 0)
                    {
                        // Some Zoom payloads only expose meeting minutes; approximate count for reporting.
                        meetingsHosted = Math.Max(1, (int)Math.Round(meetingMinutes / 30d, MidpointRounding.AwayFromZero));
                    }
                    if (meetingsJoined <= 0 && meetingMinutes > 0)
                    {
                        meetingsJoined = meetingsHosted;
                    }

                    var row = new ZoomUserMetricLite
                    {
                        ZoomUserId = ReadStringAny(metricElement, "zoomUserId", "zoom_user_id", "userId", "user_id")
                            ?? ReadStringAny(userElement, "zoomUserId", "zoom_user_id", "userId", "user_id")
                            ?? ReadStringAny(item, "zoomUserId", "zoom_user_id", "userId", "user_id"),
                        Email = ReadStringAny(userElement, "email", "userEmail", "user_email", "workEmail", "work_email")
                            ?? ReadStringAny(item, "email", "userEmail", "user_email", "workEmail", "work_email"),
                        TotalCalls = totalCalls,
                        TotalCallMinutes = Math.Max(0, totalCallMinutes),
                        SmsSessionCount = ReadIntAny(metricElement, "smsSessionCount", "sms_session_count", "smsCount", "sms_count", "textCount", "text_count")
                            + ReadIntAny(metricElement, "smsReceivedCount", "sms_received_count", "smsSentCount", "sms_sent_count"),
                        MeetingsHosted = meetingsHosted,
                        MeetingsJoined = meetingsJoined,
                        MeetingMinutes = Math.Max(0, meetingMinutes)
                    };
                    if (row.SmsSessionCount <= 0)
                        row.SmsSessionCount = ReadIntAny(item, "smsSessionCount", "sms_session_count", "smsCount", "sms_count", "textCount", "text_count");

                    if (!string.IsNullOrWhiteSpace(row.Email))
                    {
                        var emailKey = row.Email!.Trim().ToLower();
                        metricsByEmail[emailKey] = row;
                        var localPart = ExtractEmailLocalPart(emailKey);
                        if (!string.IsNullOrWhiteSpace(localPart))
                            metricsByEmailLocal[localPart] = row;
                    }
                    if (!string.IsNullOrWhiteSpace(row.ZoomUserId))
                        metricsByZoomUserId[row.ZoomUserId!.Trim()] = row;
                    var nameKey = NormalizeName(
                        ReadStringAny(userElement, "displayName", "display_name", "userName", "user_name", "name")
                        ?? ReadStringAny(item, "displayName", "display_name", "userName", "user_name", "name")
                    );
                    if (!string.IsNullOrWhiteSpace(nameKey))
                        metricsByName[nameKey] = row;
                    if (row.TotalCalls > 0) crmMetricsRowsWithCalls++;
                    if (row.SmsSessionCount > 0) crmMetricsRowsWithTexts++;
                }
            }

        var fromDate = targetStart.ToString("yyyy-MM-dd");
        var toDate = rangeEnd.ToString("yyyy-MM-dd");
        var smsByOwner = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        var smsRows = 0;
        try
        {
            var smsResponse = await client.GetAsync($"{crmBase}/phone/sms?from={fromDate}&to={toDate}&pageSize=500");
            if (smsResponse.IsSuccessStatusCode)
            {
                var smsJson = await smsResponse.Content.ReadAsStringAsync();
                using var smsDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(smsJson) ? "{}" : smsJson);
                if (TryGetPropertyIgnoreCase(smsDoc.RootElement, "data", out var smsData)
                    && smsData.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in smsData.EnumerateArray())
                    {
                        smsRows++;
                        var ownerId = ReadString(item, "ownerUserId");
                        if (string.IsNullOrWhiteSpace(ownerId)) continue;
                        if (!smsByOwner.TryGetValue(ownerId!, out var count)) count = 0;
                        smsByOwner[ownerId!] = count + 1;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Zoom SMS pull via gateway failed; using smsSessionCount fallback");
        }

        var meetingRows = new List<(string? HostId, string? HostEmail, string? HostName, DateTime? StartUtc)>();
        try
        {
            var meetingsResponse = await client.GetAsync($"{crmBase}/meetings?type=past&pageSize=500");
            if (meetingsResponse.IsSuccessStatusCode)
            {
                var meetingsJson = await meetingsResponse.Content.ReadAsStringAsync();
                using var meetingsDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(meetingsJson) ? "{}" : meetingsJson);
                if (TryGetPropertyIgnoreCase(meetingsDoc.RootElement, "data", out var meetingsData)
                    && meetingsData.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in meetingsData.EnumerateArray())
                    {
                        var startRaw = ReadStringAny(item, "startTime", "start_time", "date", "meetingDate", "meeting_date");
                        DateTime? startUtc = null;
                        if (!string.IsNullOrWhiteSpace(startRaw) && DateTime.TryParse(startRaw, out var parsedStart))
                            startUtc = parsedStart.ToUniversalTime();
                        if (startUtc.HasValue)
                        {
                            var day = startUtc.Value.Date;
                            if (day < targetStart.Date || day > rangeEnd.Date) continue;
                        }

                        var hostNode = default(JsonElement);
                        var hasHostNode = TryGetPropertyIgnoreCase(item, "host", out hostNode) && hostNode.ValueKind == JsonValueKind.Object;
                        var hostId =
                            ReadStringAny(item, "hostId", "host_id", "ownerUserId", "owner_user_id", "userId", "user_id")
                            ?? (hasHostNode ? ReadStringAny(hostNode, "id", "hostId", "host_id", "userId", "user_id") : null);
                        var hostEmail =
                            ReadStringAny(item, "hostEmail", "host_email", "ownerEmail", "owner_email", "email")
                            ?? (hasHostNode ? ReadStringAny(hostNode, "email", "hostEmail", "host_email") : null);
                        var hostName =
                            ReadStringAny(item, "hostName", "host_name", "ownerName", "owner_name", "name")
                            ?? (hasHostNode ? ReadStringAny(hostNode, "name", "displayName", "display_name") : null);
                        meetingRows.Add((hostId?.Trim(), hostEmail?.Trim().ToLowerInvariant(), NormalizeName(hostName), startUtc));
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Zoom meetings pull via gateway failed; continuing without meetings fallback");
        }

        var callByEmployee = new Dictionary<int, int>();
        var textByEmployee = new Dictionary<int, int>();
        var meetingsHostedByEmployee = new Dictionary<int, int>();
        var meetingsJoinedByEmployee = new Dictionary<int, int>();
        var totalCallMinutesByEmployee = new Dictionary<int, double>();
        var matchedCount = 0;
        foreach (var emp in employees)
        {
            var emailCandidates = new[]
            {
                emp.Email,
                emp.ZoomEmail,
                emp.PersonalEmail
            }
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v!.Trim().ToLowerInvariant())
            .Distinct()
            .ToList();
            var emailLocalCandidates = emailCandidates
                .Select(ExtractEmailLocalPart)
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var mappedZoomUserIds = emailCandidates
                .Select(email => zoomUserIdByEmail.GetValueOrDefault(email))
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => v!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var employeeNameKey = NormalizeName(emp.Name);

            ZoomUserMetricLite? zoomMetric = null;
            foreach (var emailKey in emailCandidates)
            {
                if (metricsByEmail.TryGetValue(emailKey, out zoomMetric))
                    break;
            }

            if (zoomMetric == null)
            {
                foreach (var localEmailKey in emailLocalCandidates)
                {
                    if (metricsByEmailLocal.TryGetValue(localEmailKey!, out zoomMetric))
                        break;
                }
            }

            if (zoomMetric == null
                && !string.IsNullOrWhiteSpace(emp.ZoomUserId)
                && metricsByZoomUserId.TryGetValue(emp.ZoomUserId.Trim(), out var byZoomUser))
            {
                zoomMetric = byZoomUser;
            }
            if (zoomMetric == null && mappedZoomUserIds.Count > 0)
            {
                foreach (var mappedZoomUserId in mappedZoomUserIds)
                {
                    if (metricsByZoomUserId.TryGetValue(mappedZoomUserId, out var mappedByZoomUser))
                    {
                        zoomMetric = mappedByZoomUser;
                        break;
                    }
                }
            }

            if (zoomMetric == null
                && !string.IsNullOrWhiteSpace(employeeNameKey)
                && metricsByName.TryGetValue(employeeNameKey, out var byName))
            {
                zoomMetric = byName;
            }

            var zoomUserId = zoomMetric?.ZoomUserId ?? emp.ZoomUserId ?? mappedZoomUserIds.FirstOrDefault();
            var smsCount = 0;
            if (!string.IsNullOrWhiteSpace(zoomUserId) && smsByOwner.TryGetValue(zoomUserId!, out var mappedSms))
                smsCount = mappedSms;
            else
                smsCount = zoomMetric?.SmsSessionCount ?? 0;

            if ((zoomMetric?.TotalCalls ?? 0) > 0 || smsCount > 0)
                matchedCount++;

            callByEmployee[emp.EmployeeId] = zoomMetric?.TotalCalls ?? 0;
            textByEmployee[emp.EmployeeId] = smsCount;
            meetingsHostedByEmployee[emp.EmployeeId] = zoomMetric?.MeetingsHosted ?? 0;
            meetingsJoinedByEmployee[emp.EmployeeId] = zoomMetric?.MeetingsJoined ?? 0;
            totalCallMinutesByEmployee[emp.EmployeeId] = Math.Max(0, zoomMetric?.TotalCallMinutes ?? 0);

            if (meetingRows.Count > 0
                && meetingsHostedByEmployee[emp.EmployeeId] <= 0
                && meetingsJoinedByEmployee[emp.EmployeeId] <= 0)
            {
                var zoomIdCandidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (!string.IsNullOrWhiteSpace(emp.ZoomUserId))
                    zoomIdCandidates.Add(emp.ZoomUserId.Trim());
                foreach (var mapped in mappedZoomUserIds.Where(v => !string.IsNullOrWhiteSpace(v)))
                    zoomIdCandidates.Add(mapped.Trim());

                var emailCandidateSet = new HashSet<string>(emailCandidates, StringComparer.OrdinalIgnoreCase);
                var hosted = 0;
                foreach (var meeting in meetingRows)
                {
                    var hostMatched =
                        (!string.IsNullOrWhiteSpace(meeting.HostId) && zoomIdCandidates.Contains(meeting.HostId))
                        || (!string.IsNullOrWhiteSpace(meeting.HostEmail) && emailCandidateSet.Contains(meeting.HostEmail))
                        || (!string.IsNullOrWhiteSpace(employeeNameKey) && !string.IsNullOrWhiteSpace(meeting.HostName) && string.Equals(meeting.HostName, employeeNameKey, StringComparison.OrdinalIgnoreCase));
                    if (hostMatched) hosted++;
                }
                if (hosted > 0)
                {
                    meetingsHostedByEmployee[emp.EmployeeId] = hosted;
                    meetingsJoinedByEmployee[emp.EmployeeId] = hosted;
                }
            }
        }

        var usedCallLogFallback = false;
        var callLogFallbackMatchedEmployees = 0;
        var callLogRows = 0;
        var callLogRowsMatched = 0;
        var shouldUseCallLogFallback = matchedCount == 0 || matchedCount < Math.Min(5, employees.Count);
        if (shouldUseCallLogFallback)
        {
            try
            {
                var emailToEmployeeIds = new Dictionary<string, HashSet<int>>(StringComparer.OrdinalIgnoreCase);
                var nameToEmployeeIds = new Dictionary<string, HashSet<int>>(StringComparer.OrdinalIgnoreCase);
                var zoomUserIdToEmployeeIds = new Dictionary<string, HashSet<int>>(StringComparer.OrdinalIgnoreCase);
                foreach (var emp in employees)
                {
                    var keys = new[] { emp.Email, emp.ZoomEmail, emp.PersonalEmail }
                        .Where(v => !string.IsNullOrWhiteSpace(v))
                        .Select(v => v!.Trim().ToLowerInvariant())
                        .Distinct();
                    foreach (var key in keys)
                    {
                        if (!emailToEmployeeIds.TryGetValue(key, out var ids))
                        {
                            ids = new HashSet<int>();
                            emailToEmployeeIds[key] = ids;
                        }
                        ids.Add(emp.EmployeeId);

                        var localPart = ExtractEmailLocalPart(key);
                        if (!string.IsNullOrWhiteSpace(localPart))
                        {
                            if (!emailToEmployeeIds.TryGetValue(localPart!, out var localIds))
                            {
                                localIds = new HashSet<int>();
                                emailToEmployeeIds[localPart!] = localIds;
                            }
                            localIds.Add(emp.EmployeeId);
                        }
                    }

                    var zoomUserIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    if (!string.IsNullOrWhiteSpace(emp.ZoomUserId))
                        zoomUserIds.Add(emp.ZoomUserId.Trim());
                    foreach (var key in keys)
                    {
                        var mappedZoomUserId = zoomUserIdByEmail.GetValueOrDefault(key);
                        if (!string.IsNullOrWhiteSpace(mappedZoomUserId))
                            zoomUserIds.Add(mappedZoomUserId.Trim());
                    }
                    foreach (var zoomUserId in zoomUserIds)
                    {
                        if (!zoomUserIdToEmployeeIds.TryGetValue(zoomUserId, out var ids))
                        {
                            ids = new HashSet<int>();
                            zoomUserIdToEmployeeIds[zoomUserId] = ids;
                        }
                        ids.Add(emp.EmployeeId);
                    }

                    var nameKey = NormalizeName(emp.Name);
                    if (!string.IsNullOrWhiteSpace(nameKey))
                    {
                        if (!nameToEmployeeIds.TryGetValue(nameKey, out var ids))
                        {
                            ids = new HashSet<int>();
                            nameToEmployeeIds[nameKey] = ids;
                        }
                        ids.Add(emp.EmployeeId);
                    }
                }

                var callLogsResponse = await client.GetAsync($"{crmBase}/phone/call-logs?from={fromDate}&to={toDate}&pageSize=500");
                if (callLogsResponse.IsSuccessStatusCode)
                {
                    var body = await callLogsResponse.Content.ReadAsStringAsync();
                    using var callDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
                    if (TryGetPropertyIgnoreCase(callDoc.RootElement, "data", out var callData)
                        && callData.ValueKind == JsonValueKind.Array)
                    {
                        var matchedEmployees = new HashSet<int>();
                        var fallbackCallByEmployee = new Dictionary<int, int>();
                        var fallbackCallMinutesByEmployee = new Dictionary<int, double>();
                        foreach (var item in callData.EnumerateArray())
                        {
                            callLogRows++;
                            var matchedIds = new HashSet<int>();
                            var ownerUserId = ReadStringAny(item, "ownerUserId", "owner_user_id", "userId", "user_id", "agentId", "agent_id");
                            var ownerEmail = ReadStringAny(item, "ownerEmail", "owner_email", "userEmail", "user_email");
                            var callerEmail = ReadStringAny(item, "caller_email", "callerEmail");
                            var calleeEmail = ReadStringAny(item, "callee_email", "calleeEmail");
                            var ownerName = NormalizeName(ReadStringAny(item, "ownerName", "owner_name", "agentName", "agent_name"));
                            var callerName = NormalizeName(ReadStringAny(item, "caller_name", "callerName"));
                            var calleeName = NormalizeName(ReadStringAny(item, "callee_name", "calleeName"));

                            if (TryGetPropertyIgnoreCase(item, "owner", out var ownerNode)
                                && ownerNode.ValueKind == JsonValueKind.Object)
                            {
                                ownerUserId ??= ReadStringAny(ownerNode, "id", "userId", "user_id", "zoomUserId", "zoom_user_id");
                                ownerEmail ??= ReadStringAny(ownerNode, "email", "userEmail", "user_email");
                                if (string.IsNullOrWhiteSpace(ownerName))
                                    ownerName = NormalizeName(ReadStringAny(ownerNode, "name", "displayName", "display_name"));
                            }
                            var durationMinutes = ReadDoubleAny(
                                item,
                                "durationMinutes", "duration_minutes", "callDurationMinutes", "call_duration_minutes",
                                "duration", "durationMin", "duration_mins", "durationMins");
                            var durationSeconds = ReadDoubleAny(
                                item,
                                "durationSeconds", "duration_seconds", "callDurationSeconds", "call_duration_seconds", "durationSec");
                            if (durationMinutes <= 0 && durationSeconds > 0)
                                durationMinutes = durationSeconds / 60d;
                            if (durationMinutes < 0) durationMinutes = 0;

                            if (!string.IsNullOrWhiteSpace(ownerUserId)
                                && zoomUserIdToEmployeeIds.TryGetValue(ownerUserId.Trim(), out var ownerIds))
                            {
                                foreach (var id in ownerIds) matchedIds.Add(id);
                            }

                            foreach (var key in new[] { ownerEmail, callerEmail, calleeEmail }
                                .Where(v => !string.IsNullOrWhiteSpace(v))
                                .Select(v => v!.Trim().ToLowerInvariant()))
                            {
                                if (emailToEmployeeIds.TryGetValue(key, out var ids))
                                {
                                    foreach (var id in ids) matchedIds.Add(id);
                                }
                                var localPart = ExtractEmailLocalPart(key);
                                if (!string.IsNullOrWhiteSpace(localPart)
                                    && emailToEmployeeIds.TryGetValue(localPart!, out var localIds))
                                {
                                    foreach (var id in localIds) matchedIds.Add(id);
                                }
                            }

                            if (matchedIds.Count == 0)
                            {
                                foreach (var nameKey in new[] { ownerName, callerName, calleeName }.Where(v => !string.IsNullOrWhiteSpace(v)))
                                {
                                    if (nameToEmployeeIds.TryGetValue(nameKey!, out var ids))
                                    {
                                        foreach (var id in ids) matchedIds.Add(id);
                                    }
                                }
                            }

                            foreach (var id in matchedIds)
                            {
                                fallbackCallByEmployee[id] = fallbackCallByEmployee.GetValueOrDefault(id) + 1;
                                fallbackCallMinutesByEmployee[id] = fallbackCallMinutesByEmployee.GetValueOrDefault(id) + durationMinutes;
                                matchedEmployees.Add(id);
                            }
                            if (matchedIds.Count > 0) callLogRowsMatched++;
                        }

                        if (matchedEmployees.Count > 0)
                        {
                            foreach (var kvp in fallbackCallByEmployee)
                            {
                                var existing = callByEmployee.GetValueOrDefault(kvp.Key);
                                callByEmployee[kvp.Key] = Math.Max(existing, kvp.Value);
                            }
                            foreach (var kvp in fallbackCallMinutesByEmployee)
                            {
                                var existing = totalCallMinutesByEmployee.GetValueOrDefault(kvp.Key);
                                totalCallMinutesByEmployee[kvp.Key] = Math.Max(existing, kvp.Value);
                            }

                            usedCallLogFallback = true;
                            callLogFallbackMatchedEmployees = matchedEmployees.Count;
                            matchedCount = employees.Count(emp =>
                                callByEmployee.GetValueOrDefault(emp.EmployeeId) > 0
                                || textByEmployee.GetValueOrDefault(emp.EmployeeId) > 0);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Call-log fallback aggregation failed for Zoom metrics");
            }
        }

        var rows = new List<object>(employees.Count);
        foreach (var emp in employees)
        {
            var totalCallMinutes = Math.Round(Math.Max(0, totalCallMinutesByEmployee.GetValueOrDefault(emp.EmployeeId)), 1);
            var callVolume = callByEmployee.GetValueOrDefault(emp.EmployeeId);
            rows.Add(new
            {
                employeeId = emp.EmployeeId,
                employeeName = emp.Name,
                email = emp.Email,
                callVolume = callVolume,
                textVolume = textByEmployee.GetValueOrDefault(emp.EmployeeId),
                meetingsHosted = meetingsHostedByEmployee.GetValueOrDefault(emp.EmployeeId),
                meetingsJoined = meetingsJoinedByEmployee.GetValueOrDefault(emp.EmployeeId),
                totalCallMinutes = totalCallMinutes,
                avgCallMinutes = callVolume > 0 ? Math.Round(totalCallMinutes / callVolume, 2) : 0,
                source = usedCallLogFallback ? "zoom-call-logs-fallback" : "zoom-crm-via-ttac-gateway"
            });
        }

            return Ok(new
            {
                data = rows,
                meta = new
                {
                    year = targetYear,
                    month = targetMonth,
                    from = fromDate,
                    to = toDate,
                    days,
                    source = "ttac-gateway->taylor-crm/zoom",
                    synced = sync,
                    matchedEmployees = matchedCount,
                    totalEmployees = employees.Count,
                    usedCallLogFallback,
                    fallbackTriggered = shouldUseCallLogFallback,
                    callLogFallbackMatchedEmployees,
                    crmMetricsRows,
                    crmMetricsRowsWithCalls,
                    crmMetricsRowsWithTexts,
                    smsRows,
                    callLogRows,
                    callLogRowsMatched,
                    employeeSource,
                    orgFilter
                }
            });
        }
    }

    private static string NormalizeName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        var decomposed = value.Trim().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            if (category == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(char.IsLetterOrDigit(c) ? char.ToLowerInvariant(c) : ' ');
        }
        return string.Join(' ', sb.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private static string? ExtractEmailLocalPart(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;
        var trimmed = email.Trim().ToLowerInvariant();
        var at = trimmed.IndexOf('@');
        if (at <= 0) return null;
        return trimmed[..at];
    }

    [HttpGet("integration-status")]
    public async Task<ActionResult<object>> GetIntegrationStatus()
    {
        var (_, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var gatewayBase = _configuration["GatewayPublicOpenUrl"]
            ?? Environment.GetEnvironmentVariable("GATEWAY_PUBLIC_OPEN_URL")
            ?? "https://ttac-gateway-production.up.railway.app/api/v1/open";
        var zoomUrl = $"{gatewayBase.TrimEnd('/')}/taylor-crm/api/v1/zoom/status";
        var googleUrl = $"{gatewayBase.TrimEnd('/')}/taylor-crm/api/v1/gmail/status";

        var serviceToken = _jwtService.GenerateToken(user);
        var authMode = !string.IsNullOrWhiteSpace(serviceToken) ? "service-jwt" : "incoming-bearer";

        var googleConnected = false;
        var googleStatus = 0;
        string? googleError = null;
        var zoomConnected = false;
        var zoomStatus = 0;
        string? zoomError = null;

        try
        {
            var incomingAuth = Request.Headers.Authorization.ToString();
            var client = _httpClientFactory.CreateClient();
            if (!string.IsNullOrWhiteSpace(serviceToken))
            {
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", serviceToken);
            }
            else if (!string.IsNullOrWhiteSpace(incomingAuth) && incomingAuth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                client.DefaultRequestHeaders.Authorization = AuthenticationHeaderValue.Parse(incomingAuth);
            }

            using var googleResponse = await client.GetAsync(googleUrl);
            googleStatus = (int)googleResponse.StatusCode;
            if (googleResponse.IsSuccessStatusCode)
            {
                var googleBody = await googleResponse.Content.ReadAsStringAsync();
                using var googleDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(googleBody) ? "{}" : googleBody);
                googleConnected = TryGetPropertyIgnoreCase(googleDoc.RootElement, "connected", out var connectedProp)
                    && connectedProp.ValueKind == JsonValueKind.True;
            }
            else
            {
                googleError = $"Google status probe returned HTTP {googleStatus}";
            }

            using var response = await client.GetAsync(zoomUrl);
            zoomStatus = (int)response.StatusCode;
            if (response.IsSuccessStatusCode)
            {
                var zoomBody = await response.Content.ReadAsStringAsync();
                using var zoomDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(zoomBody) ? "{}" : zoomBody);
                zoomConnected = TryGetPropertyIgnoreCase(zoomDoc.RootElement, "connected", out var zoomConnectedProp)
                    && zoomConnectedProp.ValueKind == JsonValueKind.True;
                if (!zoomConnected && TryGetPropertyIgnoreCase(zoomDoc.RootElement, "message", out var zoomMessageProp))
                {
                    zoomError = zoomMessageProp.GetString();
                }
            }
            else
            {
                zoomError = $"Zoom gateway probe returned HTTP {zoomStatus}";
            }
        }
        catch (Exception ex)
        {
            googleConnected = false;
            googleError = ex.Message;
            zoomConnected = false;
            zoomError = ex.Message;
            _logger.LogWarning(ex, "Performance reviews integration-status probe failed");
        }

        return Ok(new
        {
            data = new
            {
                google = new
                {
                    connected = googleConnected,
                    status = googleConnected ? "connected" : "not-connected",
                    statusCode = googleStatus > 0 ? googleStatus : (int?)null,
                    error = googleConnected ? null : googleError
                },
                zoom = new
                {
                    connected = zoomConnected,
                    status = zoomConnected ? "connected" : "not-connected",
                    statusCode = zoomStatus > 0 ? zoomStatus : (int?)null,
                    error = zoomConnected ? null : zoomError
                },
                authMode,
                last = new
                {
                    checkedAtUtc = DateTime.UtcNow
                }
            }
        });
    }

    [HttpPost("metrics-snapshot")]
    public async Task<ActionResult<object>> SnapshotMonthlyMetrics([FromBody] BulkMonthlyPerformanceMetricsSnapshotRequest request)
    {
        if (request.Rows == null || request.Rows.Count == 0)
            return BadRequest(new { message = "rows are required" });

        var (orgId, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var (year, month) = ResolvePeriod(request.Year, request.Month, request.Period);
        if (month is < 1 or > 12)
            return BadRequest(new { message = "month must be between 1 and 12" });

        var organizationId = orgId ?? user.OrganizationId ?? request.OrganizationId ?? 0;
        if (organizationId <= 0)
            return BadRequest(new { message = "organizationId is required" });

        var period = $"{year:D4}-{month:D2}";
        var normalizedPeriodMode = string.Equals(request.PeriodMode, "monthly", StringComparison.OrdinalIgnoreCase)
            ? "monthly"
            : "weekly";
        var finalizeMonthly = normalizedPeriodMode == "monthly" && request.FinalizeMonthly;
        var byEmployee = request.Rows
            .Where(r => r != null && r.EmployeeId > 0)
            .GroupBy(r => r.EmployeeId)
            .ToDictionary(g => g.Key, g => g.Last());

        if (byEmployee.Count == 0)
            return BadRequest(new { message = "at least one row with a valid employeeId is required" });

        var employeeIds = byEmployee.Keys.ToList();
        var userNames = await _context.Users
            .AsNoTracking()
            .Where(u => employeeIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Name })
            .ToDictionaryAsync(u => u.Id, u => u.Name ?? string.Empty);

        var existingRows = await _context.PerformanceReviews
            .Where(r => r.OrganizationId == organizationId
                && r.Year == year
                && r.Month == month
                && employeeIds.Contains(r.EmployeeId))
            .ToListAsync();

        var existingByEmployee = existingRows.ToDictionary(r => r.EmployeeId, r => r);
        var now = DateTime.UtcNow;
        var updated = 0;
        var inserted = 0;

        foreach (var (employeeId, metric) in byEmployee)
        {
            if (!existingByEmployee.TryGetValue(employeeId, out var review))
            {
                review = new PerformanceReview
                {
                    OrganizationId = organizationId,
                    EmployeeId = employeeId,
                    EmployeeName = FirstNonEmpty(metric.EmployeeName, userNames.GetValueOrDefault(employeeId), $"Employee #{employeeId}"),
                    ReviewerId = user.Id,
                    ReviewerName = user.Name,
                    ReviewType = normalizedPeriodMode,
                    Year = year,
                    Month = month,
                    Period = period,
                    OverallRating = 3,
                    Status = finalizeMonthly ? "completed" : "pending",
                    CreatedAt = now
                };
                _context.PerformanceReviews.Add(review);
                existingByEmployee[employeeId] = review;
                inserted++;
            }
            else
            {
                review.EmployeeName = FirstNonEmpty(review.EmployeeName, metric.EmployeeName, userNames.GetValueOrDefault(employeeId), $"Employee #{employeeId}");
                updated++;
            }

            review.Period = period;
            review.ReviewType = normalizedPeriodMode;
            if (finalizeMonthly)
                review.Status = "completed";
            review.CallVolume = Math.Max(metric.CallVolume, 0);
            review.TextVolume = Math.Max(metric.TextVolume, 0);
            review.ClockedHours = ToMoney(metric.ClockedHours);
            review.WorkHours = ToMoney(metric.WorkHours);
            review.ActivityRate = ToRate(metric.ActivityRate);
            review.InvoicedRevenue = ToMoney(metric.InvoicedRevenue);
            review.Score = Math.Clamp(metric.Score, 0, 100);
            review.UpdatedAt = now;
        }

        await _context.SaveChangesAsync();

        return Ok(new
        {
            data = new
            {
                organizationId,
                year,
                month,
                period,
                periodMode = normalizedPeriodMode,
                finalizeMonthly,
                inserted,
                updated,
                total = byEmployee.Count
            }
        });
    }

    [HttpPost("daily-metrics-upsert")]
    public async Task<ActionResult<object>> UpsertDailyMetrics([FromBody] BulkDailyPerformanceMetricsUpsertRequest request)
    {
        if (request.Rows == null || request.Rows.Count == 0)
            return BadRequest(new { message = "rows are required" });

        var (orgId, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var organizationId = orgId ?? user.OrganizationId ?? request.OrganizationId ?? 0;
        if (organizationId <= 0)
            return BadRequest(new { message = "organizationId is required" });

        var metricDate = DateTime.UtcNow.Date;
        if (!string.IsNullOrWhiteSpace(request.MetricDate) && DateTime.TryParse(request.MetricDate, out var parsedDate))
            metricDate = parsedDate.Date;

        var byEmployee = request.Rows
            .Where(r => r != null && r.EmployeeId > 0)
            .GroupBy(r => r.EmployeeId)
            .ToDictionary(g => g.Key, g => g.Last());
        if (byEmployee.Count == 0)
            return BadRequest(new { message = "at least one row with a valid employeeId is required" });

        var employeeIds = byEmployee.Keys.ToList();
        var existingRows = await _context.EmployeePerformanceDailyMetrics
            .Where(r => r.OrganizationId == organizationId
                && r.MetricDate == metricDate
                && employeeIds.Contains(r.EmployeeId))
            .ToListAsync();
        var existingByEmployee = existingRows.ToDictionary(r => r.EmployeeId, r => r);

        var now = DateTime.UtcNow;
        var inserted = 0;
        var updated = 0;
        var skipped = 0;

        foreach (var (employeeId, metric) in byEmployee)
        {
            if (!existingByEmployee.TryGetValue(employeeId, out var row))
            {
                row = new EmployeePerformanceDailyMetric
                {
                    OrganizationId = organizationId,
                    EmployeeId = employeeId,
                    MetricDate = metricDate,
                    CreatedAt = now
                };
                _context.EmployeePerformanceDailyMetrics.Add(row);
                inserted++;
            }
            else if (!request.ForceUpdateExisting)
            {
                skipped++;
                continue;
            }
            else
            {
                updated++;
            }

            row.EmployeeName = FirstNonEmpty(metric.EmployeeName, row.EmployeeName, $"Employee #{employeeId}");
            row.CallVolume = Math.Max(metric.CallVolume, 0);
            row.TextVolume = Math.Max(metric.TextVolume, 0);
            row.ClockedHours = ToMoney(metric.ClockedHours);
            row.WorkHours = ToMoney(metric.WorkHours);
            row.ActivityRate = ToRate(metric.ActivityRate);
            row.InvoicedRevenue = ToMoney(metric.InvoicedRevenue);
            row.Score = Math.Clamp(metric.Score, 0, 100);
            row.Source = string.IsNullOrWhiteSpace(metric.Source) ? "zoom-google-sync" : metric.Source.Trim();
            row.UpdatedAt = now;
        }

        await _context.SaveChangesAsync();
        return Ok(new
        {
            data = new
            {
                organizationId,
                metricDate = metricDate.ToString("yyyy-MM-dd"),
                inserted,
                updated,
                skipped,
                total = byEmployee.Count
            }
        });
    }

    [HttpGet("daily-metrics-table")]
    public async Task<ActionResult<object>> GetDailyMetricsTable([FromQuery] string? from, [FromQuery] string? to)
    {
        var (orgId, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var organizationId = orgId ?? user.OrganizationId ?? 0;
        if (organizationId <= 0)
            return BadRequest(new { message = "organizationId is required" });

        var now = DateTime.UtcNow.Date;
        var fromDate = now.AddDays(-6);
        var toDate = now;
        if (!string.IsNullOrWhiteSpace(from) && DateTime.TryParse(from, out var parsedFrom))
            fromDate = parsedFrom.Date;
        if (!string.IsNullOrWhiteSpace(to) && DateTime.TryParse(to, out var parsedTo))
            toDate = parsedTo.Date;
        if (toDate < fromDate) (fromDate, toDate) = (toDate, fromDate);

        var rows = await _context.EmployeePerformanceDailyMetrics
            .AsNoTracking()
            .Where(r => r.OrganizationId == organizationId
                && r.MetricDate >= fromDate
                && r.MetricDate <= toDate)
            .ToListAsync();

        var aggregated = rows
            .GroupBy(r => new { r.EmployeeId, r.EmployeeName })
            .Select(g => new
            {
                employeeId = g.Key.EmployeeId,
                employeeName = g.Key.EmployeeName,
                callVolume = g.Sum(x => x.CallVolume),
                textVolume = g.Sum(x => x.TextVolume),
                clockedHours = Math.Round(g.Sum(x => x.ClockedHours), 2),
                workHours = Math.Round(g.Sum(x => x.WorkHours), 2),
                activityRate = g.Sum(x => x.ClockedHours) > 0
                    ? Math.Round(g.Sum(x => x.WorkHours) / g.Sum(x => x.ClockedHours), 4)
                    : 0m,
                invoicedRevenue = Math.Round(g.Sum(x => x.InvoicedRevenue), 2),
                score = (int)Math.Round(g.Average(x => (double)x.Score))
            })
            .OrderBy(x => x.employeeName)
            .ToList();

        return Ok(new
        {
            data = aggregated,
            meta = new
            {
                from = fromDate.ToString("yyyy-MM-dd"),
                to = toDate.ToString("yyyy-MM-dd"),
                totalEmployees = aggregated.Count
            }
        });
    }

    private static decimal ToMoney(decimal value) => Math.Round(Math.Max(value, 0), 2);
    private static decimal ToRate(decimal value) => Math.Round(Math.Clamp(value, 0m, 1m), 4);

    private static (int year, int month) ResolvePeriod(UpsertMonthlyPerformanceReviewRequest request)
        => ResolvePeriod(request.Year, request.Month, request.Period);

    private static (int year, int month) ResolvePeriod(int? year, int? month, string? period)
    {
        if (year.HasValue && month.HasValue)
            return (year.Value, month.Value);

        if (!string.IsNullOrWhiteSpace(period))
        {
            var parts = period.Split('-', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 2
                && int.TryParse(parts[0], out var pYear)
                && int.TryParse(parts[1], out var pMonth))
            {
                return (pYear, pMonth);
            }
        }

        var now = DateTime.UtcNow;
        return (now.Year, now.Month);
    }

    private static string FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim() ?? string.Empty;

    private static bool TryGetPropertyIgnoreCase(JsonElement element, string name, out JsonElement value)
    {
        foreach (var prop in element.EnumerateObject())
        {
            if (string.Equals(prop.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = prop.Value;
                return true;
            }
        }
        value = default;
        return false;
    }

    private static string? ReadString(JsonElement element, string propName)
    {
        if (!TryGetPropertyIgnoreCase(element, propName, out var value)) return null;
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null
        };
    }

    private static int ReadInt(JsonElement element, string propName)
    {
        if (!TryGetPropertyIgnoreCase(element, propName, out var value)) return 0;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var num)) return num;
        if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed)) return parsed;
        return 0;
    }

    private static double ReadDouble(JsonElement element, string propName)
    {
        if (!TryGetPropertyIgnoreCase(element, propName, out var value)) return 0;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var num)) return num;
        if (value.ValueKind == JsonValueKind.String && double.TryParse(value.GetString(), out var parsed)) return parsed;
        return 0;
    }

    private static string? ReadStringAny(JsonElement element, params string[] propNames)
    {
        foreach (var propName in propNames)
        {
            var value = ReadString(element, propName);
            if (!string.IsNullOrWhiteSpace(value)) return value;
        }
        return null;
    }

    private static int ReadIntAny(JsonElement element, params string[] propNames)
    {
        foreach (var propName in propNames)
        {
            var value = ReadInt(element, propName);
            if (value > 0) return value;
        }
        return 0;
    }

    private static double ReadDoubleAny(JsonElement element, params string[] propNames)
    {
        foreach (var propName in propNames)
        {
            var value = ReadDouble(element, propName);
            if (value > 0) return value;
        }
        return 0;
    }

    private static bool IsActiveEmploymentStatus(string? employmentStatus)
    {
        var status = (employmentStatus ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(status)) return true;
        if (status.Contains("inactive") || status.Contains("terminated") || status.Contains("deactivated")) return false;
        return status.Contains("active")
            || status.Contains("full-time")
            || status.Contains("full time")
            || status.Contains("part-time")
            || status.Contains("part time");
    }
}

public class UpsertMonthlyPerformanceReviewRequest
{
    public int? OrganizationId { get; set; }
    public int EmployeeId { get; set; }
    public int? Year { get; set; }
    public int? Month { get; set; }
    public string? Period { get; set; }
    public int OverallRating { get; set; } = 3;
    public string? Strengths { get; set; }
    public string? AreasForImprovement { get; set; }
    public string? Goals { get; set; }
    public string? Comments { get; set; }
    public string Status { get; set; } = "pending";
    public int CallVolume { get; set; }
    public int TextVolume { get; set; }
    public decimal ClockedHours { get; set; }
    public decimal WorkHours { get; set; }
    public decimal ActivityRate { get; set; }
    public decimal InvoicedRevenue { get; set; }
    public int Score { get; set; }
}

internal class ZoomUserMetricLite
{
    public string? ZoomUserId { get; set; }
    public string? Email { get; set; }
    public int TotalCalls { get; set; }
    public double TotalCallMinutes { get; set; }
    public int SmsSessionCount { get; set; }
    public int MeetingsHosted { get; set; }
    public int MeetingsJoined { get; set; }
    public double MeetingMinutes { get; set; }
}

public class BulkMonthlyPerformanceMetricsSnapshotRequest
{
    public int? OrganizationId { get; set; }
    public int? Year { get; set; }
    public int? Month { get; set; }
    public string? Period { get; set; }
    public string? PeriodMode { get; set; }
    public bool FinalizeMonthly { get; set; }
    public List<MonthlyPerformanceMetricSnapshotRow> Rows { get; set; } = new();
}

public class MonthlyPerformanceMetricSnapshotRow
{
    public int EmployeeId { get; set; }
    public string? EmployeeName { get; set; }
    public int CallVolume { get; set; }
    public int TextVolume { get; set; }
    public decimal ClockedHours { get; set; }
    public decimal WorkHours { get; set; }
    public decimal ActivityRate { get; set; }
    public decimal InvoicedRevenue { get; set; }
    public int Score { get; set; }
}

public class BulkDailyPerformanceMetricsUpsertRequest
{
    public int? OrganizationId { get; set; }
    public string? MetricDate { get; set; }
    public bool ForceUpdateExisting { get; set; }
    public List<DailyPerformanceMetricUpsertRow> Rows { get; set; } = new();
}

public class DailyPerformanceMetricUpsertRow
{
    public int EmployeeId { get; set; }
    public string? EmployeeName { get; set; }
    public int CallVolume { get; set; }
    public int TextVolume { get; set; }
    public decimal ClockedHours { get; set; }
    public decimal WorkHours { get; set; }
    public decimal ActivityRate { get; set; }
    public decimal InvoicedRevenue { get; set; }
    public int Score { get; set; }
    public string? Source { get; set; }
}

internal class ZoomEmployeeCandidate
{
    public int EmployeeId { get; set; }
    public string? Email { get; set; }
    public string? Name { get; set; }
    public string? EmploymentStatus { get; set; }
    public string? Status { get; set; }
    public string? ZoomEmail { get; set; }
    public string? ZoomUserId { get; set; }
    public string? PersonalEmail { get; set; }
}
