using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;
using TaylorAccess.API.Converters;
using TaylorAccess.API.Models;
using BCrypt.Net;

AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

var builder = WebApplication.CreateBuilder(args);

builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Infrastructure", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.Routing", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.Mvc", LogLevel.Warning);

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.MimeTypes = new[] { "application/json", "text/plain", "text/html", "application/javascript", "text/css" };
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        options.JsonSerializerOptions.Converters.Add(new DateTimeUtcConverter());
        options.JsonSerializerOptions.Converters.Add(new NullableDateTimeUtcConverter());
    });

builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "Taylor Access HR API",
        Version = "v1",
        Description = "HR Management System API for Taylor Access",
        Contact = new Microsoft.OpenApi.Models.OpenApiContact
        {
            Name = "Taylor Access Support",
            Email = "support@taylor-access.com"
        }
    });

    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Enter 'Bearer' [space] and then your token.",
        Name = "Authorization",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// Database
var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
string connectionString;
if (!string.IsNullOrEmpty(databaseUrl) && databaseUrl.StartsWith("postgresql://"))
{
    var uri = new Uri(databaseUrl);
    var userInfo = uri.UserInfo.Split(':');
    connectionString = $"Host={uri.Host};Port={uri.Port};Database={uri.AbsolutePath.TrimStart('/')};Username={userInfo[0]};Password={userInfo[1]};SSL Mode=Disable;Trust Server Certificate=true";
}
else
{
    connectionString = databaseUrl
        ?? builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Host=localhost;Database=taylor_access;Username=postgres;Password=postgres";
}

builder.Services.AddDbContext<TaylorAccessDbContext>(options =>
    options.UseNpgsql(connectionString));

// JWT Authentication
var jwtSecretKey = Environment.GetEnvironmentVariable("JWT_SECRET_KEY")
    ?? builder.Configuration["Jwt:SecretKey"]
    ?? "TaylorAccess-Super-Secret-Key-Change-In-Production-2026!";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecretKey)),
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "TaylorAccess.API",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "TaylorAccess.Client",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(5)
        };
    });

builder.Services.AddAuthorization();

// CORS - allow taylor-access.com and all Cloudflare Pages preview URLs
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
                    || uri.Host == "taylor-tms.net"
                    || uri.Host == "www.taylor-tms.net"
                    || uri.Host == "taylor-assets.com"
                    || uri.Host == "www.taylor-assets.com"
                    || uri.Host == "taylor-crm.com"
                    || uri.Host == "www.taylor-crm.com"
                    || uri.Host == "taylor-academy.net"
                    || uri.Host == "www.taylor-academy.net"
                    || uri.Host == "tss-portal.com"
                    || uri.Host == "www.tss-portal.com";
            })
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

// Services
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentUserService>();
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IRoleService, RoleService>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddSingleton<EncryptionService>();
builder.Services.AddSingleton<IMongoDbService, MongoDbService>();
builder.Services.AddScoped<ITotpService, TotpService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IStorageService, LocalStorageService>();

builder.Services.AddHealthChecks()
    .AddDbContextCheck<TaylorAccessDbContext>();

builder.Services.AddSingleton<MetricCacheService>();

var app = builder.Build();

app.UseResponseCompression();

// Resolve real client IPs behind Railway/Cloudflare proxy
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor 
        | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto
});

// Always enable Swagger for Taylor Access
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health");

// Seed default data
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<TaylorAccessDbContext>();
    var roleService = scope.ServiceProvider.GetRequiredService<IRoleService>();

    try
    {
        context.Database.Migrate();
    }
    catch
    {
        context.Database.EnsureCreated();
    }

    await roleService.SeedDefaultRolesAsync();

    if (!context.Users.Any())
    {
        var adminUser = new User
        {
            Name = "Admin",
            Email = "admin@taylor-access.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123"),
            Role = "product_owner",
            Status = "active",
            IsEmailVerified = true
        };
        context.Users.Add(adminUser);

        var org = new Organization
        {
            Name = "Taylor Access",
            Email = "info@taylor-access.com",
            Status = "active"
        };
        context.Organizations.Add(org);
        await context.SaveChangesAsync();

        adminUser.OrganizationId = org.Id;
        await context.SaveChangesAsync();
    }

    // Seed OAuth clients
    if (!context.OAuthClients.Any())
    {
        var clients = new[]
        {
            new OAuthClient
            {
                ClientId = "ta_vantac_tms",
                ClientSecret = BCrypt.Net.BCrypt.HashPassword("vantac-sso-secret-2026"),
                Name = "Van-Tac TMS",
                Description = "Transportation Management System",
                HomepageUrl = "https://taylor-tms.net",
                RedirectUris = System.Text.Json.JsonSerializer.Serialize(new[] { "https://taylor-tms.net", "https://taylor-tms.net/callback", "http://localhost:4200", "http://localhost:4200/callback" })
            },
            new OAuthClient
            {
                ClientId = "ta_taylor_crm",
                ClientSecret = BCrypt.Net.BCrypt.HashPassword("crm-sso-secret-2026"),
                Name = "Taylor CRM",
                Description = "Customer Relationship Management",
                HomepageUrl = "https://taylor-crm.com",
                RedirectUris = System.Text.Json.JsonSerializer.Serialize(new[] { "https://taylor-crm.com", "https://taylor-crm.com/callback", "https://taylor-crm.pages.dev", "https://taylor-crm.pages.dev/callback", "http://localhost:4201", "http://localhost:4201/callback" })
            },
            new OAuthClient
            {
                ClientId = "ta_taylor_academy",
                ClientSecret = BCrypt.Net.BCrypt.HashPassword("academy-sso-secret-2026"),
                Name = "Taylor Academy",
                Description = "Learning Management System",
                HomepageUrl = "https://taylor-academy.net",
                RedirectUris = System.Text.Json.JsonSerializer.Serialize(new[] { "https://taylor-academy.net", "https://taylor-academy.net/callback", "http://localhost:4202", "http://localhost:4202/callback" })
            }
        };
        context.OAuthClients.AddRange(clients);
        await context.SaveChangesAsync();
        Console.WriteLine($"Seeded {clients.Length} OAuth clients: VanTac TMS, Taylor CRM, Taylor Academy");
    }
}

Console.WriteLine("Taylor Access HR API is running!");
Console.WriteLine($"Swagger: http://localhost:{(app.Environment.IsDevelopment() ? "5000" : "80")}/swagger");

app.Run();
