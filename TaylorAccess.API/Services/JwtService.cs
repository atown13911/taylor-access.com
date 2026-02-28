using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public interface IJwtService
{
    string GenerateToken(User user);
    Task<string> GenerateTokenAsync(User user);
    ClaimsPrincipal? ValidateToken(string token);
}

public class JwtService : IJwtService
{
    private readonly IConfiguration _configuration;
    private readonly TaylorAccessDbContext _context;
    private readonly string _secretKey;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly int _expirationHours;

    public JwtService(IConfiguration configuration, TaylorAccessDbContext context)
    {
        _configuration = configuration;
        _context = context;
        _secretKey = Environment.GetEnvironmentVariable("JWT_SECRET_KEY")
            ?? _configuration["Jwt:SecretKey"]
            ?? "TaylorAccess-Super-Secret-Key-Change-In-Production-2026!";
        _issuer = Environment.GetEnvironmentVariable("Jwt__Issuer")
            ?? _configuration["Jwt:Issuer"] ?? "TaylorAccess.API";
        _audience = Environment.GetEnvironmentVariable("Jwt__Audience")
            ?? _configuration["Jwt:Audience"] ?? "TaylorAccess.Client";
        _expirationHours = int.Parse(_configuration["Jwt:ExpirationHours"] ?? "24");
    }

    public string GenerateToken(User user) => GenerateTokenWithPermissions(user, null);

    public async Task<string> GenerateTokenAsync(User user)
    {
        List<string>? permissions = null;
        try
        {
            var role = await _context.Roles.FirstOrDefaultAsync(r => r.Name.ToLower() == user.Role.ToLower());
            if (role != null)
            {
                permissions = JsonSerializer.Deserialize<List<string>>(role.Permissions) ?? new();
                if (permissions.Contains("admin:full"))
                {
                    var allPerms = typeof(Permissions).GetFields()
                        .Where(f => f.FieldType == typeof(string) && f.Name != "Descriptions")
                        .Select(f => f.GetValue(null)?.ToString())
                        .Where(v => !string.IsNullOrEmpty(v))
                        .Select(v => v!)
                        .ToList();
                    var navPerms = permissions.Where(p => p.StartsWith("nav:")).ToList();
                    allPerms.AddRange(navPerms);
                    permissions = allPerms;
                }
            }
        }
        catch { }

        return GenerateTokenWithPermissions(user, permissions);
    }

    private string GenerateTokenWithPermissions(User user, List<string>? permissions)
    {
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secretKey));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new("userId", user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new("email", user.Email),
            new(ClaimTypes.Name, user.Name),
            new("name", user.Name),
            new(ClaimTypes.Role, user.Role),
            new("role", user.Role)
        };
        
        if (user.OrganizationId.HasValue)
        {
            claims.Add(new("organizationId", user.OrganizationId.Value.ToString()));
            claims.Add(new("organization_id", user.OrganizationId.Value.ToString()));
        }

        if (user.SatelliteId.HasValue)
            claims.Add(new("satelliteId", user.SatelliteId.Value.ToString()));
        if (user.AgencyId.HasValue)
            claims.Add(new("agencyId", user.AgencyId.Value.ToString()));
        if (user.TerminalId.HasValue)
            claims.Add(new("terminalId", user.TerminalId.Value.ToString()));

        if (permissions != null)
            claims.Add(new("permissions", JsonSerializer.Serialize(permissions)));

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(_expirationHours),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public ClaimsPrincipal? ValidateToken(string token)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_secretKey);

        try
        {
            var principal = tokenHandler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ValidateIssuer = true,
                ValidIssuer = _issuer,
                ValidateAudience = true,
                ValidAudience = _audience,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            }, out _);

            return principal;
        }
        catch
        {
            return null;
        }
    }
}
