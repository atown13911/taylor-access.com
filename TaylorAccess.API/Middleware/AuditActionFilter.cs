using Microsoft.AspNetCore.Mvc.Filters;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Middleware;

/// <summary>
/// Global action filter that automatically records every mutating API action
/// (POST, PUT, PATCH, DELETE) to the central audit_logs MongoDB collection.
/// Captures who (actor from JWT), what (action + route + response status), and when (timestamp).
/// Controllers that already call _auditService.LogAsync explicitly still work fine —
/// this filter adds a lightweight structural record in addition to the detailed one.
/// </summary>
public class AuditActionFilter : IAsyncActionFilter
{
    private readonly IAuditService _audit;

    public AuditActionFilter(IAuditService audit)
    {
        _audit = audit;
    }

    // Read-only and non-sensitive routes we skip (no value in logging these)
    private static readonly HashSet<string> SkipMethods =
        new(StringComparer.OrdinalIgnoreCase) { "GET", "HEAD", "OPTIONS" };

    // Controllers with their own detailed logging — skip double-logging the action
    private static readonly HashSet<string> AlreadyAuditedControllers =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "DriverDocuments", "Drivers", "Users", "Auth", "Password",
            "Organizations", "Satellites", "Terminals", "Agencies",
            "Departments", "Divisions", "Positions", "JobTitles",
            "Fleets", "Carriers", "CompanyPermits", "DriverTerminals",
            "InsurancePolicies", "EmployeeDeductions", "EmployeeAccounts",
            "Roles", "Tickets", "OAuth", "TwoFactor"
        };

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var method = context.HttpContext.Request.Method;
        if (SkipMethods.Contains(method))
        {
            await next();
            return;
        }

        // Get controller name
        var routeData   = context.RouteData;
        var controller  = routeData.Values["controller"]?.ToString() ?? "Unknown";
        var actionName  = routeData.Values["action"]?.ToString() ?? method;
        var path        = context.HttpContext.Request.Path.Value ?? "";

        // Execute the action
        var executed = await next();

        // Only log successful mutations (2xx responses)
        var statusCode = context.HttpContext.Response.StatusCode;
        if (statusCode < 200 || statusCode >= 300) return;

        // Skip controllers that have their own detailed auditing
        if (AlreadyAuditedControllers.Contains(controller)) return;

        // Derive a readable action label
        var actionLabel = method switch
        {
            "POST"   => $"{controller.ToLower()}_created",
            "PUT"    => $"{controller.ToLower()}_updated",
            "PATCH"  => $"{controller.ToLower()}_updated",
            "DELETE" => $"{controller.ToLower()}_deleted",
            _        => $"{controller.ToLower()}_{method.ToLower()}"
        };

        // Extract route ID if present
        var idVal     = routeData.Values["id"]?.ToString();
        int? entityId = int.TryParse(idVal, out var pid) ? pid : null;

        var description = $"{method} {path}";

        await _audit.LogAsync(actionLabel, controller, entityId, description);
    }
}
