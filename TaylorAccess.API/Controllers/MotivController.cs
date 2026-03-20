using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

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
        var path = _config["MOTIV_DRIVERS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_DRIVERS_PATH")
            ?? "/v1/driver_locations";
        return await ProxyMotivGet(path, "drivers");
    }

    [HttpGet("vehicles")]
    public async Task<IActionResult> GetVehicles()
    {
        var path = _config["MOTIV_VEHICLES_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_VEHICLES_PATH")
            ?? "/v1/vehicles";
        return await ProxyMotivGet(path, "vehicles");
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var path = _config["MOTIV_USERS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_USERS_PATH")
            ?? "/v1/users?per_page=100&page_no=1";
        return await ProxyMotivGet(path, "users", includeIncomingQuery: false);
    }

    [HttpGet("fuel-purchases")]
    public async Task<IActionResult> GetFuelPurchases()
    {
        var path = _config["MOTIV_FUEL_PURCHASES_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_FUEL_PURCHASES_PATH")
            ?? "/v1/fuel_purchases";
        return await ProxyMotivGet(path, "fuel-purchases");
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
        var reachable = result.Success || result.StatusCode == 401 || result.StatusCode == 403;
        return Ok(new
        {
            source = "motiv",
            path = normalizedPath,
            connected = reachable,
            status = result.StatusCode,
            details = result.Success ? null : result.Error
        });
    }

    [HttpPost("drivers/sync")]
    public async Task<IActionResult> SyncDriversToAccessDb()
    {
        var path = _config["MOTIV_DRIVERS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_DRIVERS_PATH")
            ?? "/v1/driver_locations";

        var fetch = await FetchMotivPayload(path, "drivers", includeIncomingQuery: false);
        if (!fetch.Success)
        {
            return StatusCode(fetch.StatusCode, new
            {
                error = "Unable to sync MOTIV drivers because source fetch failed.",
                status = fetch.StatusCode,
                details = fetch.Error
            });
        }

        var rows = ExtractRows(fetch.Payload);
        if (rows.Count == 0)
        {
            return Ok(new { fetched = 0, created = 0, updated = 0, skipped = 0, message = "No driver rows returned by MOTIV." });
        }

        var orgId = await ResolveOrganizationId();
        if (orgId == 0)
            return BadRequest(new { error = "Cannot sync drivers: no organization is assigned and no default organization exists." });

        var existingDrivers = await _db.Drivers.ToListAsync();
        var byEmail = existingDrivers
            .Where(d => !string.IsNullOrWhiteSpace(d.Email))
            .GroupBy(d => d.Email!.Trim().ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First());
        var byNamePhone = existingDrivers
            .GroupBy(d => $"{(d.Name ?? "").Trim().ToLowerInvariant()}|{(d.Phone ?? "").Trim()}")
            .ToDictionary(g => g.Key, g => g.First());

        var created = 0;
        var updated = 0;
        var skipped = 0;

        foreach (var row in rows)
        {
            var user = PickNestedObject(row, "user") ?? row;
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

            if (target == null)
            {
                target = new Driver
                {
                    OrganizationId = orgId,
                    Name = displayName.Trim(),
                    Email = email,
                    Phone = phone,
                    Status = mappedStatus,
                    IsOnline = location.HasValue,
                    Latitude = lat,
                    Longitude = lon,
                    LastLocationUpdate = locatedAt,
                    TruckNumber = vehicleNumber,
                    TruckYear = vehicleYear,
                    TruckMake = vehicleMake,
                    TruckModel = vehicleModel,
                    TruckVin = vehicleVin,
                    Notes = BuildMotivSyncNote(null, motiveUserId),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    IsDeleted = false
                };
                _db.Drivers.Add(target);
                created++;

                if (!string.IsNullOrWhiteSpace(emailKey))
                    byEmail[emailKey] = target;
                byNamePhone[namePhoneKey] = target;
            }
            else
            {
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
                target.Notes = BuildMotivSyncNote(target.Notes, motiveUserId);
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
            totalDrivers = await _db.Drivers.CountAsync()
        });
    }

    [HttpPost("fuel-purchases/sync")]
    public async Task<IActionResult> SyncFuelPurchasesToAccessDb()
    {
        var path = _config["MOTIV_FUEL_PURCHASES_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_FUEL_PURCHASES_PATH")
            ?? "/v1/fuel_purchases";

        var fetch = await FetchMotivPayload(path, "fuel-purchases", includeIncomingQuery: false);
        if (!fetch.Success)
        {
            return StatusCode(fetch.StatusCode, new
            {
                error = "Unable to sync MOTIV fuel purchases because source fetch failed.",
                status = fetch.StatusCode,
                details = fetch.Error
            });
        }

        var rows = ExtractRows(fetch.Payload);
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

        using var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
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

        foreach (var key in new[] { "users", "data", "items", "results", "fuel_purchases", "transactions" })
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

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength) return value;
        return value.Substring(0, maxLength);
    }
}

