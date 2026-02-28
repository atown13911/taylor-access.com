import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { NgxChartsModule, Color, ScaleType } from '@swimlane/ngx-charts';

@Component({
  selector: 'app-hr-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NgxChartsModule],
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
          <div><span class="stat-value">{{ stats().totalEmployees }}</span><span class="stat-label">Total Employees</span></div>
        </div>
        <div class="stat-card active-card">
          <i class="bx bx-user-check stat-icon"></i>
          <div><span class="stat-value">{{ stats().activeEmployees }}</span><span class="stat-label">Active</span></div>
        </div>
        <div class="stat-card timeoff">
          <i class="bx bx-calendar-event stat-icon"></i>
          <div><span class="stat-value">{{ stats().pendingTimeOff }}</span><span class="stat-label">Pending Time Off</span></div>
        </div>
        <div class="stat-card attendance">
          <i class="bx bx-time-five stat-icon"></i>
          <div><span class="stat-value">{{ dashStats().uniqueUsersToday || stats().presentToday }}</span><span class="stat-label">Logged In Today</span></div>
        </div>
        <div class="stat-card payroll">
          <i class="bx bx-money stat-icon"></i>
          <div><span class="stat-value">{{ stats().pendingPaychecks }}</span><span class="stat-label">Pending Paychecks</span></div>
        </div>
        <a routerLink="/hr/roster" [queryParams]="{tab: 'bulk'}" class="stat-card staging clickable">
          <i class="bx bx-table stat-icon"></i>
          <div><span class="stat-value">{{ stats().bulkStaging }}</span><span class="stat-label">Bulk Staging</span></div>
        </a>
      </div>

      <!-- Row 2: Work Hours Charts -->
      <div class="chart-section">
        <h2><i class="bx bx-line-chart"></i> Work Hours</h2>
        <div class="chart-grid-2">
          <div class="chart-card">
            <h3>Daily Work Hours (Last 30 Days)</h3>
            @if (dailyHoursData().length > 0) {
              <ngx-charts-line-chart
                [results]="dailyHoursChartData"
                [view]="[chartWidth, 250]"
                [scheme]="lineScheme"
                [xAxis]="true"
                [yAxis]="true"
                [showXAxisLabel]="false"
                [showYAxisLabel]="true"
                [yAxisLabel]="'Hours'"
                [autoScale]="true"
                [animations]="true"
                [gradient]="true">
              </ngx-charts-line-chart>
            } @else {
              <div class="chart-empty">No session data yet</div>
            }
          </div>
          <div class="chart-card">
            <h3>Top Employees This Week (Hours)</h3>
            @if (employeeHoursData().length > 0) {
              <ngx-charts-bar-horizontal
                [results]="employeeHoursData()"
                [view]="[chartWidth, 250]"
                [scheme]="barScheme"
                [xAxis]="true"
                [yAxis]="true"
                [showXAxisLabel]="true"
                [xAxisLabel]="'Hours'"
                [gradient]="true">
              </ngx-charts-bar-horizontal>
            } @else {
              <div class="chart-empty">No data this week</div>
            }
          </div>
        </div>
      </div>

      <!-- Row 3: Workforce Breakdown -->
      @if (deptChartData().length > 0 || roleChartData().length > 0) {
        <div class="chart-section">
          <h2><i class="bx bx-pie-chart-alt"></i> Workforce Breakdown</h2>
          <div class="chart-grid-2">
            @if (deptChartData().length > 0) {
              <div class="chart-card">
                <h3>By Department</h3>
                <ngx-charts-pie-chart
                  [results]="deptChartData()"
                  [view]="[chartWidth, 300]"
                  [scheme]="pieScheme"
                  [doughnut]="true"
                  [labels]="true"
                  [trimLabels]="true"
                  [maxLabelLength]="15"
                  [animations]="true"
                  [gradient]="true">
                </ngx-charts-pie-chart>
              </div>
            }
            @if (roleChartData().length > 0) {
              <div class="chart-card">
                <h3>By Role</h3>
                <ngx-charts-pie-chart
                  [results]="roleChartData()"
                  [view]="[chartWidth, 300]"
                  [scheme]="roleScheme"
                  [doughnut]="true"
                  [labels]="true"
                  [trimLabels]="true"
                  [maxLabelLength]="15"
                  [animations]="true"
                  [gradient]="true">
                </ngx-charts-pie-chart>
              </div>
            }
          </div>
        </div>
      }

      <!-- Row 4: Clock-In Distribution -->
      <div class="chart-section">
        <h2><i class="bx bx-time"></i> Clock-In Patterns (Today)</h2>
        <div class="chart-grid-2">
          <div class="chart-card">
            <h3>Login Time Distribution</h3>
            @if (clockInData().length > 0) {
              <ngx-charts-bar-vertical
                [results]="clockInData()"
                [view]="[chartWidth, 250]"
                [scheme]="clockScheme"
                [xAxis]="true"
                [yAxis]="true"
                [showXAxisLabel]="true"
                [xAxisLabel]="'Time of Day'"
                [showYAxisLabel]="true"
                [yAxisLabel]="'Logins'"
                [gradient]="true"
                [animations]="true">
              </ngx-charts-bar-vertical>
            } @else {
              <div class="chart-empty">No logins today</div>
            }
          </div>
          <div class="chart-card">
            <h3>Headcount Trend</h3>
            @if (headcountData().length > 0) {
              <ngx-charts-area-chart
                [results]="headcountChartData"
                [view]="[chartWidth, 250]"
                [scheme]="areaScheme"
                [xAxis]="true"
                [yAxis]="true"
                [autoScale]="true"
                [gradient]="true"
                [animations]="true">
              </ngx-charts-area-chart>
            } @else {
              <div class="chart-empty">No trend data</div>
            }
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <h2>Quick Actions</h2>
        <div class="action-grid">
          <a routerLink="/hr/paychecks" class="action-card"><i class="bx bx-money"></i><span>Process Payroll</span>
            @if (stats().pendingPaychecks > 0) { <span class="action-badge paycheck-badge">{{ stats().pendingPaychecks }}</span> }
          </a>
          <a routerLink="/hr/time-off" class="action-card"><i class="bx bx-calendar-event"></i><span>Review Time Off</span>
            @if (stats().pendingTimeOff > 0) { <span class="action-badge timeoff-badge">{{ stats().pendingTimeOff }}</span> }
          </a>
          <a routerLink="/hr/time-clock" class="action-card"><i class="bx bx-time-five"></i><span>Time Clock</span></a>
          <a routerLink="/hr/documents" class="action-card"><i class="bx bx-folder"></i><span>HR Documents</span></a>
          <a routerLink="/hr/roster" class="action-card"><i class="bx bx-id-card"></i><span>Employee Roster</span></a>
          <a routerLink="/compliance/dot" class="action-card"><i class="bx bx-shield-alt-2"></i><span>DOT Compliance</span></a>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="recent-section">
        <h2>Recent Activity</h2>
        @if (recentActivity().length === 0) {
          <div class="activity-list"><div class="activity-empty"><i class="bx bx-history"></i><span>No recent activity found</span></div></div>
        } @else {
          <div class="activity-list">
            @for (activity of recentActivity(); track activity.id) {
              <div class="activity-item">
                <div class="activity-icon-wrap" [class]="activity.category"><i [class]="'bx ' + activity.icon"></i></div>
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
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .page-header h1 { color: #00f2fe; font-size: 2rem; margin: 0 0 8px 0; display: flex; align-items: center; gap: 12px; text-shadow: 0 0 20px rgba(0,242,254,0.5); }
    .page-header p { color: #9ca3af; margin: 0; }
    .btn-refresh { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; border: 1px solid rgba(0,242,254,0.3); background: rgba(0,242,254,0.1); color: #00f2fe; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
    .btn-refresh:hover:not(:disabled) { background: rgba(0,242,254,0.2); }
    .btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 24px 0 32px; }
    .stat-card {
      background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
      padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s ease;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
    .stat-card:hover { transform: translateY(-3px); box-shadow: 0 0 25px rgba(0,242,254,0.2); }
    .stat-card.clickable { cursor: pointer; text-decoration: none; }
    .stat-icon { font-size: 2.2rem; }
    .stat-value { font-size: 1.8rem; font-weight: 700; display: block; }
    .stat-label { font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card.total .stat-icon, .stat-card.total .stat-value { color: #00d4ff; }
    .stat-card.active-card .stat-icon, .stat-card.active-card .stat-value { color: #22c55e; }
    .stat-card.timeoff .stat-icon, .stat-card.timeoff .stat-value { color: #fbbf24; }
    .stat-card.attendance .stat-icon, .stat-card.attendance .stat-value { color: #a855f7; }
    .stat-card.payroll .stat-icon, .stat-card.payroll .stat-value { color: #3b82f6; }
    .stat-card.staging .stat-icon, .stat-card.staging .stat-value { color: #00f2fe; }

    .chart-section { margin-bottom: 32px; }
    .chart-section h2 { color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; display: flex; align-items: center; gap: 8px; i { color: var(--cyan); } }
    .chart-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .chart-card {
      background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 20px; overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      h3 { color: #ccc; font-size: 0.85rem; margin: 0 0 16px; font-weight: 500; }
    }
    .chart-empty { text-align: center; padding: 40px; color: #555; font-size: 0.85rem; }

    ::ng-deep .ngx-charts { text { fill: #aaa !important; } .gridline-path { stroke: rgba(255,255,255,0.06) !important; } }
    ::ng-deep .ngx-charts .tick text { fill: #888 !important; font-size: 10px !important; }
    ::ng-deep .ngx-charts .label { fill: #ccc !important; font-size: 11px !important; }
    ::ng-deep ngx-charts-line-chart, ::ng-deep ngx-charts-bar-horizontal, ::ng-deep ngx-charts-pie-chart,
    ::ng-deep ngx-charts-bar-vertical, ::ng-deep ngx-charts-area-chart { display: block; position: relative; z-index: 0; }

    .quick-actions { margin-bottom: 32px; }
    .quick-actions h2 { color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; }
    .action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .action-card {
      background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
      padding: 20px; text-align: center; cursor: pointer; text-decoration: none;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      transition: all 0.3s; position: relative;
      i { font-size: 2rem; color: var(--cyan); }
      span { color: #ccc; font-size: 0.82rem; font-weight: 500; }
      &:hover { border-color: var(--cyan); transform: translateY(-2px); box-shadow: 0 0 20px rgba(0,212,255,0.15); }
    }
    .action-badge { position: absolute; top: 8px; right: 8px; background: #ff2a6d; color: #fff; font-size: 0.65rem; padding: 2px 6px; border-radius: 8px; font-weight: 700; }

    .recent-section h2 { color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; }
    .activity-list {
      background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden;
    }
    .activity-empty { padding: 40px; text-align: center; color: #555; display: flex; flex-direction: column; align-items: center; gap: 8px; i { font-size: 2rem; } }
    .activity-item { display: flex; align-items: flex-start; gap: 14px; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s; }
    .activity-item:hover { background: rgba(255,255,255,0.02); }
    .activity-item:last-child { border-bottom: none; }
    .activity-icon-wrap {
      width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      &.timeoff { background: rgba(251,191,36,0.15); color: #fbbf24; }
      &.paycheck { background: rgba(59,130,246,0.15); color: #3b82f6; }
      &.document { background: rgba(0,212,255,0.15); color: #00d4ff; }
      &.attendance { background: rgba(168,85,247,0.15); color: #a855f7; }
    }
    .activity-content { display: flex; flex-direction: column; gap: 2px;
      strong { color: #e0f7ff; font-size: 0.85rem; }
      span { color: #888; font-size: 0.8rem; }
      .time { font-size: 0.72rem; color: #555; }
    }

    @media (max-width: 900px) { .chart-grid-2 { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .action-grid { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class HrDashboardComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private resizeHandler = () => this.updateChartWidth();

  loading = signal(false);
  stats = signal({ totalEmployees: 0, activeEmployees: 0, pendingTimeOff: 0, presentToday: 0, pendingPaychecks: 0, bulkStaging: 0 });
  dashStats = signal<any>({});
  recentActivity = signal<any[]>([]);

  // Chart data
  dailyHoursData = signal<any[]>([]);
  employeeHoursData = signal<any[]>([]);
  deptChartData = signal<any[]>([]);
  roleChartData = signal<any[]>([]);
  clockInData = signal<any[]>([]);
  headcountData = signal<any[]>([]);

  chartWidth = 480;

  lineScheme: Color = { name: 'line', selectable: true, group: ScaleType.Ordinal, domain: ['#00e5ff'] };
  barScheme: Color = { name: 'bar', selectable: true, group: ScaleType.Ordinal, domain: ['#00e5ff'] };
  pieScheme: Color = { name: 'pie', selectable: true, group: ScaleType.Ordinal, domain: ['#00e5ff', '#a855f7', '#00ff88', '#ffaa00', '#ff2a6d', '#818cf8', '#06b6d4', '#f97316', '#22c55e', '#ec4899'] };
  roleScheme: Color = { name: 'role', selectable: true, group: ScaleType.Ordinal, domain: ['#a855f7', '#818cf8', '#06b6d4', '#00e5ff', '#00ff88', '#ffaa00', '#f97316', '#ff2a6d', '#22c55e', '#ec4899'] };
  clockScheme: Color = { name: 'clock', selectable: true, group: ScaleType.Ordinal, domain: ['#ffaa00', '#00e5ff', '#a855f7', '#1a1a4e'] };
  areaScheme: Color = { name: 'area', selectable: true, group: ScaleType.Ordinal, domain: ['#00ff88'] };

  get dailyHoursChartData() {
    return [{ name: 'Hours', series: this.dailyHoursData().map(d => ({ name: d.name, value: d.value })) }];
  }

  get headcountChartData() {
    return [{ name: 'Headcount', series: this.headcountData().map(d => ({ name: d.name, value: d.value })) }];
  }

  ngOnInit(): void {
    this.updateChartWidth();
    window.addEventListener('resize', this.resizeHandler);
    this.loadAll();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
  }

  updateChartWidth(): void {
    const w = window.innerWidth;
    this.chartWidth = w > 1400 ? 580 : w > 1000 ? 480 : w > 700 ? 400 : w - 80;
  }

  async loadAll() {
    this.loading.set(true);
    await Promise.all([
      this.loadRosterSummary(),
      this.loadTimeOff(),
      this.loadPaychecks(),
      this.loadStaging(),
      this.loadDashboardStats(),
      this.loadSnapshots(),
      this.loadRecentActivity()
    ]);
    this.loading.set(false);
  }

  async loadRosterSummary() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-roster/summary`).toPromise();
      this.stats.update(s => ({ ...s, totalEmployees: res?.totalEmployees || 0, activeEmployees: res?.activeEmployees || 0 }));
      const depts = (res?.byDepartment || []).sort((a: any, b: any) => b.count - a.count);
      const roles = (res?.byRole || []).sort((a: any, b: any) => b.count - a.count);
      this.deptChartData.set(depts.slice(0, 10).map((d: any) => ({ name: d.department || 'Unassigned', value: d.count })));
      this.roleChartData.set(roles.slice(0, 10).map((r: any) => ({ name: r.role || 'Unassigned', value: r.count })));
    } catch {}
  }

  async loadTimeOff() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/time-off/requests?status=pending&pageSize=100`).toPromise();
      this.stats.update(s => ({ ...s, pendingTimeOff: res?.data?.length || res?.total || 0 }));
    } catch {}
  }

  async loadPaychecks() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/paychecks?status=pending&pageSize=100`).toPromise();
      this.stats.update(s => ({ ...s, pendingPaychecks: res?.data?.length || res?.total || 0 }));
    } catch {}
  }

  async loadStaging() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-data/staging`).toPromise();
      this.stats.update(s => ({ ...s, bulkStaging: res?.data?.length || res?.total || 0 }));
    } catch {}
  }

  async loadDashboardStats() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/sessions/dashboard`).toPromise();
      this.dashStats.set(res || {});

      // Daily hours line chart
      const daily = (res?.dailyHours || []).map((d: any) => ({
        name: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: d.totalHours
      }));
      this.dailyHoursData.set(daily);

      // Employee hours bar chart
      const empHours = (res?.employeeHoursThisWeek || []).map((e: any) => ({ name: e.name, value: e.hours }));
      this.employeeHoursData.set(empHours);

      // Clock-in distribution
      const dist = res?.clockInDistribution || {};
      this.clockInData.set([
        { name: 'Morning (5-12)', value: dist.morning || 0 },
        { name: 'Afternoon (12-5)', value: dist.afternoon || 0 },
        { name: 'Evening (5-9)', value: dist.evening || 0 },
        { name: 'Night (9-5)', value: dist.night || 0 }
      ]);
    } catch {}
  }

  async loadSnapshots() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-snapshots`).toPromise();
      const snaps = (res?.data || []).slice(0, 12).reverse();
      this.headcountData.set(snaps.map((s: any) => ({
        name: this.formatMonth(s.month),
        value: s.activeCount || 0
      })));
    } catch {}
  }

  async loadRecentActivity() {
    const activities: any[] = [];
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/time-off/requests?pageSize=5`).toPromise();
      for (const r of (res?.data || [])) {
        activities.push({ id: 'to-' + r.id, icon: r.status === 'approved' ? 'bx-check-circle' : r.status === 'denied' ? 'bx-x-circle' : 'bx-calendar-event', title: `Time Off ${r.status === 'approved' ? 'Approved' : r.status === 'denied' ? 'Denied' : 'Requested'}`, description: `${r.employeeName || 'Employee'} - ${r.startDate ? new Date(r.startDate).toLocaleDateString() : ''}`, time: this.timeAgo(r.createdAt || r.requestedAt), date: new Date(r.createdAt || r.requestedAt || 0), category: 'timeoff' });
      }
    } catch {}
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-documents?pageSize=5`).toPromise();
      for (const d of (res?.data || [])) {
        activities.push({ id: 'doc-' + d.id, icon: 'bx-file', title: 'Document Uploaded', description: `${d.documentType || d.fileName || 'Document'} - ${d.employeeName || 'Employee'}`, time: this.timeAgo(d.createdAt || d.uploadedAt), date: new Date(d.createdAt || d.uploadedAt || 0), category: 'document' });
      }
    } catch {}
    activities.sort((a, b) => b.date.getTime() - a.date.getTime());
    this.recentActivity.set(activities.slice(0, 10));
  }

  formatMonth(month: string): string {
    if (!month) return '';
    const [y, m] = month.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
  }

  timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
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
