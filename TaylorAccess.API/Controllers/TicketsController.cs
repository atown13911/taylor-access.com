using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Ticketing/Support System
/// </summary>
[ApiController]
[Route("api/v1/tickets")]
[Authorize]
public class TicketsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly MetricCacheService _cache;

    public TicketsController(TaylorAccessDbContext context, CurrentUserService currentUserService, IAuditService auditService, MetricCacheService cache)
    {
        _context = context;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _cache = cache;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetTickets(
        [FromQuery] string? type,
        [FromQuery] string? status,
        [FromQuery] string? priority,
        [FromQuery] string? category,
        [FromQuery] int? assignedTo,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 50)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var userRole = user.Role?.ToLower() ?? "";
        var hasUnrestrictedAccess = userRole == "product_owner" || userRole == "superadmin";

        var query = _context.Tickets
            .Include(t => t.AssignedTo)
            .Include(t => t.ReportedBy)
            .Include(t => t.Comments)
            .AsQueryable();

        if (!hasUnrestrictedAccess && user.OrganizationId.HasValue)
            query = query.Where(t => t.OrganizationId == user.OrganizationId.Value);

        if (!string.IsNullOrEmpty(type))
            query = query.Where(t => t.Type == type);
        if (!string.IsNullOrEmpty(status))
            query = query.Where(t => t.Status == status);
        if (!string.IsNullOrEmpty(priority))
            query = query.Where(t => t.Priority == priority);
        if (!string.IsNullOrEmpty(category))
            query = query.Where(t => t.Category == category);
        if (assignedTo.HasValue)
            query = query.Where(t => t.AssignedToId == assignedTo);

        var total = await query.CountAsync();
        var tickets = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .ToListAsync();

        return Ok(new
        {
            data = tickets,
            meta = new { total, page, limit, pages = (int)Math.Ceiling((double)total / limit) }
        });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Ticket>> GetTicket(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var ticket = await _context.Tickets
            .Where(t => t.Id == id && t.OrganizationId == user.OrganizationId.Value)
            .Include(t => t.AssignedTo)
            .Include(t => t.ReportedBy)
            .Include(t => t.Comments).ThenInclude(c => c.User)
            .Include(t => t.Attachments)
            .FirstOrDefaultAsync();

        if (ticket == null)
            return NotFound(new { message = "Ticket not found" });

        return Ok(new { ticket });
    }

    [HttpPost]
    public async Task<ActionResult<Ticket>> CreateTicket([FromBody] Ticket ticket)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        ticket.Id = 0;
        ticket.OrganizationId = user.OrganizationId.Value;
        ticket.ReportedById = user.Id;
        ticket.CreatedAt = DateTime.UtcNow;
        ticket.UpdatedAt = DateTime.UtcNow;

        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        await _auditService.LogAsync("Create", "Ticket", ticket.Id, 
            $"Created ticket {ticket.TicketNumber}: {ticket.Title}");

        return CreatedAtAction(nameof(GetTicket), new { id = ticket.Id }, new { ticket });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<Ticket>> UpdateTicket(int id, [FromBody] Ticket updated)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var ticket = await _context.Tickets
            .FirstOrDefaultAsync(t => t.Id == id && t.OrganizationId == user.OrganizationId.Value);

        if (ticket == null)
            return NotFound(new { message = "Ticket not found" });

        var oldStatus = ticket.Status;

        ticket.Title = updated.Title;
        ticket.Description = updated.Description;
        ticket.Type = updated.Type;
        ticket.Category = updated.Category;
        ticket.Priority = updated.Priority;
        ticket.Status = updated.Status;
        ticket.AssignedToId = updated.AssignedToId;
        ticket.DueDate = updated.DueDate;
        ticket.UpdatedAt = DateTime.UtcNow;

        if (oldStatus != updated.Status && updated.Status == "resolved")
        {
            ticket.ResolvedAt = DateTime.UtcNow;
            ticket.ResolutionTimeMinutes = (int)(DateTime.UtcNow - ticket.CreatedAt).TotalMinutes;
        }

        await _context.SaveChangesAsync();

        await _auditService.LogAsync("Update", "Ticket", ticket.Id, 
            $"Updated ticket {ticket.TicketNumber}: {oldStatus} → {ticket.Status}");

        return Ok(new { ticket });
    }

    [HttpPost("{id}/comments")]
    public async Task<ActionResult> AddComment(int id, [FromBody] TicketCommentRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
        {
            return Unauthorized(new { message = "User must belong to an organization" });
        }

        var ticket = await _context.Tickets
            .FirstOrDefaultAsync(t => t.Id == id && t.OrganizationId == user.OrganizationId.Value);

        if (ticket == null)
            return NotFound(new { message = "Ticket not found" });

        // PERMISSION CHECK: Only Help Desk staff, assigned person, or admin can respond
        var helpDeskDept = await _context.Departments
            .FirstOrDefaultAsync(d => d.OrganizationId == user.OrganizationId.Value && d.Code == "HELPDESK");

        var isHelpDeskStaff = helpDeskDept != null && user.DepartmentId == helpDeskDept.Id;
        var isAssignedPerson = ticket.AssignedToId == user.Id;
        var isTicketCreator = ticket.ReportedById == user.Id;
        var isAdmin = user.Role == "admin" || user.Role == "manager" || user.Role == "product_owner";

        // Only allow: Help Desk staff, assigned person, ticket creator, or admin
        if (!isHelpDeskStaff && !isAssignedPerson && !isTicketCreator && !isAdmin)
        {
            return Forbid();
        }

        var comment = new TicketComment
        {
            TicketId = id,
            UserId = user.Id,
            Comment = request.Comment,
            IsInternal = request.IsInternal,
            CreatedAt = DateTime.UtcNow
        };

        _context.TicketComments.Add(comment);
        
        // Update first response time if this is the first comment from staff (not the reporter)
        if (ticket.FirstResponseAt == null && user.Id != ticket.ReportedById && (isHelpDeskStaff || isAdmin))
        {
            ticket.FirstResponseAt = DateTime.UtcNow;
            ticket.ResponseTimeMinutes = (int)(DateTime.UtcNow - ticket.CreatedAt).TotalMinutes;
        }

        ticket.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { comment });
    }

    [HttpGet("stats")]
    public async Task<ActionResult<object>> GetStats()
    {
        try
        {
            var user = await _currentUserService.GetUserAsync();
            if (user?.OrganizationId == null)
            {
                return Unauthorized(new { message = "User must belong to an organization" });
            }

            var tickets = await _context.Tickets
                .Where(t => t.OrganizationId == user.OrganizationId.Value)
                .ToListAsync();

            var result = new
            {
                total = tickets.Count,
                open = tickets.Count(t => t.Status == "open"),
                inProgress = tickets.Count(t => t.Status == "in_progress"),
                resolved = tickets.Count(t => t.Status == "resolved"),
                closed = tickets.Count(t => t.Status == "closed"),
                byType = tickets.GroupBy(t => t.Type)
                    .Select(g => new { type = g.Key, count = g.Count() }),
                byPriority = tickets.GroupBy(t => t.Priority)
                    .Select(g => new { priority = g.Key, count = g.Count() }),
                byCategory = tickets.GroupBy(t => t.Category)
                    .Select(g => new { category = g.Key, count = g.Count() }),
                avgResponseTime = tickets.Where(t => t.ResponseTimeMinutes > 0).Average(t => (double?)t.ResponseTimeMinutes) ?? 0,
                avgResolutionTime = tickets.Where(t => t.ResolutionTimeMinutes > 0).Average(t => (double?)t.ResolutionTimeMinutes) ?? 0
            };
            return Ok(result);
        }
        catch { throw; }
    }
}

public record TicketCommentRequest(string Comment, bool IsInternal);

