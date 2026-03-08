import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
          <a [href]="portalUrl" style="color:#60a5fa;">Return to Portal</a>
        </div>
      } @else {
        <p style="color:#64748b;">Authenticating...</p>
      }
    </div>
  `
})
export class SsoCallbackComponent implements OnInit {
  private router = inject(Router);
  private http = inject(HttpClient);
  private portalApiUrl = environment.portalApiUrl;
  portalUrl = environment.portalUrl;

  error = '';

  ngOnInit() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('error')) {
      this.error = params.get('error_description') || params.get('error') || 'Authentication failed';
      return;
    }

    const code = params.get('code');
    if (!code) {
      this.error = 'No authorization code received';
      return;
    }

    this.exchangeCode(code);
  }

  private exchangeCode(code: string) {
    const redirectUri = window.location.origin + '/callback';

    this.http.post<any>(`${this.portalApiUrl}/oauth/token`, {
      grantType: 'authorization_code',
      code,
      redirectUri,
      clientId: environment.oauthClientId,
    }).subscribe({
      next: (tokenRes) => {
        const accessToken = tokenRes.accessToken || tokenRes.access_token;
        const refreshToken = tokenRes.refreshToken || tokenRes.refresh_token;

        this.http.get<any>(`${this.portalApiUrl}/oauth/userinfo`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }).subscribe({
          next: (userInfo) => {
            localStorage.setItem('vantac_token', accessToken);
            localStorage.setItem('vantac_user', JSON.stringify({
              id: userInfo.sub,
              name: userInfo.name,
              email: userInfo.email,
              role: userInfo.role,
              avatar: userInfo.avatar,
              organizationId: userInfo.organizationId,
              organizationName: userInfo.organizationName,
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
