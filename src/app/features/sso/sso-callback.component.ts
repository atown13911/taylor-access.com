import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
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
  private portalUrl = environment.portalApiUrl || 'https://ttac-gateway-production.up.railway.app/api/v1/open/tss-portal';

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

  private handleToken(token: string) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));

      // Store Portal JWT and user info decoded from its claims
      localStorage.setItem('vantac_token', token);
      localStorage.setItem('vantac_user', JSON.stringify({
        id: payload.userId || payload.sub,
        name: payload.name,
        email: payload.email,
        role: payload.app_role || payload.role,
        organizationId: payload.organizationId,
        avatarUrl: payload.avatarUrl || payload.avatar,
        avatar: payload.avatar,
      }));
      localStorage.setItem('vantac_permissions', JSON.stringify(
        this.extractPermissions(payload)
      ));

      sessionStorage.setItem('access_token_validated', 'true');
      window.location.href = '/dashboard';
    } catch {
      this.error = 'Session expired. Please log in again.';
    }
  }

  private extractPermissions(payload: any): string[] {
    const out = new Set<string>();
    const collect = (raw: any) => {
      if (!raw) return;
      try {
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(value)) {
          for (const p of value) {
            const token = String(p ?? '').trim();
            if (token) out.add(token);
          }
        }
      } catch {
        // Ignore malformed permission claims and continue.
      }
    };

    collect(payload?.app_permissions);
    collect(payload?.permissions);
    return Array.from(out);
  }

  private exchangeCode(code: string) {
    const redirectUri = window.location.origin + '/callback';
    const tokenRequest: any = {
      grantType: 'authorization_code',
      code,
      redirectUri,
      clientId: 'ta_taylor_access',
    };
    const configuredClientSecret = (environment as any).ssoClientSecret as string | undefined;
    if (configuredClientSecret) {
      tokenRequest.clientSecret = configuredClientSecret;
    }

    this.http.post<any>(`${this.portalUrl}/oauth/token`, {
      ...tokenRequest,
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
              avatarUrl: userInfo.avatarUrl || userInfo.avatar,
              organizationId: userInfo.organizationId,
              organizationName: userInfo.organizationName,
            }));
            if (refreshToken) localStorage.setItem('sso_refresh_token', refreshToken);

            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            localStorage.setItem('vantac_permissions', JSON.stringify(
              this.extractPermissions(payload)
            ));

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
