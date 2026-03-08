import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  status?: string;
  organizationId?: string;
  organizationName?: string;
  apiKey?: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
  jobTitle?: string;
  department?: string;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface Organization {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private readonly TOKEN_KEY = 'vantac_token';
  private readonly USER_KEY = 'vantac_user';
  private readonly ORG_KEY = 'vantac_org';
  private readonly PERMS_KEY = 'vantac_permissions';

  private readonly apiUrl = environment.apiUrl;
  private readonly portalApiUrl = environment.portalApiUrl;

  currentUser = signal<User | null>(null);
  currentOrganization = signal<Organization | null>(null);
  isAuthenticated = signal<boolean>(false);
  permissions = signal<string[]>([]);

  private onLogoutCallback: ((reason: string) => void) | null = null;

  constructor() {
    this.hydrateFromStorage();
  }

  private hydrateFromStorage(): void {
    const token = this.getToken();
    if (token && !this.isTokenExpired()) {
      this.currentUser.set(this.getStored<User>(this.USER_KEY));
      this.currentOrganization.set(this.getStored<Organization>(this.ORG_KEY));
      this.permissions.set(this.getStored<string[]>(this.PERMS_KEY) ?? []);
      this.isAuthenticated.set(true);
    } else if (token) {
      this.clearStorage();
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private isTokenExpired(): boolean {
    const token = this.getToken();
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return (payload.exp * 1000) < Date.now();
    } catch {
      return true;
    }
  }

  private getStored<T>(key: string): T | null {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    try { return JSON.parse(stored); } catch { return null; }
  }

  private setStoredUser(user: User): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  updateUserAvatar(avatarUrl: string): void {
    const user = this.currentUser();
    if (user) {
      this.setStoredUser({ ...user, avatarUrl });
    }
  }

  private setStoredOrganization(org: Organization): void {
    localStorage.setItem(this.ORG_KEY, JSON.stringify(org));
    this.currentOrganization.set(org);
  }

  private extractPermissionsFromToken(): string[] {
    const token = this.getToken();
    if (!token) return [];
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const perms = typeof payload.permissions === 'string'
        ? JSON.parse(payload.permissions)
        : payload.permissions;
      return Array.isArray(perms) ? perms : [];
    } catch {
      return [];
    }
  }

  registerLogoutCallback(cb: (reason: string) => void): void {
    this.onLogoutCallback = cb;
  }

  logout(reason: string = 'manual'): void {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a50aa21d-15aa-4850-852f-91d136237950',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.service.ts:logout',message:'LOGOUT called',data:{reason:reason,stack:new Error().stack?.split('\n').slice(0,6)},timestamp:Date.now(),hypothesisId:'F,G,H'}),keepalive:true}).catch(()=>{});
    // #endregion
    if (this.onLogoutCallback) {
      try { this.onLogoutCallback(reason); } catch {}
    }
    this.clearStorage();
    this.currentUser.set(null);
    this.currentOrganization.set(null);
    this.isAuthenticated.set(false);
    this.permissions.set([]);
    sessionStorage.removeItem('access_token_validated');
    window.location.href = environment.portalUrl;
  }

  private clearStorage(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.ORG_KEY);
    localStorage.removeItem(this.PERMS_KEY);
    localStorage.removeItem('sso_refresh_token');
  }

  getCurrentUser(): Observable<{ data: User }> {
    return this.http.get<{ data: User }>(`${this.apiUrl}/api/v1/auth/me`).pipe(
      tap(response => { if (response.data) this.setStoredUser(response.data); })
    );
  }

  checkAuth(): Observable<boolean> {
    if (!this.getToken() || this.isTokenExpired()) {
      this.isAuthenticated.set(false);
      return of(false);
    }

    return this.getCurrentUser().pipe(
      map(response => {
        if (response?.data) {
          this.isAuthenticated.set(true);
          return true;
        }
        return false;
      }),
      catchError(() => {
        this.logout('session_invalid');
        return of(false);
      })
    );
  }

  hasRole(role: string): boolean {
    return this.currentUser()?.role === role;
  }

  isAdmin(): boolean {
    return this.hasRole('admin');
  }

  getAuthHeader(): { Authorization: string } | Record<string, never> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
