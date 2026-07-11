using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public class IntegrationConfigBootstrapService
{
    private readonly TaylorAccessDbContext _context;
    private readonly IntegrationEncryptionService _encryption;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<IntegrationConfigBootstrapService> _logger;

    public IntegrationConfigBootstrapService(
        TaylorAccessDbContext context,
        IntegrationEncryptionService encryption,
        IHttpClientFactory httpClientFactory,
        ILogger<IntegrationConfigBootstrapService> logger)
    {
        _context = context;
        _encryption = encryption;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task BootstrapFromEnvironmentAsync(CancellationToken cancellationToken = default)
    {
        if (!_encryption.IsConfigured)
        {
            _logger.LogWarning("INTEGRATION_ENCRYPTION_KEY is not configured; skipping integration bootstrap.");
            return;
        }

        await BootstrapGmailDomainAsync(cancellationToken);
        await BootstrapZoomAsync(cancellationToken);
    }

    private async Task BootstrapGmailDomainAsync(CancellationToken cancellationToken)
    {
        var saKeyB64 = Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_KEY_B64");
        var saKey = !string.IsNullOrEmpty(saKeyB64)
            ? System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(saKeyB64))
            : Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_KEY");
        if (string.IsNullOrWhiteSpace(saKey)) return;

        var existing = await _context.IntegrationConfigs
            .FirstOrDefaultAsync(c => c.IntegrationType == "gmail-domain", cancellationToken);
        if (existing?.EncryptedApiKey != null && existing.Status == "connected") return;

        var adminEmail = Environment.GetEnvironmentVariable("GOOGLE_ADMIN_EMAIL") ?? "van-tac@taylor-corp.net";
        var config = existing ?? new IntegrationConfig
        {
            OrganizationId = existing?.OrganizationId ?? 1,
            IntegrationType = "gmail-domain",
            Provider = "google-workspace",
            DisplayName = "Gmail Domain-Wide",
            CreatedAt = DateTime.UtcNow
        };

        config.EncryptedApiKey = _encryption.Encrypt(saKey);
        config.OAuthScope = adminEmail;
        config.Status = "connected";
        config.Enabled = true;
        config.ConnectedAt ??= DateTime.UtcNow;
        config.UpdatedAt = DateTime.UtcNow;

        if (existing == null)
            _context.IntegrationConfigs.Add(config);

        await _context.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Bootstrapped gmail-domain integration config from environment.");
    }

    private async Task BootstrapZoomAsync(CancellationToken cancellationToken)
    {
        var clientId = Environment.GetEnvironmentVariable("ZOOM_CLIENT_ID");
        var clientSecret = Environment.GetEnvironmentVariable("ZOOM_CLIENT_SECRET");
        var accountId = Environment.GetEnvironmentVariable("ZOOM_ACCOUNT_ID");
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret) || string.IsNullOrWhiteSpace(accountId))
            return;

        var existing = await _context.IntegrationConfigs
            .FirstOrDefaultAsync(c => c.IntegrationType == "zoom", cancellationToken);
        if (existing?.EncryptedAccessToken != null
            && existing.TokenExpiresAt.HasValue
            && existing.TokenExpiresAt.Value > DateTime.UtcNow.AddMinutes(5))
            return;

        try
        {
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10);
            var authHeader = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));
            httpClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", authHeader);

            using var response = await httpClient.PostAsync(
                "https://zoom.us/oauth/token",
                new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("grant_type", "account_credentials"),
                    new KeyValuePair<string, string>("account_id", accountId)
                }),
                cancellationToken);

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Zoom bootstrap token exchange failed: {Body}", body[..Math.Min(body.Length, 180)]);
                return;
            }

            using var doc = JsonDocument.Parse(body);
            var accessToken = doc.RootElement.GetProperty("access_token").GetString()!;
            var expiresIn = doc.RootElement.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() : 3600;

            var config = existing ?? new IntegrationConfig
            {
                OrganizationId = existing?.OrganizationId ?? 1,
                IntegrationType = "zoom",
                Provider = "zoom",
                DisplayName = "Zoom Video",
                CreatedAt = DateTime.UtcNow
            };

            config.EncryptedApiKey = _encryption.Encrypt(clientId);
            config.EncryptedApiSecret = _encryption.Encrypt(clientSecret);
            config.OAuthScope = accountId;
            config.EncryptedAccessToken = _encryption.Encrypt(accessToken);
            config.TokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn);
            config.Status = "connected";
            config.Enabled = true;
            config.ConnectedAt ??= DateTime.UtcNow;
            config.UpdatedAt = DateTime.UtcNow;

            if (existing == null)
                _context.IntegrationConfigs.Add(config);

            await _context.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Bootstrapped zoom integration config from environment.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Zoom bootstrap failed.");
        }
    }
}
