using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

/// <summary>
/// Builds and parses the system-generated Escrow and Deductions acknowledgment form
/// stored on <see cref="DriverDocument"/> for T-Tac Driver.
/// </summary>
public class EscrowAcknowledgmentService
{
    public const string ContentType = "application/vnd.ttac.escrow-ack+json";
    public const string FileName = "escrow-deductions-acknowledgment.json";
    public const string FormType = "escrow_deduction_ack";
    public const string DocumentKey = "escrowDeductionSignup";
    public const string Category = "escrow_deduction";
    public const string SubCategory = "escrow_deduction_signup";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<EscrowAcknowledgmentService> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false
    };

    public EscrowAcknowledgmentService(
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        ILogger<EscrowAcknowledgmentService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
        _logger = logger;
    }

    public static bool IsEscrowFormContentType(string? contentType) =>
        string.Equals(contentType, ContentType, StringComparison.OrdinalIgnoreCase);

    public static bool IsEscrowDocumentKey(string? key) =>
        string.Equals(key?.Trim(), DocumentKey, StringComparison.OrdinalIgnoreCase);

    public async Task<EscrowAckForm> BuildFormAsync(Driver driver, CancellationToken cancellationToken = default)
    {
        var escrows = await FetchEscrowTemplatesAsync(cancellationToken);
        var deductions = await FetchDeductionTypesAsync(cancellationToken);

        return new EscrowAckForm
        {
            Version = 1,
            FormType = FormType,
            Title = "Escrow and Deductions Acknowledgment",
            DriverId = driver.Id,
            DriverName = driver.Name,
            OrganizationId = driver.OrganizationId,
            RequestedAt = DateTime.UtcNow,
            Status = "pending",
            Escrows = escrows,
            Deductions = deductions,
            SelectedEscrowIds = new List<int>(),
            SelectedDeductionIds = new List<int>()
        };
    }

    public string SerializeToBase64(EscrowAckForm form)
    {
        var json = JsonSerializer.Serialize(form, JsonOptions);
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
    }

    public EscrowAckForm? TryParse(DriverDocument doc)
    {
        if (doc.FileContent == null) return null;
        try
        {
            var bytes = Convert.FromBase64String(doc.FileContent);
            var json = Encoding.UTF8.GetString(bytes);
            return JsonSerializer.Deserialize<EscrowAckForm>(json, JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse escrow acknowledgment document {DocId}", doc.Id);
            return null;
        }
    }

    public void ApplyToDocument(DriverDocument doc, EscrowAckForm form)
    {
        var payload = SerializeToBase64(form);
        doc.FileContent = payload;
        doc.FileName = FileName;
        doc.ContentType = ContentType;
        doc.FileSize = Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(form, JsonOptions));
        doc.DocumentName = form.Title;
        doc.Category = Category;
        doc.SubCategory = SubCategory;
        doc.Status = form.Status == "signed" ? "active" : "pending";
        doc.UpdatedAt = DateTime.UtcNow;
    }

    public async Task AssignSelectedEscrowsAsync(
        int driverSourceId,
        string? driverName,
        IEnumerable<int> escrowTemplateIds,
        CancellationToken cancellationToken = default)
    {
        var ids = escrowTemplateIds.Where(id => id > 0).Distinct().ToList();
        if (ids.Count == 0) return;

        var client = CreateAccountingClient();
        var baseUrl = AccountingBaseUrl;
        foreach (var id in ids)
        {
            try
            {
                var body = JsonSerializer.Serialize(new
                {
                    driverSourceId,
                    driverName
                }, JsonOptions);
                using var content = new StringContent(body, Encoding.UTF8, "application/json");
                using var response = await client.PostAsync(
                    $"{baseUrl}/api/v1/internal/escrow-templates/{id}/assign-driver",
                    content,
                    cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    var err = await response.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogWarning(
                        "Escrow assign failed for template {TemplateId} driver {DriverId}: {Status} {Body}",
                        id, driverSourceId, response.StatusCode, err);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Escrow assign exception for template {TemplateId}", id);
            }
        }
    }

    private string AccountingBaseUrl
    {
        get
        {
            // Prefer private Railway mesh or gateway — Accounting blocks public *.up.railway.app ingress.
            var configured = (_config["Accounting:ApiUrl"]
                ?? Environment.GetEnvironmentVariable("ACCOUNTING_API_URL")
                ?? Environment.GetEnvironmentVariable("TAYLOR_ACCOUNTING_API_URL")
                ?? Environment.GetEnvironmentVariable("ACCOUNTING_PRIVATE_URL")
                ?? "").Trim().TrimEnd('/');

            if (!string.IsNullOrWhiteSpace(configured)
                && !configured.Contains(".up.railway.app", StringComparison.OrdinalIgnoreCase))
                return configured;

            // Service-to-service via TTAC Gateway (adds open route → Accounting private mesh).
            var gateway = (_config["GATEWAY_INTERNAL_URL"]
                ?? Environment.GetEnvironmentVariable("GATEWAY_INTERNAL_URL")
                ?? "").Trim().TrimEnd('/');
            if (!string.IsNullOrWhiteSpace(gateway))
                return $"{gateway}/api/v1/open/taylor-accounting";

            var privateHost = (_config["RAILWAY_SERVICE_TAYLOR_ACCOUNTING_NET_PRIVATE"]
                ?? Environment.GetEnvironmentVariable("RAILWAY_SERVICE_TAYLOR_ACCOUNTING_NET_PRIVATE")
                ?? "gentle-joy.railway.internal").Trim().TrimEnd('/');
            if (!privateHost.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                privateHost = $"http://{privateHost}";
            try
            {
                var uri = new Uri(privateHost);
                if (uri.IsDefaultPort)
                    privateHost = $"{uri.Scheme}://{uri.Host}:8080";
            }
            catch
            {
                privateHost = "http://gentle-joy.railway.internal:8080";
            }

            return privateHost;
        }
    }

    private string ServiceKey =>
        _config["INTERNAL_SERVICE_KEY"]
        ?? Environment.GetEnvironmentVariable("INTERNAL_SERVICE_KEY")
        ?? Environment.GetEnvironmentVariable("TTAC_INTERNAL_SERVICE_KEY")
        ?? "ta-internal-service-key-2026";

    private HttpClient CreateAccountingClient()
    {
        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Remove("X-Service-Key");
        client.DefaultRequestHeaders.Remove("X-Internal-Key");
        client.DefaultRequestHeaders.TryAddWithoutValidation("X-Service-Key", ServiceKey);
        client.DefaultRequestHeaders.TryAddWithoutValidation("X-Internal-Key", ServiceKey);
        client.Timeout = TimeSpan.FromSeconds(30);
        return client;
    }

    private async Task<List<EscrowAckOption>> FetchEscrowTemplatesAsync(CancellationToken cancellationToken)
    {
        try
        {
            var client = CreateAccountingClient();
            using var response = await client.GetAsync(
                $"{AccountingBaseUrl}/api/v1/internal/escrow-templates?partyType=driver",
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Escrow templates fetch failed: {Status}", response.StatusCode);
                return new List<EscrowAckOption>();
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return new List<EscrowAckOption>();

            var list = new List<EscrowAckOption>();
            foreach (var row in data.EnumerateArray())
            {
                var id = row.TryGetProperty("id", out var idEl) ? idEl.GetInt32() : 0;
                if (id <= 0) continue;
                list.Add(new EscrowAckOption
                {
                    Id = id,
                    Name = ReadString(row, "name") ?? "Escrow",
                    Description = ReadString(row, "description"),
                    Amount = ReadDecimal(row, "amount"),
                    Percentage = ReadDecimal(row, "percentage"),
                    DepositType = ReadString(row, "depositType"),
                    AccountCode = ReadString(row, "accountCode")
                });
            }

            return list;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load escrow templates from Accounting");
            return new List<EscrowAckOption>();
        }
    }

    private async Task<List<DeductionAckOption>> FetchDeductionTypesAsync(CancellationToken cancellationToken)
    {
        try
        {
            var client = CreateAccountingClient();
            using var response = await client.GetAsync(
                $"{AccountingBaseUrl}/api/v1/internal/deduction-types",
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Deduction types fetch failed: {Status}", response.StatusCode);
                return new List<DeductionAckOption>();
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return new List<DeductionAckOption>();

            var list = new List<DeductionAckOption>();
            foreach (var row in data.EnumerateArray())
            {
                var id = row.TryGetProperty("id", out var idEl) ? idEl.GetInt32() : 0;
                if (id <= 0) continue;
                list.Add(new DeductionAckOption
                {
                    Id = id,
                    Key = ReadString(row, "key") ?? "",
                    Label = ReadString(row, "label") ?? "Deduction",
                    Description = ReadString(row, "description"),
                    Amount = ReadDecimal(row, "amount"),
                    Frequency = ReadString(row, "frequency"),
                    Kind = ReadString(row, "kind"),
                    VendorCategory = ReadString(row, "vendorCategory")
                });
            }

            return list;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load deduction types from Accounting");
            return new List<DeductionAckOption>();
        }
    }

    private static string? ReadString(JsonElement row, string name) =>
        row.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String
            ? el.GetString()
            : null;

    private static decimal? ReadDecimal(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var el)) return null;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDecimal(out var d)) return d;
        if (el.ValueKind == JsonValueKind.String && decimal.TryParse(el.GetString(), out var parsed))
            return parsed;
        return null;
    }
}

