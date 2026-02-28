using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace TaylorAccess.API.Models;

/// <summary>
/// Click event tracking model (stored in MongoDB)
/// </summary>
public class ClickEvent
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }
    
    // User context
    public int? UserId { get; set; }
    public string? UserEmail { get; set; }
    public string? UserName { get; set; }
    public int? OrganizationId { get; set; }
    
    // Event details
    public string EventType { get; set; } = "click";
    public string? ElementId { get; set; }
    public string? ElementClass { get; set; }
    public string? ElementText { get; set; }
    public string? ElementType { get; set; }
    
    // Page context
    public string? PageUrl { get; set; }
    public string? PageTitle { get; set; }
    public string? Route { get; set; }
    
    // Click details
    public int? X { get; set; }
    public int? Y { get; set; }
    public string? Target { get; set; }
    
    // Session info
    public string? SessionId { get; set; }
    public string? DeviceType { get; set; }
    public string? Browser { get; set; }
    public string? OS { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    
    // Timing
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public long? TimeOnPage { get; set; }
    
    // Custom metadata
    [BsonIgnoreIfNull]
    public Dictionary<string, string>? Metadata { get; set; }
}

/// <summary>
/// Page view tracking model (stored in MongoDB)
/// </summary>
public class PageViewEvent
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }
    
    public int? UserId { get; set; }
    public string? UserEmail { get; set; }
    public int? OrganizationId { get; set; }
    
    public string? PageUrl { get; set; }
    public string? PageTitle { get; set; }
    public string? Referrer { get; set; }
    public string? Route { get; set; }
    
    public string? SessionId { get; set; }
    public string? DeviceType { get; set; }
    public string? Browser { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public long? Duration { get; set; }
    
    [BsonIgnoreIfNull]
    public Dictionary<string, string>? Metadata { get; set; }
}

public class UserSession
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public int UserId { get; set; }
    public string? UserName { get; set; }
    public string? UserEmail { get; set; }
    public int? OrganizationId { get; set; }

    public DateTime LoginTime { get; set; } = DateTime.UtcNow;
    public DateTime? LogoutTime { get; set; }
    public double? DurationMinutes { get; set; }

    public string LogoutReason { get; set; } = "active";
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
}

