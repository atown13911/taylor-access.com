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

    [HttpGet("records")]
    public async Task<ActionResult> GetApplicants()
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var rows = await _context.ApplicantRecords
            .AsNoTracking()
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new
            {
                a.Id,
                a.FullName,
                a.Gender,
                a.Age,
                a.Position,
                a.Source,
                a.Status,
                appliedDate = a.AppliedDate,
                a.Notes,
                a.CvFileName,
                a.CvDataUrl,
                a.CreatedAt,
                a.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = rows });
    }

    [HttpPost("records")]
    public async Task<ActionResult> CreateApplicant([FromBody] CreateApplicantRecordRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var fullName = string.IsNullOrWhiteSpace(request.FullName) ? string.Empty : request.FullName.Trim();
        if (string.IsNullOrWhiteSpace(fullName))
            return BadRequest(new { error = "Name is required" });

        var row = new ApplicantRecord
        {
            FullName = fullName,
            Gender = string.IsNullOrWhiteSpace(request.Gender) ? null : request.Gender.Trim(),
            Age = request.Age is >= 16 and <= 100 ? request.Age : null,
            Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim(),
            Source = string.IsNullOrWhiteSpace(request.Source) ? null : request.Source.Trim(),
            Status = NormalizeStatus(request.Status),
            AppliedDate = request.AppliedDate,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            CvFileName = string.IsNullOrWhiteSpace(request.CvFileName) ? null : request.CvFileName.Trim(),
            CvDataUrl = string.IsNullOrWhiteSpace(request.CvDataUrl) ? null : request.CvDataUrl,
            CreatedByUserId = user.Id,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.ApplicantRecords.Add(row);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            data = new
            {
                row.Id,
                row.FullName,
                row.Gender,
                row.Age,
                row.Position,
                row.Source,
                row.Status,
                appliedDate = row.AppliedDate,
                row.Notes,
                row.CvFileName,
                row.CvDataUrl,
                row.CreatedAt,
                row.UpdatedAt
            }
        });
    }

    [HttpPut("records/{id:int}/status")]
    public async Task<ActionResult> UpdateApplicantStatus(int id, [FromBody] UpdateApplicantRecordStatusRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var row = await _context.ApplicantRecords.FirstOrDefaultAsync(a => a.Id == id);
        if (row == null) return NotFound(new { error = "Applicant not found" });

        row.Status = NormalizeStatus(request.Status);
        row.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { updated = true, status = row.Status });
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
            .SelectMany(o => ExtractPositions(ParseSettings(o.Settings)));
        var merged = MergePositions(positions);

        return Ok(new { data = merged.Select(p => new { name = p.Name, isActive = p.IsActive }).ToList() });
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
            .SelectMany(o => ExtractPositions(ParseSettings(o.Settings)));
        var merged = MergePositions(positions);

        if (!merged.Any(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
            merged.Add(new ApplicantPositionItem(name, true));
        merged = MergePositions(merged);

        var node = BuildPositionsNode(merged);

        foreach (var org in organizations)
        {
            var settings = ParseSettings(org.Settings);
            settings[PositionsSettingsKey] = node.DeepClone();
            org.Settings = settings.ToJsonString();
            org.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();

        return Ok(new { data = merged.Select(p => new { name = p.Name, isActive = p.IsActive }).ToList() });
    }

    [HttpPut("positions/status")]
    public async Task<ActionResult> UpdatePositionStatus([FromBody] UpdateApplicantPositionStatusRequest request)
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
            .SelectMany(o => ExtractPositions(ParseSettings(o.Settings)));
        var merged = MergePositions(positions);

        var idx = merged.FindIndex(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (idx >= 0)
            merged[idx] = new ApplicantPositionItem(merged[idx].Name, request.IsActive);
        else
            merged.Add(new ApplicantPositionItem(name, request.IsActive));
        merged = MergePositions(merged);

        var node = BuildPositionsNode(merged);
        foreach (var org in organizations)
        {
            var settings = ParseSettings(org.Settings);
            settings[PositionsSettingsKey] = node.DeepClone();
            org.Settings = settings.ToJsonString();
            org.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
        return Ok(new { data = merged.Select(p => new { name = p.Name, isActive = p.IsActive }).ToList() });
    }

    [HttpPut("positions")]
    public async Task<ActionResult> UpdatePosition([FromBody] UpdateApplicantPositionRequest request)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var organizations = await _context.Organizations
            .AsTracking()
            .OrderBy(o => o.Id)
            .ToListAsync();
        if (organizations.Count == 0)
            return NotFound(new { error = "No organizations found" });

        var currentName = string.IsNullOrWhiteSpace(request.CurrentName) ? string.Empty : request.CurrentName.Trim();
        var newName = string.IsNullOrWhiteSpace(request.NewName) ? string.Empty : request.NewName.Trim();
        if (string.IsNullOrWhiteSpace(currentName) || string.IsNullOrWhiteSpace(newName))
            return BadRequest(new { error = "Current name and new name are required" });

        var positions = organizations
            .SelectMany(o => ExtractPositions(ParseSettings(o.Settings)));
        var merged = MergePositions(positions);

        var idx = merged.FindIndex(p => p.Name.Equals(currentName, StringComparison.OrdinalIgnoreCase));
        if (idx < 0)
            return NotFound(new { error = "Position not found" });

        var duplicateIdx = merged.FindIndex(p => p.Name.Equals(newName, StringComparison.OrdinalIgnoreCase));
        if (duplicateIdx >= 0 && duplicateIdx != idx)
            return BadRequest(new { error = "A position with that name already exists" });

        merged[idx] = new ApplicantPositionItem(newName, request.IsActive);
        merged = MergePositions(merged);

        var node = BuildPositionsNode(merged);
        foreach (var org in organizations)
        {
            var settings = ParseSettings(org.Settings);
            settings[PositionsSettingsKey] = node.DeepClone();
            org.Settings = settings.ToJsonString();
            org.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
        return Ok(new { data = merged.Select(p => new { name = p.Name, isActive = p.IsActive }).ToList() });
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

    private static List<ApplicantPositionItem> ExtractPositions(JsonObject settings)
    {
        if (settings[PositionsSettingsKey] is not JsonArray array) return new List<ApplicantPositionItem>();

        var list = new List<ApplicantPositionItem>();
        foreach (var item in array)
        {
            if (item is null) continue;

            if (item is JsonValue)
            {
                var raw = item.ToString();
                var name = string.IsNullOrWhiteSpace(raw) ? string.Empty : raw.Trim();
                if (!string.IsNullOrWhiteSpace(name))
                    list.Add(new ApplicantPositionItem(name, true));
                continue;
            }

            if (item is JsonObject obj)
            {
                var nameRaw = obj["name"]?.ToString() ?? obj["Name"]?.ToString();
                var name = string.IsNullOrWhiteSpace(nameRaw) ? string.Empty : nameRaw.Trim();
                if (string.IsNullOrWhiteSpace(name)) continue;

                var isActive = true;
                var activeNode = obj["isActive"] ?? obj["IsActive"];
                if (activeNode is not null && bool.TryParse(activeNode.ToString(), out var parsed))
                    isActive = parsed;

                list.Add(new ApplicantPositionItem(name, isActive));
            }
        }

        return MergePositions(list);
    }

    private static List<ApplicantPositionItem> MergePositions(IEnumerable<ApplicantPositionItem> source)
    {
        var map = new Dictionary<string, ApplicantPositionItem>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in source)
        {
            var name = string.IsNullOrWhiteSpace(item.Name) ? string.Empty : item.Name.Trim();
            if (string.IsNullOrWhiteSpace(name)) continue;

            if (map.TryGetValue(name, out var existing))
                map[name] = new ApplicantPositionItem(name, existing.IsActive || item.IsActive);
            else
                map[name] = new ApplicantPositionItem(name, item.IsActive);
        }

        return map.Values
            .OrderByDescending(p => p.IsActive)
            .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static JsonArray BuildPositionsNode(IEnumerable<ApplicantPositionItem> positions)
    {
        var array = new JsonArray();
        foreach (var item in positions)
        {
            array.Add(new JsonObject
            {
                ["name"] = item.Name,
                ["isActive"] = item.IsActive
            });
        }
        return array;
    }

    private static string NormalizeStatus(string? raw)
    {
        var value = string.IsNullOrWhiteSpace(raw) ? "new" : raw.Trim().ToLowerInvariant();
        return value switch
        {
            "new" => "new",
            "screening" => "screening",
            "interview" => "interview",
            "offer" => "offer",
            "hired" => "hired",
            "rejected" => "rejected",
            _ => "new"
        };
    }
}

public record AddApplicantPositionRequest(string Name);
public record UpdateApplicantPositionStatusRequest(string Name, bool IsActive);
public record UpdateApplicantPositionRequest(string CurrentName, string NewName, bool IsActive);
public record ApplicantPositionItem(string Name, bool IsActive);
public record CreateApplicantRecordRequest(
    string FullName,
    string? Gender,
    int? Age,
    string? Position,
    string? Source,
    string? Status,
    DateTime? AppliedDate,
    string? Notes,
    string? CvFileName,
    string? CvDataUrl
);
public record UpdateApplicantRecordStatusRequest(string Status);

