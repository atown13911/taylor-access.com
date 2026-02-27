using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class EmployeeAccount
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [Required]
    [MaxLength(30)]
    public string Type { get; set; } = "bank";

    [MaxLength(200)]
    public string? BankName { get; set; }

    [MaxLength(200)]
    public string? AccountName { get; set; }

    [MaxLength(50)]
    public string? AccountNumber { get; set; }

    [MaxLength(50)]
    public string? RoutingNumber { get; set; }

    [MaxLength(50)]
    public string? AccountType { get; set; }

    [MaxLength(34)]
    public string? Iban { get; set; }

    [MaxLength(11)]
    public string? SwiftBic { get; set; }

    [MaxLength(10)]
    public string? Country { get; set; }

    [MaxLength(50)]
    public string? CardNumber { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal? SpendingLimit { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal? CurrentBalance { get; set; }

    [MaxLength(50)]
    public string? DepositType { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal? Amount { get; set; }

    [Column(TypeName = "decimal(5,2)")]
    public decimal? Percentage { get; set; }

    public int? Priority { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "active";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<AccountTransaction>? Transactions { get; set; }
}
