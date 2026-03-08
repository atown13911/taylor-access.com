using System.Diagnostics;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

var backendUrl = Environment.GetEnvironmentVariable("BACKEND_URL")
    ?? builder.Configuration["BackendUrl"]
    ?? "http://taylor-accesscom.railway.internal:8080";

var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET_KEY")
    ?? builder.Configuration["Jwt:SecretKey"]
    ?? "TaylorAccess-Super-Secret-Key-Change-In-Production-2026!";

var mongoUrl = Environment.GetEnvironmentVariable("MONGO_URL")
    ?? builder.Configuration["MongoUrl"];

// MongoDB for audit logging
IMongoCollection<BsonDocument>? auditCollection = null;
if (!string.IsNullOrEmpty(mongoUrl))
{
    try
    {
        var mongoClient = new MongoClient(mongoUrl);
        var db = mongoClient.GetDatabase("taylor_access");
        auditCollection = db.GetCollection<BsonDocument>("gateway_logs");
        Console.WriteLine("MongoDB connected for gateway audit logging");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"MongoDB connection failed: {ex.Message} — gateway logging disabled");
    }
}

// YARP Reverse Proxy
builder.Services.AddReverseProxy()
    .LoadFromMemory(
        new[]
        {
            new Yarp.ReverseProxy.Configuration.RouteConfig
            {
                RouteId = "all",
                ClusterId = "backend",
                Match = new Yarp.ReverseProxy.Configuration.RouteMatch { Path = "{**catch-all}" }
            }
        },
        new[]
        {
            new Yarp.ReverseProxy.Configuration.ClusterConfig
            {
                ClusterId = "backend",
                Destinations = new Dictionary<string, Yarp.ReverseProxy.Configuration.DestinationConfig>
                {
                    { "default", new Yarp.ReverseProxy.Configuration.DestinationConfig { Address = backendUrl } }
                }
            }
        }
    );

// JWT Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "TaylorAccess.API",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "TaylorAccess.Client",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(5)
        };
    });

// CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(origin =>
        {
            var uri = new Uri(origin);
            return uri.Host == "localhost"
                || uri.Host == "taylor-access.com"
                || uri.Host == "www.taylor-access.com"
                || uri.Host.EndsWith(".pages.dev")
                || uri.Host == "tss-portal.com"
                || uri.Host == "www.tss-portal.com"
                || uri.Host == "taylor-tms.net"
                || uri.Host == "taylor-crm.com"
                || uri.Host == "taylor-academy.net"
                || uri.Host == "taylor-assets.com"
                || uri.Host == "taylor-accounting.net"
                || uri.Host == "taylor-last.com"
                || uri.Host == "taylorcommlink.com"
                || uri.Host == "taylorshippingsolutions.com";
        })
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();
    });
});

builder.Services.AddHealthChecks();

var app = builder.Build();

app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor
        | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto
});

app.UseCors();
app.UseAuthentication();

// Request logging middleware — logs every request to MongoDB
app.Use(async (context, next) =>
{
    var sw = Stopwatch.StartNew();
    var method = context.Request.Method;
    var path = context.Request.Path.ToString();
    var query = context.Request.QueryString.ToString();
    var ip = context.Connection.RemoteIpAddress?.ToString();
    var userAgent = context.Request.Headers["User-Agent"].FirstOrDefault();
    var origin = context.Request.Headers["Origin"].FirstOrDefault();
    var userId = context.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

    await next();

    sw.Stop();
    var statusCode = context.Response.StatusCode;

    Console.WriteLine($"[{DateTime.UtcNow:HH:mm:ss}] {method} {path} → {statusCode} ({sw.ElapsedMilliseconds}ms) user={userId ?? "-"}");

    if (auditCollection != null)
    {
        try
        {
            var doc = new BsonDocument
            {
                { "timestamp", DateTime.UtcNow },
                { "method", method },
                { "path", path },
                { "query", query ?? "" },
                { "statusCode", statusCode },
                { "durationMs", sw.ElapsedMilliseconds },
                { "userId", userId ?? BsonNull.Value.ToString() },
                { "ip", ip ?? "" },
                { "userAgent", userAgent ?? "" },
                { "origin", origin ?? "" },
                { "service", "gateway" }
            };
            _ = auditCollection.InsertOneAsync(doc);
        }
        catch { }
    }
});

app.MapHealthChecks("/health");
app.MapReverseProxy();

Console.WriteLine($"Taylor Access Gateway started — forwarding to {backendUrl}");
Console.WriteLine($"MongoDB logging: {(auditCollection != null ? "enabled" : "disabled")}");
app.Run();
