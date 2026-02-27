using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class AccountTransaction
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int EmployeeAccountId { get; set; }

    [ForeignKey("EmployeeAccountId")]
    public EmployeeAccount? EmployeeAccount { get; set; }

    [Required]
    public DateTime TransactionDate { get; set; } = DateTime.UtcNow;

    [Required]
    [MaxLength(50)]
    public string Type { get; set; } = "debit";

    [Required]
    [MaxLength(200)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Category { get; set; }

    [MaxLength(100)]
    public string? Reference { get; set; }

    [Required]
    [Column(TypeName = "decimal(12,2)")]
    public decimal Amount { get; set; }

    [Column(TypeName = "decimal(12,2)")]
    public decimal BalanceAfter { get; set; }

    [MaxLength(50)]
    public string Status { get; set; } = "completed";

    [MaxLength(500)]
    public string? Notes { get; set; }

    [MaxLength(100)]
    public string? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
