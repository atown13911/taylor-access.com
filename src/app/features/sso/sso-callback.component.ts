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
      const res = await fetch(`${this.portalUrl}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const userInfo = await res.json();

      localStorage.setItem('vantac_token', token);
      localStorage.setItem('vantac_user', JSON.stringify({
        id: userInfo.sub, name: userInfo.name, email: userInfo.email,
        role: userInfo.role, avatar: userInfo.avatar,
        organizationId: userInfo.organizationId, organizationName: userInfo.organizationName,
      }));

      sessionStorage.setItem('access_token_validated', 'true');
      this.router.navigate(['/dashboard']);
    } catch {
      this.error = 'Session expired. Please log in again.';
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
