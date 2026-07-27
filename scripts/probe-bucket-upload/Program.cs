// Probe: upload a small object to the Railway bucket with the same SDK the API uses.
// Tests default config vs checksum-when-required to pinpoint the Content-Encoding failure.
// Run: railway run --service taylor-access.com dotnet run --project scripts/probe-bucket-upload
using System.Text;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Transfer;

var endpoint = Environment.GetEnvironmentVariable("BUCKET_ENDPOINT")!;
var bucketName = Environment.GetEnvironmentVariable("BUCKET_NAME")!;
var accessKey = Environment.GetEnvironmentVariable("BUCKET_ACCESS_KEY_ID")!;
var secretKey = Environment.GetEnvironmentVariable("BUCKET_SECRET_ACCESS_KEY")!;

async Task Try(string label, AmazonS3Config config)
{
    try
    {
        using var client = new AmazonS3Client(accessKey, secretKey, config);
        using var transfer = new TransferUtility(client);
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("probe " + DateTime.UtcNow.ToString("O")));
        await transfer.UploadAsync(new TransferUtilityUploadRequest
        {
            BucketName = bucketName,
            Key = $"probe/{label}.txt",
            InputStream = stream,
            ContentType = "text/plain",
            AutoCloseStream = false
        });
        Console.WriteLine($"{label}: OK");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"{label}: FAILED — {ex.GetType().Name}: {ex.Message}");
    }
}

async Task TryPut(string label, AmazonS3Config config, bool useChunkEncoding, bool disablePayloadSigning)
{
    try
    {
        using var client = new AmazonS3Client(accessKey, secretKey, config);
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("probe " + DateTime.UtcNow.ToString("O")));
        await client.PutObjectAsync(new Amazon.S3.Model.PutObjectRequest
        {
            BucketName = bucketName,
            Key = $"probe/{label}.txt",
            InputStream = stream,
            ContentType = "text/plain",
            UseChunkEncoding = useChunkEncoding,
            DisablePayloadSigning = disablePayloadSigning,
            AutoCloseStream = false
        });
        Console.WriteLine($"{label}: OK");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"{label}: FAILED — {ex.GetType().Name}: {ex.Message}");
    }
}

var whenRequired = new AmazonS3Config
{
    ServiceURL = endpoint,
    ForcePathStyle = false,
    RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
    ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
};

await TryPut("put-nochunk", whenRequired, useChunkEncoding: false, disablePayloadSigning: false);
await TryPut("put-nochunk-nosign", whenRequired, useChunkEncoding: false, disablePayloadSigning: true);
await TryPut("put-default-chunk", whenRequired, useChunkEncoding: true, disablePayloadSigning: false);
