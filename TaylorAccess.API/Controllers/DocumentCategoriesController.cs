using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/document-categories")]
[Authorize]
public class DocumentCategoriesController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public DocumentCategoriesController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Get all document categories with their items
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetAll()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var query = _context.DocumentCategories.AsQueryable();
        
        var role = user.Role?.ToLower();
        if (role != "product_owner" && role != "superadmin")
        {
            query = query.Where(c => c.OrganizationId == user.OrganizationId || c.OrganizationId == null);
        }

        var categories = await query
            .OrderBy(c => c.SortOrder)
            .ThenBy(c => c.Name)
            .ToListAsync();

        // Seed default categories if none exist
        if (categories.Count == 0)
        {
            var defaults = new (string Name, int Sort, (string Name, string Desc)[] Docs)[]
            {
                ("USA Employment Forms", 1, new[]
                {
                    ("Form I-9: Employment Eligibility Verification", "Required for all US employees to verify identity and work authorization"),
                    ("Form W-4: Employee Withholding Certificate", "Federal income tax withholding elections"),
                    ("Form W-9: Request for Taxpayer ID", "For independent contractors and vendors"),
                    ("State Tax Withholding Form", "State-specific income tax withholding"),
                    ("Direct Deposit Authorization", "Bank account information for payroll"),
                    ("Emergency Contact Form", "Employee emergency contact information"),
                    ("Employee Handbook Acknowledgment", "Signed acknowledgment of company policies"),
                    ("Background Check Authorization", "Consent for pre-employment background check"),
                    ("Drug Test Consent Form", "Authorization for drug/alcohol testing"),
                    ("At-Will Employment Agreement", "Acknowledgment of at-will employment status"),
                }),
                ("Bosnia Employment Forms", 2, new[]
                {
                    ("Ugovor o radu (Employment Contract)", "Required employment contract per Bosnia labor law"),
                    ("Prijava na zdravstveno osiguranje (Health Insurance Registration)", "Mandatory health insurance enrollment"),
                    ("Prijava na PIO (Pension Registration)", "Pension and disability insurance registration"),
                    ("Porezna kartica (Tax Card)", "Tax identification and withholding document"),
                    ("Ljekarsko uvjerenje (Medical Certificate)", "Pre-employment medical fitness certificate"),
                    ("Diploma / Svjedočanstvo (Education Certificate)", "Proof of education and qualifications"),
                    ("CIPS (Proof of Residency)", "Certificate of residence issued by CIPS agency"),
                    ("Lična karta (Copy of ID)", "Copy of national identification card"),
                    ("Obrazac JS3100 (Form JS3100)", "Employee registration form for tax and social contributions"),
                }),
                ("CDL & Driver Compliance", 3, new[]
                {
                    ("CDL Copy (Front & Back)", "Copy of Commercial Driver's License"),
                    ("Medical Examiner Certificate (DOT Physical)", "Current DOT physical examination card"),
                    ("MVR (Motor Vehicle Record)", "Driving history report"),
                    ("PSP (Pre-Employment Screening Program)", "FMCSA safety performance history"),
                    ("Drug & Alcohol Clearinghouse Query", "FMCSA clearinghouse verification"),
                    ("Road Test Certificate", "Certification of road test completion"),
                    ("Annual Review of Driving Record", "Yearly MVR review per FMCSA regulations"),
                }),
                ("Company Policies", 4, new[]
                {
                    ("Safety Policy Acknowledgment", "Signed acknowledgment of safety procedures"),
                    ("Harassment Policy Acknowledgment", "Anti-harassment policy review and signature"),
                    ("Confidentiality Agreement / NDA", "Non-disclosure agreement for company information"),
                    ("Equipment Use Agreement", "Terms for company equipment and vehicle usage"),
                    ("Social Media Policy", "Guidelines for social media use related to company"),
                }),
            };

            foreach (var cat in defaults)
            {
                var newCat = new DocumentCategory
                {
                    Name = cat.Name,
                    OrganizationId = null, // Shared across all orgs
                    SortOrder = cat.Sort,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _context.DocumentCategories.Add(newCat);
                await _context.SaveChangesAsync();

                foreach (var (docName, docDesc) in cat.Docs)
                {
                    _context.DocumentCategoryItems.Add(new DocumentCategoryItem
                    {
                        CategoryId = newCat.Id,
                        Name = docName,
                        Description = docDesc,
                        CreatedAt = DateTime.UtcNow
                    });
                }
                await _context.SaveChangesAsync();
            }

            // Re-fetch after seeding
            categories = await _context.DocumentCategories
                .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
                .ToListAsync();
        }

        var catIds = categories.Select(c => c.Id).ToList();
        var items = await _context.DocumentCategoryItems
            .Where(i => catIds.Contains(i.CategoryId))
            .OrderBy(i => i.SortOrder)
            .ToListAsync();

        var result = categories.Select(c => new
        {
            c.Id,
            c.Name,
            c.OrganizationId,
            c.SortOrder,
            docs = items.Where(i => i.CategoryId == c.Id).Select(i => new
            {
                i.Id,
                i.Name,
                i.Description,
                i.SortOrder
            }).ToList()
        });

        return Ok(new { data = result });
    }

    /// <summary>
    /// Create a new category
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<object>> Create([FromBody] CreateCategoryRequest req)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var cat = new DocumentCategory
        {
            Name = req.Name ?? "Untitled Folder",
            OrganizationId = user.OrganizationId,
            SortOrder = req.SortOrder ?? 0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.DocumentCategories.Add(cat);
        await _context.SaveChangesAsync();

        return Ok(new { data = new { cat.Id, cat.Name, cat.OrganizationId, cat.SortOrder, docs = new List<object>() } });
    }

    /// <summary>
    /// Update a category (rename)
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<object>> Update(int id, [FromBody] UpdateCategoryRequest req)
    {
        var cat = await _context.DocumentCategories.FindAsync(id);
        if (cat == null) return NotFound();

        if (req.Name != null) cat.Name = req.Name;
        if (req.SortOrder.HasValue) cat.SortOrder = req.SortOrder.Value;
        cat.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { data = cat });
    }

    /// <summary>
    /// Delete a category and its items
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(int id)
    {
        var cat = await _context.DocumentCategories.FindAsync(id);
        if (cat == null) return NotFound();

        // Remove all items in this category
        var items = await _context.DocumentCategoryItems.Where(i => i.CategoryId == id).ToListAsync();
        _context.DocumentCategoryItems.RemoveRange(items);
        _context.DocumentCategories.Remove(cat);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Deleted" });
    }

    /// <summary>
    /// Add a document item to a category
    /// </summary>
    [HttpPost("{catId}/items")]
    public async Task<ActionResult<object>> AddItem(int catId, [FromBody] CreateItemRequest req)
    {
        var cat = await _context.DocumentCategories.FindAsync(catId);
        if (cat == null) return NotFound(new { message = "Category not found" });

        var item = new DocumentCategoryItem
        {
            CategoryId = catId,
            Name = req.Name ?? "Untitled Document",
            Description = req.Description,
            SortOrder = req.SortOrder ?? 0,
            CreatedAt = DateTime.UtcNow
        };

        _context.DocumentCategoryItems.Add(item);
        await _context.SaveChangesAsync();

        return Ok(new { data = new { item.Id, item.Name, item.Description, item.SortOrder, item.CategoryId } });
    }

    /// <summary>
    /// Update a document item (rename, move to different category)
    /// </summary>
    [HttpPut("items/{itemId}")]
    public async Task<ActionResult<object>> UpdateItem(int itemId, [FromBody] UpdateItemRequest req)
    {
        var item = await _context.DocumentCategoryItems.FindAsync(itemId);
        if (item == null) return NotFound();

        if (req.Name != null) item.Name = req.Name;
        if (req.Description != null) item.Description = req.Description;
        if (req.CategoryId.HasValue) item.CategoryId = req.CategoryId.Value;
        if (req.SortOrder.HasValue) item.SortOrder = req.SortOrder.Value;

        await _context.SaveChangesAsync();
        return Ok(new { data = new { item.Id, item.Name, item.Description, item.SortOrder, item.CategoryId } });
    }

    /// <summary>
    /// Delete a document item
    /// </summary>
    [HttpDelete("items/{itemId}")]
    public async Task<ActionResult> DeleteItem(int itemId)
    {
        var item = await _context.DocumentCategoryItems.FindAsync(itemId);
        if (item == null) return NotFound();

        _context.DocumentCategoryItems.Remove(item);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Deleted" });
    }

    /// <summary>
    /// Move a document item to a different category (drag & drop)
    /// </summary>
    [HttpPost("items/{itemId}/move")]
    public async Task<ActionResult<object>> MoveItem(int itemId, [FromBody] MoveItemRequest req)
    {
        var item = await _context.DocumentCategoryItems.FindAsync(itemId);
        if (item == null) return NotFound();

        var targetCat = await _context.DocumentCategories.FindAsync(req.TargetCategoryId);
        if (targetCat == null) return NotFound(new { message = "Target category not found" });

        item.CategoryId = req.TargetCategoryId;
        await _context.SaveChangesAsync();

        return Ok(new { data = new { item.Id, item.Name, item.CategoryId } });
    }

    /// <summary>
    /// Force re-seed: delete all categories and re-create defaults
    /// </summary>
    [HttpPost("reseed")]
    public async Task<ActionResult<object>> Reseed()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();
        var role = user.Role?.ToLower();
        if (role != "product_owner" && role != "superadmin")
            return Forbid();

        // Delete all existing
        var allItems = await _context.DocumentCategoryItems.ToListAsync();
        _context.DocumentCategoryItems.RemoveRange(allItems);
        var allCats = await _context.DocumentCategories.ToListAsync();
        _context.DocumentCategories.RemoveRange(allCats);
        await _context.SaveChangesAsync();

        // Return empty so GET will trigger the auto-seed
        return Ok(new { message = "All categories cleared. Refresh to trigger auto-seed." });
    }

    // ============================================================
    // Position Document Requirements
    // ============================================================

    /// <summary>
    /// Get required document item IDs for a position
    /// </summary>
    [HttpGet("position/{positionId}/requirements")]
    public async Task<ActionResult<object>> GetPositionRequirements(int positionId)
    {
        var reqs = await _context.PositionDocumentRequirements
            .Where(r => r.PositionId == positionId)
            .ToListAsync();

        var itemIds = reqs.Select(r => r.DocumentCategoryItemId).ToList();

        // Also return full doc info for the employee Documents tab
        var items = await _context.DocumentCategoryItems
            .Where(i => itemIds.Contains(i.Id))
            .ToListAsync();

        var catIds = items.Select(i => i.CategoryId).Distinct().ToList();
        var cats = await _context.DocumentCategories
            .Where(c => catIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.Name);

        var docs = items.Select(i => new
        {
            i.Id,
            i.Name,
            i.Description,
            i.CategoryId,
            CategoryName = cats.GetValueOrDefault(i.CategoryId, "")
        });

        return Ok(new { data = new { itemIds, docs } });
    }

    /// <summary>
    /// Save required document item IDs for a position (replaces all)
    /// </summary>
    [HttpPost("position/{positionId}/requirements")]
    public async Task<ActionResult<object>> SavePositionRequirements(int positionId, [FromBody] SaveRequirementsRequest req)
    {
        // Remove existing
        var existing = await _context.PositionDocumentRequirements
            .Where(r => r.PositionId == positionId)
            .ToListAsync();
        _context.PositionDocumentRequirements.RemoveRange(existing);

        // Add new
        foreach (var itemId in req.ItemIds)
        {
            _context.PositionDocumentRequirements.Add(new PositionDocumentRequirement
            {
                PositionId = positionId,
                DocumentCategoryItemId = itemId,
                CreatedAt = DateTime.UtcNow
            });
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = $"Saved {req.ItemIds.Count} requirements for position {positionId}" });
    }
}

public record CreateCategoryRequest(string? Name, int? SortOrder);
public record UpdateCategoryRequest(string? Name, int? SortOrder);
public record CreateItemRequest(string? Name, string? Description, int? SortOrder);
public record UpdateItemRequest(string? Name, string? Description, int? CategoryId, int? SortOrder);
public record MoveItemRequest(int TargetCategoryId);
public record SaveRequirementsRequest(List<int> ItemIds);

