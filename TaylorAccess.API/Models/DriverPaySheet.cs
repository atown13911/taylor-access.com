using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class DriverPaySheet
{
    public int Id { get; set; }
    
    // Multi-tenant: Organization ID
    public int OrganizationId { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string PaySheetNumber { get; set; } = GenerateNumber();
    
    [Required]
    public int DriverId { get; set; }
    
    [ForeignKey("DriverId")]
    public Driver? Driver { get; set; }
    
    [Required]
    public DateTime PeriodStart { get; set; }
    
    [Required]
    public DateTime PeriodEnd { get; set; }
    
    // Earnings - Distance/Quantity fields
    [Column(TypeName = "decimal(12,2)")]
    public decimal TotalMiles { get; set; } = 0;
    
    [Column(TypeName = "decimal(10,4)")]
    public decimal RatePerMile { get; set; } = 0;
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal MileagePay { get; set; } = 0;
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal TotalStops { get; set; } = 0;
    
    [Column(TypeName = "decimal(10,4)")]
    public decimal RatePerStop { get; set; } = 0;
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal StopPay { get; set; } = 0;
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal HourlyHours { get; set; } = 0;
    
    [Column(TypeName = "decimal(10,4)")]
    public decimal HourlyRate { get; set; } = 0;
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal HourlyPay { get; set; } = 0;
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal PercentageLoads { get; set; } = 0;
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal PercentageRate { get; set; } = 0;
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal PercentagePay { get; set; } = 0;
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal Bonus { get; set; } = 0;
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal Reimbursements { get; set; } = 0;
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal GrossPay { get; set; } = 0;
    
    // Deductions (stored as JSON)
    public string? Deductions { get; set; } // JSON array of {name, amount}
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal TotalDeductions { get; set; } = 0;
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal NetPay { get; set; } = 0;
    
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "draft"; // draft, pending, approved, paid, void
    
    public int? ApprovedById { get; set; }
    
    [ForeignKey("ApprovedById")]
    public User? ApprovedBy { get; set; }
    
    public DateTime? ApprovedAt { get; set; }
    
    public DateTime? PaidAt { get; set; }
    
    [MaxLength(50)]
    public string? PaymentMethod { get; set; }
    
    [MaxLength(100)]
    public string? PaymentReference { get; set; }
    
    public string? Notes { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public static string GenerateNumber()
    {
        return $"PAY-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
    }
}




