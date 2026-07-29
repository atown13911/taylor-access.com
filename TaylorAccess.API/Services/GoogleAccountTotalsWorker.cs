using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

/// <summary>
/// Counts what Google currently holds for every domain account so the UI can
/// show "in bucket vs in Google". Gmail totals come from the Gmail profile
/// (one call per user, includes spam/trash — same coverage as the backup).
/// Drive totals enumerate files with the exact query and exclusions the Drive
/// backup uses (owned, not trashed, no folders, only exportable Google types),
/// so the two numbers are directly comparable.
/// </summary>
public sealed class GoogleAccountTotalsWorker
{
    private static readonly SemaphoreSlim RunGate = new(1, 1);
    public static bool IsRunning { get; private set; }
    public static GoogleBackupProgress? Progress { get; private set; }

    /// <summary>Mime types the Drive backup can actually store (mirrors GoogleDriveBackupWorker).</summary>
    private static readonly HashSet<string> ExportableGoogleTypes = new()
    {
        "application/vnd.google-apps.document",
        "application/vnd.google-apps.spreadsheet",
        "application/vnd.google-apps.presentation",
        "application/vnd.google-apps.drawing"
    };

    private readonly TaylorAccessDbContext _db;
    private readonly GoogleDirectoryService _directory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GoogleAccountTotalsWorker> _logger;

    public GoogleAccountTotalsWorker(
        TaylorAccessDbContext db,
        GoogleDirectoryService directory,
        IHttpClientFactory httpClientFactory,
        ILogger<GoogleAccountTotalsWorker> logger)
    {
        _db = db;
        _directory = directory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>Recounts every account. Returns false if a scan is already running.</summary>
    public async Task<bool> RunAsync(CancellationToken ct)
    {
        if (!await RunGate.WaitAsync(0, ct))
            return false;

        IsRunning = true;
        try
        {
            var emails = await GetAllUserEmailsAsync(ct);
            _logger.LogInformation("[Account totals] Counting Google data for {Count} accounts.", emails.Count);
            Progress = new GoogleBackupProgress { UsersTotal = emails.Count };

            var existing = await _db.GoogleAccountTotals.ToDictionaryAsync(
                t => t.Email.ToLower(), ct);

            foreach (var email in emails)
            {
                ct.ThrowIfCancellationRequested();
                if (Progress != null) Progress.CurrentUser = email;

                var (driveFiles, gmailMessages, error) = await CountUserAsync(email, ct);

                if (!existing.TryGetValue(email.ToLower(), out var row))
                {
                    row = new GoogleAccountTotal { Email = email };
                    _db.GoogleAccountTotals.Add(row);
                    existing[email.ToLower()] = row;
                }
                if (driveFiles != null) row.DriveFiles = driveFiles;
                if (gmailMessages != null) row.GmailMessages = gmailMessages;
                row.Error = error;
                row.FetchedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);

                if (Progress != null) Progress.UsersProcessed++;
            }

            _logger.LogInformation("[Account totals] Finished counting {Count} accounts.", emails.Count);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "[Account totals] Scan failed.");
            return true;
        }
        finally
        {
            IsRunning = false;
            Progress = null;
            RunGate.Release();
        }
    }

    private async Task<List<string>> GetAllUserEmailsAsync(CancellationToken ct)
    {
        var emails = new List<string>();
        foreach (var restrictedOnly in new[] { false, true })
        {
            var result = await _directory.ListDomainUsersAsync(restrictedOnly, ct);
            if (!result.Success)
                throw new InvalidOperationException($"User listing failed: {result.Error}");
            emails.AddRange(result.Users.Where(u => !u.Deleted).Select(u => u.Email));
        }
        return emails.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(e => e).ToList();
    }

    private async Task<(long? DriveFiles, long? GmailMessages, string? Error)> CountUserAsync(
        string email, CancellationToken ct)
    {
        long? gmail = null, drive = null;
        var errors = new List<string>();

        try
        {
            gmail = await CountGmailAsync(email, ct);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            errors.Add($"Gmail: {ex.Message}");
            _logger.LogWarning("[Account totals] Gmail count failed for {Email}: {Error}", email, ex.Message);
        }

        try
        {
            drive = await CountDriveAsync(email, ct);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            errors.Add($"Drive: {ex.Message}");
            _logger.LogWarning("[Account totals] Drive count failed for {Email}: {Error}", email, ex.Message);
        }

        var error = errors.Count > 0 ? string.Join(" · ", errors) : null;
        if (error is { Length: > 500 }) error = error[..500];
        return (drive, gmail, error);
    }

    private async Task<long> CountGmailAsync(string email, CancellationToken ct)
    {
        var client = await CreateUserClientAsync(email, GoogleDirectoryService.GmailReadScope, ct);
        var url = $"https://gmail.googleapis.com/gmail/v1/users/{Uri.EscapeDataString(email)}/profile";
        using var res = await GetWithRetryAsync(client, url, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"HTTP {(int)res.StatusCode}: {body[..Math.Min(body.Length, 150)]}");

        using var doc = JsonDocument.Parse(body);
        var value = doc.RootElement.GetProperty("messagesTotal");
        return value.ValueKind == JsonValueKind.String && long.TryParse(value.GetString(), out var parsed)
            ? parsed
            : value.GetInt64();
    }

    private async Task<long> CountDriveAsync(string email, CancellationToken ct)
    {
        var client = await CreateUserClientAsync(email, GoogleDirectoryService.DriveReadScope, ct);

        long count = 0;
        string? pageToken = null;
        do
        {
            var url = "https://www.googleapis.com/drive/v3/files" +
                      "?q=" + Uri.EscapeDataString("'me' in owners and trashed=false") +
                      "&pageSize=1000&fields=" + Uri.EscapeDataString("nextPageToken,files(mimeType)") +
                      (pageToken != null ? "&pageToken=" + Uri.EscapeDataString(pageToken) : "");

            using var res = await GetWithRetryAsync(client, url, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
                throw new InvalidOperationException($"HTTP {(int)res.StatusCode}: {body[..Math.Min(body.Length, 150)]}");

            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("files", out var files))
            {
                foreach (var file in files.EnumerateArray())
                {
                    var mimeType = file.TryGetProperty("mimeType", out var m) ? m.GetString() ?? "" : "";
                    if (mimeType == "application/vnd.google-apps.folder")
                        continue;
                    if (mimeType.StartsWith("application/vnd.google-apps.") && !ExportableGoogleTypes.Contains(mimeType))
                        continue;
                    count++;
                }
            }

            pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
        } while (!string.IsNullOrEmpty(pageToken));

        return count;
    }

    private async Task<HttpClient> CreateUserClientAsync(string email, string scope, CancellationToken ct)
    {
        var (token, tokenError) = await _directory.AcquireUserTokenAsync(email, scope, ct);
        if (token == null)
            throw new InvalidOperationException(tokenError ?? "token acquisition failed");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(2);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    /// <summary>GET with a single backoff retry on 429/5xx.</summary>
    private static async Task<HttpResponseMessage> GetWithRetryAsync(
        HttpClient client, string url, CancellationToken ct)
    {
        var res = await client.GetAsync(url, ct);
        if ((int)res.StatusCode == 429 || (int)res.StatusCode >= 500)
        {
            res.Dispose();
            await Task.Delay(TimeSpan.FromSeconds(3), ct);
            res = await client.GetAsync(url, ct);
        }
        return res;
    }
}
