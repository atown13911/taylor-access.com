using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class DriverPayment
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Nullable: org-level payment methods have no driver assigned.
    /// When a driver is assigned this method, DriverId is set.
    /// </summary>
    public int? DriverId { get; set; }

    [ForeignKey("DriverId")]
    public Driver? Driver { get; set; }

    [Required]
    public int OrganizationId { get; set; }

    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [Required]
    [MaxLength(30)]
    public string PaymentMethod { get; set; } = "direct_deposit";
    // direct_deposit, comdata, efs, wex, tchek, rts, stripe, paper_check

    // Direct Deposit fields
    [MaxLength(100)]
    public string? BankName { get; set; }

    [MaxLength(20)]
    public string? RoutingNumber { get; set; }

    [MaxLength(30)]
    public string? AccountNumber { get; set; }

    [MaxLength(20)]
    public string? AccountType { get; set; } // checking, savings

    // Card fields
    [MaxLength(30)]
    public string? CardType { get; set; } // comdata, efs, wex, tchek, rts, stripe

    [MaxLength(4)]
    public string? CardLastFour { get; set; }

    [MaxLength(100)]
    public string? CardHolderName { get; set; }

    // Paper Check fields
    [MaxLength(500)]
    public string? MailingAddress { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "active"; // active, inactive

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

