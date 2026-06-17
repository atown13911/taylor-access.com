using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TaylorAccess.API.Data;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Internal service-to-service endpoints for VanTac and other trusted services.
/// Protected by X-Service-Key header — no user JWT required.
/// </summary>
[ApiController]
[Route("internal")]
[AllowAnonymous]
public class InternalServiceController : ControllerBase
{
    private readonly TaylorAccessDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<InternalServiceController> _logger;

    public InternalServiceController(TaylorAccessDbContext db, IConfiguration config, ILogger<InternalServiceController> logger)
    {
        _db = db;
        _config = config;
        _logger = logger;
    }

    private bool ValidateServiceKey()
    {
        var expected = _config["INTERNAL_SERVICE_KEY"]
            ?? Environment.GetEnvironmentVariable("INTERNAL_SERVICE_KEY")
            ?? "ta-internal-service-key-2026";
        var provided = Request.Headers["X-Service-Key"].FirstOrDefault();
        return !string.IsNullOrEmpty(provided) && provided == expected;
    }

    private bool IsGatewayRequest()
    {
        return Request.Headers["X-GW-Internal"].FirstOrDefault() == "1";
    }

    private bool AllowLegacyServiceKey()
    {
        return bool.TryParse(_config["ALLOW_LEGACY_INTERNAL_SERVICE_KEY"]
                ?? Environment.GetEnvironmentVariable("ALLOW_LEGACY_INTERNAL_SERVICE_KEY"), out var allow)
            && allow;
    }

    private bool IsAuthorizedInternalCall()
    {
        if (IsGatewayRequest())
            return true;

        if (AllowLegacyServiceKey())
            return ValidateServiceKey();

        return false;
    }

    /// <summary>Motiv fuel purchases for payroll and internal service consumers.</summary>
    [HttpGet("fuel-purchases")]
    public async Task<ActionResult> GetFuelPurchases(
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null,
        [FromQuery] int limit = 10000)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var cappedLimit = Math.Clamp(limit, 1, 25000);
        var query = _db.MotivFuelPurchases.AsNoTracking().AsQueryable();

        if (fromDate.HasValue)
        {
            var from = fromDate.Value.Date;
            query = query.Where(x =>
                (x.TransactionTime ?? x.PostedAt ?? x.CreatedAt).Date >= from);
        }

        if (toDate.HasValue)
        {
            var to = toDate.Value.Date;
            query = query.Where(x =>
                (x.TransactionTime ?? x.PostedAt ?? x.CreatedAt).Date <= to);
        }

        var profiles = await _db.MotivDriverProfiles
            .AsNoTracking()
            .Include(p => p.Driver)
            .ToListAsync();

        var profileByMotivUserId = profiles
            .Where(p => !string.IsNullOrWhiteSpace(p.MotivUserId))
            .GroupBy(p => p.MotivUserId!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var profileByMotivVehicleId = profiles
            .Where(p => !string.IsNullOrWhiteSpace(p.MotivVehicleId))
            .GroupBy(p => p.MotivVehicleId!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var purchases = await query
            .OrderByDescending(x => x.TransactionTime ?? x.PostedAt ?? x.UpdatedAt)
            .Take(cappedLimit)
            .ToListAsync();

        var data = purchases.Select(p =>
        {
            TaylorAccess.API.Models.MotivDriverProfile? profile = null;
            if (p.DriverId is > 0
                && profileByMotivUserId.TryGetValue(p.DriverId.Value.ToString(), out var byDriver))
            {
                profile = byDriver;
            }
            else if (p.VehicleId is > 0
                && profileByMotivVehicleId.TryGetValue(p.VehicleId.Value.ToString(), out var byVehicle))
            {
                profile = byVehicle;
            }

            var rawVehicleNumber = ExtractFuelPurchaseVehicleNumber(p.RawJson);
            var rawDriverName = ExtractFuelPurchaseDriverName(p.RawJson);
            var truckNumber = profile?.Driver?.TruckNumber ?? profile?.VehicleNumber ?? rawVehicleNumber;
            var driverName = profile?.Driver?.Name ?? rawDriverName;

            return new
            {
                id = p.ExternalId,
                transaction_id = p.ExternalId,
                transaction_time = p.TransactionTime?.ToUniversalTime().ToString("O"),
                posted_at = p.PostedAt?.ToUniversalTime().ToString("O"),
                amount = p.Amount,
                total_amount = p.Amount,
                total_cost = p.Amount,
                driver_id = p.DriverId,
                vehicle_id = p.VehicleId,
                vehicle_number = truckNumber,
                truck_number = truckNumber,
                unit = truckNumber,
                driver_name = driverName,
                taylor_access_driver_id = profile?.DriverId,
                merchant_name = p.MerchantName,
                status = p.Status,
                source = "access-db"
            };
        }).ToList();

        return Ok(new { data, total = data.Count, source = "taylor-access-motiv-fuel" });
    }

    private static string? ExtractFuelPurchaseVehicleNumber(string? rawJson)
    {
        if (string.IsNullOrWhiteSpace(rawJson)) return null;
        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;
            var payload = TryGetObject(root, "fuel_purchase")
                ?? TryGetObject(root, "transaction")
                ?? TryGetObject(root, "card_transaction")
                ?? root;
            var vehicle = TryGetObject(payload, "vehicle") ?? TryGetObject(root, "vehicle");
            if (vehicle.HasValue)
            {
                return FirstNonEmpty(
                    TryGetString(vehicle.Value, "number"),
                    TryGetString(vehicle.Value, "unit_number"),
                    TryGetString(vehicle.Value, "fleet_number"),
                    TryGetString(vehicle.Value, "name"));
            }

            return FirstNonEmpty(
                TryGetString(payload, "vehicle_number"),
                TryGetString(root, "vehicle_number"));
        }
        catch
        {
            return null;
        }
    }

