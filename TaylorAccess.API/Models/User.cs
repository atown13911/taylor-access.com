using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class User
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Alias { get; set; }

    [MaxLength(20)]
    public string? Gender { get; set; }

    public DateOnly? DateOfBirth { get; set; }

    [MaxLength(50)]
    public string? IdNumber { get; set; }

    [MaxLength(20)]
    public string? Height { get; set; }

    [MaxLength(20)]
    public string? Weight { get; set; }

    [MaxLength(30)]
    public string? EyeColor { get; set; }

    [MaxLength(30)]
    public string? HairColor { get; set; }

    [MaxLength(100)]
    public string? Ethnicity { get; set; }

    [MaxLength(100)]
    public string? Religion { get; set; }

    [Required]
    [MaxLength(255)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? PersonalEmail { get; set; }

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Phone { get; set; }

    [MaxLength(50)]
    public string? WorkPhone { get; set; }

    [MaxLength(10)]
    public string? WorkPhoneCountry { get; set; }

    [MaxLength(50)]
    public string? CellPhone { get; set; }

    [MaxLength(10)]
    public string? CellPhoneCountry { get; set; }

    [MaxLength(500)]
    public string? Address { get; set; }

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(50)]
    public string? State { get; set; }

    [MaxLength(20)]
    public string? ZipCode { get; set; }

    [MaxLength(255)]
    public string? ZoomEmail { get; set; }

    [MaxLength(100)]
    public string? ZoomUserId { get; set; }

    public string? Avatar { get; set; }

    [MaxLength(50)]
    public string? Timezone { get; set; } = "America/New_York";

    [MaxLength(50)]
    public string? Country { get; set; } = "USA";

    [MaxLength(10)]
    public string? Language { get; set; } = "en";

    public string? Preferences { get; set; }

    [Required]
    [MaxLength(30)]
    public string Role { get; set; } = "user";

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "active";

    public static readonly Dictionary<string, int> RoleHierarchy = new()
    {
        { "product_owner", 100 },
        { "development", 95 },
        { "superadmin", 90 },
        { "admin", 80 },
        { "manager", 70 },
        { "dispatcher", 60 },
        { "driver", 50 },
        { "user", 10 }
    };

    public int GetRoleLevel() => RoleHierarchy.GetValueOrDefault(Role.ToLower(), 0);
    
    public bool HasRoleOrHigher(string requiredRole) => 
        GetRoleLevel() >= RoleHierarchy.GetValueOrDefault(requiredRole.ToLower(), 0);
    
    public bool IsProductOwner() => Role.ToLower() == "product_owner";
    public bool IsDevelopment() => Role.ToLower() == "development";
    public bool IsSuperAdmin() => Role.ToLower() == "superadmin" || IsProductOwner() || IsDevelopment();
    public bool IsAdmin() => Role.ToLower() == "admin" || IsSuperAdmin();

    public bool IsEmailVerified { get; set; } = false;

    public DateTime? EmailVerifiedAt { get; set; }

    public DateTime? LastLoginAt { get; set; }

    public int? OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    public int? SatelliteId { get; set; }
    
    [ForeignKey("SatelliteId")]
    public Satellite? Satellite { get; set; }
    
    public int? AgencyId { get; set; }
    
    [ForeignKey("AgencyId")]
    public Agency? Agency { get; set; }
    
    public int? TerminalId { get; set; }
    
    [ForeignKey("TerminalId")]
    public Terminal? Terminal { get; set; }

    public int? DivisionId { get; set; }
    
    [ForeignKey("DivisionId")]
    public Division? Division { get; set; }

    public int? DepartmentId { get; set; }
    
    [ForeignKey("DepartmentId")]
    public Department? Department { get; set; }

    public int? PositionId { get; set; }
    
    [ForeignKey("PositionId")]
    public Position? Position { get; set; }

    [MaxLength(100)]
    public string? JobTitle { get; set; }

    [MaxLength(100)]
    public string? LandstarUsername { get; set; }
    
    [MaxLength(200)]
    public string? LandstarPassword { get; set; }
    
    [MaxLength(100)]
    public string? PowerdatUsername { get; set; }
    
    [MaxLength(200)]
    public string? PowerdatPassword { get; set; }

    [MaxLength(64)]
    public string? ApiKey { get; set; }

    [MaxLength(64)]
    public string? ApiSecret { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<UserOrganization>? UserOrganizations { get; set; }

    public static string GenerateApiKey()
    {
        return $"ta_{Guid.NewGuid():N}";
    }

    public static string GenerateApiSecret()
    {
        var bytes = new byte[32];
        Guid.NewGuid().ToByteArray().CopyTo(bytes, 0);
        Guid.NewGuid().ToByteArray().CopyTo(bytes, 16);
        return Convert.ToBase64String(bytes);
    }
}

public record ChangePasswordRequest(string CurrentPassword, string NewPassword, string ConfirmPassword);
