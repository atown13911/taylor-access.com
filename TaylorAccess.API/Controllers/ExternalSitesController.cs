using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Shared inventory of outside sites (terminal portals, SSL websites, etc.)
/// with usernames/passwords and open-in-browser links.
/// </summary>
[ApiController]
[Route("api/v1/external-sites")]
[Authorize]
public class ExternalSitesController : ControllerBase
{
    private readonly TaylorAccessDbContext _db;
    private readonly CurrentUserService _currentUser;
    private static int _schemaReady;

    public ExternalSitesController(TaylorAccessDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public class ExternalSiteDto
    {
        public string? Name { get; set; }
        public string? Url { get; set; }
        public string? Username { get; set; }
        public string? Password { get; set; }
        public string? Category { get; set; }
        public string? Notes { get; set; }
        public bool? IsActive { get; set; }
    }

    private async Task EnsureSchemaAsync()
    {
        if (Interlocked.CompareExchange(ref _schemaReady, 1, 0) == 1) return;
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS ""ExternalSites"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""Name"" varchar(200) NOT NULL,
                ""Url"" varchar(500) NOT NULL,
                ""Username"" varchar(200),
                ""Password"" text,
                ""Category"" varchar(80),
                ""Notes"" text,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedBy"" varchar(150),
                ""UpdatedBy"" varchar(150),
                ""CreatedAt"" timestamptz NOT NULL DEFAULT now(),
                ""UpdatedAt"" timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_external_sites_name ON ""ExternalSites"" (""Name"");
            CREATE INDEX IF NOT EXISTS idx_external_sites_active ON ""ExternalSites"" (""IsActive"");";
        await cmd.ExecuteNonQueryAsync();
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] bool? activeOnly,
        [FromQuery] int limit = 200)
    {
        await EnsureSchemaAsync();
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        var where = new List<string>();
        if (activeOnly == true) where.Add(@"""IsActive"" = true");
        if (!string.IsNullOrWhiteSpace(search))
        {
            where.Add(@"(
                LOWER(""Name"") LIKE @q
                OR LOWER(COALESCE(""Url"",'')) LIKE @q
                OR LOWER(COALESCE(""Username"",'')) LIKE @q
                OR LOWER(COALESCE(""Category"",'')) LIKE @q
                OR LOWER(COALESCE(""Notes"",'')) LIKE @q
            )");
            var p = cmd.CreateParameter();
            p.ParameterName = "q";
            p.Value = $"%{search.Trim().ToLowerInvariant()}%";
            cmd.Parameters.Add(p);
        }

        var clause = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "";
        var take = Math.Clamp(limit, 1, 500);
        cmd.CommandText = $@"
            SELECT ""Id"",""Name"",""Url"",""Username"",""Password"",""Category"",""Notes"",
                   ""IsActive"",""CreatedBy"",""UpdatedBy"",""CreatedAt"",""UpdatedAt""
            FROM ""ExternalSites""
            {clause}
            ORDER BY LOWER(""Name"")
            LIMIT {take}";

        var rows = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new
            {
                id = reader.GetInt32(0),
                name = reader.IsDBNull(1) ? "" : reader.GetString(1),
                url = reader.IsDBNull(2) ? "" : reader.GetString(2),
                username = reader.IsDBNull(3) ? null : reader.GetString(3),
                password = reader.IsDBNull(4) ? null : reader.GetString(4),
                category = reader.IsDBNull(5) ? null : reader.GetString(5),
                notes = reader.IsDBNull(6) ? null : reader.GetString(6),
                isActive = !reader.IsDBNull(7) && reader.GetBoolean(7),
                createdBy = reader.IsDBNull(8) ? null : reader.GetString(8),
                updatedBy = reader.IsDBNull(9) ? null : reader.GetString(9),
                createdAt = reader.IsDBNull(10) ? (DateTime?)null : reader.GetDateTime(10),
                updatedAt = reader.IsDBNull(11) ? (DateTime?)null : reader.GetDateTime(11),
            });
        }

        return Ok(new { data = rows, total = rows.Count });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ExternalSiteDto input)
    {
        await EnsureSchemaAsync();
        var name = (input.Name ?? "").Trim();
        var url = NormalizeUrl(input.Url);
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { error = "Name is required" });
        if (string.IsNullOrWhiteSpace(url))
            return BadRequest(new { error = "URL is required" });

        var user = await _currentUser.GetUserAsync();
        var by = user?.Email ?? user?.Name ?? "user";

        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO ""ExternalSites""
                (""Name"",""Url"",""Username"",""Password"",""Category"",""Notes"",""IsActive"",""CreatedBy"",""UpdatedBy"")
            VALUES (@name,@url,@username,@password,@category,@notes,@active,@by,@by)
            RETURNING ""Id"",""CreatedAt"",""UpdatedAt""";
        AddParam(cmd, "name", name);
        AddParam(cmd, "url", url);
        AddParam(cmd, "username", NullIfEmpty(input.Username));
        AddParam(cmd, "password", NullIfEmpty(input.Password));
        AddParam(cmd, "category", NullIfEmpty(input.Category));
        AddParam(cmd, "notes", NullIfEmpty(input.Notes));
        AddParam(cmd, "active", input.IsActive ?? true);
        AddParam(cmd, "by", by);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return StatusCode(500, new { error = "Failed to create site" });

        return Ok(new
        {
            data = new
            {
                id = reader.GetInt32(0),
                name,
                url,
                username = NullIfEmpty(input.Username),
                password = NullIfEmpty(input.Password),
                category = NullIfEmpty(input.Category),
                notes = NullIfEmpty(input.Notes),
                isActive = input.IsActive ?? true,
                createdBy = by,
                updatedBy = by,
                createdAt = reader.GetDateTime(1),
                updatedAt = reader.GetDateTime(2),
            }
        });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] ExternalSiteDto input)
    {
        await EnsureSchemaAsync();
        var name = (input.Name ?? "").Trim();
        var url = NormalizeUrl(input.Url);
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { error = "Name is required" });
        if (string.IsNullOrWhiteSpace(url))
            return BadRequest(new { error = "URL is required" });

