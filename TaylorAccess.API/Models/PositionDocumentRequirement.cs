namespace TaylorAccess.API.Models;

public class PositionDocumentRequirement
{
    public int Id { get; set; }
    public int PositionId { get; set; }
    public int DocumentCategoryItemId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
