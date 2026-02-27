using System.Security.Cryptography;
using System.Text;

namespace TaylorAccess.API.Services;

public class EncryptionService
{
    private readonly byte[] _key;

    public EncryptionService(IConfiguration configuration)
    {
        var keyString = configuration["ENCRYPTION_KEY"] 
            ?? Environment.GetEnvironmentVariable("ENCRYPTION_KEY") 
            ?? "TaylorAccess-Default-Key-32!!!!!";
        _key = SHA256.HashData(Encoding.UTF8.GetBytes(keyString));
    }

    public string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return plainText;

        using var aes = Aes.Create();
        aes.Key = _key;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        var result = new byte[aes.IV.Length + cipherBytes.Length];
        aes.IV.CopyTo(result, 0);
        cipherBytes.CopyTo(result, aes.IV.Length);

        return "ENC:" + Convert.ToBase64String(result);
    }

    public string Decrypt(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return cipherText;
        if (!cipherText.StartsWith("ENC:")) return cipherText;

        try
        {
            var fullBytes = Convert.FromBase64String(cipherText[4..]);

            using var aes = Aes.Create();
            aes.Key = _key;

            var iv = fullBytes[..16];
            var cipher = fullBytes[16..];

            aes.IV = iv;
            using var decryptor = aes.CreateDecryptor();
            var plainBytes = decryptor.TransformFinalBlock(cipher, 0, cipher.Length);

            return Encoding.UTF8.GetString(plainBytes);
        }
        catch
        {
            return cipherText;
        }
    }
}
