using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Unauthenticated intake for public career sites (e.g. Landmark Trucking).
/// Secured with <c>X-Public-Applicant-Key</c> and light per-IP rate limiting.
/// </summary>
[ApiController]
[Route("api/v1/public/applicants")]
public class PublicApplicantsController : ControllerBase
{
    private const int MaxSubmissionsPerIpPerHour = 8;
    private const int MaxNotesLength = 12000;

    private readonly TaylorAccessDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _cache;
    private readonly ILogger<PublicApplicantsController> _logger;

    public PublicApplicantsController(
        TaylorAccessDbContext context,
        IConfiguration configuration,
        IMemoryCache cache,
        ILogger<PublicApplicantsController> logger)
    {
        _context = context;
        _configuration = configuration;
        _cache = cache;
        _logger = logger;
    }

    [HttpPost("driver-application")]
    [AllowAnonymous]
    public async Task<ActionResult> SubmitDriverApplication([FromBody] PublicDriverApplicationRequest? body)
    {
        var configuredKey = ResolveApiKey();
        if (string.IsNullOrWhiteSpace(configuredKey))
        {
            _logger.LogWarning("PUBLIC_DRIVER_APPLICANT_KEY / PublicDriverApplicant:ApiKey is not configured; driver intake disabled.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { error = "Driver applications are not enabled on this server." });
        }

        var providedKey = Request.Headers["X-Public-Applicant-Key"].ToString();
        if (!FixedTimeEquals(providedKey, configuredKey))
            return Unauthorized(new { error = "Invalid application key." });

        var clientIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        if (!CheckRateLimit(clientIp))
            return StatusCode(StatusCodes.Status429TooManyRequests,
                new { error = "Too many applications from this network. Please try again later." });

        if (body is null)
            return BadRequest(new { error = "Request body is required." });

        if (!string.IsNullOrWhiteSpace(body.CompanyWebsite))
        {
            _logger.LogInformation("Driver application rejected (honeypot filled) from {Ip}", clientIp);
            return BadRequest(new { error = "Invalid request." });
        }

        var fullName = (body.FullName ?? string.Empty).Trim();
        if (fullName.Length < 2 || fullName.Length > 200)
            return BadRequest(new { error = "Please enter your full name." });

        var email = (body.Email ?? string.Empty).Trim();
        if (email.Length < 5 || email.Length > 200 || !email.Contains('@', StringComparison.Ordinal))
            return BadRequest(new { error = "Please enter a valid email address." });

        var phone = (body.Phone ?? string.Empty).Trim();
        if (phone.Length < 7 || phone.Length > 80)
            return BadRequest(new { error = "Please enter a valid phone number." });

        var position = string.IsNullOrWhiteSpace(body.PositionInterest)
            ? "Driver"
            : body.PositionInterest.Trim();
        if (position.Length > 200)
            position = position[..200];

        var notes = BuildNotes(body, email, phone);
        if (notes.Length > MaxNotesLength)
            return BadRequest(new { error = "Notes are too long." });

        var row = new ApplicantRecord
        {
            FullName = fullName,
            Position = position,
            Source = "Landmark Trucking (website)",
            State = string.IsNullOrWhiteSpace(body.HomeState) ? null : body.HomeState.Trim(),
            Status = "new",
            IsHistorical = false,
            AppliedDate = DateTime.UtcNow,
            Notes = notes,
            CreatedByUserId = null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.ApplicantRecords.Add(row);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Public driver application created id={Id} name={Name} ip={Ip}", row.Id, fullName, clientIp);

        return Ok(new
        {
            received = true,
            id = row.Id
        });
    }

    private string? ResolveApiKey()
    {
        var fromEnv = Environment.GetEnvironmentVariable("PUBLIC_DRIVER_APPLICANT_KEY");
        if (!string.IsNullOrWhiteSpace(fromEnv))
            return fromEnv.Trim();

        var fromConfig = _configuration["PublicDriverApplicant:ApiKey"];
        return string.IsNullOrWhiteSpace(fromConfig) ? null : fromConfig.Trim();
    }

    private bool CheckRateLimit(string clientIp)
    {
        var hour = DateTime.UtcNow.ToString("yyyyMMddHH", System.Globalization.CultureInfo.InvariantCulture);
        var key = $"public_driver_apply:{clientIp}:{hour}";
        var count = 0;
        if (_cache.TryGetValue(key, out int stored))
            count = stored;
        if (count >= MaxSubmissionsPerIpPerHour)
            return false;

        _cache.Set(key, count + 1, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1)
        });
        return true;
    }

    private static string BuildNotes(PublicDriverApplicationRequest body, string email, string phone)
    {
        var sb = new StringBuilder(512);
        sb.AppendLine("--- Driver application (public website) ---");
        sb.Append("Email: ").AppendLine(email);
        sb.Append("Phone: ").AppendLine(phone);
        if (!string.IsNullOrWhiteSpace(body.CdlNumber))
            sb.Append("CDL #: ").AppendLine(body.CdlNumber.Trim());
        if (body.YearsExperience is >= 0 and <= 60)
            sb.Append("Years driving (approx): ").AppendLine(body.YearsExperience.Value.ToString(System.Globalization.CultureInfo.InvariantCulture));
        if (!string.IsNullOrWhiteSpace(body.Endorsements))
            sb.Append("Endorsements: ").AppendLine(body.Endorsements.Trim());
        if (!string.IsNullOrWhiteSpace(body.HomeState))
            sb.Append("Home state: ").AppendLine(body.HomeState.Trim());
        if (!string.IsNullOrWhiteSpace(body.AdditionalInfo))
        {
            var extra = body.AdditionalInfo.Trim();
            if (extra.Length > 6000)
                extra = extra[..6000];
            sb.AppendLine().AppendLine(extra);
        }
        return sb.ToString().TrimEnd();
    }

    private static bool FixedTimeEquals(string? a, string? b)
    {
        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b) || a.Length != b.Length)
            return false;
        var left = Encoding.UTF8.GetBytes(a);
        var right = Encoding.UTF8.GetBytes(b);
        return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(left, right);
    }
}

public record PublicDriverApplicationRequest(
    string? FullName,
    string? Email,
    string? Phone,
    /// <summary>Job title / role the applicant selected on the careers page.</summary>
    string? PositionInterest,
    string? CdlNumber,
    int? YearsExperience,
    string? Endorsements,
    string? HomeState,
    string? AdditionalInfo,
    /// <summary>Honeypot — must be null or empty.</summary>
    string? CompanyWebsite
);
