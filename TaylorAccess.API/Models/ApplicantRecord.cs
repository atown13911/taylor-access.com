using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class ApplicantRecord
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string FullName { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Gender { get; set; }

    public int? Age { get; set; }

    [MaxLength(200)]
    public string? Position { get; set; }

    [MaxLength(200)]
    public string? Source { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "new";

    public DateTime? AppliedDate { get; set; }

    public string? Notes { get; set; }

    [MaxLength(300)]
    public string? CvFileName { get; set; }

    public string? CvDataUrl { get; set; }

    public int? CreatedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

