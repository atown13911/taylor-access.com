using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaylorAccess.API.Data;
using TaylorAccess.API.Models;

namespace TaylorAccess.API.Services;

/// <summary>
/// Copies every domain user's Drive files into the Railway bucket.
/// Binary files are downloaded as-is; Google-native docs are exported
/// (Docs→docx, Sheets→xlsx, Slides→pptx, Drawings→png). Incremental:
/// unchanged files (same md5/modifiedTime) are skipped on re-runs.
/// </summary>
public sealed class GoogleDriveBackupWorker
{
    private static readonly SemaphoreSlim RunGate = new(1, 1);
    public static bool IsRunning { get; private set; }

    private static readonly Dictionary<string, (string ExportMime, string Extension)> GoogleExports = new()
    {
        ["application/vnd.google-apps.document"] = ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"),
        ["application/vnd.google-apps.spreadsheet"] = ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"),
        ["application/vnd.google-apps.presentation"] = ("application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"),
        ["application/vnd.google-apps.drawing"] = ("image/png", ".png")
    };

    private readonly TaylorAccessDbContext _db;
    private readonly GoogleDirectoryService _directory;
    private readonly BucketStorageService _bucket;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GoogleDriveBackupWorker> _logger;

    public GoogleDriveBackupWorker(
        TaylorAccessDbContext db,
        GoogleDirectoryService directory,
        BucketStorageService bucket,
        IHttpClientFactory httpClientFactory,
        ILogger<GoogleDriveBackupWorker> logger)
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
        var run = new GoogleDriveBackupRun { Trigger = trigger };
        try
        {
            if (!_bucket.IsConfigured)
                throw new InvalidOperationException("Bucket storage is not configured (BUCKET_* env vars)");

            _db.GoogleDriveBackupRuns.Add(run);
            await _db.SaveChangesAsync(ct);

            var emails = await GetAllUserEmailsAsync(ct);
            _logger.LogInformation("[Drive backup] Starting ({Trigger}): {Count} users.", trigger, emails.Count);

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
                    _logger.LogWarning(ex, "[Drive backup] User {Email} failed.", email);
                    run.FilesFailed++;
                }

