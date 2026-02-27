using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;
using TaylorAccess.API.Services;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/employee-accounts")]
[Authorize]
public class EmployeeAccountsController : ControllerBase
{
    private readonly TaylorAccessDbContext _context;
    private readonly CurrentUserService _currentUserService;

    public EmployeeAccountsController(TaylorAccessDbContext context, CurrentUserService currentUserService)
    {
        _context = context;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetEmployeeAccounts(
        [FromQuery] int userId,
        [FromQuery] string? type = null)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var query = _context.EmployeeAccounts
            .Where(a => a.UserId == userId)
            .AsQueryable();

        // Scope to organization
        if (user.OrganizationId.HasValue)
            query = query.Where(a => a.OrganizationId == user.OrganizationId.Value);

        if (!string.IsNullOrEmpty(type))
            query = query.Where(a => a.Type == type);

        var accounts = await query
            .OrderBy(a => a.Type)
            .ThenBy(a => a.Priority)
            .ToListAsync();

        return Ok(new { data = accounts });
    }

    [HttpPost]
    public async Task<ActionResult<object>> CreateEmployeeAccount([FromBody] EmployeeAccount account)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
            return BadRequest(new { error = "User must belong to an organization" });

        // Verify the target user exists
        var targetUser = await _context.Users.FindAsync(account.UserId);
        if (targetUser == null)
            return BadRequest(new { error = "User not found" });

        account.Id = 0;
        account.OrganizationId = user.OrganizationId.Value;
        account.CreatedAt = DateTime.UtcNow;
        account.UpdatedAt = DateTime.UtcNow;

        _context.EmployeeAccounts.Add(account);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetEmployeeAccounts), new { userId = account.UserId }, new { data = account });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<object>> UpdateEmployeeAccount(int id, [FromBody] EmployeeAccount updated)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var account = await _context.EmployeeAccounts.FindAsync(id);
        if (account == null)
            return NotFound(new { error = "Account not found" });

        // Verify org access
        if (user.OrganizationId.HasValue && account.OrganizationId != user.OrganizationId.Value)
            return NotFound(new { error = "Account not found" });

        account.Type = updated.Type;
        account.BankName = updated.BankName;
        account.AccountName = updated.AccountName;
        account.AccountNumber = updated.AccountNumber;
        account.RoutingNumber = updated.RoutingNumber;
        account.AccountType = updated.AccountType;
        account.CardNumber = updated.CardNumber;
        account.SpendingLimit = updated.SpendingLimit;
        account.CurrentBalance = updated.CurrentBalance;
        account.DepositType = updated.DepositType;
        account.Amount = updated.Amount;
        account.Percentage = updated.Percentage;
        account.Priority = updated.Priority;
        account.Status = updated.Status;
        account.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = account });
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult<object>> DeleteEmployeeAccount(int id)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var account = await _context.EmployeeAccounts.FindAsync(id);
        if (account == null)
            return NotFound(new { error = "Account not found" });

        // Verify org access
        if (user.OrganizationId.HasValue && account.OrganizationId != user.OrganizationId.Value)
            return NotFound(new { error = "Account not found" });

        _context.EmployeeAccounts.Remove(account);
        await _context.SaveChangesAsync();

        return Ok(new { deleted = true });
    }

    // === TRANSACTIONS ===

    [HttpGet("{accountId}/transactions")]
    public async Task<ActionResult<object>> GetTransactions(
        int accountId,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 50)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var account = await _context.EmployeeAccounts.FindAsync(accountId);
        if (account == null)
            return NotFound(new { error = "Account not found" });

        if (user.OrganizationId.HasValue && account.OrganizationId != user.OrganizationId.Value)
            return NotFound(new { error = "Account not found" });

        var query = _context.AccountTransactions
            .Where(t => t.EmployeeAccountId == accountId)
            .AsQueryable();

        var total = await query.CountAsync();
        var transactions = await query
            .OrderByDescending(t => t.TransactionDate)
            .ThenByDescending(t => t.Id)
            .Skip((page - 1) * limit)
            .Take(limit)
            .ToListAsync();

        return Ok(new { data = transactions, total, page, limit });
    }

    [HttpPost("{accountId}/transactions")]
    public async Task<ActionResult<object>> CreateTransaction(int accountId, [FromBody] AccountTransaction transaction)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user?.OrganizationId == null)
            return BadRequest(new { error = "User must belong to an organization" });

        var account = await _context.EmployeeAccounts.FindAsync(accountId);
        if (account == null)
            return NotFound(new { error = "Account not found" });

        if (account.OrganizationId != user.OrganizationId.Value)
            return NotFound(new { error = "Account not found" });

        // Calculate new balance
        var currentBalance = account.CurrentBalance ?? 0;
        decimal newBalance;
        if (transaction.Type == "credit" || transaction.Type == "payroll" || transaction.Type == "reimbursement")
        {
            newBalance = currentBalance + transaction.Amount;
        }
        else
        {
            newBalance = currentBalance - transaction.Amount;
        }

        transaction.Id = 0;
        transaction.EmployeeAccountId = accountId;
        transaction.BalanceAfter = newBalance;
        transaction.CreatedBy = user.Email;
        transaction.CreatedAt = DateTime.UtcNow;

        if (transaction.TransactionDate == default)
            transaction.TransactionDate = DateTime.UtcNow;

        _context.AccountTransactions.Add(transaction);

        // Update account balance
        account.CurrentBalance = newBalance;
        account.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { data = transaction, newBalance });
    }

    [HttpGet("{accountId}/summary")]
    public async Task<ActionResult<object>> GetAccountSummary(int accountId)
    {
        var user = await _currentUserService.GetUserAsync();
        if (user == null) return Unauthorized();

        var account = await _context.EmployeeAccounts
            .Include(a => a.User)
            .FirstOrDefaultAsync(a => a.Id == accountId);
        if (account == null)
            return NotFound(new { error = "Account not found" });

        if (user.OrganizationId.HasValue && account.OrganizationId != user.OrganizationId.Value)
            return NotFound(new { error = "Account not found" });

        var thirtyDaysAgo = DateTime.UtcNow.AddDays(-30);
        var transactions = await _context.AccountTransactions
            .Where(t => t.EmployeeAccountId == accountId && t.TransactionDate >= thirtyDaysAgo)
            .ToListAsync();

        var totalCredits = transactions
            .Where(t => t.Type == "credit" || t.Type == "payroll" || t.Type == "reimbursement")
            .Sum(t => t.Amount);
        var totalDebits = transactions
            .Where(t => t.Type != "credit" && t.Type != "payroll" && t.Type != "reimbursement")
            .Sum(t => t.Amount);

        return Ok(new
        {
            data = account,
            summary = new
            {
                balance = account.CurrentBalance ?? 0,
                last30DaysCredits = totalCredits,
                last30DaysDebits = totalDebits,
                transactionCount = transactions.Count
            }
        });
    }
}


