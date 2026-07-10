using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;
using Microsoft.Extensions.DependencyInjection;

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
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly MotivFuelLiveClient _motivFuelLiveClient;

    public InternalServiceController(
        TaylorAccessDbContext db,
        IConfiguration config,
        ILogger<InternalServiceController> logger,
        IServiceScopeFactory scopeFactory,
        MotivFuelLiveClient motivFuelLiveClient)
    {
        _db = db;
        _config = config;
        _logger = logger;
        _scopeFactory = scopeFactory;
        _motivFuelLiveClient = motivFuelLiveClient;
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

    /// <summary>Cached Motive driver-analysis snapshot (fast DB read for VanTac Analysis tab).</summary>
    [HttpGet("motiv/driver-analysis")]
    public async Task<ActionResult> GetCachedDriverAnalysis(
        [FromQuery] string? startDate = null,
        [FromQuery] string? endDate = null,
        [FromQuery] int? organizationId = null)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var (start, end, startIso, endIso) = MotiveDriverAnalysisHelpers.ParseRange(startDate, endDate);
        var orgId = organizationId;
        if (!orgId.HasValue || orgId.Value <= 0)
        {
            orgId = await _db.Organizations.AsNoTracking()
                .OrderBy(o => o.Id)
                .Select(o => (int?)o.Id)
                .FirstOrDefaultAsync();
        }

        var cache = await _db.MotivDriverAnalysisCaches.AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.OrganizationId == orgId
                && x.StartDate == start
                && x.EndDate == end);

        if (cache == null)
        {
            return Ok(new
            {
                source = "cache",
                endpoint = "driver-analysis",
                cached = false,
                connected = false,
                startDate = startIso,
                endDate = endIso,
                drivers = 0,
                lastRefreshedAt = (DateTime?)null,
                refreshInProgress = MotiveDriverAnalysisRefreshTracker.IsActive(
                    MotiveDriverAnalysisHelpers.BuildRefreshKey(orgId, start, end)),
                data = Array.Empty<object>()
            });
        }

        return Ok(new
        {
            source = "cache",
            endpoint = "driver-analysis",
            cached = true,
            connected = cache.Connected,
            startDate = startIso,
            endDate = endIso,
            drivers = cache.DriverCount,
            lastRefreshedAt = cache.RefreshedAt,
            refreshInProgress = MotiveDriverAnalysisRefreshTracker.IsActive(
                MotiveDriverAnalysisHelpers.BuildRefreshKey(orgId, start, end)),
            data = MotiveDriverAnalysisHelpers.DeserializePayload(cache.PayloadJson)
        });
    }

    /// <summary>Queue a background Motive refresh for a date range.</summary>
    [HttpPost("motiv/driver-analysis/refresh")]
    public async Task<ActionResult> RefreshCachedDriverAnalysis(
        [FromQuery] string? startDate = null,
        [FromQuery] string? endDate = null,
        [FromQuery] int? organizationId = null)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var (start, end, startIso, endIso) = MotiveDriverAnalysisHelpers.ParseRange(startDate, endDate);
        var orgId = organizationId;
        if (!orgId.HasValue || orgId.Value <= 0)
        {
            orgId = await _db.Organizations.AsNoTracking()
                .OrderBy(o => o.Id)
                .Select(o => (int?)o.Id)
                .FirstOrDefaultAsync();
        }

        var orgKey = orgId > 0 ? orgId : null;
        var refreshKey = MotiveDriverAnalysisHelpers.BuildRefreshKey(orgKey, start, end);
        if (MotiveDriverAnalysisRefreshTracker.IsActive(refreshKey))
        {
            return Accepted(new
            {
                status = "in_progress",
                startDate = startIso,
                endDate = endIso
            });
        }

        if (!MotiveDriverAnalysisRefreshTracker.TryStart(refreshKey))
        {
            return Accepted(new
            {
                status = "in_progress",
                startDate = startIso,
                endDate = endIso
            });
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var worker = ActivatorUtilities.CreateInstance<MotivController>(scope.ServiceProvider);
                await worker.ExecuteDriverAnalysisRefreshAsync(orgKey, start, end);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Internal Motive driver-analysis refresh failed for {Start} to {End}", startIso, endIso);
            }
            finally
            {
                MotiveDriverAnalysisRefreshTracker.Complete(refreshKey);
            }
        });

        return Accepted(new
        {
            status = "started",
            startDate = startIso,
            endDate = endIso,
            message = "Motive refresh started. Poll GET internal/motiv/driver-analysis for results."
        });
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

    /// <summary>Live Motive fuel card transactions for Accounting and other internal consumers.</summary>
    [HttpGet("motiv/fuel-transactions")]
    public async Task<ActionResult> GetLiveFuelTransactions(
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var from = (fromDate ?? DateTime.UtcNow.Date.AddMonths(-1)).Date;
        var to = (toDate ?? DateTime.UtcNow.Date).Date;
        if (to < from)
            (from, to) = (to, from);

        var result = await _motivFuelLiveClient.FetchTransactionsAsync(from, to);
        var data = result.Records.Select(r => new
        {
            id = r.TransactionId,
            transaction_id = r.TransactionId,
            transaction_time = r.TransactionDate?.ToUniversalTime().ToString("O"),
            amount = r.Amount,
            total_amount = r.Amount,
            driver_name = r.DriverName,
            merchant_name = r.MerchantName,
            vehicle_number = r.TruckNumber,
            truck_number = r.TruckNumber,
            unit = r.TruckNumber,
            status = r.Status
        }).ToList();

        return Ok(new
        {
            source = "motive-live",
            connected = result.Connected,
            total = data.Count,
            warning = result.Warning,
            data
        });
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

    /// <summary>Get driver payment methods for internal service consumers.</summary>
    [HttpGet("driver-payments")]
    public async Task<ActionResult> GetDriverPayments(
        [FromQuery] int? driverId = null,
        [FromQuery] int limit = 500)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var cappedLimit = Math.Clamp(limit, 1, 5000);
        var query = _db.DriverPayments.AsNoTracking().AsQueryable();

        if (driverId is > 0)
            query = query.Where(p => p.DriverId == driverId.Value);

        var total = await query.CountAsync();
        var data = await query
            .OrderByDescending(p => p.UpdatedAt)
            .Take(cappedLimit)
            .Select(p => new
            {
                p.Id,
                p.DriverId,
                p.OrganizationId,
                p.PaymentMethod,
                p.BankName,
                p.RoutingNumber,
                p.AccountNumber,
                p.AccountType,
                p.CardType,
                p.CardLastFour,
                p.CardHolderName,
                p.MailingAddress,
                p.Status,
                p.CreatedAt,
                p.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data, total });
    }

    /// <summary>Create or update a driver's direct-deposit payment method from Taylor Accounting.</summary>
    [HttpPost("driver-payments/upsert")]
    public async Task<ActionResult> UpsertDriverPayment([FromBody] UpsertInternalDriverPaymentRequest request)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        if (request.DriverId <= 0)
            return BadRequest(new { error = "driverId is required" });

        var driver = await _db.Drivers.AsNoTracking().FirstOrDefaultAsync(d => d.Id == request.DriverId);
        if (driver == null)
            return BadRequest(new { error = "Driver not found" });

        var accountType = string.IsNullOrWhiteSpace(request.AccountType)
            ? "checking"
            : request.AccountType.Trim().ToLowerInvariant();

        var payment = await _db.DriverPayments
            .Where(p => p.DriverId == request.DriverId
                && p.PaymentMethod == "direct_deposit"
                && (p.AccountType ?? "checking") == accountType)
            .OrderByDescending(p => p.UpdatedAt)
            .FirstOrDefaultAsync();

        if (payment == null)
        {
            payment = new TaylorAccess.API.Models.DriverPayment
            {
                DriverId = request.DriverId,
                OrganizationId = request.OrganizationId > 0 ? request.OrganizationId : driver.OrganizationId,
                PaymentMethod = "direct_deposit",
                AccountType = accountType,
                Status = string.IsNullOrWhiteSpace(request.Status) ? "active" : request.Status.Trim().ToLowerInvariant(),
                CreatedAt = DateTime.UtcNow
            };
            _db.DriverPayments.Add(payment);
        }

        if (!string.IsNullOrWhiteSpace(request.BankName)) payment.BankName = request.BankName.Trim();
        if (!string.IsNullOrWhiteSpace(request.RoutingNumber)) payment.RoutingNumber = request.RoutingNumber.Trim();
        if (!string.IsNullOrWhiteSpace(request.AccountNumber)) payment.AccountNumber = request.AccountNumber.Trim();
        if (!string.IsNullOrWhiteSpace(request.Status)) payment.Status = request.Status.Trim().ToLowerInvariant();
        payment.AccountType = accountType;
        payment.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            data = new
            {
                payment.Id,
                payment.DriverId,
                payment.OrganizationId,
                payment.PaymentMethod,
                payment.BankName,
                payment.RoutingNumber,
                payment.AccountNumber,
                payment.AccountType,
                payment.Status,
                payment.UpdatedAt
            }
        });
    }

    /// <summary>Fleet-wide Motive activity logs for VanTac (no per-user org scoping).</summary>
    [HttpGet("motiv/activity-logs")]
    public async Task<ActionResult> GetMotivActivityLogs(
        [FromQuery] int limit = 1000,
        [FromQuery] string? search = null,
        [FromQuery] string? kind = null,
        [FromQuery] string? scope = null,
        [FromQuery] string? driverName = null,
        [FromQuery] string? fromDate = null,
        [FromQuery] string? toDate = null)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var cappedLimit = Math.Clamp(limit <= 0 ? 1000 : limit, 1, 5000);
        var fromUtc = MotivActivityLogReadHelper.ParseDateBoundary(fromDate, endOfDay: false);
        var toUtc = MotivActivityLogReadHelper.ParseDateBoundary(toDate, endOfDay: true);

        var query = _db.MotivActivityLogs.AsNoTracking();
        query = MotivActivityLogReadHelper.ApplyFilters(
            query,
            kind,
            scope,
            search,
            driverName,
            fromUtc,
            toUtc);

        var rows = await query
            .OrderByDescending(x => x.EventAt)
            .ThenByDescending(x => x.Id)
            .Take(cappedLimit)
            .Select(x => new
            {
                id = x.Id,
                kind = x.Kind,
                title = x.Title,
                details = x.Details,
                driverName = x.DriverName,
                previousLocation = x.PreviousLocation,
                currentLocation = x.CurrentLocation,
                timestamp = x.EventAt
            })
            .ToListAsync();

        return Ok(new
        {
            rows,
            count = rows.Count,
            limit = cappedLimit,
            source = "internal"
        });
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

    /// <summary>Upsert driver pay sheets pushed from Taylor Accounting payroll processing.</summary>
    [HttpPost("driver-pay-sheets")]
    public async Task<ActionResult> UpsertDriverPaySheet([FromBody] JsonElement body)
    {
        if (!IsAuthorizedInternalCall())
            return Unauthorized(new { error = "Invalid gateway or service key" });

        var driverId = TryGetInt(body, "driverId", "driver_id");
        if (driverId <= 0)
            return BadRequest(new { error = "driverId is required" });

        var driver = await _db.Drivers.FirstOrDefaultAsync(d => d.Id == driverId);
        if (driver == null)
            return BadRequest(new { error = "Driver not found" });

        var paySheetNumber = TryGetString(body, "paySheetNumber", "pay_sheet_number", "paystubId", "paystub_id");
        if (string.IsNullOrWhiteSpace(paySheetNumber))
            paySheetNumber = TaylorAccess.API.Models.DriverPaySheet.GenerateNumber();

        var periodStart = TryGetDate(body, "periodStart", "period_start") ?? DateTime.UtcNow.Date.AddDays(-7);
        var periodEnd = TryGetDate(body, "periodEnd", "period_end") ?? DateTime.UtcNow.Date;

        var existing = await _db.DriverPaySheets
            .FirstOrDefaultAsync(p => p.PaySheetNumber == paySheetNumber);

        TaylorAccess.API.Models.DriverPaySheet paySheet;
        if (existing != null)
        {
            paySheet = existing;
        }
        else
        {
            paySheet = new TaylorAccess.API.Models.DriverPaySheet
            {
                OrganizationId = driver.OrganizationId,
                DriverId = driverId,
                PaySheetNumber = paySheetNumber,
                CreatedAt = DateTime.UtcNow
            };
            _db.DriverPaySheets.Add(paySheet);
        }

        paySheet.PeriodStart = periodStart;
        paySheet.PeriodEnd = periodEnd;
        paySheet.TotalMiles = TryGetDecimal(body, "totalMiles", "total_miles");
        paySheet.PercentageLoads = TryGetDecimal(body, "percentageLoads", "percentage_loads");
        paySheet.GrossPay = TryGetDecimal(body, "grossPay", "gross_pay");
        paySheet.TotalDeductions = TryGetDecimal(body, "totalDeductions", "total_deductions");
        paySheet.NetPay = TryGetDecimal(body, "netPay", "net_pay");
        paySheet.Notes = TryGetString(body, "notes");
        paySheet.Status = TryGetString(body, "status") ?? "approved";
        paySheet.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        _logger.LogInformation(
            "Upserted driver pay sheet {PaySheetNumber} for driver {DriverId} from Taylor Accounting",
            paySheet.PaySheetNumber,
            driverId);

        return Ok(new { data = paySheet, paystubId = paySheet.PaySheetNumber });
    }

    private static int TryGetInt(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (element.ValueKind != JsonValueKind.Object) continue;
            foreach (var property in element.EnumerateObject())
            {
                if (!string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
                if (property.Value.ValueKind == JsonValueKind.Number && property.Value.TryGetInt32(out var n))
                    return n;
                if (property.Value.ValueKind == JsonValueKind.String
                    && int.TryParse(property.Value.GetString(), out var parsed))
                    return parsed;
            }
        }

        return 0;
    }

    private static decimal TryGetDecimal(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (element.ValueKind != JsonValueKind.Object) continue;
            foreach (var property in element.EnumerateObject())
            {
                if (!string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
                if (property.Value.ValueKind == JsonValueKind.Number && property.Value.TryGetDecimal(out var n))
                    return n;
                if (property.Value.ValueKind == JsonValueKind.String
                    && decimal.TryParse(property.Value.GetString(), out var parsed))
                    return parsed;
            }
        }

        return 0m;
    }

    private static DateTime? TryGetDate(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (element.ValueKind != JsonValueKind.Object) continue;
            foreach (var property in element.EnumerateObject())
            {
                if (!string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
                if (property.Value.ValueKind == JsonValueKind.String
                    && DateTime.TryParse(property.Value.GetString(), out var parsed))
                    return parsed.Date;
            }
        }

        return null;
    }
}

public record UpsertInternalDriverPaymentRequest(
    int DriverId,
    int OrganizationId,
    string? BankName,
    string? RoutingNumber,
    string? AccountNumber,
    string? AccountType,
    string? Status
);
