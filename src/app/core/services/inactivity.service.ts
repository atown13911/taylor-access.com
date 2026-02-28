import { Injectable, inject, signal, OnDestroy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InactivityService implements OnDestroy {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private zone = inject(NgZone);

  private readonly TIMEOUT_MS = 15 * 60 * 1000;
  private readonly WARNING_MS = 13 * 60 * 1000;
  private readonly THROTTLE_MS = 30_000;
  private readonly SESSION_KEY = 'ta_session_id';

  showWarning = signal(false);
  countdownSeconds = signal(120);

  private timer: any;
  private warningTimer: any;
  private countdownInterval: any;
  private lastActivity = Date.now();
  private throttleTimeout: any;
  private started = false;
  private boundHandler = this.onActivity.bind(this);

  start(): void {
    if (this.started || !this.auth.isAuthenticated()) return;
    this.started = true;
    this.lastActivity = Date.now();

    this.auth.registerLogoutCallback((reason: string) => {
      this.logSessionEnd(reason);
      this.stop();
    });

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    this.zone.runOutsideAngular(() => {
      events.forEach(e => document.addEventListener(e, this.boundHandler, { passive: true }));
    });

    this.resetTimers();
    this.logSessionStart();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => document.removeEventListener(e, this.boundHandler));

    clearTimeout(this.timer);
    clearTimeout(this.warningTimer);
    clearInterval(this.countdownInterval);
    clearTimeout(this.throttleTimeout);
    this.showWarning.set(false);
  }

  stayLoggedIn(): void {
    this.showWarning.set(false);
    clearInterval(this.countdownInterval);
    this.resetTimers();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private onActivity(): void {
    this.lastActivity = Date.now();

    if (this.showWarning()) {
      this.zone.run(() => this.stayLoggedIn());
      return;
    }

    if (!this.throttleTimeout) {
      this.throttleTimeout = setTimeout(() => {
        this.throttleTimeout = null;
        this.resetTimers();
      }, this.THROTTLE_MS);
    }
  }

  private resetTimers(): void {
    clearTimeout(this.timer);
    clearTimeout(this.warningTimer);
    clearInterval(this.countdownInterval);

    this.warningTimer = setTimeout(() => {
      this.zone.run(() => {
        this.showWarning.set(true);
        this.countdownSeconds.set(120);
        this.countdownInterval = setInterval(() => {
          const s = this.countdownSeconds() - 1;
          this.countdownSeconds.set(s);
          if (s <= 0) {
            clearInterval(this.countdownInterval);
          }
        }, 1000);
      });
    }, this.WARNING_MS);

    this.timer = setTimeout(() => {
      this.zone.run(() => {
        this.logSessionEnd('inactivity');
        this.stop();
        this.auth.logout();
      });
    }, this.TIMEOUT_MS);
  }

  logSessionStart(): void {
    this.http.post<any>(`${environment.apiUrl}/api/v1/sessions/start`, {}).subscribe({
      next: (res) => {
        if (res?.sessionId) {
          localStorage.setItem(this.SESSION_KEY, res.sessionId);
        }
      },
      error: () => {}
    });
  }

  logSessionEnd(reason: string = 'manual'): void {
    const sessionId = localStorage.getItem(this.SESSION_KEY);
    if (sessionId) {
      this.http.post(`${environment.apiUrl}/api/v1/sessions/end`, { sessionId, reason }).subscribe({ error: () => {} });
      localStorage.removeItem(this.SESSION_KEY);
    }
  }

  getWarningMinutes(): string {
    const s = this.countdownSeconds();
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}
