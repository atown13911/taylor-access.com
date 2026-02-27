import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-oauth-consent',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="oauth-page">
      <div class="oauth-card">
        <div class="oauth-header">
          <i class="bx bx-shield-quarter"></i>
          <h1>Taylor Access</h1>
          <p class="subtitle">Single Sign-On</p>
        </div>

        @if (loading()) {
          <div class="loading">Loading...</div>
        } @else if (error()) {
          <div class="error-box">
            <i class="bx bx-error-circle"></i>
            <p>{{ error() }}</p>
          </div>
        } @else {
          <div class="app-info">
            <div class="app-icon">
              @if (clientLogo()) {
                <img [src]="clientLogo()" [alt]="clientName()">
              } @else {
                <i class="bx bx-cube"></i>
              }
            </div>
            <h2>{{ clientName() }}</h2>
            <p class="app-desc">{{ clientDescription() || 'wants to access your account' }}</p>
          </div>

          <div class="permissions">
            <p class="perm-label">This app will be able to:</p>
            <ul>
              <li><i class="bx bx-user"></i> View your profile information</li>
              <li><i class="bx bx-envelope"></i> Access your email address</li>
              <li><i class="bx bx-lock"></i> See your role and permissions</li>
            </ul>
          </div>

          @if (!isLoggedIn()) {
            <div class="login-form">
              <div class="field">
                <label>Email</label>
                <input type="email" [(ngModel)]="email" placeholder="Enter your email" (keyup.enter)="authorize()">
              </div>
              <div class="field">
                <label>Password</label>
                <input type="password" [(ngModel)]="password" placeholder="Enter your password" (keyup.enter)="authorize()">
              </div>
            </div>
          }

          @if (authError()) {
            <div class="auth-error">{{ authError() }}</div>
          }

          <div class="actions">
            <button class="btn-authorize" (click)="authorize()" [disabled]="authorizing()">
              @if (authorizing()) {
                <i class="bx bx-loader-alt bx-spin"></i> Authorizing...
              } @else {
                <i class="bx bx-check"></i> {{ isLoggedIn() ? 'Authorize' : 'Sign In & Authorize' }}
              }
            </button>
            <button class="btn-cancel" (click)="cancel()">Cancel</button>
          </div>

          <p class="footer-text">
            Signing in to <strong>{{ clientName() }}</strong> via Taylor Access SSO
          </p>
        }
      </div>
    </div>
  `,
  styles: [`
    .oauth-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #050508;
      padding: 20px;
    }
    .oauth-card {
      width: 100%;
      max-width: 420px;
      background: #0d0d14;
      border: 1px solid rgba(0, 212, 255, 0.15);
      border-radius: 16px;
      padding: 32px;
    }
    .oauth-header {
      text-align: center;
      margin-bottom: 24px;
      i { font-size: 40px; color: #00d4ff; }
      h1 { font-size: 22px; color: #e0f7ff; margin-top: 8px; }
      .subtitle { color: #7dd3fc; font-size: 13px; margin-top: 4px; }
    }
    .app-info {
      text-align: center;
      margin-bottom: 20px;
      padding: 16px;
      background: rgba(0, 212, 255, 0.05);
      border-radius: 12px;
      border: 1px solid rgba(0, 212, 255, 0.1);
      .app-icon { 
        font-size: 36px; color: #00d4ff; margin-bottom: 8px;
        img { width: 48px; height: 48px; border-radius: 8px; }
      }
      h2 { font-size: 18px; color: #e0f7ff; }
      .app-desc { font-size: 13px; color: #7dd3fc; margin-top: 4px; }
    }
    .permissions {
      margin-bottom: 20px;
      .perm-label { font-size: 12px; color: #888; margin-bottom: 8px; }
      ul { list-style: none; padding: 0; }
      li {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 0; font-size: 13px; color: #ccc;
        i { color: #00d4ff; font-size: 16px; }
      }
    }
    .login-form {
      margin-bottom: 16px;
      .field { margin-bottom: 12px; }
      label { display: block; font-size: 12px; color: #00d4ff; margin-bottom: 4px; }
      input {
        width: 100%; padding: 10px 14px; background: #12121a; border: 1px solid rgba(0,212,255,0.2);
        border-radius: 8px; color: #e0f7ff; font-size: 14px; outline: none;
        &:focus { border-color: #00d4ff; }
      }
    }
    .auth-error {
      background: rgba(255,42,109,0.1); border: 1px solid rgba(255,42,109,0.3);
      color: #ff5252; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 12px;
    }
    .actions {
      display: flex; flex-direction: column; gap: 8px;
      .btn-authorize {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        padding: 12px; background: linear-gradient(135deg, #00d4ff, #0099cc); color: #050508;
        border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
        &:hover { opacity: 0.9; }
        &:disabled { opacity: 0.5; cursor: not-allowed; }
      }
      .btn-cancel {
        padding: 10px; background: none; border: 1px solid rgba(255,255,255,0.15);
        border-radius: 8px; color: #888; font-size: 13px; cursor: pointer;
        &:hover { border-color: #ff5252; color: #ff5252; }
      }
    }
    .footer-text { text-align: center; font-size: 11px; color: #555; margin-top: 16px; }
    .loading { text-align: center; color: #7dd3fc; padding: 40px; }
    .error-box { text-align: center; color: #ff5252; padding: 20px; i { font-size: 32px; } }
  `]
})
export class OAuthConsentComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private baseUrl = environment.apiUrl;

  loading = signal(true);
  error = signal<string | null>(null);
  clientName = signal('');
  clientDescription = signal('');
  clientLogo = signal('');
  clientId = signal('');
  redirectUri = signal('');
  scope = signal('');
  state = signal('');
  email = '';
  password = '';
  authError = signal<string | null>(null);
  authorizing = signal(false);

  isLoggedIn = this.authService.isAuthenticated;

  ngOnInit() {
    const params = this.route.snapshot.queryParams;
    if (!params['client_id'] || !params['redirect_uri']) {
      this.error.set('Missing required parameters (client_id, redirect_uri)');
      this.loading.set(false);
      return;
    }

    this.clientId.set(params['client_id']);
    this.redirectUri.set(params['redirect_uri']);
    this.scope.set(params['scope'] || 'openid profile email');
    this.state.set(params['state'] || '');

    // Pre-fill email if logged in
    const user = this.authService.currentUser();
    if (user) this.email = user.email;

    this.http.get(`${this.baseUrl}/oauth/authorize`, {
      params: {
        response_type: 'code',
        client_id: params['client_id'],
        redirect_uri: params['redirect_uri'],
        scope: this.scope(),
        state: this.state()
      }
    }).subscribe({
      next: (res: any) => {
        this.clientName.set(res.clientName);
        this.clientDescription.set(res.clientDescription);
        this.clientLogo.set(res.clientLogo);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error_description || 'Invalid OAuth request');
        this.loading.set(false);
      }
    });
  }

  authorize() {
    this.authorizing.set(true);
    this.authError.set(null);

    this.http.post(`${this.baseUrl}/oauth/authorize/login`, {
      email: this.email,
      password: this.password,
      clientId: this.clientId(),
      redirectUri: this.redirectUri(),
      scope: this.scope(),
      state: this.state()
    }).subscribe({
      next: (res: any) => {
        window.location.href = res.redirectUrl;
      },
      error: (err) => {
        this.authError.set(err.error?.error_description || 'Authentication failed');
        this.authorizing.set(false);
      }
    });
  }

  cancel() {
    const uri = this.redirectUri();
    if (uri) window.location.href = `${uri}?error=access_denied&state=${this.state()}`;
    else this.router.navigate(['/']);
  }
}
