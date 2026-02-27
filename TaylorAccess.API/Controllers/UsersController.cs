using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly EncryptionService _encryption;

    public UsersController(TaylorAccessDbContext context, CurrentUserService currentUserService, IAuditService auditService, EncryptionService encryption)
    {
        _context = context;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _encryption = encryption;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetUsers(
        [FromQuery] string? role,
        [FromQuery] string? status,
        [FromQuery] int? organizationId,
        [FromQuery] bool adminReport = false,
        [FromQuery] bool includeAll = false,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 5000,
        [FromQuery] int pageSize = 5000)
    {
        var currentUser = await _currentUserService.GetUserAsync();
        var isProductOwner = currentUser?.Role == "product_owner" || currentUser?.Role == "superadmin";
        
        var query = _context.Users
            .Include(u => u.Organization)
            .Include(u => u.Satellite)
            .Include(u => u.Agency)
            .Include(u => u.Terminal)
            .Include(u => u.Department)
            .Include(u => u.UserOrganizations) // Load multi-org assignments
            .AsNoTracking()
            .AsQueryable();
        
        // ADMIN REPORTS: Bypass all filtering for unrestricted access
        if (adminReport && includeAll && isProductOwner)
        {
            // Apply only explicit filters, no user context
            if (!string.IsNullOrEmpty(role))
                query = query.Where(u => u.Role == role);

            if (!string.IsNullOrEmpty(status))
                query = query.Where(u => u.Status == status);
            
            if (organizationId.HasValue)
                query = query.Where(u => u.OrganizationId == organizationId);

            var allTotal = await query.CountAsync();
            var allUsers = await query
                .OrderBy(u => u.OrganizationId).ThenBy(u => u.Name)
                .Take(pageSize > 0 ? pageSize : limit)
                .Select(u => new UserDto(u))
                .ToListAsync();

            return Ok(new { data = allUsers, total = allTotal, page = 1, limit = pageSize > 0 ? pageSize : limit });
        }

        // NORMAL MODE: MULTI-TENANT SECURITY: Scope to user's organization unless product owner
        var isCorporate = currentUser?.SatelliteId == null && currentUser?.AgencyId == null && currentUser?.TerminalId == null;
        
        // If organizationId parameter provided, filter by it
        if (organizationId.HasValue)
        {
            // Product owners/superadmins can view any organization
            if (isProductOwner)
            {
                query = query.Where(u => u.OrganizationId == organizationId.Value);
            }
            // Regular users can only view their own organization (backend enforces)
            else if (currentUser?.OrganizationId == organizationId.Value)
            {
                query = query.Where(u => u.OrganizationId == organizationId.Value);
            }
            else
            {
                // User trying to access an organization they don't belong to
                return Forbid();
            }
        }
        // No organizationId parameter - use default org filtering
        else if (!isProductOwner && currentUser?.OrganizationId != null)
        {
            // Filter by organization first
            query = query.Where(u => u.OrganizationId == currentUser.OrganizationId);
            
            // ENTITY-BASED FILTERING
            if (currentUser.SatelliteId.HasValue)
            {
                // Satellite managers see only their satellite's users
                query = query.Where(u => u.SatelliteId == currentUser.SatelliteId.Value);
            }
            else if (currentUser.AgencyId.HasValue)
            {
                // Agency managers see only their agency's users
                query = query.Where(u => u.AgencyId == currentUser.AgencyId.Value);
            }
            else if (currentUser.TerminalId.HasValue)
            {
                // Terminal managers see only their terminal's users
                query = query.Where(u => u.TerminalId == currentUser.TerminalId.Value);
            }
            // Corporate users see all users in organization
        }
        // Product owner - no filter, sees all organizations

        if (!string.IsNullOrEmpty(role))
            query = query.Where(u => u.Role == role);

        if (!string.IsNullOrEmpty(status))
            query = query.Where(u => u.Status == status);

        // Allow product owner to filter by specific org, ignore for regular admins (already scoped)
        if (organizationId.HasValue && isProductOwner)
            query = query.Where(u => u.OrganizationId == organizationId);

        var total = await query.CountAsync();
        var users = await query
            .OrderBy(u => u.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(u => new UserDto(u))
            .ToListAsync();

        return Ok(new { data = users, total, page, limit });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetUser(int id)
    {
        var user = await _context.Users
            .Include(u => u.Organization)
            .Include(u => u.UserOrganizations)
            .FirstOrDefaultAsync(u => u.Id == id);

        if (user == null)
            return NotFound(new { error = "User not found" });

        // SECURITY: Check if user can access this user
        var currentUser = await _currentUserService.GetUserAsync();
        var isProductOwner = currentUser?.Role == "product_owner";
        
        if (!isProductOwner && user.OrganizationId != currentUser?.OrganizationId)
        {
            return Forbid(); // Can't access users from other organizations
        }

        return Ok(new { data = new UserDto(user, _encryption) });
    }

    [HttpPost]
    public async Task<ActionResult<object>> CreateUser([FromBody] CreateUserRequest request)
    {
        if (await _context.Users.AnyAsync(u => u.Email.ToLower() == request.Email.ToLower()))
            return BadRequest(new { error = $"A user with email '{request.Email}' already exists. Please use a different email address." });

        // SECURITY: Non-product-owner can only create users in their own organization
        var currentUser = await _currentUserService.GetUserAsync();
        var isProductOwner = currentUser?.Role == "product_owner" || currentUser?.Role == "superadmin";
        
        // CRITICAL SECURITY: Only product_owner can assign product_owner or superadmin roles
        if ((request.Role == "product_owner" || request.Role == "superadmin") && !isProductOwner)
        {
            return Forbid(); // Only product owners can create other product owners
        }
        
        var targetOrgId = request.OrganizationId ?? currentUser?.OrganizationId;
        
        if (!isProductOwner && targetOrgId != currentUser?.OrganizationId)
        {
            return Forbid(); // Can't create users in other organizations
        }

        var user = new User
        {
            Name = request.Name,
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Phone = request.Phone,
            Role = request.Role ?? "user",
            OrganizationId = targetOrgId,
            ApiKey = Models.User.GenerateApiKey(),
            ApiSecret = Models.User.GenerateApiSecret()
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        
        await _auditService.LogAsync(AuditActions.Create, "User", user.Id, 
            $"Created user {user.Name} ({user.Email}) with role {user.Role}");

        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, new { data = new UserDto(user) });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<object>> UpdateUser(int id, [FromBody] UpdateUserRequest request)
    {
        var user = await _context.Users
            .Include(u => u.Organization)
            .Include(u => u.UserOrganizations)
            .FirstOrDefaultAsync(u => u.Id == id);
        if (user == null)
            return NotFound(new { error = "User not found" });

        // Get current user
        var currentUser = await _currentUserService.GetUserAsync();
        var currentUserIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var isMainProductOwner = user.Email == "austin.taylor@vantac.local"; // THE main product owner
        var currentUserIsProductOwner = currentUser?.Role == "product_owner"; // ONLY product_owner, not superadmin
        var currentUserIsAdmin = currentUser?.Role == "product_owner" || currentUser?.Role == "superadmin";
        var isSelfEdit = currentUserIdClaim == id.ToString();
        
        // CRITICAL SECURITY: Protect THE main product owner (austin.taylor@vantac.local)
        if (isMainProductOwner && !isSelfEdit)
        {
            return BadRequest(new { error = "The main Product Owner account (austin.taylor@vantac.local) cannot be modified by others" });
        }
        
        // CRITICAL SECURITY: Only product_owner can assign/change to product_owner role
        if (request.Role == "product_owner" && !currentUserIsProductOwner)
        {
            return Forbid(); // Only product owners can assign product_owner role
        }
        
        // ENFORCE SINGLE PRODUCT OWNER: Prevent creating multiple product_owners
        if (request.Role == "product_owner" && user.Role != "product_owner")
        {
            // Check if another product_owner already exists
            var existingProductOwner = await _context.Users.FirstOrDefaultAsync(u => u.Role == "product_owner" && u.Id != id);
            if (existingProductOwner != null)
            {
                return BadRequest(new { error = $"Only one Product Owner allowed. {existingProductOwner.Name} ({existingProductOwner.Email}) is already Product Owner. Please demote them first or assign Superadmin role instead." });
            }
        }
        
        // CRITICAL SECURITY: Only product_owner/superadmin can assign superadmin role
        if (request.Role == "superadmin" && !currentUserIsAdmin)
        {
            return Forbid(); // Only product owners/superadmins can assign superadmin role
        }
        
        // CRITICAL SECURITY: Superadmins CANNOT edit product_owner accounts
        if (user.Role == "product_owner" && currentUser?.Role == "superadmin")
        {
            return Forbid(); // Superadmins cannot modify product_owner accounts
        }
        
        // ALLOW: Product_owner CAN demote other product_owners (to enforce single owner rule)
        // No blocking here - product_owner can change other product_owner's roles
        
        // Superadmins CAN demote other superadmins
        if (user.Role == "superadmin" && !currentUserIsAdmin)
        {
            return Forbid(); // Need product_owner or superadmin to demote superadmins
        }
        
        // SECURITY: Non-admin users can only edit users in their organization
        if (!currentUserIsAdmin && user.OrganizationId != currentUser?.OrganizationId)
        {
            return Forbid(); // Can't edit users from other organizations
        }

        // Protect the hardcoded product owner account from modification by OTHERS
        if (isMainProductOwner && !isSelfEdit)
        {
            return BadRequest(new { error = "Cannot modify the main Product Owner account (austin.taylor@vantac.local)" });
        }

        // If main product owner editing themselves, only allow safe fields (not role/email/status)
        if (isMainProductOwner && isSelfEdit)
        {
            // Only allow name, alias, phone, address, timezone, country, language changes
            user.Name = request.Name ?? user.Name;
            user.Alias = request.Alias ?? user.Alias;
            user.Phone = request.Phone ?? user.Phone;
            user.Address = request.Address ?? user.Address;
            user.City = request.City ?? user.City;
            user.State = request.State ?? user.State;
            user.ZipCode = request.ZipCode ?? user.ZipCode;
            user.Timezone = request.Timezone ?? user.Timezone;
            user.Country = request.Country ?? user.Country;
            user.Language = request.Language ?? user.Language;
            // Role, Status, Email, OrganizationId are protected - silently ignore
        }
        else
        {
            // Normal user update - all fields allowed
            
            // Email change with duplicate check
            if (!string.IsNullOrEmpty(request.Email) && request.Email.ToLower() != user.Email.ToLower())
            {
                var emailTaken = await _context.Users.AnyAsync(u => u.Email.ToLower() == request.Email.ToLower() && u.Id != id);
                if (emailTaken)
                    return BadRequest(new { error = $"Email '{request.Email}' is already in use by another user." });
                user.Email = request.Email;
            }
            
            user.Avatar = request.Avatar ?? user.Avatar;
            user.Name = request.Name ?? user.Name;
            user.Alias = request.Alias ?? user.Alias;
            user.Gender = request.Gender ?? user.Gender;
            if (request.DateOfBirth.HasValue) user.DateOfBirth = request.DateOfBirth;
            user.IdNumber = request.IdNumber ?? user.IdNumber;
            user.Height = request.Height ?? user.Height;
            user.Weight = request.Weight ?? user.Weight;
            user.EyeColor = request.EyeColor ?? user.EyeColor;
            user.HairColor = request.HairColor ?? user.HairColor;
            user.Ethnicity = request.Ethnicity ?? user.Ethnicity;
            user.Religion = request.Religion ?? user.Religion;
            user.Phone = request.Phone ?? user.Phone;
            user.WorkPhone = request.WorkPhone ?? user.WorkPhone;
            user.WorkPhoneCountry = request.WorkPhoneCountry ?? user.WorkPhoneCountry;
            user.CellPhone = request.CellPhone ?? user.CellPhone;
            user.CellPhoneCountry = request.CellPhoneCountry ?? user.CellPhoneCountry;
            user.PersonalEmail = request.PersonalEmail ?? user.PersonalEmail;
            // Auto-link Zoom account when ZoomEmail is set
            if (!string.IsNullOrEmpty(request.ZoomEmail) && request.ZoomEmail != user.ZoomEmail)
            {
                user.ZoomEmail = request.ZoomEmail;
                var zoomUser = await _context.ZoomUserRecords
                    .FirstOrDefaultAsync(z => z.Email != null && z.Email.ToLower() == request.ZoomEmail.ToLower());
                if (zoomUser != null)
                {
                    user.ZoomUserId = zoomUser.ZoomUserId;
                }
            }
            else
            {
                user.ZoomEmail = request.ZoomEmail ?? user.ZoomEmail;
            }
            user.Address = request.Address ?? user.Address;
            user.City = request.City ?? user.City;
            user.State = request.State ?? user.State;
            user.ZipCode = request.ZipCode ?? user.ZipCode;
            user.Role = request.Role ?? user.Role;
            user.Status = request.Status ?? user.Status;
            user.Timezone = request.Timezone ?? user.Timezone;
            user.Country = request.Country ?? user.Country;
            user.Language = request.Language ?? user.Language;
            user.JobTitle = request.JobTitle ?? user.JobTitle;
            
            // Product owner can change user's organization
            if (request.OrganizationId.HasValue)
            {
                user.OrganizationId = request.OrganizationId.Value;
            }
            
            // Update entity assignments (only if explicitly provided)
            if (request.SatelliteId.HasValue)
                user.SatelliteId = request.SatelliteId.Value == 0 ? null : request.SatelliteId;
            if (request.AgencyId.HasValue)
                user.AgencyId = request.AgencyId.Value == 0 ? null : request.AgencyId;
            if (request.TerminalId.HasValue)
                user.TerminalId = request.TerminalId.Value == 0 ? null : request.TerminalId;
            // 0 means "clear", positive value means "set", null/absent means "keep current"
            if (request.DivisionId.HasValue)
                user.DivisionId = request.DivisionId.Value == 0 ? null : request.DivisionId;
            if (request.DepartmentId.HasValue)
                user.DepartmentId = request.DepartmentId.Value == 0 ? null : request.DepartmentId;
            if (request.PositionId.HasValue)
                user.PositionId = request.PositionId.Value == 0 ? null : request.PositionId;
            
            // Integration account credentials (passwords encrypted at rest)
            user.LandstarUsername = request.LandstarUsername ?? user.LandstarUsername;
            if (!string.IsNullOrEmpty(request.LandstarPassword))
                user.LandstarPassword = _encryption.Encrypt(request.LandstarPassword);
            user.PowerdatUsername = request.PowerdatUsername ?? user.PowerdatUsername;
            if (!string.IsNullOrEmpty(request.PowerdatPassword))
                user.PowerdatPassword = _encryption.Encrypt(request.PowerdatPassword);
            
            // Handle multi-organization assignment
            if (request.OrganizationIds != null && request.OrganizationIds.Any())
            {
                // Remove existing assignments
                var existing = await _context.UserOrganizations.Where(uo => uo.UserId == user.Id).ToListAsync();
                _context.UserOrganizations.RemoveRange(existing);
                
                // Add new assignments
                foreach (var orgId in request.OrganizationIds)
                {
                    _context.UserOrganizations.Add(new UserOrganization
                    {
                        UserId = user.Id,
                        OrganizationId = orgId,
                        IsPrimary = orgId == request.OrganizationId // Primary if matches OrganizationId
                    });
                }
            }
        }

        user.UpdatedAt = DateTime.UtcNow;
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException dbEx)
        {
            return StatusCode(500, new { error = "Failed to save", message = dbEx.InnerException?.Message ?? dbEx.Message });
        }
        
        await _auditService.LogAsync(AuditActions.Update, "User", user.Id, 
            $"Updated user {user.Name} ({user.Email})");

        return Ok(new { data = new UserDto(user, _encryption) });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null)
            return NotFound(new { error = "User not found" });

        // CRITICAL: Protect THE main product owner account from deletion
        if (user.Email == "austin.taylor@vantac.local")
        {
            return BadRequest(new { error = "Cannot delete the main Product Owner account (austin.taylor@vantac.local)" });
        }
        
        // PREVENT deleting ANY product_owner (there should only be one, but extra safety)
        if (user.Role == "product_owner")
        {
            return BadRequest(new { error = "Cannot delete Product Owner accounts. Demote to another role first if needed." });
        }

        // SECURITY: Non-product-owner can only delete users in their organization
        var currentUser = await _currentUserService.GetUserAsync();
        var isProductOwner = currentUser?.Role == "product_owner";
        
        if (!isProductOwner && user.OrganizationId != currentUser?.OrganizationId)
        {
            return Forbid(); // Can't delete users from other organizations
        }

        try
        {
            // Check for ALL dependencies across the system
            var dependencies = new List<string>();

            // HR & Payroll
            if (await _context.Paychecks.AnyAsync(p => p.EmployeeId == id))
                dependencies.Add("Paychecks");
            if (await _context.TimeOffRequests.AnyAsync(t => t.EmployeeId == id))
                dependencies.Add("Time Off Requests");
            if (await _context.AttendanceRecords.AnyAsync(a => a.EmployeeId == id))
                dependencies.Add("Attendance Records");
            if (await _context.Timesheets.AnyAsync(t => t.EmployeeId == id))
                dependencies.Add("Timesheets");
            if (await _context.EmployeeDocuments.AnyAsync(d => d.EmployeeId == id))
                dependencies.Add("HR Documents");
            if (await _context.EmployeeBenefits.AnyAsync(b => b.EmployeeId == id))
                dependencies.Add("Benefits");

            // Communications
            if (await _context.ChatMessages.AnyAsync(m => m.SenderId == id))
                dependencies.Add("Chat Messages");
            
            // Operations (as approver, creator, etc.)
            if (await _context.AuditLogs.AnyAsync(a => a.UserId == id))
                dependencies.Add("Audit Logs");

            // If ANY dependencies exist, deactivate instead of delete
            if (dependencies.Count > 0)
            {
                user.Status = "inactive";
                user.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
                
                return Ok(new { 
                    deleted = false, 
                    deactivated = true,
                    dependencies = dependencies,
                    message = $"User has related records in {dependencies.Count} area(s): {string.Join(", ", dependencies)}. User was deactivated instead of deleted to preserve data integrity. The user can no longer log in but historical records are preserved."
                });
            }

            // No dependencies - safe to delete
            await _auditService.LogAsync(AuditActions.Delete, "User", user.Id, 
                $"Deleted user {user.Name} ({user.Email})");

            _context.Users.Remove(user);
            await _context.SaveChangesAsync();

            return Ok(new { deleted = true, message = "User deleted successfully" });
        }
        catch (Exception ex)
        {
            // Catch any remaining FK violations and deactivate instead
            if (ex.InnerException?.Message.Contains("foreign key constraint") == true || 
                ex.InnerException?.Message.Contains("FK_") == true)
            {
                // Foreign key violation - deactivate instead
                user.Status = "inactive";
                user.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
                
                return Ok(new { 
                    deleted = false, 
                    deactivated = true,
                    message = "User has related records in the system and was deactivated instead of deleted. Database constraint prevented deletion to preserve data integrity."
                });
            }

            return BadRequest(new { error = $"Failed to delete user: {ex.Message}" });
        }
    }

    [HttpPost("{id}/deactivate")]
    public async Task<ActionResult<object>> DeactivateUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null)
            return NotFound(new { error = "User not found" });

        // Protect the hardcoded product owner account from deactivation
        if (user.Email == "austin.taylor@vantac.local" || user.Role == "product_owner")
        {
            return BadRequest(new { error = "Cannot deactivate the system Product Owner account" });
        }

        user.Status = "inactive";
        user.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = new UserDto(user) });
    }

    [HttpPost("{id}/activate")]
    public async Task<ActionResult<object>> ActivateUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null)
            return NotFound(new { error = "User not found" });

        user.Status = "active";
        user.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = new UserDto(user) });
    }
    
    /// <summary>
    /// Set user password directly (admin only)
    /// </summary>
    [HttpPut("{id}/set-password")]
    [Authorize(Roles = "product_owner,superadmin,admin")]
    public async Task<ActionResult<object>> SetPassword(int id, [FromBody] SetPasswordRequest request)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null)
            return NotFound(new { error = "User not found" });
        
        // Validate password
        if (string.IsNullOrEmpty(request.Password) || request.Password.Length < 8)
        {
            return BadRequest(new { error = "Password must be at least 8 characters" });
        }
        
        // Hash and set new password
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        user.UpdatedAt = DateTime.UtcNow;
        
        await _context.SaveChangesAsync();
        
        return Ok(new { message = "Password updated successfully" });
    }
}

public record SetPasswordRequest(string Password);

public record CreateUserRequest(
    string Name,
    string Email,
    string Password,
    string? Phone,
    string? Role,
    int? OrganizationId
);

public record UpdateUserRequest(
    string? Avatar,
    string? Name,
    string? Email,
    string? Alias,
    string? Gender,
    DateOnly? DateOfBirth,
    string? IdNumber,
    string? Height,
    string? Weight,
    string? EyeColor,
    string? HairColor,
    string? Ethnicity,
    string? Religion,
    string? Phone,
    string? WorkPhone,
    string? WorkPhoneCountry,
    string? CellPhone,
    string? CellPhoneCountry,
    string? PersonalEmail,
    string? ZoomEmail,
    string? Address,
    string? City,
    string? State,
    string? ZipCode,
    string? Role,
    string? Status,
    string? Timezone,
    string? Country,
    string? Language,
    int? OrganizationId,
    List<int>? OrganizationIds,
    int? SatelliteId,
    int? AgencyId,
    int? TerminalId,
    int? DivisionId,
    int? DepartmentId,
    int? PositionId,
    string? JobTitle,
    string? LandstarUsername,
    string? LandstarPassword,
    string? PowerdatUsername,
    string? PowerdatPassword
);





