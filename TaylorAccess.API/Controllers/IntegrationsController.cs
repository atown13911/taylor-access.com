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
    private const string DefaultIndeedGraphQlUrl = "https://apis.indeed.com/graphql";
    private const string DefaultIndeedTokenUrl = "https://apis.indeed.com/oauth/v2/tokens";
    private const string DefaultBlsApiUrl = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
    private const string DefaultBlsTruckDriverSeriesId = "OEUN0000000533032";

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
        var graphRequest = new IndeedGraphQlRequest(
            request.ApiBaseUrl,
            request.AuthMode,
            request.BearerToken,
            request.ApiKey,
            request.PartnerId,
            request.ClientId,
            "query { __typename }",
            null);
        var result = await ExecuteIndeedGraphQlAsync(graphRequest, "test");
        return Ok(result);
    }

    [HttpPost("indeed/authenticate")]
    public async Task<IActionResult> AuthenticateIndeed([FromBody] IndeedAuthenticateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ClientId) || string.IsNullOrWhiteSpace(request.ClientSecret))
            return BadRequest(new { error = "Client ID and Client Secret are required." });

        var tokenUrlRaw = string.IsNullOrWhiteSpace(request.TokenUrl) ? DefaultIndeedTokenUrl : request.TokenUrl.Trim();
        if (!Uri.TryCreate(tokenUrlRaw, UriKind.Absolute, out var tokenUri) || tokenUri.Scheme != Uri.UriSchemeHttps)
            return BadRequest(new { error = "Invalid token URL. HTTPS is required." });

        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(20);
            using var outgoing = new HttpRequestMessage(HttpMethod.Post, tokenUri);
            var form = new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = request.ClientId.Trim(),
                ["client_secret"] = request.ClientSecret.Trim()
            };
            if (!string.IsNullOrWhiteSpace(request.Scope))
                form["scope"] = request.Scope.Trim();

            outgoing.Content = new FormUrlEncodedContent(form);
            using var response = await client.SendAsync(outgoing);
            var body = await response.Content.ReadAsStringAsync();

            string? accessToken = null;
            int? expiresIn = null;
            string? tokenType = null;
            string? error = null;
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.TryGetProperty("access_token", out var tokenNode)) accessToken = tokenNode.GetString();
                if (root.TryGetProperty("token_type", out var typeNode)) tokenType = typeNode.GetString();
                if (root.TryGetProperty("expires_in", out var expNode) && expNode.TryGetInt32(out var exp)) expiresIn = exp;
                if (root.TryGetProperty("error", out var errNode)) error = errNode.GetString();
            }
            catch
            {
                // keep raw error body if non-json
            }

            return Ok(new
            {
                ok = response.IsSuccessStatusCode && !string.IsNullOrWhiteSpace(accessToken),
                statusCode = (int)response.StatusCode,
                tokenType,
                expiresIn,
                accessToken,
                error
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Indeed auth request failed for {TokenUrl}", tokenUrlRaw);
            return StatusCode(502, new { error = "Unable to reach Indeed token endpoint.", detail = ex.Message });
        }
    }

    [HttpPost("indeed/jobs/create")]
    public Task<IActionResult> CreateJobPosting([FromBody] IndeedJobMutationRequest request) =>
        ExecuteJobMutationAsync(
            request,
            "create",
            "mutation CreateJobPosting($input: JobPostingInput!) { createJobPosting(input: $input) { id status } }",
            includeScreeners: false);

    [HttpPost("indeed/jobs/create-with-screeners")]
    public Task<IActionResult> CreateJobPostingWithScreeners([FromBody] IndeedJobMutationRequest request) =>
        ExecuteJobMutationAsync(
            request,
            "create-with-screeners",
            "mutation CreateJobPosting($input: JobPostingInput!) { createJobPosting(input: $input) { id status } }",
            includeScreeners: true);

    [HttpPost("indeed/jobs/upsert")]
    public Task<IActionResult> UpsertJobPosting([FromBody] IndeedJobMutationRequest request) =>
        ExecuteJobMutationAsync(
            request,
            "upsert",
            "mutation UpsertJobPosting($input: JobPostingInput!) { upsertJobPosting(input: $input) { id status } }",
            includeScreeners: true);

    [HttpPost("indeed/jobs/list")]
    public async Task<IActionResult> ListJobPostings([FromBody] IndeedJobListRequest request)
    {
        if (request.JobIds is null || request.JobIds.Length == 0)
            return BadRequest(new { error = "Provide at least one job ID." });

        var query = string.IsNullOrWhiteSpace(request.Query)
            ? "query ListJobPostings($ids: [ID!]!) { jobPostings(ids: $ids) { id status } }"
            : request.Query.Trim();
        var graphRequest = request.ToGraphQlRequest(query, new { ids = request.JobIds });
        var result = await ExecuteIndeedGraphQlAsync(graphRequest, "jobs-list");
        return Ok(result);
    }

    [HttpPost("indeed/jobs/{jobId}/status")]
    public async Task<IActionResult> GetJobPostingStatus([FromRoute] string jobId, [FromBody] IndeedJobLookupRequest request)
    {
        var normalizedJobId = (jobId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedJobId))
            return BadRequest(new { error = "Job ID is required." });

        var query = string.IsNullOrWhiteSpace(request.Query)
            ? "query JobPostingStatus($id: ID!) { jobPosting(id: $id) { id status } }"
            : request.Query.Trim();
        var graphRequest = request.ToGraphQlRequest(query, new { id = normalizedJobId });
        var result = await ExecuteIndeedGraphQlAsync(graphRequest, "job-status");
        return Ok(result);
    }

    [HttpPost("indeed/jobs/{jobId}/expire")]
    public async Task<IActionResult> ExpireJobPosting([FromRoute] string jobId, [FromBody] IndeedJobLookupRequest request)
    {
        var normalizedJobId = (jobId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedJobId))
            return BadRequest(new { error = "Job ID is required." });

        var query = string.IsNullOrWhiteSpace(request.Query)
            ? "mutation ExpireJobPosting($id: ID!) { expireJobPosting(id: $id) { id status } }"
            : request.Query.Trim();
        var graphRequest = request.ToGraphQlRequest(query, new { id = normalizedJobId });
        var result = await ExecuteIndeedGraphQlAsync(graphRequest, "job-expire");
        return Ok(result);
    }

    [HttpPost("bls/test")]
    public async Task<IActionResult> TestBlsConnection([FromBody] BlsTestRequest request)
    {
        var now = DateTime.UtcNow;
        var year = now.Year.ToString();
        var seriesId = string.IsNullOrWhiteSpace(request.SeriesId) ? DefaultBlsTruckDriverSeriesId : request.SeriesId.Trim();
        var seriesRequest = new BlsSeriesRequest(
            request.ApiBaseUrl,
            request.ApiKey,
            new[] { seriesId },
            year,
            year,
            false,
            false,
            false);
        var result = await ExecuteBlsRequestAsync(seriesRequest, "bls-test");
        return Ok(result);
    }

    [HttpPost("bls/series")]
    public async Task<IActionResult> QueryBlsSeries([FromBody] BlsSeriesRequest request)
    {
        if (request.SeriesIds is null || request.SeriesIds.Length == 0)
            return BadRequest(new { error = "Provide at least one BLS series ID." });

        var cleanSeriesIds = request.SeriesIds
            .Select(v => (v ?? string.Empty).Trim())
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (cleanSeriesIds.Length == 0)
            return BadRequest(new { error = "Provide at least one valid BLS series ID." });

        var normalized = request with
        {
            SeriesIds = cleanSeriesIds
        };
        var result = await ExecuteBlsRequestAsync(normalized, "bls-series");
        return Ok(result);
    }

    private async Task<IActionResult> ExecuteJobMutationAsync(
        IndeedJobMutationRequest request,
        string operationName,
        string defaultQuery,
        bool includeScreeners)
    {
        if (!request.Job.HasValue || request.Job.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return BadRequest(new { error = "Job payload is required." });

        var query = string.IsNullOrWhiteSpace(request.Query) ? defaultQuery : request.Query.Trim();
        object variables;
        if (request.Variables.HasValue && request.Variables.Value.ValueKind != JsonValueKind.Null)
        {
            variables = JsonElementToObject(request.Variables.Value) ?? new { };
        }
        else
        {
            var input = JsonElementToDictionary(request.Job.Value);
            if (includeScreeners && request.ScreenerQuestions.HasValue && request.ScreenerQuestions.Value.ValueKind != JsonValueKind.Null)
            {
                input["screenerQuestions"] = JsonElementToObject(request.ScreenerQuestions.Value);
            }
            variables = new { input };
        }

        var graphRequest = request.ToGraphQlRequest(query, variables);
        var result = await ExecuteIndeedGraphQlAsync(graphRequest, operationName);
        return Ok(result);
    }

    private async Task<object> ExecuteIndeedGraphQlAsync(IndeedGraphQlRequest request, string operationName)
    {
        var apiBaseUrl = string.IsNullOrWhiteSpace(request.ApiBaseUrl)
            ? DefaultIndeedGraphQlUrl
            : request.ApiBaseUrl.Trim();

        if (!Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out var targetUri) || targetUri.Scheme != Uri.UriSchemeHttps)
            return new { ok = false, statusCode = 0, message = "Invalid Indeed API URL. HTTPS is required." };

        if (string.IsNullOrWhiteSpace(request.BearerToken) && string.IsNullOrWhiteSpace(request.ApiKey))
            return new { ok = false, statusCode = 0, message = "Provide a bearer token or API key." };

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(25);

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

        var payload = new
        {
            query = request.Query,
            variables = request.Variables
        };
        outgoing.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await client.SendAsync(outgoing);
            var body = await response.Content.ReadAsStringAsync();
            var statusCode = (int)response.StatusCode;
            var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";

            object? data = null;
            object? errors = null;
            string? message = null;
            string? typeName = null;

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.TryGetProperty("data", out var dataNode))
                {
                    data = JsonElementToObject(dataNode);
                    if (dataNode.ValueKind == JsonValueKind.Object &&
                        dataNode.TryGetProperty("__typename", out var typeNode))
                    {
                        typeName = typeNode.GetString();
                    }
                }
                if (root.TryGetProperty("errors", out var errorsNode))
                {
                    errors = JsonElementToObject(errorsNode);
                    if (errorsNode.ValueKind == JsonValueKind.Array && errorsNode.GetArrayLength() > 0)
                    {
                        var first = errorsNode[0];
                        if (first.TryGetProperty("message", out var msgNode))
                            message = msgNode.GetString();
                    }
                }
            }
            catch
            {
                // If response is non-JSON, keep a short message and continue.
                message = string.IsNullOrWhiteSpace(body) ? "Non-JSON response from upstream." : body[..Math.Min(body.Length, 400)];
            }

            return new
            {
                ok = response.IsSuccessStatusCode && errors is null,
                statusCode,
                operation = operationName,
                typeName,
                message,
                contentType,
                data,
                errors
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Indeed GraphQL operation {Operation} failed for {Target}", operationName, targetUri.Host);
            return new
            {
                ok = false,
                statusCode = 502,
                operation = operationName,
                message = "Unable to reach Indeed API endpoint.",
                detail = ex.Message
            };
        }
    }

    private async Task<object> ExecuteBlsRequestAsync(BlsSeriesRequest request, string operationName)
    {
        var apiBaseUrl = string.IsNullOrWhiteSpace(request.ApiBaseUrl)
            ? DefaultBlsApiUrl
            : request.ApiBaseUrl.Trim();

        if (!Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out var targetUri) || targetUri.Scheme != Uri.UriSchemeHttps)
            return new { ok = false, statusCode = 0, operation = operationName, message = "Invalid BLS API URL. HTTPS is required." };

        var startYear = NormalizeYear(request.StartYear, DateTime.UtcNow.Year - 1);
        var endYear = NormalizeYear(request.EndYear, DateTime.UtcNow.Year);
        if (endYear < startYear)
            (startYear, endYear) = (endYear, startYear);

        var payload = new Dictionary<string, object?>
        {
            ["seriesid"] = request.SeriesIds,
            ["startyear"] = startYear.ToString(),
            ["endyear"] = endYear.ToString(),
            ["catalog"] = request.Catalog ?? false,
            ["calculations"] = request.Calculations ?? false,
            ["annualaverage"] = request.AnnualAverage ?? false
        };
        if (!string.IsNullOrWhiteSpace(request.ApiKey))
            payload["registrationkey"] = request.ApiKey.Trim();

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(25);

        using var outgoing = new HttpRequestMessage(HttpMethod.Post, targetUri);
        outgoing.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        outgoing.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await client.SendAsync(outgoing);
            var body = await response.Content.ReadAsStringAsync();
            var statusCode = (int)response.StatusCode;
            var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";

            object? results = null;
            object? series = null;
            object? messages = null;
            string? upstreamStatus = null;
            int seriesCount = 0;
            bool blsSuccess = false;
            string? message = null;

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.TryGetProperty("status", out var statusNode))
                {
                    upstreamStatus = statusNode.GetString();
                    blsSuccess = string.Equals(upstreamStatus, "REQUEST_SUCCEEDED", StringComparison.OrdinalIgnoreCase);
                }
                if (root.TryGetProperty("message", out var msgNode))
                {
                    messages = JsonElementToObject(msgNode);
                    if (msgNode.ValueKind == JsonValueKind.Array && msgNode.GetArrayLength() > 0)
                        message = msgNode[0].GetString();
                }
                if (root.TryGetProperty("Results", out var resultsNode))
                {
                    results = JsonElementToObject(resultsNode);
                    if (resultsNode.ValueKind == JsonValueKind.Object && resultsNode.TryGetProperty("series", out var seriesNode))
                    {
                        series = JsonElementToObject(seriesNode);
                        if (seriesNode.ValueKind == JsonValueKind.Array)
                            seriesCount = seriesNode.GetArrayLength();
                    }
                }
            }
            catch
            {
                message = string.IsNullOrWhiteSpace(body) ? "Non-JSON response from BLS endpoint." : body[..Math.Min(body.Length, 400)];
            }

            return new
            {
                ok = response.IsSuccessStatusCode && blsSuccess,
                statusCode,
                operation = operationName,
                message,
                contentType,
                upstreamStatus,
                seriesCount,
                startYear,
                endYear,
                results,
                series,
                messages
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "BLS operation {Operation} failed for {Target}", operationName, targetUri.Host);
            return new
            {
                ok = false,
                statusCode = 502,
                operation = operationName,
                message = "Unable to reach BLS API endpoint.",
                detail = ex.Message
            };
        }
    }

    private static int NormalizeYear(string? raw, int fallback)
    {
        if (int.TryParse((raw ?? string.Empty).Trim(), out var parsed))
        {
            if (parsed < 1900) return 1900;
            if (parsed > 2100) return 2100;
            return parsed;
        }
        return fallback;
    }

    private static Dictionary<string, object?> JsonElementToDictionary(JsonElement element)
    {
        var parsed = JsonElementToObject(element);
        if (parsed is Dictionary<string, object?> dict)
            return dict;
        return new Dictionary<string, object?>();
    }

    private static object? JsonElementToObject(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Object => element.EnumerateObject()
                .ToDictionary(p => p.Name, p => JsonElementToObject(p.Value)),
            JsonValueKind.Array => element.EnumerateArray().Select(JsonElementToObject).ToList(),
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number when element.TryGetInt64(out var l) => l,
            JsonValueKind.Number when element.TryGetDecimal(out var d) => d,
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => element.ToString()
        };
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

