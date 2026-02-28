import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-time-clock',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tc-page">
      <div class="tc-header">
        <div>
          <h1><i class="bx bx-time-five"></i> Time Clock</h1>
          <p class="tc-sub">Session tracking and activity log</p>
        </div>
        <div class="tc-header-actions">
          <select class="tc-filter" [ngModel]="selectedUserId()" (ngModelChange)="selectedUserId.set($event); loadSessions(); loadSummary()">
            <option value="">My Sessions</option>
            @for (u of users(); track u.id) {
              <option [value]="u.id">{{ u.name || u.email }}</option>
            }
          </select>
          <button class="tc-btn" (click)="loadSessions(); loadSummary()"><i class="bx bx-refresh"></i> Refresh</button>
        </div>
      </div>

      <!-- Current Session -->
      <div class="tc-current">
        <div class="tc-status-dot active"></div>
        <div class="tc-status-text">
          <span class="tc-status-label">Currently Active</span>
          <span class="tc-status-since">Session started {{ currentSessionTime() }}</span>
        </div>
        <div class="tc-live-clock">{{ liveTimer() }}</div>
      </div>

      <!-- Summary Cards -->
      <div class="tc-stats">
        <div class="tc-stat">
          <i class="bx bx-calendar-check"></i>
          <div class="tc-stat-info">
            <span class="tc-stat-val">{{ summary().hoursToday }}h</span>
            <span class="tc-stat-lbl">Today</span>
          </div>
        </div>
        <div class="tc-stat">
          <i class="bx bx-calendar-week"></i>
          <div class="tc-stat-info">
            <span class="tc-stat-val">{{ summary().hoursWeek }}h</span>
            <span class="tc-stat-lbl">This Week</span>
          </div>
        </div>
        <div class="tc-stat">
          <i class="bx bx-calendar"></i>
          <div class="tc-stat-info">
            <span class="tc-stat-val">{{ summary().hoursMonth }}h</span>
            <span class="tc-stat-lbl">This Month</span>
          </div>
        </div>
        <div class="tc-stat">
          <i class="bx bx-log-in-circle"></i>
          <div class="tc-stat-info">
            <span class="tc-stat-val">{{ summary().sessionsToday }}</span>
            <span class="tc-stat-lbl">Sessions Today</span>
          </div>
        </div>
      </div>

      <!-- Sessions Table -->
      <div class="tc-table-wrap">
        <table class="tc-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Login Time</th>
              <th>Logout Time</th>
              <th>Duration</th>
              <th>Logout Reason</th>
            </tr>
          </thead>
          <tbody>
            @for (s of sessions(); track s.id) {
              <tr>
                <td class="tc-user-cell">
                  <div class="tc-avatar">{{ (s.userName || 'U').charAt(0) }}</div>
                  <div class="tc-user-info">
                    <strong>{{ s.userName || 'Unknown' }}</strong>
                    <span>{{ s.userEmail || '' }}</span>
                  </div>
                </td>
                <td>{{ formatDateTime(s.loginTime) }}</td>
                <td>{{ s.logoutTime ? formatDateTime(s.logoutTime) : '—' }}</td>
                <td>
                  @if (s.durationMinutes != null) {
                    <span class="tc-duration">{{ formatDuration(s.durationMinutes) }}</span>
                  } @else if (!s.logoutTime) {
                    <span class="tc-active-badge">Active</span>
                  } @else {
                    <span>—</span>
                  }
                </td>
                <td>
                  <span class="tc-reason" [class]="s.logoutReason || 'active'">{{ getReasonLabel(s.logoutReason) }}</span>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="tc-empty">No sessions recorded yet</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .tc-page { padding: 1.5rem; }
    .tc-header {
      display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;
      h1 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; margin: 0;
        i { color: var(--cyan, #00e5ff); }
      }
      .tc-sub { color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem; }
    }
    .tc-header-actions { display: flex; gap: 0.75rem; align-items: center; }
    .tc-filter {
      padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px; color: var(--text-primary); font-size: 0.85rem; outline: none; min-width: 180px;
      &:focus { border-color: var(--cyan); }
    }
    .tc-btn {
      display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem;
      border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
      color: var(--text-primary); font-size: 0.85rem; cursor: pointer; transition: all 0.2s;
      &:hover { border-color: var(--cyan); background: rgba(0,212,255,0.08); }
    }

    .tc-current {
      display: flex; align-items: center; gap: 16px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem;
      background: rgba(0, 255, 136, 0.04); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 12px;
    }
    .tc-status-dot {
      width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
      &.active { background: #00ff88; box-shadow: 0 0 12px rgba(0,255,136,0.5); animation: pulse-green 2s infinite; }
    }
    .tc-status-text { flex: 1; display: flex; flex-direction: column; }
    .tc-status-label { color: #00ff88; font-weight: 600; font-size: 0.9rem; }
    .tc-status-since { color: var(--text-secondary); font-size: 0.78rem; }
    .tc-live-clock { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); font-family: 'JetBrains Mono', monospace; }

    @keyframes pulse-green { 0%, 100% { box-shadow: 0 0 6px rgba(0,255,136,0.4); } 50% { box-shadow: 0 0 16px rgba(0,255,136,0.7); } }

    .tc-stats {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem;
    }
    .tc-stat {
      display: flex; align-items: center; gap: 12px; padding: 1rem 1.25rem;
      background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
      i { font-size: 1.5rem; color: var(--cyan, #00e5ff); }
    }
    .tc-stat-info { display: flex; flex-direction: column; }
    .tc-stat-val { font-size: 1.3rem; font-weight: 700; color: var(--text-primary); }
    .tc-stat-lbl { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }

    .tc-table-wrap {
      background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden;
    }
    .tc-table {
      width: 100%; border-collapse: collapse;
      th, td { padding: 0.75rem 1rem; text-align: left; font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
      th { background: rgba(255,255,255,0.03); color: var(--cyan, #00e5ff); font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
      td { color: var(--text-primary); }
      tbody tr { transition: background 0.15s; &:hover { background: rgba(255,255,255,0.03); } &:last-child td { border-bottom: none; } }
    }
    .tc-user-cell { display: flex; align-items: center; gap: 0.6rem; }
    .tc-avatar {
      width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, rgba(0,229,255,0.2), rgba(136,0,255,0.2)); border: 1px solid rgba(0,229,255,0.3);
      font-size: 0.75rem; font-weight: 700; color: var(--cyan); flex-shrink: 0;
    }
    .tc-user-info { display: flex; flex-direction: column; strong { font-size: 0.82rem; } span { font-size: 0.7rem; color: var(--text-secondary); } }
    .tc-duration { font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; }
    .tc-active-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.3); }
    .tc-reason {
      display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize;
      &.manual { background: rgba(0,170,255,0.1); color: #00aaff; border: 1px solid rgba(0,170,255,0.3); }
      &.inactivity { background: rgba(255,170,0,0.1); color: #ffaa00; border: 1px solid rgba(255,170,0,0.3); }
      &.active { background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.3); }
      &.session_expired { background: rgba(255,68,68,0.1); color: #ff4444; border: 1px solid rgba(255,68,68,0.3); }
    }
    .tc-empty { text-align: center; color: var(--text-secondary); padding: 2rem !important; }

    @media (max-width: 768px) { .tc-stats { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class TimeClockComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiUrl = environment.apiUrl;
  private clockInterval: any;

  sessions = signal<any[]>([]);
  users = signal<any[]>([]);
  selectedUserId = signal('');
  summary = signal<any>({ hoursToday: 0, hoursWeek: 0, hoursMonth: 0, sessionsToday: 0 });
  liveTimer = signal('0:00:00');
  private sessionStart = new Date();

  ngOnInit(): void {
    this.loadSessions();
    this.loadSummary();
    this.loadUsers();
    this.sessionStart = new Date();
    this.clockInterval = setInterval(() => this.updateLiveTimer(), 1000);
    this.updateLiveTimer();
  }

  ngOnDestroy(): void {
    clearInterval(this.clockInterval);
  }

  loadSessions(): void {
    const userId = this.selectedUserId();
    const params = userId ? `?userId=${userId}` : '';
    this.http.get<any>(`${this.apiUrl}/api/v1/sessions${params}`).subscribe({
      next: (res) => this.sessions.set(res?.data || []),
      error: () => this.sessions.set([])
    });
  }

  loadSummary(): void {
    const userId = this.selectedUserId();
    const params = userId ? `?userId=${userId}` : '';
    this.http.get<any>(`${this.apiUrl}/api/v1/sessions/summary${params}`).subscribe({
      next: (res) => this.summary.set(res || {}),
      error: () => {}
    });
  }

  loadUsers(): void {
    this.http.get<any>(`${this.apiUrl}/api/v1/users?limit=500&status=active`).subscribe({
      next: (res) => this.users.set(res?.data || []),
      error: () => {}
    });
  }

  currentSessionTime(): string {
    return this.sessionStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  updateLiveTimer(): void {
    const diff = Date.now() - this.sessionStart.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    this.liveTimer.set(`${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
  }

  formatDateTime(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }

  formatDuration(mins: number): string {
    if (mins < 1) return '<1 min';
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  }

  getReasonLabel(reason: string): string {
    switch (reason) {
      case 'manual': return 'Logged Out';
      case 'inactivity': return 'Inactivity';
      case 'session_expired': return 'Expired';
      case 'active': return 'Active';
      default: return reason || 'Active';
    }
  }
}
