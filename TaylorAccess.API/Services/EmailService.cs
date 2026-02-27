using System.Net;
using System.Net.Mail;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

public interface IEmailService
{
    Task<bool> SendEmailAsync(string to, string subject, string body, bool isHtml = true);
    Task<bool> SendPasswordResetAsync(string email, string resetToken);
    Task<bool> SendWelcomeEmailAsync(User user);
}

public class EmailService : IEmailService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;
    private readonly string _smtpHost;
    private readonly int _smtpPort;
    private readonly string _smtpUser;
    private readonly string _smtpPassword;
    private readonly string _fromEmail;
    private readonly string _fromName;
    private readonly bool _enableSsl;

    public EmailService(IConfiguration configuration, ILogger<EmailService> logger)
    {
        _configuration = configuration;
        _logger = logger;
        
        _smtpHost = configuration["Email:SmtpHost"] ?? "localhost";
        _smtpPort = int.Parse(configuration["Email:SmtpPort"] ?? "587");
        _smtpUser = configuration["Email:SmtpUser"] ?? "";
        _smtpPassword = configuration["Email:SmtpPassword"] ?? "";
        _fromEmail = configuration["Email:FromEmail"] ?? "noreply@taylor-access.com";
        _fromName = configuration["Email:FromName"] ?? "Taylor Access";
        _enableSsl = bool.Parse(configuration["Email:EnableSsl"] ?? "true");
    }

    public async Task<bool> SendEmailAsync(string to, string subject, string body, bool isHtml = true)
    {
        try
        {
            if (string.IsNullOrEmpty(_smtpHost) || _smtpHost == "localhost")
            {
                _logger.LogInformation("[EMAIL] To: {To}, Subject: {Subject}", to, subject);
                return true;
            }

            using var client = new SmtpClient(_smtpHost, _smtpPort)
            {
                EnableSsl = _enableSsl,
                Credentials = new NetworkCredential(_smtpUser, _smtpPassword)
            };

            var message = new MailMessage
            {
                From = new MailAddress(_fromEmail, _fromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = isHtml
            };
            message.To.Add(to);

            await client.SendMailAsync(message);
            _logger.LogInformation("Email sent to {To}: {Subject}", to, subject);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {To}", to);
            return false;
        }
    }

    public async Task<bool> SendPasswordResetAsync(string email, string resetToken)
    {
        var subject = "Password Reset Request - Taylor Access";
        var body = $@"
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <h2>Password Reset</h2>
                <p>You requested a password reset for your Taylor Access account.</p>
                <p>Your reset code is: <strong>{resetToken}</strong></p>
                <p>This code expires in 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
            </body>
            </html>";
        return await SendEmailAsync(email, subject, body);
    }

    public async Task<bool> SendWelcomeEmailAsync(User user)
    {
        var subject = "Welcome to Taylor Access";
        var body = $@"
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <h2>Welcome to Taylor Access!</h2>
                <p>Hi {user.Name},</p>
                <p>Your account has been created successfully.</p>
                <p>You can now log in and start using the HR system.</p>
                <p>Best regards,<br>The Taylor Access Team</p>
            </body>
            </html>";
        return await SendEmailAsync(user.Email, subject, body);
    }
}
