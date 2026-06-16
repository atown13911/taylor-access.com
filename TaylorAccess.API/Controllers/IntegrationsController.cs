using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/integrations")]
[Authorize]
public class IntegrationsController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<IntegrationsController> _logger;

    public IntegrationsController(IHttpClientFactory httpClientFactory, ILogger<IntegrationsController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    [HttpPost("indeed/test")]
    public async Task<IActionResult> TestIndeedConnection([FromBody] IndeedConnectionTestRequest request)
    {
        var apiBaseUrl = string.IsNullOrWhiteSpace(request.ApiBaseUrl)
            ? "https://apis.indeed.com/graphql"
            : request.ApiBaseUrl.Trim();

        if (!Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out var targetUri))
            return BadRequest(new { error = "Invalid Indeed API URL." });

        if (targetUri.Scheme != Uri.UriSchemeHttps)
            return BadRequest(new { error = "Indeed API URL must use HTTPS." });

        if (string.IsNullOrWhiteSpace(request.BearerToken) && string.IsNullOrWhiteSpace(request.ApiKey))
            return BadRequest(new { error = "Provide a bearer token or API key." });

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(20);

        using var outgoing = new HttpRequestMessage(HttpMethod.Post, targetUri);
        outgoing.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var authMode = string.Equals(request.AuthMode, "apiKey", StringComparison.OrdinalIgnoreCase) ? "apiKey" : "bearer";
        if (authMode == "bearer" && !string.IsNullOrWhiteSpace(request.BearerToken))
            outgoing.Headers.Authorization = new AuthenticationHeaderValue("Bearer", request.BearerToken.Trim());
        if (authMode == "apiKey" && !string.IsNullOrWhiteSpace(request.ApiKey))
            outgoing.Headers.TryAddWithoutValidation("x-api-key", request.ApiKey.Trim());
        if (!string.IsNullOrWhiteSpace(request.PartnerId))
            outgoing.Headers.TryAddWithoutValidation("x-partner-id", request.PartnerId.Trim());
        if (!string.IsNullOrWhiteSpace(request.ClientId))
            outgoing.Headers.TryAddWithoutValidation("x-client-id", request.ClientId.Trim());

        outgoing.Content = new StringContent(
            JsonSerializer.Serialize(new { query = "query { __typename }" }),
            Encoding.UTF8,
            "application/json");

        try
        {
            using var response = await client.SendAsync(outgoing);
            var body = await response.Content.ReadAsStringAsync();
            var statusCode = (int)response.StatusCode;
            var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";

            string? typeName = null;
            string? message = null;
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.TryGetProperty("data", out var dataNode) &&
                    dataNode.ValueKind == JsonValueKind.Object &&
                    dataNode.TryGetProperty("__typename", out var typeNode))
                {
                    typeName = typeNode.GetString();
                }
                if (root.TryGetProperty("errors", out var errorsNode) &&
                    errorsNode.ValueKind == JsonValueKind.Array &&
                    errorsNode.GetArrayLength() > 0)
                {
                    var first = errorsNode[0];
                    if (first.TryGetProperty("message", out var msgNode))
                        message = msgNode.GetString();
                }
            }
            catch
            {
                // Keep raw response details if body is non-JSON.
            }

            return Ok(new
            {
                ok = response.IsSuccessStatusCode,
                statusCode,
                typeName,
                message,
                contentType
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Indeed integration test failed for {Target}", targetUri.Host);
            return StatusCode(502, new { error = "Unable to reach Indeed API endpoint.", detail = ex.Message });
        }
    }
}

public record IndeedConnectionTestRequest(
    string? ApiBaseUrl,
    string? AuthMode,
    string? BearerToken,
    string? ApiKey,
    string? PartnerId,
    string? ClientId
);

