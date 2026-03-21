using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;
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
    private readonly ILogger<PerformanceReviewsController> _logger;

    public PerformanceReviewsController(
        TaylorAccessDbContext context,
        CurrentUserService currentUserService,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<PerformanceReviewsController> logger)
    {
        _context = context;
        _currentUserService = currentUserService;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
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
    public async Task<ActionResult<object>> GetZoomMetrics([FromQuery] int? year, [FromQuery] int? month, [FromQuery] bool sync = true)
    {
        var (orgId, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var now = DateTime.UtcNow;
        var targetYear = year ?? now.Year;
        var targetMonth = month ?? now.Month;
        var targetStart = new DateTime(targetYear, targetMonth, 1, 0, 0, 0, DateTimeKind.Utc);
        var nextMonth = targetStart.AddMonths(1);

        // CRM endpoint only supports "last N days". For exact historical months, use saved snapshots.
        if (targetStart.Month != now.Month || targetStart.Year != now.Year)
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

        var orgFilter = orgId ?? user.OrganizationId ?? 0;
        if (orgFilter <= 0)
            return Ok(new { data = Array.Empty<object>(), meta = new { year = targetYear, month = targetMonth, note = "No organization context" } });

        var employeeCandidates = await _context.EmployeeRosters
            .AsNoTracking()
            .Include(er => er.User)
            .Where(er => er.OrganizationId == orgFilter
                && er.User != null
                && !string.IsNullOrWhiteSpace(er.User.Email))
            .Select(er => new
            {
                employeeId = er.UserId,
                email = er.User!.Email!,
                name = er.User.Name,
                employmentStatus = er.EmploymentStatus
            })
            .ToListAsync();

        var employees = employeeCandidates
            .Where(emp => IsActiveEmploymentStatus(emp.employmentStatus))
            .Select(emp => new
            {
                emp.employeeId,
                emp.email,
                emp.name
            })
            .ToList();

        if (employees.Count == 0)
            return Ok(new { data = Array.Empty<object>(), meta = new { year = targetYear, month = targetMonth, note = "No active employees found" } });

        var days = Math.Max(1, (int)Math.Ceiling((now.Date - targetStart.Date).TotalDays) + 1);
        var gatewayBase = _configuration["GatewayPublicOpenUrl"]
            ?? Environment.GetEnvironmentVariable("GATEWAY_PUBLIC_OPEN_URL")
            ?? "https://ttac-gateway-production.up.railway.app/api/v1/open";
        var crmBase = $"{gatewayBase.TrimEnd('/')}/taylor-crm/api/v1/zoom";

        var incomingAuth = Request.Headers.Authorization.ToString();
        var client = _httpClientFactory.CreateClient();
        if (!string.IsNullOrWhiteSpace(incomingAuth) && incomingAuth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            client.DefaultRequestHeaders.Authorization = AuthenticationHeaderValue.Parse(incomingAuth);
        }

        if (sync)
        {
            try
            {
                await client.PostAsync($"{crmBase}/metrics/compute?days={days}", content: null);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Zoom metrics compute call via gateway failed; continuing with available CRM data");
            }
        }

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
                    error = $"Failed to fetch zoom metrics: {(int)metricsResponse.StatusCode}"
                }
            });
        }

        var metricsJson = await metricsResponse.Content.ReadAsStringAsync();
        using var metricsDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(metricsJson) ? "{}" : metricsJson);
        var metricsByEmail = new Dictionary<string, ZoomUserMetricLite>(StringComparer.OrdinalIgnoreCase);
        var metricsByZoomUserId = new Dictionary<string, ZoomUserMetricLite>(StringComparer.OrdinalIgnoreCase);

        if (TryGetPropertyIgnoreCase(metricsDoc.RootElement, "data", out var metricsData)
            && metricsData.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in metricsData.EnumerateArray())
            {
                var row = new ZoomUserMetricLite
                {
                    ZoomUserId = ReadStringAny(item, "zoomUserId", "zoom_user_id", "userId", "user_id"),
                    Email = ReadStringAny(item, "email", "userEmail", "user_email"),
                    TotalCalls = ReadIntAny(item, "totalCalls", "total_calls", "calls", "callCount", "call_count"),
                    SmsSessionCount = ReadIntAny(item, "smsSessionCount", "sms_session_count", "smsCount", "sms_count", "textCount", "text_count"),
                    MeetingsHosted = ReadIntAny(item, "meetingsHosted", "meetings_hosted")
                };

                if (!string.IsNullOrWhiteSpace(row.Email))
                    metricsByEmail[row.Email!.Trim().ToLower()] = row;
                if (!string.IsNullOrWhiteSpace(row.ZoomUserId))
                    metricsByZoomUserId[row.ZoomUserId!.Trim()] = row;
            }
        }

        var fromDate = targetStart.ToString("yyyy-MM-dd");
        var toDate = now.ToString("yyyy-MM-dd");
        var smsByOwner = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

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

        var rows = new List<object>(employees.Count);
        foreach (var emp in employees)
        {
            var emailKey = emp.email.Trim().ToLower();
            metricsByEmail.TryGetValue(emailKey, out var zoomMetric);
            var zoomUserId = zoomMetric?.ZoomUserId;
            var smsCount = 0;
            if (!string.IsNullOrWhiteSpace(zoomUserId) && smsByOwner.TryGetValue(zoomUserId!, out var mappedSms))
                smsCount = mappedSms;
            else
                smsCount = zoomMetric?.SmsSessionCount ?? 0;

            rows.Add(new
            {
                employeeId = emp.employeeId,
                employeeName = emp.name,
                email = emp.email,
                callVolume = zoomMetric?.TotalCalls ?? 0,
                textVolume = smsCount,
                meetingsHosted = zoomMetric?.MeetingsHosted ?? 0,
                source = "zoom-crm-via-ttac-gateway"
            });
        }

        return Ok(new
        {
            data = rows,
            meta = new
            {
                year = targetYear,
                month = targetMonth,
                days,
                source = "ttac-gateway->taylor-crm/zoom",
                synced = sync
            }
        });
    }

    [HttpGet("integration-status")]
    public async Task<ActionResult<object>> GetIntegrationStatus()
    {
        var (_, user, error) = await _currentUserService.ResolveOrgFilterAsync();
        if (error != null || user == null) return Unauthorized(new { message = error ?? "Unauthorized" });

        var googleConnected =
            !string.IsNullOrWhiteSpace(_configuration["GOOGLE_CLIENT_ID"])
            || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID"))
            || !string.IsNullOrWhiteSpace(_configuration["GOOGLE_API_KEY"])
            || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GOOGLE_API_KEY"))
            || !string.IsNullOrWhiteSpace(_configuration["GOOGLE_SERVICE_ACCOUNT_JSON"])
            || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_JSON"));

        var gatewayBase = _configuration["GatewayPublicOpenUrl"]
            ?? Environment.GetEnvironmentVariable("GATEWAY_PUBLIC_OPEN_URL")
            ?? "https://ttac-gateway-production.up.railway.app/api/v1/open";
        var zoomUrl = $"{gatewayBase.TrimEnd('/')}/taylor-crm/api/v1/zoom/metrics/users?days=1";

        var zoomConnected = false;
        var zoomStatus = 0;
        string? zoomError = null;

        try
        {
            var incomingAuth = Request.Headers.Authorization.ToString();
            var client = _httpClientFactory.CreateClient();
            if (!string.IsNullOrWhiteSpace(incomingAuth) && incomingAuth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                client.DefaultRequestHeaders.Authorization = AuthenticationHeaderValue.Parse(incomingAuth);
            }

            using var response = await client.GetAsync(zoomUrl);
            zoomStatus = (int)response.StatusCode;
            zoomConnected = response.IsSuccessStatusCode || zoomStatus == 400 || zoomStatus == 401 || zoomStatus == 403 || zoomStatus == 404 || zoomStatus == 405;

            if (!zoomConnected)
            {
                zoomError = $"Zoom gateway probe returned HTTP {zoomStatus}";
            }
        }
        catch (Exception ex)
        {
            zoomConnected = false;
            zoomError = ex.Message;
            _logger.LogWarning(ex, "Performance reviews integration-status zoom probe failed");
        }

        return Ok(new
        {
            data = new
            {
                google = new
                {
                    connected = googleConnected,
                    status = googleConnected ? "configured" : "not-configured"
                },
                zoom = new
                {
                    connected = zoomConnected,
                    status = zoomConnected ? "connected" : "not-connected",
                    statusCode = zoomStatus > 0 ? zoomStatus : (int?)null,
                    error = zoomConnected ? null : zoomError
                },
                last = new
                {
                    checkedAtUtc = DateTime.UtcNow
                }
            }
        });
    }

    private static decimal ToMoney(decimal value) => Math.Round(Math.Max(value, 0), 2);
    private static decimal ToRate(decimal value) => Math.Round(Math.Clamp(value, 0m, 1m), 4);

    private static (int year, int month) ResolvePeriod(UpsertMonthlyPerformanceReviewRequest request)
    {
        if (request.Year.HasValue && request.Month.HasValue)
            return (request.Year.Value, request.Month.Value);

        if (!string.IsNullOrWhiteSpace(request.Period))
        {
            var parts = request.Period.Split('-', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
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
    public int SmsSessionCount { get; set; }
    public int MeetingsHosted { get; set; }
}
