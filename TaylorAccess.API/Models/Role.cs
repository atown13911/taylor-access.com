using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class Role
{
    public int Id { get; set; }
    
    [Required]
    public string Name { get; set; } = string.Empty; // admin, dispatcher, driver, customer, financial
    
    public string? Description { get; set; }
    
    // Permissions stored as JSON array
    public string Permissions { get; set; } = "[]";
    
    public bool IsSystem { get; set; } = false; // System roles can't be deleted
    
    /// <summary>
    /// Organization-specific role (NULL = global/system role)
    /// Allows orgs to customize roles: Van Tac's "dispatcher" != Landmark's "dispatcher"
    /// </summary>
    public int? OrganizationId { get; set; }
    
    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation
    public virtual ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
}

public class UserRole
{
    public int Id { get; set; }
    
    public int UserId { get; set; }
    public int RoleId { get; set; }
    
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
    public string? AssignedBy { get; set; }
    
    // Navigation
    public virtual User? User { get; set; }
    public virtual Role? Role { get; set; }
}

// Predefined permissions with descriptions
public static class Permissions
{
    // Orders
    public const string OrdersView = "orders:view";
    public const string OrdersCreate = "orders:create";
    public const string OrdersEdit = "orders:edit";
    public const string OrdersDelete = "orders:delete";
    public const string OrdersDispatch = "orders:dispatch";
    
    // Shipments
    public const string ShipmentsView = "shipments:view";
    public const string ShipmentsCreate = "shipments:create";
    public const string ShipmentsEdit = "shipments:edit";
    public const string ShipmentsDelete = "shipments:delete";
    public const string ShipmentsDispatch = "shipments:dispatch";
    public const string ShipmentsTrack = "shipments:track";
    
    // Loads
    public const string LoadsView = "loads:view";
    public const string LoadsCreate = "loads:create";
    public const string LoadsEdit = "loads:edit";
    public const string LoadsDelete = "loads:delete";
    
    // Drivers
    public const string DriversView = "drivers:view";
    public const string DriversCreate = "drivers:create";
    public const string DriversEdit = "drivers:edit";
    public const string DriversDelete = "drivers:delete";
    public const string DriversAssign = "drivers:assign";
    
    // Vehicles
    public const string VehiclesView = "vehicles:view";
    public const string VehiclesCreate = "vehicles:create";
    public const string VehiclesEdit = "vehicles:edit";
    public const string VehiclesDelete = "vehicles:delete";
    public const string VehiclesAssign = "vehicles:assign";
    
    // Fleet
    public const string FleetView = "fleet:view";
    public const string FleetManage = "fleet:manage";
    public const string EquipmentView = "equipment:view";
    public const string EquipmentManage = "equipment:manage";
    
    // Contacts
    public const string ContactsView = "contacts:view";
    public const string ContactsCreate = "contacts:create";
    public const string ContactsEdit = "contacts:edit";
    public const string ContactsDelete = "contacts:delete";
    
    // Places
    public const string PlacesView = "places:view";
    public const string PlacesCreate = "places:create";
    public const string PlacesEdit = "places:edit";
    public const string PlacesDelete = "places:delete";
    
    // Invoices (AR)
    public const string InvoicesView = "invoices:view";
    public const string InvoicesCreate = "invoices:create";
    public const string InvoicesEdit = "invoices:edit";
    public const string InvoicesSend = "invoices:send";
    public const string InvoicesVoid = "invoices:void";
    public const string InvoicesApprove = "invoices:approve";
    
    // Payables (AP)
    public const string PayablesView = "payables:view";
    public const string PayablesCreate = "payables:create";
    public const string PayablesApprove = "payables:approve";
    public const string PayablesPay = "payables:pay";
    
    // Finance
    public const string FinanceView = "finance:view";
    public const string FinanceManage = "finance:manage";
    public const string RatesView = "rates:view";
    public const string RatesManage = "rates:manage";
    
