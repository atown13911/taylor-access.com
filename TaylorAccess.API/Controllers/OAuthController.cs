using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("oauth")]
public class OAuthController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly IJwtService _jwtService;
    private readonly IAuditService _auditService;

    public OAuthController(TaylorAccessDbContext context, IJwtService jwtService, IAuditService auditService)
    {
        _context = context;
        _jwtService = jwtService;
        _auditService = auditService;
    }

    /// <summary>
    /// OAuth2 Authorization endpoint - initiates login flow
    /// GET /oauth/authorize?response_type=code&client_id=...&redirect_uri=...&scope=...&state=...
    /// </summary>
    [HttpGet("authorize")]
    public async Task<ActionResult> Authorize(
        [FromQuery] string response_type,
        [FromQuery] string client_id,
        [FromQuery] string redirect_uri,
        [FromQuery] string? scope,
        [FromQuery] string? state)
    {
        if (response_type != "code")
            return BadRequest(new { error = "unsupported_response_type", error_description = "Only 'code' is supported" });

        var client = await _context.OAuthClients.FirstOrDefaultAsync(c => c.ClientId == client_id && c.Status == "active");
        if (client == null)
            return BadRequest(new { error = "invalid_client", error_description = "Client not found" });

        var allowedUris = JsonSerializer.Deserialize<List<string>>(client.RedirectUris) ?? new();
        if (!allowedUris.Any(u => redirect_uri.StartsWith(u)))
            return BadRequest(new { error = "invalid_redirect_uri", error_description = "Redirect URI not registered" });

        // Return client info for the consent page to render
        return Ok(new
        {
            clientId = client.ClientId,
            clientName = client.Name,
            clientDescription = client.Description,
            clientLogo = client.LogoUrl,
            redirectUri = redirect_uri,
            scope = scope ?? "openid profile email",
            state,
            loginUrl = $"/oauth/authorize/login"
        });
    }

    /// <summary>
    /// Process login and issue authorization code
    /// POST /oauth/authorize/login
    /// </summary>
    [HttpPost("authorize/login")]
    [AllowAnonymous]
    public async Task<ActionResult> AuthorizeLogin([FromBody] OAuthLoginRequest request)
    {
        var client = await _context.OAuthClients.FirstOrDefaultAsync(c => c.ClientId == request.ClientId && c.Status == "active");
        if (client == null)
            return BadRequest(new { error = "invalid_client" });

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower() && u.Status == "active");
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { error = "invalid_credentials", error_description = "Invalid email or password" });

        // Generate authorization code
        var code = OAuthAuthorizationCode.Generate();
        _context.OAuthAuthorizationCodes.Add(new OAuthAuthorizationCode
        {
            Code = code,
            ClientId = request.ClientId,
            UserId = user.Id,
            RedirectUri = request.RedirectUri,
            Scopes = request.Scope ?? "openid profile email",
            ExpiresAt = DateTime.UtcNow.AddMinutes(5)
        });
        await _context.SaveChangesAsync();

        await _auditService.LogAsync("oauth_authorize", "OAuthClient", null,
            $"User {user.Email} authorized {client.Name}");

        var redirectUrl = $"{request.RedirectUri}?code={code}";
        if (!string.IsNullOrEmpty(request.State))
            redirectUrl += $"&state={request.State}";

        return Ok(new { redirectUrl, code });
    }

    /// <summary>
    /// OAuth2 Token endpoint - exchange code for tokens
    /// POST /oauth/token
    /// </summary>
    [HttpPost("token")]
    [AllowAnonymous]
    public async Task<ActionResult<TokenResponse>> Token([FromForm] string grant_type, [FromForm] string? code,
        [FromForm] string? redirect_uri, [FromForm] string? client_id, [FromForm] string? client_secret,
        [FromForm] string? refresh_token)
    {
        // Also accept JSON body
        if (string.IsNullOrEmpty(grant_type) && Request.ContentType?.Contains("json") == true)
        {
            var jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var body = await JsonSerializer.DeserializeAsync<TokenRequest>(Request.Body, jsonOptions);
            if (body != null)
            {
                grant_type = body.GrantType;
                code = body.Code;
                redirect_uri = body.RedirectUri;
                client_id = body.ClientId;
                client_secret = body.ClientSecret;
                refresh_token = body.RefreshToken;
            }
        }

        if (grant_type == "authorization_code")
            return await HandleAuthorizationCodeGrant(code, redirect_uri, client_id, client_secret);

        if (grant_type == "refresh_token")
            return await HandleRefreshTokenGrant(refresh_token, client_id, client_secret);

        return BadRequest(new { error = "unsupported_grant_type" });
    }

    /// <summary>
    /// OAuth2 UserInfo endpoint - returns current user info
    /// GET /oauth/userinfo
    /// </summary>
    [HttpGet("userinfo")]
    [Authorize]
    public async Task<ActionResult> UserInfo()
    {
        var userIdClaim = User.FindFirst("userId")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        var user = await _context.Users
            .Include(u => u.Organization)
            .Include(u => u.Department)
            .Include(u => u.Position)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null) return NotFound();

        return Ok(new
        {
            sub = user.Id.ToString(),
            name = user.Name,
            email = user.Email,
            phone = user.Phone,
            role = user.Role,
            status = user.Status,
            avatar = user.Avatar,
            organizationId = user.OrganizationId,
            organizationName = user.Organization?.Name,
            departmentId = user.DepartmentId,
            departmentName = user.Department?.Name,
            positionId = user.PositionId,
            positionTitle = user.Position?.Title,
            jobTitle = user.JobTitle,
            timezone = user.Timezone,
            language = user.Language,
            country = user.Country,
            lastLoginAt = user.LastLoginAt,
            createdAt = user.CreatedAt
        });
    }

    /// <summary>
    /// Revoke a token
    /// POST /oauth/revoke
    /// </summary>
    [HttpPost("revoke")]
    public async Task<ActionResult> Revoke([FromBody] RevokeRequest request)
    {
        var accessToken = await _context.OAuthAccessTokens.FirstOrDefaultAsync(t => t.Token == request.Token);
        if (accessToken != null) { accessToken.IsRevoked = true; await _context.SaveChangesAsync(); return Ok(); }

        var refreshToken = await _context.OAuthRefreshTokens.FirstOrDefaultAsync(t => t.Token == request.Token);
        if (refreshToken != null) { refreshToken.IsRevoked = true; await _context.SaveChangesAsync(); return Ok(); }

        return Ok();
    }

    /// <summary>
    /// Authorize using existing session (already logged-in user)
    /// POST /oauth/authorize/consent
    /// </summary>
    [HttpPost("authorize/consent")]
    [Authorize]
    public async Task<ActionResult> AuthorizeConsent([FromBody] OAuthConsentRequest request)
    {
        var client = await _context.OAuthClients.FirstOrDefaultAsync(c => c.ClientId == request.ClientId && c.Status == "active");
        if (client == null)
            return BadRequest(new { error = "invalid_client" });

        var userIdClaim = User.FindFirst("userId")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdClaim, out var userId))
            return Unauthorized(new { error = "invalid_token" });

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId && u.Status == "active");
        if (user == null)
            return Unauthorized(new { error = "user_not_found" });

        var code = OAuthAuthorizationCode.Generate();
        _context.OAuthAuthorizationCodes.Add(new OAuthAuthorizationCode
        {
            Code = code,
            ClientId = request.ClientId,
            UserId = user.Id,
            RedirectUri = request.RedirectUri,
            Scopes = request.Scope ?? "openid profile email",
            ExpiresAt = DateTime.UtcNow.AddMinutes(5)
        });
        await _context.SaveChangesAsync();

        await _auditService.LogAsync("oauth_authorize", "OAuthClient", null,
            $"User {user.Email} authorized {client.Name} (via session)");

        var redirectUrl = $"{request.RedirectUri}?code={code}";
        if (!string.IsNullOrEmpty(request.State))
            redirectUrl += $"&state={request.State}";

        return Ok(new { redirectUrl, code });
    }

    // ============ CLIENT MANAGEMENT ============

    /// <summary>
    /// List all registered OAuth clients
    /// </summary>
    [HttpGet("clients")]
    [Authorize]
    public async Task<ActionResult> GetClients()
    {
        var clients = await _context.OAuthClients
            .OrderBy(c => c.Name)
            .Select(c => new
            {
                c.Id, c.ClientId, c.Name, c.Description, c.LogoUrl, c.HomepageUrl,
                c.Status, c.Scopes, c.CreatedAt,
                redirectUris = c.RedirectUris,
                activeTokens = _context.OAuthAccessTokens.Count(t => t.ClientId == c.ClientId && !t.IsRevoked && t.ExpiresAt > DateTime.UtcNow)
            })
            .ToListAsync();

        return Ok(clients);
    }

    /// <summary>
    /// Register a new OAuth client (app)
    /// </summary>
    [HttpPost("clients")]
    [Authorize]
    public async Task<ActionResult> RegisterClient([FromBody] RegisterClientRequest request)
    {
        var clientId = OAuthClient.GenerateClientId();
        var clientSecret = OAuthClient.GenerateClientSecret();

        var client = new OAuthClient
        {
            ClientId = clientId,
            ClientSecret = BCrypt.Net.BCrypt.HashPassword(clientSecret),
            Name = request.Name,
            Description = request.Description,
            RedirectUris = JsonSerializer.Serialize(request.RedirectUris),
            HomepageUrl = request.HomepageUrl
        };

        _context.OAuthClients.Add(client);
        await _context.SaveChangesAsync();

        await _auditService.LogAsync("oauth_client_created", "OAuthClient", client.Id, $"Registered app: {request.Name}");

        return Ok(new
        {
            id = client.Id,
            clientId,
            clientSecret,
            name = client.Name,
            message = "Save the client_secret - it won't be shown again"
        });
    }

    /// <summary>
    /// Delete an OAuth client
    /// </summary>
    [HttpDelete("clients/{id}")]
    [Authorize]
    public async Task<ActionResult> DeleteClient(int id)
    {
        var client = await _context.OAuthClients.FindAsync(id);
        if (client == null) return NotFound();

        _context.OAuthClients.Remove(client);
        await _context.SaveChangesAsync();

        await _auditService.LogAsync("oauth_client_deleted", "OAuthClient", id, $"Deleted app: {client.Name}");
        return Ok(new { message = $"Client '{client.Name}' deleted" });
    }

    /// <summary>
    /// Get app-specific role assignments for a user
    /// </summary>
    [HttpGet("users/{userId}/apps")]
    [Authorize]
    public async Task<ActionResult> GetUserAppRoles(int userId)
    {
        var assignments = await _context.AppRoleAssignments
            .Where(a => a.UserId == userId)
            .Select(a => new
            {
                a.Id, a.AppClientId, a.Role, a.Permissions, a.Status, a.CreatedAt,
                appName = _context.OAuthClients.Where(c => c.ClientId == a.AppClientId).Select(c => c.Name).FirstOrDefault()
            })
            .ToListAsync();

        return Ok(assignments);
    }

    /// <summary>
    /// Assign a role to a user for a specific app
    /// </summary>
    [HttpPost("users/{userId}/apps")]
    [Authorize]
    public async Task<ActionResult> AssignAppRole(int userId, [FromBody] AssignAppRoleRequest request)
    {
        var existing = await _context.AppRoleAssignments
            .FirstOrDefaultAsync(a => a.UserId == userId && a.AppClientId == request.AppClientId);

        if (existing != null)
        {
            existing.Role = request.Role;
            existing.Permissions = request.Permissions;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _context.AppRoleAssignments.Add(new AppRoleAssignment
            {
                UserId = userId,
                AppClientId = request.AppClientId,
                Role = request.Role,
                Permissions = request.Permissions
            });
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "Role assigned" });
    }

    // ============ PRIVATE METHODS ============

    private async Task<ActionResult<TokenResponse>> HandleAuthorizationCodeGrant(string? code, string? redirectUri, string? clientId, string? clientSecret)
    {
        if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(clientId))
            return BadRequest(new { error = "invalid_request", error_description = "code and client_id required" });

        var authCode = await _context.OAuthAuthorizationCodes
            .FirstOrDefaultAsync(c => c.Code == code && c.ClientId == clientId);

        if (authCode == null || !authCode.IsValid)
            return BadRequest(new { error = "invalid_grant", error_description = "Invalid or expired authorization code" });

        if (!string.IsNullOrEmpty(redirectUri) && authCode.RedirectUri != redirectUri)
            return BadRequest(new { error = "invalid_grant", error_description = "Redirect URI mismatch" });

        // Validate client secret if provided
        if (!string.IsNullOrEmpty(clientSecret))
        {
            var client = await _context.OAuthClients.FirstOrDefaultAsync(c => c.ClientId == clientId);
            if (client == null || !BCrypt.Net.BCrypt.Verify(clientSecret, client.ClientSecret))
                return Unauthorized(new { error = "invalid_client" });
        }

        authCode.IsUsed = true;

        var user = await _context.Users.FindAsync(authCode.UserId);
        if (user == null)
            return BadRequest(new { error = "invalid_grant", error_description = "User not found" });

        // Generate tokens
        var accessToken = _jwtService.GenerateToken(user);
        var refreshTokenValue = OAuthRefreshToken.Generate();

        _context.OAuthAccessTokens.Add(new OAuthAccessToken
        {
            Token = accessToken,
            ClientId = clientId,
            UserId = user.Id,
            Scopes = authCode.Scopes,
            ExpiresAt = DateTime.UtcNow.AddHours(1)
        });

        _context.OAuthRefreshTokens.Add(new OAuthRefreshToken
        {
            Token = refreshTokenValue,
            ClientId = clientId,
            UserId = user.Id,
            Scopes = authCode.Scopes,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        });

        user.LastLoginAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        await _auditService.LogAsync("oauth_token_issued", "User", user.Id,
            $"Token issued for app {clientId}");

        return Ok(new TokenResponse(accessToken, "Bearer", 3600, refreshTokenValue, authCode.Scopes));
    }

    private async Task<ActionResult<TokenResponse>> HandleRefreshTokenGrant(string? refreshToken, string? clientId, string? clientSecret)
    {
        if (string.IsNullOrEmpty(refreshToken))
            return BadRequest(new { error = "invalid_request", error_description = "refresh_token required" });

        var token = await _context.OAuthRefreshTokens
            .FirstOrDefaultAsync(t => t.Token == refreshToken);

        if (token == null || !token.IsValid)
            return BadRequest(new { error = "invalid_grant", error_description = "Invalid or expired refresh token" });

        if (!string.IsNullOrEmpty(clientId) && token.ClientId != clientId)
            return BadRequest(new { error = "invalid_grant", error_description = "Client mismatch" });

        var user = await _context.Users.FindAsync(token.UserId);
        if (user == null)
            return BadRequest(new { error = "invalid_grant" });

        // Revoke old refresh token and issue new ones
        token.IsRevoked = true;

        var newAccessToken = _jwtService.GenerateToken(user);
        var newRefreshToken = OAuthRefreshToken.Generate();

        _context.OAuthAccessTokens.Add(new OAuthAccessToken
        {
            Token = newAccessToken,
            ClientId = token.ClientId,
            UserId = user.Id,
            Scopes = token.Scopes,
            ExpiresAt = DateTime.UtcNow.AddHours(1)
        });

        _context.OAuthRefreshTokens.Add(new OAuthRefreshToken
        {
            Token = newRefreshToken,
            ClientId = token.ClientId,
            UserId = user.Id,
            Scopes = token.Scopes,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        });

        await _context.SaveChangesAsync();

        return Ok(new TokenResponse(newAccessToken, "Bearer", 3600, newRefreshToken, token.Scopes));
    }
}

// Additional DTOs
public record OAuthLoginRequest(string Email, string Password, string ClientId, string RedirectUri, string? Scope, string? State);
public record OAuthConsentRequest(string ClientId, string RedirectUri, string? Scope, string? State);
public record RevokeRequest(string Token);
public record AssignAppRoleRequest(string AppClientId, string Role, string? Permissions);
