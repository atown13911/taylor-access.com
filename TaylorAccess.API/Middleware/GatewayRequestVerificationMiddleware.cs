using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Caching.Memory;

namespace TaylorAccess.API.Middleware;

public class GatewayRequestVerificationMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GatewayRequestVerificationMiddleware> _logger;
    private readonly string _signingKey;
    private readonly bool _enforceGatewayInternal;
    private readonly long _maxSkewSeconds;
    private readonly IMemoryCache _nonceCache;

    public GatewayRequestVerificationMiddleware(
        RequestDelegate next,
        IConfiguration configuration,
        ILogger<GatewayRequestVerificationMiddleware> logger,
        IMemoryCache nonceCache)
    {
        _next = next;
        _logger = logger;
        _nonceCache = nonceCache;
        _signingKey = configuration["GATEWAY_INTERNAL_SIGNING_KEY"]
            ?? Environment.GetEnvironmentVariable("GATEWAY_INTERNAL_SIGNING_KEY")
            ?? string.Empty;
        _enforceGatewayInternal = bool.TryParse(
            configuration["ENFORCE_GATEWAY_INTERNAL"] ?? Environment.GetEnvironmentVariable("ENFORCE_GATEWAY_INTERNAL"),
            out var enforce) && enforce;
        _maxSkewSeconds = long.TryParse(
            configuration["GATEWAY_MAX_SKEW_SECONDS"] ?? Environment.GetEnvironmentVariable("GATEWAY_MAX_SKEW_SECONDS"),
            out var skew) ? Math.Max(15, skew) : 60;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/internal", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        if (!_enforceGatewayInternal)
        {
            await _next(context);
            return;
        }

        if (string.IsNullOrWhiteSpace(_signingKey))
        {
            _logger.LogWarning("ENFORCE_GATEWAY_INTERNAL is enabled but GATEWAY_INTERNAL_SIGNING_KEY is empty.");
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(new { error = "Gateway verification key not configured" });
            return;
        }

        var internalHeader = context.Request.Headers["X-GW-Internal"].ToString();
        var timestamp = context.Request.Headers["X-GW-Timestamp"].ToString();
        var nonce = context.Request.Headers["X-GW-Nonce"].ToString();
        var requestId = context.Request.Headers["X-GW-Request-Id"].ToString();
        var userId = context.Request.Headers["X-GW-User-Id"].ToString();
        var orgId = context.Request.Headers["X-GW-Org-Id"].ToString();
        var roles = context.Request.Headers["X-GW-Roles"].ToString();
        var app = context.Request.Headers["X-GW-App"].ToString();
        var signature = context.Request.Headers["X-GW-Signature"].ToString();

        if (internalHeader != "1" || string.IsNullOrWhiteSpace(timestamp) || string.IsNullOrWhiteSpace(nonce) || string.IsNullOrWhiteSpace(signature))
        {
            await RejectUnauthorized(context, "Missing internal gateway headers");
            return;
        }

        if (!long.TryParse(timestamp, out var requestUnixTs))
        {
            await RejectUnauthorized(context, "Invalid gateway timestamp");
            return;
        }

        var nowUnixTs = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (Math.Abs(nowUnixTs - requestUnixTs) > _maxSkewSeconds)
        {
            await RejectUnauthorized(context, "Stale gateway timestamp");
            return;
        }

        if (_nonceCache.TryGetValue(nonce, out _))
        {
            await RejectUnauthorized(context, "Replay detected");
            return;
        }

        _nonceCache.Set(nonce, true, TimeSpan.FromMinutes(3));

        var method = context.Request.Method;
        var path = context.Request.Path.Value ?? string.Empty;
        var query = context.Request.QueryString.Value ?? string.Empty;
        var canonical = $"{method}\n{path}\n{query}\n{timestamp}\n{nonce}\n{requestId}\n{userId}\n{orgId}\n{roles}\n{app}";
        var expected = ComputeSignature(canonical);

        if (!FixedTimeEquals(expected, signature))
        {
            await RejectUnauthorized(context, "Invalid gateway signature");
            return;
        }

        await _next(context);
    }

    private static bool FixedTimeEquals(string expected, string provided)
    {
        var left = Encoding.UTF8.GetBytes(expected);
        var right = Encoding.UTF8.GetBytes(provided);
        return left.Length == right.Length && CryptographicOperations.FixedTimeEquals(left, right);
    }

    private string ComputeSignature(string canonical)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_signingKey));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(canonical));
        return Convert.ToBase64String(hash);
    }

    private static async Task RejectUnauthorized(HttpContext context, string error)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error });
    }
}
