using System.ComponentModel.DataAnnotations;

namespace TaylorAccess.API.Models;

/// <summary>
/// Workspace accounts moved into Restricted Access (hidden from Domain /
/// Data Storage for everyone except the product owner). Complements the
/// GOOGLE_HIDDEN_WORKSPACE_USERS env allowlist.
/// </summary>
public class GoogleRestrictedWorkspaceUser
{
    [Key]
    public int Id { get; set; }

    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(256)]
    public string? CreatedByEmail { get; set; }
}
