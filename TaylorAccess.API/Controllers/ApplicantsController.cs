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

        var organizations = await _context.Organizations
            .AsTracking()
            .OrderBy(o => o.Id)
            .ToListAsync();
        if (organizations.Count == 0)
            return NotFound(new { error = "No organizations found" });

        var positions = organizations
            .SelectMany(o => ExtractPositions(ParseSettings(o.Settings)))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Ok(new { data = positions });
    }

    [HttpPost("positions")]
    public async Task<ActionResult> AddPosition([FromBody] AddApplicantPositionRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var organizations = await _context.Organizations
            .AsTracking()
            .OrderBy(o => o.Id)
            .ToListAsync();
        if (organizations.Count == 0)
            return NotFound(new { error = "No organizations found" });

        var name = string.IsNullOrWhiteSpace(request.Name) ? string.Empty : request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { error = "Position name is required" });

        var positions = organizations
            .SelectMany(o => ExtractPositions(ParseSettings(o.Settings)))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (!positions.Any(p => p.Equals(name, StringComparison.OrdinalIgnoreCase))) positions.Add(name);

        positions = positions
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var org in organizations)
        {
            var settings = ParseSettings(org.Settings);
            settings[PositionsSettingsKey] = JsonSerializer.SerializeToNode(positions);
            org.Settings = settings.ToJsonString();
            org.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();

        return Ok(new { data = positions });
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