    private static string? ExtractFuelPurchaseDriverName(string? rawJson)
    {
        if (string.IsNullOrWhiteSpace(rawJson)) return null;
        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;
            var payload = TryGetObject(root, "fuel_purchase")
                ?? TryGetObject(root, "transaction")
                ?? TryGetObject(root, "card_transaction")
                ?? root;
            var driver = TryGetObject(payload, "driver") ?? TryGetObject(root, "driver");
            if (driver.HasValue)
            {
                var first = TryGetString(driver.Value, "first_name", "firstName");
                var last = TryGetString(driver.Value, "last_name", "lastName");
                var combined = string.Join(' ', new[] { first, last }.Where(v => !string.IsNullOrWhiteSpace(v)));
                return FirstNonEmpty(
                    TryGetString(driver.Value, "name"),
                    string.IsNullOrWhiteSpace(combined) ? null : combined);
            }

            return TryGetString(payload, "driver_name") ?? TryGetString(root, "driver_name");
        }
        catch
        {
            return null;
        }
    }

    private static JsonElement? TryGetObject(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Object) return null;
        foreach (var property in element.EnumerateObject())
        {
            if (!string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
            if (property.Value.ValueKind == JsonValueKind.Object) return property.Value;
        }

        return null;
    }

    private static string? TryGetString(JsonElement element, params string[] names)
    {
        if (element.ValueKind != JsonValueKind.Object) return null;
        foreach (var name in names)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (!string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
                if (property.Value.ValueKind == JsonValueKind.String)
                {
                    var value = property.Value.GetString();
                    if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
                }
            }
        }

        return null;
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
        }

        return null;
    }

    /// <summary>Get drivers for internal service consumers.</summary>
    [HttpGet("drivers")]
    public async Task<ActionResult> GetDrivers(
        [FromQuery] int limit = 500,
        [FromQuery] int page = 1,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        IQueryable<TaylorAccess.API.Models.Driver> query = _db.Drivers.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalizedStatus = status.Trim().ToLower();
            query = query.Where(d => (d.Status ?? "").ToLower() == normalizedStatus);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var normalizedSearch = search.Trim().ToLower();
            query = query.Where(d =>
                (d.Name ?? "").ToLower().Contains(normalizedSearch) ||
                (d.Email ?? "").ToLower().Contains(normalizedSearch) ||
                (d.Phone ?? "").ToLower().Contains(normalizedSearch));
        }

        var fleetMembershipLookup = await _db.FleetDrivers
            .AsNoTracking()
            .Include(fd => fd.Fleet)
            .ToDictionaryAsync(fd => fd.DriverId, fd => fd.Fleet!.Name);

        var fleetNameById = await _db.Fleets
            .AsNoTracking()
            .ToDictionaryAsync(f => f.Id, f => f.Name);

        var total = await query.CountAsync();
        var drivers = await query
            .OrderBy(d => d.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(d => new {
                d.Id,
                d.Name,
                d.Email,
                d.Phone,
                d.Status,
                d.TruckNumber,
                d.FleetId,
                d.LicenseNumber,
                d.LicenseState,
                d.LicenseExpiry,
                d.HireDate,
                d.DriverType,
                d.OrganizationId,
                d.CreatedAt,
                d.UpdatedAt
            })
            .ToListAsync();

        var data = drivers.Select(d => new
        {
            d.Id,
            d.Name,
            d.Email,
            d.Phone,
            d.Status,
            d.TruckNumber,
            d.FleetId,
            fleetName = ResolveFleetName(d.Id, d.FleetId, fleetMembershipLookup, fleetNameById),
            d.LicenseNumber,
            d.LicenseState,
            d.LicenseExpiry,
            d.HireDate,
            d.DriverType,
            d.OrganizationId,
            d.CreatedAt,
            d.UpdatedAt
        }).ToList();

        return Ok(new { data, total });
    }

    private static string? ResolveFleetName(
        int driverId,
        int? fleetId,
        IReadOnlyDictionary<int, string> fleetMembershipLookup,
        IReadOnlyDictionary<int, string> fleetNameById)
    {
        if (fleetMembershipLookup.TryGetValue(driverId, out var membershipName)
            && !string.IsNullOrWhiteSpace(membershipName))
        {
            return membershipName.Trim();
        }

        if (fleetId.HasValue
            && fleetNameById.TryGetValue(fleetId.Value, out var fleetName)
            && !string.IsNullOrWhiteSpace(fleetName))
        {
            return fleetName.Trim();
        }

        return null;
    }

    /// <summary>Get employees/users for internal service consumers.</summary>
    [HttpGet("employees")]
    public async Task<ActionResult> GetEmployees(
        [FromQuery] int limit = 500,
        [FromQuery] int page = 1,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var query = _db.Users
            .AsNoTracking()
            .OrderBy(u => u.Name)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalizedStatus = status.Trim().ToLower();
            query = query.Where(u => (u.Status ?? "").ToLower() == normalizedStatus);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var normalizedSearch = search.Trim().ToLower();
            query = query.Where(u =>
                (u.Name ?? "").ToLower().Contains(normalizedSearch) ||
                (u.Email ?? "").ToLower().Contains(normalizedSearch) ||
                (u.Phone ?? "").ToLower().Contains(normalizedSearch));
        }

        var total = await query.CountAsync();
        var employees = await query
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(u => new
            {
                u.Id,
                u.Name,
                u.Email,
                u.Phone,
                u.Role,
                u.Status,
                u.OrganizationId,
                u.DepartmentId,
                u.PositionId,
                u.CreatedAt,
                u.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = employees, total });
    }

    /// <summary>Get all active carriers (for VanTac Fleet Management)</summary>
    [HttpGet("carriers")]
    public async Task<ActionResult> GetCarriers([FromQuery] int limit = 500, [FromQuery] int page = 1)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        // Return carriers from the Carriers table or driver records with type=carrier
        var carriers = await _db.Drivers
            .AsNoTracking()
            .Where(d => d.DriverType == "carrier" || d.DriverType == "owner_operator")
            .OrderBy(d => d.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(d => new {
                d.Id,
                d.Name,
                d.Phone,
                d.Email,
                d.Status,
                d.DriverType,
                d.OrganizationId
            })
            .ToListAsync();

        return Ok(new { data = carriers, total = carriers.Count });
    }

    /// <summary>Get fleet summary (for VanTac Fleet Management)</summary>
    [HttpGet("fleets")]
    public async Task<ActionResult> GetFleets()
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var totalDrivers  = await _db.Drivers.CountAsync(d => d.Status == "active" || d.Status == "Active");
        var activeDrivers = totalDrivers;

        return Ok(new {
            totalDrivers,
            activeDrivers,
            source = "taylor-access"
        });
    }

    /// <summary>Lightweight data health counts for internal diagnostics.</summary>
    [HttpGet("health/data-counts")]
    public async Task<ActionResult> GetDataCounts()
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var totalDrivers = await _db.Drivers.AsNoTracking().CountAsync();
        var activeDrivers = await _db.Drivers.AsNoTracking()
            .CountAsync(d => d.Status != null && d.Status.ToLower() == "active");
        var archivedDrivers = await _db.Drivers.AsNoTracking()
            .CountAsync(d => d.Status != null && d.Status.ToLower() == "archived");

        var totalEmployees = await _db.Users.AsNoTracking().CountAsync();
        var activeEmployees = await _db.Users.AsNoTracking()
            .CountAsync(u => u.Status != null && u.Status.ToLower() == "active");

        return Ok(new
        {
            source = "taylor-access",
            drivers = new
            {
                total = totalDrivers,
                active = activeDrivers,
                archived = archivedDrivers
            },
            employees = new
            {
                total = totalEmployees,
                active = activeEmployees
            },
            utc = DateTime.UtcNow
        });
    }
}
