using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/time-off")]
[Authorize]
public class TimeOffController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public TimeOffController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet("requests")]
    public async Task<ActionResult<object>> GetTimeOffRequests(
        [FromQuery] int? employeeId,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 50)
    {
        var query = _context.TimeOffRequests
            .Include(t => t.Employee)
            .Include(t => t.ApprovedBy)
            .AsQueryable();

        if (employeeId.HasValue)
            query = query.Where(t => t.EmployeeId == employeeId);
        if (!string.IsNullOrEmpty(status))
            query = query.Where(t => t.Status == status);

        var total = await query.CountAsync();
        var requests = await query
            .OrderByDescending(t => t.StartDate)
            .Skip((page - 1) * limit)
            .Take(limit)
            .ToListAsync();

        return Ok(new { data = requests, meta = new { total, page, limit } });
    }

    [HttpPost("requests")]
    public async Task<ActionResult<TimeOffRequest>> CreateTimeOffRequest([FromBody] TimeOffRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        request.Id = 0;
        request.OrganizationId = user.OrganizationId ?? 0;
        request.CreatedAt = DateTime.UtcNow;
        request.UpdatedAt = DateTime.UtcNow;

        _context.TimeOffRequests.Add(request);
        await _context.SaveChangesAsync();

        return CreatedAtAction("GetTimeOffRequests", new { id = request.Id }, new { request });
    }

    [HttpPost("requests/{id}/approve")]
    public async Task<ActionResult> ApproveTimeOffRequest(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var request = await _context.TimeOffRequests.FirstOrDefaultAsync(t => t.Id == id);
        if (request == null) return NotFound(new { message = "Time off request not found" });

        request.Status = "approved";
        request.ApprovedAt = DateTime.UtcNow;
        request.ApprovedById = user.Id;
        request.UpdatedAt = DateTime.UtcNow;

        var balance = await _context.TimeOffBalances
            .FirstOrDefaultAsync(b => b.EmployeeId == request.EmployeeId && b.Year == DateTime.UtcNow.Year);

        if (balance != null)
        {
            switch (request.Type.ToLower())
            {
                case "pto": case "vacation": balance.PtoUsed += request.Days; break;
                case "sick": balance.SickUsed += request.Days; break;
                case "personal": balance.PersonalUsed += request.Days; break;
            }
            balance.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
        return Ok(new { request, message = "Time off request approved" });
    }

    [HttpPost("requests/{id}/deny")]
    public async Task<ActionResult> DenyTimeOffRequest(int id, [FromBody] DenyTimeOffBody? body)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var request = await _context.TimeOffRequests.FirstOrDefaultAsync(t => t.Id == id);
        if (request == null) return NotFound(new { message = "Time off request not found" });

        request.Status = "denied";
        request.ApprovedById = user.Id;
        request.ApprovedAt = DateTime.UtcNow;
        request.DenialReason = body?.Reason;
        request.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { request, message = "Time off request denied" });
    }

    [HttpPost("requests/{id}/cancel")]
    public async Task<ActionResult> CancelTimeOffRequest(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var request = await _context.TimeOffRequests.FirstOrDefaultAsync(t => t.Id == id);
        if (request == null) return NotFound(new { message = "Time off request not found" });

        if (request.Status == "approved")
        {
            var balance = await _context.TimeOffBalances
                .FirstOrDefaultAsync(b => b.EmployeeId == request.EmployeeId && b.Year == DateTime.UtcNow.Year);
            if (balance != null)
            {
                switch (request.Type.ToLower())
                {
                    case "pto": case "vacation": balance.PtoUsed -= request.Days; break;
                    case "sick": balance.SickUsed -= request.Days; break;
                    case "personal": balance.PersonalUsed -= request.Days; break;
                }
                balance.UpdatedAt = DateTime.UtcNow;
            }
        }

        request.Status = "cancelled";
        request.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { request, message = "Time off request cancelled" });
    }

    [HttpGet("balances")]
    public async Task<ActionResult<object>> GetTimeOffBalances([FromQuery] int? employeeId)
    {
        var query = _context.TimeOffBalances
            .Include(b => b.Employee)
            .AsQueryable();

        if (employeeId.HasValue)
            query = query.Where(b => b.EmployeeId == employeeId);

        var balances = await query.ToListAsync();
        return Ok(new { data = balances });
    }
}

public record DenyTimeOffBody(string? Reason);
