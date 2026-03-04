import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
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
          <p class="tc-sub">Employee hours overview</p>
        </div>
        <div class="tc-header-actions">
          <select class="tc-filter" [ngModel]="selectedWeek()" (ngModelChange)="selectedWeek.set($event)">
            @for (w of weekOptions; track w.value) {
              <option [value]="w.value">{{ w.label }}</option>
            }
          </select>
          <button class="tc-btn" (click)="loadSessions(); loadSummary()"><i class="bx bx-refresh"></i> Refresh</button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="tc-stats">
        <div class="tc-stat">
          <i class="bx bx-group"></i>
          <div class="tc-stat-info">
            <span class="tc-stat-val">{{ filteredRoster().length }}</span>
            <span class="tc-stat-lbl">Active Employees</span>
          </div>
        </div>
        <div class="tc-stat">
          <i class="bx bx-user-check"></i>
          <div class="tc-stat-info">
            <span class="tc-stat-val">{{ activeCount() }}</span>
            <span class="tc-stat-lbl">Online Now</span>
          </div>
        </div>
        <div class="tc-stat">
          <i class="bx bx-time"></i>
          <div class="tc-stat-info">
            <span class="tc-stat-val">{{ totalHoursFiltered() }}h</span>
            <span class="tc-stat-lbl">Total Hours</span>
          </div>
        </div>
      </div>

      <!-- Search & Filters -->
      <div class="tc-filters-row">
        <div class="tc-search-bar">
          <i class="bx bx-search"></i>
          <input type="text" placeholder="Search employees..." [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)">
        </div>
        <select class="tc-filter" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
          <option value="all">All Employees</option>
          <option value="active">Active (Online)</option>
          <option value="offline">Offline</option>
          <option value="has-hours">Has Hours</option>
          <option value="no-hours">No Hours</option>
        </select>
      </div>

      <!-- Employee Roster Table -->
      <div class="tc-table-wrap">
        <table class="tc-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Status</th>
              <th class="tc-hours-col">Total Hours</th>
              <th>Sessions</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>
            @for (emp of filteredRoster(); track emp.userId) {
              <tr>
                <td class="tc-user-cell">
                  <div class="tc-avatar">{{ (emp.userName || 'U').charAt(0) }}</div>
                  <div class="tc-user-info">
                    <strong>{{ emp.userName }}</strong>
                    <span>{{ emp.userEmail }}</span>
                  </div>
                </td>
                <td>
                  @if (emp.isActive) {
                    <span class="tc-active-badge">Active</span>
                  } @else {
                    <span class="tc-inactive-badge">Offline</span>
                  }
                </td>
                <td class="tc-hours-col"><span class="tc-hours">{{ getHoursForPeriod(emp) }}h</span></td>
                <td><span class="tc-sessions-count">{{ emp.sessionCount }}</span></td>
                <td class="tc-last-active">{{ emp.lastActive ? formatDateTime(emp.lastActive) : '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="tc-empty">No active employees found</td></tr>
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
    .tc-inactive-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(136,136,170,0.1); color: #8888aa; border: 1px solid rgba(136,136,170,0.3); }
    .tc-hours { font-weight: 600; color: var(--text-primary); font-size: 0.9rem; }
    .tc-sessions-count { font-weight: 600; color: var(--cyan); }
    .tc-last-active { font-size: 0.78rem; color: var(--text-secondary); }
    .tc-filter-group { display: flex; gap: 2px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); overflow: hidden; }
    .tc-period-btn {
      padding: 0.45rem 0.9rem; border: none; background: none; color: var(--text-secondary); font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
      &:hover { color: var(--text-primary); background: rgba(255,255,255,0.04); }
      &.active { background: rgba(0,212,255,0.12); color: var(--cyan); }
    }
    .tc-filters-row {
      display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem;
    }
    .tc-search-bar {
      position: relative; flex: 1; display: flex; align-items: center;
      i { position: absolute; left: 12px; color: var(--text-secondary); font-size: 1rem; }
      input { width: 100%; padding: 0.6rem 1rem 0.6rem 2.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; color: var(--text-primary); font-size: 0.85rem;
        &:focus { outline: none; border-color: rgba(0,212,255,0.3); }
        &::placeholder { color: var(--text-secondary); }
      }
    }
    .tc-reason {
      display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize;
      &.manual { background: rgba(0,170,255,0.1); color: #00aaff; border: 1px solid rgba(0,170,255,0.3); }
      &.inactivity { background: rgba(255,170,0,0.1); color: #ffaa00; border: 1px solid rgba(255,170,0,0.3); }
      &.active { background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.3); }
      &.session_expired { background: rgba(255,68,68,0.1); color: #ff4444; border: 1px solid rgba(255,68,68,0.3); }
    }
    .tc-empty { text-align: center; color: var(--text-secondary); padding: 2rem !important; }

    .tc-pagination {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; margin-top: 12px;
    }
    .tc-page-info { color: var(--text-secondary); font-size: 0.8rem; }
    .tc-page-btns { display: flex; gap: 4px; }
    .tc-page-btn {
      min-width: 32px; height: 32px; border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04);
      color: var(--text-secondary); font-size: 0.82rem; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      transition: all 0.2s;
      &:hover:not(:disabled) { border-color: var(--cyan); color: var(--cyan); background: rgba(0,212,255,0.08); }
      &.active { background: rgba(0,212,255,0.15); border-color: var(--cyan); color: var(--cyan); }
      &:disabled { opacity: 0.3; cursor: not-allowed; }
    }

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
  periodFilter = signal<'today' | 'week' | 'month' | 'all'>('week');
  searchTerm = signal('');
  statusFilter = signal('all');
  selectedWeek = signal('current');

  weekOptions = (() => {
    const weeks: { value: string; label: string }[] = [{ value: 'current', label: 'Current Week' }];
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (i * 7));
      const sun = new Date(d); sun.setDate(sun.getDate() - sun.getDay());
      const sat = new Date(sun); sat.setDate(sat.getDate() + 6);
      const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeks.push({ value: i.toString(), label: `Week of ${fmt(sun)} – ${fmt(sat)}` });
    }
    return weeks;
  })();

  currentPage = signal(1);
  pageSize = 10;

  totalPages = computed(() => Math.ceil(this.sessions().length / this.pageSize) || 1);

  paginatedSessions = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.sessions().slice(start, start + this.pageSize);
  });

  visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  });

  private getWeekRange(): { start: Date; end: Date } {
    const now = new Date();
    const weekVal = this.selectedWeek();
    const weeksAgo = weekVal === 'current' ? 0 : parseInt(weekVal) || 0;
    const ref = new Date(now);
    ref.setDate(ref.getDate() - (weeksAgo * 7));
    const start = new Date(ref);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  employeeRoster = computed(() => {
    const allSessions = this.sessions();
    const allUsers = this.users();
    const _ = this.selectedWeek();
    const { start, end } = this.getWeekRange();

    const userMap = new Map<string, any>();

    // Add all roster employees first
    for (const u of allUsers) {
      const key = u.id?.toString();
      if (!key) continue;
      userMap.set(key, {
        userId: u.id,
        userName: u.name || u.email || 'Unknown',
        userEmail: u.email || '',
        totalHours: 0,
        sessionCount: 0,
        isActive: false,
        lastActive: null
      });
    }

    // Layer session data on top
    for (const s of allSessions) {
      const key = s.userId?.toString() || s.userEmail || s.userName;
      if (!key) continue;

      const loginTime = new Date(s.loginTime);

      if (!userMap.has(key)) {
        userMap.set(key, {
          userId: s.userId,
          userName: s.userName || 'Unknown',
          userEmail: s.userEmail || '',
          totalHours: 0,
          sessionCount: 0,
          isActive: false,
          lastActive: null
        });
      }

      const emp = userMap.get(key)!;
      if (!s.logoutTime) emp.isActive = true;
      if (!emp.lastActive || loginTime > new Date(emp.lastActive)) emp.lastActive = s.loginTime;

      if (loginTime >= start && loginTime < end) {
        const mins = s.durationMinutes || 0;
        emp.totalHours += mins / 60;
        emp.sessionCount++;
      }
    }

    return Array.from(userMap.values()).map(e => ({
      ...e,
      totalHours: Math.round(e.totalHours * 10) / 10
    })).sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || b.totalHours - a.totalHours);
  });

  filteredRoster = computed(() => {
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    let roster = this.employeeRoster();
    if (search) {
      roster = roster.filter(e =>
        e.userName.toLowerCase().includes(search) ||
        e.userEmail.toLowerCase().includes(search)
      );
    }
    if (status === 'active') roster = roster.filter(e => e.isActive);
    else if (status === 'offline') roster = roster.filter(e => !e.isActive);
    else if (status === 'has-hours') roster = roster.filter(e => e.totalHours > 0);
    else if (status === 'no-hours') roster = roster.filter(e => e.totalHours === 0);
    return roster;
  });

  activeCount = computed(() => this.employeeRoster().filter(e => e.isActive).length);

  totalHoursFiltered = computed(() => {
    return Math.round(this.employeeRoster().reduce((sum, e) => sum + e.totalHours, 0) * 10) / 10;
  });

  getHoursForPeriod(emp: any): number {
    return emp.totalHours;
  }

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
    this.currentPage.set(1);
    this.http.get<any>(`${this.apiUrl}/api/v1/sessions?limit=2000`).subscribe({
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
