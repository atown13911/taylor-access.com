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

    public EmployeeRosterController(TaylorAccessDbContext context, CurrentUserService currentUserService, EncryptionService encryption, MetricCacheService cache)
    {
        _context = context;
        _currentUserService = currentUserService;
        _encryption = encryption;
        _cache = cache;
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
            var (orgId, user, orgErr) = await _currentUserService.ResolveOrgFilterAsync();
            if (orgErr != null) return Unauthorized(new { message = orgErr });

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

            // If organizationId parameter provided, filter by it
            if (organizationId.HasValue)
            {
                // Product owners/superadmins can view any organization
                if (!orgId.HasValue)
                {
                    query = query.Where(u => u.OrganizationId == organizationId.Value);
                }
                // Regular users can only view their own organization (backend enforces)
                else if (orgId == organizationId.Value)
                {
                    query = query.Where(u => u.OrganizationId == organizationId.Value);
                }
                else
                {
                    // User trying to access an organization they don't belong to
                    return Forbid();
                }
            }
            // No organizationId parameter - use default org filtering (superadmin sees all)
            else
            {
                query = query.Where(u => !orgId.HasValue || u.OrganizationId == orgId);
            }

            // MULTI-TENANT: Users only see employees in their entity
            if (user!.SatelliteId.HasValue)
            {
                query = query.Where(u => u.SatelliteId == user!.SatelliteId.Value);
            }
            else if (user!.AgencyId.HasValue)
            {
                query = query.Where(u => u.AgencyId == user!.AgencyId.Value);
            }
            else if (user!.TerminalId.HasValue)
            {
                query = query.Where(u => u.TerminalId == user!.TerminalId.Value);
            }
            // Corporate users see all employees

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
            
            // Join with EmployeeRoster data
            var employees = await query
                .GroupJoin(
                    _context.EmployeeRosters,
                    u => u.Id,
                    e => e.UserId,
                    (u, employeeData) => new { User = u, EmployeeData = employeeData.FirstOrDefault() })
                .OrderBy(x => x.User.Name)
                .Skip((page - 1) * limit)
                .Take(limit)
                .Select(x => new
            {
                x.User.Id,
                x.User.Name,
                Alias = x.User.Alias,
                Gender = x.User.Gender,
                AvatarUrl = x.User.Avatar,
                x.User.Email,
                PersonalEmail = x.User.PersonalEmail,
                x.User.Phone,
                WorkPhone = x.User.WorkPhone,
                WorkPhoneCountry = x.User.WorkPhoneCountry,
                CellPhone = x.User.CellPhone,
                CellPhoneCountry = x.User.CellPhoneCountry,
                Address = x.User.Address,
                City = x.User.City,
                State = x.User.State,
                ZipCode = x.User.ZipCode,
                x.User.Role,
                x.User.Status,
                x.User.JobTitle,
                DateOfBirth = x.User.DateOfBirth,
                IdNumber = x.User.IdNumber,
                Height = x.User.Height,
                Weight = x.User.Weight,
                EyeColor = x.User.EyeColor,
                HairColor = x.User.HairColor,
                Ethnicity = x.User.Ethnicity,
                Religion = x.User.Religion,
                Country = x.User.Country,
                Language = x.User.Language,
                Timezone = x.User.Timezone,
                OrganizationId = x.User.OrganizationId,
                ZoomEmail = x.User.ZoomEmail,
                ZoomUserId = x.User.ZoomUserId,
                Organization = x.User.Organization,
                SatelliteId = x.User.SatelliteId,
                AgencyId = x.User.AgencyId,
                TerminalId = x.User.TerminalId,
                DivisionId = x.User.DivisionId,
                DepartmentId = x.User.DepartmentId,
                PositionId = x.User.PositionId,
                
                // Entity assignments
                EntityType = x.User.SatelliteId.HasValue ? "satellite" :
                            x.User.AgencyId.HasValue ? "agency" :
                            x.User.TerminalId.HasValue ? "terminal" : "corporate",
                
                Satellite = x.User.Satellite != null ? new { x.User.Satellite.Id, x.User.Satellite.Name, x.User.Satellite.Code } : null,
                Agency = x.User.Agency != null ? new { x.User.Agency.Id, x.User.Agency.Name, x.User.Agency.Code } : null,
                Terminal = x.User.Terminal != null ? new { x.User.Terminal.Id, x.User.Terminal.Name, x.User.Terminal.Code } : null,
                
                // Department & Position
                Department = x.User.Department != null ? new { x.User.Department.Id, x.User.Department.Name } : null,
                Position = x.User.Position != null ? new { x.User.Position.Id, x.User.Position.Title } : null,
                
                x.User.CreatedAt,
                x.User.LastLoginAt,
                
                // Document compliance — flag only when position has specific requirements defined
                DocumentCount = _context.EmployeeDocuments.Count(d => d.EmployeeId == x.User.Id),
                RequiredDocCount = x.User.PositionId.HasValue
                    ? _context.Set<PositionDocumentRequirement>().Count(r => r.PositionId == x.User.PositionId.Value)
                    : 0,
                
                // Integration accounts
                LandstarUsername = x.User.LandstarUsername,
                LandstarPassword = x.User.LandstarPassword ?? "",
                PowerdatUsername = x.User.PowerdatUsername,
                PowerdatPassword = x.User.PowerdatPassword ?? "",
                
                // Extended HR data from EmployeeRoster table
                EmployeeNumber = x.EmployeeData != null ? x.EmployeeData.EmployeeNumber : null,
                HireDate = x.EmployeeData != null ? x.EmployeeData.HireDate : null,
                EmploymentType = x.EmployeeData != null ? x.EmployeeData.EmploymentType : null,
                HourlyRate = x.EmployeeData != null ? x.EmployeeData.HourlyRate : null,
                AnnualSalary = x.EmployeeData != null ? x.EmployeeData.AnnualSalary : null,
                ManagerId = x.EmployeeData != null ? x.EmployeeData.ManagerId : null,
                VacationBalance = x.EmployeeData != null ? x.EmployeeData.VacationBalance : 0,
                SickBalance = x.EmployeeData != null ? x.EmployeeData.SickBalance : 0,
                PTOBalance = x.EmployeeData != null ? x.EmployeeData.PTOBalance : 0
                })
                .ToListAsync();

            var result = new
            {
                data = employees,
                meta = new { total, page, limit, pages = (int)Math.Ceiling((double)total / limit) }
            };
            return Ok(result);
        }
        catch { throw; }
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
            var (orgId, user, orgErr) = await _currentUserService.ResolveOrgFilterAsync();
            if (orgErr != null) return Unauthorized(new { message = orgErr });

            var query = _context.Users.AsQueryable();

            // Organization filter (superadmin sees all)
            query = query.Where(u => !orgId.HasValue || u.OrganizationId == orgId);
            
            // Filter by user's entity (for non-superadmin)
            if (orgId.HasValue && user!.SatelliteId.HasValue)
            {
                query = query.Where(u => u.SatelliteId == user!.SatelliteId.Value);
            }
            else if (orgId.HasValue && user!.AgencyId.HasValue)
            {
                query = query.Where(u => u.AgencyId == user!.AgencyId.Value);
            }
            else if (orgId.HasValue && user!.TerminalId.HasValue)
            {
                query = query.Where(u => u.TerminalId == user!.TerminalId.Value);
            }

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
        var (orgId, user, orgErr) = await _currentUserService.ResolveOrgFilterAsync();
        if (orgErr != null) return Unauthorized(new { message = orgErr });

        // Get all satellites with their employees
        var satellites = await _context.Satellites
            .Where(s => !orgId.HasValue || s.OrganizationId == orgId)
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
            .Where(a => !orgId.HasValue || a.OrganizationId == orgId)
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
            .CountAsync(u => (!orgId.HasValue || u.OrganizationId == orgId) &&
                            !u.SatelliteId.HasValue &&
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