    // Maintenance
    public const string MaintenanceView = "maintenance:view";
    public const string MaintenanceCreate = "maintenance:create";
    public const string MaintenanceEdit = "maintenance:edit";
    public const string MaintenanceApprove = "maintenance:approve";
    
    // IoT / Telematics
    public const string TelematicsView = "telematics:view";
    public const string TelematicsManage = "telematics:manage";
    public const string DevicesView = "devices:view";
    public const string DevicesManage = "devices:manage";
    
    // Reports
    public const string ReportsView = "reports:view";
    public const string ReportsExport = "reports:export";
    public const string ReportsCreate = "reports:create";
    public const string DashboardView = "dashboard:view";
    
    // Settings
    public const string SettingsView = "settings:view";
    public const string SettingsEdit = "settings:edit";
    public const string IntegrationsView = "integrations:view";
    public const string IntegrationsManage = "integrations:manage";
    
    // Users
    public const string UsersView = "users:view";
    public const string UsersCreate = "users:create";
    public const string UsersEdit = "users:edit";
    public const string UsersDelete = "users:delete";
    public const string UsersManageRoles = "users:manage_roles";
    public const string UsersInvite = "users:invite";
    
    // Organizations
    public const string OrganizationsView = "organizations:view";
    public const string OrganizationsManage = "organizations:manage";
    public const string OrganizationsSwitch = "organizations:switch";
    
    // Admin
    public const string AdminFull = "admin:full";
    public const string AuditView = "audit:view";
    public const string SystemManage = "system:manage";
    
    // Permission descriptions for UI
    public static readonly Dictionary<string, string> Descriptions = new()
    {
        { OrdersView, "View orders and order details" },
        { OrdersCreate, "Create new orders" },
        { OrdersEdit, "Edit existing orders" },
        { OrdersDelete, "Delete orders" },
        { OrdersDispatch, "Dispatch orders to drivers" },
        { ShipmentsView, "View shipments and tracking" },
        { ShipmentsCreate, "Create new shipments" },
        { ShipmentsEdit, "Edit shipment details" },
        { ShipmentsDelete, "Delete shipments" },
        { ShipmentsDispatch, "Dispatch shipments" },
        { ShipmentsTrack, "Track shipment locations" },
        { DriversView, "View driver profiles" },
        { DriversCreate, "Add new drivers" },
        { DriversEdit, "Edit driver information" },
        { DriversDelete, "Remove drivers" },
        { DriversAssign, "Assign drivers to loads" },
        { VehiclesView, "View vehicle fleet" },
        { VehiclesCreate, "Add new vehicles" },
        { VehiclesEdit, "Edit vehicle details" },
        { VehiclesDelete, "Remove vehicles" },
        { VehiclesAssign, "Assign vehicles to drivers" },
        { InvoicesView, "View customer invoices" },
        { InvoicesCreate, "Create new invoices" },
        { InvoicesEdit, "Edit invoice details" },
        { InvoicesSend, "Send invoices to customers" },
        { InvoicesVoid, "Void/cancel invoices" },
        { InvoicesApprove, "Approve invoices for sending" },
        { PayablesView, "View vendor payables" },
        { PayablesCreate, "Create new payables" },
        { PayablesApprove, "Approve payables for payment" },
        { PayablesPay, "Process payments" },
        { ReportsView, "View reports and analytics" },
        { ReportsExport, "Export reports to files" },
        { ReportsCreate, "Create custom reports" },
        { SettingsView, "View system settings" },
        { SettingsEdit, "Modify system settings" },
        { UsersView, "View user accounts" },
        { UsersCreate, "Create new users" },
        { UsersEdit, "Edit user profiles" },
        { UsersDelete, "Delete user accounts" },
        { UsersManageRoles, "Assign and manage user roles" },
        { UsersInvite, "Invite new users" },
        { AdminFull, "Full administrative access" },
        { AuditView, "View audit logs" },
        { SystemManage, "Manage system configuration" }
    };
}

