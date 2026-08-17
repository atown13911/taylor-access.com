using System.Data.Common;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

/// <summary>
/// Operating accountability chart: seats, ownership, hierarchy, and KPIs.
/// </summary>
[ApiController]
[Route("api/v1/accountability")]
[Authorize]
public class AccountabilityController : ControllerBase
{
    private readonly TaylorAccessDbContext _db;
    private readonly CurrentUserService _currentUser;
    private static int _schemaReady;
    private static readonly SemaphoreSlim SchemaLock = new(1, 1);
    private static readonly HashSet<string> Roles = new(StringComparer.OrdinalIgnoreCase)
    {
        "Accountable", "Responsible", "Consulted", "Informed"
    };
    private static readonly HashSet<string> Statuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Active", "Interim", "Vacant", "Transitioning"
    };

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
        public int? EmployeeId { get; set; }
        public int? ReportsToId { get; set; }
        public string? AccountabilityRole { get; set; }
        public string? SeatStatus { get; set; }
        public DateTime? EffectiveStart { get; set; }
        public DateTime? EffectiveEnd { get; set; }
        public List<string>? ScopeTags { get; set; }
        public List<string>? KeyResults { get; set; }
    }

    private async Task EnsureSchemaAsync()
    {
        if (Volatile.Read(ref _schemaReady) == 1) return;
        await SchemaLock.WaitAsync();
        try
        {
            if (Volatile.Read(ref _schemaReady) == 1) return;
            var conn = await OpenAsync();
            // Commit each statement so a later seed failure cannot roll back CREATE TABLE.
            await ExecAsync(conn, @"
                CREATE TABLE IF NOT EXISTS ""AccountabilityEntries"" (
                    ""Id"" SERIAL PRIMARY KEY,
                    ""JobPosition"" varchar(200) NOT NULL,
                    ""Individual"" varchar(200),
                    ""Notes"" text,
                    ""CreatedBy"" varchar(150),
                    ""UpdatedBy"" varchar(150),
                    ""CreatedAt"" timestamptz NOT NULL DEFAULT now(),
                    ""UpdatedAt"" timestamptz NOT NULL DEFAULT now()
                )");
            await ExecAsync(conn, @"
                ALTER TABLE ""AccountabilityEntries"" ADD COLUMN IF NOT EXISTS ""EmployeeId"" INTEGER;
                ALTER TABLE ""AccountabilityEntries"" ADD COLUMN IF NOT EXISTS ""ReportsToId"" INTEGER;
                ALTER TABLE ""AccountabilityEntries"" ADD COLUMN IF NOT EXISTS ""AccountabilityRole"" varchar(30) NOT NULL DEFAULT 'Accountable';
                ALTER TABLE ""AccountabilityEntries"" ADD COLUMN IF NOT EXISTS ""SeatStatus"" varchar(30) NOT NULL DEFAULT 'Active';
                ALTER TABLE ""AccountabilityEntries"" ADD COLUMN IF NOT EXISTS ""EffectiveStart"" date;
                ALTER TABLE ""AccountabilityEntries"" ADD COLUMN IF NOT EXISTS ""EffectiveEnd"" date;
                ALTER TABLE ""AccountabilityEntries"" ADD COLUMN IF NOT EXISTS ""ScopeTags"" text;
                ALTER TABLE ""AccountabilityEntries"" ADD COLUMN IF NOT EXISTS ""KeyResults"" text");
            await ExecAsync(conn, @"
                CREATE INDEX IF NOT EXISTS idx_accountability_position ON ""AccountabilityEntries"" (""JobPosition"");
                CREATE INDEX IF NOT EXISTS idx_accountability_employee ON ""AccountabilityEntries"" (""EmployeeId"");
                CREATE INDEX IF NOT EXISTS idx_accountability_reports ON ""AccountabilityEntries"" (""ReportsToId"");
                CREATE INDEX IF NOT EXISTS idx_accountability_status ON ""AccountabilityEntries"" (""SeatStatus"")");
            await ExecAsync(conn, @"
                CREATE TABLE IF NOT EXISTS ""AccountabilityScopes"" (
                    ""Id"" SERIAL PRIMARY KEY,
                    ""Name"" varchar(120) NOT NULL,
                    ""IsSystem"" boolean NOT NULL DEFAULT false,
                    ""CreatedBy"" varchar(150),
                    ""CreatedAt"" timestamptz NOT NULL DEFAULT now()
                )");
            await ExecAsync(conn, @"
                CREATE UNIQUE INDEX IF NOT EXISTS idx_accountability_scopes_name
                    ON ""AccountabilityScopes"" (LOWER(""Name""))");
            await ExecAsync(conn, @"
                INSERT INTO ""AccountabilityScopes"" (""Name"", ""IsSystem"")
                SELECT seed.""Name"", true
                FROM (VALUES
                    ('Dispatch & Load Planning'),
                    ('Owner-Operator Settlements & CPM'),
                    ('Compliance / Safety / Drug Testing'),
                    ('Recruiting & IC Agreements'),
                    ('Bosnia Operations / Payroll'),
                    ('Tech / TMS / Integrations'),
                    ('Accounting / P&L / Factoring'),
                    ('Insurance & Risk')
                ) AS seed(""Name"")
                WHERE NOT EXISTS (
                    SELECT 1 FROM ""AccountabilityScopes"" s
                    WHERE LOWER(s.""Name"") = LOWER(seed.""Name"")
                )");
            Volatile.Write(ref _schemaReady, 1);
        }
        catch
        {
            Volatile.Write(ref _schemaReady, 0);
            throw;
        }
        finally
        {
            SchemaLock.Release();
        }
    }

    private static async Task ExecAsync(DbConnection conn, string sql)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync();
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search)
    {
        await EnsureSchemaAsync();
        var conn = await OpenAsync();
        await using var cmd = conn.CreateCommand();
        var where = "";
        if (!string.IsNullOrWhiteSpace(search))
        {
            where = @"WHERE (
                LOWER(""JobPosition"") LIKE @q
                OR LOWER(COALESCE(""Individual"",'')) LIKE @q
                OR LOWER(COALESCE(""Notes"",'')) LIKE @q
                OR LOWER(COALESCE(""ScopeTags"",'')) LIKE @q
                OR LOWER(COALESCE(""KeyResults"",'')) LIKE @q
                OR LOWER(COALESCE(""SeatStatus"",'')) LIKE @q
                OR LOWER(COALESCE(""AccountabilityRole"",'')) LIKE @q
            )";
            AddParam(cmd, "q", $"%{search.Trim().ToLowerInvariant()}%");
        }

        cmd.CommandText = SelectSql(where);
        var rows = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            rows.Add(MapRow(reader));

        return Ok(new { data = rows, total = rows.Count });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AccountabilityDto input)
    {
        await EnsureSchemaAsync();
        var parsed = ParseInput(input);
        if (parsed.Error != null) return BadRequest(new { error = parsed.Error });

        var user = await _currentUser.GetUserAsync();
        var by = user?.Email ?? user?.Name ?? "user";
        var conn = await OpenAsync();

        if (parsed.ReportsToId is int reportsToId && !await SeatExistsAsync(conn, reportsToId))
            return BadRequest(new { error = "Reports-to seat was not found" });

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO ""AccountabilityEntries""
                (""JobPosition"",""Individual"",""Notes"",""EmployeeId"",""ReportsToId"",
                 ""AccountabilityRole"",""SeatStatus"",""EffectiveStart"",""EffectiveEnd"",
                 ""ScopeTags"",""KeyResults"",""CreatedBy"",""UpdatedBy"")
            VALUES (@jobPosition,@individual,@notes,@employeeId,@reportsToId,
                    @role,@status,@start,@end,@scope,@kpis,@by,@by)
            RETURNING ""Id""";
        BindWrite(cmd, parsed, by);
        var idObj = await cmd.ExecuteScalarAsync();
        if (idObj == null) return StatusCode(500, new { error = "Failed to create entry" });
        var row = await LoadByIdAsync(conn, Convert.ToInt32(idObj));
        return Ok(new { data = row });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] AccountabilityDto input)
    {
        await EnsureSchemaAsync();
        var parsed = ParseInput(input);
        if (parsed.Error != null) return BadRequest(new { error = parsed.Error });
        if (parsed.ReportsToId == id)
            return BadRequest(new { error = "A seat cannot report to itself" });

        var user = await _currentUser.GetUserAsync();
        var by = user?.Email ?? user?.Name ?? "user";
        var conn = await OpenAsync();

        if (parsed.ReportsToId is int reportsToId)
        {
            if (!await SeatExistsAsync(conn, reportsToId))
                return BadRequest(new { error = "Reports-to seat was not found" });
            if (await WouldCycleAsync(conn, id, reportsToId))
                return BadRequest(new { error = "Reports-to would create a circular hierarchy" });
        }

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE ""AccountabilityEntries"" SET
                ""JobPosition"" = @jobPosition,
                ""Individual"" = @individual,
                ""Notes"" = @notes,
                ""EmployeeId"" = @employeeId,
                ""ReportsToId"" = @reportsToId,
                ""AccountabilityRole"" = @role,
                ""SeatStatus"" = @status,
                ""EffectiveStart"" = @start,
                ""EffectiveEnd"" = @end,
                ""ScopeTags"" = @scope,
                ""KeyResults"" = @kpis,
                ""UpdatedBy"" = @by,
                ""UpdatedAt"" = NOW()
            WHERE ""Id"" = @id";
        AddParam(cmd, "id", id);
        BindWrite(cmd, parsed, by);
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return NotFound(new { error = "Entry not found" });

        return Ok(new { data = await LoadByIdAsync(conn, id) });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await EnsureSchemaAsync();
        var conn = await OpenAsync();
        await using var clear = conn.CreateCommand();
        clear.CommandText = @"UPDATE ""AccountabilityEntries"" SET ""ReportsToId"" = NULL WHERE ""ReportsToId"" = @id";
        AddParam(clear, "id", id);
        await clear.ExecuteNonQueryAsync();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"DELETE FROM ""AccountabilityEntries"" WHERE ""Id"" = @id";
        AddParam(cmd, "id", id);
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return NotFound(new { error = "Entry not found" });
        return Ok(new { ok = true });
    }

    public class ScopeDto
    {
        public string? Name { get; set; }
    }

    [HttpGet("scopes")]
    public async Task<IActionResult> ListScopes()
    {
        await EnsureSchemaAsync();
        var conn = await OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT ""Id"",""Name"",""IsSystem"",""CreatedBy"",""CreatedAt""
            FROM ""AccountabilityScopes""
            ORDER BY ""IsSystem"" DESC, ""Name""";
        var rows = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new
            {
                id = reader.GetInt32(0),
                name = reader.GetString(1),
                isSystem = !reader.IsDBNull(2) && reader.GetBoolean(2),
                createdBy = reader.IsDBNull(3) ? null : reader.GetString(3),
                createdAt = reader.IsDBNull(4) ? (DateTime?)null : reader.GetDateTime(4),
            });
        }
        return Ok(new { data = rows, total = rows.Count });
    }

    [HttpPost("scopes")]
    public async Task<IActionResult> CreateScope([FromBody] ScopeDto input)
    {
        await EnsureSchemaAsync();
        var name = (input.Name ?? "").Trim();
        if (name.Length < 2) return BadRequest(new { error = "Scope name is required" });
        if (name.Length > 120) return BadRequest(new { error = "Scope name is too long" });

        var user = await _currentUser.GetUserAsync();
        var by = user?.Email ?? user?.Name ?? "user";
        var conn = await OpenAsync();

        await using var exists = conn.CreateCommand();
        exists.CommandText = @"SELECT ""Id"" FROM ""AccountabilityScopes"" WHERE LOWER(""Name"") = LOWER(@name)";
        AddParam(exists, "name", name);
        var existing = await exists.ExecuteScalarAsync();
        if (existing != null) return BadRequest(new { error = "That scope already exists" });

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO ""AccountabilityScopes"" (""Name"",""IsSystem"",""CreatedBy"")
            VALUES (@name, false, @by)
            RETURNING ""Id"",""CreatedAt""";
        AddParam(cmd, "name", name);
        AddParam(cmd, "by", by);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return StatusCode(500, new { error = "Failed to create scope" });
        return Ok(new
        {
            data = new
            {
                id = reader.GetInt32(0),
                name,
                isSystem = false,
                createdBy = by,
                createdAt = reader.GetDateTime(1),
            }
        });
    }

    [HttpDelete("scopes/{id:int}")]
    public async Task<IActionResult> DeleteScope(int id)
    {
        await EnsureSchemaAsync();
        var conn = await OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"DELETE FROM ""AccountabilityScopes"" WHERE ""Id"" = @id AND ""IsSystem"" = false";
        AddParam(cmd, "id", id);
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return BadRequest(new { error = "Scope not found or cannot be removed" });
        return Ok(new { ok = true });
    }

    private async Task<DbConnection> OpenAsync()
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();
        return conn;
    }

    private static string SelectSql(string where = "") => $@"
        SELECT ""Id"",""JobPosition"",""Individual"",""Notes"",""CreatedBy"",""UpdatedBy"",
               ""CreatedAt"",""UpdatedAt"",""EmployeeId"",""ReportsToId"",""AccountabilityRole"",
               ""SeatStatus"",""EffectiveStart"",""EffectiveEnd"",""ScopeTags"",""KeyResults""
        FROM ""AccountabilityEntries""
        {where}
        ORDER BY ""Id""";

    private async Task<object?> LoadByIdAsync(DbConnection conn, int id)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = SelectSql(@"WHERE ""Id"" = @id");
        AddParam(cmd, "id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapRow(reader) : null;
    }

    private static async Task<bool> SeatExistsAsync(DbConnection conn, int id)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"SELECT 1 FROM ""AccountabilityEntries"" WHERE ""Id"" = @id";
        AddParam(cmd, "id", id);
        return await cmd.ExecuteScalarAsync() != null;
    }

    private static async Task<bool> WouldCycleAsync(DbConnection conn, int seatId, int reportsToId)
    {
        var current = reportsToId;
        var seen = new HashSet<int>();
        while (current > 0)
        {
            if (current == seatId) return true;
            if (!seen.Add(current)) return true;
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"SELECT ""ReportsToId"" FROM ""AccountabilityEntries"" WHERE ""Id"" = @id";
            AddParam(cmd, "id", current);
            var next = await cmd.ExecuteScalarAsync();
            if (next == null || next == DBNull.Value) break;
            current = Convert.ToInt32(next);
        }
        return false;
    }

    private sealed class ParsedInput
    {
        public string JobPosition { get; init; } = "";
        public string? Individual { get; init; }
        public string? Notes { get; init; }
        public int? EmployeeId { get; init; }
        public int? ReportsToId { get; init; }
        public string Role { get; init; } = "Accountable";
        public string Status { get; init; } = "Active";
        public DateTime? Start { get; init; }
        public DateTime? End { get; init; }
        public string? ScopeJson { get; init; }
        public string? KpiJson { get; init; }
        public string? Error { get; init; }
    }

    private static ParsedInput ParseInput(AccountabilityDto input)
    {
        var jobPosition = (input.JobPosition ?? "").Trim();
        if (string.IsNullOrWhiteSpace(jobPosition))
            return new ParsedInput { Error = "Job position is required" };

        var role = string.IsNullOrWhiteSpace(input.AccountabilityRole) ? "Accountable" : input.AccountabilityRole.Trim();
        if (!Roles.Contains(role))
            return new ParsedInput { Error = "Accountability role must be Accountable, Responsible, Consulted, or Informed" };
        role = Roles.First(r => r.Equals(role, StringComparison.OrdinalIgnoreCase));

        var status = string.IsNullOrWhiteSpace(input.SeatStatus) ? "Active" : input.SeatStatus.Trim();
        if (!Statuses.Contains(status))
            return new ParsedInput { Error = "Status must be Active, Interim, Vacant, or Transitioning" };
        status = Statuses.First(s => s.Equals(status, StringComparison.OrdinalIgnoreCase));

        if (input.EffectiveStart.HasValue && input.EffectiveEnd.HasValue &&
            input.EffectiveEnd.Value.Date < input.EffectiveStart.Value.Date)
            return new ParsedInput { Error = "End date cannot be before start date" };

        return new ParsedInput
        {
            JobPosition = jobPosition,
            Individual = status.Equals("Vacant", StringComparison.OrdinalIgnoreCase)
                ? NullIfEmpty(input.Individual)
                : NullIfEmpty(input.Individual),
            Notes = NullIfEmpty(input.Notes),
            EmployeeId = input.EmployeeId,
            ReportsToId = input.ReportsToId,
            Role = role,
            Status = status,
            Start = input.EffectiveStart?.Date,
            End = input.EffectiveEnd?.Date,
            ScopeJson = ToJson(input.ScopeTags),
            KpiJson = ToJson(input.KeyResults, 5),
        };
    }

    private static void BindWrite(DbCommand cmd, ParsedInput parsed, string by)
    {
        AddParam(cmd, "jobPosition", parsed.JobPosition);
        AddParam(cmd, "individual", parsed.Individual);
        AddParam(cmd, "notes", parsed.Notes);
        AddParam(cmd, "employeeId", parsed.EmployeeId);
        AddParam(cmd, "reportsToId", parsed.ReportsToId);
        AddParam(cmd, "role", parsed.Role);
        AddParam(cmd, "status", parsed.Status);
        AddParam(cmd, "start", parsed.Start);
        AddParam(cmd, "end", parsed.End);
        AddParam(cmd, "scope", parsed.ScopeJson);
        AddParam(cmd, "kpis", parsed.KpiJson);
        AddParam(cmd, "by", by);
    }

    private static object MapRow(DbDataReader reader)
    {
        return new
        {
            id = reader.GetInt32(0),
            jobPosition = reader.IsDBNull(1) ? "" : reader.GetString(1),
            individual = reader.IsDBNull(2) ? null : reader.GetString(2),
            notes = reader.IsDBNull(3) ? null : reader.GetString(3),
            createdBy = reader.IsDBNull(4) ? null : reader.GetString(4),
            updatedBy = reader.IsDBNull(5) ? null : reader.GetString(5),
            createdAt = reader.IsDBNull(6) ? (DateTime?)null : reader.GetDateTime(6),
            updatedAt = reader.IsDBNull(7) ? (DateTime?)null : reader.GetDateTime(7),
            employeeId = reader.IsDBNull(8) ? (int?)null : reader.GetInt32(8),
            reportsToId = reader.IsDBNull(9) ? (int?)null : reader.GetInt32(9),
            accountabilityRole = reader.IsDBNull(10) ? "Accountable" : reader.GetString(10),
            seatStatus = reader.IsDBNull(11) ? "Active" : reader.GetString(11),
            effectiveStart = reader.IsDBNull(12) ? (DateTime?)null : reader.GetDateTime(12),
            effectiveEnd = reader.IsDBNull(13) ? (DateTime?)null : reader.GetDateTime(13),
            scopeTags = FromJson(reader.IsDBNull(14) ? null : reader.GetString(14)),
            keyResults = FromJson(reader.IsDBNull(15) ? null : reader.GetString(15)),
        };
    }

    private static string? ToJson(IEnumerable<string>? values, int max = 12)
    {
        var list = (values ?? Array.Empty<string>())
            .Select(v => (v ?? "").Trim())
            .Where(v => v.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(max)
            .ToList();
        return list.Count == 0 ? null : JsonSerializer.Serialize(list);
    }

    private static List<string> FromJson(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return new List<string>();
        try
        {
            return JsonSerializer.Deserialize<List<string>>(raw) ?? new List<string>();
        }
        catch
        {
            return raw.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0).ToList();
        }
    }

    private static string? NullIfEmpty(string? value)
    {
        var trimmed = (value ?? "").Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static void AddParam(DbCommand cmd, string name, object? value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value ?? DBNull.Value;
        cmd.Parameters.Add(p);
    }
}
