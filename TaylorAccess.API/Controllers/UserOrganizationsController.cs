using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class UserOrganizationsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public UserOrganizationsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get organizations the current user has access to
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetUserOrganizations()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null)
            return Unauthorized();

        var organizations = new List<object>();

        // Product owners see all organizations
        if (user.Role == "product_owner")
        {
            var allOrgs = await _context.Organizations
                .Where(o => o.Status == "active")
                .Select(o => new {
                    o.Id,
                    o.Name,
                    o.Status,
                    isPrimary = o.Id == user.OrganizationId,
                    hasAccess = true,
                    role = "product_owner"
                })
                .OrderBy(o => o.Name)
                .ToListAsync();
            
            return Ok(new { data = allOrgs });
        }

        // Superadmins and admins see all organizations (read-only for non-primary)
        if (user.Role == "superadmin" || user.Role == "admin")
        {
            var allOrgs = await _context.Organizations
                .Where(o => o.Status == "active")
                .Select(o => new {
                    o.Id,
                    o.Name,
                    o.Status,
                    isPrimary = o.Id == user.OrganizationId,
                    hasAccess = true,
                    role = user.Role
                })
                .OrderBy(o => o.Name)
                .ToListAsync();
            
            return Ok(new { data = allOrgs });
        }

        // Regular users only see their assigned organization
        if (user.OrganizationId.HasValue)
        {
            var userOrg = await _context.Organizations
                .Where(o => o.Id == user.OrganizationId.Value)
                .Select(o => new {
                    o.Id,
                    o.Name,
                    o.Status,
                    isPrimary = true,
                    hasAccess = true,
                    role = user.Role
                })
                .FirstOrDefaultAsync();

            if (userOrg != null)
            {
                organizations.Add(userOrg);
            }
        }

        return Ok(new { data = organizations });
    }
}


