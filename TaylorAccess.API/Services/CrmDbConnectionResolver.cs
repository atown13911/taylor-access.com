namespace TaylorAccess.API.Services;

public static class CrmDbConnectionResolver
{
    public static string? Resolve(IConfiguration configuration)
    {
        var raw = configuration.GetConnectionString("CrmDbConnection")
            ?? Environment.GetEnvironmentVariable("CRM_DB_CONNECTION")
            ?? Environment.GetEnvironmentVariable("CRM_DATABASE_URL")
            ?? Environment.GetEnvironmentVariable("TAYLOR_CRM_DATABASE_URL");

        if (string.IsNullOrWhiteSpace(raw)) return null;

        if (raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
            raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            // Npgsql 6+ accepts PostgreSQL URIs directly.
            return raw;
        }

        return raw;
    }
}
