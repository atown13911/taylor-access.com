import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
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

export interface AuthResponse {
  token: string;
  user: User;
  organization?: Organization;
  permissions?: string[];
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
  companyName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly TOKEN_KEY = 'vantac_token';
  private readonly USER_KEY = 'vantac_user';
  private readonly ORG_KEY = 'vantac_org';
  private readonly PERMS_KEY = 'vantac_permissions';

  private readonly authUrl = `${environment.apiUrl}${environment.api.auth}`;
  private readonly passwordUrl = `${environment.apiUrl}/api/v1/password`;

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

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.authUrl}/register`, request).pipe(
      tap(response => this.handleAuthResponse(response)),
      catchError(error => { console.error('Registration failed:', error); throw error; })
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.authUrl}/login`, { email, password }).pipe(
      tap(response => this.handleAuthResponse(response)),
      catchError(error => { console.error('Login failed:', error); throw error; })
    );
  }

  private handleAuthResponse(response: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, response.token);
    this.setStoredUser(response.user);
    if (response.organization) {
      this.setStoredOrganization(response.organization);
    }
    const perms = response.permissions ?? this.extractPermissionsFromToken();
    localStorage.setItem(this.PERMS_KEY, JSON.stringify(perms));
    this.permissions.set(perms);
    this.isAuthenticated.set(true);
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
    if (this.onLogoutCallback) {
      try { this.onLogoutCallback(reason); } catch {}
    }
    this.clearStorage();
    this.currentUser.set(null);
    this.currentOrganization.set(null);
    this.isAuthenticated.set(false);
    this.permissions.set([]);
    window.location.href = 'https://tss-portal.com';
  }

  private clearStorage(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.ORG_KEY);
    localStorage.removeItem(this.PERMS_KEY);
  }

  getCurrentUser(): Observable<{ data: User }> {
    return this.http.get<{ data: User }>(`${this.authUrl}/me`).pipe(
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

  changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.passwordUrl}/change`, { currentPassword, newPassword, confirmPassword });
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.passwordUrl}/forgot`, { email });
  }

  verifyResetToken(token: string): Observable<{ valid: boolean; email?: string }> {
    return this.http.get<{ valid: boolean; email?: string }>(`${this.passwordUrl}/verify-token?token=${token}`);
  }

  resetPassword(token: string, newPassword: string, confirmPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.passwordUrl}/reset`, { token, newPassword, confirmPassword });
  }

  refreshApiKey(): Observable<{ apiKey: string; apiSecret: string }> {
    return this.http.post<{ apiKey: string; apiSecret: string }>(`${this.authUrl}/refresh-api-key`, {}).pipe(
      tap(response => {
        const user = this.currentUser();
        if (user) this.setStoredUser({ ...user, apiKey: response.apiKey });
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
