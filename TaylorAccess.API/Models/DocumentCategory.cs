using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

public class DocumentCategory
{
    public int Id { get; set; }
    
    public int? OrganizationId { get; set; }
    
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    
    public int SortOrder { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class DocumentCategoryItem
{
    public int Id { get; set; }
    
    public int CategoryId { get; set; }
    public DocumentCategory? Category { get; set; }
    
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    public int SortOrder { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

