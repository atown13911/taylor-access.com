using System.Text;
using System.Text.Json;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public class WebhookService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<WebhookService> _logger;
    private readonly string[] _webhookUrls;
    private readonly string _webhookSecret;

    private static readonly JsonSerializerOptions _jsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public WebhookService(IHttpClientFactory httpClientFactory, IConfiguration configuration, ILogger<WebhookService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        var urls = Environment.GetEnvironmentVariable("WEBHOOK_URLS")
            ?? configuration["Webhooks:Urls"] ?? "";
        _webhookUrls = urls.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        _webhookSecret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET")
            ?? configuration["Webhooks:Secret"] ?? "";
    }

    public void FireEmployeeEvent(string eventType, User user)
    {
        if (_webhookUrls.Length == 0) return;

        var payload = new
        {
            @event = eventType,
            data = new
            {
                user.Id,
                user.Name,
                user.Email,
                user.Role,
                user.Status,
                user.OrganizationId,
                user.SatelliteId,
                user.AgencyId,
                user.TerminalId,
                user.Phone,
                user.JobTitle,
                user.CreatedAt
            }
        };

        var json = JsonSerializer.Serialize(payload, _jsonOpts);
        _ = SendToAllAsync(json);
    }

    public void FireEmployeeBulk(IEnumerable<User> users)
    {
        if (_webhookUrls.Length == 0) return;

        var payload = users.Select(u => new
        {
            @event = "employee.updated",
            data = new
            {
                u.Id,
                u.Name,
                u.Email,
                u.Role,
                u.Status,
                u.OrganizationId,
                u.SatelliteId,
                u.AgencyId,
                u.TerminalId,
                u.Phone,
                u.JobTitle,
                u.CreatedAt
            }
        });

        var json = JsonSerializer.Serialize(payload, _jsonOpts);

        foreach (var url in _webhookUrls)
        {
            var bulkUrl = url.TrimEnd('/') + "/bulk";
            _ = SendAsync(bulkUrl, json);
        }
    }

    private async Task SendToAllAsync(string json)
    {
        foreach (var url in _webhookUrls)
        {
            await SendAsync(url, json);
        }
    }

    private async Task SendAsync(string url, string json)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);

            var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };

            if (!string.IsNullOrEmpty(_webhookSecret))
                request.Headers.Add("X-Webhook-Secret", _webhookSecret);

            var response = await client.SendAsync(request);
            _logger.LogInformation("Webhook {Url}: {Status}", url, response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Webhook delivery failed for {Url}", url);
        }
    }
}
