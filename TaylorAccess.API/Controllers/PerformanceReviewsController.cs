using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

    public PerformanceReviewsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
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
