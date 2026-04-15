using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class TrailerPhoto
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string TrailerId { get; set; } = string.Empty;

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ContentType { get; set; }

    [Required]
    public long FileSize { get; set; }

    [Required]
    public string FileContent { get; set; } = string.Empty;

    public int? UploadedByUserId { get; set; }

    [MaxLength(150)]
    public string? UploadedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
