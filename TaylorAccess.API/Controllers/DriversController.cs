using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using MongoDB.Bson;
using System.Globalization;
using System.Text.Json;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class DriversController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly ILogger<DriversController> _logger;
    private readonly CurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;

    public DriversController(
        TaylorAccessDbContext context,
        ILogger<DriversController> logger,
        CurrentUserService currentUserService,
        IAuditService auditService,
        IHttpClientFactory httpClientFactory,
        IConfiguration config)
    {
        _context = context;
        _logger = logger;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _httpClientFactory = httpClientFactory;
        _config = config;
    }

    /// <summary>
    /// Get all drivers with optional filtering
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetDrivers(
        [FromQuery] string? status,
        [FromQuery] bool? isOnline,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 25)
    {
        var query = _context.Drivers
            .AsNoTracking()
            .Include(d => d.Division)
            .Include(d => d.DriverTerminal)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status))
            query = query.Where(d => d.Status == status);

        if (isOnline.HasValue)
            query = query.Where(d => d.IsOnline == isOnline.Value);

        if (!string.IsNullOrEmpty(search))
            query = query.Where(d => 
                d.Name.Contains(search) || 
                (d.Email != null && d.Email.Contains(search)) ||
                (d.Phone != null && d.Phone.Contains(search)));

        var total = await query.CountAsync();
        var drivers = await query
            .OrderBy(d => d.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .ToListAsync();

        return Ok(new
        {
            data = drivers,
            total,
            page,
            limit,
            totalPages = (int)Math.Ceiling((double)total / limit)
        });
    }

    /// <summary>
    /// Get a single driver by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<Driver>> GetDriver(int id)
    {
        var driver = await _context.Drivers
            .Include(d => d.Division)
            .Include(d => d.DriverTerminal)
            .Include(d => d.AddressRef)
            .FirstOrDefaultAsync(d => d.Id == id);

        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        return Ok(new { data = driver });
    }

    /// <summary>
    /// Create a new driver
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<Driver>> CreateDriver([FromBody] CreateDriverRequest request)
    {
        // Input validation
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Full Name is required" });
        if (string.IsNullOrWhiteSpace(request.Phone))
            return BadRequest(new { error = "Phone number is required" });

        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized(new { error = "Not authenticated" });

        // Resolve org: direct property first, then query UserOrganizations table
        var orgId = user.OrganizationId ?? 0;
        if (orgId == 0)
        {
            var orgIds = await _currentUserService.GetUserOrganizationIdsAsync();
            orgId = orgIds.FirstOrDefault();
        }
        if (orgId == 0)
            return BadRequest(new { error = "Cannot create driver — no organization assigned to your account. Contact an admin." });

        // Verify the organization actually exists in the DB
        var orgExists = await _context.Organizations.AnyAsync(o => o.Id == orgId);
        if (!orgExists)
            return BadRequest(new { error = $"Organization (ID: {orgId}) not found. Contact an admin." });

        try
        {
            var driver = new Driver
            {
                OrganizationId = orgId,
                DivisionId = request.DivisionId,
                DriverTerminalId = request.DriverTerminalId,
                Name = request.Name,
                Email = request.Email,
                Phone = request.Phone,
                // License Info
                LicenseNumber = request.LicenseNumber,
                LicenseClass = request.LicenseClass,
                LicenseState = request.LicenseState,
                LicenseExpiry = request.LicenseExpiry,
                MedicalCardExpiry = request.MedicalCardExpiry,
                DateOfBirth = request.DateOfBirth,
                // Status
                Status = request.Status ?? "available",
                DriverType = request.DriverType,
                // Emergency Contact
                EmergencyContactName = request.EmergencyContactName ?? request.EmergencyContact,
                EmergencyContactPhone = request.EmergencyContactPhone ?? request.EmergencyPhone,
                // Employment
                HireDate = request.HireDate,
                PayRate = request.PayRate,
                PayType = request.PayType,
                // Other
                PhotoUrl = request.PhotoUrl,
                Notes = request.Notes
            };

            // Create Address record if address fields provided
            if (!string.IsNullOrEmpty(request.Address) || !string.IsNullOrEmpty(request.City))
            {
                var addr = new Address
                {
                    Name = request.Name ?? "Home",
                    Street1 = request.Address ?? "",
                    City = request.City ?? "",
                    State = request.State ?? "",
                    ZipCode = request.ZipCode ?? request.Zip ?? ""
                };
                _context.Set<Address>().Add(addr);
                await _context.SaveChangesAsync();
                driver.AddressId = addr.Id;
            }

            _context.Drivers.Add(driver);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Created driver {Name} in org {OrgId}", driver.Name, orgId);
            
            await _auditService.LogAsync(AuditActions.Create, "Driver", driver.Id, 
                $"Created driver {driver.Name} - {driver.LicenseNumber}");

            return CreatedAtAction(nameof(GetDriver), new { id = driver.Id }, new { data = driver });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create driver {Name}", request.Name);
            return StatusCode(500, new { error = $"Failed to create driver: {ex.InnerException?.Message ?? ex.Message}" });
        }
    }

    /// <summary>
    /// Update a driver
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<Driver>> UpdateDriver(int id, [FromBody] UpdateDriverRequest request)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        // Basic Info
        if (!string.IsNullOrEmpty(request.Name)) driver.Name = request.Name;
        if (request.Email != null) driver.Email = request.Email;
        if (request.Phone != null) driver.Phone = request.Phone;
        
        // License Info
        if (request.LicenseNumber != null) driver.LicenseNumber = request.LicenseNumber;
        if (request.LicenseClass != null) driver.LicenseClass = request.LicenseClass;
        if (request.LicenseState != null) driver.LicenseState = request.LicenseState;
        if (request.LicenseExpiry.HasValue) driver.LicenseExpiry = request.LicenseExpiry;
        if (request.MedicalCardExpiry.HasValue) driver.MedicalCardExpiry = request.MedicalCardExpiry;
        if (request.DateOfBirth.HasValue) driver.DateOfBirth = request.DateOfBirth;
        
        if (request.FleetId.HasValue) driver.FleetId = request.FleetId.Value == 0 ? null : request.FleetId;
        if (request.OrganizationId.HasValue && request.OrganizationId.Value > 0) driver.OrganizationId = request.OrganizationId.Value;
        if (request.DivisionId.HasValue) driver.DivisionId = request.DivisionId.Value == 0 ? null : request.DivisionId;
        if (request.DriverTerminalId.HasValue) driver.DriverTerminalId = request.DriverTerminalId.Value == 0 ? null : request.DriverTerminalId;
        
        // Status
        if (!string.IsNullOrEmpty(request.Status)) driver.Status = request.Status;
        if (request.IsOnline.HasValue) driver.IsOnline = request.IsOnline.Value;
        if (request.DriverType != null) driver.DriverType = request.DriverType;
        if (request.Ssn != null) driver.Ssn = request.Ssn;
        if (request.TruckNumber != null) driver.TruckNumber = request.TruckNumber;
        if (request.TruckMake != null) driver.TruckMake = request.TruckMake;
        if (request.TruckModel != null) driver.TruckModel = request.TruckModel;
        if (request.TruckYear.HasValue) driver.TruckYear = request.TruckYear;
        if (request.TruckVin != null) driver.TruckVin = request.TruckVin;
        if (request.TruckTag != null) driver.TruckTag = request.TruckTag;
        
        // Address: create or update the linked Address record
        var hasAddressFields = request.Address != null || request.City != null || request.State != null || request.ZipCode != null || request.Zip != null;
        if (hasAddressFields)
        {
            if (driver.AddressId.HasValue)
            {
                var addr = await _context.Set<Address>().FindAsync(driver.AddressId.Value);
                if (addr != null)
                {
                    if (request.Address != null) addr.Street1 = request.Address;
                    if (request.City != null) addr.City = request.City;
                    if (request.State != null) addr.State = request.State;
                    if (request.ZipCode != null) addr.ZipCode = request.ZipCode;
                    if (request.Zip != null) addr.ZipCode = request.Zip;
                    addr.UpdatedAt = DateTime.UtcNow;
                }
            }
            else
            {
                var addr = new Address
                {
                    Name = driver.Name ?? "Home",
                    Street1 = request.Address ?? "",
                    City = request.City ?? "",
                    State = request.State ?? "",
                    ZipCode = request.ZipCode ?? request.Zip ?? ""
                };
                _context.Set<Address>().Add(addr);
                await _context.SaveChangesAsync();
                driver.AddressId = addr.Id;
            }
        }
        
        // Emergency Contact (support both naming conventions)
        if (request.EmergencyContactName != null) driver.EmergencyContactName = request.EmergencyContactName;
        if (request.EmergencyContact != null) driver.EmergencyContactName = request.EmergencyContact;
        if (request.EmergencyContactPhone != null) driver.EmergencyContactPhone = request.EmergencyContactPhone;
        if (request.EmergencyPhone != null) driver.EmergencyContactPhone = request.EmergencyPhone;
        
        // Employment
        if (request.HireDate.HasValue) driver.HireDate = request.HireDate;
        if (request.TerminationDate.HasValue) driver.TerminationDate = request.TerminationDate;
        if (request.PayRate.HasValue) driver.PayRate = request.PayRate;
        if (request.PayType != null) driver.PayType = request.PayType;
        
        // GPS
        if (request.Latitude.HasValue) driver.Latitude = request.Latitude;
        if (request.Longitude.HasValue) driver.Longitude = request.Longitude;
        
        // Other
        if (request.PhotoUrl != null) driver.PhotoUrl = request.PhotoUrl;
        if (request.Notes != null) driver.Notes = request.Notes;

        driver.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated driver {Name} (ID: {Id})", driver.Name, driver.Id);
        
        await _auditService.LogAsync(AuditActions.Update, "Driver", driver.Id, 
            $"Updated driver {driver.Name}");

        return Ok(new { data = driver });
    }

    /// <summary>
    /// Import drivers from DrayTac and force them into archived status.
    /// This is intended for one-time or periodic historical backfill into the Archived tab.
    /// </summary>
    [HttpPost("import-draytac-archived")]
    [Authorize(Roles = "product_owner,superadmin")]
    public async Task<ActionResult> ImportDrayTacArchived([FromBody] ImportDrayTacDriversRequest? request)
    {
        var sourceApiUrl = _config["DrayTac:ApiUrl"]
            ?? Environment.GetEnvironmentVariable("DRAYTAC_API_URL")
            ?? "https://taylor-tms.net";

        var sourceBearer = _config["DrayTac:BearerToken"]
            ?? Environment.GetEnvironmentVariable("DRAYTAC_BEARER_TOKEN");
        var sourceServiceKey = _config["DrayTac:ServiceKey"]
            ?? Environment.GetEnvironmentVariable("DRAYTAC_SERVICE_KEY");
        var sourceWebhookSecret = _config["DrayTac:WebhookSecret"]
            ?? Environment.GetEnvironmentVariable("DRAYTAC_WEBHOOK_SECRET");

        var limit = Math.Clamp(request?.Limit ?? 5000, 100, 20000);
        var forceArchive = request?.ForceArchive ?? true;

        var http = _httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(90);
        if (!string.IsNullOrWhiteSpace(sourceBearer))
            http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", sourceBearer);
        if (!string.IsNullOrWhiteSpace(sourceServiceKey))
            http.DefaultRequestHeaders.TryAddWithoutValidation("X-Service-Key", sourceServiceKey);
        if (!string.IsNullOrWhiteSpace(sourceWebhookSecret))
            http.DefaultRequestHeaders.TryAddWithoutValidation("X-Webhook-Secret", sourceWebhookSecret);

        var drivers = await FetchSourceDrivers(http, sourceApiUrl, limit);
        if (drivers.Count == 0)
        {
            drivers = await TryFetchSourceDriversViaGatewayMongo(limit);
        }
        if (drivers.Count == 0)
            return Ok(new { created = 0, updated = 0, skipped = 0, fetched = 0, message = "No source drivers returned from DrayTac." });

        var defaultOrgId = await _context.Organizations.Select(o => o.Id).FirstOrDefaultAsync();
        if (defaultOrgId == 0)
            return BadRequest(new { error = "No organizations exist in Taylor Access. Create an organization first." });

        var validOrgIds = (await _context.Organizations.AsNoTracking().Select(o => o.Id).ToListAsync()).ToHashSet();
        var validDivisionIds = (await _context.Divisions.AsNoTracking().Select(d => d.Id).ToListAsync()).ToHashSet();
        var validTerminalIds = (await _context.DriverTerminals.AsNoTracking().Select(t => t.Id).ToListAsync()).ToHashSet();
        var validSatelliteIds = (await _context.Satellites.AsNoTracking().Select(s => s.Id).ToListAsync()).ToHashSet();
        var validAgencyIds = (await _context.Agencies.AsNoTracking().Select(a => a.Id).ToListAsync()).ToHashSet();

        var existing = await _context.Drivers.ToListAsync();
        var byEmail = existing
            .Where(d => !string.IsNullOrWhiteSpace(d.Email))
            .GroupBy(d => d.Email!.Trim().ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First());
        var byNamePhone = existing
            .GroupBy(d => $"{(d.Name ?? "").Trim().ToLowerInvariant()}|{(d.Phone ?? "").Trim()}")
            .ToDictionary(g => g.Key, g => g.First());

        int created = 0, updated = 0, skipped = 0;

        foreach (var src in drivers)
        {
            var name = PickString(src, "name", "fullName", "driverName");
            if (string.IsNullOrWhiteSpace(name))
            {
                skipped++;
                continue;
            }

            var email = PickString(src, "email", "workEmail", "personalEmail");
            var phone = PickString(src, "phone", "mobile", "cellPhone", "phoneNumber");
            var emailKey = (email ?? "").Trim().ToLowerInvariant();
            var namePhoneKey = $"{name.Trim().ToLowerInvariant()}|{(phone ?? "").Trim()}";

            Driver? target = null;
            if (!string.IsNullOrWhiteSpace(emailKey) && byEmail.TryGetValue(emailKey, out var byE))
                target = byE;
            else if (byNamePhone.TryGetValue(namePhoneKey, out var byNP))
                target = byNP;

            var srcOrgId = PickInt(src, "organizationId", "orgId");
            var srcDivisionId = PickInt(src, "divisionId");
            var srcTerminalId = PickInt(src, "driverTerminalId", "homeTerminalId", "terminalId");
            var srcSatelliteId = PickInt(src, "satelliteId");
            var srcAgencyId = PickInt(src, "agencyId");

            var mappedOrgId = srcOrgId.HasValue && validOrgIds.Contains(srcOrgId.Value) ? srcOrgId.Value : defaultOrgId;
            var mappedDivisionId = srcDivisionId.HasValue && validDivisionIds.Contains(srcDivisionId.Value) ? srcDivisionId : null;
            var mappedTerminalId = srcTerminalId.HasValue && validTerminalIds.Contains(srcTerminalId.Value) ? srcTerminalId : null;
            var mappedSatelliteId = srcSatelliteId.HasValue && validSatelliteIds.Contains(srcSatelliteId.Value) ? srcSatelliteId : null;
            var mappedAgencyId = srcAgencyId.HasValue && validAgencyIds.Contains(srcAgencyId.Value) ? srcAgencyId : null;

            var mappedStatus = forceArchive ? "archived" : (PickString(src, "status") ?? "archived");
            var mappedLicenseExpiry = ParseDateOnly(PickString(src, "licenseExpiry", "licenseExpiration"));
            var mappedMedicalExpiry = ParseDateOnly(PickString(src, "medicalCardExpiry", "medicalCardExpiration"));
            var mappedDob = ParseDateOnly(PickString(src, "dateOfBirth", "dob"));
            var mappedHireDate = ParseDateOnly(PickString(src, "hireDate"));
            var mappedTermination = ParseDateOnly(PickString(src, "terminationDate"));

            if (target == null)
            {
                target = new Driver
                {
                    OrganizationId = mappedOrgId,
                    SatelliteId = mappedSatelliteId,
                    AgencyId = mappedAgencyId,
                    HomeTerminalId = mappedTerminalId,
                    DivisionId = mappedDivisionId,
                    DriverTerminalId = mappedTerminalId,
                    Name = name.Trim(),
                    Email = email,
                    PersonalEmail = PickString(src, "personalEmail"),
                    Phone = phone,
                    LicenseNumber = PickString(src, "licenseNumber", "driverLicense"),
                    LicenseClass = PickString(src, "licenseClass"),
                    LicenseState = PickString(src, "licenseState"),
                    LicenseExpiry = mappedLicenseExpiry,
                    MedicalCardExpiry = mappedMedicalExpiry,
                    DateOfBirth = mappedDob,
                    Status = mappedStatus,
                    IsOnline = false,
                    FleetId = PickInt(src, "fleetId"),
                    DriverType = PickString(src, "driverType", "type"),
                    Ssn = PickString(src, "ssn"),
                    TruckNumber = PickString(src, "truckNumber", "unit", "unitNumber"),
                    TruckMake = PickString(src, "truckMake", "vehicleMake"),
                    TruckModel = PickString(src, "truckModel", "vehicleModel"),
                    TruckYear = PickInt(src, "truckYear", "vehicleYear"),
                    TruckVin = PickString(src, "truckVin", "vin"),
                    TruckTag = PickString(src, "truckTag", "licensePlate"),
                    TwiccCardNumber = PickString(src, "twiccCardNumber", "twicCardNumber"),
                    TwiccExpiry = ParseDateOnly(PickString(src, "twiccExpiry", "twicExpiry")),
                    EmergencyContactName = PickString(src, "emergencyContactName", "emergencyContact"),
                    EmergencyContactPhone = PickString(src, "emergencyContactPhone", "emergencyPhone"),
                    HireDate = mappedHireDate,
                    TerminationDate = mappedTermination,
                    PayRate = PickDecimal(src, "payRate"),
                    PayType = PickString(src, "payType"),
                    Notes = MergeNotes("Imported from DrayTac as archived record", PickString(src, "notes")),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    IsDeleted = false
                };
                _context.Drivers.Add(target);
                created++;
            }
            else
            {
                target.OrganizationId = mappedOrgId;
                target.SatelliteId = mappedSatelliteId;
                target.AgencyId = mappedAgencyId;
                target.HomeTerminalId = mappedTerminalId;
                target.DivisionId = mappedDivisionId;
                target.DriverTerminalId = mappedTerminalId;
                target.Name = name.Trim();
                target.Email = email ?? target.Email;
                target.PersonalEmail = PickString(src, "personalEmail") ?? target.PersonalEmail;
                target.Phone = phone ?? target.Phone;
                target.LicenseNumber = PickString(src, "licenseNumber", "driverLicense") ?? target.LicenseNumber;
                target.LicenseClass = PickString(src, "licenseClass") ?? target.LicenseClass;
                target.LicenseState = PickString(src, "licenseState") ?? target.LicenseState;
                target.LicenseExpiry = mappedLicenseExpiry ?? target.LicenseExpiry;
                target.MedicalCardExpiry = mappedMedicalExpiry ?? target.MedicalCardExpiry;
                target.DateOfBirth = mappedDob ?? target.DateOfBirth;
                target.Status = mappedStatus;
                target.IsOnline = false;
                target.FleetId = PickInt(src, "fleetId") ?? target.FleetId;
                target.DriverType = PickString(src, "driverType", "type") ?? target.DriverType;
                target.Ssn = PickString(src, "ssn") ?? target.Ssn;
                target.TruckNumber = PickString(src, "truckNumber", "unit", "unitNumber") ?? target.TruckNumber;
                target.TruckMake = PickString(src, "truckMake", "vehicleMake") ?? target.TruckMake;
                target.TruckModel = PickString(src, "truckModel", "vehicleModel") ?? target.TruckModel;
                target.TruckYear = PickInt(src, "truckYear", "vehicleYear") ?? target.TruckYear;
                target.TruckVin = PickString(src, "truckVin", "vin") ?? target.TruckVin;
                target.TruckTag = PickString(src, "truckTag", "licensePlate") ?? target.TruckTag;
                target.TwiccCardNumber = PickString(src, "twiccCardNumber", "twicCardNumber") ?? target.TwiccCardNumber;
                target.TwiccExpiry = ParseDateOnly(PickString(src, "twiccExpiry", "twicExpiry")) ?? target.TwiccExpiry;
                target.EmergencyContactName = PickString(src, "emergencyContactName", "emergencyContact") ?? target.EmergencyContactName;
                target.EmergencyContactPhone = PickString(src, "emergencyContactPhone", "emergencyPhone") ?? target.EmergencyContactPhone;
                target.HireDate = mappedHireDate ?? target.HireDate;
                target.TerminationDate = mappedTermination ?? target.TerminationDate;
                target.PayRate = PickDecimal(src, "payRate") ?? target.PayRate;
                target.PayType = PickString(src, "payType") ?? target.PayType;
                target.Notes = MergeNotes(target.Notes, "Imported from DrayTac archive sync");
                target.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        await _context.SaveChangesAsync();
        await _auditService.LogAsync(AuditActions.Update, "Driver", 0, $"DrayTac archived import: created={created}, updated={updated}, fetched={drivers.Count}");

        return Ok(new
        {
            created,
            updated,
            skipped,
            fetched = drivers.Count,
            archivedCount = await _context.Drivers.CountAsync(d => d.Status == "archived")
        });
    }

    private async Task<List<JsonElement>> FetchSourceDrivers(HttpClient http, string baseUrl, int limit)
    {
        var endpoints = new[]
        {
            $"{baseUrl.TrimEnd('/')}/api/v1/drivers?limit={limit}&page=1",
            $"{baseUrl.TrimEnd('/')}/api/v1/webhooks/drivers",
            $"{baseUrl.TrimEnd('/')}/internal/drivers?limit={limit}&page=1"
        };

        foreach (var url in endpoints)
        {
            try
            {
                using var res = await http.GetAsync(url);
                if (!res.IsSuccessStatusCode) continue;
                var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
                var root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.Array)
                    return root.EnumerateArray().ToList();
                if (root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
                    return data.EnumerateArray().ToList();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed fetching DrayTac drivers from {Url}", url);
            }
        }
        return new List<JsonElement>();
    }

    private async Task<List<JsonElement>> TryFetchSourceDriversViaGatewayMongo(int limit)
    {
        var gatewayUrl = _config["GatewayInternalUrl"]
            ?? Environment.GetEnvironmentVariable("GATEWAY_INTERNAL_URL");
        if (string.IsNullOrWhiteSpace(gatewayUrl))
            return new List<JsonElement>();

        var internalKey = _config["INTERNAL_API_KEY"]
            ?? Environment.GetEnvironmentVariable("INTERNAL_API_KEY")
            ?? "ta-internal-2026";
        var dbOverride = _config["DrayTac:MongoDbName"]
            ?? Environment.GetEnvironmentVariable("DRAYTAC_MONGO_DB_NAME");

        var dbCandidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(dbOverride)) dbCandidates.Add(dbOverride);
        dbCandidates.AddRange(new[] { "draytac", "vantac", "van_tac", "dray_tac" });

        var collectionCandidates = new[] { "drivers", "Drivers" };
        var payload = JsonSerializer.Serialize(new
        {
            filter = new { },
            sort = new { _id = -1 },
            limit,
            skip = 0
        });

        using var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(45);
        client.DefaultRequestHeaders.TryAddWithoutValidation("X-Internal-Key", internalKey);

        foreach (var dbName in dbCandidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            foreach (var collection in collectionCandidates)
            {
                var url = $"{gatewayUrl.TrimEnd('/')}/internal/mongo/{dbName}/{collection}/query";
                try
                {
                    using var res = await client.PostAsync(url, new StringContent(payload, System.Text.Encoding.UTF8, "application/json"));
                    if (!res.IsSuccessStatusCode) continue;

                    var body = await res.Content.ReadAsStringAsync();
                    using var parsed = JsonDocument.Parse(body);
                    if (!parsed.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                        continue;

                    var list = new List<JsonElement>();
                    foreach (var item in data.EnumerateArray())
                    {
                        if (item.ValueKind != JsonValueKind.String) continue;
                        var bsonString = item.GetString();
                        if (string.IsNullOrWhiteSpace(bsonString)) continue;

                        try
                        {
                            var bson = BsonDocument.Parse(bsonString);
                            var json = bson.ToJson();
                            var doc = JsonDocument.Parse(json);
                            list.Add(doc.RootElement.Clone());
                        }
                        catch
                        {
                            // skip malformed BSON rows and keep going
                        }
                    }

                    if (list.Count > 0)
                    {
                        _logger.LogInformation("Fetched {Count} DrayTac drivers from gateway Mongo db={Db} collection={Collection}", list.Count, dbName, collection);
                        return list;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Gateway Mongo fetch failed for db={Db} collection={Collection}", dbName, collection);
                }
            }
        }

        return new List<JsonElement>();
    }

    private static string? PickString(JsonElement src, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!src.TryGetProperty(key, out var val)) continue;
            if (val.ValueKind == JsonValueKind.String)
            {
                var s = val.GetString();
                if (!string.IsNullOrWhiteSpace(s)) return s.Trim();
            }
            else if (val.ValueKind == JsonValueKind.Number || val.ValueKind == JsonValueKind.True || val.ValueKind == JsonValueKind.False)
            {
                return val.ToString();
            }
        }
        return null;
    }

    private static int? PickInt(JsonElement src, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!src.TryGetProperty(key, out var val)) continue;
            if (val.ValueKind == JsonValueKind.Number && val.TryGetInt32(out var i)) return i;
            if (val.ValueKind == JsonValueKind.String && int.TryParse(val.GetString(), out var parsed)) return parsed;
        }
        return null;
    }

    private static decimal? PickDecimal(JsonElement src, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!src.TryGetProperty(key, out var val)) continue;
            if (val.ValueKind == JsonValueKind.Number && val.TryGetDecimal(out var d)) return d;
            if (val.ValueKind == JsonValueKind.String && decimal.TryParse(val.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)) return parsed;
        }
        return null;
    }

    private static DateOnly? ParseDateOnly(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        if (DateOnly.TryParse(input, out var d)) return d;
        if (DateTime.TryParse(input, out var dt)) return DateOnly.FromDateTime(dt);
        return null;
    }

    private static string MergeNotes(string? current, string? extra)
    {
        var c = (current ?? "").Trim();
        var e = (extra ?? "").Trim();
        if (string.IsNullOrEmpty(c)) return e;
        if (string.IsNullOrEmpty(e)) return c;
        if (c.Contains(e, StringComparison.OrdinalIgnoreCase)) return c;
        return $"{c} | {e}";
    }

    /// <summary>
    /// Delete a driver
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteDriver(int id)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        await _auditService.LogAsync(AuditActions.Delete, "Driver", driver.Id, 
            $"Deleted driver {driver.Name}");

        _context.Drivers.Remove(driver);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Deleted driver {Name}", driver.Name);

        return Ok(new { deleted = true });
    }

    /// <summary>
    /// Toggle driver online/offline status
    /// </summary>
    [HttpPost("{id}/toggle-online")]
    public async Task<ActionResult<Driver>> ToggleOnline(int id)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        driver.IsOnline = !driver.IsOnline;
        driver.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = driver });
    }

    /// <summary>
    /// Update driver location (GPS)
    /// </summary>
    [HttpPost("{id}/location")]
    public async Task<ActionResult<Driver>> UpdateLocation(int id, [FromBody] UpdateLocationRequest request)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        driver.Latitude = request.Latitude;
        driver.Longitude = request.Longitude;
        driver.LastLocationUpdate = DateTime.UtcNow;
        driver.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = driver });
    }

    /// <summary>
    /// Simulate driver movement (for testing)
    /// </summary>
    [HttpPost("{id}/simulate")]
    public async Task<ActionResult<Driver>> SimulateMovement(int id, [FromBody] SimulateRequest request)
    {
        var driver = await _context.Drivers.FindAsync(id);
        if (driver == null)
            return NotFound(new { error = "Driver not found" });

        // Simulate random movement around current position
        var random = new Random();
        var latOffset = (decimal)(random.NextDouble() - 0.5) * 0.01m;
        var lngOffset = (decimal)(random.NextDouble() - 0.5) * 0.01m;

        driver.Latitude = (driver.Latitude ?? request.StartLatitude ?? 34.0522m) + latOffset;
        driver.Longitude = (driver.Longitude ?? request.StartLongitude ?? -118.2437m) + lngOffset;
        driver.LastLocationUpdate = DateTime.UtcNow;
        driver.IsOnline = true;
        driver.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = driver });
    }
}

