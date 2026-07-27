using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

/// <summary>
/// Copies every domain user's Gmail messages into the Railway bucket as raw .eml
/// files (full headers, body, and attachments). Full fidelity: includes spam and
/// trash. Messages are immutable, so each is fetched exactly once; re-runs only
/// pick up mail that arrived since the last pass.
/// </summary>
public sealed class GoogleGmailBackupWorker
{
    private static readonly SemaphoreSlim RunGate = new(1, 1);
    public static bool IsRunning { get; private set; }

    private readonly TaylorAccessDbContext _db;
    private readonly GoogleDirectoryService _directory;
    private readonly BucketStorageService _bucket;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GoogleGmailBackupWorker> _logger;

    public GoogleGmailBackupWorker(
        TaylorAccessDbContext db,
        GoogleDirectoryService directory,
        BucketStorageService bucket,
        IHttpClientFactory httpClientFactory,
        ILogger<GoogleGmailBackupWorker> logger)
    {
        _db = db;
        _directory = directory;
        _bucket = bucket;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>Runs a full backup pass. Returns false if a run is already in progress.</summary>
    public async Task<bool> RunAsync(string trigger, CancellationToken ct)
    {
        if (!await RunGate.WaitAsync(0, ct))
            return false;

        IsRunning = true;
        var run = new GoogleGmailBackupRun { Trigger = trigger };
        try
        {
            if (!_bucket.IsConfigured)
                throw new InvalidOperationException("Bucket storage is not configured (BUCKET_* env vars)");

            _db.GoogleGmailBackupRuns.Add(run);
            await _db.SaveChangesAsync(ct);

            var emails = await GetAllUserEmailsAsync(ct);
            _logger.LogInformation("[Gmail backup] Starting ({Trigger}): {Count} users.", trigger, emails.Count);

            foreach (var email in emails)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    await BackupUserAsync(email, run, ct);
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[Gmail backup] User {Email} failed.", email);
                    run.MessagesFailed++;
                }

                run.UsersProcessed++;
                await _db.SaveChangesAsync(ct);
            }

            // A pass that failed on everything shouldn't block the scheduler's retry.
            run.Status = run.MessagesBackedUp == 0 && run.MessagesFailed > 0 ? "failed" : "completed";
            run.FinishedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            _logger.LogInformation(
                "[Gmail backup] Finished: {Users} users, {Backed} backed up, {Skipped} already stored, {Failed} failed, {Bytes:N0} bytes.",
                run.UsersProcessed, run.MessagesBackedUp, run.MessagesSkipped, run.MessagesFailed, run.BytesUploaded);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "[Gmail backup] Run failed.");
            run.Status = "failed";
            run.Error = ex.Message.Length > 1000 ? ex.Message[..1000] : ex.Message;
            run.FinishedAt = DateTime.UtcNow;
            try { await _db.SaveChangesAsync(CancellationToken.None); } catch { /* run row may not exist */ }
            return true;
        }
        finally
        {
            IsRunning = false;
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

    private async Task BackupUserAsync(string email, GoogleGmailBackupRun run, CancellationToken ct)
    {
        var (token, tokenError) = await _directory.AcquireUserTokenAsync(email, GoogleDirectoryService.GmailReadScope, ct);
        if (token == null)
        {
            _logger.LogWarning("[Gmail backup] Token failed for {Email}: {Error}", email, tokenError);
            return;
        }

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(10);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        var baseUrl = $"https://gmail.googleapis.com/gmail/v1/users/{Uri.EscapeDataString(email)}";
        string? pageToken = null;
        var pendingSaves = 0;

        do
        {
            var listUrl = $"{baseUrl}/messages?maxResults=500&includeSpamTrash=true" +
                          (pageToken != null ? "&pageToken=" + Uri.EscapeDataString(pageToken) : "");

            using var res = await GetWithRetryAsync(client, listUrl, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("[Gmail backup] Message listing failed for {Email}: {Status} {Body}",
                    email, (int)res.StatusCode, body[..Math.Min(body.Length, 200)]);
                return;
            }

            List<string> pageIds;
            using (var doc = JsonDocument.Parse(body))
            {
                pageIds = doc.RootElement.TryGetProperty("messages", out var messages)
                    ? messages.EnumerateArray()
                        .Select(m => m.GetProperty("id").GetString() ?? "")
                        .Where(id => id.Length > 0)
                        .ToList()
                    : new List<string>();
                pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
            }

            if (pageIds.Count == 0)
                continue;

            // One bounded query per page instead of loading a whole mailbox's IDs into memory.
            var existing = await _db.GoogleGmailBackupMessages
                .Where(m => m.UserEmail == email && pageIds.Contains(m.MessageId))
                .ToDictionaryAsync(m => m.MessageId, ct);

            foreach (var messageId in pageIds)
            {
                ct.ThrowIfCancellationRequested();

                if (existing.TryGetValue(messageId, out var record) && record.Status == "backedUp")
                {
                    run.MessagesSkipped++;
                    continue;
                }

                await BackupMessageAsync(client, baseUrl, email, messageId, record, run, ct);
                pendingSaves++;
                if (pendingSaves >= 25)
                {
                    await _db.SaveChangesAsync(ct);
                    pendingSaves = 0;
                }
            }

            await _db.SaveChangesAsync(ct);
            pendingSaves = 0;
        } while (!string.IsNullOrEmpty(pageToken));
    }

    private async Task BackupMessageAsync(
        HttpClient client,
        string baseUrl,
        string email,
        string messageId,
        GoogleGmailBackupMessage? existing,
        GoogleGmailBackupRun run,
        CancellationToken ct)
    {
        var s3Key = $"gmail/{email}/{messageId}.eml";
        var record = existing ?? new GoogleGmailBackupMessage { UserEmail = email, MessageId = messageId };

        try
        {
            var url = $"{baseUrl}/messages/{Uri.EscapeDataString(messageId)}?format=raw";
            using var res = await GetWithRetryAsync(client, url, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
                throw new InvalidOperationException($"HTTP {(int)res.StatusCode}: {body[..Math.Min(body.Length, 150)]}");

            byte[] rawBytes;
            using (var doc = JsonDocument.Parse(body))
            {
                var raw = doc.RootElement.GetProperty("raw").GetString()
                    ?? throw new InvalidOperationException("No raw content in message response");
                rawBytes = DecodeBase64Url(raw);

                record.ThreadId = doc.RootElement.TryGetProperty("threadId", out var t) ? t.GetString() : null;
                if (doc.RootElement.TryGetProperty("internalDate", out var d) &&
                    long.TryParse(d.GetString(), out var epochMs))
                    record.InternalDate = DateTimeOffset.FromUnixTimeMilliseconds(epochMs).UtcDateTime;
            }

            await using var stream = new MemoryStream(rawBytes, writable: false);
            await _bucket.UploadAsync(s3Key, stream, "message/rfc822", ct);

            record.SizeBytes = rawBytes.Length;
            record.S3Key = s3Key;
            record.Status = "backedUp";
            record.Error = null;
            record.BackedUpAt = DateTime.UtcNow;

            run.MessagesBackedUp++;
            run.BytesUploaded += rawBytes.Length;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            record.S3Key = s3Key;
            record.Status = "failed";
            record.Error = ex.Message.Length > 500 ? ex.Message[..500] : ex.Message;
            record.BackedUpAt = DateTime.UtcNow;
            run.MessagesFailed++;
            _logger.LogWarning("[Gmail backup] {Email} message {Id} failed: {Error}", email, messageId, record.Error);
        }

        if (existing == null)
            _db.GoogleGmailBackupMessages.Add(record);
    }

    /// <summary>GET with a single backoff retry on 429/5xx (Gmail per-user rate limits).</summary>
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

    private static byte[] DecodeBase64Url(string input)
    {
        var s = input.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }
        return Convert.FromBase64String(s);
    }
}
