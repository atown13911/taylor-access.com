import { Component, signal, computed, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom, catchError, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { NgxChartsModule, Color, ScaleType } from '@swimlane/ngx-charts';

interface RosterSummary {
  totalEmployees: number;
  activeEmployees: number;
  byDepartment: { department: string; count: number }[];
  byRole: { role: string; count: number }[];
}

interface SessionDashboard {
  dailyHours: { date: string; totalHours: number; sessionCount: number }[];
  employeeHoursThisWeek: { name: string; hours: number }[];
  clockInDistribution: { morning: number; afternoon: number; evening: number; night: number };
  uniqueUsersToday: number;
  totalSessionsToday: number;
}

interface ChartPoint { name: string; value: number; }
interface ActivityItem { id: string; icon: string; title: string; description: string; time: string; date: Date; category: string; }
interface ActionAlert { id: string; level: 'high' | 'medium' | 'low'; icon: string; title: string; detail: string; }
interface InsightItem { id: string; tone: 'positive' | 'warning' | 'neutral'; title: string; detail: string; }

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
          <div>
            <span class="stat-value">{{ stats().activeEmployees }}</span>
            <span class="stat-label">Active</span>
            <span class="stat-delta" [class.up]="activeEmployeesDelta() >= 0" [class.down]="activeEmployeesDelta() < 0">{{ activeEmployeesDeltaLabel() }}</span>
          </div>
        </div>
        <div class="stat-card timeoff">
          <i class="bx bx-calendar-event stat-icon"></i>
          <div><span class="stat-value">{{ stats().pendingTimeOff }}</span><span class="stat-label">Pending Time Off</span></div>
        </div>
        <div class="stat-card attendance">
          <i class="bx bx-time-five stat-icon"></i>
          <div><span class="stat-value">{{ dashStats()?.uniqueUsersToday ?? stats().presentToday }}</span><span class="stat-label">Logged In Today</span></div>
        </div>
        <div class="stat-card payroll">
          <i class="bx bx-money stat-icon"></i>
          <div><span class="stat-value">{{ stats().pendingPaychecks }}</span><span class="stat-label">Pending Paychecks</span></div>
        </div>
        <a routerLink="/hr/roster" [queryParams]="{tab: 'bulk'}" class="stat-card staging clickable">
          <i class="bx bx-table stat-icon"></i>
          <div><span class="stat-value">{{ stats().bulkStaging }}</span><span class="stat-label">Bulk Staging</span></div>
        </a>
        <div class="stat-card inactive">
          <i class="bx bx-user-x stat-icon"></i>
          <div><span class="stat-value">{{ inactiveEmployees() }}</span><span class="stat-label">Inactive</span></div>
        </div>
        <div class="stat-card sessioncount">
          <i class="bx bx-pulse stat-icon"></i>
          <div>
            <span class="stat-value">{{ dashStats()?.totalSessionsToday ?? 0 }}</span>
            <span class="stat-label">Sessions Today</span>
            <span class="stat-delta" [class.up]="sessionsDeltaVsYesterday() >= 0" [class.down]="sessionsDeltaVsYesterday() < 0">{{ sessionsDeltaLabel() }}</span>
          </div>
        </div>
        <div class="stat-card login-rate">
          <i class="bx bx-signal-5 stat-icon"></i>
          <div><span class="stat-value">{{ loginCoveragePercent() }}%</span><span class="stat-label">Login Coverage</span></div>
        </div>
        <div class="stat-card avg-hours">
          <i class="bx bx-line-chart-down stat-icon"></i>
          <div>
            <span class="stat-value">{{ averageDailyHours30d() }}</span>
            <span class="stat-label">Avg Hours / Day</span>
            <span class="stat-delta" [class.up]="hoursDeltaVsYesterday() >= 0" [class.down]="hoursDeltaVsYesterday() < 0">{{ hoursDeltaLabel() }}</span>
          </div>
        </div>
        <div class="stat-card peak-shift">
          <i class="bx bx-timer stat-icon"></i>
          <div><span class="stat-value">{{ peakShiftLabel() }}</span><span class="stat-label">Peak Login Window</span></div>
        </div>
        <div class="stat-card lead-dept">
          <i class="bx bx-building-house stat-icon"></i>
          <div><span class="stat-value">{{ topDepartmentName() }}</span><span class="stat-label">Largest Department</span></div>
        </div>
        <div class="stat-card lead-role">
          <i class="bx bx-id-card stat-icon"></i>
          <div><span class="stat-value">{{ topRoleName() }}</span><span class="stat-label">Largest Role</span></div>
        </div>
        <div class="stat-card growth">
          <i class="bx bx-trending-up stat-icon"></i>
          <div><span class="stat-value">{{ headcountDelta30d() }}</span><span class="stat-label">30d Headcount Delta</span></div>
        </div>
        <div class="stat-card training">
          <i class="bx bx-book-open stat-icon"></i>
          <div><span class="stat-value">{{ trainingCoveragePercent() }}%</span><span class="stat-label">Training Coverage</span></div>
        </div>
        <div class="stat-card absence">
          <i class="bx bx-calendar-x stat-icon"></i>
          <div><span class="stat-value">{{ absenteeismProxyPercent() }}%</span><span class="stat-label">Absenteeism Risk</span></div>
        </div>
        <div class="stat-card pending-actions">
          <i class="bx bx-error-circle stat-icon"></i>
          <div><span class="stat-value">{{ pendingActionsTotal() }}</span><span class="stat-label">Pending Actions</span></div>
        </div>
      </div>

      <!-- Action Needed -->
      <div class="chart-section">
        <h2><i class="bx bx-bell"></i> Action Needed</h2>
        @if (actionAlerts().length > 0) {
          <div class="alert-grid">
            @for (alert of actionAlerts(); track alert.id) {
              <div class="alert-card" [class.level-high]="alert.level === 'high'" [class.level-medium]="alert.level === 'medium'" [class.level-low]="alert.level === 'low'">
                <div class="alert-icon"><i class="bx" [class]="alert.icon"></i></div>
                <div class="alert-copy">
                  <strong>{{ alert.title }}</strong>
                  <span>{{ alert.detail }}</span>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="chart-card"><div class="chart-empty">No critical alerts right now</div></div>
        }
      </div>

      <!-- AI Insights -->
      <div class="chart-section">
        <h2><i class="bx bx-bot"></i> AI Insights</h2>
        <div class="insight-grid">
          @for (insight of aiInsights(); track insight.id) {
            <div class="insight-card" [class.tone-positive]="insight.tone === 'positive'" [class.tone-warning]="insight.tone === 'warning'" [class.tone-neutral]="insight.tone === 'neutral'">
              <strong>{{ insight.title }}</strong>
              <span>{{ insight.detail }}</span>
            </div>
          }
        </div>
      </div>

      <!-- Row 2: Work Hours Charts -->
      <div class="chart-section">
        <h2><i class="bx bx-line-chart"></i> Work Hours</h2>
        <div class="chart-grid-2">
          <div class="chart-card">
            <h3>Daily Work Hours (Last 30 Days)</h3>
            @if (dailyHoursData().length > 0) {
              <ngx-charts-line-chart
                [results]="dailyHoursChartData()"
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
          <h2><i class="bx bx-bar-chart-alt-2"></i> Workforce Breakdown</h2>
          <div class="breakdown-filters">
            @if (selectedDepartment()) {
              <button class="filter-chip" (click)="clearDepartmentFilter()"><i class="bx bx-building-house"></i> Dept: {{ selectedDepartment() }} <i class="bx bx-x"></i></button>
            }
            @if (selectedRole()) {
              <button class="filter-chip" (click)="clearRoleFilter()"><i class="bx bx-id-card"></i> Role: {{ selectedRole() }} <i class="bx bx-x"></i></button>
            }
            @if (selectedDepartment() || selectedRole()) {
              <button class="filter-chip clear-all" (click)="clearWorkforceFilters()"><i class="bx bx-reset"></i> Clear Filters</button>
            }
          </div>
          <div class="chart-grid-2">
            @if (deptChartData().length > 0) {
              <div class="chart-card">
                <h3>By Department</h3>
                <ngx-charts-bar-horizontal
                  [results]="deptChartData()"
                  [view]="[chartWidth, 300]"
                  [scheme]="pieScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [showXAxisLabel]="true"
                  [xAxisLabel]="'Employees'"
                  (select)="onDepartmentChartSelect($event)"
                  [animations]="true"
                  [gradient]="true">
                </ngx-charts-bar-horizontal>
              </div>
            }
            @if (roleChartData().length > 0) {
              <div class="chart-card">
                <h3>By Role</h3>
                <ngx-charts-bar-horizontal
                  [results]="roleChartData()"
                  [view]="[chartWidth, 300]"
                  [scheme]="roleScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [showXAxisLabel]="true"
                  [xAxisLabel]="'Employees'"
                  (select)="onRoleChartSelect($event)"
                  [animations]="true"
                  [gradient]="true">
                </ngx-charts-bar-horizontal>
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
                [results]="headcountChartData()"
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

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 12px; margin: 20px 0 28px; }
    .stat-card {
      background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
      padding: 14px 12px; display: flex; align-items: center; gap: 10px; transition: all 0.3s ease;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      min-height: 84px;
    }
    .stat-card:hover { transform: translateY(-3px); box-shadow: 0 0 25px rgba(0,242,254,0.2); }
    .stat-card.clickable { cursor: pointer; text-decoration: none; }
    .stat-icon { font-size: 1.35rem; }
    .stat-value { font-size: 1.15rem; font-weight: 700; display: block; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
    .stat-label { font-size: 0.66rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-delta { display: block; margin-top: 3px; font-size: 0.68rem; font-weight: 600; color: #93c5fd; }
    .stat-delta.up { color: #22c55e; }
    .stat-delta.down { color: #f97316; }
    .stat-card.total .stat-icon, .stat-card.total .stat-value { color: #00d4ff; }
    .stat-card.active-card .stat-icon, .stat-card.active-card .stat-value { color: #22c55e; }
    .stat-card.timeoff .stat-icon, .stat-card.timeoff .stat-value { color: #fbbf24; }
    .stat-card.attendance .stat-icon, .stat-card.attendance .stat-value { color: #a855f7; }
    .stat-card.payroll .stat-icon, .stat-card.payroll .stat-value { color: #3b82f6; }
    .stat-card.staging .stat-icon, .stat-card.staging .stat-value { color: #00f2fe; }
    .stat-card.inactive .stat-icon, .stat-card.inactive .stat-value { color: #fb7185; }
    .stat-card.sessioncount .stat-icon, .stat-card.sessioncount .stat-value { color: #60a5fa; }
    .stat-card.login-rate .stat-icon, .stat-card.login-rate .stat-value { color: #2dd4bf; }
    .stat-card.avg-hours .stat-icon, .stat-card.avg-hours .stat-value { color: #facc15; }
    .stat-card.peak-shift .stat-icon, .stat-card.peak-shift .stat-value { color: #c084fc; }
    .stat-card.lead-dept .stat-icon, .stat-card.lead-dept .stat-value { color: #22d3ee; }
    .stat-card.lead-role .stat-icon, .stat-card.lead-role .stat-value { color: #38bdf8; }
    .stat-card.growth .stat-icon, .stat-card.growth .stat-value { color: #34d399; }
    .stat-card.training .stat-icon, .stat-card.training .stat-value { color: #14b8a6; }
    .stat-card.absence .stat-icon, .stat-card.absence .stat-value { color: #f59e0b; }
    .stat-card.pending-actions .stat-icon, .stat-card.pending-actions .stat-value { color: #ef4444; }

    .chart-section { margin-bottom: 32px; }
    .chart-section h2 { color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; display: flex; align-items: center; gap: 8px; i { color: var(--cyan); } }
    .chart-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .alert-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .alert-card {
      background: rgba(255,255,255,0.04); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(255,255,255,0.09); border-radius: 12px; padding: 12px;
      display: flex; align-items: center; gap: 10px; min-height: 72px;
    }
    .alert-card.level-high { border-color: rgba(239, 68, 68, 0.45); box-shadow: 0 0 16px rgba(239, 68, 68, 0.14); }
    .alert-card.level-medium { border-color: rgba(245, 158, 11, 0.45); box-shadow: 0 0 16px rgba(245, 158, 11, 0.1); }
    .alert-card.level-low { border-color: rgba(45, 212, 191, 0.35); }
    .alert-icon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: rgba(0, 242, 254, 0.12); color: #67e8f9; font-size: 1.05rem; }
    .alert-copy { display: flex; flex-direction: column; gap: 2px; }
    .alert-copy strong { color: #e6f7ff; font-size: 0.83rem; }
    .alert-copy span { color: #9ca3af; font-size: 0.76rem; }
    .insight-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
    .insight-card {
      background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.09); border-radius: 12px;
      padding: 12px; display: flex; flex-direction: column; gap: 4px;
    }
    .insight-card strong { color: #e6f7ff; font-size: 0.84rem; }
    .insight-card span { color: #a5b4c3; font-size: 0.78rem; }
    .insight-card.tone-positive { border-color: rgba(34, 197, 94, 0.35); box-shadow: 0 0 14px rgba(34, 197, 94, 0.11); }
    .insight-card.tone-warning { border-color: rgba(245, 158, 11, 0.45); box-shadow: 0 0 14px rgba(245, 158, 11, 0.1); }
    .insight-card.tone-neutral { border-color: rgba(56, 189, 248, 0.25); }
    .breakdown-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .filter-chip {
      border: 1px solid rgba(0,242,254,0.28); background: rgba(0,242,254,0.09); color: #a5f3fc;
      border-radius: 999px; padding: 4px 10px; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 6px;
      cursor: pointer;
    }
    .filter-chip.clear-all { background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.35); color: #ddd6fe; }
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
  dashStats = signal<SessionDashboard | null>(null);
  recentActivity = signal<ActivityItem[]>([]);
  hrDocs = signal<any[]>([]);
  employeePopulation = signal<any[]>([]);
  selectedDepartment = signal<string | null>(null);
  selectedRole = signal<string | null>(null);

  dailyHoursData = signal<ChartPoint[]>([]);
  employeeHoursData = signal<ChartPoint[]>([]);
  deptChartData = signal<ChartPoint[]>([]);
  roleChartData = signal<ChartPoint[]>([]);
  clockInData = signal<ChartPoint[]>([]);
  headcountData = signal<ChartPoint[]>([]);

  chartWidth = 480;

  dailyHoursChartData = computed(() =>
    [{ name: 'Hours', series: this.dailyHoursData() }]
  );

  headcountChartData = computed(() =>
    [{ name: 'Headcount', series: this.headcountData() }]
  );
  inactiveEmployees = computed(() =>
    Math.max((this.stats().totalEmployees ?? 0) - (this.stats().activeEmployees ?? 0), 0)
  );
  loginCoveragePercent = computed(() => {
    const active = this.stats().activeEmployees ?? 0;
    if (active <= 0) return 0;
    const loggedIn = this.dashStats()?.uniqueUsersToday ?? 0;
    return Math.min(100, Math.round((loggedIn / active) * 100));
  });
  averageDailyHours30d = computed(() => {
    const rows = this.dailyHoursData();
    if (!rows.length) return '0.0';
    const total = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
    return (total / rows.length).toFixed(1);
  });
  peakShiftLabel = computed(() => {
    const dist = this.dashStats()?.clockInDistribution;
    if (!dist) return 'N/A';
    const buckets: { name: string; value: number }[] = [
      { name: 'Morning', value: dist.morning ?? 0 },
      { name: 'Afternoon', value: dist.afternoon ?? 0 },
      { name: 'Evening', value: dist.evening ?? 0 },
      { name: 'Night', value: dist.night ?? 0 }
    ];
    const top = buckets.sort((a, b) => b.value - a.value)[0];
    return top.value > 0 ? top.name : 'N/A';
  });
  topDepartmentName = computed(() => this.deptChartData()[0]?.name ?? 'N/A');
  topRoleName = computed(() => this.roleChartData()[0]?.name ?? 'N/A');
  headcountDelta30d = computed(() => {
    const points = this.headcountData();
    if (points.length < 2) return '0';
    const delta = (points[points.length - 1]?.value ?? 0) - (points[0]?.value ?? 0);
    return delta > 0 ? `+${delta}` : `${delta}`;
  });
  activeEmployeesDelta = computed(() => {
    const points = this.headcountData();
    if (points.length < 2) return 0;
    return (points[points.length - 1]?.value ?? 0) - (points[points.length - 2]?.value ?? 0);
  });
  activeEmployeesDeltaLabel = computed(() => {
    const d = this.activeEmployeesDelta();
    return d > 0 ? `+${d} MoM` : d < 0 ? `${d} MoM` : '0 MoM';
  });
  sessionsDeltaVsYesterday = computed(() => {
    const rows = this.dashStats()?.dailyHours ?? [];
    if (rows.length < 2) return 0;
    const today = rows[rows.length - 1]?.sessionCount ?? 0;
    const prev = rows[rows.length - 2]?.sessionCount ?? 0;
    return today - prev;
  });
  sessionsDeltaLabel = computed(() => {
    const d = this.sessionsDeltaVsYesterday();
    return d > 0 ? `+${d} vs yesterday` : d < 0 ? `${d} vs yesterday` : 'flat vs yesterday';
  });
  hoursDeltaVsYesterday = computed(() => {
    const rows = this.dashStats()?.dailyHours ?? [];
    if (rows.length < 2) return 0;
    const today = rows[rows.length - 1]?.totalHours ?? 0;
    const prev = rows[rows.length - 2]?.totalHours ?? 0;
    return Number((today - prev).toFixed(1));
  });
  hoursDeltaLabel = computed(() => {
    const d = this.hoursDeltaVsYesterday();
    return d > 0 ? `+${d}h vs yesterday` : d < 0 ? `${d}h vs yesterday` : 'flat vs yesterday';
  });
  trainingCoveragePercent = computed(() => {
    const active = this.stats().activeEmployees ?? 0;
    if (active <= 0) return 0;
    const docs = this.hrDocs();
    const trainingDocs = docs.filter((d: any) => {
      const category = String(d?.category ?? d?.subCategory ?? d?.documentType ?? '').toLowerCase();
      return category.includes('training') || category.includes('entry_level') || category.includes('orientation');
    });
    if (!trainingDocs.length) return 0;
    const uniqueEmployees = new Set(
      trainingDocs
        .map((d: any) => d?.employeeId ?? d?.driverId ?? d?.userId)
        .filter((id: any) => id !== null && id !== undefined && `${id}`.trim() !== '')
    ).size;
    const covered = uniqueEmployees > 0 ? uniqueEmployees : trainingDocs.length;
    return Math.min(100, Math.round((covered / active) * 100));
  });
  absenteeismProxyPercent = computed(() => {
    const active = this.stats().activeEmployees ?? 0;
    if (active <= 0) return 0;
    return Math.min(100, Math.round(((this.stats().pendingTimeOff ?? 0) / active) * 100));
  });
  pendingActionsTotal = computed(() =>
    (this.stats().pendingTimeOff ?? 0)
    + (this.stats().pendingPaychecks ?? 0)
    + this.expiringDocsCount()
    + this.expiredDocsCount()
  );
  expiringDocsCount = computed(() => {
    const now = Date.now();
    const in90 = now + (90 * 24 * 60 * 60 * 1000);
    return this.hrDocs().filter((d: any) => {
      const status = String(d?.status ?? '').toLowerCase();
      if (status === 'expiring') return true;
      const expiry = d?.expiryDate ?? d?.expirationDate;
      if (!expiry) return false;
      const t = new Date(expiry).getTime();
      return Number.isFinite(t) && t >= now && t <= in90;
    }).length;
  });
  expiredDocsCount = computed(() => {
    const now = Date.now();
    return this.hrDocs().filter((d: any) => {
      const status = String(d?.status ?? '').toLowerCase();
      if (status === 'expired') return true;
      const expiry = d?.expiryDate ?? d?.expirationDate;
      if (!expiry) return false;
      const t = new Date(expiry).getTime();
      return Number.isFinite(t) && t < now;
    }).length;
  });
  actionAlerts = computed<ActionAlert[]>(() => {
    const alerts: ActionAlert[] = [];
    if (this.expiredDocsCount() > 0) {
      alerts.push({
        id: 'expired-docs',
        level: 'high',
        icon: 'bx-error',
        title: `${this.expiredDocsCount()} compliance docs expired`,
        detail: 'Prioritize renewals to reduce compliance exposure.'
      });
    }
    if (this.expiringDocsCount() > 0) {
      alerts.push({
        id: 'expiring-docs',
        level: 'medium',
        icon: 'bx-time-five',
        title: `${this.expiringDocsCount()} docs expiring in 90 days`,
        detail: 'Schedule reminders and owner follow-ups now.'
      });
    }
    if ((this.stats().pendingPaychecks ?? 0) > 0) {
      alerts.push({
        id: 'pending-paychecks',
        level: 'high',
        icon: 'bx-money-withdraw',
        title: `${this.stats().pendingPaychecks} pending paychecks`,
        detail: 'Payroll queue requires immediate review.'
      });
    }
    if ((this.stats().pendingTimeOff ?? 0) > 0) {
      alerts.push({
        id: 'pending-timeoff',
        level: 'medium',
        icon: 'bx-calendar-exclamation',
        title: `${this.stats().pendingTimeOff} time-off requests pending`,
        detail: 'Approve or deny requests before schedule lock.'
      });
    }
    if (this.loginCoveragePercent() < 35 && (this.stats().activeEmployees ?? 0) > 10) {
      alerts.push({
        id: 'low-login-coverage',
        level: 'low',
        icon: 'bx-line-chart-down',
        title: `Low daily login coverage (${this.loginCoveragePercent()}%)`,
        detail: 'Compare shift rosters against clock-in behavior.'
      });
    }
    return alerts.slice(0, 6);
  });
  aiInsights = computed<InsightItem[]>(() => {
    const items: InsightItem[] = [];
    const coverage = this.loginCoveragePercent();
    const training = this.trainingCoveragePercent();
    const absenteeism = this.absenteeismProxyPercent();
    const pending = this.pendingActionsTotal();
    const headcountDelta = this.headcountDelta30d();
    const isGrowth = headcountDelta.startsWith('+');

    if (pending > 0) {
      items.push({
        id: 'pending-actions',
        tone: 'warning',
        title: `${pending} actionable items are open`,
        detail: 'Resolve payroll, time-off, and document expirations to reduce operational risk.'
      });
    }
    items.push({
      id: 'coverage',
      tone: coverage >= 55 ? 'positive' : 'warning',
      title: `Daily login coverage is ${coverage}%`,
      detail: coverage >= 55 ? 'Engagement is healthy for current active headcount.' : 'Below target baseline; compare by shift and manager groups.'
    });
    items.push({
      id: 'training',
      tone: training >= 70 ? 'positive' : 'warning',
      title: `Training coverage is ${training}%`,
      detail: training >= 70 ? 'Current completion level supports compliance posture.' : 'Training completion appears low; prioritize critical certifications.'
    });
    items.push({
      id: 'headcount',
      tone: isGrowth ? 'positive' : 'neutral',
      title: `Headcount trend: ${headcountDelta} over 30 days`,
      detail: isGrowth ? 'Growth trend is positive; validate onboarding quality and 90-day retention.' : 'Flat/negative trend detected; monitor attrition drivers by role and department.'
    });
    if (absenteeism > 10) {
      items.push({
        id: 'absence',
        tone: 'warning',
        title: `Absenteeism proxy at ${absenteeism}%`,
        detail: 'Pending time-off volume is elevated versus active employee count.'
      });
    }
    return items.slice(0, 5);
  });

  lineScheme: Color = { name: 'line', selectable: true, group: ScaleType.Ordinal, domain: ['#00e5ff'] };
  barScheme: Color = { name: 'bar', selectable: true, group: ScaleType.Ordinal, domain: ['#00e5ff'] };
  pieScheme: Color = { name: 'pie', selectable: true, group: ScaleType.Ordinal, domain: ['#00e5ff', '#a855f7', '#00ff88', '#ffaa00', '#ff2a6d', '#818cf8', '#06b6d4', '#f97316', '#22c55e', '#ec4899'] };
  roleScheme: Color = { name: 'role', selectable: true, group: ScaleType.Ordinal, domain: ['#a855f7', '#818cf8', '#06b6d4', '#00e5ff', '#00ff88', '#ffaa00', '#f97316', '#ff2a6d', '#22c55e', '#ec4899'] };
  clockScheme: Color = { name: 'clock', selectable: true, group: ScaleType.Ordinal, domain: ['#ffaa00', '#00e5ff', '#a855f7', '#1a1a4e'] };
  areaScheme: Color = { name: 'area', selectable: true, group: ScaleType.Ordinal, domain: ['#00ff88'] };

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
    try {
      await Promise.all([
        this.loadRosterSummary(),
        this.loadTimeOff(),
        this.loadPaychecks(),
        this.loadStaging(),
        this.loadDashboardStats(),
        this.loadSnapshots(),
        this.loadEmployeePopulation(),
        this.loadHrDocsInsights(),
        this.loadRecentActivity()
      ]);
    } finally {
      this.loading.set(false);
    }
  }

  private async fetch<T>(url: string): Promise<T | null> {
    try {
      return await lastValueFrom(
        this.http.get<T>(url).pipe(catchError(err => { console.error(`Dashboard fetch failed: ${url}`, err); return of(null as any); }))
      );
    } catch (err) {
      console.error(`Dashboard fetch error: ${url}`, err);
      return null;
    }
  }

  async loadRosterSummary() {
    const res = await this.fetch<RosterSummary>(`${this.apiUrl}/api/v1/employee-roster/summary`);
    if (!res) return;
    this.stats.update(s => ({ ...s, totalEmployees: res.totalEmployees ?? 0, activeEmployees: res.activeEmployees ?? 0 }));
    if (this.employeePopulation().length === 0) {
      const depts = (res.byDepartment ?? []).sort((a, b) => b.count - a.count);
      const roles = (res.byRole ?? []).sort((a, b) => b.count - a.count);
      this.deptChartData.set(depts.slice(0, 10).map(d => ({ name: d.department || 'Unassigned', value: d.count })));
      this.roleChartData.set(roles.slice(0, 10).map(r => ({ name: r.role || 'Unassigned', value: r.count })));
    }
  }

  async loadTimeOff() {
    const res = await this.fetch<{ data: any[]; total?: number }>(`${this.apiUrl}/api/v1/time-off/requests?status=pending&pageSize=100`);
    this.stats.update(s => ({ ...s, pendingTimeOff: res?.data?.length ?? res?.total ?? 0 }));
  }

  async loadPaychecks() {
    const res = await this.fetch<{ data: any[]; total?: number }>(`${this.apiUrl}/api/v1/paychecks?status=pending&pageSize=100`);
    this.stats.update(s => ({ ...s, pendingPaychecks: res?.data?.length ?? res?.total ?? 0 }));
  }

  async loadStaging() {
    const res = await this.fetch<{ data: any[]; total?: number }>(`${this.apiUrl}/api/v1/employee-data/staging`);
    this.stats.update(s => ({ ...s, bulkStaging: res?.data?.length ?? res?.total ?? 0 }));
  }

  async loadDashboardStats() {
    const res = await this.fetch<SessionDashboard>(`${this.apiUrl}/api/v1/sessions/dashboard`);
    if (!res) return;
    this.dashStats.set(res);

    this.dailyHoursData.set(
      (res.dailyHours ?? []).map(d => ({
        name: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: d.totalHours ?? 0
      }))
    );

    this.employeeHoursData.set(
      (res.employeeHoursThisWeek ?? []).map(e => ({ name: e.name, value: e.hours }))
    );

    const dist = res.clockInDistribution ?? { morning: 0, afternoon: 0, evening: 0, night: 0 };
    this.clockInData.set([
      { name: 'Morning (5-12)', value: dist.morning },
      { name: 'Afternoon (12-5)', value: dist.afternoon },
      { name: 'Evening (5-9)', value: dist.evening },
      { name: 'Night (9-5)', value: dist.night }
    ]);
  }

  async loadSnapshots() {
    const res = await this.fetch<{ data: { month: string; activeCount: number }[] }>(`${this.apiUrl}/api/v1/employee-snapshots`);
    const snaps = (res?.data ?? []).slice(0, 12).reverse();
    this.headcountData.set(snaps.map(s => ({ name: this.formatMonth(s.month), value: s.activeCount ?? 0 })));
  }

  async loadRecentActivity() {
    const activities: ActivityItem[] = [];

    const [timeOffRes, docsRes] = await Promise.all([
      this.fetch<{ data: any[] }>(`${this.apiUrl}/api/v1/time-off/requests?pageSize=5`),
      this.fetch<{ data: any[] }>(`${this.apiUrl}/api/v1/employee-documents?pageSize=5`)
    ]);

    for (const r of (timeOffRes?.data ?? [])) {
      activities.push({
        id: 'to-' + r.id,
        icon: r.status === 'approved' ? 'bx-check-circle' : r.status === 'denied' ? 'bx-x-circle' : 'bx-calendar-event',
        title: `Time Off ${r.status === 'approved' ? 'Approved' : r.status === 'denied' ? 'Denied' : 'Requested'}`,
        description: `${r.employeeName ?? 'Employee'} - ${r.startDate ? new Date(r.startDate).toLocaleDateString() : ''}`,
        time: this.timeAgo(r.createdAt ?? r.requestedAt),
        date: new Date(r.createdAt ?? r.requestedAt ?? 0),
        category: 'timeoff'
      });
    }

    for (const d of (docsRes?.data ?? [])) {
      activities.push({
        id: 'doc-' + d.id,
        icon: 'bx-file',
        title: 'Document Uploaded',
        description: `${d.documentType ?? d.fileName ?? 'Document'} - ${d.employeeName ?? 'Employee'}`,
        time: this.timeAgo(d.createdAt ?? d.uploadedAt),
        date: new Date(d.createdAt ?? d.uploadedAt ?? 0),
        category: 'document'
      });
    }

    activities.sort((a, b) => b.date.getTime() - a.date.getTime());
    this.recentActivity.set(activities.slice(0, 10));
  }

  async loadHrDocsInsights() {
    const res = await this.fetch<{ data: any[] }>(`${this.apiUrl}/api/v1/employee-documents?pageSize=250`);
    this.hrDocs.set(res?.data ?? []);
  }

  async loadEmployeePopulation() {
    const res = await this.fetch<{ data: any[] }>(`${this.apiUrl}/api/v1/employee-roster?limit=500`);
    const employees = (res?.data ?? []).filter((e: any) => String(e?.status ?? '').toLowerCase() === 'active' || !e?.status);
    this.employeePopulation.set(employees);
    this.applyWorkforceFilters();
  }

  onDepartmentChartSelect(event: any) {
    const name = event?.name ? String(event.name) : null;
    if (!name) return;
    this.selectedDepartment.set(this.selectedDepartment() === name ? null : name);
    this.applyWorkforceFilters();
  }

  onRoleChartSelect(event: any) {
    const name = event?.name ? String(event.name) : null;
    if (!name) return;
    this.selectedRole.set(this.selectedRole() === name ? null : name);
    this.applyWorkforceFilters();
  }

  clearDepartmentFilter() {
    this.selectedDepartment.set(null);
    this.applyWorkforceFilters();
  }

  clearRoleFilter() {
    this.selectedRole.set(null);
    this.applyWorkforceFilters();
  }

  clearWorkforceFilters() {
    this.selectedDepartment.set(null);
    this.selectedRole.set(null);
    this.applyWorkforceFilters();
  }

  private applyWorkforceFilters() {
    const employees = this.employeePopulation();
    if (!employees.length) return;

    const deptSource = this.selectedRole()
      ? employees.filter((e: any) => String(e?.role ?? 'Unassigned') === this.selectedRole())
      : employees;
    const roleSource = this.selectedDepartment()
      ? employees.filter((e: any) => String(e?.department?.name ?? 'Unassigned') === this.selectedDepartment())
      : employees;

    const deptCounts = new Map<string, number>();
    for (const e of deptSource) {
      const name = String(e?.department?.name ?? 'Unassigned');
      deptCounts.set(name, (deptCounts.get(name) ?? 0) + 1);
    }
    const roleCounts = new Map<string, number>();
    for (const e of roleSource) {
      const name = String(e?.role ?? 'Unassigned');
      roleCounts.set(name, (roleCounts.get(name) ?? 0) + 1);
    }

    this.deptChartData.set(
      Array.from(deptCounts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
    );
    this.roleChartData.set(
      Array.from(roleCounts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
    );
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