public sealed class EscrowAckForm
{
    public int Version { get; set; } = 1;
    public string FormType { get; set; } = EscrowAcknowledgmentService.FormType;
    public string Title { get; set; } = "Escrow and Deductions Acknowledgment";
    public int DriverId { get; set; }
    public string? DriverName { get; set; }
    public int OrganizationId { get; set; }
    public DateTime RequestedAt { get; set; }
    public string Status { get; set; } = "pending"; // pending | signed
    public List<EscrowAckOption> Escrows { get; set; } = new();
    public List<DeductionAckOption> Deductions { get; set; } = new();
    public List<int> SelectedEscrowIds { get; set; } = new();
    public List<int> SelectedDeductionIds { get; set; } = new();
    public string? SignatureData { get; set; }
    public DateTime? SignedAt { get; set; }
    public string? SignedByName { get; set; }
}

public sealed class EscrowAckOption
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public decimal? Amount { get; set; }
    public decimal? Percentage { get; set; }
    public string? DepositType { get; set; }
    public string? AccountCode { get; set; }
}

public sealed class DeductionAckOption
{
    public int Id { get; set; }
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public string? Description { get; set; }
    public decimal? Amount { get; set; }
    public string? Frequency { get; set; }
    public string? Kind { get; set; }
    public string? VendorCategory { get; set; }
}

public sealed class EscrowAckSubmitRequest
{
    public List<int>? SelectedEscrowIds { get; set; }
    public List<int>? SelectedDeductionIds { get; set; }
    public string? SignatureData { get; set; }
    public string? SignedByName { get; set; }
}
