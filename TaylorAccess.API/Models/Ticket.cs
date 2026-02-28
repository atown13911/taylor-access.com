using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

/// <summary>
/// Support ticket / issue tracking system
/// </summary>
public class Ticket
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }
    
    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [Required]
    [MaxLength(100)]
    public string TicketNumber { get; set; } = GenerateTicketNumber();

    [Required]
    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    [Required]
    public string Description { get; set; } = string.Empty;

    // Type: support_ticket or request
    [Required]
    [MaxLength(30)]
    public string Type { get; set; } = "support_ticket"; // support_ticket, request

    // Category/Type
    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = "general"; 
    // Support Ticket categories: general, technical, billing, feature_request, bug, maintenance, 
    //   customer_issue, driver_issue, vehicle_issue, system_issue
    // Request categories: general, it, access, equipment, supplies, other

    [Required]
    [MaxLength(20)]
    public string Priority { get; set; } = "medium"; // low, medium, high, urgent, critical

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "open"; // open, in_progress, waiting, resolved, closed, cancelled

    // Assignment
    public int? AssignedToId { get; set; }
    [ForeignKey("AssignedToId")]
    public User? AssignedTo { get; set; }

    public int? AssignedTeamId { get; set; } // Group/Department assignment

    // Reporter
    [Required]
    public int ReportedById { get; set; }
    [ForeignKey("ReportedById")]
    public User? ReportedBy { get; set; }

    // Related entities
    public int? CustomerId { get; set; }
    public int? OrderId { get; set; }
    public int? ShipmentId { get; set; }
    public int? LoadId { get; set; }
    public int? DriverId { get; set; }
    public int? VehicleId { get; set; }

    // SLA tracking
    public DateTime? DueDate { get; set; }
    public DateTime? FirstResponseAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime? ClosedAt { get; set; }

    // Metrics
    public int ResponseTimeMinutes { get; set; }
    public int ResolutionTimeMinutes { get; set; }

    // Tags
    public string? Tags { get; set; } // JSON array or comma-separated

    // Satisfaction
    public int? SatisfactionRating { get; set; } // 1-5 stars
    public string? SatisfactionComment { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<TicketComment> Comments { get; set; } = new List<TicketComment>();
    public ICollection<TicketAttachment> Attachments { get; set; } = new List<TicketAttachment>();

    private static string GenerateTicketNumber() => $"TKT-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
}

public class TicketComment
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int TicketId { get; set; }
    [ForeignKey("TicketId")]
    public Ticket? Ticket { get; set; }

    [Required]
    public int UserId { get; set; }
    [ForeignKey("UserId")]
    public User? User { get; set; }

    [Required]
    public string Comment { get; set; } = string.Empty;

    public bool IsInternal { get; set; } // Internal notes vs customer-visible

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class TicketAttachment
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int TicketId { get; set; }
    [ForeignKey("TicketId")]
    public Ticket? Ticket { get; set; }

    [Required]
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ContentType { get; set; }

    public long FileSize { get; set; }

    public string? FileContent { get; set; } // Base64 or URL

    public int? UploadedById { get; set; }
    [ForeignKey("UploadedById")]
    public User? UploadedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class TicketCategory
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Code { get; set; }

    public string? Description { get; set; }

    [MaxLength(20)]
    public string? DefaultPriority { get; set; }

    public int? DefaultAssignedToId { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

