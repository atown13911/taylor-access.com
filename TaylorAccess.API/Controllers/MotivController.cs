using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;
using System.Text.RegularExpressions;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/motiv")]
[Authorize]
public class MotivController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<MotivController> _logger;
    private readonly TaylorAccessDbContext _db;
    private readonly CurrentUserService _currentUserService;

    public MotivController(
        IConfiguration config,
        IHttpClientFactory httpClientFactory,
        ILogger<MotivController> logger,
        TaylorAccessDbContext db,
        CurrentUserService currentUserService)
    {
        _config = config;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _db = db;
        _currentUserService = currentUserService;
    }

    [HttpGet("config")]
    public IActionResult GetConfig()
    {
        var apiKey = _config["MOTIV_API_KEY"] ?? Environment.GetEnvironmentVariable("MOTIV_API_KEY");
        var baseUrl = _config["MOTIV_API_BASE_URL"] ?? Environment.GetEnvironmentVariable("MOTIV_API_BASE_URL");

        return Ok(new
        {
            headerName = "x-api-key",
            hasApiKey = !string.IsNullOrWhiteSpace(apiKey),
            hasBaseUrl = !string.IsNullOrWhiteSpace(baseUrl)
        });
    }

    [HttpGet("drivers")]
    public async Task<IActionResult> GetDrivers()
    {
        var enriched = await FetchEnrichedDriverRows("drivers");
        if (!enriched.Success)
        {
            return StatusCode(enriched.StatusCode, new
            {
                error = "MOTIV drivers request failed.",
                status = enriched.StatusCode,
                details = enriched.Error
            });
        }

        return Ok(new
        {
            source = "motiv",
            endpoint = "drivers",
            path = enriched.SourcePath,
            rows = enriched.Rows.Count,
            userRows = enriched.UserRows,
            locationRows = enriched.LocationRows,
            vehicleRows = enriched.VehicleRows,
            data = JsonSerializer.SerializeToElement(enriched.Rows)
        });
    }

    [HttpGet("vehicles")]
    public async Task<IActionResult> GetVehicles()
    {
        var path = _config["MOTIV_VEHICLES_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_VEHICLES_PATH")
            ?? "/v1/vehicles";
        var fetch = await FetchAllMotivRows(path, "vehicles");
        if (!fetch.Success)
        {
            return StatusCode(fetch.StatusCode, new
            {
                error = "MOTIV vehicles request failed.",
                status = fetch.StatusCode,
                details = fetch.Error
            });
        }

        return Ok(new
        {
            source = "motiv",
            endpoint = "vehicles",
            rows = fetch.Rows.Count,
            data = JsonSerializer.SerializeToElement(fetch.Rows)
        });
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var path = _config["MOTIV_USERS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_USERS_PATH")
            ?? "/v1/users?per_page=100&page_no=1";
        var fetch = await FetchAllMotivRows(path, "users");
        if (!fetch.Success)
        {
            return StatusCode(fetch.StatusCode, new
            {
                error = "MOTIV users request failed.",
                status = fetch.StatusCode,
                details = fetch.Error
            });
        }

        return Ok(new
        {
            source = "motiv",
            endpoint = "users",
            rows = fetch.Rows.Count,
            data = JsonSerializer.SerializeToElement(fetch.Rows)
        });
    }

    [HttpGet("fuel-purchases")]
    public async Task<IActionResult> GetFuelPurchases()
    {
        var path = _config["MOTIV_FUEL_PURCHASES_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_FUEL_PURCHASES_PATH")
            ?? "/v1/fuel_purchases";
        var fetch = await FetchAllMotivRows(path, "fuel-purchases");
        if (!fetch.Success)
        {
            return StatusCode(fetch.StatusCode, new
            {
                error = "MOTIV fuel-purchases request failed.",
                status = fetch.StatusCode,
                details = fetch.Error
            });
        }

        return Ok(new
        {
            source = "motiv",
            endpoint = "fuel-purchases",
            rows = fetch.Rows.Count,
            data = JsonSerializer.SerializeToElement(fetch.Rows)
        });
    }

    [HttpGet("probe")]
    public async Task<IActionResult> Probe([FromQuery] string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest(new { error = "Query parameter 'path' is required." });

        var normalizedPath = path.Trim();
        if (!normalizedPath.StartsWith("/", StringComparison.Ordinal))
            return BadRequest(new { error = "Path must be a relative endpoint that starts with '/'." });
        if (normalizedPath.Contains("://", StringComparison.Ordinal))
            return BadRequest(new { error = "Absolute URLs are not allowed. Use relative paths only." });

        var result = await FetchMotivPayload(normalizedPath, $"probe:{normalizedPath}", includeIncomingQuery: false);
        var reachable = IsReachable(result.Success, result.StatusCode);
        return Ok(new
        {
            source = "motiv",
            path = normalizedPath,
            connected = reachable,
            status = result.StatusCode,
            details = result.Success ? null : result.Error
        });
    }

    [HttpPost("probe-method")]
    public async Task<IActionResult> ProbeMethod([FromBody] MotivProbeMethodRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Path))
            return BadRequest(new { error = "Path is required." });

        var normalizedPath = request.Path.Trim();
        if (!normalizedPath.StartsWith("/", StringComparison.Ordinal))
            return BadRequest(new { error = "Path must be a relative endpoint that starts with '/'." });
        if (normalizedPath.Contains("://", StringComparison.Ordinal))
            return BadRequest(new { error = "Absolute URLs are not allowed. Use relative paths only." });

        var method = (request.Method ?? "GET").Trim().ToUpperInvariant();
        if (method != "GET" && method != "OPTIONS")
            return BadRequest(new { error = "Only GET and OPTIONS are allowed for probe-method." });

        var result = await FetchMotivResponse(
            normalizedPath,
            $"probe-method:{method}:{normalizedPath}",
            new HttpMethod(method),
            includeIncomingQuery: false);

        return Ok(new
        {
            source = "motiv",
            path = normalizedPath,
            method,
            connected = IsReachable(result.Success, result.StatusCode),
            status = result.StatusCode,
            details = result.Success ? null : result.Error
        });
    }

    [HttpPost("drivers/sync")]
    public async Task<IActionResult> SyncDriversToAccessDb()
    {
        var enriched = await FetchEnrichedDriverRows("drivers-sync");
        if (!enriched.Success)
        {
            return StatusCode(enriched.StatusCode, new
            {
                error = "Unable to sync MOTIV drivers because source fetch failed.",
                status = enriched.StatusCode,
                details = enriched.Error
            });
        }

        var rows = enriched.Rows;
        if (rows.Count == 0)
        {
            return Ok(new { fetched = 0, created = 0, updated = 0, skipped = 0, message = "No driver rows returned by MOTIV." });
        }

        var orgId = await ResolveOrganizationId();
        if (orgId == 0)
            return BadRequest(new { error = "Cannot sync drivers: no organization is assigned and no default organization exists." });

        var existingDrivers = await _db.Drivers
            .Where(d => !d.IsDeleted)
            .ToListAsync();

        var byEmail = existingDrivers
            .Where(d => !string.IsNullOrWhiteSpace(d.Email))
            .GroupBy(d => d.Email!.Trim().ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First());
        var byNamePhone = existingDrivers
            .GroupBy(d => $"{(d.Name ?? "").Trim().ToLowerInvariant()}|{(d.Phone ?? "").Trim()}")
            .ToDictionary(g => g.Key, g => g.First());

        var existingProfiles = await _db.MotivDriverProfiles.ToListAsync();
        var profileByDriverId = existingProfiles
            .GroupBy(p => p.DriverId)
            .ToDictionary(g => g.Key, g => g.First());

        var enrichedDrivers = 0;
        var profileCreated = 0;
        var profileUpdated = 0;
        var skipped = 0;

        foreach (var row in rows)
        {
            var user = PickNestedObject(row, "user") ?? row;
            if (!IsDriverLikeUser(user))
            {
                skipped++;
                continue;
            }
            var location = PickNestedObject(row, "current_location");
            var vehicle = PickNestedObject(row, "current_vehicle");

            var firstName = PickString(user, "first_name", "firstName");
            var lastName = PickString(user, "last_name", "lastName");
            var fallbackName = PickString(user, "name", "full_name", "fullName", "username");
            var displayName = BuildName(firstName, lastName, fallbackName);
            if (string.IsNullOrWhiteSpace(displayName))
            {
                skipped++;
                continue;
            }

            var email = PickString(user, "email");
            var phone = PickString(user, "phone", "phone_number", "mobile");
            var emailKey = (email ?? "").Trim().ToLowerInvariant();
            var namePhoneKey = $"{displayName.Trim().ToLowerInvariant()}|{(phone ?? "").Trim()}";

            Driver? target = null;
            if (!string.IsNullOrWhiteSpace(emailKey) && byEmail.TryGetValue(emailKey, out var byE))
                target = byE;
            else if (byNamePhone.TryGetValue(namePhoneKey, out var byNP))
                target = byNP;

            if (target == null)
            {
                skipped++;
                continue;
            }

            var mappedStatus = MapMotiveStatus(PickString(user, "status"));
            var lat = PickDecimal(location ?? row, "lat", "latitude");
            var lon = PickDecimal(location ?? row, "lon", "longitude", "lng");
            var locatedAt = ParseDateTime(PickString(location ?? row, "located_at", "locatedAt", "updated_at"));

            var vehicleNumber = PickString(vehicle ?? row, "number", "fleet_number", "fleetNumber", "unit", "unitNumber");
            var vehicleYear = PickInt(vehicle ?? row, "year", "vehicle_year", "vehicleYear");
            var vehicleMake = PickString(vehicle ?? row, "make", "vehicle_make", "vehicleMake");
            var vehicleModel = PickString(vehicle ?? row, "model", "vehicle_model", "vehicleModel");
            var vehicleVin = PickString(vehicle ?? row, "vin", "vehicle_vin", "vehicleVin");
            var motiveUserId = PickString(user, "id");
            var motiveVehicleId = PickString(vehicle ?? row, "id", "vehicle_id");

            // Keep Drivers table authoritative (never insert from MOTIV); only enrich existing drivers.
            target.OrganizationId = orgId;
            target.Name = displayName.Trim();
            target.Email = email ?? target.Email;
            target.Phone = phone ?? target.Phone;
            target.Status = mappedStatus;
            target.IsOnline = location.HasValue;
            target.Latitude = lat ?? target.Latitude;
            target.Longitude = lon ?? target.Longitude;
            target.LastLocationUpdate = locatedAt ?? target.LastLocationUpdate;
            target.TruckNumber = vehicleNumber ?? target.TruckNumber;
            target.TruckYear = vehicleYear ?? target.TruckYear;
            target.TruckMake = vehicleMake ?? target.TruckMake;
            target.TruckModel = vehicleModel ?? target.TruckModel;
            target.TruckVin = vehicleVin ?? target.TruckVin;
            target.DriverType = "driver";
            target.Notes = BuildMotivSyncNote(target.Notes, motiveUserId);
            target.UpdatedAt = DateTime.UtcNow;
            enrichedDrivers++;

            if (!profileByDriverId.TryGetValue(target.Id, out var profile))
            {
                profile = new MotivDriverProfile
                {
                    DriverId = target.Id,
                    MotivUserId = motiveUserId,
                    MotivVehicleId = motiveVehicleId,
                    MotivStatus = PickString(user, "status"),
                    Latitude = lat,
                    Longitude = lon,
                    LastLocationUpdate = locatedAt,
                    VehicleNumber = vehicleNumber,
                    VehicleYear = vehicleYear,
                    VehicleMake = vehicleMake,
                    VehicleModel = vehicleModel,
                    VehicleVin = vehicleVin,
                    RawJson = row.ToString(),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _db.MotivDriverProfiles.Add(profile);
                profileByDriverId[target.Id] = profile;
                profileCreated++;
            }
            else
            {
                profile.MotivUserId = motiveUserId ?? profile.MotivUserId;
                profile.MotivVehicleId = motiveVehicleId ?? profile.MotivVehicleId;
                profile.MotivStatus = PickString(user, "status") ?? profile.MotivStatus;
                profile.Latitude = lat ?? profile.Latitude;
                profile.Longitude = lon ?? profile.Longitude;
                profile.LastLocationUpdate = locatedAt ?? profile.LastLocationUpdate;
                profile.VehicleNumber = vehicleNumber ?? profile.VehicleNumber;
                profile.VehicleYear = vehicleYear ?? profile.VehicleYear;
                profile.VehicleMake = vehicleMake ?? profile.VehicleMake;
                profile.VehicleModel = vehicleModel ?? profile.VehicleModel;
                profile.VehicleVin = vehicleVin ?? profile.VehicleVin;
                profile.RawJson = row.ToString();
                profile.UpdatedAt = DateTime.UtcNow;
                profileUpdated++;
            }
        }

        await _db.SaveChangesAsync();

        return Ok(new
        {
            fetched = rows.Count,
            enrichedDrivers,
            profileCreated,
            profileUpdated,
            skipped,
            totalDrivers = await _db.Drivers.CountAsync(),
            totalMotivDriverProfiles = await _db.MotivDriverProfiles.CountAsync(),
            createMode = "update-only",
            sourcePath = enriched.SourcePath,
            userRows = enriched.UserRows,
            locationRows = enriched.LocationRows,
            vehicleRows = enriched.VehicleRows
        });
    }

    [HttpDelete("drivers/non-driver-cleanup")]
    public async Task<IActionResult> DeleteNonDriverRowsPreviouslySyncedFromMotiv()
    {
        var path = _config["MOTIV_USERS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_USERS_PATH")
            ?? "/v1/users?per_page=100&page_no=1";

        var usersFetch = await FetchAllMotivRows(path, "drivers-cleanup:users");
        if (!usersFetch.Success)
        {
            return StatusCode(usersFetch.StatusCode, new
            {
                error = "Unable to cleanup non-driver rows because MOTIV users fetch failed.",
                status = usersFetch.StatusCode,
                details = usersFetch.Error
            });
        }

        var nonDriverUserIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var nonDriverEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in usersFetch.Rows)
        {
            var user = PickNestedObject(row, "user") ?? row;
            if (IsDriverLikeUser(user))
                continue;

            var id = PickString(user, "id");
            var email = PickString(user, "email");
            if (!string.IsNullOrWhiteSpace(id))
                nonDriverUserIds.Add(id);
            if (!string.IsNullOrWhiteSpace(email))
                nonDriverEmails.Add(email.Trim().ToLowerInvariant());
        }

        var syncedDrivers = await _db.Drivers
            .Where(d => !d.IsDeleted && d.Notes != null && d.Notes.Contains("Synced from MOTIV"))
            .ToListAsync();

        var toDelete = new List<Driver>();
        foreach (var driver in syncedDrivers)
        {
            var noteUserId = ExtractMotivUserIdFromNotes(driver.Notes);
            var emailKey = (driver.Email ?? "").Trim().ToLowerInvariant();
            var isDriverType = string.Equals((driver.DriverType ?? "").Trim(), "driver", StringComparison.OrdinalIgnoreCase);

            var matchedNonDriverById = !string.IsNullOrWhiteSpace(noteUserId) && nonDriverUserIds.Contains(noteUserId);
            var matchedNonDriverByEmail = !string.IsNullOrWhiteSpace(emailKey) && nonDriverEmails.Contains(emailKey);

            if (matchedNonDriverById || (matchedNonDriverByEmail && !isDriverType))
                toDelete.Add(driver);
        }

        if (toDelete.Count == 0)
            return Ok(new { deleted = 0, checkedCount = syncedDrivers.Count, message = "No non-driver synced rows found to delete." });

        _db.Drivers.RemoveRange(toDelete);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            deleted = toDelete.Count,
            checkedCount = syncedDrivers.Count,
            remainingDrivers = await _db.Drivers.CountAsync()
        });
    }

    [HttpPost("fuel-purchases/sync")]
    public async Task<IActionResult> SyncFuelPurchasesToAccessDb()
    {
        var path = _config["MOTIV_FUEL_PURCHASES_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_FUEL_PURCHASES_PATH")
            ?? "/v1/fuel_purchases";

        var fetch = await FetchAllMotivRows(path, "fuel-purchases-sync");
        if (!fetch.Success)
        {
            return StatusCode(fetch.StatusCode, new
            {
                error = "Unable to sync MOTIV fuel purchases because source fetch failed.",
                status = fetch.StatusCode,
                details = fetch.Error
            });
        }

        var rows = fetch.Rows;
        if (rows.Count == 0)
        {
            return Ok(new { fetched = 0, created = 0, updated = 0, skipped = 0, message = "No fuel purchase rows returned by MOTIV." });
        }

        var orgId = await ResolveOrganizationId();
        var existing = await _db.MotivFuelPurchases.ToListAsync();
        var byExternalId = existing
            .Where(x => !string.IsNullOrWhiteSpace(x.ExternalId))
            .GroupBy(x => x.ExternalId.Trim())
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var created = 0;
        var updated = 0;
        var skipped = 0;

        foreach (var row in rows)
        {
            var externalId = PickString(row, "id", "transaction_id", "uuid");
            if (string.IsNullOrWhiteSpace(externalId))
            {
                skipped++;
                continue;
            }

            var merchant = PickNestedObject(row, "merchant_info");
            var firstOrderItem = PickFirstArrayObject(row, "order_items");

            var txTime = ParseDateTime(PickString(row, "transaction_time", "created_at", "updated_at"));
            var postedAt = ParseDateTime(PickString(row, "posted_at"));
            var amount = PickDecimal(row, "total_amount", "authorized_amount", "total_amount_before_rebate");
            var quantity = PickDecimal(firstOrderItem ?? row, "quantity");

            if (!byExternalId.TryGetValue(externalId, out var target))
            {
                target = new MotivFuelPurchase
                {
                    OrganizationId = orgId == 0 ? null : orgId,
                    ExternalId = externalId.Trim(),
                    TransactionTime = txTime,
                    PostedAt = postedAt,
                    DriverId = PickInt(row, "driver_id"),
                    VehicleId = PickInt(row, "vehicle_id"),
                    CardId = PickString(row, "card_id", "last_four_digits"),
                    MerchantName = PickString(merchant ?? row, "name"),
                    MerchantCity = PickString(merchant ?? row, "city"),
                    MerchantState = PickString(merchant ?? row, "state"),
                    Status = PickString(row, "transaction_status", "status"),
                    Currency = PickString(row, "currency"),
                    Category = PickString(row, "transaction_type", "type"),
                    ProductType = PickString(firstOrderItem ?? row, "product_type"),
                    Quantity = quantity,
                    Amount = amount,
                    RawJson = row.ToString(),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _db.MotivFuelPurchases.Add(target);
                byExternalId[externalId] = target;
                created++;
            }
            else
            {
                target.OrganizationId = orgId == 0 ? target.OrganizationId : orgId;
                target.TransactionTime = txTime ?? target.TransactionTime;
                target.PostedAt = postedAt ?? target.PostedAt;
                target.DriverId = PickInt(row, "driver_id") ?? target.DriverId;
                target.VehicleId = PickInt(row, "vehicle_id") ?? target.VehicleId;
                target.CardId = PickString(row, "card_id", "last_four_digits") ?? target.CardId;
                target.MerchantName = PickString(merchant ?? row, "name") ?? target.MerchantName;
                target.MerchantCity = PickString(merchant ?? row, "city") ?? target.MerchantCity;
                target.MerchantState = PickString(merchant ?? row, "state") ?? target.MerchantState;
                target.Status = PickString(row, "transaction_status", "status") ?? target.Status;
                target.Currency = PickString(row, "currency") ?? target.Currency;
                target.Category = PickString(row, "transaction_type", "type") ?? target.Category;
                target.ProductType = PickString(firstOrderItem ?? row, "product_type") ?? target.ProductType;
                target.Quantity = quantity ?? target.Quantity;
                target.Amount = amount ?? target.Amount;
                target.RawJson = row.ToString();
                target.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        await _db.SaveChangesAsync();

        return Ok(new
        {
            fetched = rows.Count,
            created,
            updated,
            skipped,
            totalFuelPurchases = await _db.MotivFuelPurchases.CountAsync()
        });
    }

    private async Task<IActionResult> ProxyMotivGet(string path, string endpointName, bool includeIncomingQuery = true)
    {
        var result = await FetchMotivPayload(path, endpointName, includeIncomingQuery);
        if (!result.Success)
        {
            return StatusCode(result.StatusCode, new
            {
                error = $"MOTIV {endpointName} request failed.",
                status = result.StatusCode,
                details = result.Error
            });
        }

        return Ok(new
        {
            source = "motiv",
            endpoint = endpointName,
            data = result.Payload
        });
    }

    private async Task<(bool Success, int StatusCode, string? Error, JsonElement Payload)> FetchMotivPayload(string path, string endpointName, bool includeIncomingQuery)
    {
        return await FetchMotivResponse(path, endpointName, HttpMethod.Get, includeIncomingQuery);
    }

    private async Task<(bool Success, int StatusCode, string? Error, JsonElement Payload)> FetchMotivResponse(
        string path,
        string endpointName,
        HttpMethod method,
        bool includeIncomingQuery)
    {
        var apiKey = _config["MOTIV_API_KEY"] ?? Environment.GetEnvironmentVariable("MOTIV_API_KEY");
        var baseUrl = _config["MOTIV_API_BASE_URL"] ?? Environment.GetEnvironmentVariable("MOTIV_API_BASE_URL");

        if (string.IsNullOrWhiteSpace(baseUrl))
            return (false, 400, "MOTIV_API_BASE_URL is not configured.", default);
        if (string.IsNullOrWhiteSpace(apiKey))
            return (false, 400, "MOTIV_API_KEY is not configured.", default);

        var queryString = includeIncomingQuery ? Request.QueryString.Value : null;
        var requestUri = BuildUri(baseUrl, path, queryString);
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);

        using var request = new HttpRequestMessage(method, requestUri);
        request.Headers.TryAddWithoutValidation("x-api-key", apiKey);
        request.Headers.TryAddWithoutValidation("Accept", "application/json");

        try
        {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
            var payload = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("MOTIV {Endpoint} request failed: status={StatusCode}", endpointName, (int)response.StatusCode);
                return (false, (int)response.StatusCode, Truncate(payload, 500), default);
            }

            JsonElement parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<JsonElement>(payload);
            }
            catch
            {
                parsed = JsonSerializer.Deserialize<JsonElement>(JsonSerializer.Serialize(new { raw = payload }));
            }

            return (true, 200, null, parsed);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MOTIV {Endpoint} request exception", endpointName);
            return (false, 502, ex.Message, default);
        }
    }

    private static string BuildUri(string baseUrl, string path, string? queryString)
    {
        var normalizedBase = baseUrl.TrimEnd('/');
        var normalizedPath = path.StartsWith('/') ? path : $"/{path}";
        var qs = string.IsNullOrWhiteSpace(queryString) ? "" : queryString;
        return $"{normalizedBase}{normalizedPath}{qs}";
    }

    private async Task<int> ResolveOrganizationId()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId is int directOrg && directOrg > 0)
            return directOrg;

        var userOrgs = await _currentUserService.GetUserOrganizationIdsAsync();
        var firstUserOrg = userOrgs.FirstOrDefault();
        if (firstUserOrg > 0)
            return firstUserOrg;

        var fallbackOrg = await _db.Organizations.AsNoTracking().Select(o => o.Id).FirstOrDefaultAsync();
        return fallbackOrg;
    }

    private static List<JsonElement> ExtractRows(JsonElement payload)
    {
        if (payload.ValueKind == JsonValueKind.Array)
            return payload.EnumerateArray().Select(x => x.Clone()).ToList();

        if (payload.ValueKind != JsonValueKind.Object)
            return new List<JsonElement>();

        foreach (var key in new[] { "driver_locations", "vehicle_locations", "vehicles", "users", "data", "items", "results", "fuel_purchases", "transactions" })
        {
            if (payload.TryGetProperty(key, out var arr) && arr.ValueKind == JsonValueKind.Array)
                return arr.EnumerateArray().Select(x => x.Clone()).ToList();
        }

        return new List<JsonElement>();
    }

    private static JsonElement? PickNestedObject(JsonElement source, string propertyName)
    {
        if (source.ValueKind != JsonValueKind.Object)
            return null;
        if (source.TryGetProperty(propertyName, out var obj) && obj.ValueKind == JsonValueKind.Object)
            return obj;
        return null;
    }

    private static JsonElement? PickFirstArrayObject(JsonElement source, string propertyName)
    {
        if (source.ValueKind != JsonValueKind.Object) return null;
        if (!source.TryGetProperty(propertyName, out var arr)) return null;
        if (arr.ValueKind != JsonValueKind.Array) return null;
        foreach (var item in arr.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.Object) return item;
        }
        return null;
    }

    private static string BuildName(string? first, string? last, string? fallback)
    {
        var combined = $"{first ?? ""} {last ?? ""}".Trim();
        if (!string.IsNullOrWhiteSpace(combined))
            return combined;
        return (fallback ?? "").Trim();
    }

    private static string MapMotiveStatus(string? sourceStatus)
    {
        var status = (sourceStatus ?? "").Trim().ToLowerInvariant();
        return status switch
        {
            "active" => "available",
            "inactive" => "inactive",
            "disabled" => "inactive",
            _ => string.IsNullOrWhiteSpace(status) ? "available" : status
        };
    }

    private static bool IsDriverLikeUser(JsonElement user)
    {
        var typeValue = (PickString(user, "user_type", "userType", "type", "role") ?? "").Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(typeValue))
            return typeValue == "driver" || typeValue == "drivers";

        if (user.ValueKind == JsonValueKind.Object)
        {
            if (user.TryGetProperty("is_driver", out var isDriverProp) &&
                (isDriverProp.ValueKind == JsonValueKind.True || isDriverProp.ValueKind == JsonValueKind.False))
                return isDriverProp.GetBoolean();

            if (user.TryGetProperty("isDriver", out var isDriverCamel) &&
                (isDriverCamel.ValueKind == JsonValueKind.True || isDriverCamel.ValueKind == JsonValueKind.False))
                return isDriverCamel.GetBoolean();

            if (user.TryGetProperty("roles", out var roles) && roles.ValueKind == JsonValueKind.Array)
            {
                foreach (var role in roles.EnumerateArray())
                {
                    var roleName = role.ValueKind == JsonValueKind.Object
                        ? (PickString(role, "name", "role") ?? "")
                        : role.ToString();
                    var normalizedRole = roleName.Trim().ToLowerInvariant();
                    if (normalizedRole == "driver" || normalizedRole == "drivers")
                        return true;
                }
            }
        }

        return false;
    }

    private static string? PickString(JsonElement src, params string[] keys)
    {
        if (src.ValueKind != JsonValueKind.Object) return null;
        foreach (var key in keys)
        {
            if (!src.TryGetProperty(key, out var val)) continue;
            if (val.ValueKind == JsonValueKind.String)
            {
                var s = val.GetString();
                if (!string.IsNullOrWhiteSpace(s)) return s.Trim();
            }
            else if (val.ValueKind == JsonValueKind.Number || val.ValueKind == JsonValueKind.True || val.ValueKind == JsonValueKind.False)
            {
                return val.ToString();
            }
        }
        return null;
    }

    private static int? PickInt(JsonElement src, params string[] keys)
    {
        if (src.ValueKind != JsonValueKind.Object) return null;
        foreach (var key in keys)
        {
            if (!src.TryGetProperty(key, out var val)) continue;
            if (val.ValueKind == JsonValueKind.Number && val.TryGetInt32(out var n)) return n;
            if (val.ValueKind == JsonValueKind.String && int.TryParse(val.GetString(), out var parsed)) return parsed;
        }
        return null;
    }

    private static decimal? PickDecimal(JsonElement src, params string[] keys)
    {
        if (src.ValueKind != JsonValueKind.Object) return null;
        foreach (var key in keys)
        {
            if (!src.TryGetProperty(key, out var val)) continue;
            if (val.ValueKind == JsonValueKind.Number && val.TryGetDecimal(out var d)) return d;
            if (val.ValueKind == JsonValueKind.String && decimal.TryParse(val.GetString(), out var parsed)) return parsed;
        }
        return null;
    }

    private static DateTime? ParseDateTime(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        if (DateTime.TryParse(input, out var dt)) return dt;
        return null;
    }

    private static string BuildMotivSyncNote(string? currentNotes, string? motiveUserId)
    {
        var marker = string.IsNullOrWhiteSpace(motiveUserId)
            ? "Synced from MOTIV"
            : $"Synced from MOTIV (userId: {motiveUserId})";

        var current = (currentNotes ?? "").Trim();
        if (string.IsNullOrWhiteSpace(current))
            return marker;
        if (current.Contains("Synced from MOTIV", StringComparison.OrdinalIgnoreCase))
            return current;
        return $"{current} | {marker}";
    }

    private static string? ExtractMotivUserIdFromNotes(string? notes)
    {
        if (string.IsNullOrWhiteSpace(notes))
            return null;

        var match = Regex.Match(notes, @"userId:\s*(?<id>[A-Za-z0-9\-_]+)", RegexOptions.IgnoreCase);
        if (!match.Success)
            return null;

        var id = match.Groups["id"].Value?.Trim();
        return string.IsNullOrWhiteSpace(id) ? null : id;
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength) return value;
        return value.Substring(0, maxLength);
    }

    private static bool IsReachable(bool success, int statusCode)
    {
        return success || statusCode == 400 || statusCode == 401 || statusCode == 403 || statusCode == 405;
    }

    private static bool LooksLikeDriverLocations(List<JsonElement> rows)
    {
        if (rows.Count == 0) return false;

        foreach (var row in rows)
        {
            if (row.ValueKind != JsonValueKind.Object) continue;
            if (row.TryGetProperty("current_location", out _)) return true;
            if (row.TryGetProperty("current_vehicle", out _)) return true;
            if (row.TryGetProperty("lat", out _)) return true;
            if (row.TryGetProperty("latitude", out _)) return true;
            if (row.TryGetProperty("located_at", out _)) return true;
        }

        return false;
    }

    private async Task<(bool Success, int StatusCode, string? Error, List<JsonElement> Rows, string SourcePath, int UserRows, int LocationRows, int VehicleRows)> FetchEnrichedDriverRows(string endpointPrefix)
    {
        var driversPath = _config["MOTIV_DRIVERS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_DRIVERS_PATH")
            ?? "/v1/driver_locations";
        var usersPath = _config["MOTIV_USERS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_USERS_PATH")
            ?? "/v1/users?per_page=100&page_no=1";
        var vehiclesPath = _config["MOTIV_VEHICLES_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_VEHICLES_PATH")
            ?? "/v1/vehicles";

        var primary = await FetchAllMotivRows(driversPath, $"{endpointPrefix}:primary");
        if (!primary.Success)
            return (false, primary.StatusCode, primary.Error, new List<JsonElement>(), driversPath, 0, 0, 0);

        var locationRows = primary.Rows;
        var selectedPath = driversPath;

        // If configured path returns user-only rows, force driver_locations for location/vehicle fields.
        if (!LooksLikeDriverLocations(locationRows) &&
            !string.Equals(driversPath, "/v1/driver_locations", StringComparison.OrdinalIgnoreCase))
        {
            var fallback = await FetchAllMotivRows("/v1/driver_locations", $"{endpointPrefix}:driver-locations-fallback");
            if (fallback.Success && LooksLikeDriverLocations(fallback.Rows))
            {
                locationRows = fallback.Rows;
                selectedPath = "/v1/driver_locations";
            }
        }

        var usersFetch = await FetchAllMotivRows(usersPath, $"{endpointPrefix}:users");
        var usersRows = usersFetch.Success ? usersFetch.Rows : new List<JsonElement>();

        var vehiclesFetch = await FetchAllMotivRows(vehiclesPath, $"{endpointPrefix}:vehicles");
        var vehiclesRows = vehiclesFetch.Success ? vehiclesFetch.Rows : new List<JsonElement>();

        var mergedRows = MergeDriverRows(usersRows, locationRows, vehiclesRows);
        if (mergedRows.Count == 0)
            mergedRows = locationRows;

        return (true, 200, null, mergedRows, selectedPath, usersRows.Count, locationRows.Count, vehiclesRows.Count);
    }

    private static List<JsonElement> MergeDriverRows(List<JsonElement> usersRows, List<JsonElement> locationRows, List<JsonElement> vehicleRows)
    {
        var output = new List<JsonElement>();
        var usedLocationIndexes = new HashSet<int>();

        var usersById = usersRows
            .Select(u => (id: PickString(u, "id"), row: u))
            .Where(x => !string.IsNullOrWhiteSpace(x.id))
            .GroupBy(x => x.id!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().row, StringComparer.OrdinalIgnoreCase);

        var usersByEmail = usersRows
            .Select(u => (email: PickString(u, "email"), row: u))
            .Where(x => !string.IsNullOrWhiteSpace(x.email))
            .GroupBy(x => x.email!.Trim().ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First().row);

        var vehiclesById = vehicleRows
            .Select(v => (id: PickString(v, "id"), row: v))
            .Where(x => !string.IsNullOrWhiteSpace(x.id))
            .GroupBy(x => x.id!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().row, StringComparer.OrdinalIgnoreCase);

        var locationByUserId = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var locationByEmail = new Dictionary<string, int>();
        for (var i = 0; i < locationRows.Count; i++)
        {
            var row = locationRows[i];
            var nestedUser = PickNestedObject(row, "user");
            var userId = PickString(nestedUser ?? row, "id", "user_id");
            var email = PickString(nestedUser ?? row, "email");

            if (!string.IsNullOrWhiteSpace(userId) && !locationByUserId.ContainsKey(userId))
                locationByUserId[userId] = i;
            if (!string.IsNullOrWhiteSpace(email))
            {
                var key = email.Trim().ToLowerInvariant();
                if (!locationByEmail.ContainsKey(key))
                    locationByEmail[key] = i;
            }
        }

        var baseRows = usersRows.Count > 0 ? usersRows : locationRows;
        for (var i = 0; i < baseRows.Count; i++)
        {
            var baseRow = baseRows[i];
            var baseUser = PickNestedObject(baseRow, "user") ?? baseRow;
            var userId = PickString(baseUser, "id", "user_id");
            var email = PickString(baseUser, "email");
            var emailKey = string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

            var matchedLocation = default(JsonElement?);
            if (!string.IsNullOrWhiteSpace(userId) && locationByUserId.TryGetValue(userId, out var locationIdxById))
            {
                matchedLocation = locationRows[locationIdxById];
                usedLocationIndexes.Add(locationIdxById);
            }
            else if (emailKey != null && locationByEmail.TryGetValue(emailKey, out var locationIdxByEmail))
            {
                matchedLocation = locationRows[locationIdxByEmail];
                usedLocationIndexes.Add(locationIdxByEmail);
            }
            else if (usersRows.Count == 0 && i < locationRows.Count)
            {
                matchedLocation = locationRows[i];
                usedLocationIndexes.Add(i);
            }

            var locationObject = matchedLocation.HasValue
                ? (PickNestedObject(matchedLocation.Value, "current_location") ?? (LooksLikeLocationRow(matchedLocation.Value) ? matchedLocation.Value : (JsonElement?)null))
                : (LooksLikeLocationRow(baseRow) ? baseRow : (JsonElement?)null);

            var vehicleObject =
                (matchedLocation.HasValue ? PickNestedObject(matchedLocation.Value, "current_vehicle") : null)
                ?? PickNestedObject(baseRow, "current_vehicle")
                ?? PickNestedObject(baseRow, "vehicle");

            var vehicleId = PickString(vehicleObject ?? matchedLocation ?? baseRow, "id", "vehicle_id");
            if (vehicleObject == null && !string.IsNullOrWhiteSpace(vehicleId) && vehiclesById.TryGetValue(vehicleId, out var matchedVehicle))
                vehicleObject = matchedVehicle;

            var userObject = baseUser;
            if (userObject.ValueKind != JsonValueKind.Object && !string.IsNullOrWhiteSpace(userId) && usersById.TryGetValue(userId, out var matchedUserById))
                userObject = matchedUserById;
            if (userObject.ValueKind != JsonValueKind.Object && emailKey != null && usersByEmail.TryGetValue(emailKey, out var matchedUserByEmail))
                userObject = matchedUserByEmail;

            var merged = JsonSerializer.SerializeToElement(new
            {
                user = userObject,
                current_location = locationObject,
                current_vehicle = vehicleObject
            });
            output.Add(merged);
        }

        // Add unmatched location rows so we don't drop drivers that only exist in location feed.
        for (var i = 0; i < locationRows.Count; i++)
        {
            if (usedLocationIndexes.Contains(i)) continue;
            var row = locationRows[i];
            var nestedUser = PickNestedObject(row, "user") ?? row;
            var merged = JsonSerializer.SerializeToElement(new
            {
                user = nestedUser,
                current_location = PickNestedObject(row, "current_location") ?? (LooksLikeLocationRow(row) ? row : (JsonElement?)null),
                current_vehicle = PickNestedObject(row, "current_vehicle")
            });
            output.Add(merged);
        }

        return output;
    }

    private static bool LooksLikeLocationRow(JsonElement row)
    {
        if (row.ValueKind != JsonValueKind.Object) return false;
        return row.TryGetProperty("lat", out _)
            || row.TryGetProperty("latitude", out _)
            || row.TryGetProperty("lon", out _)
            || row.TryGetProperty("lng", out _)
            || row.TryGetProperty("longitude", out _)
            || row.TryGetProperty("located_at", out _)
            || row.TryGetProperty("locatedAt", out _);
    }

    private async Task<(bool Success, int StatusCode, string? Error, List<JsonElement> Rows)> FetchAllMotivRows(
        string basePath,
        string endpointName,
        int perPage = 100,
        int maxPages = 100)
    {
        var allRows = new List<JsonElement>();

        for (var pageNo = 1; pageNo <= maxPages; pageNo++)
        {
            var path = BuildPagedPath(basePath, pageNo, perPage);
            var result = await FetchMotivPayload(path, $"{endpointName}:page:{pageNo}", includeIncomingQuery: false);
            if (!result.Success)
            {
                if (pageNo == 1)
                    return (false, result.StatusCode, result.Error, new List<JsonElement>());
                break;
            }

            var rows = ExtractRows(result.Payload);
            if (rows.Count == 0)
                break;

            allRows.AddRange(rows);

            if (!HasNextPage(result.Payload, pageNo, rows.Count, perPage))
                break;
        }

        return (true, 200, null, allRows);
    }

    private static bool HasNextPage(JsonElement payload, int pageNo, int currentCount, int perPage)
    {
        if (TryGetNestedInt(payload, new[] { "pagination", "total_pages" }, out var totalPages))
            return pageNo < totalPages;

        if (TryGetNestedInt(payload, new[] { "meta", "total_pages" }, out totalPages))
            return pageNo < totalPages;

        if (TryGetNestedInt(payload, new[] { "pagination", "next_page" }, out var nextPage))
            return nextPage > pageNo;

        if (TryGetNestedInt(payload, new[] { "meta", "next_page" }, out nextPage))
            return nextPage > pageNo;

        if (TryGetNestedBool(payload, new[] { "pagination", "has_next_page" }, out var hasNext))
            return hasNext;

        if (TryGetNestedBool(payload, new[] { "meta", "has_next_page" }, out hasNext))
            return hasNext;

        return currentCount >= perPage;
    }

    private static string BuildPagedPath(string basePath, int pageNo, int perPage)
    {
        var withPerPage = UpsertQueryParam(basePath, "per_page", perPage.ToString());
        return UpsertQueryParam(withPerPage, "page_no", pageNo.ToString());
    }

    private static string UpsertQueryParam(string path, string key, string value)
    {
        var keyEscaped = Uri.EscapeDataString(key);
        var valueEscaped = Uri.EscapeDataString(value);
        var marker = $"{keyEscaped}={valueEscaped}";

        var questionIndex = path.IndexOf('?');
        if (questionIndex < 0)
            return $"{path}?{marker}";

        var basePath = path.Substring(0, questionIndex);
        var query = path.Substring(questionIndex + 1);
        var segments = query.Split('&', StringSplitOptions.RemoveEmptyEntries);
        var rewritten = new List<string>();
        var replaced = false;

        foreach (var segment in segments)
        {
            var eq = segment.IndexOf('=');
            var segmentKey = eq >= 0 ? segment.Substring(0, eq) : segment;
            if (string.Equals(Uri.UnescapeDataString(segmentKey), key, StringComparison.OrdinalIgnoreCase))
            {
                if (!replaced)
                {
                    rewritten.Add(marker);
                    replaced = true;
                }
                continue;
            }

            rewritten.Add(segment);
        }

        if (!replaced)
            rewritten.Add(marker);

        return $"{basePath}?{string.Join("&", rewritten)}";
    }

    private static bool TryGetNestedInt(JsonElement payload, string[] keys, out int value)
    {
        value = 0;
        if (TryGetNested(payload, keys, out var element))
        {
            if (element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out var n))
            {
                value = n;
                return true;
            }
            if (element.ValueKind == JsonValueKind.String && int.TryParse(element.GetString(), out n))
            {
                value = n;
                return true;
            }
        }
        return false;
    }

    private static bool TryGetNestedBool(JsonElement payload, string[] keys, out bool value)
    {
        value = false;
        if (TryGetNested(payload, keys, out var element))
        {
            if (element.ValueKind == JsonValueKind.True || element.ValueKind == JsonValueKind.False)
            {
                value = element.GetBoolean();
                return true;
            }
            if (element.ValueKind == JsonValueKind.String && bool.TryParse(element.GetString(), out var b))
            {
                value = b;
                return true;
            }
        }
        return false;
    }

    private static bool TryGetNested(JsonElement payload, string[] keys, out JsonElement value)
    {
        value = payload;
        foreach (var key in keys)
        {
            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(key, out value))
                return false;
        }
        return true;
    }
}

public class MotivProbeMethodRequest
{
    public string? Path { get; set; }
    public string? Method { get; set; }
}

