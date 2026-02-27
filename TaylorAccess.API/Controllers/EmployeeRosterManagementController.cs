using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Manage extended employee data (EmployeeRoster table linked to Users)
/// </summary>
[ApiController]
[Route("api/v1/employee-data")]
[Authorize]
public class EmployeeRosterManagementController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public EmployeeRosterManagementController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get employee HR data by userId
    /// </summary>
    [HttpGet("{userId}")]
    public async Task<ActionResult<EmployeeRoster>> GetEmployeeData(int userId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var employeeData = await _context.EmployeeRosters
            .Include(e => e.User)
            .Include(e => e.Manager)
            .FirstOrDefaultAsync(e => e.UserId == userId && e.OrganizationId == user.OrganizationId.Value);

        if (employeeData == null)
            return NotFound(new { message = "Employee data not found" });

        return Ok(new { data = employeeData });
    }

    /// <summary>
    /// Create or update employee data
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<EmployeeRoster>> CreateOrUpdateEmployeeData([FromBody] EmployeeRoster employeeData)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        // Check if employee data already exists
        var existing = await _context.EmployeeRosters
            .FirstOrDefaultAsync(e => e.UserId == employeeData.UserId && e.OrganizationId == user.OrganizationId.Value);

        if (existing != null)
        {
            // Update existing
            existing.EmployeeNumber = employeeData.EmployeeNumber;
            existing.HireDate = employeeData.HireDate;
            existing.EmploymentStatus = employeeData.EmploymentStatus;
            existing.EmploymentType = employeeData.EmploymentType;
            existing.HourlyRate = employeeData.HourlyRate;
            existing.AnnualSalary = employeeData.AnnualSalary;
            existing.PayType = employeeData.PayType;
            existing.PayFrequency = employeeData.PayFrequency;
            existing.DateOfBirth = employeeData.DateOfBirth;
            existing.HomeAddress = employeeData.HomeAddress;
            existing.City = employeeData.City;
            existing.State = employeeData.State;
            existing.ZipCode = employeeData.ZipCode;
            existing.EmergencyContactName = employeeData.EmergencyContactName;
            existing.EmergencyContactPhone = employeeData.EmergencyContactPhone;
            existing.EmergencyContactRelationship = employeeData.EmergencyContactRelationship;
            existing.ManagerId = employeeData.ManagerId;
            existing.WorkSchedule = employeeData.WorkSchedule;
            existing.WeeklyHours = employeeData.WeeklyHours;
            existing.BenefitsEligible = employeeData.BenefitsEligible;
            existing.BenefitsStartDate = employeeData.BenefitsStartDate;
            existing.VacationBalance = employeeData.VacationBalance;
            existing.SickBalance = employeeData.SickBalance;
            existing.PTOBalance = employeeData.PTOBalance;
            existing.Notes = employeeData.Notes;
            existing.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return Ok(new { data = existing, message = "Employee data updated" });
        }
        else
        {
            // Create new
            employeeData.Id = 0;
            employeeData.OrganizationId = user.OrganizationId.Value;
            employeeData.CreatedBy = user.Id;
            employeeData.CreatedAt = DateTime.UtcNow;
            employeeData.UpdatedAt = DateTime.UtcNow;

            _context.EmployeeRosters.Add(employeeData);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetEmployeeData), new { userId = employeeData.UserId }, new { data = employeeData });
        }
    }

    /// <summary>
    /// Update time-off balances
    /// </summary>
    [HttpPut("{userId}/time-off-balance")]
    public async Task<ActionResult> UpdateTimeOffBalance(int userId, [FromBody] TimeOffBalanceUpdate update)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var employeeData = await _context.EmployeeRosters
            .FirstOrDefaultAsync(e => e.UserId == userId && e.OrganizationId == user.OrganizationId.Value);

        if (employeeData == null)
            return NotFound(new { message = "Employee data not found" });

        if (update.VacationBalance.HasValue)
            employeeData.VacationBalance = update.VacationBalance.Value;
        if (update.SickBalance.HasValue)
            employeeData.SickBalance = update.SickBalance.Value;
        if (update.PTOBalance.HasValue)
            employeeData.PTOBalance = update.PTOBalance.Value;

        employeeData.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = employeeData });
    }

    /// <summary>
    /// Update compensation
    /// </summary>
    [HttpPut("{userId}/compensation")]
    [Authorize(Roles = "admin,manager,hr")]
    public async Task<ActionResult> UpdateCompensation(int userId, [FromBody] CompensationUpdate update)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var employeeData = await _context.EmployeeRosters
            .FirstOrDefaultAsync(e => e.UserId == userId && e.OrganizationId == user.OrganizationId.Value);

        if (employeeData == null)
            return NotFound(new { message = "Employee data not found" });

        if (update.HourlyRate.HasValue)
            employeeData.HourlyRate = update.HourlyRate.Value;
        if (update.AnnualSalary.HasValue)
            employeeData.AnnualSalary = update.AnnualSalary.Value;
        if (update.PayType != null)
            employeeData.PayType = update.PayType;
        if (update.PayFrequency != null)
            employeeData.PayFrequency = update.PayFrequency;

        employeeData.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = employeeData, message = "Compensation updated" });
    }
    // ===== STAGING IMPORT ENDPOINTS =====

    [HttpGet("staging")]
    public async Task<ActionResult> GetStagingImports()
    {
        try
        {
            var list = await _context.Database
                .SqlQueryRaw<StagingRow>(@"SELECT ""Id"", ""Name"", ""Email"", ""Phone"", ""Role"", ""Position"", ""Department"", ""EmployeeNumber"", ""Status"", ""CreatedAt"" FROM ""EmployeeStagingImports"" WHERE ""Status"" IN ('pending','inactive') ORDER BY ""CreatedAt"" DESC LIMIT 2000")
                .ToListAsync();
            return Ok(new { data = list, total = list.Count });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, inner = ex.InnerException?.Message, stack = ex.StackTrace?[..500] });
        }
    }

    public class StagingRow
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Email { get; set; } = "";
        public string? Phone { get; set; }
        public string? Role { get; set; }
        public string? Position { get; set; }
        public string? Department { get; set; }
        public string? EmployeeNumber { get; set; }
        public string Status { get; set; } = "";
        public DateTime CreatedAt { get; set; }
    }

    [HttpPost("staging/{id}/approve")]
    public async Task<ActionResult> ApproveStagingImport(int id)
    {
        var staging = await _context.EmployeeStagingImports.FindAsync(id);
        if (staging == null) return NotFound();

        var exists = await _context.Users.AnyAsync(u => u.Email == staging.Email);
        if (exists) return BadRequest(new { error = $"User with email {staging.Email} already exists" });

        var user = new User
        {
            Name = staging.Name,
            Email = staging.Email,
            Phone = staging.Phone,
            Role = staging.Role ?? "user",
            Status = "active",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("ChangeMe123!"),
            City = staging.City,
            State = staging.State,
            ZipCode = staging.ZipCode,
            OrganizationId = staging.OrganizationId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var roster = new EmployeeRoster
        {
            UserId = user.Id,
            OrganizationId = staging.OrganizationId ?? 1,
            EmployeeNumber = staging.EmployeeNumber,
            EmploymentStatus = "active",
            EmploymentType = staging.EmploymentType ?? "full-time",
            PayType = staging.PayType,
            HourlyRate = staging.HourlyRate,
            AnnualSalary = staging.AnnualSalary,
            HireDate = staging.HireDate,
            City = staging.City,
            State = staging.State,
            ZipCode = staging.ZipCode,
            EmergencyContactName = staging.EmergencyContactName,
            EmergencyContactPhone = staging.EmergencyContactPhone
        };
        _context.EmployeeRosters.Add(roster);

        staging.Status = "approved";
        await _context.SaveChangesAsync();

        return Ok(new { message = $"{staging.Name} activated as employee", userId = user.Id });
    }

    [HttpPost("staging/approve-all")]
    public async Task<ActionResult> ApproveAllStaging()
    {
        var pending = await _context.EmployeeStagingImports.Where(s => s.Status == "pending").ToListAsync();
        var approved = 0;
        var errors = new List<string>();

        foreach (var staging in pending)
        {
            try
            {
                if (await _context.Users.AnyAsync(u => u.Email == staging.Email))
                { errors.Add($"{staging.Email}: already exists"); staging.Status = "rejected"; continue; }

                var user = new User
                {
                    Name = staging.Name, Email = staging.Email, Phone = staging.Phone,
                    Role = staging.Role ?? "user", Status = "active",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("ChangeMe123!"),
                    City = staging.City, State = staging.State, ZipCode = staging.ZipCode,
                    OrganizationId = staging.OrganizationId,
                    CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
                };
                _context.Users.Add(user);
                await _context.SaveChangesAsync();

                _context.EmployeeRosters.Add(new EmployeeRoster
                {
                    UserId = user.Id, OrganizationId = staging.OrganizationId ?? 1,
                    EmployeeNumber = staging.EmployeeNumber, EmploymentStatus = "active",
                    EmploymentType = staging.EmploymentType ?? "full-time", PayType = staging.PayType,
                    HourlyRate = staging.HourlyRate, AnnualSalary = staging.AnnualSalary,
                    HireDate = staging.HireDate, City = staging.City, State = staging.State, ZipCode = staging.ZipCode,
                    EmergencyContactName = staging.EmergencyContactName, EmergencyContactPhone = staging.EmergencyContactPhone
                });
                staging.Status = "approved";
                approved++;
            }
            catch (Exception ex) { errors.Add($"{staging.Email}: {ex.Message}"); }
        }
        await _context.SaveChangesAsync();
        return Ok(new { approved, failed = errors.Count, errors = errors.Take(10) });
    }

    [HttpDelete("staging/{id}")]
    public async Task<ActionResult> RejectStagingImport(int id)
    {
        var staging = await _context.EmployeeStagingImports.FindAsync(id);
        if (staging == null) return NotFound();
        _context.EmployeeStagingImports.Remove(staging);
        await _context.SaveChangesAsync();
        return Ok(new { message = "Removed from staging" });
    }

    [HttpPut("staging/{id}")]
    public async Task<ActionResult> UpdateStagingImport(int id, [FromBody] EmployeeStagingImport update)
    {
        var staging = await _context.EmployeeStagingImports.FindAsync(id);
        if (staging == null) return NotFound();
        staging.Name = update.Name; staging.Email = update.Email; staging.Phone = update.Phone;
        staging.Role = update.Role; staging.Position = update.Position; staging.Department = update.Department;
        staging.EmployeeNumber = update.EmployeeNumber; staging.EmploymentType = update.EmploymentType;
        staging.PayType = update.PayType; staging.HourlyRate = update.HourlyRate; staging.AnnualSalary = update.AnnualSalary;
        staging.City = update.City; staging.State = update.State; staging.ZipCode = update.ZipCode;
        staging.EmergencyContactName = update.EmergencyContactName; staging.EmergencyContactPhone = update.EmergencyContactPhone;
        staging.HireDate = update.HireDate;
        await _context.SaveChangesAsync();
        return Ok(staging);
    }
}

public record TimeOffBalanceUpdate(
    decimal? VacationBalance,
    decimal? SickBalance,
    decimal? PTOBalance
);

public record CompensationUpdate(
    decimal? HourlyRate,
    decimal? AnnualSalary,
    string? PayType,
    string? PayFrequency
);


