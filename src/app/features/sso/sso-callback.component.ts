import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-sso-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#050508;">
      @if (error) {
        <div style="text-align:center;">
          <p style="color:#ef4444;margin-bottom:16px;">{{ error }}</p>
          <a href="https://tss-portal.com" style="color:#60a5fa;">Return to Portal</a>
        </div>
      } @else {
        <p style="color:#64748b;">Authenticating...</p>
      }
    </div>
  `
})
export class SsoCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private baseUrl = environment.apiUrl;
  private portalUrl = 'https://tss-portalcom-production.up.railway.app';

  error = '';

  ngOnInit() {
    const params = this.route.snapshot.queryParams;

    const token = params['token'];
    if (token) {
      this.handleToken(token);
      return;
    }

    const code = params['code'];
    if (params['error']) {
      this.error = params['error_description'] || params['error'];
      return;
    }

    if (!code) {
      this.error = 'No authorization code received';
      return;
    }

    this.exchangeCode(code);
  }

  private async handleToken(token: string) {
    try {
      // #region agent log
      console.log('[DEBUG-SSO] handleToken called, token length:', token.length);
      // #endregion
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      // #region agent log
      console.log('[DEBUG-SSO] payload decoded:', { userId: payload.userId, name: payload.name, role: payload.role, app_role: payload.app_role, hasPerms: !!payload.app_permissions });
      // #endregion

      localStorage.setItem('vantac_token', token);
      localStorage.setItem('vantac_user', JSON.stringify({
        id: payload.userId || payload.sub,
        name: payload.name,
        email: payload.email,
        role: payload.app_role || payload.role,
        organizationId: payload.organizationId,
      }));

      const permissions = this.extractPermissionsFromToken(token);
      // #region agent log
      console.log('[DEBUG-SSO] permissions extracted:', permissions.length, permissions.slice(0, 5));
      // #endregion
      localStorage.setItem('vantac_permissions', JSON.stringify(permissions));

      sessionStorage.setItem('access_token_validated', 'true');
      // #region agent log
      console.log('[DEBUG-SSO] localStorage written, navigating to /dashboard via full reload');
      // #endregion
      window.location.href = '/dashboard';
    } catch (err) {
      // #region agent log
      console.error('[DEBUG-SSO] handleToken FAILED:', err);
      // #endregion
      this.error = 'Session expired. Please log in again.';
    }
  }

  private extractPermissionsFromToken(token: string): string[] {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.app_permissions) {
        const perms = typeof payload.app_permissions === 'string'
          ? JSON.parse(payload.app_permissions)
          : payload.app_permissions;
        return Array.isArray(perms) ? perms : [];
      }
      return [];
    } catch {
      return [];
    }
  }

  private exchangeCode(code: string) {
    const redirectUri = window.location.origin + '/callback';

    this.http.post<any>(`${this.portalUrl}/oauth/token`, {
      grantType: 'authorization_code',
      code,
      redirectUri,
      clientId: 'ta_taylor_access',
      clientSecret: 'taylor-access-sso-secret-2026',
    }).subscribe({
      next: (tokenRes) => {
        const accessToken = tokenRes.accessToken || tokenRes.access_token;
        const refreshToken = tokenRes.refreshToken || tokenRes.refresh_token;

        this.http.get<any>(`${this.portalUrl}/oauth/userinfo`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }).subscribe({
          next: (userInfo) => {
            localStorage.setItem('vantac_token', accessToken);
            localStorage.setItem('vantac_user', JSON.stringify({
              id: userInfo.sub, name: userInfo.name, email: userInfo.email,
              role: userInfo.role, avatar: userInfo.avatar,
              organizationId: userInfo.organizationId, organizationName: userInfo.organizationName,
            }));
            if (refreshToken) localStorage.setItem('sso_refresh_token', refreshToken);

            const permissions = this.extractPermissionsFromToken(accessToken);
            localStorage.setItem('vantac_permissions', JSON.stringify(permissions));

            sessionStorage.setItem('access_token_validated', 'true');
            this.router.navigate(['/dashboard']);
          },
          error: () => { this.error = 'Failed to load user profile'; }
        });
      },
      error: () => { this.error = 'Failed to exchange authorization code'; }
    });
  }
}
