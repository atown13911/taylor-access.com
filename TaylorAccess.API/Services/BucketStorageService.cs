using Amazon.S3;
using Amazon.S3.Transfer;

namespace TaylorAccess.API.Services;

/// <summary>
/// S3-compatible access to the Railway project bucket. Credentials come from the
/// BUCKET_* environment variables set on the service (endpoint, name, keys).
/// </summary>
public sealed class BucketStorageService : IDisposable
{
    private readonly IAmazonS3? _client;
    private readonly string _bucketName = string.Empty;
    private readonly ILogger<BucketStorageService> _logger;

    public BucketStorageService(ILogger<BucketStorageService> logger)
    {
        _logger = logger;

        var endpoint = Environment.GetEnvironmentVariable("BUCKET_ENDPOINT");
        var name = Environment.GetEnvironmentVariable("BUCKET_NAME");
        var accessKey = Environment.GetEnvironmentVariable("BUCKET_ACCESS_KEY_ID");
        var secretKey = Environment.GetEnvironmentVariable("BUCKET_SECRET_ACCESS_KEY");

        if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(name) ||
            string.IsNullOrWhiteSpace(accessKey) || string.IsNullOrWhiteSpace(secretKey))
        {
            _logger.LogWarning("Bucket storage not configured (BUCKET_* env vars missing).");
            return;
        }

        _bucketName = name;
        _client = new AmazonS3Client(accessKey, secretKey, new AmazonS3Config
        {
            ServiceURL = endpoint,
            ForcePathStyle = false
        });
    }

    public bool IsConfigured => _client != null;

    /// <summary>Streams content into the bucket under the given key. Returns bytes written.</summary>
    public async Task<long> UploadAsync(
        string key, Stream content, string? contentType, CancellationToken cancellationToken = default)
    {
        if (_client == null)
            throw new InvalidOperationException("Bucket storage is not configured");

        using var transfer = new TransferUtility(_client);

        if (content.CanSeek)
        {
            var written = content.Length;
            await transfer.UploadAsync(new TransferUtilityUploadRequest
            {
                BucketName = _bucketName,
                Key = key,
                InputStream = content,
                ContentType = contentType,
                AutoCloseStream = false
            }, cancellationToken);
            return written;
        }

        // Spool non-seekable streams (HTTP downloads) to a temp file so multi-GB
        // files never sit in memory and the SDK gets a known length.
        var tempPath = Path.GetTempFileName();
        try
        {
            long written;
            await using (var temp = new FileStream(tempPath, FileMode.Create, FileAccess.ReadWrite, FileShare.None, 81920, useAsync: true))
            {
                await content.CopyToAsync(temp, cancellationToken);
                written = temp.Length;
                temp.Position = 0;
                await transfer.UploadAsync(new TransferUtilityUploadRequest
                {
                    BucketName = _bucketName,
                    Key = key,
                    InputStream = temp,
                    ContentType = contentType,
                    AutoCloseStream = false
                }, cancellationToken);
            }
            return written;
        }
        finally
        {
            try { File.Delete(tempPath); } catch { /* best effort */ }
        }
    }

    public void Dispose() => _client?.Dispose();
}
