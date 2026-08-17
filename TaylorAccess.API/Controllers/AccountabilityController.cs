using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Accountability chart: job position, individual holding the seat, and notes
/// on responsibilities. Simple flat list, no org hierarchy.
/// </summary>
[ApiController]
[Route("api/v1/accountability")]
[Authorize]
public class AccountabilityController : ControllerBase
{
    private readonly TaylorAccessDbContext _db;
    private readonly CurrentUserService _currentUser;
    private static int _schemaReady;

    public AccountabilityController(TaylorAccessDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public class AccountabilityDto
    {
        public string? JobPosition { get; set; }
        public string? Individual { get; set; }
        public string? Notes { get; set; }
    }

    private async Task EnsureSchemaAsync()
    {
        if (Interlocked.CompareExchange(ref _schemaReady, 1, 0) == 1) return;
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS ""AccountabilityEntries"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""JobPosition"" varchar(200) NOT NULL,
                ""Individual"" varchar(200),
                ""Notes"" text,
                ""CreatedBy"" varchar(150),
                ""UpdatedBy"" varchar(150),
                ""CreatedAt"" timestamptz NOT NULL DEFAULT now(),
                ""UpdatedAt"" timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_accountability_position ON ""AccountabilityEntries"" (""JobPosition"");";
        await cmd.ExecuteNonQueryAsync();
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search)
    {
        await EnsureSchemaAsync();
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        var where = "";
        if (!string.IsNullOrWhiteSpace(search))
        {
            where = @"WHERE (
                LOWER(""JobPosition"") LIKE @q
                OR LOWER(COALESCE(""Individual"",'')) LIKE @q
                OR LOWER(COALESCE(""Notes"",'')) LIKE @q
            )";
            var p = cmd.CreateParameter();
            p.ParameterName = "q";
            p.Value = $"%{search.Trim().ToLowerInvariant()}%";
            cmd.Parameters.Add(p);
        }

        cmd.CommandText = $@"
            SELECT ""Id"",""JobPosition"",""Individual"",""Notes"",""CreatedBy"",""UpdatedBy"",""CreatedAt"",""UpdatedAt""
            FROM ""AccountabilityEntries""
            {where}
            ORDER BY ""Id""";

        var rows = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new
            {
                id = reader.GetInt32(0),
                jobPosition = reader.IsDBNull(1) ? "" : reader.GetString(1),
                individual = reader.IsDBNull(2) ? null : reader.GetString(2),
                notes = reader.IsDBNull(3) ? null : reader.GetString(3),
                createdBy = reader.IsDBNull(4) ? null : reader.GetString(4),
                updatedBy = reader.IsDBNull(5) ? null : reader.GetString(5),
                createdAt = reader.IsDBNull(6) ? (DateTime?)null : reader.GetDateTime(6),
                updatedAt = reader.IsDBNull(7) ? (DateTime?)null : reader.GetDateTime(7),
            });
        }

        return Ok(new { data = rows, total = rows.Count });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AccountabilityDto input)
    {
        await EnsureSchemaAsync();
        var jobPosition = (input.JobPosition ?? "").Trim();
        if (string.IsNullOrWhiteSpace(jobPosition))
            return BadRequest(new { error = "Job position is required" });

        var user = await _currentUser.GetUserAsync();
        var by = user?.Email ?? user?.Name ?? "user";

        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO ""AccountabilityEntries""
                (""JobPosition"",""Individual"",""Notes"",""CreatedBy"",""UpdatedBy"")
            VALUES (@jobPosition,@individual,@notes,@by,@by)
            RETURNING ""Id"",""CreatedAt"",""UpdatedAt""";
        AddParam(cmd, "jobPosition", jobPosition);
        AddParam(cmd, "individual", NullIfEmpty(input.Individual));
        AddParam(cmd, "notes", NullIfEmpty(input.Notes));
        AddParam(cmd, "by", by);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return StatusCode(500, new { error = "Failed to create entry" });

        return Ok(new
        {
            data = new
            {
                id = reader.GetInt32(0),
                jobPosition,
                individual = NullIfEmpty(input.Individual),
                notes = NullIfEmpty(input.Notes),
                createdBy = by,
                updatedBy = by,
                createdAt = reader.GetDateTime(1),
                updatedAt = reader.GetDateTime(2),
            }
        });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] AccountabilityDto input)
    {
        await EnsureSchemaAsync();
        var jobPosition = (input.JobPosition ?? "").Trim();
        if (string.IsNullOrWhiteSpace(jobPosition))
            return BadRequest(new { error = "Job position is required" });

        var user = await _currentUser.GetUserAsync();
        var by = user?.Email ?? user?.Name ?? "user";

        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE ""AccountabilityEntries"" SET
                ""JobPosition"" = @jobPosition,
                ""Individual"" = @individual,
                ""Notes"" = @notes,
                ""UpdatedBy"" = @by,
                ""UpdatedAt"" = NOW()
            WHERE ""Id"" = @id
            RETURNING ""Id"",""CreatedBy"",""CreatedAt"",""UpdatedAt""";
        AddParam(cmd, "id", id);
        AddParam(cmd, "jobPosition", jobPosition);
        AddParam(cmd, "individual", NullIfEmpty(input.Individual));
        AddParam(cmd, "notes", NullIfEmpty(input.Notes));
        AddParam(cmd, "by", by);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return NotFound(new { error = "Entry not found" });

        return Ok(new
        {
            data = new
            {
                id = reader.GetInt32(0),
                jobPosition,
                individual = NullIfEmpty(input.Individual),
                notes = NullIfEmpty(input.Notes),
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
        cmd.CommandText = @"DELETE FROM ""AccountabilityEntries"" WHERE ""Id"" = @id";
        AddParam(cmd, "id", id);
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return NotFound(new { error = "Entry not found" });
        return Ok(new { ok = true });
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
