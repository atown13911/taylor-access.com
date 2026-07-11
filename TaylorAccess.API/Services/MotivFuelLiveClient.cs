using System.Globalization;
using System.Text.Json;

namespace TaylorAccess.API.Services;

public sealed class MotivFuelLiveClient
{
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<MotivFuelLiveClient> _logger;

    public MotivFuelLiveClient(
        IConfiguration config,
        IHttpClientFactory httpClientFactory,
        ILogger<MotivFuelLiveClient> logger)
    {
        _config = config;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<MotivFuelLiveResult> FetchTransactionsAsync(
        DateTime from,
        DateTime to,
        CancellationToken ct = default)
    {
        var creds = ResolveCredentials();
        if (string.IsNullOrWhiteSpace(creds.ApiKey) || string.IsNullOrWhiteSpace(creds.BaseUrl))
        {
            return new MotivFuelLiveResult
            {
                Connected = false,
                Warning = "MOTIV_API_KEY or MOTIV_API_BASE_URL is not configured."
            };
        }

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(45);

        var candidateRoots = new[]
        {
            _config["MOTIV_FUEL_PURCHASES_PATH"] ?? Environment.GetEnvironmentVariable("MOTIV_FUEL_PURCHASES_PATH"),
            "/v1/fuel_purchases",
            _config["MOTIV_CARD_TRANSACTIONS_PATH"] ?? Environment.GetEnvironmentVariable("MOTIV_CARD_TRANSACTIONS_PATH"),
            "/motive_card/v2/transactions",
            "/motive_card/v1/transactions"
        };

        var paths = BuildDateFilteredPaths(candidateRoots, from, to).ToList();
        var records = new List<MotivFuelLiveRecord>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void AddRecords(IEnumerable<MotivFuelLiveRecord> rows)
        {
            foreach (var record in rows)
            {
                if (record == null)
                    continue;
                if (record.TransactionDate.HasValue
                    && (record.TransactionDate.Value.Date < from || record.TransactionDate.Value.Date > to))
                {
                    continue;
                }

                var key = record.TransactionId
                    ?? $"{record.TransactionDate:O}|{record.DriverName}|{record.MerchantName}|{record.Amount:F2}";
                if (!seen.Add(key))
                    continue;

                records.Add(record);
            }
        }

        if ((to - from).TotalDays > 45)
        {
            var cursor = new DateTime(from.Year, from.Month, 1);
            while (cursor <= to)
            {
                var monthStart = cursor < from ? from : cursor;
                var monthEnd = new DateTime(cursor.Year, cursor.Month, DateTime.DaysInMonth(cursor.Year, cursor.Month));
                if (monthEnd > to)
                    monthEnd = to;

                AddRecords(await FetchRecordsForPeriodAsync(client, creds, candidateRoots, monthStart, monthEnd, ct));
                cursor = cursor.AddMonths(1);
            }
        }
        else
        {
            AddRecords(await FetchRecordsForPeriodAsync(client, creds, candidateRoots, from, to, ct));
        }

        if (records.Count == 0)
            AddRecords(await FetchRecordsUnfilteredAsync(client, creds, candidateRoots, from, to, ct));

        if (records.Count > 0)
            await EnrichDriverVehicleLookupsAsync(client, creds, records, ct);

        return new MotivFuelLiveResult
        {
            Connected = true,
            Records = records
        };
    }

    private async Task<List<MotivFuelLiveRecord>> FetchRecordsForPeriodAsync(
        HttpClient client,
        MotivCredentials creds,
        string?[] candidateRoots,
        DateTime from,
        DateTime to,
        CancellationToken ct)
    {
        var records = new List<MotivFuelLiveRecord>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var path in BuildDateFilteredPaths(candidateRoots, from, to))
        {
            var pageRows = await FetchAllPagesAsync(client, creds, path, ct);
            if (pageRows.Count == 0)
                continue;

            foreach (var element in pageRows)
            {
                var record = ParseRecord(element);
                if (record == null)
                    continue;

                var key = record.TransactionId
                    ?? $"{record.TransactionDate:O}|{record.DriverName}|{record.MerchantName}|{record.Amount:F2}";
                if (!seen.Add(key))
                    continue;

                records.Add(record);
            }
        }

        return records;
    }

