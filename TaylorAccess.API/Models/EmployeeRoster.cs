using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaylorAccess.API.Models;

public class EmployeeRoster
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int UserId { get; set; }
    
    [ForeignKey("UserId")]
    public User? User { get; set; }

    [Required]
    public int OrganizationId { get; set; }
    
    [ForeignKey("OrganizationId")]
    public Organization? Organization { get; set; }

    [MaxLength(100)]
    public string? EmployeeNumber { get; set; }
    
    public DateTime? HireDate { get; set; }
    public DateTime? TerminationDate { get; set; }
    
    [MaxLength(50)]
    public string EmploymentStatus { get; set; } = "active";
    
    [MaxLength(50)]
    public string EmploymentType { get; set; } = "full-time";

    public decimal? HourlyRate { get; set; }
    public decimal? AnnualSalary { get; set; }
    
    [MaxLength(50)]
    public string? PayType { get; set; }
    
    [MaxLength(50)]
    public string? PayFrequency { get; set; }

    public DateTime? DateOfBirth { get; set; }
    
    [MaxLength(20)]
    public string? SSN { get; set; }
    
    [MaxLength(200)]
    public string? HomeAddress { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? ZipCode { get; set; }
    public string? Country { get; set; }

    [MaxLength(200)]
    public string? EmergencyContactName { get; set; }
    
    [MaxLength(50)]
    public string? EmergencyContactPhone { get; set; }
    
    [MaxLength(100)]
    public string? EmergencyContactRelationship { get; set; }

    public int? ManagerId { get; set; }
    [ForeignKey("ManagerId")]
    public User? Manager { get; set; }

    [MaxLength(50)]
    public string? WorkSchedule { get; set; }
    public int? WeeklyHours { get; set; }

    public bool BenefitsEligible { get; set; } = false;
    public DateTime? BenefitsStartDate { get; set; }

    public decimal VacationBalance { get; set; } = 0;
    public decimal SickBalance { get; set; } = 0;
    public decimal PTOBalance { get; set; } = 0;

    public DateTime? LastReviewDate { get; set; }
    public DateTime? NextReviewDate { get; set; }
    public decimal? PerformanceRating { get; set; }

    public bool I9OnFile { get; set; } = false;
    public bool W4OnFile { get; set; } = false;
    public bool BackgroundCheckCompleted { get; set; } = false;
    public bool DrugTestCompleted { get; set; } = false;

    public string? Notes { get; set; }
    public string? Skills { get; set; }
    public string? Certifications { get; set; }

    public int? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