                run.UsersProcessed++;
                await _db.SaveChangesAsync(ct);
            }

            // A pass that failed on everything shouldn't block the scheduler's retry.
            run.Status = run.FilesBackedUp == 0 && run.FilesFailed > 0 ? "failed" : "completed";
            run.FinishedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            _logger.LogInformation(
                "[Drive backup] Finished: {Users} users, {Backed} backed up, {Skipped} unchanged, {Failed} failed, {Bytes:N0} bytes.",
                run.UsersProcessed, run.FilesBackedUp, run.FilesSkipped, run.FilesFailed, run.BytesUploaded);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "[Drive backup] Run failed.");
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
            // Deleted users cannot be impersonated; archived/suspended still can.
            emails.AddRange(result.Users.Where(u => !u.Deleted).Select(u => u.Email));
        }
        return emails.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(e => e).ToList();
    }

    private async Task BackupUserAsync(string email, GoogleDriveBackupRun run, CancellationToken ct)
    {
        var (token, tokenError) = await _directory.AcquireUserTokenAsync(email, GoogleDirectoryService.DriveReadScope, ct);
        if (token == null)
        {
            _logger.LogWarning("[Drive backup] Token failed for {Email}: {Error}", email, tokenError);
            return;
        }

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(30);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        var known = await _db.GoogleDriveBackupFiles
            .Where(f => f.UserEmail == email)
            .ToDictionaryAsync(f => f.FileId, ct);

        string? pageToken = null;
        do
        {
            var url = "https://www.googleapis.com/drive/v3/files" +
                      "?q=" + Uri.EscapeDataString("'me' in owners and trashed=false") +
                      "&pageSize=1000&fields=" + Uri.EscapeDataString("nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)") +
                      (pageToken != null ? "&pageToken=" + Uri.EscapeDataString(pageToken) : "");

            using var res = await client.GetAsync(url, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("[Drive backup] File listing failed for {Email}: {Status} {Body}",
                    email, (int)res.StatusCode, body[..Math.Min(body.Length, 200)]);
                return;
            }

            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("files", out var files))
            {
                foreach (var file in files.EnumerateArray())
                {
                    ct.ThrowIfCancellationRequested();
                    await BackupFileAsync(client, email, file, known, run, ct);
                }
            }

            pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var np) ? np.GetString() : null;
        } while (!string.IsNullOrEmpty(pageToken));
    }

    private async Task BackupFileAsync(
        HttpClient client,
        string email,
        JsonElement file,
        Dictionary<string, GoogleDriveBackupFile> known,
        GoogleDriveBackupRun run,
        CancellationToken ct)
    {
        var fileId = file.GetProperty("id").GetString() ?? "";
        var name = file.TryGetProperty("name", out var n) ? n.GetString() ?? fileId : fileId;
        var mimeType = file.TryGetProperty("mimeType", out var m) ? m.GetString() ?? "" : "";
        var md5 = file.TryGetProperty("md5Checksum", out var h) ? h.GetString() : null;
        var modified = file.TryGetProperty("modifiedTime", out var mt) ? mt.GetString() : null;
        long size = 0;
        if (file.TryGetProperty("size", out var s) && s.ValueKind == JsonValueKind.String)
            long.TryParse(s.GetString(), out size);

        // Folders and non-exportable Google types (forms, sites, shortcuts, maps) have no content.
        if (mimeType == "application/vnd.google-apps.folder")
            return;
        var isGoogleNative = mimeType.StartsWith("application/vnd.google-apps.");
        if (isGoogleNative && !GoogleExports.ContainsKey(mimeType))
            return;

        // Skip unchanged files from previous runs.
        if (known.TryGetValue(fileId, out var existing) && existing.Status == "backedUp" &&
            ((md5 != null && existing.Md5 == md5) || (md5 == null && modified != null && existing.ModifiedTime == modified)))
        {
            run.FilesSkipped++;
            return;
        }

        var safeName = SanitizeName(name);
        string downloadUrl;
        string? contentType = mimeType;
        if (isGoogleNative)
        {
            var (exportMime, extension) = GoogleExports[mimeType];
            if (!safeName.EndsWith(extension, StringComparison.OrdinalIgnoreCase))
                safeName += extension;
            downloadUrl = $"https://www.googleapis.com/drive/v3/files/{Uri.EscapeDataString(fileId)}/export?mimeType={Uri.EscapeDataString(exportMime)}";
            contentType = exportMime;
        }
        else
        {
            downloadUrl = $"https://www.googleapis.com/drive/v3/files/{Uri.EscapeDataString(fileId)}?alt=media";
        }

        var s3Key = $"google-drive/{email}/{fileId}/{safeName}";
        var record = existing ?? new GoogleDriveBackupFile { UserEmail = email, FileId = fileId };

        try
        {
            using var res = await client.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!res.IsSuccessStatusCode)
            {
                var err = await res.Content.ReadAsStringAsync(ct);
                throw new InvalidOperationException($"HTTP {(int)res.StatusCode}: {err[..Math.Min(err.Length, 150)]}");
            }

            await using var stream = await res.Content.ReadAsStreamAsync(ct);
            var written = await _bucket.UploadAsync(s3Key, stream, contentType, ct);

            record.FileName = name.Length > 1024 ? name[..1024] : name;
            record.MimeType = mimeType.Length > 256 ? mimeType[..256] : mimeType;
            record.SizeBytes = written;
            record.Md5 = md5;
            record.ModifiedTime = modified;
            record.S3Key = s3Key.Length > 2048 ? s3Key[..2048] : s3Key;
            record.Status = "backedUp";
            record.Error = null;
            record.BackedUpAt = DateTime.UtcNow;

            run.FilesBackedUp++;
            run.BytesUploaded += written;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            record.FileName = name.Length > 1024 ? name[..1024] : name;
            record.MimeType = mimeType.Length > 256 ? mimeType[..256] : mimeType;
            record.S3Key = s3Key.Length > 2048 ? s3Key[..2048] : s3Key;
            record.Status = "failed";
            record.Error = ex.Message.Length > 500 ? ex.Message[..500] : ex.Message;
            record.BackedUpAt = DateTime.UtcNow;
            run.FilesFailed++;
            _logger.LogWarning("[Drive backup] {Email} file '{Name}' failed: {Error}", email, name, record.Error);
        }

        if (existing == null)
        {
            _db.GoogleDriveBackupFiles.Add(record);
            known[fileId] = record;
        }
        await _db.SaveChangesAsync(ct);
    }

    private static string SanitizeName(string name)
    {
        var cleaned = new string(name.Select(c => char.IsControl(c) || c is '\\' ? '_' : c).ToArray()).Trim();
        if (cleaned.Length == 0) cleaned = "unnamed";
        return cleaned.Length > 200 ? cleaned[..200] : cleaned;
    }
}
