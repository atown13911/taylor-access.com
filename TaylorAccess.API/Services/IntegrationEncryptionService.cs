using System.Security.Cryptography;
using System.Text;

namespace TaylorAccess.API.Services;

/// <summary>
/// Compatible with Taylor CRM integration credential encryption (INTEGRATION_ENCRYPTION_KEY).
/// </summary>
public class IntegrationEncryptionService
{
    private readonly byte[]? _keyBytes;
    private readonly bool _isConfigured;

    public IntegrationEncryptionService(IConfiguration configuration)
    {
        var keyString = configuration["INTEGRATION_ENCRYPTION_KEY"]
            ?? Environment.GetEnvironmentVariable("INTEGRATION_ENCRYPTION_KEY");
        if (!string.IsNullOrWhiteSpace(keyString))
        {
            _keyBytes = SHA256.HashData(Encoding.UTF8.GetBytes(keyString));
            _isConfigured = true;
        }
    }

    public bool IsConfigured => _isConfigured;

    public string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return plainText;
        EnsureConfigured();

        using var aes = Aes.Create();
        aes.Key = _keyBytes!;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var encryptedBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        var result = new byte[aes.IV.Length + encryptedBytes.Length];
        Array.Copy(aes.IV, 0, result, 0, aes.IV.Length);
        Array.Copy(encryptedBytes, 0, result, aes.IV.Length, encryptedBytes.Length);

        return Convert.ToBase64String(result);
    }

    public string Decrypt(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return cipherText;
        EnsureConfigured();

        var fullBytes = Convert.FromBase64String(cipherText);
        using var aes = Aes.Create();
        aes.Key = _keyBytes!;

        var iv = new byte[16];
        var encrypted = new byte[fullBytes.Length - 16];
        Array.Copy(fullBytes, 0, iv, 0, 16);
        Array.Copy(fullBytes, 16, encrypted, 0, encrypted.Length);
        aes.IV = iv;

        using var decryptor = aes.CreateDecryptor();
        var decryptedBytes = decryptor.TransformFinalBlock(encrypted, 0, encrypted.Length);
        return Encoding.UTF8.GetString(decryptedBytes);
    }

    private void EnsureConfigured()
    {
        if (!_isConfigured)
            throw new InvalidOperationException("INTEGRATION_ENCRYPTION_KEY is required to decrypt copied CRM credentials.");
    }
}
