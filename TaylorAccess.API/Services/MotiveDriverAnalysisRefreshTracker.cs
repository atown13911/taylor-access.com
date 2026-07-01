using System.Collections.Concurrent;

namespace TaylorAccess.API.Services;

public static class MotiveDriverAnalysisRefreshTracker
{
    private static readonly ConcurrentDictionary<string, byte> Active = new(StringComparer.OrdinalIgnoreCase);

    public static bool TryStart(string key) => Active.TryAdd(key, 0);

    public static void Complete(string key) => Active.TryRemove(key, out _);

    public static bool IsActive(string key) => Active.ContainsKey(key);
}
