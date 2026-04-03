using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;
using BCrypt.Net;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class AuthController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly IJwtService _jwtService;
    private readonly ILogger<AuthController> _logger;
    private readonly IAuditService _auditService;

    public AuthController(TaylorAccessDbContext context, IJwtService jwtService, ILogger<AuthController> logger, IAuditService auditService)
    {
        _context = context;
        _jwtService = jwtService;
        _logger = logger;
        _auditService = auditService;
    }

    /// <summary>
    /// Register a new user
    /// </summary>
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request)
    {
        // Check if email already exists
        if (await _context.Users.AnyAsync(u => u.Email == request.Email))
        {
            return BadRequest(new { error = "Email already registered" });
        }

        // Create organization if company name provided
        Organization? organization = null;
        if (!string.IsNullOrEmpty(request.CompanyName))
        {
            organization = new Organization
            {
                Name = request.CompanyName,
                Email = request.Email,
                Phone = request.Phone
            };
            _context.Organizations.Add(organization);
            await _context.SaveChangesAsync();
        }

        // Create user
        var user = new User
        {
            Name = request.Name,
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Phone = request.Phone,
            Role = organization != null ? "admin" : "user",
            OrganizationId = organization?.Id,
            ApiKey = Models.User.GenerateApiKey(),
            ApiSecret = Models.User.GenerateApiSecret()
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var token = await _jwtService.GenerateTokenAsync(user);

        _logger.LogInformation("User registered: {Email}", user.Email);

        return Ok(new AuthResponse
        {
            Token = token,
            User = new UserDto(user),
            Organization = organization != null ? new OrganizationDto(organization) : null
        });
    }

    /// <summary>
    /// Login with email and password
    /// </summary>
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        var user = await _context.Users
            .Include(u => u.Organization)
            .FirstOrDefaultAsync(u => u.Email == request.Email);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            // Log failed login attempt
            await _auditService.LogAsync(new AuditLog
            {
                Action = "login_failed",
                EntityType = "User",
                UserEmail = request.Email,
                Description = $"Failed login attempt for {request.Email}",
                IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
                UserAgent = Request.Headers["User-Agent"].FirstOrDefault(),
                Timestamp = DateTime.UtcNow,
                Severity = "warning"
            });
            return Unauthorized(new { error = "Invalid email or password" });
        }

        if (user.Status != "active")
        {
            return Unauthorized(new { error = "Account is not active" });
        }

        if (user.Role != "product_owner" && user.Role != "superadmin" && user.Role != "admin")
        {
            var hasAccess = await _context.AppRoleAssignments
                .AnyAsync(a => a.UserId == user.Id && a.AppClientId == "ta_taylor_access" && a.Status == "active");
            if (!hasAccess)
            {
                return StatusCode(403, new { error = "You do not have access to Taylor Access. Contact your administrator." });
            }
        }

        user.LastLoginAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var token = await _jwtService.GenerateTokenAsync(user);

        // Log successful login
        await _auditService.LogAsync(new AuditLog
        {
            UserId = user.Id,
            UserName = user.Name,
            UserEmail = user.Email,
            OrganizationId = user.OrganizationId,
            Action = "login",
            EntityType = "User",
            EntityId = user.Id,
            EntityName = user.Name,
            Description = $"{user.Name} ({user.Email}) logged in",
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = Request.Headers["User-Agent"].FirstOrDefault(),
            Timestamp = DateTime.UtcNow
        });

        _logger.LogInformation("User logged in: {Email}", user.Email);

        return Ok(new AuthResponse
        {
            Token = token,
            User = new UserDto(user),
            Organization = user.Organization != null ? new OrganizationDto(user.Organization) : null
        });
    }

    /// <summary>
    /// Exchange a portal SSO token for a Taylor Access token.
    /// Validates the portal token via the portal's userinfo endpoint,
    /// then finds the local user and issues a Taylor Access JWT.
    /// </summary>
    [HttpPost("sso-exchange")]
    public async Task<ActionResult<AuthResponse>> SsoExchange([FromBody] SsoExchangeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.PortalToken))
            return BadRequest(new { error = "Portal token is required" });

        var portalApiUrl = Environment.GetEnvironmentVariable("PORTAL_API_URL")
                           ?? "https://ttac-gateway-production.up.railway.app/api/v1/open/tss-portal";

        try
        {
            using var httpClient = new HttpClient();
            httpClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", request.PortalToken);

            var response = await httpClient.GetAsync($"{portalApiUrl}/oauth/userinfo");
            if (!response.IsSuccessStatusCode)
                return Unauthorized(new { error = "Invalid portal token" });

            var json = await response.Content.ReadAsStringAsync();
            var userInfo = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(json);

            var email = userInfo.GetProperty("email").GetString();
            if (string.IsNullOrEmpty(email))
                return Unauthorized(new { error = "Portal token missing email claim" });

            var user = await _context.Users
                .Include(u => u.Organization)
                .FirstOrDefaultAsync(u => u.Email.ToLower() == email.ToLower());

            if (user == null)
                return StatusCode(403, new { error = "No Taylor Access account found for this email. Contact your administrator." });

            if (user.Status != "active")
                return StatusCode(403, new { error = "Account is not active" });

            user.LastLoginAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var token = await _jwtService.GenerateTokenAsync(user);

            await _auditService.LogAsync(new AuditLog
            {
                UserId = user.Id,
                UserName = user.Name,
                UserEmail = user.Email,
                OrganizationId = user.OrganizationId,
                Action = "sso_login",
                EntityType = "User",
                EntityId = user.Id,
                EntityName = user.Name,
                Description = $"{user.Name} ({user.Email}) logged in via SSO",
                IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
                UserAgent = Request.Headers["User-Agent"].FirstOrDefault(),
                Timestamp = DateTime.UtcNow
            });

            return Ok(new AuthResponse
            {
                Token = token,
                User = new UserDto(user),
                Organization = user.Organization != null ? new OrganizationDto(user.Organization) : null
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SSO token exchange failed");
            return StatusCode(500, new { error = "Token exchange failed" });
        }
    }

    /// <summary>
    /// Get current user profile
    /// </summary>
    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> GetCurrentUser()
    {
        // Email is authoritative across all JWT issuers
        var emailClaim = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
            ?? User.FindFirst("email")?.Value;

        User? user = null;
        if (!string.IsNullOrEmpty(emailClaim))
        {
            user = await _context.Users
                .Include(u => u.Organization)
                .Include(u => u.Department)
                .Include(u => u.Position)
                .FirstOrDefaultAsync(u => u.Email.ToLower() == emailClaim.ToLower());
        }

        // Fall back to numeric ID if no email claim
        if (user == null)
        {
            var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(userIdClaim, out var userId))
            {
                user = await _context.Users
                    .Include(u => u.Organization)
                    .Include(u => u.Department)
                    .Include(u => u.Position)
                    .FirstOrDefaultAsync(u => u.Id == userId);
            }
        }

        if (user == null)
            return NotFound();

        return Ok(new { data = new UserDto(user) });
    }

    /// <summary>
    /// Resolve the current authenticated user.
    /// Email is checked first — it's the reliable identifier across Portal and Taylor Access JWTs.
    /// Falls back to numeric ID only when no email claim is present (native TA JWTs without email).
    /// </summary>
    private async Task<User?> ResolveCurrentUserAsync()
    {
        // Email is authoritative — same across all issuers
        var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
            ?? User.FindFirst("email")?.Value;
        if (!string.IsNullOrEmpty(email))
        {
            var byEmail = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email.ToLower());
            if (byEmail != null) return byEmail;
        }

        // Fall back to numeric ID (only reliable for native Taylor Access JWTs)
        var idClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (int.TryParse(idClaim, out var id))
            return await _context.Users.FirstOrDefaultAsync(u => u.Id == id);

        return null;
    }

    /// <summary>
    /// Update user profile
    /// </summary>
    [Authorize]
    [HttpPut("profile")]
    public async Task<ActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var user = await ResolveCurrentUserAsync();
        if (user == null)
            return NotFound();

        // Update fields
        if (!string.IsNullOrWhiteSpace(request.Name))
            user.Name = request.Name;
        if (!string.IsNullOrWhiteSpace(request.Email))
            user.Email = request.Email;
        user.Phone = request.Phone;
        user.PositionId = request.PositionId;
        user.JobTitle = request.JobTitle; // Free-text fallback
        user.DepartmentId = request.DepartmentId;
        user.Timezone = request.Timezone ?? user.Timezone;
        // Language field would go here if User model had it (currently doesn't)
        user.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { message = "Profile updated successfully", data = new UserDto(user) });
    }

    /// <summary>
    /// Upload user avatar
    /// </summary>
    [Authorize]
    [HttpPost("avatar")]
    public async Task<ActionResult> UploadAvatar([FromForm] IFormFile avatar)
    {
        var user = await ResolveCurrentUserAsync();
        if (user == null)
            return NotFound();

        if (avatar == null || avatar.Length == 0)
            return BadRequest(new { error = "No file uploaded" });

        // Validate file type
        var allowedTypes = new[] { "image/jpeg", "image/png", "image/gif", "image/webp" };
        if (!allowedTypes.Contains(avatar.ContentType.ToLower()))
            return BadRequest(new { error = "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" });

        // Validate file size (max 2MB for base64 storage)
        if (avatar.Length > 2 * 1024 * 1024)
            return BadRequest(new { error = "File too large. Maximum size is 2MB" });

        // Convert to base64 and store in database (survives container restarts)
        using (var memoryStream = new MemoryStream())
        {
            await avatar.CopyToAsync(memoryStream);
            var imageBytes = memoryStream.ToArray();
            var base64String = Convert.ToBase64String(imageBytes);
            
            // Store as data URL
            user.Avatar = $"data:{avatar.ContentType};base64,{base64String}";
        }

        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { message = "Avatar uploaded successfully", avatarUrl = user.Avatar });
    }

    /// <summary>
    /// Delete user avatar
    /// </summary>
    [Authorize]
    [HttpDelete("avatar")]
    public async Task<ActionResult> DeleteAvatar()
    {
        var user = await ResolveCurrentUserAsync();
        if (user == null)
            return NotFound();

        // Delete file if exists
        if (!string.IsNullOrEmpty(user.Avatar))
        {
            var filePath = Path.Combine("wwwroot", user.Avatar.TrimStart('/'));
            if (System.IO.File.Exists(filePath))
            {
                System.IO.File.Delete(filePath);
            }
        }

        user.Avatar = null;
        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { message = "Avatar removed successfully" });
    }

    /// <summary>
    /// Get user preferences (theme, sidebar settings, etc.)
    /// </summary>
    [Authorize]
    [HttpGet("preferences")]
    public async Task<ActionResult> GetPreferences()
    {
        var user = await ResolveCurrentUserAsync();
        if (user == null)
            return NotFound();

        return Ok(new { preferences = user.Preferences });
    }

    /// <summary>
    /// Update user preferences
    /// </summary>
    [Authorize]
    [HttpPut("preferences")]
    public async Task<ActionResult> UpdatePreferences([FromBody] UpdatePreferencesRequest request)
    {
        var user = await ResolveCurrentUserAsync();
        if (user == null)
            return NotFound();

        user.Preferences = request.Preferences;
        user.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { message = "Preferences updated successfully", preferences = user.Preferences });
    }

    /// <summary>
    /// Refresh API credentials
    /// </summary>
    [Authorize]
    [HttpPost("refresh-api-key")]
    public async Task<ActionResult> RefreshApiKey()
    {
        var user = await ResolveCurrentUserAsync();
        if (user == null)
            return NotFound();

        user.ApiKey = Models.User.GenerateApiKey();
        user.ApiSecret = Models.User.GenerateApiSecret();
        user.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            apiKey = user.ApiKey,
            apiSecret = user.ApiSecret
        });
    }

    /// <summary>
    /// Change password
    /// </summary>
    [Authorize]
    [HttpPost("change-password")]
    public async Task<ActionResult> ChangePassword([FromBody] Models.ChangePasswordRequest request)
    {
        if (request.NewPassword != request.ConfirmPassword)
        {
            return BadRequest(new { error = "New passwords do not match" });
        }
        
        var user = await ResolveCurrentUserAsync();
        if (user == null)
            return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
        {
            return BadRequest(new { error = "Current password is incorrect" });
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { message = "Password changed successfully" });
    }
}

