using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/applicants")]
[Authorize]
public class ApplicantsController : ControllerBase
{
    private const string PositionsSettingsKey = "applicantsPositions";

    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public ApplicantsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet("positions")]
    public async Task<ActionResult> GetPositions()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var org = await ResolveOrganizationAsync(user);
        if (org == null) return NotFound(new { error = "Organization not found for current user" });

        var settings = ParseSettings(org.Settings);
        var positions = ExtractPositions(settings);
        return Ok(new { data = positions });
    }

    [HttpPost("positions")]
    public async Task<ActionResult> AddPosition([FromBody] AddApplicantPositionRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var org = await ResolveOrganizationAsync(user);
        if (org == null) return NotFound(new { error = "Organization not found for current user" });

        var name = string.IsNullOrWhiteSpace(request.Name) ? string.Empty : request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { error = "Position name is required" });

        var settings = ParseSettings(org.Settings);
        var positions = ExtractPositions(settings);
        if (!positions.Any(p => p.Equals(name, StringComparison.OrdinalIgnoreCase)))
            positions.Add(name);

        positions = positions
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .ToList();

        settings[PositionsSettingsKey] = JsonSerializer.SerializeToNode(positions);
        org.Settings = settings.ToJsonString();
        org.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { data = positions });
    }

    private async Task<Organization?> ResolveOrganizationAsync(User user)
    {
        if (user.OrganizationId.HasValue)
            return await _context.Organizations.FirstOrDefaultAsync(o => o.Id == user.OrganizationId.Value);

        if (user.Role == "product_owner" || user.Role == "superadmin" || user.Role == "development")
            return await _context.Organizations.OrderBy(o => o.Id).FirstOrDefaultAsync();

        return null;
    }

    private static JsonObject ParseSettings(string? rawSettings)
    {
        if (string.IsNullOrWhiteSpace(rawSettings))
            return new JsonObject();

        try
        {
            var parsed = JsonNode.Parse(rawSettings);
            return parsed as JsonObject ?? new JsonObject();
        }
        catch
        {
            return new JsonObject();
        }
    }

    private static List<string> ExtractPositions(JsonObject settings)
    {
        if (settings[PositionsSettingsKey] is not JsonArray array) return new List<string>();

        return array
            .Select(item => item?.GetValue<string>()?.Trim())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(item => item, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}

public record AddApplicantPositionRequest(string Name);

