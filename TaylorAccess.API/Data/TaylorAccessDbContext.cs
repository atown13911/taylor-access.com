using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Models;
using TaylorAccess.API.Models.Chat;

namespace TaylorAccess.API.Data;

public class TaylorAccessDbContext : DbContext
{
    public TaylorAccessDbContext(DbContextOptions<TaylorAccessDbContext> options)
        : base(options)
    {
    }

    // Core
    public DbSet<User> Users => Set<User>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<UserOrganization> UserOrganizations => Set<UserOrganization>();
    public DbSet<UserSetting> UserSettings => Set<UserSetting>();
    public DbSet<UserInvitation> UserInvitations => Set<UserInvitation>();

    // Security & Admin
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<TwoFactorSettings> TwoFactorSettings => Set<TwoFactorSettings>();

    // Entity hierarchy
    public DbSet<Satellite> Satellites => Set<Satellite>();
    public DbSet<SatelliteOwner> SatelliteOwners => Set<SatelliteOwner>();
    public DbSet<Agency> Agencies => Set<Agency>();
    public DbSet<Terminal> Terminals => Set<Terminal>();
    public DbSet<Division> Divisions => Set<Division>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Position> Positions => Set<Position>();
    public DbSet<PositionDocumentRequirement> PositionDocumentRequirements => Set<PositionDocumentRequirement>();
    public DbSet<JobTitle> JobTitles => Set<JobTitle>();
    public DbSet<DocumentCategory> DocumentCategories => Set<DocumentCategory>();
    public DbSet<DocumentCategoryItem> DocumentCategoryItems => Set<DocumentCategoryItem>();

    // Drivers
    public DbSet<Driver> Drivers => Set<Driver>();
    public DbSet<DriverDocument> DriverDocuments => Set<DriverDocument>();
    public DbSet<DriverPaySheet> DriverPaySheets => Set<DriverPaySheet>();
    public DbSet<DriverTerminal> DriverTerminals => Set<DriverTerminal>();
    public DbSet<DriverPayment> DriverPayments => Set<DriverPayment>();

    // Insurance & Compliance
    public DbSet<InsurancePolicy> InsurancePolicies => Set<InsurancePolicy>();
    public DbSet<InsuranceEnrollment> InsuranceEnrollments => Set<InsuranceEnrollment>();

    // OAuth2 / SSO
    public DbSet<OAuthClient> OAuthClients => Set<OAuthClient>();
    public DbSet<OAuthAuthorizationCode> OAuthAuthorizationCodes => Set<OAuthAuthorizationCode>();
    public DbSet<OAuthAccessToken> OAuthAccessTokens => Set<OAuthAccessToken>();
    public DbSet<OAuthRefreshToken> OAuthRefreshTokens => Set<OAuthRefreshToken>();
    public DbSet<AppRoleAssignment> AppRoleAssignments => Set<AppRoleAssignment>();

    // Chat
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatMessageReaction> ChatMessageReactions => Set<ChatMessageReaction>();
    public DbSet<ChatMessageAttachment> ChatMessageAttachments => Set<ChatMessageAttachment>();
    public DbSet<ChatMessageMention> ChatMessageMentions => Set<ChatMessageMention>();
    public DbSet<ChatConversation> ChatConversations => Set<ChatConversation>();
    public DbSet<ChatConversationParticipant> ChatConversationParticipants => Set<ChatConversationParticipant>();
    public DbSet<ChatUserStatus> ChatUserStatuses => Set<ChatUserStatus>();
    public DbSet<ChatChannel> ChatChannels => Set<ChatChannel>();
    public DbSet<ChatChannelMember> ChatChannelMembers => Set<ChatChannelMember>();

    // Tickets
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketComment> TicketComments => Set<TicketComment>();
    public DbSet<TicketAttachment> TicketAttachments => Set<TicketAttachment>();
    public DbSet<TicketCategory> TicketCategories => Set<TicketCategory>();

    // Notifications
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();

    // Addresses & Places
    public DbSet<Address> Addresses => Set<Address>();
    public DbSet<Place> Places => Set<Place>();

    // Operations
    public DbSet<Shipment> Shipments => Set<Shipment>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Load> Loads => Set<Load>();

    // Zoom
    public DbSet<ZoomUserRecord> ZoomUserRecords => Set<ZoomUserRecord>();

    // HR / Employee
    public DbSet<EmployeeRoster> EmployeeRosters => Set<EmployeeRoster>();
    public DbSet<EmployeeAccount> EmployeeAccounts => Set<EmployeeAccount>();
    public DbSet<EmployeeDeduction> EmployeeDeductions => Set<EmployeeDeduction>();
    public DbSet<EmployeeDocument> EmployeeDocuments => Set<EmployeeDocument>();
    public DbSet<EmployeeBenefit> EmployeeBenefits => Set<EmployeeBenefit>();
    public DbSet<EmployeeSnapshot> EmployeeSnapshots => Set<EmployeeSnapshot>();
    public DbSet<EmployeeStagingImport> EmployeeStagingImports => Set<EmployeeStagingImport>();
    public DbSet<AccountTransaction> AccountTransactions => Set<AccountTransaction>();
    public DbSet<Paycheck> Paychecks => Set<Paycheck>();
    public DbSet<TimeOffRequest> TimeOffRequests => Set<TimeOffRequest>();
    public DbSet<AttendanceRecord> AttendanceRecords => Set<AttendanceRecord>();
    public DbSet<Timesheet> Timesheets => Set<Timesheet>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();

        modelBuilder.Entity<UserOrganization>()
            .HasIndex(uo => new { uo.UserId, uo.OrganizationId })
            .IsUnique();

        modelBuilder.Entity<UserRole>()
            .HasIndex(ur => new { ur.UserId, ur.RoleId })
            .IsUnique();

        modelBuilder.Entity<UserSetting>()
            .HasIndex(us => new { us.UserId, us.Key })
            .IsUnique();

        modelBuilder.Entity<EmployeeRoster>()
            .HasIndex(er => new { er.UserId, er.OrganizationId })
            .IsUnique();

        modelBuilder.Entity<EmployeeRoster>()
            .HasOne(er => er.User)
            .WithMany()
            .HasForeignKey(er => er.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<EmployeeRoster>()
            .HasOne(er => er.Manager)
            .WithMany()
            .HasForeignKey(er => er.ManagerId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Satellite>()
            .HasOne(s => s.Manager)
            .WithMany()
            .HasForeignKey(s => s.ManagerUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Agency>()
            .HasOne(a => a.Manager)
            .WithMany()
            .HasForeignKey(a => a.ManagerUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Agency>()
            .HasOne(a => a.RegionalManager)
            .WithMany()
            .HasForeignKey(a => a.RegionalManagerUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Terminal>()
            .HasOne(t => t.Manager)
            .WithMany()
            .HasForeignKey(t => t.ManagerUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Department>()
            .HasOne(d => d.Manager)
            .WithMany()
            .HasForeignKey(d => d.ManagerUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<OAuthClient>()
            .HasIndex(c => c.ClientId)
            .IsUnique();

        modelBuilder.Entity<AppRoleAssignment>()
            .HasIndex(a => new { a.UserId, a.AppClientId })
            .IsUnique();
    }
}