public record IndeedAuthenticateRequest(
    string? TokenUrl,
    string? ClientId,
    string? ClientSecret,
    string? Scope
);

public record IndeedGraphQlRequest(
    string? ApiBaseUrl,
    string? AuthMode,
    string? BearerToken,
    string? ApiKey,
    string? PartnerId,
    string? ClientId,
    string Query,
    object? Variables
);

public record IndeedJobMutationRequest(
    string? ApiBaseUrl,
    string? AuthMode,
    string? BearerToken,
    string? ApiKey,
    string? PartnerId,
    string? ClientId,
    string? Query,
    JsonElement? Variables,
    JsonElement? Job,
    JsonElement? ScreenerQuestions
)
{
    public IndeedGraphQlRequest ToGraphQlRequest(string query, object variables) =>
        new(ApiBaseUrl, AuthMode, BearerToken, ApiKey, PartnerId, ClientId, query, variables);
}

public record IndeedJobListRequest(
    string? ApiBaseUrl,
    string? AuthMode,
    string? BearerToken,
    string? ApiKey,
    string? PartnerId,
    string? ClientId,
    string[] JobIds,
    string? Query
)
{
    public IndeedGraphQlRequest ToGraphQlRequest(string query, object variables) =>
        new(ApiBaseUrl, AuthMode, BearerToken, ApiKey, PartnerId, ClientId, query, variables);
}

public record IndeedJobLookupRequest(
    string? ApiBaseUrl,
    string? AuthMode,
    string? BearerToken,
    string? ApiKey,
    string? PartnerId,
    string? ClientId,
    string? Query
)
{
    public IndeedGraphQlRequest ToGraphQlRequest(string query, object variables) =>
        new(ApiBaseUrl, AuthMode, BearerToken, ApiKey, PartnerId, ClientId, query, variables);
}

public record BlsTestRequest(
    string? ApiBaseUrl,
    string? ApiKey,
    string? SeriesId
);

public record BlsSeriesRequest(
    string? ApiBaseUrl,
    string? ApiKey,
    string[] SeriesIds,
    string? StartYear,
    string? EndYear,
    bool? Catalog,
    bool? Calculations,
    bool? AnnualAverage
);

