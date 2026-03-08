using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;
using MongoDB.Bson.IO;
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

var internalApiKey = Environment.GetEnvironmentVariable("INTERNAL_API_KEY") ?? "ta-internal-2026";

MongoClient? mongoClient = null;
IMongoCollection<BsonDocument>? gatewayLogCollection = null;

if (!string.IsNullOrEmpty(mongoUrl))
{
    try
    {
        var connStr = mongoUrl;
        if (!connStr.Contains("authSource"))
            connStr += (connStr.Contains('?') ? "&" : "?") + "authSource=admin";

        mongoClient = new MongoClient(connStr);
        var db = mongoClient.GetDatabase("taylor_access");
        gatewayLogCollection = db.GetCollection<BsonDocument>("gateway_logs");
        Console.WriteLine("MongoDB connected for gateway logging + internal proxy");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"MongoDB connection failed: {ex.Message}");
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

// ============ Internal MongoDB proxy endpoints ============
// The backend calls these instead of connecting to MongoDB directly.
// Secured via INTERNAL_API_KEY header (only accessible from Railway internal network).

bool ValidateInternalKey(HttpContext ctx)
{
    var key = ctx.Request.Headers["X-Internal-Key"].FirstOrDefault();
    return key == internalApiKey;
}

IMongoDatabase? GetMongoDb(string dbName)
{
    return mongoClient?.GetDatabase(dbName);
}

// POST /internal/mongo/{db}/{collection} - Insert one document
app.MapPost("/internal/mongo/{db}/{collection}", async (HttpContext ctx, string db, string collection) =>
{
    if (!ValidateInternalKey(ctx)) return Results.StatusCode(403);
    if (mongoClient == null) return Results.StatusCode(503);

    var body = await new StreamReader(ctx.Request.Body).ReadToEndAsync();
    var doc = BsonDocument.Parse(body);
    var col = GetMongoDb(db)!.GetCollection<BsonDocument>(collection);
    await col.InsertOneAsync(doc);
    var id = doc["_id"].ToString();
    return Results.Ok(new { id });
});

// PUT /internal/mongo/{db}/{collection}/{id} - Update one document
app.MapPut("/internal/mongo/{db}/{collection}/{id}", async (HttpContext ctx, string db, string collection, string id) =>
{
    if (!ValidateInternalKey(ctx)) return Results.StatusCode(403);
    if (mongoClient == null) return Results.StatusCode(503);

    var body = await new StreamReader(ctx.Request.Body).ReadToEndAsync();
    var updateDoc = BsonDocument.Parse(body);
    var col = GetMongoDb(db)!.GetCollection<BsonDocument>(collection);
    var filter = Builders<BsonDocument>.Filter.Eq("_id", ObjectId.Parse(id));
    await col.UpdateOneAsync(filter, new BsonDocument("$set", updateDoc));
    return Results.Ok(new { updated = true });
});

// POST /internal/mongo/{db}/{collection}/push - Push to array field
app.MapPost("/internal/mongo/{db}/{collection}/push/{id}", async (HttpContext ctx, string db, string collection, string id) =>
{
    if (!ValidateInternalKey(ctx)) return Results.StatusCode(403);
    if (mongoClient == null) return Results.StatusCode(503);

    var body = await new StreamReader(ctx.Request.Body).ReadToEndAsync();
    var pushDoc = BsonDocument.Parse(body);
    var col = GetMongoDb(db)!.GetCollection<BsonDocument>(collection);
    var filter = Builders<BsonDocument>.Filter.Eq("_id", ObjectId.Parse(id));
    await col.UpdateOneAsync(filter, new BsonDocument("$push", pushDoc));
    return Results.Ok(new { pushed = true });
});

// POST /internal/mongo/{db}/{collection}/query - Query documents
app.MapPost("/internal/mongo/{db}/{collection}/query", async (HttpContext ctx, string db, string collection) =>
{
    if (!ValidateInternalKey(ctx)) return Results.StatusCode(403);
    if (mongoClient == null) return Results.StatusCode(503);

    var body = await new StreamReader(ctx.Request.Body).ReadToEndAsync();
    var queryDoc = BsonDocument.Parse(body);

    var filter = queryDoc.Contains("filter") ? queryDoc["filter"].AsBsonDocument : new BsonDocument();
    var sort = queryDoc.Contains("sort") ? queryDoc["sort"].AsBsonDocument : new BsonDocument("_id", -1);
    var limit = queryDoc.Contains("limit") ? queryDoc["limit"].AsInt32 : 100;
    var skip = queryDoc.Contains("skip") ? queryDoc["skip"].AsInt32 : 0;

    var col = GetMongoDb(db)!.GetCollection<BsonDocument>(collection);
    var docs = await col.Find(filter).Sort(sort).Skip(skip).Limit(limit).ToListAsync();
    var total = await col.CountDocumentsAsync(filter);

    var jsonSettings = new MongoDB.Bson.IO.JsonWriterSettings { OutputMode = JsonOutputMode.CanonicalExtendedJson };
    var results = docs.Select(d => d.ToJson(jsonSettings)).ToList();

    return Results.Ok(new { total, data = results });
});

// POST /internal/mongo/{db}/{collection}/find-one - Find single document
app.MapPost("/internal/mongo/{db}/{collection}/find-one", async (HttpContext ctx, string db, string collection) =>
{
    if (!ValidateInternalKey(ctx)) return Results.StatusCode(403);
    if (mongoClient == null) return Results.StatusCode(503);

    var body = await new StreamReader(ctx.Request.Body).ReadToEndAsync();
    var filter = BsonDocument.Parse(body);
    var col = GetMongoDb(db)!.GetCollection<BsonDocument>(collection);
    var doc = await col.Find(filter).FirstOrDefaultAsync();

    if (doc == null) return Results.Ok(new { data = (string?)null });
    var jsonSettings = new MongoDB.Bson.IO.JsonWriterSettings { OutputMode = JsonOutputMode.CanonicalExtendedJson };
    return Results.Ok(new { data = doc.ToJson(jsonSettings) });
});

// POST /internal/mongo/{db}/{collection}/count - Count documents
app.MapPost("/internal/mongo/{db}/{collection}/count", async (HttpContext ctx, string db, string collection) =>
{
    if (!ValidateInternalKey(ctx)) return Results.StatusCode(403);
    if (mongoClient == null) return Results.StatusCode(503);

    var body = await new StreamReader(ctx.Request.Body).ReadToEndAsync();
    var filter = string.IsNullOrWhiteSpace(body) ? new BsonDocument() : BsonDocument.Parse(body);
    var col = GetMongoDb(db)!.GetCollection<BsonDocument>(collection);
    var count = await col.CountDocumentsAsync(filter);
    return Results.Ok(new { count });
});

// DELETE /internal/mongo/{db}/{collection} - Delete documents matching filter
app.MapDelete("/internal/mongo/{db}/{collection}", async (HttpContext ctx, string db, string collection) =>
{
    if (!ValidateInternalKey(ctx)) return Results.StatusCode(403);
    if (mongoClient == null) return Results.StatusCode(503);

    var body = await new StreamReader(ctx.Request.Body).ReadToEndAsync();
    var filter = BsonDocument.Parse(body);
    var col = GetMongoDb(db)!.GetCollection<BsonDocument>(collection);
    var result = await col.DeleteManyAsync(filter);
    return Results.Ok(new { deleted = result.DeletedCount });
});

// ============ Request logging middleware ============
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/internal"))
    {
        await next();
        return;
    }

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

    if (gatewayLogCollection != null)
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
            _ = gatewayLogCollection.InsertOneAsync(doc);
        }
        catch { }
    }
});

app.MapHealthChecks("/health");
app.MapReverseProxy();

Console.WriteLine($"Taylor Access Gateway started — forwarding to {backendUrl}");
Console.WriteLine($"MongoDB proxy: {(mongoClient != null ? "enabled" : "disabled")}");
app.Run();
