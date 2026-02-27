using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class EmployeeDocument
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    public int OrganizationId { get; set; }
    
    [Required]
    public int EmployeeId { get; set; }
    
    [ForeignKey("EmployeeId")]
    public User? Employee { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string DocumentType { get; set; } = "general";
    
    [Required]
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? ContentType { get; set; }
    
    public long FileSize { get; set; }
    
    public string? FileContent { get; set; }
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    public DateOnly? ExpiresAt { get; set; }
    
    [NotMapped]
    public bool IsExpired => ExpiresAt.HasValue && ExpiresAt.Value < DateOnly.FromDateTime(DateTime.UtcNow);
    
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "active";
    
    public bool RequiresSignature { get; set; }
    public bool IsSigned { get; set; }
    public DateTime? SignedAt { get; set; }
    public string? SignatureData { get; set; }
    
    [MaxLength(100)]
    public string? UploadedBy { get; set; }
    
    [MaxLength(100)]
    public string? SignedBy { get; set; }
    
    [MaxLength(200)]
    public string? Tags { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
