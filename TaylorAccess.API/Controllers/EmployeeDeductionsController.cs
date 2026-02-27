using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/employee-deductions")]
[Authorize]
public class EmployeeDeductionsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public EmployeeDeductionsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetDeductions(
        [FromQuery] int? userId = null, 
        [FromQuery] string? status = null,
        [FromQuery] string? category = null,
        [FromQuery] string? frequency = null,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 500)
    {
        var (orgId, user, orgErr) = await _currentUserService.ResolveOrgFilterAsync();
        if (orgErr != null) return Unauthorized(new { message = orgErr });

        var query = _context.EmployeeDeductions
            .Include(d => d.User)
            .Where(d => !orgId.HasValue || d.OrganizationId == orgId)
            .AsNoTracking()
            .AsQueryable();

        if (userId.HasValue)
            query = query.Where(d => d.UserId == userId.Value);

        if (!string.IsNullOrEmpty(status))
            query = query.Where(d => d.Status == status);

        if (!string.IsNullOrEmpty(category))
            query = query.Where(d => d.Category == category);

        if (!string.IsNullOrEmpty(frequency))
            query = query.Where(d => d.Frequency == frequency);

        var total = await query.CountAsync();

        var deductions = await query
            .OrderByDescending(d => d.CreatedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(d => new
            {
                d.Id,
                d.UserId,
                employeeName = d.User != null ? d.User.Name : null,
                d.Category,
                d.Description,
                d.Amount,
                d.Frequency,
                d.StartDate,
                d.EndDate,
                d.Status,
                d.TotalDeducted,
                d.OrganizationId,
                d.CreatedAt,
                d.UpdatedAt
            })
            .ToListAsync();

        var activeDeductions = deductions.Where(d => d.Status == "active").ToList();
        var summary = new
        {
            totalActive = activeDeductions.Sum(d => d.Amount),
            monthlyTotal = activeDeductions.Where(d => d.Frequency == "monthly").Sum(d => d.Amount),
            weeklyTotal = activeDeductions.Where(d => d.Frequency == "weekly").Sum(d => d.Amount),
            biweeklyTotal = activeDeductions.Where(d => d.Frequency == "biweekly").Sum(d => d.Amount),
            oneTimeTotal = activeDeductions.Where(d => d.Frequency == "one_time").Sum(d => d.Amount),
            count = deductions.Count,
            activeCount = activeDeductions.Count,
            pausedCount = deductions.Count(d => d.Status == "paused"),
            completedCount = deductions.Count(d => d.Status == "completed"),
            totalDeductedAllTime = deductions.Sum(d => d.TotalDeducted),
            employeeCount = deductions.Select(d => d.UserId).Distinct().Count()
        };

        return Ok(new { data = deductions, summary, total, page, limit });
    }

    [HttpPost]
    public async Task<ActionResult<object>> CreateDeduction([FromBody] CreateDeductionRequest req)
    {
        var user = await _currentUserService.GetUserAsync();
        var employee = await _context.Users.FindAsync(req.UserId);
        if (employee == null) return NotFound(new { error = "Employee not found" });

        var deduction = new EmployeeDeduction
        {
            UserId = req.UserId,
            OrganizationId = employee.OrganizationId ?? user?.OrganizationId ?? 1,
            Category = req.Category ?? "other",
            Description = req.Description,
            Amount = req.Amount,
            Frequency = req.Frequency ?? "monthly",
            StartDate = req.StartDate,
            EndDate = req.EndDate,
            Status = "active"
        };

        _context.EmployeeDeductions.Add(deduction);
        await _context.SaveChangesAsync();

        return Ok(new { data = deduction, message = "Deduction added" });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<object>> UpdateDeduction(int id, [FromBody] UpdateDeductionRequest req)
    {
        var deduction = await _context.EmployeeDeductions.FindAsync(id);
        if (deduction == null) return NotFound(new { error = "Deduction not found" });

        if (req.Category != null) deduction.Category = req.Category;
        if (req.Description != null) deduction.Description = req.Description;
        if (req.Amount.HasValue) deduction.Amount = req.Amount.Value;
        if (req.Frequency != null) deduction.Frequency = req.Frequency;
        if (req.StartDate.HasValue) deduction.StartDate = req.StartDate;
        if (req.EndDate.HasValue) deduction.EndDate = req.EndDate;
        if (req.Status != null) deduction.Status = req.Status;
        if (req.TotalDeducted.HasValue) deduction.TotalDeducted = req.TotalDeducted.Value;

        deduction.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = deduction, message = "Deduction updated" });
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteDeduction(int id)
    {
        var deduction = await _context.EmployeeDeductions.FindAsync(id);
        if (deduction == null) return NotFound(new { error = "Deduction not found" });

        _context.EmployeeDeductions.Remove(deduction);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }
}

public record CreateDeductionRequest(int UserId, string? Category, string? Description, decimal Amount, string? Frequency, DateOnly? StartDate, DateOnly? EndDate);
public record UpdateDeductionRequest(string? Category, string? Description, decimal? Amount, string? Frequency, DateOnly? StartDate, DateOnly? EndDate, string? Status, decimal? TotalDeducted);


