using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class DispatchersController : ControllerBase
{
    private static readonly HashSet<string> InactiveUserStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "inactive", "archived", "deleted", "disabled", "suspended", "terminated"
    };

    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;
    private readonly IConfiguration _configuration;

    public DispatchersController(
        TaylorAccessDbContext context,
        CurrentUserService currentUserService,
        IConfiguration configuration)
    {
        _context = context;
        _currentUserService = currentUserService;
        _configuration = configuration;
    }

    /// <summary>
    /// Returns dispatcher screen data in one payload for integrations:
    /// dispatcher roster + active landmark drivers (OTR/Drayage) + summary stats.
    /// </summary>
    [HttpGet("section-data")]
    public async Task<ActionResult<object>> GetDispatcherSectionData()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
            return Unauthorized(new { error = "Not authenticated" });

        var userRole = (user.Role ?? string.Empty).Trim().ToLowerInvariant();
        var canBypassOrgFilter =
            userRole == "product_owner" ||
            userRole == "superadmin" ||
            userRole == "development";

        var allowedOrgIds = new HashSet<int>();
        if (!canBypassOrgFilter)
        {
            var membershipOrgIds = await _currentUserService.GetUserOrganizationIdsAsync();
            foreach (var id in membershipOrgIds)
            {
                if (id > 0) allowedOrgIds.Add(id);
            }

            if (user.OrganizationId.HasValue && user.OrganizationId.Value > 0)
                allowedOrgIds.Add(user.OrganizationId.Value);

            if (allowedOrgIds.Count == 0)
                return BadRequest(new { error = "User must belong to an organization" });
        }

        var (dispatchers, dispatcherSource) = await GetDispatchersByRoleIdAsync(4);
        var activeDispatchers = dispatchers
            .Where(d => !InactiveUserStatuses.Contains(d.Status ?? string.Empty))
            .OrderBy(d => d.Name)
            .ToList();

        var currentUserEmail = (user.Email ?? string.Empty).Trim();
        var currentUserName = (user.Name ?? string.Empty).Trim();
        var currentUserId = user.Id > 0 ? user.Id : 0;
        var currentRole = (user.Role ?? string.Empty).Trim().ToLowerInvariant();
        var isCurrentUserDispatcherRole = currentRole.Contains("dispatcher");
        var currentUserAlreadyListed = activeDispatchers.Any(d =>
            (currentUserId > 0 && d.Id == currentUserId) ||
            (!string.IsNullOrWhiteSpace(currentUserEmail) &&
             string.Equals((d.Email ?? string.Empty).Trim(), currentUserEmail, StringComparison.OrdinalIgnoreCase)) ||
            (!string.IsNullOrWhiteSpace(currentUserName) &&
             string.Equals((d.Name ?? string.Empty).Trim(), currentUserName, StringComparison.OrdinalIgnoreCase))
        );
        if (isCurrentUserDispatcherRole && !currentUserAlreadyListed)
        {
            activeDispatchers.Add(new DispatchUserWire
            {
                Id = currentUserId,
                Name = string.IsNullOrWhiteSpace(currentUserName) ? "Dispatcher" : currentUserName,
                Email = currentUserEmail,
                Phone = string.Empty,
                Title = "Dispatcher",
                Status = "active"
            });
        }

        var driverQuery = _context.Drivers
            .AsNoTracking()
            .Where(d => !d.IsDeleted);

        if (!canBypassOrgFilter)
            driverQuery = driverQuery.Where(d => allowedOrgIds.Contains(d.OrganizationId));

        var drivers = await driverQuery
            .Select(d => new DriverWire
            {
                Id = d.Id,
                Name = d.Name,
                Email = d.Email,
                Phone = d.Phone,
                Status = d.Status,
                FleetId = d.FleetId,
                Notes = d.Notes,
                HireDate = d.HireDate
            })
            .ToListAsync();

        if (isCurrentUserDispatcherRole && !canBypassOrgFilter)
        {
            var dispatcherIdsForCurrentUser = activeDispatchers
                .Where(d => d.Id > 0 && (
                    (currentUserId > 0 && d.Id == currentUserId) ||
                    (!string.IsNullOrWhiteSpace(currentUserEmail) &&
                     string.Equals((d.Email ?? string.Empty).Trim(), currentUserEmail, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(currentUserName) &&
                     string.Equals(NormalizePersonName(d.Name), NormalizePersonName(currentUserName), StringComparison.Ordinal))))
                .Select(d => d.Id)
                .Distinct()
                .ToArray();

            if (dispatcherIdsForCurrentUser.Length > 0)
            {
                drivers = await MergeDriversAssignedToDispatchersAsync(
                    drivers,
                    dispatcherIdsForCurrentUser,
                    activeDispatchers);
            }
        }

        var dbAssignmentMap = await TryGetDriverDispatchAssignmentMapAsync(drivers.Select(d => d.Id));

        var fleetLookupOrgIds = new HashSet<int>(allowedOrgIds);
        if (isCurrentUserDispatcherRole && !canBypassOrgFilter)
        {
            var driverOrgIds = await _context.Drivers
                .AsNoTracking()
                .Where(d => drivers.Select(x => x.Id).Contains(d.Id))
                .Select(d => d.OrganizationId)
                .ToListAsync();
            foreach (var orgId in driverOrgIds)
            {
                if (orgId > 0) fleetLookupOrgIds.Add(orgId);
            }
        }

        var fleetQuery = _context.Fleets.AsNoTracking().AsQueryable();
        if (!canBypassOrgFilter)
            fleetQuery = fleetQuery.Where(f => fleetLookupOrgIds.Contains(f.OrganizationId));
        var fleetNameById = await fleetQuery.ToDictionaryAsync(f => f.Id, f => f.Name);

        var fleetDriverQuery = _context.FleetDrivers.AsNoTracking().AsQueryable();
        if (!canBypassOrgFilter)
            fleetDriverQuery = fleetDriverQuery.Where(fd => fleetLookupOrgIds.Contains(fd.Fleet!.OrganizationId));
        var fleetDriverRows = await fleetDriverQuery
            .Select(fd => new { fd.DriverId, fd.FleetId })
            .ToListAsync();
        var fleetDriverLookup = fleetDriverRows
            .GroupBy(x => x.DriverId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.FleetId).ToList());

        var driverRows = drivers
            .Select(d =>
            {
                var fleetName = ResolveFleetName(d, fleetNameById, fleetDriverLookup);
                var dispatchMeta = ResolveDispatchMetadataFromNotes(d.Notes);
                if (dbAssignmentMap.TryGetValue(d.Id, out var dbAssignment))
                {
                    if (dbAssignment.DispatchUserId.HasValue)
                        dispatchMeta.DispatchUserId = dbAssignment.DispatchUserId;
                    if (string.IsNullOrWhiteSpace(dispatchMeta.DispatcherName) && !string.IsNullOrWhiteSpace(dbAssignment.DispatcherName))
                        dispatchMeta.DispatcherName = dbAssignment.DispatcherName;
                }
                var normalizedStatus = NormalizeStatus(d.Status);
                return new DispatcherDriverDto
                {
                    Id = d.Id,
                    Name = d.Name ?? string.Empty,
                    Email = d.Email ?? string.Empty,
                    Phone = d.Phone ?? string.Empty,
                    Status = normalizedStatus,
                    FleetId = d.FleetId,
                    FleetName = fleetName,
                    HireDate = d.HireDate?.ToDateTime(TimeOnly.MinValue),
                    DispatchUserId = dispatchMeta.DispatchUserId,
                    DispatcherName = dispatchMeta.DispatcherName,
                    DispatcherEmail = dbAssignmentMap.TryGetValue(d.Id, out var assignment)
                        ? assignment.DispatcherEmail
                        : null
                };
            })
            .Where(d => IsActiveStatus(d.Status))
            .ToList();

        var otrDrivers = driverRows
            .Where(d => IsLandmarkOtrFleet(d.FleetName))
            .OrderBy(d => d.Name)
            .ToList();
        var drayageDrivers = driverRows
            .Where(d => IsLandmarkDrayageFleet(d.FleetName))
            .OrderBy(d => d.Name)
            .ToList();
        var activeLandmarkDrivers = otrDrivers
            .Concat(drayageDrivers)
            .GroupBy(d => d.Id)
            .Select(g => g.First())
            .OrderBy(d => d.Name)
            .ToList();

        var dispatcherNameById = activeDispatchers
            .ToDictionary(d => d.Id, d => d.Name ?? $"User {d.Id}");
        var dispatcherEmailById = activeDispatchers
            .ToDictionary(d => d.Id, d => d.Email ?? string.Empty);

        foreach (var driver in driverRows)
        {
            if (driver.DispatchUserId.HasValue && dispatcherNameById.TryGetValue(driver.DispatchUserId.Value, out var name))
                driver.DispatcherName = name;
            if (driver.DispatchUserId.HasValue &&
                dispatcherEmailById.TryGetValue(driver.DispatchUserId.Value, out var email) &&
                string.IsNullOrWhiteSpace(driver.DispatcherEmail))
            {
                driver.DispatcherEmail = email;
            }
        }

        var dispatchersById = activeDispatchers
            .Where(d => d.Id > 0)
            .ToDictionary(d => d.Id, d => d);
        var dispatchersByName = activeDispatchers
            .Where(d => !string.IsNullOrWhiteSpace(d.Name))
            .GroupBy(d => NormalizePersonName(d.Name))
            .Where(g => !string.IsNullOrWhiteSpace(g.Key))
            .ToDictionary(g => g.Key, g => g.First());
        var dispatchersByEmail = activeDispatchers
            .Where(d => !string.IsNullOrWhiteSpace(d.Email))
            .GroupBy(d => d.Email!.Trim().ToLowerInvariant())
            .Where(g => !string.IsNullOrWhiteSpace(g.Key))
            .ToDictionary(g => g.Key, g => g.First());

        var assignedDriversByDispatcher = activeDispatchers
            .ToDictionary(d => d.Id, _ => new List<DispatcherAssignedDriverDto>());

        foreach (var driver in driverRows)
        {
            DispatchUserWire? matchedDispatcher = null;
            if (driver.DispatchUserId.HasValue && dispatchersById.TryGetValue(driver.DispatchUserId.Value, out var byId))
                matchedDispatcher = byId;

            if (matchedDispatcher == null && !string.IsNullOrWhiteSpace(driver.DispatcherEmail))
            {
                var emailKey = driver.DispatcherEmail.Trim().ToLowerInvariant();
                if (dispatchersByEmail.TryGetValue(emailKey, out var byEmail))
                    matchedDispatcher = byEmail;
            }

            if (matchedDispatcher == null)
            {
                var nameKey = NormalizePersonName(driver.DispatcherName);
                if (!string.IsNullOrWhiteSpace(nameKey) && dispatchersByName.TryGetValue(nameKey, out var byName))
                    matchedDispatcher = byName;
            }

            if (matchedDispatcher == null)
                continue;

            assignedDriversByDispatcher.TryAdd(matchedDispatcher.Id, new List<DispatcherAssignedDriverDto>());
            assignedDriversByDispatcher[matchedDispatcher.Id].Add(new DispatcherAssignedDriverDto
            {
                DriverId = driver.Id.ToString(),
                Name = driver.Name,
                Email = driver.Email
            });
        }

        foreach (var key in assignedDriversByDispatcher.Keys.ToList())
        {
            assignedDriversByDispatcher[key] = assignedDriversByDispatcher[key]
                .OrderBy(d => d.Name)
                .ToList();
        }

        var dispatcherRows = activeDispatchers.Select(d =>
        {
            var assignedDrivers = assignedDriversByDispatcher.GetValueOrDefault(d.Id, new List<DispatcherAssignedDriverDto>());
            return new DispatcherOverviewDto
            {
                Id = d.Id,
                Name = d.Name,
                Email = d.Email,
                Phone = d.Phone,
                Title = string.IsNullOrWhiteSpace(d.Title) ? "Dispatcher" : d.Title,
                Status = string.IsNullOrWhiteSpace(d.Status) ? "active" : d.Status!.ToLowerInvariant(),
                AssignedDrivers = assignedDrivers,
                AssignedDriverCount = assignedDrivers.Count
            };
        }).OrderBy(d => d.Name).ToList();

        var driversWithDispatcher = driverRows.Count(d =>
            d.DispatchUserId.HasValue ||
            !string.IsNullOrWhiteSpace(d.DispatcherName) ||
            !string.IsNullOrWhiteSpace(d.DispatcherEmail));
        var summary = new
        {
            totalDispatchers = dispatcherRows.Count,
            dispatchersWithAssignedDrivers = dispatcherRows.Count(d => d.AssignedDriverCount > 0),
            driversWithDispatcher,
            unassignedDrivers = Math.Max(driverRows.Count - driversWithDispatcher, 0)
        };

        return Ok(new
        {
            data = new
            {
                dispatchers = dispatcherRows,
                drivers = new
                {
                    otr = otrDrivers,
                    drayage = drayageDrivers,
                    activeLandmark = activeLandmarkDrivers,
                    all = driverRows
                },
                summary
            },
            source = new
            {
                dispatchers = dispatcherSource,
                drivers = "default_db"
            }
        });
    }

    private async Task<List<DriverWire>> MergeDriversAssignedToDispatchersAsync(
        List<DriverWire> existingDrivers,
        IReadOnlyCollection<int> dispatcherIds,
        IReadOnlyCollection<DispatchUserWire> activeDispatchers)
    {
        if (dispatcherIds.Count == 0) return existingDrivers;

        var dispatcherIdSet = dispatcherIds.ToHashSet();
        var existingIds = existingDrivers.Select(d => d.Id).ToHashSet();

        var noteCandidates = await _context.Drivers
            .AsNoTracking()
            .Where(d => !d.IsDeleted && d.Notes != null && d.Notes.Contains("[dispatch-assignee-id:"))
            .Select(d => new DriverWire
            {
                Id = d.Id,
                Name = d.Name,
                Email = d.Email,
                Phone = d.Phone,
                Status = d.Status,
                FleetId = d.FleetId,
                Notes = d.Notes,
                HireDate = d.HireDate
            })
            .ToListAsync();

        var assignedIds = new HashSet<int>();
        foreach (var candidate in noteCandidates)
        {
            var dispatchMeta = ResolveDispatchMetadataFromNotes(candidate.Notes);
            if (dispatchMeta.DispatchUserId.HasValue && dispatcherIdSet.Contains(dispatchMeta.DispatchUserId.Value))
            {
                assignedIds.Add(candidate.Id);
                continue;
            }

            if (!string.IsNullOrWhiteSpace(dispatchMeta.DispatcherName))
            {
                var normalizedName = NormalizePersonName(dispatchMeta.DispatcherName);
                if (activeDispatchers.Any(d =>
                        dispatcherIdSet.Contains(d.Id) &&
                        string.Equals(NormalizePersonName(d.Name), normalizedName, StringComparison.Ordinal)))
                {
                    assignedIds.Add(candidate.Id);
                }
            }
        }

        var dbAssignmentMap = await TryGetDriverDispatchAssignmentMapAsync(noteCandidates.Select(d => d.Id));
        foreach (var kvp in dbAssignmentMap)
        {
            if (existingIds.Contains(kvp.Key) || assignedIds.Contains(kvp.Key)) continue;

            if (kvp.Value.DispatchUserId.HasValue && dispatcherIdSet.Contains(kvp.Value.DispatchUserId.Value))
            {
                assignedIds.Add(kvp.Key);
                continue;
            }

            if (!string.IsNullOrWhiteSpace(kvp.Value.DispatcherEmail))
            {
                var emailKey = kvp.Value.DispatcherEmail.Trim().ToLowerInvariant();
                if (activeDispatchers.Any(d =>
                        dispatcherIdSet.Contains(d.Id) &&
                        string.Equals((d.Email ?? string.Empty).Trim().ToLowerInvariant(), emailKey, StringComparison.Ordinal)))
                {
                    assignedIds.Add(kvp.Key);
                    continue;
                }
            }

            if (!string.IsNullOrWhiteSpace(kvp.Value.DispatcherName))
            {
                var normalizedName = NormalizePersonName(kvp.Value.DispatcherName);
                if (activeDispatchers.Any(d =>
                        dispatcherIdSet.Contains(d.Id) &&
                        string.Equals(NormalizePersonName(d.Name), normalizedName, StringComparison.Ordinal)))
                {
                    assignedIds.Add(kvp.Key);
                }
            }
        }

        assignedIds.ExceptWith(existingIds);
        if (assignedIds.Count == 0) return existingDrivers;

        var extraDrivers = await _context.Drivers
            .AsNoTracking()
            .Where(d => assignedIds.Contains(d.Id) && !d.IsDeleted)
            .Select(d => new DriverWire
            {
                Id = d.Id,
                Name = d.Name,
                Email = d.Email,
                Phone = d.Phone,
                Status = d.Status,
                FleetId = d.FleetId,
                Notes = d.Notes,
                HireDate = d.HireDate
            })
            .ToListAsync();

        if (extraDrivers.Count == 0) return existingDrivers;

        var merged = existingDrivers.ToList();
        merged.AddRange(extraDrivers);
        return merged;
    }

    private async Task<Dictionary<int, DriverDispatchAssignmentWire>> TryGetDriverDispatchAssignmentMapAsync(IEnumerable<int> driverIds)
    {
        var ids = driverIds.Distinct().Where(i => i > 0).ToArray();
        if (ids.Length == 0) return new Dictionary<int, DriverDispatchAssignmentWire>();

        var conn = ResolvePrimaryDbConnectionString();
        if (string.IsNullOrWhiteSpace(conn)) return new Dictionary<int, DriverDispatchAssignmentWire>();

        try
        {
            await using var db = new NpgsqlConnection(conn);
            await db.OpenAsync();

            var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            await using (var colsCmd = db.CreateCommand())
            {
                colsCmd.CommandText = @"
                    select column_name
                    from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'Drivers';";
                await using var reader = await colsCmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var col = reader["column_name"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(col))
                        columns.Add(col);
                }
            }

            string? FirstExisting(params string[] candidates)
            {
                foreach (var c in candidates)
                {
                    if (columns.Contains(c))
                        return c;
                }
                return null;
            }

            var idColumn = FirstExisting("DispatchUserId", "DispatcherUserId", "AssignedDispatcherId", "dispatchUserId", "dispatcherUserId", "assignedDispatcherId");
            var nameColumn = FirstExisting("DispatchUserName", "DispatcherName", "AssignedDispatcherName", "dispatchUserName", "dispatcherName", "assignedDispatcherName");
            if (idColumn == null && nameColumn == null)
                return new Dictionary<int, DriverDispatchAssignmentWire>();

            var emailColumn = FirstExisting("DispatchUserEmail", "DispatcherEmail", "AssignedDispatcherEmail", "dispatchUserEmail", "dispatcherEmail", "assignedDispatcherEmail");
            var idExpr = idColumn == null ? "null" : $@"d.""{idColumn}""";
            var nameExpr = nameColumn == null ? "null" : $@"d.""{nameColumn}""";
            var emailExpr = emailColumn == null ? "null" : $@"d.""{emailColumn}""";

            await using var cmd = db.CreateCommand();
            cmd.CommandText = $@"
                select
                    d.""Id"",
                    {idExpr} as ""DispatchUserId"",
                    {nameExpr} as ""DispatcherName"",
                    {emailExpr} as ""DispatcherEmail""
                from ""Drivers"" d
                where d.""Id"" = any(@driverIds);";
            cmd.Parameters.Add(new NpgsqlParameter("@driverIds", NpgsqlDbType.Array | NpgsqlDbType.Integer) { Value = ids });

            var map = new Dictionary<int, DriverDispatchAssignmentWire>();
            await using var assignmentReader = await cmd.ExecuteReaderAsync();
            while (await assignmentReader.ReadAsync())
            {
                var driverId = assignmentReader.GetInt32(assignmentReader.GetOrdinal("Id"));
                var dispatchUserIdRaw = assignmentReader["DispatchUserId"]?.ToString();
                var parsedDispatchUserId = int.TryParse(dispatchUserIdRaw, out var parsedId) && parsedId > 0 ? parsedId : (int?)null;
                var dispatcherName = assignmentReader["DispatcherName"]?.ToString();
                var dispatcherEmail = assignmentReader["DispatcherEmail"]?.ToString();

                map[driverId] = new DriverDispatchAssignmentWire
                {
                    DispatchUserId = parsedDispatchUserId,
                    DispatcherName = string.IsNullOrWhiteSpace(dispatcherName) ? null : dispatcherName.Trim(),
                    DispatcherEmail = string.IsNullOrWhiteSpace(dispatcherEmail) ? null : dispatcherEmail.Trim()
                };
            }

            return map;
        }
        catch
        {
            return new Dictionary<int, DriverDispatchAssignmentWire>();
        }
    }

    private async Task<(List<DispatchUserWire> users, string source)> GetDispatchersByRoleIdAsync(int roleId)
    {
        var portalUsers = await TryGetUsersByRoleIdFromPortalDb(roleId);
        if (portalUsers.Count > 0)
            return (portalUsers, "portal_db");

        var users = await _context.UserRoles
            .AsNoTracking()
            .Where(ur => ur.RoleId == roleId)
            .Join(
                _context.Users.AsNoTracking(),
                ur => ur.UserId,
                u => u.Id,
                (ur, u) => new { ur, u }
            )
            .GroupJoin(
                _context.Positions.AsNoTracking(),
                row => row.u.PositionId,
                p => (int?)p.Id,
                (row, positions) => new
                {
                    row.u.Id,
                    row.u.Name,
                    row.u.Email,
                    Phone = row.u.Phone ?? row.u.WorkPhone ?? row.u.CellPhone,
                    Title = positions.Select(p => p.Title).FirstOrDefault() ?? row.u.JobTitle,
                    row.u.Status
                }
            )
            .OrderBy(u => u.Name)
            .ToListAsync();

        return (users.Select(u => new DispatchUserWire
        {
            Id = u.Id,
            Name = u.Name ?? $"User {u.Id}",
            Email = u.Email,
            Phone = u.Phone,
            Title = u.Title,
            Status = u.Status
        }).ToList(), "default_db");
    }

    private async Task<List<DispatchUserWire>> TryGetUsersByRoleIdFromPortalDb(int roleId)
    {
        var conn = ResolvePortalDbConnectionString();
        if (string.IsNullOrWhiteSpace(conn)) return new List<DispatchUserWire>();

        try
        {
            await using var db = new NpgsqlConnection(conn);
            await db.OpenAsync();

            var userColumnLookup = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            await using (var colsCmd = db.CreateCommand())
            {
                colsCmd.CommandText = @"
                    select column_name
                    from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'Users';";

                await using var colsReader = await colsCmd.ExecuteReaderAsync();
                while (await colsReader.ReadAsync())
                {
                    var col = colsReader["column_name"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(col) && !userColumnLookup.ContainsKey(col))
                        userColumnLookup[col] = col;
                }
            }

            string FirstExisting(params string[] candidates)
            {
                foreach (var candidate in candidates)
                {
                    if (userColumnLookup.TryGetValue(candidate, out var actual))
                        return actual;
                }
                return string.Empty;
            }

            var phoneColumns = new[] { "Phone", "WorkPhone", "CellPhone", "Cellphone", "phone", "work_phone", "cell_phone", "phone_number" }
                .Select(candidate => FirstExisting(candidate))
                .Where(c => !string.IsNullOrWhiteSpace(c))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(c => $@"u.""{c}""")
                .ToList();
            var phoneExpr = phoneColumns.Count > 0
                ? $"coalesce({string.Join(", ", phoneColumns)})"
                : "null";

            var titleColumn = FirstExisting("JobTitle", "Title", "Position", "job_title");
            var statusColumn = FirstExisting("Status", "status");
            var titleExpr = string.IsNullOrWhiteSpace(titleColumn) ? "null" : $@"u.""{titleColumn}""";
            var statusExpr = string.IsNullOrWhiteSpace(statusColumn) ? "'active'" : $@"u.""{statusColumn}""";

            await using var cmd = db.CreateCommand();
            cmd.CommandText = $@"
                select
                    u.""Id"",
                    u.""Name"",
                    u.""Email"",
                    {phoneExpr} as ""Phone"",
                    {titleExpr} as ""Title"",
                    {statusExpr} as ""Status""
                from ""UserRoles"" ur
                join ""Users"" u on u.""Id"" = ur.""UserId""
                where ur.""RoleId"" = @roleId
                order by u.""Name"";";
            cmd.Parameters.AddWithValue("@roleId", roleId);

            var results = new List<DispatchUserWire>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(new DispatchUserWire
                {
                    Id = reader.GetInt32(reader.GetOrdinal("Id")),
                    Name = reader["Name"]?.ToString() ?? "",
                    Email = reader["Email"]?.ToString() ?? "",
                    Phone = reader["Phone"]?.ToString() ?? "",
                    Title = reader["Title"]?.ToString() ?? "",
                    Status = reader["Status"]?.ToString() ?? "active"
                });
            }

            return results;
        }
        catch
        {
            return new List<DispatchUserWire>();
        }
    }

    private string? ResolvePortalDbConnectionString()
    {
        var raw = _configuration.GetConnectionString("PortalDbConnection")
            ?? Environment.GetEnvironmentVariable("PORTAL_DB_CONNECTION")
            ?? Environment.GetEnvironmentVariable("PORTAL_DATABASE_URL");
        if (string.IsNullOrWhiteSpace(raw)) return null;

        if (raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
            raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(raw);
            var userInfo = uri.UserInfo.Split(':');
            if (userInfo.Length >= 2)
            {
                return $"Host={uri.Host};Port={uri.Port};Database={uri.AbsolutePath.TrimStart('/')};Username={userInfo[0]};Password={userInfo[1]};SSL Mode=Disable;Trust Server Certificate=true";
            }
        }

        return raw;
    }

    private string? ResolvePrimaryDbConnectionString()
    {
        var raw = _configuration.GetConnectionString("DefaultConnection")
            ?? Environment.GetEnvironmentVariable("DATABASE_URL");
        if (string.IsNullOrWhiteSpace(raw)) return null;

        if (raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
            raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(raw);
            var userInfo = uri.UserInfo.Split(':');
            if (userInfo.Length >= 2)
            {
                return $"Host={uri.Host};Port={uri.Port};Database={uri.AbsolutePath.TrimStart('/')};Username={userInfo[0]};Password={userInfo[1]};SSL Mode=Disable;Trust Server Certificate=true";
            }
        }
        return raw;
    }

    private static string ResolveFleetName(
        DriverWire driver,
        IReadOnlyDictionary<int, string> fleetNameById,
        IReadOnlyDictionary<int, List<int>> fleetDriverLookup)
    {
        if (driver.FleetId.HasValue && fleetNameById.TryGetValue(driver.FleetId.Value, out var byFleetIdName))
            return byFleetIdName;

        if (fleetDriverLookup.TryGetValue(driver.Id, out var relatedFleetIds))
        {
            foreach (var fleetId in relatedFleetIds)
            {
                if (fleetNameById.TryGetValue(fleetId, out var byMembershipName))
                    return byMembershipName;
            }
        }

        return "—";
    }

    private static (int? DispatchUserId, string? DispatcherName) ResolveDispatchMetadataFromNotes(string? notes)
    {
        var raw = notes ?? string.Empty;
        var match = System.Text.RegularExpressions.Regex.Match(raw, @"\[dispatch-assignee-id:(\d+)(?:\|name:[^\]]+)?\]", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!match.Success) return (null, null);
        int? parsedId = int.TryParse(match.Groups[1].Value, out var id) && id > 0 ? id : null;
        var nameMatch = System.Text.RegularExpressions.Regex.Match(raw, @"\[dispatch-assignee-id:\d+\|name:([^\]]+)\]", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        var parsedName = nameMatch.Success ? (nameMatch.Groups[1].Value ?? string.Empty).Trim() : null;
        return (parsedId, string.IsNullOrWhiteSpace(parsedName) ? null : parsedName);
    }

    private static string NormalizePersonName(string? value)
    {
        return (value ?? string.Empty)
            .Trim()
            .ToLowerInvariant()
            .Replace("_", " ")
            .Replace("-", " ")
            .Replace(".", " ")
            .Replace(",", " ")
            .Replace("  ", " ");
    }

    private static string NormalizeStatus(string? status)
    {
        var normalized = (status ?? string.Empty)
            .Trim()
            .ToLowerInvariant()
            .Replace("_", "-");
        return string.IsNullOrWhiteSpace(normalized) ? "active" : normalized;
    }

    private static bool IsActiveStatus(string? status)
    {
        var normalized = NormalizeStatus(status);
        return normalized == "active" || normalized == "available" || normalized == "online";
    }

    private static bool IsLandmarkOtrFleet(string? fleetName)
    {
        var normalized = (fleetName ?? string.Empty).Trim().ToLowerInvariant();
        return normalized.Contains("landmark otr");
    }

    private static bool IsLandmarkDrayageFleet(string? fleetName)
    {
        var normalized = (fleetName ?? string.Empty).Trim().ToLowerInvariant();
        return normalized.Contains("landmark drayage");
    }

    private sealed class DriverWire
    {
        public int Id { get; set; }
        public string? Name { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Status { get; set; }
        public int? FleetId { get; set; }
        public string? Notes { get; set; }
        public DateOnly? HireDate { get; set; }
    }

    private sealed class DispatchUserWire
    {
        public int Id { get; set; }
        public string? Name { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Title { get; set; }
        public string? Status { get; set; }
    }

    private sealed class DispatcherOverviewDto
    {
        public int Id { get; set; }
        public string? Name { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Title { get; set; }
        public string? Status { get; set; }
        public List<DispatcherAssignedDriverDto> AssignedDrivers { get; set; } = new();
        public int AssignedDriverCount { get; set; }
    }

    private sealed class DispatcherAssignedDriverDto
    {
        public string DriverId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
    }

    private sealed class DispatcherDriverDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public int? FleetId { get; set; }
        public string FleetName { get; set; } = "—";
        public DateTime? HireDate { get; set; }
        public int? DispatchUserId { get; set; }
        public string? DispatcherName { get; set; }
        public string? DispatcherEmail { get; set; }
    }

    private sealed class DriverDispatchAssignmentWire
    {
        public int? DispatchUserId { get; set; }
        public string? DispatcherName { get; set; }
        public string? DispatcherEmail { get; set; }
    }
}
