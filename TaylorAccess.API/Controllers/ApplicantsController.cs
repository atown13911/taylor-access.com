using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/applicants")]
[Authorize]
public class ApplicantsController : ControllerBase
{
    private const string PositionsSettingsKey = "applicantsPositions";

    private readonly TaylorAccessDbContext _context;

    public ApplicantsController(TaylorAccessDbContext context)
    {
        _context = context;
    }

    [HttpGet("records")]
    public async Task<ActionResult> GetApplicants([FromQuery] bool includeCv = false)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

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
                a.TrainingGroupAssignment,
                a.Status,
                appliedDate = a.AppliedDate,
                a.Notes,
                a.CvFileName,
                CvDataUrl = includeCv ? a.CvDataUrl : null,
                hasCv = !string.IsNullOrWhiteSpace(a.CvDataUrl),
                a.CreatedAt,
                a.UpdatedAt
            })
            .ToListAsync();

        return Ok(new { data = rows });
    }

    [HttpPost("records")]
    public async Task<ActionResult> CreateApplicant([FromBody] CreateApplicantRecordRequest request)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

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
            TrainingGroupAssignment = string.IsNullOrWhiteSpace(request.TrainingGroupAssignment) ? null : request.TrainingGroupAssignment.Trim(),
            Status = NormalizeStatus(request.Status),
            AppliedDate = request.AppliedDate,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            CvFileName = string.IsNullOrWhiteSpace(request.CvFileName) ? null : request.CvFileName.Trim(),
            CvDataUrl = string.IsNullOrWhiteSpace(request.CvDataUrl) ? null : request.CvDataUrl,
            CreatedByUserId = TryGetRequestUserId(),
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
                row.TrainingGroupAssignment,
                row.Status,
                appliedDate = row.AppliedDate,
                row.Notes,
                row.CvFileName,
                row.CvDataUrl,
                hasCv = !string.IsNullOrWhiteSpace(row.CvDataUrl),
                row.CreatedAt,
                row.UpdatedAt
            }
        });
    }

    [HttpPut("records/{id:int}/status")]
    public async Task<ActionResult> UpdateApplicantStatus(int id, [FromBody] UpdateApplicantRecordStatusRequest request)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

        var row = await _context.ApplicantRecords.FirstOrDefaultAsync(a => a.Id == id);
        if (row == null) return NotFound(new { error = "Applicant not found" });

        row.Status = NormalizeStatus(request.Status);
        row.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { updated = true, status = row.Status });
    }

    [HttpPut("records/{id:int}")]
    public async Task<ActionResult> UpdateApplicant(int id, [FromBody] UpdateApplicantRecordRequest request)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

        var row = await _context.ApplicantRecords.FirstOrDefaultAsync(a => a.Id == id);
        if (row == null) return NotFound(new { error = "Applicant not found" });

        var fullName = string.IsNullOrWhiteSpace(request.FullName) ? string.Empty : request.FullName.Trim();
        if (string.IsNullOrWhiteSpace(fullName))
            return BadRequest(new { error = "Name is required" });

        row.FullName = fullName;
        row.Gender = string.IsNullOrWhiteSpace(request.Gender) ? null : request.Gender.Trim();
        row.Age = request.Age is >= 16 and <= 100 ? request.Age : null;
        row.Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim();
        row.Source = string.IsNullOrWhiteSpace(request.Source) ? null : request.Source.Trim();
        row.TrainingGroupAssignment = string.IsNullOrWhiteSpace(request.TrainingGroupAssignment) ? null : request.TrainingGroupAssignment.Trim();
        row.Status = NormalizeStatus(request.Status);
        row.AppliedDate = request.AppliedDate;
        row.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        row.CvFileName = string.IsNullOrWhiteSpace(request.CvFileName) ? null : request.CvFileName.Trim();
        row.CvDataUrl = string.IsNullOrWhiteSpace(request.CvDataUrl) ? null : request.CvDataUrl;
        row.UpdatedAt = DateTime.UtcNow;

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
                row.TrainingGroupAssignment,
                row.Status,
                appliedDate = row.AppliedDate,
                row.Notes,
                row.CvFileName,
                row.CvDataUrl,
                hasCv = !string.IsNullOrWhiteSpace(row.CvDataUrl),
                row.CreatedAt,
                row.UpdatedAt
            }
        });
    }

    [HttpGet("records/{id:int}/cv")]
    public async Task<ActionResult> GetApplicantCv(int id)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

        var row = await _context.ApplicantRecords
            .AsNoTracking()
            .Where(a => a.Id == id)
            .Select(a => new
            {
                a.Id,
                a.CvFileName,
                a.CvDataUrl
            })
            .FirstOrDefaultAsync();

        if (row == null) return NotFound(new { error = "Applicant not found" });
        if (string.IsNullOrWhiteSpace(row.CvDataUrl))
            return NotFound(new { error = "CV not found for this applicant" });

        return Ok(new
        {
            data = new
            {
                row.Id,
                row.CvFileName,
                row.CvDataUrl
            }
        });
    }

    [HttpDelete("records/{id:int}")]
    public async Task<ActionResult> DeleteApplicant(int id)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

        var row = await _context.ApplicantRecords.FirstOrDefaultAsync(a => a.Id == id);
        if (row == null) return NotFound(new { error = "Applicant not found" });

        _context.ApplicantRecords.Remove(row);
        await _context.SaveChangesAsync();
        return Ok(new { deleted = true, id });
    }

    [HttpGet("positions")]
    public async Task<ActionResult> GetPositions()
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

        var organizations = await _context.Organizations
            .AsTracking()
            .OrderBy(o => o.Id)
            .ToListAsync();
        if (organizations.Count == 0)
            return NotFound(new { error = "No organizations found" });

        var positions = organizations
            .SelectMany(o => ExtractPositions(ParseSettings(o.Settings)));
        var merged = MergePositions(positions);

        return Ok(new { data = merged.Select(p => new { name = p.Name, isActive = p.IsActive, color = p.Color }).ToList() });
    }

    [HttpPost("positions")]
    public async Task<ActionResult> AddPosition([FromBody] AddApplicantPositionRequest request)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

        var organizations = await _context.Organizations
            .AsTracking()
            .OrderBy(o => o.Id)
            .ToListAsync();
        if (organizations.Count == 0)
            return NotFound(new { error = "No organizations found" });

        var name = string.IsNullOrWhiteSpace(request.Name) ? string.Empty : request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { error = "Position name is required" });
        var color = NormalizeColor(request.Color);

        var positions = organizations
            .SelectMany(o => ExtractPositions(ParseSettings(o.Settings)));
        var merged = MergePositions(positions);

        if (!merged.Any(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
            merged.Add(new ApplicantPositionItem(name, true, color));
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

        return Ok(new { data = merged.Select(p => new { name = p.Name, isActive = p.IsActive, color = p.Color }).ToList() });
    }

    [HttpPut("positions/status")]
    public async Task<ActionResult> UpdatePositionStatus([FromBody] UpdateApplicantPositionStatusRequest request)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

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
            merged[idx] = new ApplicantPositionItem(merged[idx].Name, request.IsActive, merged[idx].Color);
        else
            merged.Add(new ApplicantPositionItem(name, request.IsActive, null));
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
        return Ok(new { data = merged.Select(p => new { name = p.Name, isActive = p.IsActive, color = p.Color }).ToList() });
    }

    [HttpPut("positions")]
    public async Task<ActionResult> UpdatePosition([FromBody] UpdateApplicantPositionRequest request)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

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

        var color = NormalizeColor(request.Color) ?? merged[idx].Color;
        merged[idx] = new ApplicantPositionItem(newName, request.IsActive, color);
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
        return Ok(new { data = merged.Select(p => new { name = p.Name, isActive = p.IsActive, color = p.Color }).ToList() });
    }

    [HttpDelete("positions/{name}")]
    public async Task<ActionResult> DeletePosition(string name)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();

        var target = string.IsNullOrWhiteSpace(name) ? string.Empty : Uri.UnescapeDataString(name).Trim();
        if (string.IsNullOrWhiteSpace(target))
            return BadRequest(new { error = "Position name is required" });

        var organizations = await _context.Organizations
            .AsTracking()
            .OrderBy(o => o.Id)
            .ToListAsync();
        if (organizations.Count == 0)
            return NotFound(new { error = "No organizations found" });

        var positions = organizations
            .SelectMany(o => ExtractPositions(ParseSettings(o.Settings)));
        var merged = MergePositions(positions);

        var next = merged
            .Where(p => !p.Name.Equals(target, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (next.Count == merged.Count)
            return NotFound(new { error = "Position not found" });

        var node = BuildPositionsNode(next);
        foreach (var org in organizations)
        {
            var settings = ParseSettings(org.Settings);
            settings[PositionsSettingsKey] = node.DeepClone();
            org.Settings = settings.ToJsonString();
            org.UpdatedAt = DateTime.UtcNow;
        }

        // Clear the deleted position from applicant records so the tab doesn't reappear from row-derived positions.
        var rows = await _context.ApplicantRecords
            .Where(a => a.Position != null)
            .ToListAsync();
        foreach (var row in rows)
        {
            var normalized = string.IsNullOrWhiteSpace(row.Position) ? string.Empty : row.Position.Trim();
            if (!normalized.Equals(target, StringComparison.OrdinalIgnoreCase)) continue;
            row.Position = null;
            row.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
        return Ok(new { data = next.Select(p => new { name = p.Name, isActive = p.IsActive, color = p.Color }).ToList() });
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
                    list.Add(new ApplicantPositionItem(name, true, null));
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

                var color = NormalizeColor(obj["color"]?.ToString() ?? obj["Color"]?.ToString());
                list.Add(new ApplicantPositionItem(name, isActive, color));
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
            {
                var mergedColor = existing.Color ?? item.Color;
                map[name] = new ApplicantPositionItem(name, existing.IsActive || item.IsActive, mergedColor);
            }
            else
                map[name] = new ApplicantPositionItem(name, item.IsActive, item.Color);
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
                ["isActive"] = item.IsActive,
                ["color"] = item.Color
            });
        }
        return array;
    }

    private static string? NormalizeColor(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var value = raw.Trim();
        if (!value.StartsWith("#")) value = "#" + value;
        if (value.Length != 7) return null;
        for (var i = 1; i < value.Length; i++)
        {
            var c = value[i];
            var isHex = (c >= '0' && c <= '9')
                || (c >= 'a' && c <= 'f')
                || (c >= 'A' && c <= 'F');
            if (!isHex) return null;
        }
        return value.ToUpperInvariant();
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
            "no response" => "no response",
            "no show" => "no show",
            "rejected" => "rejected",
            _ => "new"
        };
    }

    private int? TryGetRequestUserId()
    {
        var idValue = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub");
        return int.TryParse(idValue, out var parsedId) && parsedId > 0 ? parsedId : null;
    }
}

public record AddApplicantPositionRequest(string Name, string? Color);
public record UpdateApplicantPositionStatusRequest(string Name, bool IsActive);
public record UpdateApplicantPositionRequest(string CurrentName, string NewName, bool IsActive, string? Color);
public record ApplicantPositionItem(string Name, bool IsActive, string? Color);
public record CreateApplicantRecordRequest(
    string FullName,
    string? Gender,
    int? Age,
    string? Position,
    string? Source,
    string? TrainingGroupAssignment,
    string? Status,
    DateTime? AppliedDate,
    string? Notes,
    string? CvFileName,
    string? CvDataUrl
);
public record UpdateApplicantRecordStatusRequest(string Status);
public record UpdateApplicantRecordRequest(
    string FullName,
    string? Gender,
    int? Age,
    string? Position,
    string? Source,
    string? TrainingGroupAssignment,
    string? Status,
    DateTime? AppliedDate,
    string? Notes,
    string? CvFileName,
    string? CvDataUrl
);

