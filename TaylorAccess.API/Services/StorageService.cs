namespace TaylorAccess.API.Services;

/// <summary>
/// Abstraction for file storage - can be implemented with local, Azure Blob, or S3
/// </summary>
public interface IStorageService
{
    Task<string> UploadAsync(Stream stream, string fileName, string contentType, string? folder = null);
    Task<Stream?> DownloadAsync(string path);
    Task<bool> DeleteAsync(string path);
    Task<bool> ExistsAsync(string path);
    string GetPublicUrl(string path);
}

/// <summary>
/// Local file system storage implementation
/// </summary>
public class LocalStorageService : IStorageService
{
    private readonly string _basePath;
    private readonly string _baseUrl;
    private readonly ILogger<LocalStorageService> _logger;

    public LocalStorageService(IConfiguration configuration, ILogger<LocalStorageService> logger)
    {
        _basePath = configuration["Storage:LocalPath"] ?? Path.Combine(Directory.GetCurrentDirectory(), "uploads");
        _baseUrl = configuration["Storage:BaseUrl"] ?? "/api/v1/files";
        _logger = logger;

        // Ensure directory exists
        Directory.CreateDirectory(_basePath);
    }

    public async Task<string> UploadAsync(Stream stream, string fileName, string contentType, string? folder = null)
    {
        var relativePath = folder != null ? Path.Combine(folder, fileName) : fileName;
        var fullPath = Path.Combine(_basePath, relativePath);
        
        // Ensure subdirectory exists
        var directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        using var fileStream = new FileStream(fullPath, FileMode.Create);
        await stream.CopyToAsync(fileStream);

        _logger.LogInformation($"File uploaded: {relativePath}");
        return relativePath;
    }

    public async Task<Stream?> DownloadAsync(string path)
    {
        var fullPath = Path.Combine(_basePath, path);
        
        if (!File.Exists(fullPath))
            return null;

        var memoryStream = new MemoryStream();
        using var fileStream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
        await fileStream.CopyToAsync(memoryStream);
        memoryStream.Position = 0;
        
        return memoryStream;
    }

    public Task<bool> DeleteAsync(string path)
    {
        var fullPath = Path.Combine(_basePath, path);
        
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
            _logger.LogInformation($"File deleted: {path}");
            return Task.FromResult(true);
        }

        return Task.FromResult(false);
    }

    public Task<bool> ExistsAsync(string path)
    {
        var fullPath = Path.Combine(_basePath, path);
        return Task.FromResult(File.Exists(fullPath));
    }

    public string GetPublicUrl(string path)
    {
        return $"{_baseUrl}/{path}";
    }
}

/// <summary>
/// In-memory storage for development/testing
/// </summary>
public class InMemoryStorageService : IStorageService
{
    private readonly Dictionary<string, (byte[] Data, string ContentType)> _files = new();
    private readonly ILogger<InMemoryStorageService> _logger;

    public InMemoryStorageService(ILogger<InMemoryStorageService> logger)
    {
        _logger = logger;
    }

    public async Task<string> UploadAsync(Stream stream, string fileName, string contentType, string? folder = null)
    {
        var path = folder != null ? $"{folder}/{fileName}" : fileName;
        
        using var memoryStream = new MemoryStream();
        await stream.CopyToAsync(memoryStream);
        _files[path] = (memoryStream.ToArray(), contentType);
        
        _logger.LogInformation($"File stored in memory: {path}");
        return path;
    }

    public Task<Stream?> DownloadAsync(string path)
    {
        if (_files.TryGetValue(path, out var file))
        {
            return Task.FromResult<Stream?>(new MemoryStream(file.Data));
        }
        return Task.FromResult<Stream?>(null);
    }

    public Task<bool> DeleteAsync(string path)
    {
        var removed = _files.Remove(path);
        if (removed)
            _logger.LogInformation($"File removed from memory: {path}");
        return Task.FromResult(removed);
    }

    public Task<bool> ExistsAsync(string path)
    {
        return Task.FromResult(_files.ContainsKey(path));
    }

    public string GetPublicUrl(string path)
    {
        return $"/api/v1/files/{path}";
    }
}

// Azure Blob Storage implementation (placeholder)
// public class AzureBlobStorageService : IStorageService
// {
//     // Implement using Azure.Storage.Blobs NuGet package
// }

// AWS S3 implementation (placeholder)
// public class S3StorageService : IStorageService
// {
//     // Implement using AWSSDK.S3 NuGet package
// }