// Request DTOs
public record CreateDriverRequest(
    string Name,
    string? Email,
    string? Phone,
    int? DivisionId,
    int? DriverTerminalId,
    string? LicenseNumber,
    string? LicenseClass,
    string? LicenseState,
    DateOnly? LicenseExpiry,
    DateOnly? MedicalCardExpiry,
    DateOnly? DateOfBirth,
    string? Status,
    string? DriverType,
    string? Address,
    string? City,
    string? State,
    string? ZipCode,
    string? Zip,
    string? EmergencyContactName,
    string? EmergencyContact,
    string? EmergencyContactPhone,
    string? EmergencyPhone,
    DateOnly? HireDate,
    decimal? PayRate,
    string? PayType,
    string? PhotoUrl,
    string? Notes
);

public record UpdateDriverRequest(
    string? Name,
    string? Email,
    string? Phone,
    int? FleetId,
    int? OrganizationId,
    int? DivisionId,
    int? DriverTerminalId,
    string? LicenseNumber,
    string? LicenseClass,
    string? LicenseState,
    DateOnly? LicenseExpiry,
    DateOnly? MedicalCardExpiry,
    DateOnly? DateOfBirth,
    string? Status,
    bool? IsOnline,
    string? DriverType,
    string? Ssn,
    string? TruckNumber,
    string? TruckMake,
    string? TruckModel,
    int? TruckYear,
    string? TruckVin,
    string? TruckTag,
    string? Address,
    string? City,
    string? State,
    string? Zip,
    string? ZipCode,
    string? EmergencyContact,
    string? EmergencyContactName,
    string? EmergencyPhone,
    string? EmergencyContactPhone,
    DateOnly? HireDate,
    DateOnly? TerminationDate,
    decimal? PayRate,
    string? PayType,
    decimal? Latitude,
    decimal? Longitude,
    string? PhotoUrl,
    string? Notes
);

public record UpdateLocationRequest(decimal Latitude, decimal Longitude);

public record SimulateRequest(decimal? StartLatitude, decimal? StartLongitude);

public record ImportDrayTacDriversRequest(int? Limit = 5000, bool? ForceArchive = true);




