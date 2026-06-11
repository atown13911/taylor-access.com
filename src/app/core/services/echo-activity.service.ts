import { Injectable, inject, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

interface ClientActivityPayload {
  action: string;
  entityType?: string;
  description?: string;
  endpoint?: string;
}

function resolveActivityUrl(apiUrl: string): string {
  const base = apiUrl.replace(/\/$/, '');
  if (base.endsWith('/api/v1')) return `${base}/audit/activity`;
  if (base.endsWith('/api')) return `${base}/audit/activity`;
  return `${base}/api/v1/audit/activity`;
}

/** Sends page views, sessions, and heartbeats to central audit for Taylor Echo. */
@Injectable({ providedIn: 'root' })
export class EchoActivityService implements OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private auth = inject(AuthService);
  private readonly activityUrl = resolveActivityUrl(environment.apiUrl);
  private queue: ClientActivityPayload[] = [];
  private started = false;
  private heartbeat?: ReturnType<typeof setInterval>;
  private flushTimer?: ReturnType<typeof setInterval>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private isIdle = false;

  private isLoggedIn(): boolean {
    const auth = this.auth as {
      isAuthenticated?: () => boolean;
      isLoggedIn?: () => boolean;
      getToken?: () => string | null;
    };
    if (typeof auth.isAuthenticated === 'function') return !!auth.isAuthenticated();
    if (typeof auth.isLoggedIn === 'function') return !!auth.isLoggedIn();
    return !!auth.getToken?.();
  }

  start(): void {
    if (this.started || typeof window === 'undefined' || !this.isLoggedIn()) return;
    this.started = true;

    const resetIdle = () => {
      if (this.isIdle) {
        this.isIdle = false;
        this.enqueue('idle_ended', 'idle', 'User returned from idle');
      }
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        this.isIdle = true;
        this.enqueue('idle_started', 'idle', 'User became idle');
      }, 5 * 60_000);
    };

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evt) => {
      window.addEventListener(evt, resetIdle, { passive: true });
    });
    resetIdle();

    this.heartbeat = setInterval(() => {
      this.enqueue('user_heartbeat', 'heartbeat', 'Active session heartbeat');
    }, 60_000);

    this.flushTimer = setInterval(() => this.flush(), 15_000);
    this.enqueue('session_started', 'auth', 'Session tracking started');

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const url = (e as NavigationEnd).urlAfterRedirects;
      this.enqueue('route_viewed', 'navigation', `Visited ${url}`, url);
    });

    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  private onBeforeUnload = () => {
    this.enqueue('session_ended', 'auth', 'Session ended');
    this.flush(true);
  };

  private enqueue(action: string, kind: string, description: string, endpoint?: string) {
    this.queue.push({
      action,
      entityType: 'user_activity',
      description: `${kind}:${description}`,
      endpoint: endpoint ?? this.router.url,
    });
    if (this.queue.length >= 20) this.flush();
  }

  private flush(sync = false) {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, this.queue.length);
    batch.forEach((payload) => {
      const req = this.http.post(this.activityUrl, payload);
      if (sync && navigator.sendBeacon) {
        try {
          navigator.sendBeacon(this.activityUrl, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
        } catch {
          req.subscribe({ error: () => {} });
        }
      } else {
        req.subscribe({ error: () => {} });
      }
    });
  }

  ngOnDestroy(): void {
    this.flush();
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  }
}
