import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="brand">
          <h1 class="app-name">Taylor Access HR</h1>
          <p class="tagline">Sign in to access your HR dashboard</p>
        </div>

        <form (ngSubmit)="login()" class="login-form">
          <div class="input-group">
            <label class="label">Email</label>
            <input
              type="email"
              class="input"
              [(ngModel)]="email"
              name="email"
              placeholder="Enter your email"
              autocomplete="email"
            />
          </div>

          <div class="input-group">
            <label class="label">Password</label>
            <div class="password-wrap">
              <input
                [type]="showPassword() ? 'text' : 'password'"
                class="input"
                [(ngModel)]="password"
                name="password"
                placeholder="Enter your password"
                autocomplete="current-password"
              />
              <button type="button" class="toggle-password" (click)="showPassword.set(!showPassword())" aria-label="Toggle password visibility">
                <span class="toggle-icon">{{ showPassword() ? '🙈' : '👁' }}</span>
              </button>
            </div>
          </div>

          @if (error()) {
            <div class="error-message">
              <span class="error-icon">⚠</span>
              {{ error() }}
            </div>
          }

          <button type="submit" class="btn btn-primary" [disabled]="loading()">
            @if (loading()) {
              <span class="spinner"></span>
              <span>Signing in...</span>
            } @else {
              <span class="btn-icon">→</span>
              <span>Sign In</span>
            }
          </button>
        </form>

        <p class="footer-text">Taylor Access HR v1.0</p>
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
      background-position: center, 0 0, 0 0;
      position: relative;
    }

    .login-page::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(
        circle at center,
        transparent 0%,
        rgba(0, 212, 255, 0.04) 40%,
        rgba(0, 212, 255, 0.02) 100%
      );
      pointer-events: none;
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

    .brand {
      margin-bottom: 2rem;
    }

    .app-name {
      font-size: 1.75rem;
      font-weight: 600;
      color: #e0f7ff;
      margin: 0 0 0.5rem 0;
      letter-spacing: -0.02em;
      text-shadow: 0 0 30px rgba(0, 212, 255, 0.3);
    }

    .tagline {
      color: rgba(0, 212, 255, 0.6);
      font-size: 0.95rem;
      margin: 0;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      text-align: left;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .label {
      font-size: 0.875rem;
      font-weight: 500;
      color: rgba(0, 212, 255, 0.8);
    }

    .input {
      width: 100%;
      padding: 12px 16px;
      background: rgba(0, 212, 255, 0.05);
      border: 1px solid rgba(0, 212, 255, 0.2);
      border-radius: 16px;
      color: #e0f7ff;
      font-size: 1rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .input::placeholder {
      color: rgba(0, 212, 255, 0.35);
    }

    .input:focus {
      outline: none;
      border-color: #00d4ff;
      box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.15);
    }

    .password-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .password-wrap .input {
      padding-right: 48px;
    }

    .toggle-password {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: rgba(0, 212, 255, 0.5);
      cursor: pointer;
      padding: 4px;
      font-size: 1.1rem;
      transition: color 0.2s;
    }

    .toggle-password:hover {
      color: #00d4ff;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 12px 16px;
      background: rgba(255, 42, 109, 0.1);
      border: 1px solid rgba(255, 42, 109, 0.4);
      border-radius: 12px;
      color: #ff2a6d;
      font-size: 0.95rem;
    }

    .error-icon {
      font-size: 1.1rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 14px 24px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 16px;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      margin-top: 0.5rem;
    }

    .btn-primary {
      background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
      color: #050508;
      box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
    }

    .btn-primary:hover:not(:disabled) {
      background: linear-gradient(135deg, #00ffff 0%, #00d4ff 100%);
      box-shadow: 0 0 30px rgba(0, 212, 255, 0.5);
      transform: translateY(-1px);
    }

    .btn-primary:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .btn-icon {
      font-size: 1.1rem;
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(5, 5, 8, 0.3);
      border-top-color: #050508;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .footer-text {
      margin-top: 2rem;
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
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal('');
  showPassword = signal(false);

  login(): void {
    if (!this.email || !this.password) {
      this.error.set('Please enter email and password');
      return;
    }

    this.error.set('');
    this.loading.set(true);

    this.authService.login(this.email, this.password).subscribe({
      next: (response) => {
        this.loading.set(false);
        if (response?.token) {
          this.router.navigate(['/hr/roster']);
        } else {
          this.error.set('Login succeeded but no token received');
        }
      },
      error: (err: any) => {
        this.loading.set(false);
        const errorMsg =
          err?.error?.error ||
          err?.error?.message ||
          err?.message ||
          'Invalid email or password';
        this.error.set(errorMsg);
      }
    });
  }
}
