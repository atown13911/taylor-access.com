using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/assets-proxy")]
[Authorize]
public class AssetsProxyController : ControllerBase
{
    private static readonly int[] RetryableGetStatuses = { 400, 404, 502, 503 };
    private static readonly int[] RetryableWriteStatuses = { 404, 502, 503 };
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
                if (!RetryableGetStatuses.Contains(status))
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
        return Ok(new
        {
            data = Array.Empty<object>(),
            total = 0,
            warning = "Unable to load trailers from assets upstream",
            attempts = errors
        });
    }

    [HttpGet("{**path}")]
    public Task<IActionResult> ForwardGet([FromRoute] string? path) =>
        ForwardToAssetsAsync(HttpMethod.Get, path);

    [HttpPost("{**path}")]
    public Task<IActionResult> ForwardPost([FromRoute] string? path) =>
        ForwardToAssetsAsync(HttpMethod.Post, path);

    [HttpPut("{**path}")]
    public Task<IActionResult> ForwardPut([FromRoute] string? path) =>
        ForwardToAssetsAsync(HttpMethod.Put, path);

    [HttpPatch("{**path}")]
    public Task<IActionResult> ForwardPatch([FromRoute] string? path) =>
        ForwardToAssetsAsync(new HttpMethod("PATCH"), path);

    [HttpDelete("{**path}")]
    public Task<IActionResult> ForwardDelete([FromRoute] string? path) =>
        ForwardToAssetsAsync(HttpMethod.Delete, path);

    private async Task<IActionResult> ForwardToAssetsAsync(HttpMethod method, string? path)
    {
        var relativePath = (path ?? string.Empty).Trim('/');
        if (string.IsNullOrWhiteSpace(relativePath))
            return BadRequest(new { error = "Proxy path is required" });

        var client = _httpClientFactory.CreateClient();
        var authHeader = Request.Headers.Authorization.ToString();
        if (!string.IsNullOrWhiteSpace(authHeader) && AuthenticationHeaderValue.TryParse(authHeader, out var auth))
            client.DefaultRequestHeaders.Authorization = auth;

        var attempts = BuildCandidateUrlsForPath(relativePath, Request.QueryString.Value ?? string.Empty).ToList();
        var bodyBytes = await ReadIncomingBodyAsync();
        var requestContentType = Request.ContentType;
        var errors = new List<object>();

        foreach (var url in attempts)
        {
            try
            {
                using var request = new HttpRequestMessage(method, url);
                if (bodyBytes is not null && method != HttpMethod.Get && method != HttpMethod.Delete)
                {
                    request.Content = new ByteArrayContent(bodyBytes);
                    if (!string.IsNullOrWhiteSpace(requestContentType))
                        request.Content.Headers.TryAddWithoutValidation("Content-Type", requestContentType);
                }

                using var response = await client.SendAsync(request);
                var responseBody = await response.Content.ReadAsStringAsync();
                var responseContentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";
                var status = (int)response.StatusCode;

                if (response.IsSuccessStatusCode)
                    return Content(responseBody, responseContentType);

                errors.Add(new { url, status });
                var retryableStatuses = method == HttpMethod.Get ? RetryableGetStatuses : RetryableWriteStatuses;
                var looksLikeGatewayHostnameError =
                    status == 400 &&
                    responseContentType.Contains("text/html", StringComparison.OrdinalIgnoreCase) &&
                    responseBody.Contains("Invalid Hostname", StringComparison.OrdinalIgnoreCase);

                var shouldRetry = retryableStatuses.Contains(status) || looksLikeGatewayHostnameError;
                if (!shouldRetry)
                    return StatusCode(status, responseBody);
            }
            catch (Exception ex)
            {
                errors.Add(new { url, error = ex.GetType().Name });
            }
        }

        _logger.LogWarning("Assets proxy failed for {Method} {Path}: {@Errors}", method.Method, relativePath, errors);
        return StatusCode(502, new { error = "Assets proxy upstream failure", method = method.Method, path = relativePath, attempts = errors });
    }

    private async Task<byte[]?> ReadIncomingBodyAsync()
    {
        if (Request.Method.Equals("GET", StringComparison.OrdinalIgnoreCase)
            || Request.Method.Equals("DELETE", StringComparison.OrdinalIgnoreCase))
            return null;

        Request.EnableBuffering();
        Request.Body.Position = 0;
        using var ms = new MemoryStream();
        await Request.Body.CopyToAsync(ms);
        Request.Body.Position = 0;
        return ms.Length > 0 ? ms.ToArray() : null;
    }

    private static IEnumerable<string> BuildCandidateUrls(int limit, string equipmentType)
    {
        var gatewayInternalOpenBase = BuildGatewayOpenBase(Environment.GetEnvironmentVariable("GATEWAY_INTERNAL_URL"));
        var gatewayPublicOpenBase = BuildGatewayOpenBase(
            Environment.GetEnvironmentVariable("GATEWAY_PUBLIC_OPEN_URL")
            ?? Environment.GetEnvironmentVariable("TTAC_GATEWAY_OPEN_BASE"));
        var portalDerivedOpenBase = BuildOpenTargetBaseFromServiceUrl(Environment.GetEnvironmentVariable("PORTAL_API_URL"));
        var accessDerivedOpenBase = BuildOpenTargetBaseFromServiceUrl(Environment.GetEnvironmentVariable("TAYLOR_ACCESS_API_URL"));
        var configuredBase = Environment.GetEnvironmentVariable("TAYLOR_ASSETS_API_URL");
        var gatewayConfiguredBase = Environment.GetEnvironmentVariable("TTAC_TAYLOR_ASSETS_BACKEND_URL");
        var railwayServiceBase = Environment.GetEnvironmentVariable("RAILWAY_SERVICE_TAYLOR_ASSETS_URL");
        var bases = new[]
        {
            gatewayInternalOpenBase,
            gatewayPublicOpenBase,
            portalDerivedOpenBase,
            accessDerivedOpenBase,
            configuredBase,
            gatewayConfiguredBase,
            railwayServiceBase,
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

    private static IEnumerable<string> BuildCandidateUrlsForPath(string relativePath, string queryString)
    {
        var gatewayInternalOpenBase = BuildGatewayOpenBase(Environment.GetEnvironmentVariable("GATEWAY_INTERNAL_URL"));
        var gatewayPublicOpenBase = BuildGatewayOpenBase(
            Environment.GetEnvironmentVariable("GATEWAY_PUBLIC_OPEN_URL")
            ?? Environment.GetEnvironmentVariable("TTAC_GATEWAY_OPEN_BASE"));
        var portalDerivedOpenBase = BuildOpenTargetBaseFromServiceUrl(Environment.GetEnvironmentVariable("PORTAL_API_URL"));
        var accessDerivedOpenBase = BuildOpenTargetBaseFromServiceUrl(Environment.GetEnvironmentVariable("TAYLOR_ACCESS_API_URL"));
        var configuredBase = Environment.GetEnvironmentVariable("TAYLOR_ASSETS_API_URL");
        var gatewayConfiguredBase = Environment.GetEnvironmentVariable("TTAC_TAYLOR_ASSETS_BACKEND_URL");
        var railwayServiceBase = Environment.GetEnvironmentVariable("RAILWAY_SERVICE_TAYLOR_ASSETS_URL");
        var bases = new[]
        {
            gatewayInternalOpenBase,
            gatewayPublicOpenBase,
            portalDerivedOpenBase,
            accessDerivedOpenBase,
            configuredBase,
            gatewayConfiguredBase,
            railwayServiceBase,
            "https://ttac-gateway-production.up.railway.app/api/v1/open/taylor-assets",
            "https://taylor-assets-production.up.railway.app"
        }
        .Where(v => !string.IsNullOrWhiteSpace(v))
        .Select(v => v!.Trim().TrimEnd('/'))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

        var safePath = relativePath.TrimStart('/');
        var query = string.IsNullOrWhiteSpace(queryString) ? string.Empty : queryString;
        foreach (var b in bases)
        {
            yield return $"{b}/api/v1/{safePath}{query}";
            if (b.Contains("/open/"))
                yield return $"{b}/{safePath}{query}";
        }
    }

    private static string? BuildGatewayOpenBase(string? gatewayBase)
    {
        if (string.IsNullOrWhiteSpace(gatewayBase))
            return null;

        var normalized = gatewayBase.Trim().TrimEnd('/');
        if (normalized.EndsWith("/api/v1/open", StringComparison.OrdinalIgnoreCase))
            return $"{normalized}/taylor-assets";
        if (normalized.EndsWith("/api/v1/open/taylor-assets", StringComparison.OrdinalIgnoreCase))
            return normalized;
        if (normalized.EndsWith("/api/v1", StringComparison.OrdinalIgnoreCase))
            return $"{normalized}/open/taylor-assets";
        return $"{normalized}/api/v1/open/taylor-assets";
    }

    private static string? BuildOpenTargetBaseFromServiceUrl(string? serviceUrl)
    {
        if (string.IsNullOrWhiteSpace(serviceUrl))
            return null;

        var normalized = serviceUrl.Trim().TrimEnd('/');
        var marker = "/api/v1/open/";
        var idx = normalized.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (idx < 0)
            return null;

        var root = normalized.Substring(0, idx + marker.Length);
        return $"{root}taylor-assets";
    }
}
