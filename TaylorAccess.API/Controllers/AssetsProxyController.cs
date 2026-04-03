using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/assets-proxy")]
[Authorize]
public class AssetsProxyController : ControllerBase
{
    private static readonly int[] RetryableStatuses = { 400, 404, 502, 503 };
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AssetsProxyController> _logger;

    public AssetsProxyController(IHttpClientFactory httpClientFactory, ILogger<AssetsProxyController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    [HttpGet("trailers")]
    public async Task<IActionResult> GetTrailers([FromQuery] int limit = 1000, [FromQuery] string equipmentType = "trailer")
    {
        limit = Math.Clamp(limit, 1, 5000);
        equipmentType = string.IsNullOrWhiteSpace(equipmentType) ? "trailer" : equipmentType.Trim();
        var client = _httpClientFactory.CreateClient();
        var authHeader = Request.Headers.Authorization.ToString();
        if (!string.IsNullOrWhiteSpace(authHeader) && AuthenticationHeaderValue.TryParse(authHeader, out var auth))
            client.DefaultRequestHeaders.Authorization = auth;

        var attempts = BuildCandidateUrls(limit, equipmentType).ToList();
        var errors = new List<object>();

        foreach (var url in attempts)
        {
            try
            {
                var response = await client.GetAsync(url);
                var body = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                    return Content(body, "application/json");

                var status = (int)response.StatusCode;
                errors.Add(new { url, status });
                if (!RetryableStatuses.Contains(status))
                {
                    _logger.LogWarning("Assets proxy non-retryable response {Status} from {Url}", status, url);
                    return StatusCode(status, new { error = "Assets upstream request failed", source = url, status });
                }
            }
            catch (Exception ex)
            {
                errors.Add(new { url, error = ex.GetType().Name });
            }
        }

        _logger.LogWarning("Assets proxy exhausted all trailer endpoints: {@Errors}", errors);
        return StatusCode(502, new
        {
            error = "Unable to load trailers from assets service",
            attempts = errors
        });
    }

    private static IEnumerable<string> BuildCandidateUrls(int limit, string equipmentType)
    {
        var configuredBase = Environment.GetEnvironmentVariable("TAYLOR_ASSETS_API_URL");
        var bases = new[]
        {
            configuredBase,
            "https://ttac-gateway-production.up.railway.app/api/v1/open/taylor-assets",
            "https://taylor-assets-production.up.railway.app"
        }
        .Where(v => !string.IsNullOrWhiteSpace(v))
        .Select(v => v!.Trim().TrimEnd('/'))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

        var typeEncoded = Uri.EscapeDataString(equipmentType);
        var suffixes = new[]
        {
            $"/api/v1/equipment?equipmentType={typeEncoded}&limit={limit}",
            $"/equipment?equipmentType={typeEncoded}&limit={limit}",
            $"/api/v1/trailers?limit={limit}",
            $"/trailers?limit={limit}"
        };

        foreach (var b in bases)
        {
            foreach (var suffix in suffixes)
                yield return $"{b}{suffix}";
        }
    }
}
