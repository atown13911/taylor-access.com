namespace TaylorAccess.API.Services;

public static class CrmDbConnectionResolver
{
    public static string? Resolve(IConfiguration configuration)
    {
        var raw = configuration.GetConnectionString("CrmDbConnection")
            ?? Environment.GetEnvironmentVariable("CRM_DB_CONNECTION")
            ?? Environment.GetEnvironmentVariable("CRM_DATABASE_URL")
            ?? configuration.GetConnectionString("PortalDbConnection")
            ?? Environment.GetEnvironmentVariable("PORTAL_DB_CONNECTION")
            ?? Environment.GetEnvironmentVariable("PORTAL_DATABASE_URL");

        if (string.IsNullOrWhiteSpace(raw)) return null;

        if (raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
            raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(raw);
            var userInfo = uri.UserInfo.Split(':');
            if (userInfo.Length >= 2)
            {
                return $"Host={uri.Host};Port={uri.Port};Database={uri.AbsolutePath.TrimStart('/')};Username={userInfo[0]};Password={userInfo[1]};SSL Mode=Disable;Trust Server Certificate=true";
            }
        }

        return raw;
    }
}
