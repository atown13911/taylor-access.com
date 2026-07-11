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
    private readonly ILogger<CrmIntegrationCopyService> _logger;

    public CrmIntegrationCopyService(
        TaylorAccessDbContext context,
        IConfiguration configuration,
        ILogger<CrmIntegrationCopyService> logger)
    {
        _context = context;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<CrmIntegrationCopyResult> CopyFromCrmAsync(CancellationToken cancellationToken = default)
    {
        var conn = CrmDbConnectionResolver.Resolve(_configuration);
        if (string.IsNullOrWhiteSpace(conn))
        {
            return new CrmIntegrationCopyResult
            {
                Success = false,
                Error = "CRM database connection is not configured (CRM_DB_CONNECTION or PortalDbConnection)."
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
                Error = "No gmail/gmail-domain/zoom integration rows found in CRM database."
            };
        }

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
            Source = "crm-database"
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
