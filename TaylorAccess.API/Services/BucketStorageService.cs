using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

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
        // Railway's storage rejects aws-chunked uploads, so checksums stay off
        // and every request uses UseChunkEncoding = false.
        _client = new AmazonS3Client(accessKey, secretKey, new AmazonS3Config
        {
            ServiceURL = endpoint,
            ForcePathStyle = false,
            RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
        });
    }

    public bool IsConfigured => _client != null;

    /// <summary>Streams content into the bucket under the given key. Returns bytes written.</summary>
    public async Task<long> UploadAsync(
        string key, Stream content, string? contentType, CancellationToken cancellationToken = default)
    {
        if (_client == null)
            throw new InvalidOperationException("Bucket storage is not configured");

        if (content.CanSeek)
        {
            await UploadCoreAsync(key, content, contentType, cancellationToken);
            return content.Length;
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
                await UploadCoreAsync(key, temp, contentType, cancellationToken);
            }
            return written;
        }
        finally
        {
            try { File.Delete(tempPath); } catch { /* best effort */ }
        }
    }

    private async Task UploadCoreAsync(string key, Stream seekable, string? contentType, CancellationToken ct)
    {
        const long multipartThreshold = 4L * 1024 * 1024 * 1024; // single PUT caps at 5 GB
        const long partSize = 256L * 1024 * 1024;

        if (seekable.Length <= multipartThreshold)
        {
            await _client!.PutObjectAsync(new PutObjectRequest
            {
                BucketName = _bucketName,
                Key = key,
                InputStream = seekable,
                ContentType = contentType,
                UseChunkEncoding = false,
                AutoCloseStream = false
            }, ct);
            return;
        }

        var init = await _client!.InitiateMultipartUploadAsync(new InitiateMultipartUploadRequest
        {
            BucketName = _bucketName,
            Key = key,
            ContentType = contentType
        }, ct);

        try
        {
            var etags = new List<PartETag>();
            var partNumber = 1;
            long position = 0;
            while (position < seekable.Length)
            {
                var size = Math.Min(partSize, seekable.Length - position);
                var part = await _client.UploadPartAsync(new UploadPartRequest
                {
                    BucketName = _bucketName,
                    Key = key,
                    UploadId = init.UploadId,
                    PartNumber = partNumber,
                    InputStream = seekable,
                    PartSize = size,
                    UseChunkEncoding = false
                }, ct);
                etags.Add(new PartETag(partNumber, part.ETag));
                position += size;
                partNumber++;
            }

            await _client.CompleteMultipartUploadAsync(new CompleteMultipartUploadRequest
            {
                BucketName = _bucketName,
                Key = key,
                UploadId = init.UploadId,
                PartETags = etags
            }, ct);
        }
        catch
        {
            try
            {
                await _client.AbortMultipartUploadAsync(new AbortMultipartUploadRequest
                {
                    BucketName = _bucketName,
                    Key = key,
                    UploadId = init.UploadId
                }, CancellationToken.None);
            }
            catch { /* best effort */ }
            throw;
        }
    }

    public void Dispose() => _client?.Dispose();
}
