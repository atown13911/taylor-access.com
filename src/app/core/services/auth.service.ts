import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

// ============ INTERFACES ============

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
  avatar?: string;
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

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  
  private readonly TOKEN_KEY = 'vantac_token';
  private readonly USER_KEY = 'vantac_user';
  private readonly ORG_KEY = 'vantac_org';
  private readonly PERMS_KEY = 'vantac_permissions';
  private baseUrl = environment.apiUrl;
  
  currentUser = signal<User | null>(this.getStoredUser());
  currentOrganization = signal<Organization | null>(this.getStoredOrganization());
  isAuthenticated = signal<boolean>(!!this.getToken());
  permissions = signal<string[]>(this.getStoredPermissions());

  // ============ TOKEN MANAGEMENT ============

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  private getStoredUser(): User | null {
    const stored = localStorage.getItem(this.USER_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  }

  private setStoredUser(user: User): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  // Update user avatar (called after avatar upload)
  updateUserAvatar(avatarUrl: string): void {
    const currentUser = this.currentUser();
    if (currentUser) {
      const updatedUser = { ...currentUser, avatarUrl, avatar: avatarUrl };
      this.setStoredUser(updatedUser);
    }
  }

  private getStoredOrganization(): Organization | null {
    const stored = localStorage.getItem(this.ORG_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  }

  private setStoredOrganization(org: Organization): void {
    localStorage.setItem(this.ORG_KEY, JSON.stringify(org));
    this.currentOrganization.set(org);
  }

  private getStoredPermissions(): string[] {
    const stored = localStorage.getItem(this.PERMS_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch { return []; }
    }
    return this.extractPermissionsFromToken();
  }

  private extractPermissionsFromToken(): string[] {
    const token = this.getToken();
    if (!token) return [];
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      if (decoded.permissions) {
        const perms = typeof decoded.permissions === 'string'
          ? JSON.parse(decoded.permissions)
          : decoded.permissions;
        if (Array.isArray(perms)) {
          localStorage.setItem(this.PERMS_KEY, JSON.stringify(perms));
          return perms;
        }
      }
    } catch { }
    return [];
  }

  // ============ AUTHENTICATION ============

  /**
   * Register a new user
   */
  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.baseUrl}${environment.api.auth}/register`,
      request
    ).pipe(
      tap(response => this.handleAuthResponse(response)),
      catchError(error => {
        console.error('Registration failed:', error);
        throw error;
      })
    );
  }

  /**
   * Login with email and password
   */
  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.baseUrl}${environment.api.auth}/login`,
      { email, password }
    ).pipe(
      tap(response => this.handleAuthResponse(response)),
      catchError(error => {
        console.error('Login failed:', error);
        throw error;
      })
    );
  }

  /**
   * Handle successful auth response
   */
  private handleAuthResponse(response: AuthResponse): void {
    this.setToken(response.token);
    this.setStoredUser(response.user);
    if (response.organization) {
      this.setStoredOrganization(response.organization);
    }
    this.isAuthenticated.set(true);
    const perms = this.extractPermissionsFromToken();
    this.permissions.set(perms);
  }

  private onLogoutCallback: ((reason: string) => void) | null = null;

  registerLogoutCallback(cb: (reason: string) => void): void {
    this.onLogoutCallback = cb;
  }

  /**
   * Logout user
   */
  logout(reason: string = 'manual'): void {
    if (this.onLogoutCallback) {
      try { this.onLogoutCallback(reason); } catch {}
    }
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.ORG_KEY);
    localStorage.removeItem(this.PERMS_KEY);
    this.currentUser.set(null);
    this.currentOrganization.set(null);
    this.isAuthenticated.set(false);
    this.permissions.set([]);
    this.router.navigate(['/login']);
  }

  /**
   * Get current user profile from API
   */
  getCurrentUser(): Observable<{ data: User }> {
    return this.http.get<{ data: User }>(
      `${this.baseUrl}${environment.api.auth}/me`
    ).pipe(
      tap(response => {
        if (response.data) {
          this.setStoredUser(response.data);
        }
      })
    );
  }

  /**
   * Check if user is logged in
   */
  checkAuth(): Observable<boolean> {
    const token = this.getToken();
    if (!token) {
      this.isAuthenticated.set(false);
      return of(false);
    }

    return new Observable<boolean>(observer => {
      this.getCurrentUser().pipe(
        catchError(() => {
          this.logout();
          return of(null);
        })
      ).subscribe({
        next: (response) => {
          if (response?.data) {
            this.isAuthenticated.set(true);
            observer.next(true);
          } else {
            observer.next(false);
          }
          observer.complete();
        },
        error: () => {
          this.logout();
          observer.next(false);
          observer.complete();
        }
      });
    });
  }

  // ============ PASSWORD MANAGEMENT ============

  /**
   * Change user password
   */
  changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/api/v1/password/change`,
      { currentPassword, newPassword, confirmPassword }
    );
  }

  /**
   * Request password reset email
   */
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/api/v1/password/forgot`,
      { email }
    );
  }

  /**
   * Verify password reset token
   */
  verifyResetToken(token: string): Observable<{ valid: boolean; email?: string }> {
    return this.http.get<{ valid: boolean; email?: string }>(
      `${this.baseUrl}/api/v1/password/verify-token?token=${token}`
    );
  }

  /**
   * Reset password with token
   */
  resetPassword(token: string, newPassword: string, confirmPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/api/v1/password/reset`,
      { token, newPassword, confirmPassword }
    );
  }

  // ============ API KEY MANAGEMENT ============

  /**
   * Refresh API credentials
   */
  refreshApiKey(): Observable<{ apiKey: string; apiSecret: string }> {
    return this.http.post<{ apiKey: string; apiSecret: string }>(
      `${this.baseUrl}${environment.api.auth}/refresh-api-key`,
      {}
    ).pipe(
      tap(response => {
        const user = this.currentUser();
        if (user) {
          user.apiKey = response.apiKey;
          this.setStoredUser(user);
        }
      })
    );
  }

  // ============ ROLE HELPERS ============

  /**
   * Check if current user has a specific role
   */
  hasRole(role: string): boolean {
    const user = this.currentUser();
    return user?.role === role;
  }

  /**
   * Check if current user is admin
   */
  isAdmin(): boolean {
    return this.hasRole('admin');
  }

  /**
   * Get authorization header
   */
  getAuthHeader(): { Authorization: string } | {} {
    const token = this.getToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }
}
