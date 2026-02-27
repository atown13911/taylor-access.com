using System.Security.Cryptography;
using System.Text;

namespace TaylorAccess.API.Services;

/// <summary>
/// Time-based One-Time Password (TOTP) service for 2FA
/// </summary>
public interface ITotpService
{
    string GenerateSecretKey();
    string GenerateQrCodeUri(string email, string secretKey, string issuer = "Taylor Access");
    bool ValidateCode(string secretKey, string code);
    string GenerateCode(string secretKey);
    List<string> GenerateBackupCodes(int count = 10);
}

public class TotpService : ITotpService
{
    private const int CodeDigits = 6;
    private const int TimeStepSeconds = 30;

    public string GenerateSecretKey()
    {
        var bytes = new byte[20]; // 160 bits
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Base32Encode(bytes);
    }

    public string GenerateQrCodeUri(string email, string secretKey, string issuer = "Taylor Access")
    {
        var encodedIssuer = Uri.EscapeDataString(issuer);
        var encodedEmail = Uri.EscapeDataString(email);
        return $"otpauth://totp/{encodedIssuer}:{encodedEmail}?secret={secretKey}&issuer={encodedIssuer}&digits={CodeDigits}&period={TimeStepSeconds}";
    }

    public bool ValidateCode(string secretKey, string code)
    {
        if (string.IsNullOrEmpty(code) || code.Length != CodeDigits)
            return false;

        // Check current time step and adjacent ones (for clock skew)
        var timeSteps = new[] { 0, -1, 1 };
        foreach (var offset in timeSteps)
        {
            var expectedCode = GenerateCodeAtTimeStep(secretKey, GetCurrentTimeStep() + offset);
            if (expectedCode == code)
                return true;
        }
        return false;
    }

    public string GenerateCode(string secretKey)
    {
        return GenerateCodeAtTimeStep(secretKey, GetCurrentTimeStep());
    }

    public List<string> GenerateBackupCodes(int count = 10)
    {
        var codes = new List<string>();
        using var rng = RandomNumberGenerator.Create();
        
        for (int i = 0; i < count; i++)
        {
            var bytes = new byte[4];
            rng.GetBytes(bytes);
            var code = BitConverter.ToUInt32(bytes, 0) % 100000000;
            codes.Add(code.ToString("D8")); // 8-digit codes
        }
        
        return codes;
    }

    private long GetCurrentTimeStep()
    {
        var unixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        return unixTimestamp / TimeStepSeconds;
    }

    private string GenerateCodeAtTimeStep(string secretKey, long timeStep)
    {
        var keyBytes = Base32Decode(secretKey);
        var timeBytes = BitConverter.GetBytes(timeStep);
        
        // Ensure big-endian
        if (BitConverter.IsLittleEndian)
            Array.Reverse(timeBytes);

        // Pad to 8 bytes
        var data = new byte[8];
        Array.Copy(timeBytes, 0, data, 8 - timeBytes.Length, timeBytes.Length);

        using var hmac = new HMACSHA1(keyBytes);
        var hash = hmac.ComputeHash(data);

        // Dynamic truncation
        var offset = hash[^1] & 0x0F;
        var binary = 
            ((hash[offset] & 0x7F) << 24) |
            ((hash[offset + 1] & 0xFF) << 16) |
            ((hash[offset + 2] & 0xFF) << 8) |
            (hash[offset + 3] & 0xFF);

        var otp = binary % (int)Math.Pow(10, CodeDigits);
        return otp.ToString($"D{CodeDigits}");
    }

    private static string Base32Encode(byte[] data)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var result = new StringBuilder();
        
        for (int i = 0; i < data.Length; i += 5)
        {
            var byteCount = Math.Min(5, data.Length - i);
            ulong buffer = 0;
            
            for (int j = 0; j < byteCount; j++)
                buffer = (buffer << 8) | data[i + j];
            
            buffer <<= (5 - byteCount) * 8;
            
            var charCount = (byteCount * 8 + 4) / 5;
            for (int j = 0; j < charCount; j++)
            {
                var index = (int)(buffer >> (35 - j * 5)) & 0x1F;
                result.Append(alphabet[index]);
            }
        }
        
        return result.ToString();
    }

    private static byte[] Base32Decode(string encoded)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        encoded = encoded.ToUpperInvariant().TrimEnd('=');
        
        var result = new List<byte>();
        var buffer = 0;
        var bitsInBuffer = 0;
        
        foreach (var c in encoded)
        {
            var index = alphabet.IndexOf(c);
            if (index < 0) continue;
            
            buffer = (buffer << 5) | index;
            bitsInBuffer += 5;
            
            if (bitsInBuffer >= 8)
            {
                bitsInBuffer -= 8;
                result.Add((byte)(buffer >> bitsInBuffer));
            }
        }
        
        return result.ToArray();
    }
}
