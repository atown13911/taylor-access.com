using System.Text.Json;
using System.Text.Json.Serialization;

namespace TaylorAccess.API.Converters;

public class DateTimeUtcConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var dateString = reader.GetString();
            if (string.IsNullOrEmpty(dateString))
                return default;

            if (DateTime.TryParse(dateString, out var dateTime))
            {
                return DateTime.SpecifyKind(dateTime.ToUniversalTime(), DateTimeKind.Utc);
            }
        }
        
        return reader.GetDateTime();
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var utcValue = value.Kind == DateTimeKind.Utc 
            ? value 
            : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        
        writer.WriteStringValue(utcValue.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
    }
}

public class NullableDateTimeUtcConverter : JsonConverter<DateTime?>
{
    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
            return null;

        if (reader.TokenType == JsonTokenType.String)
        {
            var dateString = reader.GetString();
            if (string.IsNullOrEmpty(dateString))
                return null;

            if (DateTime.TryParse(dateString, out var dateTime))
            {
                return DateTime.SpecifyKind(dateTime.ToUniversalTime(), DateTimeKind.Utc);
            }
        }

        return reader.GetDateTime();
    }

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (!value.HasValue)
        {
            writer.WriteNullValue();
            return;
        }

        var utcValue = value.Value.Kind == DateTimeKind.Utc 
            ? value.Value 
            : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
        
        writer.WriteStringValue(utcValue.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
    }
}