    private async Task<List<MotivFuelLiveRecord>> FetchRecordsUnfilteredAsync(
        HttpClient client,
        MotivCredentials creds,
        string?[] candidateRoots,
        DateTime from,
        DateTime to,
        CancellationToken ct)
    {
        var records = new List<MotivFuelLiveRecord>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var root in candidateRoots.Where(r => !string.IsNullOrWhiteSpace(r)).Select(r => r!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var pageRows = await FetchAllPagesAsync(client, creds, root, ct, maxPages: 200);
            if (pageRows.Count == 0)
                continue;

            foreach (var element in pageRows)
            {
                var record = ParseRecord(element);
                if (record == null)
                    continue;
                if (record.TransactionDate.HasValue
                    && (record.TransactionDate.Value.Date < from || record.TransactionDate.Value.Date > to))
                {
                    continue;
                }

                var key = record.TransactionId
                    ?? $"{record.TransactionDate:O}|{record.DriverName}|{record.MerchantName}|{record.Amount:F2}";
                if (!seen.Add(key))
                    continue;

                records.Add(record);
            }
        }

        return records;
    }

    private async Task EnrichDriverVehicleLookupsAsync(
        HttpClient client,
        MotivCredentials creds,
        List<MotivFuelLiveRecord> records,
        CancellationToken ct)
    {
        var needDriver = records.Any(r => string.IsNullOrWhiteSpace(r.DriverName) && !string.IsNullOrWhiteSpace(r.DriverId));
        var needVehicle = records.Any(r => string.IsNullOrWhiteSpace(r.TruckNumber) && !string.IsNullOrWhiteSpace(r.VehicleId));
        if (!needDriver && !needVehicle)
            return;

        var driverMap = needDriver
            ? await BuildUserLookupAsync(client, creds, ct)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var vehicleMap = needVehicle
            ? await BuildVehicleLookupAsync(client, creds, ct)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var record in records)
        {
            if (string.IsNullOrWhiteSpace(record.DriverName)
                && !string.IsNullOrWhiteSpace(record.DriverId)
                && driverMap.TryGetValue(record.DriverId, out var driverName))
            {
                record.DriverName = driverName;
            }

            if (string.IsNullOrWhiteSpace(record.TruckNumber)
                && !string.IsNullOrWhiteSpace(record.VehicleId)
                && vehicleMap.TryGetValue(record.VehicleId, out var truckNumber))
            {
                record.TruckNumber = truckNumber;
            }
        }
    }

    private async Task<Dictionary<string, string>> BuildUserLookupAsync(
        HttpClient client,
        MotivCredentials creds,
        CancellationToken ct)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in await FetchAllPagesAsync(client, creds, "/v1/users", ct))
        {
            var user = PickObject(row, "user") ?? row;
            var id = TryGetString(user, "id");
            var name = BuildName(
                TryGetString(user, "first_name"),
                TryGetString(user, "last_name"),
                TryGetString(user, "name"));
            if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(name))
                map[id] = name;
        }

        return map;
    }

    private async Task<Dictionary<string, string>> BuildVehicleLookupAsync(
        HttpClient client,
        MotivCredentials creds,
        CancellationToken ct)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in await FetchAllPagesAsync(client, creds, "/v1/vehicles", ct))
        {
            var vehicle = PickObject(row, "vehicle") ?? row;
            var id = TryGetString(vehicle, "id");
            var number = FirstNonEmpty(
                TryGetString(vehicle, "number"),
                TryGetString(vehicle, "unit_number"),
                TryGetString(vehicle, "fleet_number"));
            if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(number))
                map[id] = number;
        }

        return map;
    }

    private async Task<List<JsonElement>> FetchAllPagesAsync(
        HttpClient client,
        MotivCredentials creds,
        string path,
        CancellationToken ct,
        int maxPages = 100)
    {
        var allRows = new List<JsonElement>();
        for (var pageNo = 1; pageNo <= maxPages; pageNo++)
        {
            var pagedPath = BuildPagedPath(path, pageNo, 100);
            var requestUri = BuildUri(creds.BaseUrl, pagedPath);
            using var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
            request.Headers.TryAddWithoutValidation("x-api-key", creds.ApiKey);
            request.Headers.TryAddWithoutValidation("Accept", "application/json");

            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode)
            {
                if (pageNo == 1)
                    _logger.LogDebug("Motive fuel live fetch failed for {Path}: {Status}", path, (int)response.StatusCode);
                break;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var rows = ExtractRows(doc.RootElement);
            if (rows.Count == 0)
                break;

            allRows.AddRange(rows);
            if (!HasNextPage(doc.RootElement, rows.Count, 100))
                break;
        }

        return allRows;
    }

    private MotivCredentials ResolveCredentials()
    {
        var apiKey = FirstNonEmpty(
            _config["MOTIV_API_KEY"],
            Environment.GetEnvironmentVariable("MOTIV_API_KEY"));
        var baseUrl = FirstNonEmpty(
            _config["MOTIV_API_BASE_URL"],
            Environment.GetEnvironmentVariable("MOTIV_API_BASE_URL"));
        return new MotivCredentials(apiKey ?? string.Empty, baseUrl ?? string.Empty);
    }

    private static MotivFuelLiveRecord? ParseRecord(JsonElement item)
    {
        var payload =
            PickObject(item, "fuel_purchase")
            ?? PickObject(item, "transaction")
            ?? PickObject(item, "card_transaction")
            ?? item;

        var merchant =
            PickObject(payload, "merchant_info")
            ?? PickObject(payload, "merchant")
            ?? PickObject(item, "merchant");
        var driver = PickObject(payload, "driver") ?? PickObject(item, "driver");
        var vehicle = PickObject(payload, "vehicle") ?? PickObject(item, "vehicle");

        var transactionTime = ParseDateTime(
            TryGetString(payload, "transaction_time")
            ?? TryGetString(payload, "posted_at")
            ?? TryGetString(payload, "purchased_at")
            ?? TryGetString(item, "transaction_time")
            ?? TryGetString(item, "posted_at"));

        return new MotivFuelLiveRecord
        {
            TransactionId = FirstNonEmpty(
                TryGetString(payload, "id"),
                TryGetString(payload, "transaction_id"),
                TryGetString(item, "id"),
                TryGetString(item, "transaction_id")),
            Amount = ParseAmount(payload) != 0m ? ParseAmount(payload) : ParseAmount(item),
            DriverName = FirstNonEmpty(
                BuildName(TryGetString(driver, "first_name"), TryGetString(driver, "last_name"), TryGetString(driver, "name")),
                TryGetString(item, "driver_name")),
            MerchantName = FirstNonEmpty(
                TryGetString(payload, "vendor"),
                TryGetString(merchant, "name"),
                TryGetString(merchant, "merchant_name"),
                TryGetString(item, "merchant_name")),
            TruckNumber = FirstNonEmpty(
                TryGetString(vehicle, "number"),
                TryGetString(vehicle, "unit_number"),
                TryGetString(driver, "driver_company_id"),
                TryGetString(item, "vehicle_number"),
                TryGetString(item, "truck_number"),
                TryGetString(item, "unit")),
            DriverId = FirstNonEmpty(
                TryGetString(payload, "driver_id"),
                TryGetString(driver, "id")),
            VehicleId = FirstNonEmpty(
                TryGetString(payload, "vehicle_id"),
                TryGetString(vehicle, "id")),
            Status = FirstNonEmpty(
                TryGetString(payload, "transaction_status"),
                TryGetString(payload, "status"),
                TryGetString(item, "status")),
            TransactionDate = transactionTime
        };
    }

    private static IEnumerable<string> BuildDateFilteredPaths(IEnumerable<string?> roots, DateTime from, DateTime to)
    {
        var startDate = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var endDate = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var startIso = from.ToString("O", CultureInfo.InvariantCulture);
        var endIso = to.ToString("O", CultureInfo.InvariantCulture);

        foreach (var root in roots.Where(r => !string.IsNullOrWhiteSpace(r)).Select(r => r!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            yield return root;
            yield return UpsertQueryParam(UpsertQueryParam(root, "start_date", startDate), "end_date", endDate);
            yield return UpsertQueryParam(UpsertQueryParam(root, "from_date", startDate), "to_date", endDate);
            yield return UpsertQueryParam(UpsertQueryParam(root, "start_time", startIso), "end_time", endIso);
            yield return UpsertQueryParam(UpsertQueryParam(root, "from", startDate), "to", endDate);
        }
    }

    private static List<JsonElement> ExtractRows(JsonElement payload)
    {
        if (payload.ValueKind == JsonValueKind.Array)
            return payload.EnumerateArray().Select(x => x.Clone()).ToList();
        if (payload.ValueKind != JsonValueKind.Object)
            return [];

        foreach (var key in new[] { "fuel_purchases", "transactions", "users", "vehicles", "data", "items", "results" })
        {
            if (payload.TryGetProperty(key, out var arr) && arr.ValueKind == JsonValueKind.Array)
                return arr.EnumerateArray().Select(x => x.Clone()).ToList();
        }

        return [];
    }

    private static bool HasNextPage(JsonElement payload, int currentCount, int perPage) =>
        currentCount >= perPage;

    private static string BuildPagedPath(string basePath, int pageNo, int perPage)
    {
        var withPerPage = UpsertQueryParam(basePath, "per_page", perPage.ToString(CultureInfo.InvariantCulture));
        return UpsertQueryParam(withPerPage, "page_no", pageNo.ToString(CultureInfo.InvariantCulture));
    }

    private static string BuildUri(string baseUrl, string path)
    {
        var normalizedBase = baseUrl.TrimEnd('/');
        var normalizedPath = path.StartsWith('/') ? path : $"/{path}";
        return $"{normalizedBase}{normalizedPath}";
    }

    private static string UpsertQueryParam(string path, string key, string value)
    {
        var marker = $"{Uri.EscapeDataString(key)}={Uri.EscapeDataString(value)}";
        var questionIndex = path.IndexOf('?', StringComparison.Ordinal);
        if (questionIndex < 0)
            return $"{path}?{marker}";

        var basePath = path[..questionIndex];
        var query = path[(questionIndex + 1)..];
        var segments = query.Split('&', StringSplitOptions.RemoveEmptyEntries);
        var rewritten = new List<string>();
        var replaced = false;
        foreach (var segment in segments)
        {
            var eq = segment.IndexOf('=');
            var segmentKey = eq >= 0 ? segment[..eq] : segment;
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

    private static JsonElement? PickObject(JsonElement source, string propertyName)
    {
        if (source.ValueKind != JsonValueKind.Object)
            return null;
        return source.TryGetProperty(propertyName, out var obj) && obj.ValueKind == JsonValueKind.Object ? obj : null;
    }

    private static decimal ParseAmount(JsonElement item)
    {
        foreach (var key in new[] { "total_cost", "total_amount", "amount", "authorized_amount" })
        {
            if (!item.TryGetProperty(key, out var value))
                continue;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number))
                return number;
            if (value.ValueKind == JsonValueKind.String
                && decimal.TryParse(value.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
                return parsed;
        }
        return 0m;
    }

    private static DateTime? ParseDateTime(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null
        : DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed) ? parsed : null;

    private static string BuildName(string? first, string? last, string? fallback)
    {
        var combined = $"{first ?? ""} {last ?? ""}".Trim();
        return !string.IsNullOrWhiteSpace(combined) ? combined : (fallback ?? string.Empty).Trim();
    }

    private static string? TryGetString(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var value))
            return null;
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.GetRawText(),
            _ => null
        };
    }

    private static string? TryGetString(JsonElement? element, string name) =>
        element.HasValue ? TryGetString(element.Value, name) : null;

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }
        return null;
    }

    private sealed record MotivCredentials(string ApiKey, string BaseUrl);
}

public sealed class MotivFuelLiveResult
{
    public bool Connected { get; init; }
    public string? Warning { get; init; }
    public IReadOnlyList<MotivFuelLiveRecord> Records { get; init; } = Array.Empty<MotivFuelLiveRecord>();
}

public sealed class MotivFuelLiveRecord
{
    public string? TransactionId { get; init; }
    public decimal Amount { get; init; }
    public string? DriverName { get; set; }
    public string? MerchantName { get; init; }
    public string? TruckNumber { get; set; }
    public string? DriverId { get; init; }
    public string? VehicleId { get; init; }
    public string? Status { get; init; }
    public DateTime? TransactionDate { get; init; }
}
