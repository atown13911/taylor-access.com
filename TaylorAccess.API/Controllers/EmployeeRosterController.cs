using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Employee roster with entity assignments (Satellites, Agencies, Terminals)
/// </summary>
[ApiController]
[Route("api/v1/employee-roster")]
[Authorize]
public class EmployeeRosterController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;
    private readonly EncryptionService _encryption;
    private readonly MetricCacheService _cache;
    private readonly ILogger<EmployeeRosterController> _logger;

    public EmployeeRosterController(TaylorAccessDbContext context, CurrentUserService currentUserService, EncryptionService encryption, MetricCacheService cache, ILogger<EmployeeRosterController> logger)
    {
        _context = context;
        _currentUserService = currentUserService;
        _encryption = encryption;
        _cache = cache;
        _logger = logger;
    }

    /// <summary>
    /// Get complete employee roster with entity assignments
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetEmployeeRoster(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] int? organizationId,
        [FromQuery] int? satelliteId,
        [FromQuery] int? agencyId,
        [FromQuery] int? terminalId,
        [FromQuery] int? departmentId,
        [FromQuery] string? role,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 100)
    {
        try
        {
            // All authenticated users see all employees.
            // Organizations/satellites/agencies/terminals are labels only — not access gates.
            var user = await _currentUserService.GetUserAsync();
            if (user == null) return Unauthorized();

            var query = _context.Users
            .Include(u => u.Organization)
                .ThenInclude(o => o!.AddressRef)
            .Include(u => u.Satellite)
            .Include(u => u.Agency)
            .Include(u => u.Terminal)
            .Include(u => u.Department)
            .Include(u => u.Position)
            .AsNoTracking()
            .AsQueryable();

            // Optional org filter — UI convenience only, not access control
            if (organizationId.HasValue)
                query = query.Where(u => u.OrganizationId == organizationId.Value);

            // Filters
            if (!string.IsNullOrEmpty(search))
            {
                var searchLower = search.ToLower();
                query = query.Where(u => 
                    u.Name.ToLower().Contains(searchLower) || 
                    u.Email.ToLower().Contains(searchLower) ||
                    (u.Phone != null && u.Phone.Contains(search)) ||
                    (u.Alias != null && u.Alias.ToLower().Contains(searchLower)) ||
                    (u.JobTitle != null && u.JobTitle.ToLower().Contains(searchLower)));
            }

            if (!string.IsNullOrEmpty(status))
                query = query.Where(u => u.Status == status);

            if (satelliteId.HasValue)
                query = query.Where(u => u.SatelliteId == satelliteId);

            if (agencyId.HasValue)
                query = query.Where(u => u.AgencyId == agencyId);

            if (terminalId.HasValue)
                query = query.Where(u => u.TerminalId == terminalId);

            if (departmentId.HasValue)
                query = query.Where(u => u.DepartmentId == departmentId);

            if (!string.IsNullOrEmpty(role))
                query = query.Where(u => u.Role == role);

            var total = await query.CountAsync();

            // Step 1: load paged users — simple, guaranteed to translate
            var pagedUsers = await query
                .OrderBy(u => u.Name)
                .Skip((page - 1) * limit)
                .Take(limit)
                .ToListAsync();

            // Step 2: pull HR roster data for this page in one query
            var userIds = pagedUsers.Select(u => u.Id).ToList();
            var rosterMap = await _context.EmployeeRosters
                .Where(er => userIds.Contains(er.UserId))
                .ToDictionaryAsync(er => er.UserId);

            // Step 3: merge in memory — no EF translation risk
            var employees = pagedUsers.Select(u =>
            {
                rosterMap.TryGetValue(u.Id, out var er);
                return new
                {
                    u.Id, u.Name,
                    Alias = u.Alias,
                    Gender = u.Gender,
                    AvatarUrl = u.Avatar,
                    u.Email,
                    PersonalEmail = u.PersonalEmail,
                    u.Phone,
                    WorkPhone = u.WorkPhone,
                    WorkPhoneCountry = u.WorkPhoneCountry,
                    CellPhone = u.CellPhone,
                    CellPhoneCountry = u.CellPhoneCountry,
                    Address = u.Address,
                    City = u.City, State = u.State, ZipCode = u.ZipCode,
                    u.Role, u.Status, u.JobTitle,
                    DateOfBirth = u.DateOfBirth, IdNumber = u.IdNumber,
                    Height = u.Height, Weight = u.Weight, EyeColor = u.EyeColor,
                    HairColor = u.HairColor, Ethnicity = u.Ethnicity, Religion = u.Religion,
                    Country = u.Country, Language = u.Language, Timezone = u.Timezone,
                    OrganizationId = u.OrganizationId,
                    ZoomEmail = u.ZoomEmail, ZoomUserId = u.ZoomUserId,
                    Organization = u.Organization != null ? new { u.Organization.Id, u.Organization.Name } : null,
                    SatelliteId = u.SatelliteId, AgencyId = u.AgencyId,
                    TerminalId = u.TerminalId, DivisionId = u.DivisionId,
                    DepartmentId = u.DepartmentId, PositionId = u.PositionId,
                    EntityType = u.SatelliteId.HasValue ? "satellite" :
                                 u.AgencyId.HasValue ? "agency" :
                                 u.TerminalId.HasValue ? "terminal" : "corporate",
                    Satellite = u.Satellite != null ? new { u.Satellite.Id, u.Satellite.Name, u.Satellite.Code } : null,
                    Agency = u.Agency != null ? new { u.Agency.Id, u.Agency.Name, u.Agency.Code } : null,
                    Terminal = u.Terminal != null ? new { u.Terminal.Id, u.Terminal.Name, u.Terminal.Code } : null,
                    Department = u.Department != null ? new { u.Department.Id, u.Department.Name } : null,
                    Position = u.Position != null ? new { u.Position.Id, u.Position.Title } : null,
                    u.CreatedAt, u.LastLoginAt,
                    DocumentCount = 0, RequiredDocCount = 0, // loaded on demand per employee detail
                    LandstarUsername = u.LandstarUsername,
                    LandstarPassword = u.LandstarPassword ?? "",
                    PowerdatUsername = u.PowerdatUsername,
                    PowerdatPassword = u.PowerdatPassword ?? "",
                    EmployeeNumber = er?.EmployeeNumber,
                    HireDate = er?.HireDate,
                    EmploymentType = er?.EmploymentType,
                    HourlyRate = er?.HourlyRate,
                    AnnualSalary = er?.AnnualSalary,
                    ManagerId = er?.ManagerId,
                    VacationBalance = er?.VacationBalance ?? 0,
                    SickBalance = er?.SickBalance ?? 0,
                    PTOBalance = er?.PTOBalance ?? 0
                };
            }).ToList();

            return Ok(new
            {
                data = employees,
                meta = new { total, page, limit, pages = (int)Math.Ceiling((double)total / limit) }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetEmployeeRoster failed");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Decrypt an integration password (called on-demand from frontend)
    /// </summary>
    [HttpPost("decrypt-password")]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public ActionResult<object> DecryptPassword([FromBody] DecryptRequest request)
    {
        if (string.IsNullOrEmpty(request.Value)) return Ok(new { value = "" });
        return Ok(new { value = _encryption.Decrypt(request.Value) });
    }

    /// <summary>
    /// Get roster summary/stats
    /// </summary>
    [HttpGet("summary")]
    public async Task<ActionResult<object>> GetRosterSummary()
    {
        try
        {
            // All authenticated users see all employees — no org/entity scoping
            var query = _context.Users.AsQueryable();

            var employees = await query
                .Include(u => u.Department)
                .Include(u => u.Satellite)
                .ToListAsync();

            var summary = new
            {
                totalEmployees = employees.Count,
                activeEmployees = employees.Count(e => e.Status == "active"),
                byEntity = new
                {
                    corporate = employees.Count(e => !e.SatelliteId.HasValue && !e.AgencyId.HasValue && !e.TerminalId.HasValue),
                    satellites = employees.Count(e => e.SatelliteId.HasValue),
                    agencies = employees.Count(e => e.AgencyId.HasValue),
                    terminals = employees.Count(e => e.TerminalId.HasValue)
                },
                byRole = employees.GroupBy(e => e.Role)
                    .Select(g => new { role = g.Key, count = g.Count() }),
                byDepartment = employees.Where(e => e.DepartmentId.HasValue)
                    .GroupBy(e => e.Department!.Name)
                    .Select(g => new { department = g.Key, count = g.Count() }),
                bySatellite = employees.Where(e => e.SatelliteId.HasValue)
                    .GroupBy(e => e.Satellite!.Name)
                    .Select(g => new { satellite = g.Key, count = g.Count() })
            };

            return Ok(summary);
        }
        catch { throw; }
    }

    /// <summary>
    /// Get organizational chart data
    /// </summary>
    [HttpGet("org-chart")]
    public async Task<ActionResult<object>> GetOrgChart()
    {
        // Get all satellites with their employees — no org scoping
        var satellites = await _context.Satellites
            .Include(s => s.Users)
            .Include(s => s.Manager)
            .Select(s => new
            {
                s.Id,
                s.Name,
                s.Code,
                ManagerName = s.Manager != null ? s.Manager.Name : null,
                EmployeeCount = (s.Users ?? Enumerable.Empty<User>()).Count(u => u.Status == "active")
            })
            .ToListAsync();

        // Get all agencies
        var agencies = await _context.Agencies
            .Include(a => a.Users)
            .Include(a => a.Manager)
            .Select(a => new
            {
                a.Id,
                a.Name,
                a.Code,
                ManagerName = a.Manager != null ? a.Manager.Name : null,
                EmployeeCount = (a.Users ?? Enumerable.Empty<User>()).Count(u => u.Status == "active")
            })
            .ToListAsync();

        // Get corporate (no entity assignment)
        var corporateCount = await _context.Users
            .CountAsync(u => !u.SatelliteId.HasValue &&
                            !u.AgencyId.HasValue &&
                            !u.TerminalId.HasValue &&
                            u.Status == "active");

        var orgChart = new
        {
            corporate = new { employeeCount = corporateCount },
            satellites = satellites,
            agencies = agencies,
            totalEmployees = corporateCount + satellites.Sum(s => s.EmployeeCount) + agencies.Sum(a => a.EmployeeCount)
        };

        return Ok(orgChart);
    }
}

public record DecryptRequest(string? Value);


