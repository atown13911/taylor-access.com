using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class AuditLog
{
    public int Id { get; set; }
    
    /// <summary>
    /// Multi-tenancy: Organization context for this audit log entry
    /// Nullable for system-level actions (e.g., login, global admin actions)
    /// </summary>
    public int? OrganizationId { get; set; }
    
    // Who
    public int? UserId { get; set; }
    public string? UserName { get; set; }
    public string? UserEmail { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    
    // What
    [Required]
    public string Action { get; set; } = string.Empty; // create, update, delete, login, logout, etc.
    
    [Required]
    public string EntityType { get; set; } = string.Empty; // Order, Load, Invoice, User, etc.
    
    public int? EntityId { get; set; }
    public string? EntityName { get; set; } // e.g., "Order #12345"
    
    // Details
    public string? OldValues { get; set; } // JSON of previous values
    public string? NewValues { get; set; } // JSON of new values
    public string? Changes { get; set; } // JSON summary of changes
    public string? Description { get; set; }
    
    // Context
    public string? Module { get; set; } // orders, invoicing, dispatch, etc.
    public string? Endpoint { get; set; } // API endpoint called
    public string? HttpMethod { get; set; }
    public int? HttpStatusCode { get; set; }
    
    // Timestamps
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    
    // Severity
    public string Severity { get; set; } = "info"; // info, warning, error, critical
}

public static class AuditActions
{
    public const string Create = "create";
    public const string Update = "update";
    public const string Delete = "delete";
    public const string View = "view";
    public const string Export = "export";
    public const string Login = "login";
    public const string Logout = "logout";
    public const string LoginFailed = "login_failed";
    public const string PasswordChange = "password_change";
    public const string PasswordReset = "password_reset";
    public const string RoleAssign = "role_assign";
    public const string RoleRemove = "role_remove";
    public const string ConcurrencyConflict = "concurrency_conflict";
    public const string Dispatch = "dispatch";
    public const string StatusChange = "status_change";
    public const string InvoiceSent = "invoice_sent";
    public const string PaymentReceived = "payment_received";
    public const string PaymentMade = "payment_made";
    // Compliance
    public const string DocumentUploaded = "document_uploaded";
    public const string DocumentUpdated = "document_updated";
    public const string DocumentDeleted = "document_deleted";
    public const string DocumentExpiring = "document_expiring";
    public const string DocumentExpired = "document_expired";
    public const string InsurancePolicyCreated = "insurance_policy_created";
    public const string InsurancePolicyUpdated = "insurance_policy_updated";
    public const string InsurancePolicyDeleted = "insurance_policy_deleted";
    public const string InsuranceEnrollment = "insurance_enrollment";
    public const string InsuranceUnenrollment = "insurance_unenrollment";
    public const string DivisionCreated = "division_created";
    public const string DivisionUpdated = "division_updated";
    public const string TerminalCreated = "terminal_created";
    public const string PaymentMethodChanged = "payment_method_changed";
    public const string ComplianceAlert = "compliance_alert";
}