// DTOs
public record RegisterRequest(
    string Name,
    string Email,
    string Password,
    string? Phone,
    string? CompanyName
);

public record LoginRequest(string Email, string Password);

public record UpdateProfileRequest(
    string? Name,
    string? Email,
    string? Phone,
    int? PositionId,
    string? JobTitle,
    int? DepartmentId,
    string? Timezone,
    string? Language
);

// ChangePasswordRequest is defined in Models/PasswordReset.cs

public class AuthResponse
{
    public string Token { get; set; } = string.Empty;
    public UserDto? User { get; set; }
    public OrganizationDto? Organization { get; set; }
}

public class UserDto
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string? Alias { get; set; }
    public string? Gender { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? IdNumber { get; set; }
    public string? Height { get; set; }
    public string? Weight { get; set; }
    public string? EyeColor { get; set; }
    public string? HairColor { get; set; }
    public string? Ethnicity { get; set; }
    public string? Religion { get; set; }
    public string Email { get; set; }
    public string? PersonalEmail { get; set; }
    public string? Phone { get; set; }
    public string? WorkPhone { get; set; }
    public string? WorkPhoneCountry { get; set; }
    public string? CellPhone { get; set; }
    public string? CellPhoneCountry { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? ZipCode { get; set; }
    public string? AvatarUrl { get; set; }
    public string? Timezone { get; set; }
    public string? Country { get; set; }
    public string? Language { get; set; }
    public string Role { get; set; }
    public string Status { get; set; }
    public int? OrganizationId { get; set; }
    public List<int>? OrganizationIds { get; set; } // Multi-organization assignments
    public string? OrganizationName { get; set; }
    public int? SatelliteId { get; set; }
    public int? AgencyId { get; set; }
    public int? TerminalId { get; set; }
    public int? DivisionId { get; set; }
    public int? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public int? PositionId { get; set; }
    public string? PositionTitle { get; set; }
    public string? JobTitle { get; set; }
    public string? ApiKey { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public string? Preferences { get; set; }

    // Zoom integration
    public string? ZoomEmail { get; set; }
    public string? ZoomUserId { get; set; }
    public bool ZoomLinked { get; set; }
    
    // Integration accounts
    public string? LandstarUsername { get; set; }
    public string? LandstarPassword { get; set; }
    public string? PowerdatUsername { get; set; }
    public string? PowerdatPassword { get; set; }

    public UserDto(User user) : this(user, null) { }
    
    public UserDto(User user, EncryptionService? encryption)
    {
        Id = user.Id;
        Name = user.Name;
        Alias = user.Alias;
        Gender = user.Gender;
        DateOfBirth = user.DateOfBirth;
        IdNumber = user.IdNumber;
        Height = user.Height;
        Weight = user.Weight;
        EyeColor = user.EyeColor;
        HairColor = user.HairColor;
        Ethnicity = user.Ethnicity;
        Religion = user.Religion;
        Email = user.Email;
        PersonalEmail = user.PersonalEmail;
        Phone = user.Phone;
        WorkPhone = user.WorkPhone;
        WorkPhoneCountry = user.WorkPhoneCountry;
        CellPhone = user.CellPhone;
        CellPhoneCountry = user.CellPhoneCountry;
        Address = user.Address;
        City = user.City;
        State = user.State;
        ZipCode = user.ZipCode;
        AvatarUrl = user.Avatar;
        Timezone = user.Timezone;
        Country = user.Country;
        Language = user.Language;
        Role = user.Role;
        Status = user.Status;
        OrganizationId = user.OrganizationId;
        OrganizationIds = user.UserOrganizations?.Select(uo => uo.OrganizationId).ToList();
        OrganizationName = user.Organization?.Name;
        SatelliteId = user.SatelliteId;
        AgencyId = user.AgencyId;
        TerminalId = user.TerminalId;
        DivisionId = user.DivisionId;
        DepartmentId = user.DepartmentId;
        DepartmentName = user.Department?.Name;
        PositionId = user.PositionId;
        PositionTitle = user.Position?.Title;
        JobTitle = user.JobTitle;
        ApiKey = user.ApiKey;
        CreatedAt = user.CreatedAt;
        LastLoginAt = user.LastLoginAt;
        Preferences = user.Preferences;
        ZoomEmail = user.ZoomEmail;
        ZoomUserId = user.ZoomUserId;
        ZoomLinked = !string.IsNullOrEmpty(user.ZoomUserId);
        LandstarUsername = user.LandstarUsername;
        LandstarPassword = encryption != null ? encryption.Decrypt(user.LandstarPassword ?? "") : user.LandstarPassword;
        PowerdatUsername = user.PowerdatUsername;
        PowerdatPassword = encryption != null ? encryption.Decrypt(user.PowerdatPassword ?? "") : user.PowerdatPassword;
    }
}

public class OrganizationDto
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string Status { get; set; }

    public OrganizationDto(Organization org)
    {
        Id = org.Id;
        Name = org.Name;
        Email = org.Email;
        Phone = org.Phone;
        Status = org.Status;
    }
}

/// <summary>
/// Setup controller for initial system configuration
/// </summary>
[ApiController]
[Route("api/v1/[controller]")]
public class SetupController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly IJwtService _jwtService;
    private readonly ILogger<SetupController> _logger;

    public SetupController(TaylorAccessDbContext context, IJwtService jwtService, ILogger<SetupController> logger)
    {
        _context = context;
        _jwtService = jwtService;
        _logger = logger;
    }

    /// <summary>
    /// Check if initial setup is required
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult> GetSetupStatus()
    {
        var hasUsers = await _context.Users.AnyAsync();
        var hasOrg = await _context.Organizations.AnyAsync();

        return Ok(new
        {
            setupRequired = !hasUsers,
            hasOrganization = hasOrg,
            hasUsers = hasUsers
        });
    }

    /// <summary>
    /// Initialize the system with a Product Owner account
    /// Only works if no users exist in the system
    /// The first user is ALWAYS a Product Owner with ultimate control
    /// </summary>
    [HttpPost("initialize")]
    public async Task<ActionResult<AuthResponse>> Initialize([FromBody] InitializeRequest? request)
    {
        // Check if system already has users
        if (await _context.Users.AnyAsync())
        {
            return BadRequest(new { error = "System already initialized. Use login instead." });
        }

        // Use defaults if no request provided
        var email = request?.Email ?? "admin@vantac.com";
        var password = request?.Password ?? "Admin123!";
        var name = request?.Name ?? "Product Owner";
        var companyName = request?.CompanyName ?? "Van Tac Logistics";

        // Get or create default organization
        var organization = await _context.Organizations.FirstOrDefaultAsync();
        if (organization == null)
        {
            organization = new Organization
            {
                Name = companyName,
                Email = email,
                Phone = "555-000-0001",
                Status = "active"
            };
            _context.Organizations.Add(organization);
            await _context.SaveChangesAsync();
        }

        // Create Product Owner - the first user with ultimate control
        var productOwner = new User
        {
            Name = name,
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Phone = "555-000-0001",
            Role = "product_owner", // Highest level role
            Status = "active",
            OrganizationId = organization.Id,
            ApiKey = Models.User.GenerateApiKey(),
            ApiSecret = Models.User.GenerateApiSecret()
        };

        _context.Users.Add(productOwner);
        await _context.SaveChangesAsync();

        var token = await _jwtService.GenerateTokenAsync(productOwner);

        _logger.LogInformation("System initialized with Product Owner: {Email}", email);

        return Ok(new AuthResponse
        {
            Token = token,
            User = new UserDto(productOwner),
            Organization = new OrganizationDto(organization)
        });
    }

    /// <summary>
    /// Product Owner can create additional users of any role
    /// </summary>
    [Authorize(Roles = "product_owner")]
    [HttpPost("create-admin")]
    public async Task<ActionResult<UserDto>> CreateAdmin([FromBody] CreateAdminRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { error = "Email and password are required" });
        }

        // Check if email already exists
        if (await _context.Users.AnyAsync(u => u.Email.ToLower() == request.Email.ToLower()))
        {
            return BadRequest(new { error = "Email already in use" });
        }

        // Only product_owner can create superadmin or product_owner
        var validRoles = new[] { "superadmin", "admin", "manager", "dispatcher", "driver", "user" };
        var role = request.Role?.ToLower() ?? "admin";
        
        if (!validRoles.Contains(role))
        {
            return BadRequest(new { error = "Invalid role. Cannot create another product_owner." });
        }

        var organization = await _context.Organizations.FirstOrDefaultAsync();

        var newUser = new User
        {
            Name = request.Name ?? "New Admin",
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Phone = request.Phone,
            Role = role,
            Status = "active",
            OrganizationId = organization?.Id,
            ApiKey = Models.User.GenerateApiKey(),
            ApiSecret = Models.User.GenerateApiSecret()
        };

        _context.Users.Add(newUser);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Product Owner created new {Role}: {Email}", role, request.Email);

        return Ok(new UserDto(newUser));
    }

}

public static class SessionState
{
    public static long Version { get; private set; } = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    public static void Invalidate() => Version = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
}

public record InitializeRequest(string? Email, string? Password, string? Name, string? CompanyName);
public record CreateAdminRequest(string Email, string Password, string? Name, string? Phone, string? Role);
public record UpdatePreferencesRequest(string? Preferences);
public record SsoExchangeRequest(string PortalToken);





