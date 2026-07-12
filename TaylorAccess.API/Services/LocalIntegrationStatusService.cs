using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public sealed class IntegrationStatusProbeResult
{
    public bool Connected { get; init; }
    public string Status { get; init; } = "not-connected";
    public string? Message { get; init; }
    public string Source { get; init; } = "local";
}

public class LocalIntegrationStatusService
{
    private const string GmailApiBase = "https://gmail.googleapis.com/gmail/v1/users/me";
    private const string GoogleTokenUrl = "https://oauth2.googleapis.com/token";

    private readonly TaylorAccessDbContext _context;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IntegrationEncryptionService _encryption;
    private readonly ILogger<LocalIntegrationStatusService> _logger;

    public LocalIntegrationStatusService(
        TaylorAccessDbContext context,
        IHttpClientFactory httpClientFactory,
        IntegrationEncryptionService encryption,
        ILogger<LocalIntegrationStatusService> logger)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _encryption = encryption;
        _logger = logger;
    }

    public async Task<IntegrationStatusProbeResult> GetGoogleStatusAsync(int? orgId = null, CancellationToken cancellationToken = default)
    {
        var domainConfig = await FindConfigAsync("gmail-domain", orgId, cancellationToken);
        if (domainConfig != null && IsDomainConfigured(domainConfig))
        {
            return new IntegrationStatusProbeResult
            {
                Connected = string.Equals(domainConfig.Status, "connected", StringComparison.OrdinalIgnoreCase),
                Status = domainConfig.Status,
                Message = domainConfig.Status == "connected"
                    ? "Gmail domain-wide credentials available locally."
                    : domainConfig.LastError ?? "Gmail domain credentials copied but not connected.",
                Source = "local-db"
            };
        }

        if (HasGoogleDomainEnvCredentials())
        {
            return new IntegrationStatusProbeResult
            {
                Connected = true,
                Status = "connected",
                Message = "Gmail domain-wide credentials available from environment.",
                Source = "environment"
            };
        }

        var gmailConfig = await FindConfigAsync("gmail", orgId, cancellationToken);
        if (gmailConfig?.EncryptedAccessToken == null)
        {
            return new IntegrationStatusProbeResult
            {
                Connected = false,
                Status = "not-connected",
                Message = "No local Gmail or Gmail domain credentials found.",
                Source = "local-db"
            };
        }

        try
        {
            var token = await GetValidGmailAccessTokenAsync(gmailConfig, cancellationToken);
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var response = await client.GetAsync($"{GmailApiBase}/profile", cancellationToken);
            if (response.IsSuccessStatusCode)
                return new IntegrationStatusProbeResult
                {
                    Connected = true,
                    Status = "connected",
                    Message = "Gmail OAuth token verified locally.",
                    Source = "local-db"
                };

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            return new IntegrationStatusProbeResult
            {
                Connected = false,
                Status = "error",
                Message = $"Gmail API returned HTTP {(int)response.StatusCode}: {body[..Math.Min(body.Length, 180)]}",
                Source = "local-db"
            };
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Local Gmail status probe failed");
            return new IntegrationStatusProbeResult
            {
                Connected = false,
                Status = "error",
                Message = ex.Message,
                Source = "local-db"
            };
        }
    }

    public async Task<IntegrationStatusProbeResult> GetZoomStatusAsync(int? orgId = null, CancellationToken cancellationToken = default)
    {
        var config = await FindZoomConfigAsync(orgId, cancellationToken);
        if (config == null && HasZoomEnvCredentials())
        {
            config = new IntegrationConfig
            {
                IntegrationType = "zoom",
                Status = "connected",
                OAuthScope = Environment.GetEnvironmentVariable("ZOOM_ACCOUNT_ID")
            };
        }

        if (config == null)
        {
            return new IntegrationStatusProbeResult
            {
                Connected = false,
                Status = "not-connected",
                Message = "No local Zoom credentials found.",
                Source = "local-db"
            };
        }

        if (config.EncryptedAccessToken != null
            && (!config.TokenExpiresAt.HasValue || config.TokenExpiresAt.Value > DateTime.UtcNow.AddMinutes(2)))
        {
            var quick = await TryQuickZoomVerifyAsync(config, cancellationToken);
            if (quick.Connected)
                return quick;
        }

        var reconnected = await TryReconnectZoomAsync(config, cancellationToken);
        if (reconnected.Connected)
            return reconnected;

        var message = config.LastError ?? reconnected.Message ?? "Zoom credentials copied but live verification failed.";
        if (message.Contains("invalid_client", StringComparison.OrdinalIgnoreCase))
        {
            message = "Zoom rejected the client ID or secret. Regenerate the Server-to-Server OAuth secret in Zoom Marketplace and update Railway.";
        }

        return new IntegrationStatusProbeResult
        {
            Connected = false,
            Status = config.Status,
            Message = message,
            Source = "local-db"
        };
    }

    public async Task<bool> HasLocalCredentialsAsync(int? orgId = null, CancellationToken cancellationToken = default)
    {
        var domain = await FindConfigAsync("gmail-domain", orgId, cancellationToken);
        if (domain != null && IsDomainConfigured(domain)) return true;
        if (HasGoogleDomainEnvCredentials()) return true;

        var gmail = await FindConfigAsync("gmail", orgId, cancellationToken);
        if (gmail?.EncryptedAccessToken != null) return true;

        var zoom = await FindZoomConfigAsync(orgId, cancellationToken);
        return zoom?.EncryptedAccessToken != null || zoom?.EncryptedApiKey != null;
    }

    /// <summary>Returns a live Zoom S2S bearer token, refreshing from stored/env credentials when needed.</summary>
    public async Task<string?> GetValidZoomAccessTokenAsync(int? orgId = null, CancellationToken cancellationToken = default)
    {
        var config = await FindZoomConfigAsync(orgId, cancellationToken);
        if (config == null && HasZoomEnvCredentials())
        {
            config = new IntegrationConfig
            {
                IntegrationType = "zoom",
                Status = "connected",
                OAuthScope = Environment.GetEnvironmentVariable("ZOOM_ACCOUNT_ID")
            };
        }

        if (config == null)
            return null;

        if (_encryption.IsConfigured
            && config.EncryptedAccessToken != null
            && (!config.TokenExpiresAt.HasValue || config.TokenExpiresAt.Value > DateTime.UtcNow.AddMinutes(2)))
        {
            try
            {
                var existing = _encryption.Decrypt(config.EncryptedAccessToken);
                if (!string.IsNullOrWhiteSpace(existing))
                {
                    var client = _httpClientFactory.CreateClient();
                    client.Timeout = TimeSpan.FromSeconds(8);
                    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", existing);
                    using var probe = await client.GetAsync("https://api.zoom.us/v2/users?page_size=1&status=active", cancellationToken);
                    if (probe.IsSuccessStatusCode)
                        return existing;
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Existing Zoom token probe failed; will reconnect");
            }
        }

        var reconnected = await TryReconnectZoomAsync(config, cancellationToken);
        if (!reconnected.Connected)
            return null;

        var refreshed = await FindZoomConfigAsync(orgId, cancellationToken);
        if (refreshed?.EncryptedAccessToken == null || !_encryption.IsConfigured)
            return null;

        try
        {
            return _encryption.Decrypt(refreshed.EncryptedAccessToken);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to decrypt refreshed Zoom token");
            return null;
        }
    }

    private async Task<IntegrationConfig?> FindConfigAsync(string integrationType, int? orgId, CancellationToken cancellationToken)
    {
        if (orgId is > 0)
        {
            var orgMatch = await _context.IntegrationConfigs
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.OrganizationId == orgId && c.IntegrationType == integrationType, cancellationToken);
            if (orgMatch != null) return orgMatch;
        }

        return await _context.IntegrationConfigs
            .AsNoTracking()
            .Where(c => c.IntegrationType == integrationType)
            .OrderByDescending(c => c.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<IntegrationConfig?> FindZoomConfigAsync(int? orgId, CancellationToken cancellationToken)
    {
        if (orgId is > 0)
        {
            var orgMatch = await _context.IntegrationConfigs
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.OrganizationId == orgId && c.IntegrationType == "zoom", cancellationToken);
            if (orgMatch?.EncryptedAccessToken != null || orgMatch?.EncryptedApiKey != null)
                return orgMatch;
        }

        return await _context.IntegrationConfigs
            .AsNoTracking()
            .Where(c => c.IntegrationType == "zoom" && (c.EncryptedAccessToken != null || c.EncryptedApiKey != null))
            .OrderByDescending(c => c.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static bool IsDomainConfigured(IntegrationConfig config)
    {
        if (HasGoogleDomainEnvCredentials()) return true;
        return config.EncryptedApiKey != null;
    }

    private static bool HasGoogleDomainEnvCredentials() =>
        !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_KEY"))
        || !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_KEY_B64"));

    private static bool HasZoomEnvCredentials()
    {
        var envId = Environment.GetEnvironmentVariable("ZOOM_CLIENT_ID");
        var envSecret = Environment.GetEnvironmentVariable("ZOOM_CLIENT_SECRET");
        var envAccount = Environment.GetEnvironmentVariable("ZOOM_ACCOUNT_ID");
        return !string.IsNullOrWhiteSpace(envId)
            && !string.IsNullOrWhiteSpace(envSecret)
            && !string.IsNullOrWhiteSpace(envAccount);
    }

    private async Task<string> GetValidGmailAccessTokenAsync(IntegrationConfig config, CancellationToken cancellationToken)
    {
        if (!_encryption.IsConfigured)
            throw new InvalidOperationException("INTEGRATION_ENCRYPTION_KEY is not configured.");

        var accessToken = _encryption.Decrypt(config.EncryptedAccessToken!);
        if (config.TokenExpiresAt.HasValue && config.TokenExpiresAt.Value <= DateTime.UtcNow.AddMinutes(5)
            && config.EncryptedRefreshToken != null)
        {
            accessToken = await RefreshGmailTokenAsync(config, cancellationToken);
        }

        return accessToken;
    }

    private async Task<string> RefreshGmailTokenAsync(IntegrationConfig config, CancellationToken cancellationToken)
    {
        var clientId = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID");
        var clientSecret = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_SECRET");
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            throw new InvalidOperationException("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET required to refresh Gmail token.");

        var refreshToken = _encryption.Decrypt(config.EncryptedRefreshToken!);
        var client = _httpClientFactory.CreateClient();
        var tokenRequest = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string, string>("grant_type", "refresh_token"),
            new KeyValuePair<string, string>("refresh_token", refreshToken),
            new KeyValuePair<string, string>("client_id", clientId),
            new KeyValuePair<string, string>("client_secret", clientSecret)
        });

        using var response = await client.PostAsync(GoogleTokenUrl, tokenRequest, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Gmail token refresh failed: {body[..Math.Min(body.Length, 180)]}");

        using var doc = JsonDocument.Parse(body);
        var newAccessToken = doc.RootElement.GetProperty("access_token").GetString()!;
        var expiresIn = doc.RootElement.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() : 3600;

        var tracked = await _context.IntegrationConfigs.FirstOrDefaultAsync(c => c.Id == config.Id, cancellationToken);
        if (tracked != null)
        {
            tracked.EncryptedAccessToken = _encryption.Encrypt(newAccessToken);
            if (doc.RootElement.TryGetProperty("refresh_token", out var rt) && rt.GetString() != null)
                tracked.EncryptedRefreshToken = _encryption.Encrypt(rt.GetString()!);
            tracked.TokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn);
            tracked.Status = "connected";
            tracked.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(cancellationToken);
        }

        return newAccessToken;
    }

    private async Task<IntegrationStatusProbeResult> TryQuickZoomVerifyAsync(IntegrationConfig config, CancellationToken cancellationToken)
    {
        try
        {
            if (!_encryption.IsConfigured || config.EncryptedAccessToken == null)
                return new IntegrationStatusProbeResult { Connected = false, Status = "not-connected", Source = "local-db" };

            var token = _encryption.Decrypt(config.EncryptedAccessToken);
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var meResponse = await client.GetAsync("https://api.zoom.us/v2/users/me", cancellationToken);
            if (meResponse.IsSuccessStatusCode)
                return new IntegrationStatusProbeResult { Connected = true, Status = "connected", Source = "local-db" };

            using var usersResponse = await client.GetAsync("https://api.zoom.us/v2/users?page_size=1&status=active", cancellationToken);
            if (usersResponse.IsSuccessStatusCode)
                return new IntegrationStatusProbeResult { Connected = true, Status = "connected", Source = "local-db" };

            return new IntegrationStatusProbeResult
            {
                Connected = false,
                Status = "error",
                Message = "Zoom token present but verification failed.",
                Source = "local-db"
            };
        }
        catch (Exception ex)
        {
            return new IntegrationStatusProbeResult
            {
                Connected = false,
                Status = "error",
                Message = ex.Message,
                Source = "local-db"
            };
        }
    }

    private async Task<IntegrationStatusProbeResult> TryReconnectZoomAsync(IntegrationConfig config, CancellationToken cancellationToken)
    {
        var creds = ResolveZoomS2SCredentials(config);
        if (creds == null)
        {
            return new IntegrationStatusProbeResult
            {
                Connected = false,
                Status = config.Status,
                Message = "Zoom token expired and no S2S credentials available.",
                Source = "local-db"
            };
        }

        try
        {
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10);
            var authHeader = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{creds.Value.ClientId}:{creds.Value.ClientSecret}"));
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", authHeader);

            var tokenRequest = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("grant_type", "account_credentials"),
                new KeyValuePair<string, string>("account_id", creds.Value.AccountId)
            });

            using var response = await httpClient.PostAsync("https://zoom.us/oauth/token", tokenRequest, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return new IntegrationStatusProbeResult
                {
                    Connected = false,
                    Status = "error",
                    Message = $"Zoom S2S reconnect failed: {body[..Math.Min(body.Length, 180)]}",
                    Source = "local-db"
                };
            }

            using var doc = JsonDocument.Parse(body);
            var accessToken = doc.RootElement.GetProperty("access_token").GetString()!;
            var expiresIn = doc.RootElement.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() : 3600;

            var tracked = config.Id > 0
                ? await _context.IntegrationConfigs.FirstOrDefaultAsync(c => c.Id == config.Id, cancellationToken)
                : await _context.IntegrationConfigs.FirstOrDefaultAsync(c => c.IntegrationType == "zoom", cancellationToken);

            if (tracked != null && _encryption.IsConfigured)
            {
                tracked.EncryptedAccessToken = _encryption.Encrypt(accessToken);
                tracked.TokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn);
                tracked.Status = "connected";
                tracked.LastError = null;
                tracked.LastErrorAt = null;
                tracked.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync(cancellationToken);
            }
            else if (_encryption.IsConfigured)
            {
                var persisted = new IntegrationConfig
                {
                    OrganizationId = config.OrganizationId > 0 ? config.OrganizationId : 1,
                    IntegrationType = "zoom",
                    Provider = "zoom",
                    DisplayName = "Zoom Video",
                    EncryptedAccessToken = _encryption.Encrypt(accessToken),
                    TokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn),
                    Status = "connected",
                    OAuthScope = creds.Value.AccountId,
                    ConnectedAt = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _context.IntegrationConfigs.Add(persisted);
                await _context.SaveChangesAsync(cancellationToken);
                tracked = persisted;
            }

            var verifyClient = _httpClientFactory.CreateClient();
            verifyClient.Timeout = TimeSpan.FromSeconds(8);
            verifyClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            using var usersResponse = await verifyClient.GetAsync("https://api.zoom.us/v2/users?page_size=1&status=active", cancellationToken);
            if (usersResponse.IsSuccessStatusCode)
            {
                return new IntegrationStatusProbeResult
                {
                    Connected = true,
                    Status = "connected",
                    Message = tracked != null ? "Zoom S2S token refreshed locally." : "Zoom S2S credentials verified from environment.",
                    Source = tracked != null ? "local-db" : "environment"
                };
            }

            var verify = await TryQuickZoomVerifyAsync(tracked ?? config, cancellationToken);
            return new IntegrationStatusProbeResult
            {
                Connected = verify.Connected,
                Status = verify.Status,
                Message = verify.Message ?? "Zoom S2S token refreshed locally.",
                Source = verify.Source
            };
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Zoom S2S reconnect failed");
            return new IntegrationStatusProbeResult
            {
                Connected = false,
                Status = "error",
                Message = ex.Message,
                Source = "local-db"
            };
        }
    }

    private ZoomS2SCredentials? ResolveZoomS2SCredentials(IntegrationConfig config)
    {
        if (_encryption.IsConfigured
            && config.EncryptedApiKey != null
            && config.EncryptedApiSecret != null
            && !string.IsNullOrWhiteSpace(config.OAuthScope))
        {
            try
            {
                return new ZoomS2SCredentials(
                    _encryption.Decrypt(config.EncryptedApiKey),
                    _encryption.Decrypt(config.EncryptedApiSecret),
                    config.OAuthScope);
            }
            catch
            {
                // Fall back to environment credentials below.
            }
        }

        var envId = Environment.GetEnvironmentVariable("ZOOM_CLIENT_ID")?.Trim();
        var envSecret = Environment.GetEnvironmentVariable("ZOOM_CLIENT_SECRET")?.Trim();
        var envAccount = Environment.GetEnvironmentVariable("ZOOM_ACCOUNT_ID")?.Trim();
        if (!string.IsNullOrWhiteSpace(envId) && !string.IsNullOrWhiteSpace(envSecret) && !string.IsNullOrWhiteSpace(envAccount))
            return new ZoomS2SCredentials(envId, envSecret, envAccount);

        return null;
    }

    private readonly record struct ZoomS2SCredentials(string ClientId, string ClientSecret, string AccountId);
}
