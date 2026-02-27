using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/employee-snapshots")]
[Authorize]
public class EmployeeSnapshotsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;

    public EmployeeSnapshotsController(TaylorAccessDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetSnapshots()
    {
        var snapshots = await _context.EmployeeSnapshots
            .OrderByDescending(s => s.Month)
            .AsNoTracking()
            .ToListAsync();

        return Ok(new { data = snapshots });
    }

    [HttpPost("capture")]
    public async Task<ActionResult<object>> CaptureSnapshot()
    {
        var month = DateTime.UtcNow.ToString("yyyy-MM");
        
        var exists = await _context.EmployeeSnapshots.AnyAsync(s => s.Month == month);
        if (exists)
            return Ok(new { message = "Snapshot already exists for this month", captured = false });

        var activeCount = await _context.Users.CountAsync(u => u.Status == "active");

        var snapshot = new EmployeeSnapshot
        {
            Month = month,
            ActiveCount = activeCount
        };

        _context.EmployeeSnapshots.Add(snapshot);
        await _context.SaveChangesAsync();

        return Ok(new { message = $"Captured {activeCount} active employees for {month}", captured = true, data = snapshot });
    }
}


