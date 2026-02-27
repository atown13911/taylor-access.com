using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class EmployeeStagingImport
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required][MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required][MaxLength(255)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Phone { get; set; }

    [MaxLength(30)]
    public string? Role { get; set; }

    [MaxLength(100)]
    public string? Position { get; set; }

    [MaxLength(100)]
    public string? Department { get; set; }

    [MaxLength(100)]
    public string? EmployeeNumber { get; set; }

    [MaxLength(50)]
    public string? EmploymentType { get; set; }

    [MaxLength(50)]
    public string? PayType { get; set; }

    public decimal? HourlyRate { get; set; }
    public decimal? AnnualSalary { get; set; }

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(50)]
    public string? State { get; set; }

    [MaxLength(20)]
    public string? ZipCode { get; set; }

    [MaxLength(200)]
    public string? EmergencyContactName { get; set; }

    [MaxLength(50)]
    public string? EmergencyContactPhone { get; set; }

    public DateTime? HireDate { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "pending";

    public int? ImportedBy { get; set; }
    public int? OrganizationId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
