import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * UserSettingsService - Persists user settings to the database via API
 * with localStorage as a cache layer for instant reads.
 * 
 * Usage:
 *   this.userSettings.set('my_key', { data: 'value' }).subscribe();
 *   this.userSettings.get('my_key').subscribe(data => ...);
 *   const cached = this.userSettings.getSync('my_key'); // instant, from localStorage
 */
@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/api/v1/user-settings`;
  private prefix = 'us_'; // localStorage prefix to avoid collisions

  /**
   * Get a setting from API, falls back to localStorage
   */
  get(key: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${key}`).pipe(
      map(res => {
        const value = res?.value;
        try {
          const parsed = JSON.parse(value);
          // Cache in localStorage
          localStorage.setItem(this.prefix + key, value);
          return parsed;
        } catch {
          localStorage.setItem(this.prefix + key, value);
          return value;
        }
      }),
      catchError(() => {
        // Fallback to localStorage
        const cached = localStorage.getItem(this.prefix + key);
        if (cached) {
          try { return of(JSON.parse(cached)); } catch { return of(cached); }
        }
        // Also check legacy key (without prefix) for migration
        const legacy = localStorage.getItem(key);
        if (legacy) {
          try { return of(JSON.parse(legacy)); } catch { return of(legacy); }
        }
        return of(null);
      })
    );
  }

  /**
   * Synchronous read from localStorage cache (instant, no API call)
   */
  getSync(key: string): any {
    const cached = localStorage.getItem(this.prefix + key);
    if (cached) {
      try { return JSON.parse(cached); } catch { return cached; }
    }
    // Check legacy key
    const legacy = localStorage.getItem(key);
    if (legacy) {
      try { return JSON.parse(legacy); } catch { return legacy; }
    }
    return null;
  }

  /**
   * Save a setting to API and localStorage cache
   */
  set(key: string, value: any): Observable<any> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    // Write to localStorage immediately for instant reads
    localStorage.setItem(this.prefix + key, serialized);
    // Remove legacy key if it exists
    if (localStorage.getItem(key)) localStorage.removeItem(key);

    return this.http.put<any>(`${this.baseUrl}/${key}`, { value: serialized }).pipe(
      catchError(err => {
        // API failed but localStorage is updated - data not lost
        console.warn(`[UserSettings] Failed to save '${key}' to API, cached locally`, err);
        return of({ key, saved: true, local: true });
      })
    );
  }

  /**
   * Delete a setting from API and localStorage
   */
  delete(key: string): Observable<any> {
    localStorage.removeItem(this.prefix + key);
    localStorage.removeItem(key); // Remove legacy too

    return this.http.delete<any>(`${this.baseUrl}/${key}`).pipe(
      catchError(() => of({ deleted: true, local: true }))
    );
  }

  /**
   * Bulk save multiple settings at once
   */
  bulkSet(items: { key: string; value: any }[]): Observable<any> {
    const payload = items.map(item => ({
      key: item.key,
      value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value)
    }));

    // Cache all locally
    payload.forEach(item => {
      localStorage.setItem(this.prefix + item.key, item.value);
    });

    return this.http.post<any>(`${this.baseUrl}/bulk`, payload).pipe(
      catchError(() => of({ saved: payload.length, local: true }))
    );
  }

  /**
   * Load all settings for current user (for initial hydration)
   */
  loadAll(): Observable<any[]> {
    return this.http.get<any>(`${this.baseUrl}`).pipe(
      map(res => {
        const settings = res?.data || [];
        // Cache all in localStorage
        settings.forEach((s: any) => {
          localStorage.setItem(this.prefix + s.key, s.value);
        });
        return settings;
      }),
      catchError(() => of([]))
    );
  }
}
