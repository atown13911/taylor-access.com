import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-hr-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="hr-dashboard">
      <div class="page-header">
        <div>
          <h1><i class="bx bx-group"></i> HR Dashboard</h1>
          <p>Human Resources & Payroll Management</p>
        </div>
        <button class="btn-refresh" (click)="loadAll()" [disabled]="loading()">
          <i class="bx" [class.bx-refresh]="!loading()" [class.bx-loader-alt]="loading()" [class.bx-spin]="loading()"></i>
          Refresh
        </button>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card total">
          <i class="bx bx-group stat-icon"></i>
          <div>
            <span class="stat-value">{{ stats().totalEmployees }}</span>
            <span class="stat-label">Total Employees</span>
          </div>
        </div>

        <div class="stat-card active">
          <i class="bx bx-user-check stat-icon"></i>
          <div>
            <span class="stat-value">{{ stats().activeEmployees }}</span>
            <span class="stat-label">Active</span>
          </div>
        </div>

        <div class="stat-card timeoff">
          <i class="bx bx-calendar-event stat-icon"></i>
          <div>
            <span class="stat-value">{{ stats().pendingTimeOff }}</span>
            <span class="stat-label">Pending Time Off</span>
          </div>
        </div>

        <div class="stat-card attendance">
          <i class="bx bx-time-five stat-icon"></i>
          <div>
            <span class="stat-value">{{ stats().presentToday }}</span>
            <span class="stat-label">Present Today</span>
          </div>
        </div>

        <div class="stat-card payroll">
          <i class="bx bx-money stat-icon"></i>
          <div>
            <span class="stat-value">{{ stats().pendingPaychecks }}</span>
            <span class="stat-label">Pending Paychecks</span>
          </div>
        </div>

        <a routerLink="/hr/roster" [queryParams]="{tab: 'bulk'}" class="stat-card staging clickable">
          <i class="bx bx-table stat-icon"></i>
          <div>
            <span class="stat-value">{{ stats().bulkStaging }}</span>
            <span class="stat-label">Bulk Staging</span>
          </div>
        </a>
      </div>

      <!-- Workforce Breakdown -->
      @if (byDepartment().length > 0 || byRole().length > 0) {
        <div class="breakdown-section">
          <h2>Workforce Breakdown</h2>
          <div class="breakdown-grid">
            @if (byDepartment().length > 0) {
              <div class="breakdown-card">
                <h3><i class="bx bx-buildings"></i> By Department</h3>
                <div class="bar-list">
                  @for (dept of byDepartment(); track dept.department) {
                    <div class="bar-item">
                      <div class="bar-label">
                        <span>{{ dept.department }}</span>
                        <span class="bar-count">{{ dept.count }}</span>
                      </div>
                      <div class="bar-track">
                        <div class="bar-fill" [style.width.%]="getBarWidth(dept.count, maxDeptCount())"></div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
            @if (byRole().length > 0) {
              <div class="breakdown-card">
                <h3><i class="bx bx-shield-quarter"></i> By Role</h3>
                <div class="bar-list">
                  @for (role of byRole(); track role.role) {
                    <div class="bar-item">
                      <div class="bar-label">
                        <span>{{ role.role || 'unassigned' }}</span>
                        <span class="bar-count">{{ role.count }}</span>
                      </div>
                      <div class="bar-track">
                        <div class="bar-fill role-fill" [style.width.%]="getBarWidth(role.count, maxRoleCount())"></div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Quick Actions -->
      <div class="quick-actions">
        <h2>Quick Actions</h2>
        <div class="action-grid">
          <a routerLink="/hr/paychecks" class="action-card">
            <i class="bx bx-money"></i>
            <span>Process Payroll</span>
            @if (stats().pendingPaychecks > 0) {
              <span class="action-badge paycheck-badge">{{ stats().pendingPaychecks }}</span>
            }
          </a>
          <a routerLink="/hr/time-off" class="action-card">
            <i class="bx bx-calendar-event"></i>
            <span>Review Time Off</span>
            @if (stats().pendingTimeOff > 0) {
              <span class="action-badge timeoff-badge">{{ stats().pendingTimeOff }}</span>
            }
          </a>
          <a routerLink="/hr/attendance" class="action-card">
            <i class="bx bx-time-five"></i>
            <span>View Attendance</span>
          </a>
          <a routerLink="/hr/documents" class="action-card">
            <i class="bx bx-folder"></i>
            <span>HR Documents</span>
          </a>
          <a routerLink="/hr/roster" class="action-card">
            <i class="bx bx-id-card"></i>
            <span>Employee Roster</span>
          </a>
          <a routerLink="/hr/timesheets" class="action-card">
            <i class="bx bx-spreadsheet"></i>
            <span>Timesheets</span>
          </a>
        </div>
      </div>

      <!-- Headcount Trend -->
      @if (snapshots().length > 0) {
        <div class="trend-section">
          <h2>Headcount Trend</h2>
          <div class="trend-row">
            @for (snap of snapshots(); track snap.month) {
              <div class="trend-item">
                <span class="trend-value">{{ snap.activeCount }}</span>
                <span class="trend-month">{{ formatMonth(snap.month) }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Recent Activity -->
      <div class="recent-section">
        <h2>Recent Activity</h2>
        @if (recentActivity().length === 0) {
          <div class="activity-list">
            <div class="activity-empty">
              <i class="bx bx-history"></i>
              <span>No recent activity found</span>
            </div>
          </div>
        } @else {
          <div class="activity-list">
            @for (activity of recentActivity(); track activity.id) {
              <div class="activity-item">
                <div class="activity-icon-wrap" [class]="activity.category">
                  <i [class]="'bx ' + activity.icon"></i>
                </div>
                <div class="activity-content">
                  <strong>{{ activity.title }}</strong>
                  <span>{{ activity.description }}</span>
                  <span class="time">{{ activity.time }}</span>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .hr-dashboard { padding: 24px; }

    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
    }
    .page-header h1 {
      color: #00f2fe; font-size: 2rem; margin: 0 0 8px 0;
      display: flex; align-items: center; gap: 12px;
      text-shadow: 0 0 20px rgba(0, 242, 254, 0.5);
    }
    .page-header p { color: #9ca3af; margin: 0; }

    .btn-refresh {
      padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600;
      border: 1px solid rgba(0, 242, 254, 0.3); background: rgba(0, 242, 254, 0.1);
      color: #00f2fe; display: flex; align-items: center; gap: 6px; transition: all 0.2s;
    }
    .btn-refresh:hover:not(:disabled) { background: rgba(0, 242, 254, 0.2); }
    .btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Stats */
    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px; margin: 24px 0 32px;
    }
    .stat-card {
      background: rgba(26, 26, 46, 0.6); backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 242, 254, 0.2); border-radius: 14px;
      padding: 20px; display: flex; align-items: center; gap: 16px;
      transition: all 0.3s ease;
    }
    .stat-card:hover { transform: translateY(-3px); box-shadow: 0 0 25px rgba(0, 242, 254, 0.2); }
    .stat-card.clickable { cursor: pointer; text-decoration: none; }

    .stat-card.total { border-color: rgba(0, 212, 255, 0.3); }
    .stat-card.total .stat-icon, .stat-card.total .stat-value { color: #00d4ff; }
    .stat-card.active { border-color: rgba(34, 197, 94, 0.3); }
    .stat-card.active .stat-icon, .stat-card.active .stat-value { color: #22c55e; }
    .stat-card.timeoff { border-color: rgba(251, 191, 36, 0.3); }
    .stat-card.timeoff .stat-icon, .stat-card.timeoff .stat-value { color: #fbbf24; }
    .stat-card.attendance { border-color: rgba(168, 85, 247, 0.3); }
    .stat-card.attendance .stat-icon, .stat-card.attendance .stat-value { color: #a855f7; }
    .stat-card.payroll { border-color: rgba(59, 130, 246, 0.3); }
    .stat-card.payroll .stat-icon, .stat-card.payroll .stat-value { color: #3b82f6; }
    .stat-card.staging { border-color: rgba(0, 242, 254, 0.3); }
    .stat-card.staging .stat-icon, .stat-card.staging .stat-value { color: #00f2fe; }

    .stat-icon { font-size: 2.4rem; }
    .stat-value { display: block; font-size: 1.8rem; font-weight: 700; line-height: 1; }
    .stat-label { display: block; font-size: 0.8rem; color: #9ca3af; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Breakdown */
    .breakdown-section { margin-bottom: 32px; }
    .breakdown-section h2, .quick-actions h2, .recent-section h2, .trend-section h2 {
      color: #00f2fe; margin-bottom: 16px; font-size: 1.2rem;
    }
    .breakdown-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 16px;
    }
    .breakdown-card {
      background: rgba(26, 26, 46, 0.6); backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 242, 254, 0.15); border-radius: 14px; padding: 20px;
    }
    .breakdown-card h3 {
      color: #e0e0e0; font-size: 0.95rem; margin: 0 0 16px; display: flex; align-items: center; gap: 8px;
    }
    .breakdown-card h3 i { color: #00f2fe; }
    .bar-list { display: flex; flex-direction: column; gap: 10px; }
    .bar-item { }
    .bar-label { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.85rem; }
    .bar-label span:first-child { color: #d1d5db; text-transform: capitalize; }
    .bar-count { color: #00f2fe; font-weight: 600; }
    .bar-track {
      height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 3px; overflow: hidden;
    }
    .bar-fill {
      height: 100%; background: linear-gradient(90deg, #00f2fe, #00d4ff);
      border-radius: 3px; transition: width 0.6s ease;
    }
    .bar-fill.role-fill { background: linear-gradient(90deg, #a855f7, #7c3aed); }

    /* Quick Actions */
    .action-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px; margin-bottom: 32px;
    }
    .action-card {
      background: rgba(26, 26, 46, 0.6); backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 242, 254, 0.15); border-radius: 12px;
      padding: 20px; display: flex; flex-direction: column; align-items: center;
      gap: 10px; text-decoration: none; color: #e0e0e0;
      transition: all 0.3s ease; cursor: pointer; position: relative;
    }
    .action-card:hover {
      transform: translateY(-3px); border-color: #00f2fe;
      box-shadow: 0 0 20px rgba(0, 242, 254, 0.2);
    }
    .action-card i { font-size: 2.2rem; color: #00f2fe; }
    .action-card span { font-size: 0.85rem; text-align: center; }
    .action-badge {
      position: absolute; top: 8px; right: 8px;
      min-width: 22px; height: 22px; border-radius: 11px;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.7rem; font-weight: 700; padding: 0 6px;
    }
    .timeoff-badge { background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.4); }
    .paycheck-badge { background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.4); }

    /* Headcount Trend */
    .trend-section { margin-bottom: 32px; }
    .trend-row {
      display: flex; gap: 8px; overflow-x: auto; padding: 4px 0;
    }
    .trend-item {
      background: rgba(26, 26, 46, 0.6); border: 1px solid rgba(0, 242, 254, 0.15);
      border-radius: 10px; padding: 12px 16px; min-width: 80px;
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      flex-shrink: 0;
    }
    .trend-value { font-size: 1.3rem; font-weight: 700; color: #00f2fe; }
    .trend-month { font-size: 0.7rem; color: #9ca3af; text-transform: uppercase; }

    /* Recent Activity */
    .activity-list {
      background: rgba(26, 26, 46, 0.6); backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 242, 254, 0.15); border-radius: 14px; padding: 8px;
    }
    .activity-empty {
      padding: 40px; text-align: center; color: #6b7280;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .activity-empty i { font-size: 2rem; }
    .activity-item {
      display: flex; gap: 14px; padding: 14px; border-radius: 10px;
      transition: background 0.2s;
    }
    .activity-item:hover { background: rgba(255, 255, 255, 0.03); }
    .activity-icon-wrap {
      width: 36px; height: 36px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .activity-icon-wrap i { font-size: 1.2rem; }
    .activity-icon-wrap.timeoff { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
    .activity-icon-wrap.timeoff i { color: #fbbf24; }
    .activity-icon-wrap.paycheck { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .activity-icon-wrap.paycheck i { color: #3b82f6; }
    .activity-icon-wrap.document { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
    .activity-icon-wrap.document i { color: #22c55e; }
    .activity-icon-wrap.attendance { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
    .activity-icon-wrap.attendance i { color: #a855f7; }

    .activity-content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .activity-content strong { color: #e0e0e0; font-size: 0.9rem; }
    .activity-content span { color: #9ca3af; font-size: 0.8rem; }
    .time { font-size: 0.75rem !important; color: #6b7280 !important; }
  `]
})
export class HrDashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  loading = signal(false);
  stats = signal({
    totalEmployees: 0,
    activeEmployees: 0,
    pendingTimeOff: 0,
    presentToday: 0,
    pendingPaychecks: 0,
    bulkStaging: 0
  });

  byDepartment = signal<any[]>([]);
  byRole = signal<any[]>([]);
  maxDeptCount = signal(1);
  maxRoleCount = signal(1);
  snapshots = signal<any[]>([]);
  recentActivity = signal<any[]>([]);

  ngOnInit() {
    this.loadAll();
  }

  async loadAll() {
    this.loading.set(true);
    await Promise.all([
      this.loadRosterSummary(),
      this.loadTimeOff(),
      this.loadAttendance(),
      this.loadPaychecks(),
      this.loadStaging(),
      this.loadSnapshots(),
      this.loadRecentActivity()
    ]);
    this.loading.set(false);
  }

  async loadRosterSummary() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-roster/summary`).toPromise();
      this.stats.update(s => ({
        ...s,
        totalEmployees: res?.totalEmployees || 0,
        activeEmployees: res?.activeEmployees || 0
      }));
      const depts = (res?.byDepartment || []).sort((a: any, b: any) => b.count - a.count);
      const roles = (res?.byRole || []).sort((a: any, b: any) => b.count - a.count);
      this.byDepartment.set(depts);
      this.byRole.set(roles);
      this.maxDeptCount.set(depts[0]?.count || 1);
      this.maxRoleCount.set(roles[0]?.count || 1);
    } catch { }
  }

  async loadTimeOff() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/time-off/requests?status=pending&pageSize=100`).toPromise();
      const count = res?.data?.length || res?.total || 0;
      this.stats.update(s => ({ ...s, pendingTimeOff: count }));
    } catch { }
  }

  async loadAttendance() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/attendance?date=${today}&pageSize=1000`).toPromise();
      const count = res?.data?.length || 0;
      this.stats.update(s => ({ ...s, presentToday: count }));
    } catch { }
  }

  async loadPaychecks() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/paychecks?status=pending&pageSize=100`).toPromise();
      const count = res?.data?.length || res?.total || 0;
      this.stats.update(s => ({ ...s, pendingPaychecks: count }));
    } catch { }
  }

  async loadStaging() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-data/staging`).toPromise();
      const count = res?.data?.length || res?.total || 0;
      this.stats.update(s => ({ ...s, bulkStaging: count }));
    } catch { }
  }

  async loadSnapshots() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-snapshots`).toPromise();
      const snaps = (res?.data || []).slice(0, 12).reverse();
      this.snapshots.set(snaps);
    } catch { }
  }

  async loadRecentActivity() {
    const activities: any[] = [];

    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/time-off/requests?pageSize=5`).toPromise();
      for (const r of (res?.data || [])) {
        activities.push({
          id: 'to-' + r.id,
          icon: r.status === 'approved' ? 'bx-check-circle' : r.status === 'denied' ? 'bx-x-circle' : 'bx-calendar-event',
          title: `Time Off ${r.status === 'approved' ? 'Approved' : r.status === 'denied' ? 'Denied' : 'Requested'}`,
          description: `${r.employeeName || 'Employee'} - ${r.startDate ? new Date(r.startDate).toLocaleDateString() : ''} to ${r.endDate ? new Date(r.endDate).toLocaleDateString() : ''}`,
          time: this.timeAgo(r.createdAt || r.requestedAt),
          date: new Date(r.createdAt || r.requestedAt || 0),
          category: 'timeoff'
        });
      }
    } catch { }

    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/paychecks?pageSize=5`).toPromise();
      for (const p of (res?.data || [])) {
        activities.push({
          id: 'pc-' + p.id,
          icon: p.status === 'paid' ? 'bx-check-double' : 'bx-money',
          title: `Paycheck ${p.status === 'paid' ? 'Paid' : p.status === 'approved' ? 'Approved' : 'Created'}`,
          description: `${p.employeeName || 'Employee'} - $${(p.netPay || p.grossPay || 0).toLocaleString()}`,
          time: this.timeAgo(p.createdAt),
          date: new Date(p.createdAt || 0),
          category: 'paycheck'
        });
      }
    } catch { }

    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-documents?pageSize=5`).toPromise();
      for (const d of (res?.data || [])) {
        activities.push({
          id: 'doc-' + d.id,
          icon: 'bx-file',
          title: 'Document Uploaded',
          description: `${d.documentType || d.fileName || 'Document'} - ${d.employeeName || 'Employee'}`,
          time: this.timeAgo(d.createdAt || d.uploadedAt),
          date: new Date(d.createdAt || d.uploadedAt || 0),
          category: 'document'
        });
      }
    } catch { }

    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/attendance?pageSize=5`).toPromise();
      for (const a of (res?.data || [])) {
        activities.push({
          id: 'att-' + a.id,
          icon: 'bx-log-in',
          title: a.clockOut ? 'Clocked Out' : 'Clocked In',
          description: `${a.employeeName || 'Employee'} - ${a.workedHours ? a.workedHours.toFixed(1) + 'h' : 'active'}`,
          time: this.timeAgo(a.clockIn || a.createdAt),
          date: new Date(a.clockIn || a.createdAt || 0),
          category: 'attendance'
        });
      }
    } catch { }

    activities.sort((a, b) => b.date.getTime() - a.date.getTime());
    this.recentActivity.set(activities.slice(0, 10));
  }

  getBarWidth(count: number, max: number): number {
    return max > 0 ? (count / max) * 100 : 0;
  }

  formatMonth(month: string): string {
    if (!month) return '';
    const [y, m] = month.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
  }

  timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }
}
