using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public sealed class CrmIntegrationCopyResult
{
    public bool Success { get; init; }
    public int Inserted { get; init; }
    public int Updated { get; init; }
    public int Skipped { get; init; }
    public string? Error { get; init; }
    public IReadOnlyList<string> Types { get; init; } = Array.Empty<string>();
    public string? Source { get; init; }
}

public class CrmIntegrationCopyService
{
    private static readonly string[] CopyTypes = ["gmail", "gmail-domain", "zoom"];

    private readonly TaylorAccessDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<CrmIntegrationCopyService> _logger;

    public CrmIntegrationCopyService(
        TaylorAccessDbContext context,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<CrmIntegrationCopyService> logger)
    {
        _context = context;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<CrmIntegrationCopyResult> CopyFromCrmAsync(CancellationToken cancellationToken = default)
    {
        var httpResult = await TryCopyFromCrmHttpAsync(cancellationToken);
        if (httpResult.Success && httpResult.Inserted + httpResult.Updated > 0)
            return httpResult;

        var conn = CrmDbConnectionResolver.Resolve(_configuration);
        if (string.IsNullOrWhiteSpace(conn))
        {
            return httpResult.Success == false && !string.IsNullOrWhiteSpace(httpResult.Error)
                ? httpResult
                : new CrmIntegrationCopyResult
                {
                    Success = false,
                    Error = httpResult.Error ?? "CRM export and database copy are both unavailable."
                };
        }

        List<CrmIntegrationRow> rows;
        try
        {
            rows = await ReadCrmIntegrationRowsAsync(conn, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed reading IntegrationConfigs from CRM database");
            return new CrmIntegrationCopyResult
            {
                Success = false,
                Error = $"Unable to read CRM IntegrationConfigs: {ex.Message}",
                Source = "crm-database"
            };
        }

        if (rows.Count == 0)
        {
            return new CrmIntegrationCopyResult
            {
                Success = true,
                Skipped = 0,
                Types = CopyTypes,
                Source = "crm-database",
                Error = httpResult.Error ?? "No gmail/gmail-domain/zoom integration rows found in CRM database."
            };
        }

        return await UpsertRowsAsync(rows, "crm-database", cancellationToken);
    }

    private async Task<CrmIntegrationCopyResult> TryCopyFromCrmHttpAsync(CancellationToken cancellationToken)
    {
        var internalKey = Environment.GetEnvironmentVariable("INTERNAL_SERVICE_KEY")
            ?? Environment.GetEnvironmentVariable("INTERNAL_API_KEY");
        if (string.IsNullOrWhiteSpace(internalKey))
        {
            return new CrmIntegrationCopyResult
            {
                Success = false,
                Error = "INTERNAL_API_KEY is not configured for CRM integration export.",
                Source = "crm-http"
            };
        }

        var baseUrl = Environment.GetEnvironmentVariable("TAYLOR_CRM_INTERNAL_URL")
            ?? "http://taylor-crm.railway.internal:8080";
        var url = $"{baseUrl.TrimEnd('/')}/api/v1/internal/integrations/export";

        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);
            client.DefaultRequestHeaders.TryAddWithoutValidation("X-Internal-Key", internalKey.Trim());
            client.DefaultRequestHeaders.TryAddWithoutValidation("X-Service-Key", internalKey.Trim());

            using var response = await client.GetAsync(url, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return new CrmIntegrationCopyResult
                {
                    Success = false,
                    Error = $"CRM integration export returned HTTP {(int)response.StatusCode}: {body[..Math.Min(body.Length, 180)]}",
                    Source = "crm-http"
                };
            }

            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
            {
                return new CrmIntegrationCopyResult
                {
                    Success = false,
                    Error = "CRM integration export returned no data array.",
                    Source = "crm-http"
                };
            }

            var rows = JsonSerializer.Deserialize<List<CrmIntegrationRow>>(data.GetRawText(), JsonOptions) ?? [];
            if (rows.Count == 0)
            {
                return new CrmIntegrationCopyResult
                {
                    Success = true,
                    Source = "crm-http",
                    Error = "CRM integration export returned zero rows."
                };
            }

            return await UpsertRowsAsync(rows, "crm-http", cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "CRM integration HTTP export failed for {Url}", url);
            return new CrmIntegrationCopyResult
            {
                Success = false,
                Error = $"CRM integration export failed: {ex.Message}",
                Source = "crm-http"
            };
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private async Task<CrmIntegrationCopyResult> UpsertRowsAsync(
        List<CrmIntegrationRow> rows,
        string source,
        CancellationToken cancellationToken)
    {
        var inserted = 0;
        var updated = 0;
        var now = DateTime.UtcNow;

        foreach (var row in rows)
        {
            var existing = await _context.IntegrationConfigs
                .FirstOrDefaultAsync(
                    c => c.OrganizationId == row.OrganizationId && c.IntegrationType == row.IntegrationType,
                    cancellationToken);

            if (existing == null)
            {
                _context.IntegrationConfigs.Add(new IntegrationConfig
                {
                    OrganizationId = row.OrganizationId,
                    IntegrationType = row.IntegrationType,
                    Provider = row.Provider,
                    DisplayName = row.DisplayName,
                    EncryptedApiKey = row.EncryptedApiKey,
                    EncryptedApiSecret = row.EncryptedApiSecret,
                    EncryptedAccessToken = row.EncryptedAccessToken,
                    EncryptedRefreshToken = row.EncryptedRefreshToken,
                    EncryptedWebhookSecret = row.EncryptedWebhookSecret,
                    Enabled = row.Enabled,
                    Status = row.Status,
                    TokenExpiresAt = row.TokenExpiresAt,
                    OAuthScope = row.OAuthScope,
                    ConnectedAt = row.ConnectedAt,
                    LastSyncAt = row.LastSyncAt,
                    LastErrorAt = row.LastErrorAt,
                    LastError = row.LastError,
                    ConnectedByUserId = row.ConnectedByUserId,
                    ConnectedByUserName = row.ConnectedByUserName,
                    CreatedAt = row.CreatedAt == default ? now : row.CreatedAt,
                    UpdatedAt = now
                });
                inserted++;
                continue;
            }

            existing.Provider = row.Provider;
            existing.DisplayName = row.DisplayName;
            existing.EncryptedApiKey = row.EncryptedApiKey;
            existing.EncryptedApiSecret = row.EncryptedApiSecret;
            existing.EncryptedAccessToken = row.EncryptedAccessToken;
            existing.EncryptedRefreshToken = row.EncryptedRefreshToken;
            existing.EncryptedWebhookSecret = row.EncryptedWebhookSecret;
            existing.Enabled = row.Enabled;
            existing.Status = row.Status;
            existing.TokenExpiresAt = row.TokenExpiresAt;
            existing.OAuthScope = row.OAuthScope;
            existing.ConnectedAt = row.ConnectedAt;
            existing.LastSyncAt = row.LastSyncAt;
            existing.LastErrorAt = row.LastErrorAt;
            existing.LastError = row.LastError;
            existing.ConnectedByUserId = row.ConnectedByUserId;
            existing.ConnectedByUserName = row.ConnectedByUserName;
            existing.UpdatedAt = now;
            updated++;
        }

        await _context.SaveChangesAsync(cancellationToken);

        return new CrmIntegrationCopyResult
        {
            Success = true,
            Inserted = inserted,
            Updated = updated,
            Types = rows.Select(r => r.IntegrationType).Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            Source = source
        };
    }

    private static async Task<List<CrmIntegrationRow>> ReadCrmIntegrationRowsAsync(string conn, CancellationToken cancellationToken)
    {
        var results = new List<CrmIntegrationRow>();
        await using var db = new NpgsqlConnection(conn);
        await db.OpenAsync(cancellationToken);

        await using var cmd = db.CreateCommand();
        cmd.CommandText = @"
            SELECT
                ""Id"",
                ""OrganizationId"",
                ""IntegrationType"",
                ""Provider"",
                ""DisplayName"",
                ""EncryptedApiKey"",
                ""EncryptedApiSecret"",
                ""EncryptedAccessToken"",
                ""EncryptedRefreshToken"",
                ""EncryptedWebhookSecret"",
                ""Enabled"",
                ""Status"",
                ""TokenExpiresAt"",
                ""OAuthScope"",
                ""ConnectedAt"",
                ""LastSyncAt"",
                ""LastErrorAt"",
                ""LastError"",
                ""ConnectedByUserId"",
                ""ConnectedByUserName"",
                ""CreatedAt"",
                ""UpdatedAt""
            FROM ""IntegrationConfigs""
            WHERE ""IntegrationType"" = ANY(@types)
            ORDER BY ""IntegrationType"", ""OrganizationId"", ""UpdatedAt"" DESC;";

        cmd.Parameters.AddWithValue("@types", CopyTypes);

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var orgId = reader.GetInt32(reader.GetOrdinal("OrganizationId"));
            var type = reader["IntegrationType"]?.ToString() ?? string.Empty;
            var dedupeKey = $"{orgId}|{type}";
            if (!seen.Add(dedupeKey)) continue;

            results.Add(new CrmIntegrationRow
            {
                OrganizationId = orgId,
                IntegrationType = type,
                Provider = ReadNullableString(reader, "Provider"),
                DisplayName = ReadNullableString(reader, "DisplayName"),
                EncryptedApiKey = ReadNullableString(reader, "EncryptedApiKey"),
                EncryptedApiSecret = ReadNullableString(reader, "EncryptedApiSecret"),
                EncryptedAccessToken = ReadNullableString(reader, "EncryptedAccessToken"),
                EncryptedRefreshToken = ReadNullableString(reader, "EncryptedRefreshToken"),
                EncryptedWebhookSecret = ReadNullableString(reader, "EncryptedWebhookSecret"),
                Enabled = reader["Enabled"] is not DBNull && reader.GetBoolean(reader.GetOrdinal("Enabled")),
                Status = ReadNullableString(reader, "Status") ?? "connected",
                TokenExpiresAt = ReadNullableDateTime(reader, "TokenExpiresAt"),
                OAuthScope = ReadNullableString(reader, "OAuthScope"),
                ConnectedAt = ReadNullableDateTime(reader, "ConnectedAt"),
                LastSyncAt = ReadNullableDateTime(reader, "LastSyncAt"),
                LastErrorAt = ReadNullableDateTime(reader, "LastErrorAt"),
                LastError = ReadNullableString(reader, "LastError"),
                ConnectedByUserId = ReadNullableInt(reader, "ConnectedByUserId"),
                ConnectedByUserName = ReadNullableString(reader, "ConnectedByUserName"),
                CreatedAt = ReadNullableDateTime(reader, "CreatedAt") ?? DateTime.UtcNow,
                UpdatedAt = ReadNullableDateTime(reader, "UpdatedAt") ?? DateTime.UtcNow
            });
        }

        return results;
    }

    private static string? ReadNullableString(NpgsqlDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    private static int? ReadNullableInt(NpgsqlDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
    }

    private static DateTime? ReadNullableDateTime(NpgsqlDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        if (reader.IsDBNull(ordinal)) return null;
        var value = reader.GetDateTime(ordinal);
        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
    }

    private sealed class CrmIntegrationRow
    {
        public int OrganizationId { get; set; }
        public string IntegrationType { get; set; } = string.Empty;
        public string? Provider { get; set; }
        public string? DisplayName { get; set; }
        public string? EncryptedApiKey { get; set; }
        public string? EncryptedApiSecret { get; set; }
        public string? EncryptedAccessToken { get; set; }
        public string? EncryptedRefreshToken { get; set; }
        public string? EncryptedWebhookSecret { get; set; }
        public bool Enabled { get; set; }
        public string Status { get; set; } = "connected";
        public DateTime? TokenExpiresAt { get; set; }
        public string? OAuthScope { get; set; }
        public DateTime? ConnectedAt { get; set; }
        public DateTime? LastSyncAt { get; set; }
        public DateTime? LastErrorAt { get; set; }
        public string? LastError { get; set; }
        public int? ConnectedByUserId { get; set; }
        public string? ConnectedByUserName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