// Predefined roles with their permissions
public static class DefaultRoles
{
    public static readonly (string Name, string Description, string[] Permissions)[] All = new[]
    {
        ("product_owner", "Product Owner - Full unrestricted access to all system features", new[] 
        { 
            Permissions.AdminFull,
            // Orders
            Permissions.OrdersView, Permissions.OrdersCreate, Permissions.OrdersEdit, Permissions.OrdersDelete, Permissions.OrdersDispatch,
            // Shipments
            Permissions.ShipmentsView, Permissions.ShipmentsCreate, Permissions.ShipmentsEdit, Permissions.ShipmentsDelete, Permissions.ShipmentsDispatch, Permissions.ShipmentsTrack,
            // Loads
            Permissions.LoadsView, Permissions.LoadsCreate, Permissions.LoadsEdit, Permissions.LoadsDelete,
            // Drivers
            Permissions.DriversView, Permissions.DriversCreate, Permissions.DriversEdit, Permissions.DriversDelete, Permissions.DriversAssign,
            // Vehicles
            Permissions.VehiclesView, Permissions.VehiclesCreate, Permissions.VehiclesEdit, Permissions.VehiclesDelete, Permissions.VehiclesAssign,
            // Fleet
            Permissions.FleetView, Permissions.FleetManage, Permissions.EquipmentView, Permissions.EquipmentManage,
            // Contacts
            Permissions.ContactsView, Permissions.ContactsCreate, Permissions.ContactsEdit, Permissions.ContactsDelete,
            // Places
            Permissions.PlacesView, Permissions.PlacesCreate, Permissions.PlacesEdit, Permissions.PlacesDelete,
            // Invoices
            Permissions.InvoicesView, Permissions.InvoicesCreate, Permissions.InvoicesEdit, Permissions.InvoicesSend, Permissions.InvoicesVoid, Permissions.InvoicesApprove,
            // Payables
            Permissions.PayablesView, Permissions.PayablesCreate, Permissions.PayablesApprove, Permissions.PayablesPay,
            // Finance
            Permissions.FinanceView, Permissions.FinanceManage, Permissions.RatesView, Permissions.RatesManage,
            // Maintenance
            Permissions.MaintenanceView, Permissions.MaintenanceCreate, Permissions.MaintenanceEdit, Permissions.MaintenanceApprove,
            // IoT
            Permissions.TelematicsView, Permissions.TelematicsManage, Permissions.DevicesView, Permissions.DevicesManage,
            // Reports
            Permissions.ReportsView, Permissions.ReportsExport, Permissions.ReportsCreate, Permissions.DashboardView,
            // Settings
            Permissions.SettingsView, Permissions.SettingsEdit, Permissions.IntegrationsView, Permissions.IntegrationsManage,
            // Users
            Permissions.UsersView, Permissions.UsersCreate, Permissions.UsersEdit, Permissions.UsersDelete, Permissions.UsersManageRoles, Permissions.UsersInvite,
            // Organizations
            Permissions.OrganizationsView, Permissions.OrganizationsManage, Permissions.OrganizationsSwitch,
            // Admin
            Permissions.AuditView, Permissions.SystemManage
        }),
        
        ("admin", "Full system access - can perform all actions", new[] { Permissions.AdminFull }),
        
        ("manager", "Oversee operations with full view access and limited edit", new[] 
        { 
            Permissions.OrdersView, Permissions.OrdersCreate, Permissions.OrdersEdit, Permissions.OrdersDispatch,
            Permissions.ShipmentsView, Permissions.ShipmentsCreate, Permissions.ShipmentsEdit, Permissions.ShipmentsDispatch,
            Permissions.LoadsView, Permissions.LoadsCreate, Permissions.LoadsEdit,
            Permissions.DriversView, Permissions.DriversEdit, Permissions.DriversAssign,
            Permissions.VehiclesView, Permissions.VehiclesEdit, Permissions.VehiclesAssign,
            Permissions.FleetView, Permissions.FleetManage,
            Permissions.ContactsView, Permissions.ContactsEdit,
            Permissions.PlacesView, Permissions.PlacesEdit,
            Permissions.InvoicesView, Permissions.InvoicesApprove,
            Permissions.PayablesView, Permissions.PayablesApprove,
            Permissions.ReportsView, Permissions.ReportsExport,
            Permissions.DashboardView,
            Permissions.UsersView
        }),
        
        ("dispatcher", "Manage dispatch operations - orders, loads, and driver assignments", new[] 
        { 
            Permissions.OrdersView, Permissions.OrdersCreate, Permissions.OrdersEdit, Permissions.OrdersDispatch,
            Permissions.ShipmentsView, Permissions.ShipmentsCreate, Permissions.ShipmentsEdit, Permissions.ShipmentsDispatch, Permissions.ShipmentsTrack,
            Permissions.LoadsView, Permissions.LoadsCreate, Permissions.LoadsEdit,
            Permissions.DriversView, Permissions.DriversEdit, Permissions.DriversAssign,
            Permissions.VehiclesView, Permissions.VehiclesAssign,
            Permissions.ContactsView,
            Permissions.PlacesView,
            Permissions.ReportsView,
            Permissions.DashboardView
        }),
        
        ("financial", "Manage billing, invoices, and payments", new[]
        {
            Permissions.OrdersView, Permissions.ShipmentsView, Permissions.LoadsView,
            Permissions.InvoicesView, Permissions.InvoicesCreate, Permissions.InvoicesEdit, Permissions.InvoicesSend, Permissions.InvoicesApprove,
            Permissions.PayablesView, Permissions.PayablesCreate, Permissions.PayablesApprove, Permissions.PayablesPay,
            Permissions.FinanceView, Permissions.FinanceManage,
            Permissions.RatesView, Permissions.RatesManage,
            Permissions.ContactsView,
            Permissions.ReportsView, Permissions.ReportsExport, Permissions.ReportsCreate,
            Permissions.DashboardView
        }),
        
        ("fleet_manager", "Manage vehicles, equipment, and maintenance", new[]
        {
            Permissions.DriversView, Permissions.DriversEdit,
            Permissions.VehiclesView, Permissions.VehiclesCreate, Permissions.VehiclesEdit, Permissions.VehiclesDelete, Permissions.VehiclesAssign,
            Permissions.FleetView, Permissions.FleetManage,
            Permissions.EquipmentView, Permissions.EquipmentManage,
            Permissions.MaintenanceView, Permissions.MaintenanceCreate, Permissions.MaintenanceEdit, Permissions.MaintenanceApprove,
            Permissions.TelematicsView,
            Permissions.DevicesView, Permissions.DevicesManage,
            Permissions.ReportsView,
            Permissions.DashboardView
        }),
        
        ("driver", "View and update assigned shipments", new[]
        {
            Permissions.OrdersView,
            Permissions.ShipmentsView, Permissions.ShipmentsTrack
        }),
        
        ("customer", "View own orders, shipments, and invoices", new[]
        {
            Permissions.OrdersView,
            Permissions.ShipmentsView, Permissions.ShipmentsTrack,
            Permissions.InvoicesView
        }),
        
        ("readonly", "View-only access to all operational data", new[]
        {
            Permissions.OrdersView, Permissions.ShipmentsView, Permissions.LoadsView,
            Permissions.DriversView, Permissions.VehiclesView, Permissions.FleetView,
            Permissions.ContactsView, Permissions.PlacesView,
            Permissions.InvoicesView, Permissions.PayablesView, Permissions.FinanceView,
            Permissions.ReportsView, Permissions.DashboardView
        })
    };
}
