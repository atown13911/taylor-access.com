import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="brand">
          <h1 class="app-name">Taylor Access HR</h1>
          <p class="tagline">Redirecting to TSS Portal...</p>
        </div>
        <div class="spinner-wrap">
          <span class="spinner"></span>
        </div>
        <p class="footer-text">Authenticating via TSS Portal</p>
      </div>
      <div class="grid-overlay"></div>
    </div>
  `,
  styles: [`
    .login-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #050508;
      background-image:
        linear-gradient(rgba(5, 5, 8, 0.9), rgba(5, 5, 8, 0.85)),
        linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px);
      background-size: 100% 100%, 40px 40px, 40px 40px;
      position: relative;
    }
    .login-card {
      width: 100%;
      max-width: 420px;
      padding: 2.5rem;
      background: rgba(13, 13, 20, 0.95);
      border: 1px solid rgba(0, 212, 255, 0.2);
      border-radius: 16px;
      box-shadow:
        0 0 20px rgba(0, 212, 255, 0.15),
        0 0 40px rgba(0, 212, 255, 0.08),
        0 20px 60px rgba(0, 0, 0, 0.5);
      text-align: center;
      z-index: 1;
      backdrop-filter: blur(12px);
    }
    .brand { margin-bottom: 2rem; }
    .app-name {
      font-size: 1.75rem;
      font-weight: 600;
      color: #e0f7ff;
      margin: 0 0 0.5rem 0;
      text-shadow: 0 0 30px rgba(0, 212, 255, 0.3);
    }
    .tagline {
      color: rgba(0, 212, 255, 0.6);
      font-size: 0.95rem;
      margin: 0;
    }
    .spinner-wrap {
      display: flex;
      justify-content: center;
      margin: 1.5rem 0;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(0, 212, 255, 0.2);
      border-top-color: #00d4ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .footer-text {
      margin-top: 1rem;
      font-size: 0.75rem;
      color: rgba(0, 212, 255, 0.35);
    }
    .grid-overlay {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, transparent 0%, #050508 70%);
      pointer-events: none;
    }
  `]
})
export class LoginComponent implements OnInit {
  ngOnInit(): void {
    const redirectUri = encodeURIComponent(window.location.origin + '/callback');
    const clientId = environment.oauthClientId;
    const portalUrl = environment.portalUrl;
    const targetUrl = `${portalUrl}/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=openid%20profile%20email`;

    window.location.href = targetUrl;
  }
}
