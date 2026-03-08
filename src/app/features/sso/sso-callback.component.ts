import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
  private authService = inject(AuthService);
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
        const portalToken = tokenRes.accessToken || tokenRes.access_token;

        this.http.post<any>(`${environment.apiUrl}/api/v1/auth/sso-exchange`, {
          portalToken: portalToken,
        }).subscribe({
          next: (exchangeRes) => {
            const taToken = exchangeRes.token;
            const userData = exchangeRes.user;
            const orgData = exchangeRes.organization;

            const user = {
              id: userData.id?.toString(),
              name: userData.name,
              email: userData.email,
              role: userData.role,
              avatarUrl: userData.avatarUrl,
              organizationId: userData.organizationId?.toString(),
              organizationName: userData.organizationName,
              jobTitle: userData.jobTitle,
              timezone: userData.timezone,
            };
            const org = orgData ? {
              id: orgData.id?.toString(),
              name: orgData.name || '',
              status: orgData.status || 'active',
            } : null;

            localStorage.setItem('vantac_token', taToken);
            localStorage.setItem('vantac_user', JSON.stringify(user));
            if (org) localStorage.setItem('vantac_org', JSON.stringify(org));

            this.authService.currentUser.set(user as any);
            if (org) this.authService.currentOrganization.set(org as any);
            this.authService.isAuthenticated.set(true);

            sessionStorage.setItem('access_token_validated', 'true');

            this.router.navigate(['/dashboard']);
          },
          error: (err: any) => {
            this.error = err?.error?.error || 'Failed to authenticate with Taylor Access';
          }
        });
      },
      error: () => {
        this.error = 'Failed to exchange authorization code';
      }
    });
  }
}
