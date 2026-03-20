using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/motiv")]
[Authorize]
public class MotivController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<MotivController> _logger;

    public MotivController(IConfiguration config, IHttpClientFactory httpClientFactory, ILogger<MotivController> logger)
    {
        _config = config;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
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
            ?? "/v1/drivers";
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

    private async Task<IActionResult> ProxyMotivGet(string path, string endpointName)
    {
        var apiKey = _config["MOTIV_API_KEY"] ?? Environment.GetEnvironmentVariable("MOTIV_API_KEY");
        var baseUrl = _config["MOTIV_API_BASE_URL"] ?? Environment.GetEnvironmentVariable("MOTIV_API_BASE_URL");

        if (string.IsNullOrWhiteSpace(baseUrl))
            return BadRequest(new { error = "MOTIV_API_BASE_URL is not configured." });
        if (string.IsNullOrWhiteSpace(apiKey))
            return BadRequest(new { error = "MOTIV_API_KEY is not configured." });

        var requestUri = BuildUri(baseUrl, path, Request.QueryString.Value);
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
                return StatusCode((int)response.StatusCode, new
                {
                    error = $"MOTIV {endpointName} request failed.",
                    status = (int)response.StatusCode,
                    details = Truncate(payload, 500)
                });
            }

            object parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<JsonElement>(payload);
            }
            catch
            {
                parsed = payload;
            }

            return Ok(new
            {
                source = "motiv",
                endpoint = endpointName,
                data = parsed
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MOTIV {Endpoint} request exception", endpointName);
            return StatusCode(502, new
            {
                error = $"MOTIV {endpointName} request exception.",
                details = ex.Message
            });
        }
    }

    private static string BuildUri(string baseUrl, string path, string? queryString)
    {
        var normalizedBase = baseUrl.TrimEnd('/');
        var normalizedPath = path.StartsWith('/') ? path : $"/{path}";
        var qs = string.IsNullOrWhiteSpace(queryString) ? "" : queryString;
        return $"{normalizedBase}{normalizedPath}{qs}";
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength) return value;
        return value.Substring(0, maxLength);
    }
}

