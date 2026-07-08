using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;
using System.Text.RegularExpressions;
using Microsoft.Extensions.DependencyInjection;

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
    private readonly IServiceScopeFactory _scopeFactory;

    public MotivController(
        IConfiguration config,
        IHttpClientFactory httpClientFactory,
        ILogger<MotivController> logger,
        TaylorAccessDbContext db,
        CurrentUserService currentUserService,
        IServiceScopeFactory scopeFactory)
    {
        _config = config;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _db = db;
        _currentUserService = currentUserService;
        _scopeFactory = scopeFactory;
    }

    [HttpGet("config")]
    public async Task<IActionResult> GetConfig()
    {
        var creds = await ResolveMotivCredentials();

        return Ok(new
        {
            headerName = "x-api-key",
            hasApiKey = !string.IsNullOrWhiteSpace(creds.ApiKey),
            hasBaseUrl = !string.IsNullOrWhiteSpace(creds.BaseUrl),
            organizationId = creds.OrganizationId,
            usingOrgOverride = creds.UsingOrgOverride
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

        JsonElement? sampleDriver = enriched.Rows.Count > 0 ? enriched.Rows[0] : null;
        var rowsWithCoords = enriched.Rows.Count(r =>
        {
            var normalizedLocation = NormalizeLocationElement(
                PickNestedObject(r, "current_location")
                ?? PickNestedObject(r, "location")
                ?? r
            );
            var (lat, lon) = TryExtractLatLon(normalizedLocation);
            return lat.HasValue && lon.HasValue;
        });

        _logger.LogInformation(
            "MOTIV drivers merged rows={Rows} rowsWithCoords={RowsWithCoords} sourcePath={SourcePath} userRows={UserRows} locationRows={LocationRows} vehicleRows={VehicleRows}",
            enriched.Rows.Count,
            rowsWithCoords,
            enriched.SourcePath,
            enriched.UserRows,
            enriched.LocationRows,
            enriched.VehicleRows
        );

        AppendDebugLog(
            runId: "run-activity-location",
            hypothesisId: "H1",
            location: "MotivController.GetDrivers",
            message: "GetDrivers enriched payload summary",
            data: new
            {
                enrichedRows = enriched.Rows.Count,
                userRows = enriched.UserRows,
                locationRows = enriched.LocationRows,
                vehicleRows = enriched.VehicleRows,
                sourcePath = enriched.SourcePath,
                sampleTopKeys = GetJsonKeys(sampleDriver, 20),
                sampleUserKeys = sampleDriver.HasValue ? GetJsonKeys(PickNestedObject(sampleDriver.Value, "user"), 20) : new List<string>(),
                sampleCurrentLocationKeys = sampleDriver.HasValue ? GetJsonKeys(PickNestedObject(sampleDriver.Value, "current_location"), 20) : new List<string>()
            });

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

    [HttpGet("vehicle-locations")]
    public async Task<IActionResult> GetVehicleLocations([FromQuery] string? date = null)
    {
        var dateUsed = DateTime.UtcNow.ToString("yyyy-MM-dd");
        if (!string.IsNullOrWhiteSpace(date) && DateTime.TryParse(date, out var parsedDate))
            dateUsed = parsedDate.ToString("yyyy-MM-dd");

        var candidatePaths = new[]
        {
            _config["MOTIV_VEHICLE_LOCATIONS_PATH"] ?? Environment.GetEnvironmentVariable("MOTIV_VEHICLE_LOCATIONS_PATH") ?? "/v1/vehicle_locations",
            "/v2/vehicle_locations",
            "/v3/vehicle_locations",
            "/v1/freight_visibility/vehicle_locations",
            "/v1/driver_locations",
            "/v1/asset_locations",
            "/v1/dispatch_locations"
        };

        var attempted = new List<object>();
        foreach (var path in candidatePaths
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var fetch = await FetchAllMotivRows(path, $"vehicle-locations:{path}");
            attempted.Add(new { path, status = fetch.StatusCode, rows = fetch.Rows.Count, success = fetch.Success });

            if (fetch.Success && fetch.Rows.Count > 0)
            {
                JsonElement? sampleRow = fetch.Rows.Count > 0 ? fetch.Rows[0] : null;
                AppendDebugLog(
                    runId: "run-activity-location",
                    hypothesisId: "H2",
                    location: "MotivController.GetVehicleLocations",
                    message: "Vehicle locations payload summary",
                    data: new
                    {
                        path,
                        rows = fetch.Rows.Count,
                        sampleTopKeys = GetJsonKeys(sampleRow, 20),
                        sampleVehicleKeys = sampleRow.HasValue ? GetJsonKeys(PickNestedObject(sampleRow.Value, "vehicle") ?? PickNestedObject(sampleRow.Value, "current_vehicle"), 20) : new List<string>(),
                        sampleCurrentLocationKeys = sampleRow.HasValue ? GetJsonKeys(PickNestedObject(sampleRow.Value, "current_location"), 20) : new List<string>()
                    });

                return Ok(new
                {
                    source = "motiv",
                    endpoint = "vehicle-locations",
                    path,
                    dateUsed,
                    rows = fetch.Rows.Count,
                    data = JsonSerializer.SerializeToElement(fetch.Rows),
                    attempted
                });
            }
        }

        AppendDebugLog(
            runId: "run-activity-location",
            hypothesisId: "H2",
            location: "MotivController.GetVehicleLocations",
            message: "Vehicle locations empty after path attempts",
            data: new
            {
                attempted = attempted.Count,
                dateInput = date,
                dateUsed
            });

        var byIdFallback = await FetchVehicleLocationsByVehicleIds(dateUsed);
        attempted.Add(new
        {
            path = "vehicle-location-by-id-fallback",
            status = byIdFallback.StatusCode,
            rows = byIdFallback.Rows.Count,
            success = byIdFallback.Success
        });
        if (byIdFallback.Success && byIdFallback.Rows.Count > 0)
        {
            JsonElement? sampleRow = byIdFallback.Rows.Count > 0 ? byIdFallback.Rows[0] : null;
            AppendDebugLog(
                runId: "run-activity-location",
                hypothesisId: "H2",
                location: "MotivController.GetVehicleLocations",
                message: "Vehicle locations by-id fallback summary",
                data: new
                {
                    rows = byIdFallback.Rows.Count,
                    sampleTopKeys = GetJsonKeys(sampleRow, 20),
                    sampleVehicleKeys = sampleRow.HasValue ? GetJsonKeys(PickNestedObject(sampleRow.Value, "vehicle") ?? PickNestedObject(sampleRow.Value, "current_vehicle"), 20) : new List<string>(),
                    sampleCurrentLocationKeys = sampleRow.HasValue ? GetJsonKeys(PickNestedObject(sampleRow.Value, "current_location"), 20) : new List<string>()
                });

            return Ok(new
            {
                source = "motiv",
                endpoint = "vehicle-locations",
                path = "vehicle-location-by-id-fallback",
                dateUsed,
                rows = byIdFallback.Rows.Count,
                data = JsonSerializer.SerializeToElement(byIdFallback.Rows),
                attempted
            });
        }

        return Ok(new
        {
            source = "motiv",
            endpoint = "vehicle-locations",
            dateUsed,
            rows = 0,
            data = JsonSerializer.SerializeToElement(new List<JsonElement>()),
            attempted
        });
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var configuredPath = _config["MOTIV_USERS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_USERS_PATH");

        var candidatePaths = new[]
        {
            configuredPath,
            "/v1/users?per_page=100&page_no=1",
            "/v1/users"
        };

        (bool Success, int StatusCode, string? Error, List<JsonElement> Rows)? lastFailure = null;
        foreach (var path in candidatePaths
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var fetch = await FetchAllMotivRows(path, $"users:{path}");
            if (!fetch.Success)
            {
                lastFailure = fetch;
                continue;
            }

            return Ok(new
            {
                source = "motiv",
                endpoint = "users",
                path,
                rows = fetch.Rows.Count,
                data = JsonSerializer.SerializeToElement(fetch.Rows)
            });
        }

        if (lastFailure.HasValue)
        {
            var fail = lastFailure.Value;
            return StatusCode(fail.StatusCode, new
            {
                error = "MOTIV users request failed.",
                status = fail.StatusCode,
                details = fail.Error
            });
        }

        return StatusCode(500, new { error = "MOTIV users request failed: no valid users path configured." });
    }

    [HttpGet("safety-events")]
    public async Task<IActionResult> GetSafetyEvents([FromQuery] int days = 30, [FromQuery] int limit = 2000)
    {
        var safeDays = Math.Clamp(days, 1, 365);
        var safeLimit = Math.Clamp(limit, 1, 10000);
        var endUtc = DateTime.UtcNow;
        var startUtc = endUtc.AddDays(-safeDays);
        var startDate = startUtc.ToString("yyyy-MM-dd");
        var endDate = endUtc.ToString("yyyy-MM-dd");
        var startIso = startUtc.ToString("O");
        var endIso = endUtc.ToString("O");

        var configuredPath = _config["MOTIV_SAFETY_EVENTS_PATH"]
            ?? _config["MOTIV_DRIVER_PERFORMANCE_EVENTS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_SAFETY_EVENTS_PATH")
            ?? Environment.GetEnvironmentVariable("MOTIV_DRIVER_PERFORMANCE_EVENTS_PATH");

        var basePaths = new[]
        {
            configuredPath,
            "/v2/driver_performance_events",
            "/v1/driver_performance_events"
        };

        var candidatePaths = new List<string>();
        foreach (var root in basePaths
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            candidatePaths.Add(root);
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "start_date", startDate), "end_date", endDate));
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "from_date", startDate), "to_date", endDate));
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "start_time", startIso), "end_time", endIso));
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "from", startIso), "to", endIso));
        }

        (bool Success, int StatusCode, string? Error, List<JsonElement> Rows)? lastFailure = null;
        var attempted = new List<object>();
        foreach (var path in candidatePaths
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var fetch = await FetchAllMotivRows(path, $"safety-events:{path}", perPage: 100, maxPages: 60);
            attempted.Add(new { path, status = fetch.StatusCode, rows = fetch.Rows.Count, success = fetch.Success });
            if (!fetch.Success)
            {
                lastFailure = fetch;
                continue;
            }

            var scopedRows = fetch.Rows.Take(safeLimit).ToList();
            var upsert = await UpsertSafetyEventRows(scopedRows);
            return Ok(new
            {
                source = "motiv",
                endpoint = "safety-events",
                path,
                days = safeDays,
                startDate,
                endDate,
                rows = scopedRows.Count,
                totalFetched = fetch.Rows.Count,
                persisted = new
                {
                    created = upsert.Created,
                    updated = upsert.Updated,
                    skipped = upsert.Skipped
                },
                attempted,
                data = JsonSerializer.SerializeToElement(scopedRows)
            });
        }

        if (lastFailure.HasValue)
        {
            var fail = lastFailure.Value;
            return StatusCode(fail.StatusCode, new
            {
                error = "MOTIV safety-events request failed.",
                status = fail.StatusCode,
                details = fail.Error,
                attempted
            });
        }

        return StatusCode(500, new { error = "MOTIV safety-events request failed: no valid safety events path configured.", attempted });
    }

    /// <summary>
    /// Returns cached Motive driver-analysis telematics for a date range (DB snapshot).
    /// Use POST driver-analysis/refresh to pull fresh data from Motive.
    /// </summary>
    [HttpGet("driver-analysis")]
    public async Task<IActionResult> GetCachedDriverAnalysis([FromQuery] string? startDate = null, [FromQuery] string? endDate = null)
    {
        var orgId = await ResolveOrganizationId();
        var (start, end, startIso, endIso) = MotiveDriverAnalysisHelpers.ParseRange(startDate, endDate);

        var cache = await _db.MotivDriverAnalysisCaches.AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.OrganizationId == (orgId > 0 ? orgId : null)
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
                data = Array.Empty<object>()
            });
        }

        var data = MotiveDriverAnalysisHelpers.DeserializePayload(cache.PayloadJson);
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
            data
        });
    }

    /// <summary>
    /// Pulls fresh Motive telematics for a date range, saves to DB, and returns the snapshot.
    /// </summary>
    [HttpPost("driver-analysis/refresh")]
    public async Task<IActionResult> RefreshDriverAnalysis([FromQuery] string? startDate = null, [FromQuery] string? endDate = null)
    {
        var orgId = await ResolveOrganizationId();
        var (start, end, startIso, endIso) = MotiveDriverAnalysisHelpers.ParseRange(startDate, endDate);
        var orgKey = orgId > 0 ? orgId : (int?)null;
        var refreshKey = MotiveDriverAnalysisHelpers.BuildRefreshKey(orgKey, start, end);

        if (MotiveDriverAnalysisRefreshTracker.IsActive(refreshKey))
        {
            return Accepted(new
            {
                status = "in_progress",
                endpoint = "driver-analysis",
                startDate = startIso,
                endDate = endIso,
                message = "A Motive refresh is already running for this date range."
            });
        }

        if (!MotiveDriverAnalysisRefreshTracker.TryStart(refreshKey))
        {
            return Accepted(new
            {
                status = "in_progress",
                endpoint = "driver-analysis",
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
                _logger.LogError(ex, "Background Motive driver-analysis refresh failed for {Start} to {End}", startIso, endIso);
            }
            finally
            {
                MotiveDriverAnalysisRefreshTracker.Complete(refreshKey);
            }
        });

        return Accepted(new
        {
            status = "started",
            endpoint = "driver-analysis",
            startDate = startIso,
            endDate = endIso,
            message = "Motive refresh started. Cached data will update when complete."
        });
    }

    internal async Task ExecuteDriverAnalysisRefreshAsync(int? organizationId, DateTime start, DateTime end)
    {
        var live = await BuildLiveDriverAnalysisAsync(start, end);
        await UpsertDriverAnalysisCacheAsync(organizationId, start, end, live.Connected, live.Data);
    }

    private async Task<(bool Connected, List<object> Data, List<object> Attempted)> BuildLiveDriverAnalysisAsync(DateTime start, DateTime end)
    {
        var startIso = start.ToString("yyyy-MM-dd");
        var endIso = end.ToString("yyyy-MM-dd");
        var accumulators = new Dictionary<string, MotiveDriverAnalysisAccumulator>(StringComparer.OrdinalIgnoreCase);
        var attempted = new List<object>();
        var anyFetchSuccess = false;

        async Task MergeFetch(string label, string basePath)
        {
            var paths = BuildDateRangePaths(basePath, start, end);
            foreach (var path in paths)
            {
                var fetch = await FetchAllMotivRows(path, $"driver-analysis:{label}:{path}", perPage: 100, maxPages: 80);
                attempted.Add(new { label, path, status = fetch.StatusCode, rows = fetch.Rows.Count, success = fetch.Success });
                if (!fetch.Success || fetch.Rows.Count == 0)
                    continue;

                anyFetchSuccess = true;

                foreach (var row in fetch.Rows)
                {
                    switch (label)
                    {
                        case "scorecard":
                            MergeScorecardAnalysisRow(accumulators, row);
                            break;
                        case "utilization":
                            MergeUtilizationAnalysisRow(accumulators, row);
                            break;
                        case "hos":
                            MergeHosViolationAnalysisRow(accumulators, row);
                            break;
                        case "safety":
                            MergeSafetyAnalysisRow(accumulators, row);
                            break;
                        case "inspection":
                            MergeInspectionAnalysisRow(accumulators, row);
                            break;
                    }
                }
            }
        }

        var motiveIdToName = await BuildMotiveDriverIdNameMap("driver-analysis:users");

        await MergeFetch("scorecard", "/v1/scorecard_summary");
        await MergeFetch("scorecard", "/v2/scorecard_summary");
        await MergeFetch("utilization", "/v2/driver_utilization");
        await MergeFetch("utilization", "/v1/driver_utilization");
        await MergeFetch("hos", "/v1/hos_violations");
        await MergeFetch("safety", "/v2/driver_performance_events");
        await MergeFetch("safety", "/v1/driver_performance_events");
        await MergeFetch("inspection", "/v2/inspection_reports");
        await MergeFetch("inspection", "/v1/inspection_reports");

        if (endIso == DateTime.UtcNow.ToString("yyyy-MM-dd"))
        {
            var live = await FetchEnrichedDriverRows("driver-analysis:live-drivers");
            attempted.Add(new { label = "live-drivers", success = live.Success, rows = live.Rows.Count });
            if (live.Success)
            {
                foreach (var row in live.Rows)
                    MergeLiveDriverAnalysisRow(accumulators, row);
            }
        }

        ResolveDriverAnalysisNames(accumulators.Values, motiveIdToName);
        ConsolidateDriverAnalysisAccumulators(accumulators);
        FinalizeDriverAnalysisMetrics(accumulators.Values);

        var data = accumulators.Values
            .OrderBy(x => x.DriverName, StringComparer.OrdinalIgnoreCase)
            .Select(x => (object)new
            {
                driverId = x.MotiveDriverId,
                driverName = x.DriverName,
                motiveOnline = x.MotiveOnline,
                safetyScore = x.SafetyScore,
                csaScore = x.CsaScore,
                crashCount = x.CrashCount,
                crashRate = x.CrashRate,
                violationCount = x.ViolationCount,
                violationRate = x.ViolationRate,
                mpg = x.Mpg,
                idlePercent = x.IdlePercent,
                harshEvents = x.HarshEvents,
                harshEventsPer1kMi = x.HarshEventsPer1kMi,
                totalMiles = x.TotalMiles,
                hosViolations = x.HosViolations,
                inspectionPassPercent = x.InspectionPassPercent,
                hardAccel = x.HardAccel,
                hardBrake = x.HardBrake,
                hardCorner = x.HardCorner,
            })
            .ToList();

        var connected = data.Count > 0 || anyFetchSuccess;
        return (connected, data, attempted);
    }

    private async Task<DateTime> UpsertDriverAnalysisCacheAsync(
        int? organizationId,
        DateTime start,
        DateTime end,
        bool connected,
        List<object> data)
    {
        var now = DateTime.UtcNow;
        var payloadJson = JsonSerializer.Serialize(data);
        var existing = await _db.MotivDriverAnalysisCaches
            .FirstOrDefaultAsync(x =>
                x.OrganizationId == organizationId
                && x.StartDate == start
                && x.EndDate == end);

        if (existing == null)
        {
            existing = new MotivDriverAnalysisCache
            {
                OrganizationId = organizationId,
                StartDate = start,
                EndDate = end,
                Connected = connected,
                DriverCount = data.Count,
                PayloadJson = payloadJson,
                RefreshedAt = now,
                CreatedAt = now,
                UpdatedAt = now
            };
            _db.MotivDriverAnalysisCaches.Add(existing);
        }
        else
        {
            existing.Connected = connected;
            existing.DriverCount = data.Count;
            existing.PayloadJson = payloadJson;
            existing.RefreshedAt = now;
            existing.UpdatedAt = now;
        }

        await _db.SaveChangesAsync();
        return existing.RefreshedAt;
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

        var orgId = await ResolveOrganizationId();
        var dbQuery = _db.MotivFuelPurchases.AsNoTracking();
        if (orgId > 0)
            dbQuery = dbQuery.Where(x => x.OrganizationId == orgId || x.OrganizationId == null);

        var dbRows = await dbQuery
            .OrderByDescending(x => x.TransactionTime ?? x.PostedAt ?? x.UpdatedAt)
            .Take(10000)
            .ToListAsync();

        var mergedRows = MergeFuelPurchaseRows(fetch.Rows, dbRows);

        return Ok(new
        {
            source = dbRows.Count > 0 ? "motiv+access-db" : "motiv",
            endpoint = "fuel-purchases",
            rows = mergedRows.Count,
            liveRows = fetch.Rows.Count,
            dbRows = dbRows.Count,
            data = JsonSerializer.SerializeToElement(mergedRows)
        });
    }

    [HttpGet("fuel-cards")]
    public async Task<IActionResult> GetFuelCards()
    {
        var configuredPath = _config["MOTIV_FUEL_CARDS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_FUEL_CARDS_PATH");

        var candidatePaths = new[]
        {
            configuredPath,
            "/motive_card/v1/cards",
            "/motive_card/v2/cards",
            "/v1/fuel_cards",
            "/v1/cards"
        };

        (bool Success, int StatusCode, string? Error, List<JsonElement> Rows)? lastFailure = null;
        foreach (var path in candidatePaths
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var fetch = await FetchAllMotivRows(path, $"fuel-cards:{path}");
            if (!fetch.Success)
            {
                lastFailure = fetch;
                continue;
            }

            return Ok(new
            {
                source = "motiv",
                endpoint = "fuel-cards",
                path,
                rows = fetch.Rows.Count,
                data = JsonSerializer.SerializeToElement(fetch.Rows)
            });
        }

        if (lastFailure.HasValue)
        {
            var fail = lastFailure.Value;
            return StatusCode(fail.StatusCode, new
            {
                error = "MOTIV fuel-cards request failed.",
                status = fail.StatusCode,
                details = fail.Error
            });
        }

        return StatusCode(500, new { error = "MOTIV fuel-cards request failed: no valid cards path configured." });
    }

    [HttpGet("card-transactions")]
    public async Task<IActionResult> GetCardTransactions()
    {
        var configuredPath = _config["MOTIV_CARD_TRANSACTIONS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_CARD_TRANSACTIONS_PATH");

        var candidatePaths = new[]
        {
            configuredPath,
            "/motive_card/v2/transactions",
            "/motive_card/v1/transactions",
            "/v1/fuel_purchases"
        };

        (bool Success, int StatusCode, string? Error, List<JsonElement> Rows)? lastFailure = null;
        foreach (var path in candidatePaths
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var fetch = await FetchAllMotivRows(path, $"card-transactions:{path}");
            if (!fetch.Success)
            {
                lastFailure = fetch;
                continue;
            }

            return Ok(new
            {
                source = "motiv",
                endpoint = "card-transactions",
                path,
                rows = fetch.Rows.Count,
                data = JsonSerializer.SerializeToElement(fetch.Rows)
            });
        }

        if (lastFailure.HasValue)
        {
            var fail = lastFailure.Value;
            return StatusCode(fail.StatusCode, new
            {
                error = "MOTIV card-transactions request failed.",
                status = fail.StatusCode,
                details = fail.Error
            });
        }

        return StatusCode(500, new { error = "MOTIV card-transactions request failed: no valid transactions path configured." });
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

        var connected = IsReachable(result.Success, result.StatusCode);
        var fallbackStatus = 0;
        string? fallbackDetails = null;

        if (!connected && method == "OPTIONS")
        {
            // Some MOTIV paths reject OPTIONS at edge/proxy level even when the endpoint is reachable.
            // Fall back to a GET reachability probe to avoid false "Not Connected" for write capability checks.
            var fallback = await FetchMotivResponse(
                normalizedPath,
                $"probe-method-fallback:GET:{normalizedPath}",
                HttpMethod.Get,
                includeIncomingQuery: false);

            connected = IsReachable(fallback.Success, fallback.StatusCode);
            fallbackStatus = fallback.StatusCode;
            fallbackDetails = fallback.Success ? null : fallback.Error;
        }

        return Ok(new
        {
            source = "motiv",
            path = normalizedPath,
            method,
            connected,
            status = result.StatusCode,
            details = result.Success ? null : result.Error,
            fallbackStatus = fallbackStatus > 0 ? fallbackStatus : (int?)null,
            fallbackDetails
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
            // DriverType is HR-managed (owner_operator, company, lease, team). Never set it from MOTIV sync.
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

        var upsert = await UpsertFuelPurchaseRows(rows);

        return Ok(new
        {
            fetched = rows.Count,
            created = upsert.Created,
            updated = upsert.Updated,
            skipped = upsert.Skipped,
            totalFuelPurchases = await _db.MotivFuelPurchases.CountAsync()
        });
    }

    [HttpPost("fuel-purchases/backfill")]
    public async Task<IActionResult> BackfillFuelPurchases([FromQuery] int days = 730)
    {
        var windowDays = Math.Clamp(days <= 0 ? 730 : days, 30, 1825);
        var endUtc = DateTime.UtcNow;
        var startUtc = endUtc.AddDays(-windowDays);

        var basePath = _config["MOTIV_FUEL_PURCHASES_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_FUEL_PURCHASES_PATH")
            ?? "/v1/fuel_purchases";

        var historicalRows = await FetchHistoricalFuelRows(basePath, startUtc, endUtc);
        if (historicalRows.Count == 0)
        {
            return Ok(new
            {
                fetched = 0,
                created = 0,
                updated = 0,
                skipped = 0,
                days = windowDays,
                message = "No historical fuel rows were returned for backfill."
            });
        }

        var upsert = await UpsertFuelPurchaseRows(historicalRows);

        return Ok(new
        {
            fetched = historicalRows.Count,
            created = upsert.Created,
            updated = upsert.Updated,
            skipped = upsert.Skipped,
            days = windowDays,
            totalFuelPurchases = await _db.MotivFuelPurchases.CountAsync()
        });
    }

    [HttpGet("activity-logs")]
    public async Task<IActionResult> GetActivityLogs(
        [FromQuery] int limit = 1000,
        [FromQuery] string? search = null,
        [FromQuery] string? kind = null,
        [FromQuery] string? scope = null,
        [FromQuery] string? driverName = null,
        [FromQuery] string? fromDate = null,
        [FromQuery] string? toDate = null)
    {
        var orgId = await ResolveOrganizationId();
        var cappedLimit = Math.Clamp(limit <= 0 ? 1000 : limit, 1, 5000);

        var normalizedKind = NormalizeActivityKind(kind);
        var normalizedScope = (scope ?? "").Trim().ToLowerInvariant();
        var normalizedSearch = (search ?? "").Trim();
        var normalizedDriver = (driverName ?? "").Trim();
        var fromUtc = ParseActivityLogDateBoundary(fromDate, endOfDay: false);
        var toUtc = ParseActivityLogDateBoundary(toDate, endOfDay: true);

        var query = _db.MotivActivityLogs.AsNoTracking();
        if (orgId > 0)
            query = query.Where(x => x.OrganizationId == orgId);

        if (!string.IsNullOrWhiteSpace(normalizedKind))
            query = query.Where(x => x.Kind == normalizedKind);

        if (fromUtc.HasValue)
            query = query.Where(x => x.EventAt >= fromUtc.Value);

        if (toUtc.HasValue)
            query = query.Where(x => x.EventAt <= toUtc.Value);

        if (!string.IsNullOrWhiteSpace(normalizedDriver))
            query = query.Where(x => x.DriverName != null && EF.Functions.ILike(x.DriverName, $"%{normalizedDriver}%"));

        if (normalizedScope == "driver")
            query = query.Where(x => x.DriverName != null && x.DriverName != "");
        else if (normalizedScope == "system")
            query = query.Where(x => x.DriverName == null || x.DriverName == "");

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            query = query.Where(x =>
                EF.Functions.ILike(x.Title, $"%{normalizedSearch}%")
                || EF.Functions.ILike(x.Details, $"%{normalizedSearch}%")
                || (x.DriverName != null && EF.Functions.ILike(x.DriverName, $"%{normalizedSearch}%")));
        }

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
                previousLocation = !string.IsNullOrWhiteSpace(x.PreviousLocation) ? x.PreviousLocation : ExtractPreviousLocationFromDetails(x.Details),
                currentLocation = !string.IsNullOrWhiteSpace(x.CurrentLocation) ? x.CurrentLocation : ExtractCurrentLocationFromDetails(x.Details),
                timestamp = x.EventAt
            })
            .ToListAsync();

        return Ok(new
        {
            rows,
            count = rows.Count,
            limit = cappedLimit
        });
    }

    [HttpPost("activity-logs")]
    public async Task<IActionResult> CreateActivityLog([FromBody] MotivActivityLogRequest? request)
    {
        if (request == null)
            return BadRequest(new { error = "Request body is required." });

        var title = (request.Title ?? "").Trim();
        if (string.IsNullOrWhiteSpace(title))
            return BadRequest(new { error = "Title is required." });

        var orgId = await ResolveOrganizationId();
        var previousLocation = NormalizeLocationForStorage(request.PreviousLocation);
        var currentLocation = NormalizeLocationForStorage(request.CurrentLocation);
        var entry = new MotivActivityLog
        {
            OrganizationId = orgId == 0 ? null : orgId,
            Kind = NormalizeActivityKind(request.Kind) ?? "info",
            Title = Truncate(title, 200),
            DriverName = TruncateNullable(request.DriverName, 200),
            Details = Truncate((request.Details ?? "").Trim(), 2000),
            PreviousLocation = previousLocation,
            CurrentLocation = currentLocation,
            EventAt = request.Timestamp?.ToUniversalTime() ?? DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };

        _db.MotivActivityLogs.Add(entry);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            id = entry.Id,
            kind = entry.Kind,
            title = entry.Title,
            details = entry.Details,
            driverName = entry.DriverName,
            previousLocation = entry.PreviousLocation,
            currentLocation = entry.CurrentLocation,
            timestamp = entry.EventAt
        });
    }

    [HttpPost("activity-logs/driver-snapshots")]
    public async Task<IActionResult> IngestDriverSnapshotActivity([FromBody] MotivDriverSnapshotBatchRequest? request)
    {
        var rows = request?.Rows ?? new List<MotivDriverSnapshotActivityRequest>();
        if (rows.Count == 0)
            return Ok(new { created = 0, skipped = 0, message = "No driver snapshot rows provided." });

        var orgId = await ResolveOrganizationId();
        var nowUtc = DateTime.UtcNow;
        var eventAt = request?.CapturedAt?.ToUniversalTime() ?? nowUtc;
        var dedupeWindowStart = nowUtc.AddHours(-6);

        var recent = await _db.MotivActivityLogs.AsNoTracking()
            .Where(x =>
                (orgId == 0 || x.OrganizationId == orgId)
                && x.EventAt >= dedupeWindowStart
                && x.Title.StartsWith("Driver update:"))
            .Select(x => new { x.DriverName, x.Details, x.EventAt })
            .ToListAsync();

        var latestDriverDetails = await _db.MotivActivityLogs.AsNoTracking()
            .Where(x =>
                (orgId == 0 || x.OrganizationId == orgId)
                && x.DriverName != null
                && x.DriverName != ""
                && x.Title.StartsWith("Driver update:"))
            .OrderByDescending(x => x.EventAt)
            .ThenByDescending(x => x.Id)
            .Select(x => new { x.DriverName, x.Details, x.CurrentLocation })
            .ToListAsync();

        var previousLocationByDriver = latestDriverDetails
            .GroupBy(x => (x.DriverName ?? "").Trim(), StringComparer.OrdinalIgnoreCase)
            .Where(g => !string.IsNullOrWhiteSpace(g.Key))
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var first = g.First();
                    return !string.IsNullOrWhiteSpace(first.CurrentLocation)
                        ? first.CurrentLocation!
                        : ExtractCurrentLocationFromDetails(first.Details);
                },
                StringComparer.OrdinalIgnoreCase);

        var created = 0;
        var skipped = 0;
        foreach (var row in rows)
        {
            var name = (row.DriverName ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                skipped++;
                continue;
            }

            var currentLocation = string.IsNullOrWhiteSpace(row.Location) ? "N/A" : row.Location.Trim();
            var previousLocation = previousLocationByDriver.TryGetValue(name, out var prior)
                ? prior
                : "N/A";

            var details = BuildDriverSnapshotDetails(
                string.IsNullOrWhiteSpace(row.Status) ? "unknown" : row.Status.Trim(),
                string.IsNullOrWhiteSpace(row.Vehicle) ? "N/A" : row.Vehicle.Trim(),
                previousLocation,
                currentLocation);
            var hasRecentDuplicate = recent.Any(x =>
                string.Equals((x.DriverName ?? "").Trim(), name, StringComparison.OrdinalIgnoreCase)
                && string.Equals((x.Details ?? "").Trim(), details, StringComparison.OrdinalIgnoreCase)
                && Math.Abs((x.EventAt - eventAt).TotalMinutes) <= 15);

            if (hasRecentDuplicate)
            {
                skipped++;
                continue;
            }

            var entry = new MotivActivityLog
            {
                OrganizationId = orgId == 0 ? null : orgId,
                Kind = "info",
                Title = Truncate($"Driver update: {name}", 200),
                DriverName = Truncate(name, 200),
                Details = Truncate(details, 2000),
                PreviousLocation = NormalizeLocationForStorage(previousLocation),
                CurrentLocation = NormalizeLocationForStorage(currentLocation),
                EventAt = eventAt,
                CreatedAt = nowUtc
            };
            _db.MotivActivityLogs.Add(entry);
            recent.Add(new { DriverName = (string?)entry.DriverName, Details = entry.Details, EventAt = entry.EventAt });
            previousLocationByDriver[name] = currentLocation;
            created++;
        }

        if (created > 0)
            await _db.SaveChangesAsync();

        return Ok(new { created, skipped });
    }

    [HttpPost("activity-logs/backfill")]
    public async Task<IActionResult> BackfillActivityLogs([FromQuery] int days = 365, [FromQuery] bool force = false)
    {
        var orgId = await ResolveOrganizationId();
        var windowDays = Math.Clamp(days <= 0 ? 365 : days, 30, 1825);
        var windowStart = DateTime.UtcNow.AddDays(-windowDays);

        var existingCountQuery = _db.MotivActivityLogs.AsNoTracking();
        if (orgId > 0)
            existingCountQuery = existingCountQuery.Where(x => x.OrganizationId == orgId);
        var existingCount = await existingCountQuery.CountAsync();
        if (existingCount > 0 && !force)
        {
            return Ok(new
            {
                created = 0,
                skipped = 0,
                existingCount,
                alreadyBackfilled = true,
                message = "Activity logs already exist. Use force=true to rerun backfill."
            });
        }

        var driversQuery = _db.Drivers.AsNoTracking().Where(d => !d.IsDeleted);
        if (orgId > 0)
            driversQuery = driversQuery.Where(d => d.OrganizationId == orgId);
        var drivers = await driversQuery.ToListAsync();
        if (drivers.Count == 0)
            return Ok(new { created = 0, skipped = 0, existingCount, message = "No driver rows found for backfill." });

        var profiles = await _db.MotivDriverProfiles.AsNoTracking().ToListAsync();
        var profileByDriverId = profiles
            .GroupBy(p => p.DriverId)
            .ToDictionary(g => g.Key, g => g.First());

        var existingKeys = await _db.MotivActivityLogs.AsNoTracking()
            .Where(x => (orgId == 0 || x.OrganizationId == orgId) && x.EventAt >= windowStart)
            .Select(x => new { x.Title, x.DriverName, x.Details })
            .ToListAsync();

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in existingKeys)
            seen.Add(BuildActivityDedupeKey(key.Title, key.DriverName, key.Details));

        var now = DateTime.UtcNow;
        var created = 0;
        var skipped = 0;

        foreach (var driver in drivers)
        {
            var name = string.IsNullOrWhiteSpace(driver.Name) ? $"Driver #{driver.Id}" : driver.Name.Trim();
            profileByDriverId.TryGetValue(driver.Id, out var profile);

            var profileLinkedAt = profile?.CreatedAt;
            if (profileLinkedAt.HasValue && profileLinkedAt.Value >= windowStart)
            {
                var linkDetails = BuildMotivProfileLinkDetails(driver, profile);
                var title = Truncate($"Motiv profile linked: {name}", 200);
                var key = BuildActivityDedupeKey(title, name, linkDetails);
                if (!seen.Contains(key))
                {
                    _db.MotivActivityLogs.Add(new MotivActivityLog
                    {
                        OrganizationId = orgId == 0 ? null : orgId,
                        Kind = "info",
                        Title = title,
                        DriverName = Truncate(name, 200),
                        Details = Truncate(linkDetails, 2000),
                        PreviousLocation = null,
                        CurrentLocation = null,
                        EventAt = profileLinkedAt.Value.ToUniversalTime(),
                        CreatedAt = now
                    });
                    seen.Add(key);
                    created++;
                }
                else
                {
                    skipped++;
                }
            }

            var snapshotAt = ResolveDriverSnapshotEventAt(driver, profile, now);
            if (snapshotAt < windowStart)
                continue;

            var snapshotCurrentLocation = BuildDriverLocationLabel(driver, profile);
            var snapshotPreviousLocation = "N/A";
            var snapshotDetails = BuildDriverSnapshotDetails(
                driver.Status,
                BuildDriverVehicleLabel(driver, profile),
                snapshotPreviousLocation,
                snapshotCurrentLocation);
            var snapshotTitle = Truncate($"Driver update: {name}", 200);
            var snapshotKey = BuildActivityDedupeKey(snapshotTitle, name, snapshotDetails);
            if (seen.Contains(snapshotKey))
            {
                skipped++;
                continue;
            }

            _db.MotivActivityLogs.Add(new MotivActivityLog
            {
                OrganizationId = orgId == 0 ? null : orgId,
                Kind = "info",
                Title = snapshotTitle,
                DriverName = Truncate(name, 200),
                Details = Truncate(snapshotDetails, 2000),
                PreviousLocation = NormalizeLocationForStorage(snapshotPreviousLocation),
                CurrentLocation = NormalizeLocationForStorage(snapshotCurrentLocation),
                EventAt = snapshotAt,
                CreatedAt = now
            });
            seen.Add(snapshotKey);
            created++;
        }

        if (created > 0)
            await _db.SaveChangesAsync();

        return Ok(new
        {
            created,
            skipped,
            existingCount,
            days = windowDays
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
        var creds = await ResolveMotivCredentials();
        var apiKey = creds.ApiKey;
        var baseUrl = creds.BaseUrl;

        if (string.IsNullOrWhiteSpace(baseUrl))
            return (false, 400, $"MOTIV_API_BASE_URL is not configured (org={creds.OrganizationId}).", default);
        if (string.IsNullOrWhiteSpace(apiKey))
            return (false, 400, $"MOTIV_API_KEY is not configured (org={creds.OrganizationId}).", default);

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

    private async Task<(string? ApiKey, string? BaseUrl, int OrganizationId, bool UsingOrgOverride)> ResolveMotivCredentials()
    {
        var orgId = await ResolveOrganizationId();

        var orgApiKey = orgId > 0
            ? FirstNonEmpty(
                _config[$"MOTIV_API_KEY_ORG_{orgId}"],
                Environment.GetEnvironmentVariable($"MOTIV_API_KEY_ORG_{orgId}"))
            : null;

        var orgBaseUrl = orgId > 0
            ? FirstNonEmpty(
                _config[$"MOTIV_API_BASE_URL_ORG_{orgId}"],
                Environment.GetEnvironmentVariable($"MOTIV_API_BASE_URL_ORG_{orgId}"))
            : null;

        var globalApiKey = FirstNonEmpty(
            _config["MOTIV_API_KEY"],
            Environment.GetEnvironmentVariable("MOTIV_API_KEY"));

        var globalBaseUrl = FirstNonEmpty(
            _config["MOTIV_API_BASE_URL"],
            Environment.GetEnvironmentVariable("MOTIV_API_BASE_URL"));

        var apiKey = FirstNonEmpty(orgApiKey, globalApiKey);
        var baseUrl = FirstNonEmpty(orgBaseUrl, globalBaseUrl);
        var usingOrgOverride = !string.IsNullOrWhiteSpace(orgApiKey) || !string.IsNullOrWhiteSpace(orgBaseUrl);

        return (apiKey, baseUrl, orgId, usingOrgOverride);
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }
        return null;
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

        foreach (var key in new[]
        {
            "driver_performance_events",
            "driverPerformanceEvents",
            "driver_performance_rollups",
            "driverPerformanceRollups",
            "scorecard_summaries",
            "scorecardSummaries",
            "driver_utilization_rollups",
            "driverUtilizationRollups",
            "utilization_rollups",
            "hos_violations",
            "hosViolations",
            "inspection_reports",
            "inspectionReports",
            "safety_events",
            "safetyEvents",
            "events",
            "driver_locations",
            "vehicle_locations",
            "asset_locations",
            "dispatch_locations",
            "vehicles",
            "users",
            "cards",
            "fuel_cards",
            "payment_cards",
            "data",
            "items",
            "results",
            "fuel_purchases",
            "transactions"
        })
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

    private static string? TruncateNullable(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        return Truncate(value.Trim(), maxLength);
    }

    private static string? NormalizeActivityKind(string? kind)
    {
        var normalized = (kind ?? "").Trim().ToLowerInvariant();
        return normalized switch
        {
            "info" => "info",
            "success" => "success",
            "warning" => "warning",
            "error" => "error",
            "" => null,
            _ => "info"
        };
    }

    private static string BuildDriverSnapshotDetails(MotivDriverSnapshotActivityRequest row)
    {
        var status = string.IsNullOrWhiteSpace(row.Status) ? "unknown" : row.Status.Trim();
        var vehicle = string.IsNullOrWhiteSpace(row.Vehicle) ? "N/A" : row.Vehicle.Trim();
        var location = string.IsNullOrWhiteSpace(row.Location) ? "N/A" : row.Location.Trim();
        return $"Status: {status} | Vehicle: {vehicle} | Previous Location: N/A | Current Location: {location}";
    }

    private static string BuildDriverSnapshotDetails(string? status, string? vehicle, string? previousLocation, string? currentLocation)
    {
        var statusText = string.IsNullOrWhiteSpace(status) ? "unknown" : status.Trim();
        var vehicleText = string.IsNullOrWhiteSpace(vehicle) ? "N/A" : vehicle.Trim();
        var previousLocationText = string.IsNullOrWhiteSpace(previousLocation) ? "N/A" : previousLocation.Trim();
        var currentLocationText = string.IsNullOrWhiteSpace(currentLocation) ? "N/A" : currentLocation.Trim();
        return $"Status: {statusText} | Vehicle: {vehicleText} | Previous Location: {previousLocationText} | Current Location: {currentLocationText}";
    }

    private static string BuildMotivProfileLinkDetails(Driver driver, MotivDriverProfile? profile)
    {
        var userId = string.IsNullOrWhiteSpace(profile?.MotivUserId) ? "N/A" : profile!.MotivUserId;
        var vehicleId = string.IsNullOrWhiteSpace(profile?.MotivVehicleId) ? "N/A" : profile!.MotivVehicleId;
        var status = string.IsNullOrWhiteSpace(profile?.MotivStatus) ? (driver.Status ?? "unknown") : profile!.MotivStatus;
        return $"Motiv userId: {userId} | Motiv vehicleId: {vehicleId} | Status: {status}";
    }

    private static DateTime ResolveDriverSnapshotEventAt(Driver driver, MotivDriverProfile? profile, DateTime fallback)
    {
        var candidate = driver.LastLocationUpdate
            ?? profile?.LastLocationUpdate
            ?? profile?.UpdatedAt
            ?? driver.UpdatedAt;
        if (candidate == default)
            return fallback;
        return candidate.ToUniversalTime();
    }

    private static string BuildDriverVehicleLabel(Driver driver, MotivDriverProfile? profile)
    {
        var number = FirstNonEmptyString(driver.TruckNumber, profile?.VehicleNumber);
        var year = driver.TruckYear ?? profile?.VehicleYear;
        var make = FirstNonEmptyString(driver.TruckMake, profile?.VehicleMake);
        var model = FirstNonEmptyString(driver.TruckModel, profile?.VehicleModel);

        var parts = new List<string>();
        if (year.HasValue && year.Value > 0) parts.Add(year.Value.ToString());
        if (!string.IsNullOrWhiteSpace(number)) parts.Add(number!);
        if (!string.IsNullOrWhiteSpace(make)) parts.Add(make!);
        if (!string.IsNullOrWhiteSpace(model)) parts.Add(model!);

        return parts.Count == 0 ? "N/A" : string.Join(" ", parts);
    }

    private static string BuildDriverLocationLabel(Driver driver, MotivDriverProfile? profile)
    {
        var rawLocation = TryExtractLocationFromProfileRawJson(profile?.RawJson);
        if (!string.IsNullOrWhiteSpace(rawLocation))
            return rawLocation;

        var lat = driver.Latitude ?? profile?.Latitude;
        var lon = driver.Longitude ?? profile?.Longitude;
        if (lat.HasValue && lon.HasValue)
            return $"{lat.Value:0.####}, {lon.Value:0.####}";
        return "N/A";
    }

    private static string ExtractCurrentLocationFromDetails(string? details)
    {
        var text = (details ?? "").Trim();
        if (string.IsNullOrWhiteSpace(text))
            return "N/A";

        const string currentPrefix = "Current Location:";
        var currentIndex = text.IndexOf(currentPrefix, StringComparison.OrdinalIgnoreCase);
        if (currentIndex >= 0)
        {
            var valueStart = currentIndex + currentPrefix.Length;
            var currentValue = text.Substring(valueStart).Trim();
            if (!string.IsNullOrWhiteSpace(currentValue))
                return currentValue;
        }

        const string legacyPrefix = "Location:";
        var legacyIndex = text.IndexOf(legacyPrefix, StringComparison.OrdinalIgnoreCase);
        if (legacyIndex >= 0)
        {
            var valueStart = legacyIndex + legacyPrefix.Length;
            var legacyValue = text.Substring(valueStart).Trim();
            if (!string.IsNullOrWhiteSpace(legacyValue))
                return legacyValue;
        }

        return "N/A";
    }

    private static string ExtractPreviousLocationFromDetails(string? details)
    {
        var text = (details ?? "").Trim();
        if (string.IsNullOrWhiteSpace(text))
            return "N/A";

        const string previousPrefix = "Previous Location:";
        var previousIndex = text.IndexOf(previousPrefix, StringComparison.OrdinalIgnoreCase);
        if (previousIndex >= 0)
        {
            var valueStart = previousIndex + previousPrefix.Length;
            var remaining = text.Substring(valueStart).Trim();
            var separatorIndex = remaining.IndexOf('|');
            var previousValue = separatorIndex >= 0
                ? remaining.Substring(0, separatorIndex).Trim()
                : remaining;
            if (!string.IsNullOrWhiteSpace(previousValue))
                return previousValue;
        }

        return "N/A";
    }

    private static string? NormalizeLocationForStorage(string? location)
    {
        var value = TruncateNullable(location, 300);
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var normalized = value.Trim().ToLowerInvariant();
        if (normalized is "n/a" or "na" or "unknown" or "null")
            return "N/A";

        return value;
    }

    private static string? TryExtractLocationFromProfileRawJson(string? rawJson)
    {
        if (string.IsNullOrWhiteSpace(rawJson))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;
            var location = PickNestedObject(root, "current_location")
                ?? PickNestedObject(root, "location")
                ?? (root.ValueKind == JsonValueKind.Object ? root : (JsonElement?)null);
            if (!location.HasValue)
                return null;

            var loc = location.Value;
            var address = PickNestedObject(loc, "address");
            var locationText = FirstNonEmptyString(
                PickString(loc, "description", "name", "address", "formatted_address", "street", "address_line_1"),
                address.HasValue ? PickString(address.Value, "formatted", "line1", "line_1", "street") : null,
                BuildCityState(
                    FirstNonEmptyString(PickString(loc, "city"), address.HasValue ? PickString(address.Value, "city") : null),
                    FirstNonEmptyString(PickString(loc, "state"), address.HasValue ? PickString(address.Value, "state") : null))
            );
            if (!string.IsNullOrWhiteSpace(locationText))
                return locationText;

            var lat = PickDecimal(loc, "lat", "latitude");
            var lon = PickDecimal(loc, "lon", "lng", "longitude");
            if (lat.HasValue && lon.HasValue)
                return $"{lat.Value:0.####}, {lon.Value:0.####}";
            return null;
        }
        catch
        {
            return null;
        }
    }

    private static string? BuildCityState(string? city, string? state)
    {
        var c = (city ?? "").Trim();
        var s = (state ?? "").Trim();
        if (string.IsNullOrWhiteSpace(c) && string.IsNullOrWhiteSpace(s))
            return null;
        if (string.IsNullOrWhiteSpace(c))
            return s;
        if (string.IsNullOrWhiteSpace(s))
            return c;
        return $"{c}, {s}";
    }

    private static string? FirstNonEmptyString(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }
        return null;
    }

    private static string BuildActivityDedupeKey(string? title, string? driverName, string? details)
    {
        return $"{(title ?? "").Trim().ToLowerInvariant()}|{(driverName ?? "").Trim().ToLowerInvariant()}|{(details ?? "").Trim().ToLowerInvariant()}";
    }

    private static bool IsReachable(bool success, int statusCode)
    {
        return success
            || statusCode == 400
            || statusCode == 401
            || statusCode == 403
            || statusCode == 404
            || statusCode == 405
            || statusCode == 409
            || statusCode == 415
            || statusCode == 422;
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
        var vehicleLocationsPath = _config["MOTIV_VEHICLE_LOCATIONS_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_VEHICLE_LOCATIONS_PATH")
            ?? "/v1/vehicle_locations";

        var primary = await FetchAllMotivRows(driversPath, $"{endpointPrefix}:primary");
        var selectedPath = driversPath;
        var locationRows = new List<JsonElement>();

        if (primary.Success)
        {
            locationRows = primary.Rows;
        }
        else
        {
            var primaryReachable = IsReachable(primary.Success, primary.StatusCode);
            if (!string.Equals(driversPath, "/v1/driver_locations", StringComparison.OrdinalIgnoreCase))
            {
                var fallback = await FetchAllMotivRows("/v1/driver_locations", $"{endpointPrefix}:driver-locations-fallback-primary-failed");
                if (fallback.Success)
                {
                    locationRows = fallback.Rows;
                    selectedPath = "/v1/driver_locations";
                }
                else if (primaryReachable || IsReachable(fallback.Success, fallback.StatusCode))
                {
                    // Treat capability-level errors as reachable for health checks.
                    return (true, 200, null, new List<JsonElement>(), primaryReachable ? driversPath : "/v1/driver_locations", 0, 0, 0);
                }
            }

            if (locationRows.Count == 0)
            {
                if (primaryReachable)
                {
                    // Endpoint is reachable but returns a capability response (e.g. 404 on sample path).
                    return (true, 200, null, new List<JsonElement>(), driversPath, 0, 0, 0);
                }

                return (false, primary.StatusCode, primary.Error, new List<JsonElement>(), driversPath, 0, 0, 0);
            }
        }

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

        // Prefer live vehicle location rows as the merge fallback source for GPS coordinates.
        var vehiclesRows = new List<JsonElement>();
        foreach (var candidatePath in new[]
        {
            vehicleLocationsPath,
            "/v1/vehicle_locations",
            "/v2/vehicle_locations",
            "/v3/vehicle_locations",
            "/v1/freight_visibility/vehicle_locations",
            vehiclesPath
        }
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var vehiclesFetch = await FetchAllMotivRows(candidatePath, $"{endpointPrefix}:vehicles:{candidatePath}");
            if (!vehiclesFetch.Success || vehiclesFetch.Rows.Count == 0) continue;
            vehiclesRows = vehiclesFetch.Rows;
            break;
        }

        var mergedRows = MergeDriverRows(usersRows, locationRows, vehiclesRows);
        if (mergedRows.Count == 0)
            mergedRows = locationRows;

        var locationRowsWithCoords = locationRows.Count(row =>
        {
            var normalized = NormalizeLocationElement(
                PickNestedObject(row, "current_location")
                ?? PickNestedObject(row, "location")
                ?? PickNestedObject(row, "latest_location")
                ?? PickNestedObject(row, "last_known_location")
                ?? row
            );
            var (lat, lon) = TryExtractLatLon(normalized);
            return lat.HasValue && lon.HasValue;
        });

        var vehicleRowsWithCoords = vehiclesRows.Count(row =>
        {
            var normalized = NormalizeLocationElement(
                PickNestedObject(row, "current_location")
                ?? PickNestedObject(row, "location")
                ?? PickNestedObject(row, "latest_location")
                ?? PickNestedObject(row, "last_known_location")
                ?? row
            );
            var (lat, lon) = TryExtractLatLon(normalized);
            return lat.HasValue && lon.HasValue;
        });

        var locationSample = locationRows.Count > 0 ? locationRows[0] : (JsonElement?)null;
        var vehicleSample = vehiclesRows.Count > 0 ? vehiclesRows[0] : (JsonElement?)null;
        var locationSampleJson = locationSample.HasValue ? Truncate(locationSample.Value.GetRawText(), 800) : "";
        var vehicleSampleJson = vehicleSample.HasValue ? Truncate(vehicleSample.Value.GetRawText(), 800) : "";
        _logger.LogInformation(
            "MOTIV raw coverage locationRowsWithCoords={LocationRowsWithCoords}/{LocationRowsTotal} vehicleRowsWithCoords={VehicleRowsWithCoords}/{VehicleRowsTotal} locationSampleKeys={LocationSampleKeys} vehicleSampleKeys={VehicleSampleKeys} locationSampleJson={LocationSampleJson} vehicleSampleJson={VehicleSampleJson}",
            locationRowsWithCoords,
            locationRows.Count,
            vehicleRowsWithCoords,
            vehiclesRows.Count,
            string.Join(",", GetJsonKeys(locationSample, 30)),
            string.Join(",", GetJsonKeys(vehicleSample, 30)),
            locationSampleJson,
            vehicleSampleJson
        );

        JsonElement? mergedSample = mergedRows.Count > 0 ? mergedRows[0] : null;
        AppendDebugLog(
            runId: "run-activity-location",
            hypothesisId: "H3",
            location: "MotivController.FetchEnrichedDriverRows",
            message: "FetchEnrichedDriverRows merge summary",
            data: new
            {
                endpointPrefix,
                usersRows = usersRows.Count,
                locationRows = locationRows.Count,
                vehicleRows = vehiclesRows.Count,
                mergedRows = mergedRows.Count,
                selectedPath,
                mergedSampleTopKeys = GetJsonKeys(mergedSample, 20),
                mergedSampleLocationKeys = mergedSample.HasValue ? GetJsonKeys(PickNestedObject(mergedSample.Value, "current_location"), 20) : new List<string>()
            });

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

        var vehiclesById = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in vehicleRows)
        {
            var keys = new[]
            {
                PickString(row, "vehicle_id", "id"),
                PickString(PickNestedObject(row, "vehicle") ?? default, "id", "vehicle_id"),
                PickString(PickNestedObject(row, "current_vehicle") ?? default, "id", "vehicle_id")
            }
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (var key in keys)
            {
                if (!vehiclesById.ContainsKey(key!))
                    vehiclesById[key!] = row;
            }
        }

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

        // Use driver-location rows as the canonical source so non-driver users never get promoted.
        var baseRows = locationRows.Count > 0
            ? locationRows
            : usersRows.Where(IsDriverLikeUser).ToList();
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

            var matchedLocationUser = matchedLocation.HasValue
                ? (PickNestedObject(matchedLocation.Value, "user") ?? (JsonElement?)null)
                : null;
            var baseRowUser = PickNestedObject(baseRow, "user");

            var locationObject = matchedLocation.HasValue
                ? (
                    PickNestedObject(matchedLocation.Value, "current_location")
                    ?? PickNestedObject(matchedLocation.Value, "location")
                    ?? PickNestedObject(matchedLocation.Value, "latest_location")
                    ?? PickNestedObject(matchedLocation.Value, "last_known_location")
                    ?? (matchedLocationUser.HasValue ? PickNestedObject(matchedLocationUser.Value, "current_location") : null)
                    ?? (matchedLocationUser.HasValue ? PickNestedObject(matchedLocationUser.Value, "location") : null)
                    ?? (matchedLocationUser.HasValue ? PickNestedObject(matchedLocationUser.Value, "latest_location") : null)
                    ?? (matchedLocationUser.HasValue ? PickNestedObject(matchedLocationUser.Value, "last_known_location") : null)
                    ?? (LooksLikeLocationRow(matchedLocation.Value) ? matchedLocation.Value : (JsonElement?)null)
                )
                : (
                    PickNestedObject(baseRow, "current_location")
                    ?? PickNestedObject(baseRow, "location")
                    ?? PickNestedObject(baseRow, "latest_location")
                    ?? PickNestedObject(baseRow, "last_known_location")
                    ?? (baseRowUser.HasValue ? PickNestedObject(baseRowUser.Value, "current_location") : null)
                    ?? (baseRowUser.HasValue ? PickNestedObject(baseRowUser.Value, "location") : null)
                    ?? (baseRowUser.HasValue ? PickNestedObject(baseRowUser.Value, "latest_location") : null)
                    ?? (baseRowUser.HasValue ? PickNestedObject(baseRowUser.Value, "last_known_location") : null)
                    ?? (LooksLikeLocationRow(baseRow) ? baseRow : (JsonElement?)null)
                );
            locationObject = NormalizeLocationElement(locationObject) ?? locationObject;

            var vehicleObject =
                (matchedLocation.HasValue ? PickNestedObject(matchedLocation.Value, "current_vehicle") : null)
                ?? (matchedLocationUser.HasValue ? PickNestedObject(matchedLocationUser.Value, "current_vehicle") : null)
                ?? PickNestedObject(baseRow, "current_vehicle")
                ?? (baseRowUser.HasValue ? PickNestedObject(baseRowUser.Value, "current_vehicle") : null)
                ?? PickNestedObject(baseRow, "vehicle");

            var vehicleId =
                PickString(vehicleObject ?? default, "id", "vehicle_id")
                ?? PickString(
                    matchedLocation ?? baseRow,
                    "vehicle_id",
                    "vehicleId",
                    "current_vehicle_id",
                    "truck_id",
                    "asset_id");
            if (vehicleObject == null && !string.IsNullOrWhiteSpace(vehicleId) && vehiclesById.TryGetValue(vehicleId, out var matchedVehicle))
                vehicleObject = matchedVehicle;

            if ((!locationObject.HasValue || locationObject.Value.ValueKind != JsonValueKind.Object) && vehicleObject.HasValue)
            {
                locationObject =
                    PickNestedObject(vehicleObject.Value, "current_location")
                    ?? PickNestedObject(vehicleObject.Value, "location")
                    ?? PickNestedObject(vehicleObject.Value, "latest_location")
                    ?? PickNestedObject(vehicleObject.Value, "last_known_location")
                    ?? (LooksLikeLocationRow(vehicleObject.Value) ? vehicleObject.Value : (JsonElement?)null);
            }
            locationObject = NormalizeLocationElement(locationObject) ?? locationObject;
            var (flatLatitude, flatLongitude) = TryExtractLatLon(locationObject);

            // If driver-location row exists but has no coordinates, fall back to vehicle-location coordinates.
            if ((!flatLatitude.HasValue || !flatLongitude.HasValue) && vehicleObject.HasValue)
            {
                var vehicleLocation =
                    PickNestedObject(vehicleObject.Value, "current_location")
                    ?? PickNestedObject(vehicleObject.Value, "location")
                    ?? PickNestedObject(vehicleObject.Value, "latest_location")
                    ?? PickNestedObject(vehicleObject.Value, "last_known_location")
                    ?? (LooksLikeLocationRow(vehicleObject.Value) ? vehicleObject.Value : (JsonElement?)null);

                var normalizedVehicleLocation = NormalizeLocationElement(vehicleLocation) ?? vehicleLocation;
                var (vehicleLat, vehicleLon) = TryExtractLatLon(normalizedVehicleLocation);
                if (vehicleLat.HasValue && vehicleLon.HasValue)
                {
                    locationObject = normalizedVehicleLocation;
                    flatLatitude = vehicleLat;
                    flatLongitude = vehicleLon;
                }
            }

            var userObject = baseUser;
            if (userObject.ValueKind != JsonValueKind.Object && !string.IsNullOrWhiteSpace(userId) && usersById.TryGetValue(userId, out var matchedUserById))
                userObject = matchedUserById;
            if (userObject.ValueKind != JsonValueKind.Object && emailKey != null && usersByEmail.TryGetValue(emailKey, out var matchedUserByEmail))
                userObject = matchedUserByEmail;

            var merged = JsonSerializer.SerializeToElement(new
            {
                user = userObject,
                current_location = locationObject,
                current_vehicle = vehicleObject,
                latitude = flatLatitude,
                longitude = flatLongitude,
                lat = flatLatitude,
                lng = flatLongitude,
                lon = flatLongitude
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
                current_location =
                    PickNestedObject(row, "current_location")
                    ?? PickNestedObject(row, "location")
                    ?? PickNestedObject(row, "latest_location")
                    ?? PickNestedObject(row, "last_known_location")
                    ?? (LooksLikeLocationRow(row) ? row : (JsonElement?)null),
                current_vehicle = PickNestedObject(row, "current_vehicle")
            });
            var normalizedCurrentLocation = NormalizeLocationElement(
                PickNestedObject(merged, "current_location")
            );
            var (flatLatitude, flatLongitude) = TryExtractLatLon(normalizedCurrentLocation);
            if (normalizedCurrentLocation.HasValue)
            {
                merged = JsonSerializer.SerializeToElement(new
                {
                    user = PickNestedObject(merged, "user"),
                    current_location = normalizedCurrentLocation.Value,
                    current_vehicle = PickNestedObject(merged, "current_vehicle"),
                    latitude = flatLatitude,
                    longitude = flatLongitude,
                    lat = flatLatitude,
                    lng = flatLongitude,
                    lon = flatLongitude
                });
            }
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
            || row.TryGetProperty("coordinates", out _)
            || row.TryGetProperty("position", out _)
            || row.TryGetProperty("latLng", out _)
            || row.TryGetProperty("gps", out _)
            || row.TryGetProperty("geometry", out _)
            || row.TryGetProperty("geo", out _)
            || row.TryGetProperty("location", out _)
            || row.TryGetProperty("current_location", out _)
            || row.TryGetProperty("latest_location", out _)
            || row.TryGetProperty("last_known_location", out _)
            || row.TryGetProperty("located_at", out _)
            || row.TryGetProperty("locatedAt", out _);
    }

    private static JsonElement? NormalizeLocationElement(JsonElement? locationElement)
    {
        if (!locationElement.HasValue || locationElement.Value.ValueKind != JsonValueKind.Object)
            return locationElement;

        var src = locationElement.Value;
        static decimal? ReadDecimal(JsonElement? srcObj, params string[] keys)
        {
            if (!srcObj.HasValue || srcObj.Value.ValueKind != JsonValueKind.Object) return null;
            return PickDecimal(srcObj.Value, keys);
        }

        decimal? latitude =
            PickDecimal(src, "latitude", "lat", "currentLatitude", "lastLatitude", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "location"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "current_location"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "latest_location"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "last_known_location"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "position"), "latitude", "lat", "latitudeE7", "latitude_e7")
            ?? ReadDecimal(PickNestedObject(PickNestedObject(src, "geometry") ?? default, "location"), "lat", "latitude", "latitudeE7", "latitude_e7");

        decimal? longitude =
            PickDecimal(src, "longitude", "lng", "lon", "currentLongitude", "lastLongitude", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "location"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "current_location"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "latest_location"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "last_known_location"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "position"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7")
            ?? ReadDecimal(PickNestedObject(PickNestedObject(src, "geometry") ?? default, "location"), "lng", "lon", "longitude", "longitudeE7", "longitude_e7");

        if ((!latitude.HasValue || !longitude.HasValue) &&
            src.TryGetProperty("coordinates", out var coordinates) &&
            coordinates.ValueKind == JsonValueKind.Array)
        {
            var values = coordinates.EnumerateArray().ToList();
            if (values.Count >= 2 &&
                values[0].ValueKind == JsonValueKind.Number &&
                values[1].ValueKind == JsonValueKind.Number &&
                values[0].TryGetDecimal(out var lonFromCoords) &&
                values[1].TryGetDecimal(out var latFromCoords))
            {
                latitude ??= latFromCoords;
                longitude ??= lonFromCoords;
            }
        }

        if ((!latitude.HasValue || !longitude.HasValue) &&
            src.TryGetProperty("coordinates", out var coordinatesObj) &&
            coordinatesObj.ValueKind == JsonValueKind.Object)
        {
            latitude ??= PickDecimal(coordinatesObj, "lat", "latitude", "y", "latitudeE7", "latitude_e7");
            longitude ??= PickDecimal(coordinatesObj, "lng", "lon", "longitude", "x", "longitudeE7", "longitude_e7");
        }

        if ((!latitude.HasValue || !longitude.HasValue) &&
            src.TryGetProperty("latLng", out var latLngObj) &&
            latLngObj.ValueKind == JsonValueKind.Object)
        {
            latitude ??= PickDecimal(latLngObj, "lat", "latitude", "latitudeE7", "latitude_e7");
            longitude ??= PickDecimal(latLngObj, "lng", "lon", "longitude", "longitudeE7", "longitude_e7");
        }

        if ((!latitude.HasValue || !longitude.HasValue) &&
            src.TryGetProperty("gps", out var gpsObj) &&
            gpsObj.ValueKind == JsonValueKind.Object)
        {
            latitude ??= PickDecimal(gpsObj, "lat", "latitude", "latitudeE7", "latitude_e7");
            longitude ??= PickDecimal(gpsObj, "lng", "lon", "longitude", "longitudeE7", "longitude_e7");
        }

        if (!latitude.HasValue || !longitude.HasValue)
            return src;

        decimal NormalizeCoord(decimal value)
        {
            if (Math.Abs(value) > 180m) return value / 10000000m; // E7 fallback
            return value;
        }

        latitude = NormalizeCoord(latitude.Value);
        longitude = NormalizeCoord(longitude.Value);

        var payload = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["latitude"] = latitude.Value,
            ["longitude"] = longitude.Value,
            ["lat"] = latitude.Value,
            ["lng"] = longitude.Value,
            ["lon"] = longitude.Value
        };

        var city = PickString(src, "city", "city_name", "cityName", "current_city", "currentCity");
        var state = PickString(src, "state", "state_name", "stateName", "state_code", "stateCode", "region", "province");
        if (!string.IsNullOrWhiteSpace(city)) payload["city"] = city;
        if (!string.IsNullOrWhiteSpace(state)) payload["state"] = state;

        return JsonSerializer.SerializeToElement(payload);
    }

    private static (decimal? Latitude, decimal? Longitude) TryExtractLatLon(JsonElement? locationElement)
    {
        if (!locationElement.HasValue || locationElement.Value.ValueKind != JsonValueKind.Object)
            return (null, null);

        var src = locationElement.Value;
        decimal NormalizeCoordinateValue(decimal value)
        {
            var abs = Math.Abs(value);
            if (abs > 1000000m)
                return value / 10000000m;
            return value;
        }

        decimal? ReadDecimal(JsonElement? obj, params string[] keys)
        {
            if (!obj.HasValue || obj.Value.ValueKind != JsonValueKind.Object) return null;
            return PickDecimal(obj.Value, keys);
        }

        var latitude =
            PickDecimal(src, "latitude", "lat", "currentLatitude", "lastLatitude", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "location"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "current_location"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "latest_location"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "last_known_location"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "position"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "gps"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(src, "latLng"), "latitude", "lat", "latitudeE7", "latitude_e7", "y")
            ?? ReadDecimal(PickNestedObject(PickNestedObject(src, "geometry") ?? default, "location"), "latitude", "lat", "latitudeE7", "latitude_e7", "y");

        var longitude =
            PickDecimal(src, "longitude", "lng", "lon", "currentLongitude", "lastLongitude", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "location"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "current_location"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "latest_location"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "last_known_location"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "position"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "gps"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(src, "latLng"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x")
            ?? ReadDecimal(PickNestedObject(PickNestedObject(src, "geometry") ?? default, "location"), "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x");

        if ((!latitude.HasValue || !longitude.HasValue) &&
            src.TryGetProperty("coordinates", out var coordinatesArray) &&
            coordinatesArray.ValueKind == JsonValueKind.Array)
        {
            var values = coordinatesArray.EnumerateArray().ToList();
            if (values.Count >= 2 &&
                values[0].ValueKind == JsonValueKind.Number &&
                values[1].ValueKind == JsonValueKind.Number &&
                values[0].TryGetDecimal(out var c0) &&
                values[1].TryGetDecimal(out var c1))
            {
                var c0Norm = NormalizeCoordinateValue(c0);
                var c1Norm = NormalizeCoordinateValue(c1);
                var c0LooksLat = c0Norm >= -90m && c0Norm <= 90m;
                var c1LooksLat = c1Norm >= -90m && c1Norm <= 90m;
                if (!latitude.HasValue)
                {
                    latitude = c0LooksLat && !c1LooksLat ? c0 : c1;
                }
                if (!longitude.HasValue)
                {
                    longitude = c0LooksLat && !c1LooksLat ? c1 : c0;
                }
            }
        }

        if ((!latitude.HasValue || !longitude.HasValue) &&
            src.TryGetProperty("coordinates", out var coordinatesObj) &&
            coordinatesObj.ValueKind == JsonValueKind.Object)
        {
            latitude ??= PickDecimal(coordinatesObj, "lat", "latitude", "y", "latitudeE7", "latitude_e7");
            longitude ??= PickDecimal(coordinatesObj, "lng", "lon", "longitude", "x", "longitudeE7", "longitude_e7");
        }

        if (latitude.HasValue) latitude = NormalizeCoordinateValue(latitude.Value);
        if (longitude.HasValue) longitude = NormalizeCoordinateValue(longitude.Value);

        if ((!latitude.HasValue || !longitude.HasValue) &&
            TryExtractLatLonDeep(src, depth: 0, maxDepth: 6, out var deepLat, out var deepLon))
        {
            latitude ??= deepLat;
            longitude ??= deepLon;
        }

        return (latitude, longitude);
    }

    private static bool TryExtractLatLonDeep(JsonElement element, int depth, int maxDepth, out decimal? latitude, out decimal? longitude)
    {
        latitude = null;
        longitude = null;
        if (depth > maxDepth) return false;

        if (element.ValueKind == JsonValueKind.Object)
        {
            var directLat = PickDecimal(element, "latitude", "lat", "latitudeE7", "latitude_e7", "y");
            var directLon = PickDecimal(element, "longitude", "lng", "lon", "longitudeE7", "longitude_e7", "x");
            if (directLat.HasValue && directLon.HasValue)
            {
                latitude = NormalizeDeepCoordinate(directLat.Value);
                longitude = NormalizeDeepCoordinate(directLon.Value);
                return true;
            }

            if (element.TryGetProperty("coordinates", out var coordinates))
            {
                if (coordinates.ValueKind == JsonValueKind.Array)
                {
                    var values = coordinates.EnumerateArray().ToList();
                    if (values.Count >= 2 &&
                        values[0].ValueKind == JsonValueKind.Number &&
                        values[1].ValueKind == JsonValueKind.Number &&
                        values[0].TryGetDecimal(out var c0) &&
                        values[1].TryGetDecimal(out var c1))
                    {
                        var c0Norm = NormalizeDeepCoordinate(c0);
                        var c1Norm = NormalizeDeepCoordinate(c1);
                        var c0LooksLat = c0Norm >= -90m && c0Norm <= 90m;
                        var c1LooksLat = c1Norm >= -90m && c1Norm <= 90m;
                        latitude = c0LooksLat && !c1LooksLat ? c0Norm : c1Norm;
                        longitude = c0LooksLat && !c1LooksLat ? c1Norm : c0Norm;
                        return true;
                    }
                }
                else if (coordinates.ValueKind == JsonValueKind.Object &&
                         TryExtractLatLonDeep(coordinates, depth + 1, maxDepth, out var cLat, out var cLon))
                {
                    latitude = cLat;
                    longitude = cLon;
                    return true;
                }
            }

            foreach (var prop in element.EnumerateObject())
            {
                if (prop.Value.ValueKind != JsonValueKind.Object && prop.Value.ValueKind != JsonValueKind.Array)
                    continue;
                if (TryExtractLatLonDeep(prop.Value, depth + 1, maxDepth, out var nestedLat, out var nestedLon))
                {
                    latitude = nestedLat;
                    longitude = nestedLon;
                    return true;
                }
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in element.EnumerateArray())
            {
                if (child.ValueKind != JsonValueKind.Object && child.ValueKind != JsonValueKind.Array)
                    continue;
                if (TryExtractLatLonDeep(child, depth + 1, maxDepth, out var nestedLat, out var nestedLon))
                {
                    latitude = nestedLat;
                    longitude = nestedLon;
                    return true;
                }
            }
        }

        return false;
    }

    private static decimal NormalizeDeepCoordinate(decimal value)
    {
        var abs = Math.Abs(value);
        return abs > 1000000m ? value / 10000000m : value;
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

    private async Task<List<JsonElement>> FetchHistoricalFuelRows(string basePath, DateTime startUtc, DateTime endUtc)
    {
        var startDate = startUtc.ToString("yyyy-MM-dd");
        var endDate = endUtc.ToString("yyyy-MM-dd");
        var startIso = startUtc.ToString("O");
        var endIso = endUtc.ToString("O");

        var basePaths = new List<string>
        {
            basePath,
            _config["MOTIV_CARD_TRANSACTIONS_PATH"] ?? Environment.GetEnvironmentVariable("MOTIV_CARD_TRANSACTIONS_PATH") ?? "/motive_card/v2/transactions",
            "/motive_card/v1/transactions"
        };

        var candidatePaths = new List<string>();
        foreach (var root in basePaths.Where(p => !string.IsNullOrWhiteSpace(p)).Select(p => p!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            candidatePaths.Add(root);
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "start_date", startDate), "end_date", endDate));
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "from_date", startDate), "to_date", endDate));
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "start_time", startIso), "end_time", endIso));
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "start_ts", startIso), "end_ts", endIso));
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "from", startIso), "to", endIso));
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "start", startIso), "end", endIso));
            candidatePaths.Add(UpsertQueryParam(UpsertQueryParam(root, "from", startDate), "to", endDate));
        }

        var allRows = new List<JsonElement>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var path in candidatePaths
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var fetch = await FetchAllMotivRows(path, $"fuel-purchases-backfill:{path}", perPage: 100, maxPages: 200);
            if (!fetch.Success || fetch.Rows.Count == 0)
                continue;

            foreach (var row in fetch.Rows)
            {
                var key = BuildFuelPurchaseKeyFromJson(row);
                if (!string.IsNullOrWhiteSpace(key))
                {
                    if (seen.Contains(key))
                        continue;
                    seen.Add(key);
                }
                allRows.Add(row);
            }
        }

        return allRows;
    }

    private async Task<(int Created, int Updated, int Skipped)> UpsertSafetyEventRows(List<JsonElement> rows)
    {
        var orgId = await ResolveOrganizationId();
        var existing = await _db.MotivSafetyEvents.ToListAsync();
        var byExternalId = existing
            .Where(x => !string.IsNullOrWhiteSpace(x.ExternalId))
            .GroupBy(x => x.ExternalId.Trim())
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var created = 0;
        var updated = 0;
        var skipped = 0;

        foreach (var row in rows)
        {
            var payload = PickNestedObject(row, "driver_performance_event")
                ?? PickNestedObject(row, "event")
                ?? row;
            var driver = PickNestedObject(payload, "driver") ?? PickNestedObject(row, "driver");
            var vehicle = PickNestedObject(payload, "vehicle") ?? PickNestedObject(row, "vehicle");
            var downloadable = PickNestedObject(payload, "downloadable_videos");
            var media = PickNestedObject(payload, "media");
            var mediaDownloadable = media.HasValue ? PickNestedObject(media.Value, "downloadable_videos") : null;

            var externalId =
                PickString(payload, "id", "event_id", "uuid")
                ?? PickString(row, "id", "event_id", "uuid")
                ?? BuildSafetyEventCompositeKey(payload, row, driver, vehicle);
            if (string.IsNullOrWhiteSpace(externalId))
            {
                skipped++;
                continue;
            }

            var eventAt = ParseDateTime(
                PickString(payload, "event_time", "event_at", "occurred_at", "created_at", "timestamp", "start_time", "startTime")
                ?? PickString(row, "event_time", "event_at", "occurred_at", "created_at", "timestamp"));
            var eventType = FirstNonEmptyString(
                PickString(payload, "event_type", "type"),
                PickString(payload, "primary_behavior"),
                PickString(payload, "coachable_behavior"),
                PickString(row, "event_type", "type"));
            var severity = FirstNonEmptyString(
                PickString(payload, "severity", "priority", "risk_level", "intensity"),
                PickString(row, "severity", "priority", "risk_level"));
            var status = FirstNonEmptyString(
                PickString(payload, "coaching_status", "status", "state"),
                PickString(row, "coaching_status", "status", "state"));
            var driverName = FirstNonEmptyString(
                driver.HasValue ? BuildName(PickString(driver.Value, "first_name", "firstName"), PickString(driver.Value, "last_name", "lastName"), PickString(driver.Value, "name")) : null,
                PickString(payload, "driver_name", "driver_id"),
                PickString(row, "driver_name", "driver_id"));
            var vehicleLabel = FirstNonEmptyString(
                vehicle.HasValue ? PickString(vehicle.Value, "number", "unit_number", "fleet_number", "vehicle_id", "id") : null,
                PickString(payload, "vehicle_number", "vehicle_id"),
                PickString(row, "vehicle_number", "vehicle_id"));
            var location = FirstNonEmptyString(
                PickString(payload, "location", "address", "place_name"),
                PickString(row, "location", "address", "place_name"),
                BuildCityState(PickString(payload, "city"), PickString(payload, "state")));
            var videoUrl = FirstNonEmptyString(
                downloadable.HasValue ? PickString(downloadable.Value, "dual_facing_enhanced_ai_url", "dual_facing_plain_url", "front_facing_plain_url", "driver_facing_plain_url") : null,
                mediaDownloadable.HasValue ? PickString(mediaDownloadable.Value, "dual_facing_enhanced_ai_url", "dual_facing_plain_url", "front_facing_plain_url", "driver_facing_plain_url") : null,
                PickString(payload, "video_url"),
                PickString(row, "video_url"));
            var hasVideo = !string.IsNullOrWhiteSpace(videoUrl) || downloadable.HasValue || media.HasValue;

            if (!byExternalId.TryGetValue(externalId, out var target))
            {
                target = new MotivSafetyEvent
                {
                    OrganizationId = orgId == 0 ? null : orgId,
                    ExternalId = externalId.Trim(),
                    EventAt = eventAt,
                    EventType = eventType,
                    Severity = severity,
                    DriverName = driverName,
                    VehicleLabel = vehicleLabel,
                    Location = location,
                    Status = status,
                    HasVideo = hasVideo,
                    VideoUrl = videoUrl,
                    RawJson = row.ToString(),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _db.MotivSafetyEvents.Add(target);
                byExternalId[externalId] = target;
                created++;
            }
            else
            {
                target.OrganizationId = orgId == 0 ? target.OrganizationId : orgId;
                target.EventAt = eventAt ?? target.EventAt;
                target.EventType = eventType ?? target.EventType;
                target.Severity = severity ?? target.Severity;
                target.DriverName = driverName ?? target.DriverName;
                target.VehicleLabel = vehicleLabel ?? target.VehicleLabel;
                target.Location = location ?? target.Location;
                target.Status = status ?? target.Status;
                target.HasVideo = hasVideo || target.HasVideo;
                target.VideoUrl = videoUrl ?? target.VideoUrl;
                target.RawJson = row.ToString();
                target.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        await _db.SaveChangesAsync();
        return (created, updated, skipped);
    }

    private static string? BuildSafetyEventCompositeKey(
        JsonElement payload,
        JsonElement row,
        JsonElement? driver,
        JsonElement? vehicle)
    {
        var eventAt = PickString(payload, "event_time", "event_at", "occurred_at", "created_at", "timestamp", "start_time", "startTime")
            ?? PickString(row, "event_time", "event_at", "occurred_at", "created_at", "timestamp");
        var eventType = PickString(payload, "event_type", "type") ?? PickString(row, "event_type", "type");
        var driverName = FirstNonEmptyString(
            driver.HasValue ? BuildName(PickString(driver.Value, "first_name", "firstName"), PickString(driver.Value, "last_name", "lastName"), PickString(driver.Value, "name")) : null,
            PickString(payload, "driver_name", "driver_id"),
            PickString(row, "driver_name", "driver_id"));
        var vehicleLabel = FirstNonEmptyString(
            vehicle.HasValue ? PickString(vehicle.Value, "number", "unit_number", "fleet_number", "vehicle_id", "id") : null,
            PickString(payload, "vehicle_number", "vehicle_id"),
            PickString(row, "vehicle_number", "vehicle_id"));

        var key = $"{eventAt}|{eventType}|{driverName}|{vehicleLabel}".Trim('|');
        return string.IsNullOrWhiteSpace(key) ? null : key;
    }

    private async Task<(int Created, int Updated, int Skipped)> UpsertFuelPurchaseRows(List<JsonElement> rows)
    {
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
            var payload =
                PickNestedObject(row, "fuel_purchase")
                ?? PickNestedObject(row, "transaction")
                ?? PickNestedObject(row, "card_transaction")
                ?? row;
            var externalId = PickString(payload, "id", "transaction_id", "uuid");
            if (string.IsNullOrWhiteSpace(externalId))
            {
                skipped++;
                continue;
            }

            var merchant =
                PickNestedObject(payload, "merchant_info")
                ?? PickNestedObject(payload, "merchant")
                ?? PickNestedObject(row, "merchant_info")
                ?? PickNestedObject(row, "merchant");
            var firstOrderItem = PickFirstArrayObject(payload, "order_items");
            var driverObject = PickNestedObject(payload, "driver") ?? PickNestedObject(row, "driver");
            var vehicleObject = PickNestedObject(payload, "vehicle") ?? PickNestedObject(row, "vehicle");

            var txTime = ParseDateTime(PickString(payload, "transaction_time", "purchased_at", "processed_at", "occurred_at", "created_at", "updated_at", "date"));
            var postedAt = ParseDateTime(PickString(payload, "posted_at", "processed_at", "settled_at"));
            var amount = PickDecimal(payload, "total_amount", "authorized_amount", "total_amount_before_rebate", "amount", "total_cost", "cost");
            var quantity = PickDecimal(firstOrderItem ?? payload, "quantity");

            if (!byExternalId.TryGetValue(externalId, out var target))
            {
                target = new MotivFuelPurchase
                {
                    OrganizationId = orgId == 0 ? null : orgId,
                    ExternalId = externalId.Trim(),
                    TransactionTime = txTime,
                    PostedAt = postedAt,
                    DriverId = PickInt(payload, "driver_id") ?? PickInt(driverObject ?? payload, "id"),
                    VehicleId = PickInt(payload, "vehicle_id") ?? PickInt(vehicleObject ?? payload, "id"),
                    CardId = PickString(payload, "card_id", "last_four_digits"),
                    MerchantName = PickString(merchant ?? payload, "name", "merchant_name", "vendor", "display_name"),
                    MerchantCity = PickString(merchant ?? payload, "city"),
                    MerchantState = PickString(merchant ?? payload, "state"),
                    Status = PickString(payload, "transaction_status", "status", "state"),
                    Currency = PickString(payload, "currency"),
                    Category = PickString(payload, "transaction_type", "type", "category", "fuel_type"),
                    ProductType = PickString(firstOrderItem ?? payload, "product_type"),
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
                target.DriverId = PickInt(payload, "driver_id") ?? PickInt(driverObject ?? payload, "id") ?? target.DriverId;
                target.VehicleId = PickInt(payload, "vehicle_id") ?? PickInt(vehicleObject ?? payload, "id") ?? target.VehicleId;
                target.CardId = PickString(payload, "card_id", "last_four_digits") ?? target.CardId;
                target.MerchantName = PickString(merchant ?? payload, "name", "merchant_name", "vendor", "display_name") ?? target.MerchantName;
                target.MerchantCity = PickString(merchant ?? payload, "city") ?? target.MerchantCity;
                target.MerchantState = PickString(merchant ?? payload, "state") ?? target.MerchantState;
                target.Status = PickString(payload, "transaction_status", "status", "state") ?? target.Status;
                target.Currency = PickString(payload, "currency") ?? target.Currency;
                target.Category = PickString(payload, "transaction_type", "type", "category", "fuel_type") ?? target.Category;
                target.ProductType = PickString(firstOrderItem ?? payload, "product_type") ?? target.ProductType;
                target.Quantity = quantity ?? target.Quantity;
                target.Amount = amount ?? target.Amount;
                target.RawJson = row.ToString();
                target.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        await _db.SaveChangesAsync();
        return (created, updated, skipped);
    }

    private static List<JsonElement> MergeFuelPurchaseRows(List<JsonElement> liveRows, List<MotivFuelPurchase> dbRows)
    {
        var merged = new List<JsonElement>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in liveRows)
        {
            var key = BuildFuelPurchaseKeyFromJson(row);
            if (!string.IsNullOrWhiteSpace(key))
            {
                if (seen.Contains(key))
                    continue;
                seen.Add(key);
            }
            merged.Add(row);
        }

        foreach (var row in dbRows)
        {
            var key = BuildFuelPurchaseKeyFromDb(row);
            if (!string.IsNullOrWhiteSpace(key) && seen.Contains(key))
                continue;

            var dbJson = MapFuelPurchaseDbRow(row);
            if (!string.IsNullOrWhiteSpace(key))
                seen.Add(key);
            merged.Add(dbJson);
        }

        return merged;
    }

    private static string BuildFuelPurchaseKeyFromJson(JsonElement row)
    {
        var direct = PickString(row, "id", "transaction_id", "uuid");
        if (!string.IsNullOrWhiteSpace(direct))
            return direct.Trim();

        var nested = PickString(PickNestedObject(row, "fuel_purchase") ?? row, "id", "transaction_id", "uuid");
        if (!string.IsNullOrWhiteSpace(nested))
            return nested.Trim();

        return string.Empty;
    }

    private static string BuildFuelPurchaseKeyFromDb(MotivFuelPurchase row)
    {
        return string.IsNullOrWhiteSpace(row.ExternalId)
            ? string.Empty
            : row.ExternalId.Trim();
    }

    private static JsonElement MapFuelPurchaseDbRow(MotivFuelPurchase row)
    {
        return JsonSerializer.SerializeToElement(new
        {
            id = row.ExternalId,
            transaction_id = row.ExternalId,
            transaction_time = row.TransactionTime?.ToUniversalTime().ToString("O"),
            posted_at = row.PostedAt?.ToUniversalTime().ToString("O"),
            total_amount = row.Amount,
            amount = row.Amount,
            total_cost = row.Amount,
            currency = row.Currency,
            transaction_status = row.Status,
            status = row.Status,
            transaction_type = row.Category,
            category = row.Category,
            fuel_type = row.Category,
            product_type = row.ProductType,
            driver_id = row.DriverId,
            vehicle_id = row.VehicleId,
            card_id = row.CardId,
            merchant_name = row.MerchantName,
            vendor = row.MerchantName,
            city = row.MerchantCity,
            state = row.MerchantState,
            merchant_info = new
            {
                name = row.MerchantName,
                city = row.MerchantCity,
                state = row.MerchantState
            },
            source = "access-db",
            created_at = row.CreatedAt.ToUniversalTime().ToString("O"),
            updated_at = row.UpdatedAt.ToUniversalTime().ToString("O")
        });
    }

    private async Task<(bool Success, int StatusCode, string? Error, List<JsonElement> Rows)> FetchVehicleLocationsByVehicleIds(string date)
    {
        var vehiclesPath = _config["MOTIV_VEHICLES_PATH"]
            ?? Environment.GetEnvironmentVariable("MOTIV_VEHICLES_PATH")
            ?? "/v1/vehicles";

        var vehicleFetch = await FetchAllMotivRows(vehiclesPath, "vehicle-locations-by-id:vehicles");
        if (!vehicleFetch.Success || vehicleFetch.Rows.Count == 0)
            return (false, vehicleFetch.StatusCode, vehicleFetch.Error ?? "No vehicles available for by-id lookup.", new List<JsonElement>());

        var vehicleIds = vehicleFetch.Rows
            .Select(row =>
                PickString(row, "id")
                ?? PickString(PickNestedObject(row, "vehicle") ?? row, "id", "vehicle_id"))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(150)
            .ToList();

        if (vehicleIds.Count == 0)
            return (false, 404, "No valid vehicle ids found in vehicles payload.", new List<JsonElement>());

        var rows = new List<JsonElement>();
        var statusCode = 200;

        foreach (var id in vehicleIds)
        {
            var idPaths = new[]
            {
                $"/v3/vehicle_locations/{id}",
                $"/v2/vehicle_locations/{id}",
                $"/v1/vehicle_locations/{id}?date={date}",
                $"/v1/vehicle_locations?{id}?date={date}"
            };

            JsonElement? matched = null;
            foreach (var path in idPaths)
            {
                var result = await FetchMotivPayload(path, $"vehicle-locations-by-id:{id}", includeIncomingQuery: false);
                statusCode = result.StatusCode;
                if (!result.Success)
                    continue;

                var extracted = ExtractRows(result.Payload);
                if (extracted.Count > 0)
                {
                    matched = extracted[0];
                    break;
                }

                if (result.Payload.ValueKind == JsonValueKind.Object)
                {
                    matched = result.Payload.Clone();
                    break;
                }
            }

            if (matched.HasValue)
                rows.Add(matched.Value);
        }

        return (rows.Count > 0, rows.Count > 0 ? 200 : statusCode, rows.Count > 0 ? null : "Vehicle by-id location lookups returned no rows.", rows);
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

    private static List<string> GetJsonKeys(JsonElement? element, int max = 20)
    {
        if (!element.HasValue || element.Value.ValueKind != JsonValueKind.Object)
            return new List<string>();

        return element.Value.EnumerateObject()
            .Take(max)
            .Select(p => p.Name)
            .ToList();
    }

    private static DateTime? ParseDateOnly(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        if (DateTime.TryParse(input, out var dt)) return dt.Date;
        return null;
    }

    private static DateTime? ParseActivityLogDateBoundary(string? input, bool endOfDay)
    {
        var date = ParseDateOnly(input);
        if (!date.HasValue) return null;

        var boundary = endOfDay
            ? date.Value.Date.AddDays(1).AddTicks(-1)
            : date.Value.Date;

        return DateTime.SpecifyKind(boundary, DateTimeKind.Utc);
    }

    private static IEnumerable<string> BuildDateRangePaths(string basePath, DateTime start, DateTime end)
    {
        var startDate = start.ToString("yyyy-MM-dd");
        var endDate = end.ToString("yyyy-MM-dd");
        var startIso = start.ToString("O");
        var endIso = end.ToString("O");

        if (start.Date == end.Date)
            yield return basePath;
        yield return UpsertQueryParam(UpsertQueryParam(basePath, "start_date", startDate), "end_date", endDate);
        yield return UpsertQueryParam(UpsertQueryParam(basePath, "from_date", startDate), "to_date", endDate);
        yield return UpsertQueryParam(UpsertQueryParam(basePath, "start_time", startIso), "end_time", endIso);
        yield return UpsertQueryParam(UpsertQueryParam(basePath, "from", startIso), "to", endIso);
    }

    private async Task<Dictionary<string, string>> BuildMotiveDriverIdNameMap(string endpointPrefix)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var enriched = await FetchEnrichedDriverRows(endpointPrefix);
        if (!enriched.Success)
            return map;

        foreach (var row in enriched.Rows)
        {
            var user = PickNestedObject(row, "user") ?? row;
            var id = PickString(user, "id", "user_id", "driver_id");
            var (name, _) = ExtractDriverIdentity(user, row);
            if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(name))
                map[id.Trim()] = name.Trim();
        }

        return map;
    }

    private static void ResolveDriverAnalysisNames(
        IEnumerable<MotiveDriverAnalysisAccumulator> rows,
        IReadOnlyDictionary<string, string> motiveIdToName)
    {
        foreach (var acc in rows)
        {
            if (!string.IsNullOrWhiteSpace(acc.MotiveDriverId)
                && motiveIdToName.TryGetValue(acc.MotiveDriverId, out var resolvedName)
                && !string.IsNullOrWhiteSpace(resolvedName))
            {
                if (string.IsNullOrWhiteSpace(acc.DriverName) || acc.DriverName == "Unknown")
                    acc.DriverName = resolvedName;
            }
        }
    }

    private static string NormalizeDriverNameForMatch(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "";
        var normalized = Regex.Replace(name.Trim().ToLowerInvariant(), @"\s+", " ");
        normalized = Regex.Replace(normalized, @"\b(jr|sr|ii|iii|iv)\b\.?", "", RegexOptions.IgnoreCase).Trim();
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        return normalized;
    }

    private static string NormalizeDriverAnalysisKey(string? name, string? id)
    {
        var normalizedName = NormalizeDriverNameForMatch(name);
        if (!string.IsNullOrWhiteSpace(normalizedName))
            return $"name:{normalizedName}";
        if (!string.IsNullOrWhiteSpace(id))
            return $"id:{id.Trim()}";
        return Guid.NewGuid().ToString("N");
    }

    private static void ConsolidateDriverAnalysisAccumulators(Dictionary<string, MotiveDriverAnalysisAccumulator> map)
    {
        var merged = new Dictionary<string, MotiveDriverAnalysisAccumulator>(StringComparer.OrdinalIgnoreCase);
        foreach (var acc in map.Values)
        {
            var key = NormalizeDriverNameForMatch(acc.DriverName);
            if (string.IsNullOrWhiteSpace(key))
                key = string.IsNullOrWhiteSpace(acc.MotiveDriverId) ? acc.Key : $"id:{acc.MotiveDriverId}";

            if (!merged.TryGetValue(key, out var target))
            {
                merged[key] = acc;
                continue;
            }

            target.MotiveDriverId ??= acc.MotiveDriverId;
            target.MotiveOnline ??= acc.MotiveOnline;
            target.SafetyScore ??= acc.SafetyScore;
            target.CsaScore ??= acc.CsaScore;
            target.Mpg ??= acc.Mpg;
            target.IdlePercent ??= acc.IdlePercent;
            target.TotalMiles ??= acc.TotalMiles;
            target.HarshEventsPer1kMi ??= acc.HarshEventsPer1kMi;
            target.InspectionPassPercent ??= acc.InspectionPassPercent;
            target.CrashCount += acc.CrashCount;
            target.ViolationCount += acc.ViolationCount;
            target.HarshEvents += acc.HarshEvents;
            target.HardAccel += acc.HardAccel;
            target.HardBrake += acc.HardBrake;
            target.HardCorner += acc.HardCorner;
            target.HosViolations += acc.HosViolations;
            target.InspectionTotal += acc.InspectionTotal;
            target.InspectionPassed += acc.InspectionPassed;
            if (string.IsNullOrWhiteSpace(target.DriverName) || target.DriverName == "Unknown")
                target.DriverName = acc.DriverName;
        }

        map.Clear();
        foreach (var kv in merged)
            map[kv.Key] = kv.Value;
    }

    private static MotiveDriverAnalysisAccumulator GetOrCreateDriverAnalysisAccumulator(
        Dictionary<string, MotiveDriverAnalysisAccumulator> map,
        string? name,
        string? id)
    {
        var key = NormalizeDriverAnalysisKey(name, id);
        if (!map.TryGetValue(key, out var acc))
        {
            acc = new MotiveDriverAnalysisAccumulator
            {
                Key = key,
                DriverName = (name ?? id ?? "Unknown").Trim()
            };
            map[key] = acc;
        }

        if (!string.IsNullOrWhiteSpace(name))
            acc.DriverName = name.Trim();
        if (!string.IsNullOrWhiteSpace(id))
            acc.MotiveDriverId ??= id.Trim();
        return acc;
    }

    private static (string? Name, string? Id) ExtractDriverIdentity(JsonElement? driverElement, JsonElement fallback)
    {
        var driver = driverElement ?? fallback;
        if (driver.ValueKind != JsonValueKind.Object)
            driver = fallback;

        var first = PickString(driver, "first_name", "firstName");
        var last = PickString(driver, "last_name", "lastName");
        var name = BuildName(first, last, PickString(driver, "name", "full_name", "driver_name"));
        var id = PickString(driver, "id", "driver_id", "user_id");
        if (string.IsNullOrWhiteSpace(name))
            name = PickString(fallback, "driver_name", "name");
        if (string.IsNullOrWhiteSpace(id))
            id = PickString(fallback, "driver_id", "id");
        return (name, id);
    }

    private static void MergeScorecardAnalysisRow(Dictionary<string, MotiveDriverAnalysisAccumulator> map, JsonElement row)
    {
        var scorecard = PickNestedObject(row, "scorecard_summary");
        var rollup = PickNestedObject(row, "driver_performance_rollup")
            ?? (scorecard.HasValue ? PickNestedObject(scorecard.Value, "driver_performance_rollup") : null)
            ?? (scorecard.HasValue ? scorecard : null)
            ?? row;
        var driverObj = PickNestedObject(rollup, "driver") ?? PickNestedObject(row, "driver");
        var (name, id) = ExtractDriverIdentity(driverObj, rollup);
        if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(id))
            return;

        var acc = GetOrCreateDriverAnalysisAccumulator(map, name, id);
        acc.SafetyScore ??= PickDecimal(rollup, "safety_score", "driver_score", "score", "total_score");
        acc.CsaScore ??= PickDecimal(rollup, "csa_score", "csa", "safety_score", "driver_score", "total_score");
        acc.HardAccel += PickInt(rollup, "hard_accel", "hard_accelerations", "hard_acceleration_count", "hard_acceleration_events") ?? 0;
        acc.HardBrake += PickInt(rollup, "hard_brake", "hard_brakes", "hard_braking_count", "hard_braking_events", "hard_brake_events") ?? 0;
        acc.HardCorner += PickInt(rollup, "hard_corner", "hard_corners", "hard_cornering_count", "hard_cornering_events") ?? 0;
        acc.HarshEvents += PickInt(rollup, "harsh_events", "total_harsh_events", "harsh_event_count") ?? 0;
        acc.Mpg ??= PickDecimal(rollup, "mpg", "fuel_economy", "average_mpg", "avg_mpg", "fuel_economy_mpg");
        acc.IdlePercent ??= PickDecimal(rollup, "idle_percent", "idle_percentage", "idle_time_percent", "idle_time_percentage");
        acc.TotalMiles ??= PickDecimal(rollup, "total_miles", "miles_driven", "distance_miles", "total_distance", "distance_driven");
        acc.ViolationCount += PickInt(rollup, "violations", "violation_count", "coached_events", "coaching_events", "total_violations") ?? 0;
    }

    private static void MergeUtilizationAnalysisRow(Dictionary<string, MotiveDriverAnalysisAccumulator> map, JsonElement row)
    {
        var rollup = PickNestedObject(row, "driver_utilization_rollup")
            ?? PickNestedObject(row, "driver_idle_rollup")
            ?? PickNestedObject(row, "utilization_rollup")
            ?? row;
        var driverObj = PickNestedObject(rollup, "driver") ?? PickNestedObject(row, "driver");
        var (name, id) = ExtractDriverIdentity(driverObj, rollup);
        if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(id))
            return;

        var acc = GetOrCreateDriverAnalysisAccumulator(map, name, id);
        var idleSeconds = PickDecimal(rollup, "idle_time", "idle_duration", "idle_seconds", "total_idle_time");
        var driveSeconds = PickDecimal(rollup, "driving_time", "drive_time", "driving_duration", "total_drive_time");
        acc.Mpg ??= PickDecimal(rollup, "mpg", "fuel_economy", "average_mpg");
        acc.TotalMiles ??= PickDecimal(rollup, "total_miles", "miles_driven", "distance_miles");

        if (!acc.IdlePercent.HasValue && idleSeconds.HasValue && driveSeconds.HasValue)
        {
            var total = idleSeconds.Value + driveSeconds.Value;
            if (total > 0)
                acc.IdlePercent = Math.Round(idleSeconds.Value / total * 100m, 1);
        }
        else
        {
            acc.IdlePercent ??= PickDecimal(rollup, "idle_percent", "idle_percentage");
        }
    }

    private static void MergeHosViolationAnalysisRow(Dictionary<string, MotiveDriverAnalysisAccumulator> map, JsonElement row)
    {
        var violation = PickNestedObject(row, "hos_violation") ?? row;
        var driverObj = PickNestedObject(violation, "driver") ?? PickNestedObject(row, "driver");
        var (name, id) = ExtractDriverIdentity(driverObj, violation);
        if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(id))
            return;

        var acc = GetOrCreateDriverAnalysisAccumulator(map, name, id);
        acc.HosViolations++;
        acc.ViolationCount++;
    }

    private static void MergeSafetyAnalysisRow(Dictionary<string, MotiveDriverAnalysisAccumulator> map, JsonElement row)
    {
        var evt = PickNestedObject(row, "driver_performance_event") ?? PickNestedObject(row, "event") ?? row;
        var driverObj = PickNestedObject(evt, "driver") ?? PickNestedObject(row, "driver");
        var (name, id) = ExtractDriverIdentity(driverObj, evt);
        if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(id))
            return;

        var acc = GetOrCreateDriverAnalysisAccumulator(map, name, id);
        var eventType = (PickString(evt, "event_type", "type", "primary_behavior") ?? "").ToLowerInvariant();
        acc.HarshEvents++;
        if (eventType.Contains("crash") || eventType.Contains("collision"))
            acc.CrashCount++;
        if (eventType.Contains("violation") || eventType.Contains("speeding") || eventType.Contains("seatbelt"))
            acc.ViolationCount++;

        if (eventType.Contains("accel"))
            acc.HardAccel++;
        else if (eventType.Contains("brak"))
            acc.HardBrake++;
        else if (eventType.Contains("corner"))
            acc.HardCorner++;
    }

    private static void MergeInspectionAnalysisRow(Dictionary<string, MotiveDriverAnalysisAccumulator> map, JsonElement row)
    {
        var report = PickNestedObject(row, "inspection_report") ?? row;
        var driverObj = PickNestedObject(report, "driver") ?? PickNestedObject(row, "driver");
        var (name, id) = ExtractDriverIdentity(driverObj, report);
        if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(id))
            return;

        var acc = GetOrCreateDriverAnalysisAccumulator(map, name, id);
        acc.InspectionTotal++;
        var status = (PickString(report, "status", "result", "inspection_result") ?? "").ToLowerInvariant();
        if (status.Contains("pass") || status.Contains("satisfactory") || status.Contains("complete"))
            acc.InspectionPassed++;
    }

    private static void MergeLiveDriverAnalysisRow(Dictionary<string, MotiveDriverAnalysisAccumulator> map, JsonElement row)
    {
        var user = PickNestedObject(row, "user") ?? row;
        var (name, id) = ExtractDriverIdentity(user, row);
        if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(id))
            return;

        var acc = GetOrCreateDriverAnalysisAccumulator(map, name, id);
        var statusRaw = PickString(row, "status") ?? PickString(user, "status") ?? "";
        var online = statusRaw.Contains("on", StringComparison.OrdinalIgnoreCase)
            || statusRaw.Contains("drive", StringComparison.OrdinalIgnoreCase)
            || statusRaw.Contains("active", StringComparison.OrdinalIgnoreCase);
        acc.MotiveOnline = online;
    }

    private static void FinalizeDriverAnalysisMetrics(IEnumerable<MotiveDriverAnalysisAccumulator> rows)
    {
        foreach (var acc in rows)
        {
            if (acc.HarshEvents <= 0)
                acc.HarshEvents = acc.HardAccel + acc.HardBrake + acc.HardCorner;

            if (acc.TotalMiles.GetValueOrDefault() > 0 && acc.HarshEvents > 0)
                acc.HarshEventsPer1kMi = Math.Round(acc.HarshEvents / (acc.TotalMiles!.Value / 1000m), 2);
            else if (acc.HarshEvents > 0 && !acc.HarshEventsPer1kMi.HasValue)
                acc.HarshEventsPer1kMi = acc.HarshEvents;

            if (acc.InspectionTotal > 0)
                acc.InspectionPassPercent = Math.Round(acc.InspectionPassed * 100m / acc.InspectionTotal, 0);

            acc.CrashRate = acc.CrashCount;
            acc.ViolationRate = acc.ViolationCount;
            if (!acc.CsaScore.HasValue)
                acc.CsaScore = acc.SafetyScore;
        }
    }

    private sealed class MotiveDriverAnalysisAccumulator
    {
        public string Key { get; set; } = "";
        public string DriverName { get; set; } = "";
        public string? MotiveDriverId { get; set; }
        public bool? MotiveOnline { get; set; }
        public decimal? SafetyScore { get; set; }
        public decimal? CsaScore { get; set; }
        public int CrashCount { get; set; }
        public int ViolationCount { get; set; }
        public int HarshEvents { get; set; }
        public int HardAccel { get; set; }
        public int HardBrake { get; set; }
        public int HardCorner { get; set; }
        public decimal? Mpg { get; set; }
        public decimal? IdlePercent { get; set; }
        public decimal? TotalMiles { get; set; }
        public decimal? HarshEventsPer1kMi { get; set; }
        public int HosViolations { get; set; }
        public int InspectionTotal { get; set; }
        public int InspectionPassed { get; set; }
        public decimal? InspectionPassPercent { get; set; }
        public decimal? CrashRate { get; set; }
        public decimal? ViolationRate { get; set; }
    }

    private static void AppendDebugLog(string runId, string hypothesisId, string location, string message, object data)
    {
        try
        {
            var payload = new
            {
                sessionId = "ff188a",
                runId,
                hypothesisId,
                location,
                message,
                data,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
            var line = JsonSerializer.Serialize(payload) + Environment.NewLine;
            System.IO.File.AppendAllText(@"C:\Users\atayl\Desktop\taylor-access.com\debug-ff188a.log", line);
        }
        catch
        {
            // Debug logging must never break API execution.
        }
    }
}

public class MotivProbeMethodRequest
{
    public string? Path { get; set; }
    public string? Method { get; set; }
}

public class MotivActivityLogRequest
{
    public string? Kind { get; set; }
    public string? Title { get; set; }
    public string? DriverName { get; set; }
    public string? Details { get; set; }
    public string? PreviousLocation { get; set; }
    public string? CurrentLocation { get; set; }
    public DateTime? Timestamp { get; set; }
}

public class MotivDriverSnapshotBatchRequest
{
    public DateTime? CapturedAt { get; set; }
    public List<MotivDriverSnapshotActivityRequest> Rows { get; set; } = new();
}

public class MotivDriverSnapshotActivityRequest
{
    public string? DriverName { get; set; }
    public string? Status { get; set; }
    public string? Vehicle { get; set; }
    public string? Location { get; set; }
}

