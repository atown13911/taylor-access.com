using System.Text.Json;

namespace TaylorAccess.API.Services;

public static class MotiveDriverAnalysisHelpers
{
    public static (DateTime Start, DateTime End, string StartIso, string EndIso) ParseRange(string? startDate, string? endDate)
    {
        var end = ParseDateOnly(endDate) ?? DateTime.UtcNow.Date;
        var start = ParseDateOnly(startDate) ?? end.AddDays(-6);
        if (start > end)
            (start, end) = (end, start);
        return (start.Date, end.Date, start.ToString("yyyy-MM-dd"), end.ToString("yyyy-MM-dd"));
    }

    public static JsonElement DeserializePayload(string? payloadJson)
    {
        var json = string.IsNullOrWhiteSpace(payloadJson) ? "[]" : payloadJson;
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch
        {
            return JsonSerializer.Deserialize<JsonElement>("[]");
        }
    }

    public static string BuildRefreshKey(int? organizationId, DateTime start, DateTime end)
        => $"{organizationId ?? 0}|{start:yyyy-MM-dd}|{end:yyyy-MM-dd}";

    private static DateTime? ParseDateOnly(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        if (DateTime.TryParse(input, out var dt)) return dt.Date;
        return null;
    }
}