        var user = await _currentUser.GetUserAsync();
        var by = user?.Email ?? user?.Name ?? "user";

        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE ""ExternalSites"" SET
                ""Name"" = @name,
                ""Url"" = @url,
                ""Username"" = @username,
                ""Password"" = @password,
                ""Category"" = @category,
                ""Notes"" = @notes,
                ""IsActive"" = @active,
                ""UpdatedBy"" = @by,
                ""UpdatedAt"" = NOW()
            WHERE ""Id"" = @id
            RETURNING ""Id"",""CreatedBy"",""CreatedAt"",""UpdatedAt""";
        AddParam(cmd, "id", id);
        AddParam(cmd, "name", name);
        AddParam(cmd, "url", url);
        AddParam(cmd, "username", NullIfEmpty(input.Username));
        AddParam(cmd, "password", NullIfEmpty(input.Password));
        AddParam(cmd, "category", NullIfEmpty(input.Category));
        AddParam(cmd, "notes", NullIfEmpty(input.Notes));
        AddParam(cmd, "active", input.IsActive ?? true);
        AddParam(cmd, "by", by);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return NotFound(new { error = "Site not found" });

        return Ok(new
        {
            data = new
            {
                id = reader.GetInt32(0),
                name,
                url,
                username = NullIfEmpty(input.Username),
                password = NullIfEmpty(input.Password),
                category = NullIfEmpty(input.Category),
                notes = NullIfEmpty(input.Notes),
                isActive = input.IsActive ?? true,
                createdBy = reader.IsDBNull(1) ? null : reader.GetString(1),
                updatedBy = by,
                createdAt = reader.GetDateTime(2),
                updatedAt = reader.GetDateTime(3),
            }
        });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await EnsureSchemaAsync();
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"DELETE FROM ""ExternalSites"" WHERE ""Id"" = @id";
        AddParam(cmd, "id", id);
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return NotFound(new { error = "Site not found" });
        return Ok(new { ok = true });
    }

    private static string NormalizeUrl(string? raw)
    {
        var url = (raw ?? "").Trim();
        if (string.IsNullOrWhiteSpace(url)) return "";
        if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            && !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            url = "https://" + url;
        }
        return url;
    }

    private static string? NullIfEmpty(string? value)
    {
        var trimmed = (value ?? "").Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static void AddParam(System.Data.Common.DbCommand cmd, string name, object? value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value ?? DBNull.Value;
        cmd.Parameters.Add(p);
    }
}

