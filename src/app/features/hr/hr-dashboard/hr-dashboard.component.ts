import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { catchError, lastValueFrom, of } from 'rxjs';
import { Color, NgxChartsModule, ScaleType } from '@swimlane/ngx-charts';
import { environment } from '../../../../environments/environment';

interface ChartPoint { name: string; value: number; }
interface ActivityItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  time: string;
  date: Date;
  category: string;
}
interface ActionAlert {
  id: string;
  level: 'high' | 'medium' | 'low';
  icon: string;
  title: string;
  detail: string;
  route?: string;
}
interface InsightItem {
  id: string;
  tone: 'positive' | 'warning' | 'neutral';
  title: string;
  detail: string;
}
interface StatPanel {
  tone: 'cyan' | 'green' | 'orange' | 'violet';
  icon: string;
  label: string;
  badge: string;
  value: string | number;
  meter: number;
  chip: string;
  soft: string;
  route?: string;
}

@Component({
  selector: 'app-hr-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NgxChartsModule],
  template: `
    <div class="hr-dashboard">
      <div class="page-header">
        <div>
          <h1><i class="bx bx-group"></i> Taylor Access</h1>
          <p>Workforce, fleet, compliance, and payroll at a glance</p>
        </div>
        <button class="btn-refresh" type="button" (click)="loadAll()" [disabled]="loading()">
          <i class="bx" [class.bx-refresh]="!loading()" [class.bx-loader-alt]="loading()" [class.bx-spin]="loading()"></i>
          Refresh
        </button>
      </div>

      <div class="stats-bar" aria-label="Taylor Access snapshot">
        @for (panel of statPanels(); track panel.label) {
          @if (panel.route) {
            <a class="stat-panel" [routerLink]="panel.route" [ngClass]="'tone-' + panel.tone">
              <i class="bx stat-panel-mark" [ngClass]="panel.icon" aria-hidden="true"></i>
              <header class="stat-panel-head">
                <span class="stat-panel-label">{{ panel.label }}</span>
                <span class="stat-panel-badge">{{ panel.badge }}</span>
              </header>
              <p class="stat-panel-value">{{ panel.value }}</p>
              <div class="stat-panel-meter" aria-hidden="true"><span [style.width.%]="panel.meter"></span></div>
              <footer class="stat-panel-foot">
                <span class="stat-panel-chip">{{ panel.chip }}</span>
                <span class="stat-panel-chip soft">{{ panel.soft }}</span>
              </footer>
            </a>
          } @else {
            <article class="stat-panel" [ngClass]="'tone-' + panel.tone">
              <i class="bx stat-panel-mark" [ngClass]="panel.icon" aria-hidden="true"></i>
              <header class="stat-panel-head">
                <span class="stat-panel-label">{{ panel.label }}</span>
                <span class="stat-panel-badge">{{ panel.badge }}</span>
              </header>
              <p class="stat-panel-value">{{ panel.value }}</p>
              <div class="stat-panel-meter" aria-hidden="true"><span [style.width.%]="panel.meter"></span></div>
              <footer class="stat-panel-foot">
                <span class="stat-panel-chip">{{ panel.chip }}</span>
                <span class="stat-panel-chip soft">{{ panel.soft }}</span>
              </footer>
            </article>
          }
        }
      </div>

      <div class="chart-section">
        <h2><i class="bx bx-bell"></i> Action Needed</h2>
        @if (actionAlerts().length > 0) {
          <div class="alert-grid">
            @for (alert of actionAlerts(); track alert.id) {
              @if (alert.route) {
                <a class="alert-card" [routerLink]="alert.route" [class]="'level-' + alert.level">
                  <div class="alert-icon"><i class="bx" [ngClass]="alert.icon"></i></div>
                  <div class="alert-copy">
                    <strong>{{ alert.title }}</strong>
                    <span>{{ alert.detail }}</span>
                  </div>
                </a>
              } @else {
                <div class="alert-card" [class]="'level-' + alert.level">
                  <div class="alert-icon"><i class="bx" [ngClass]="alert.icon"></i></div>
                  <div class="alert-copy">
                    <strong>{{ alert.title }}</strong>
                    <span>{{ alert.detail }}</span>
                  </div>
                </div>
              }
            }
          </div>
        } @else {
          <div class="chart-card"><div class="chart-empty">No critical items right now</div></div>
        }
      </div>

      <div class="chart-section">
        <h2><i class="bx bx-bulb"></i> Ops Insights</h2>
        <div class="insight-grid">
          @for (insight of opsInsights(); track insight.id) {
            <div class="insight-card" [class]="'tone-' + insight.tone">
              <strong>{{ insight.title }}</strong>
              <span>{{ insight.detail }}</span>
            </div>
          }
        </div>
      </div>

      @if (deptChartData().length > 0 || roleChartData().length > 0 || driverStatusChart().length > 0) {
        <div class="chart-section">
          <h2><i class="bx bx-bar-chart-alt-2"></i> Workforce Mix</h2>
          <div class="breakdown-filters">
            @if (selectedDepartment()) {
              <button type="button" class="filter-chip" (click)="clearDepartmentFilter()">
                <i class="bx bx-building-house"></i> Dept: {{ selectedDepartment() }} <i class="bx bx-x"></i>
              </button>
            }
            @if (selectedRole()) {
              <button type="button" class="filter-chip" (click)="clearRoleFilter()">
                <i class="bx bx-id-card"></i> Role: {{ selectedRole() }} <i class="bx bx-x"></i>
              </button>
            }
            @if (selectedDepartment() || selectedRole()) {
              <button type="button" class="filter-chip clear-all" (click)="clearWorkforceFilters()">
                <i class="bx bx-reset"></i> Clear Filters
              </button>
            }
          </div>
          <div class="chart-grid-3">
            @if (deptChartData().length > 0) {
              <div class="chart-card">
                <h3>By Department</h3>
                <div class="hbar-list">
                  @for (row of deptBarRows(); track row.name; let i = $index) {
                    <button
                      type="button"
                      class="hbar-row"
                      [class.active]="selectedDepartment() === row.name"
                      (click)="onDepartmentChartSelect(row)">
                      <div class="hbar-meta">
                        <span class="hbar-label">{{ formatBreakdownLabel(row.name) }}</span>
                        <span class="hbar-value">{{ row.value }}</span>
                      </div>
                      <div class="hbar-track">
                        <span class="hbar-fill tone-{{ i % 8 }}" [style.width.%]="row.pct"></span>
                      </div>
                    </button>
                  }
                </div>
              </div>
            }
            @if (roleChartData().length > 0) {
              <div class="chart-card">
                <h3>By Role</h3>
                <div class="hbar-list">
                  @for (row of roleBarRows(); track row.name; let i = $index) {
                    <button
                      type="button"
                      class="hbar-row"
                      [class.active]="selectedRole() === row.name"
                      (click)="onRoleChartSelect(row)">
                      <div class="hbar-meta">
                        <span class="hbar-label">{{ formatBreakdownLabel(row.name) }}</span>
                        <span class="hbar-value">{{ row.value }}</span>
                      </div>
                      <div class="hbar-track">
                        <span class="hbar-fill tone-{{ i % 8 }}" [style.width.%]="row.pct"></span>
                      </div>
                    </button>
                  }
                </div>
              </div>
            }
            @if (driverStatusChart().length > 0) {
              <div class="chart-card">
                <h3>Driver Status</h3>
                <div class="hbar-list">
                  @for (row of driverBarRows(); track row.name; let i = $index) {
                    <div class="hbar-row static">
                      <div class="hbar-meta">
                        <span class="hbar-label">{{ formatBreakdownLabel(row.name) }}</span>
                        <span class="hbar-value">{{ row.value }}</span>
                      </div>
                      <div class="hbar-track">
                        <span class="hbar-fill tone-{{ i % 8 }}" [style.width.%]="row.pct"></span>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      <div class="chart-section">
        <h2><i class="bx bx-trending-up"></i> Headcount Trend</h2>
        <div class="chart-card wide">
          @if (headcountData().length > 0) {
            <ngx-charts-area-chart
              [results]="headcountChartData()"
              [view]="[wideChartWidth, 260]"
              [scheme]="areaScheme"
              [xAxis]="true"
              [yAxis]="true"
              [autoScale]="true"
              [gradient]="true"
              [animations]="true">
            </ngx-charts-area-chart>
          } @else {
            <div class="chart-empty">No headcount trend data yet</div>
          }
        </div>
      </div>

      <div class="quick-actions">
        <h2>Quick Actions</h2>
        <div class="action-grid">
          <a routerLink="/hr/payroll" class="action-card">
            <i class="bx bx-money"></i><span>Payroll</span>
            @if (metrics().pendingPaychecks > 0) {
              <span class="action-badge">{{ metrics().pendingPaychecks }}</span>
            }
          </a>
          <a routerLink="/hr/time-off" class="action-card">
            <i class="bx bx-calendar-event"></i><span>Time Off</span>
            @if (metrics().pendingTimeOff > 0) {
              <span class="action-badge">{{ metrics().pendingTimeOff }}</span>
            }
          </a>
          <a routerLink="/drivers" class="action-card"><i class="bx bx-id-card"></i><span>Drivers</span></a>
          <a routerLink="/dispatchers" class="action-card"><i class="bx bx-broadcast"></i><span>Dispatchers</span></a>
          <a routerLink="/hr/applicants" class="action-card">
            <i class="bx bx-user-plus"></i><span>Applicants</span>
            @if (metrics().openApplicants > 0) {
              <span class="action-badge">{{ metrics().openApplicants }}</span>
            }
          </a>
          <a routerLink="/compliance/tags-permits" class="action-card"><i class="bx bx-trailer"></i><span>Trailers</span></a>
          <a routerLink="/compliance/driver-database" class="action-card"><i class="bx bx-shield-alt-2"></i><span>Compliance</span></a>
          <a routerLink="/hr/roster" class="action-card"><i class="bx bx-group"></i><span>Employee Roster</span></a>
        </div>
      </div>

      <div class="recent-section">
        <h2>Recent Activity</h2>
        @if (recentActivity().length === 0) {
          <div class="activity-list">
            <div class="activity-empty"><i class="bx bx-history"></i><span>No recent activity found</span></div>
          </div>
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

    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 8px; }
    .page-header h1 {
      color: #00f2fe; font-size: 2rem; margin: 0 0 8px; display: flex; align-items: center; gap: 12px;
      text-shadow: 0 0 20px rgba(0, 242, 254, 0.5);
    }
    .page-header p { color: #9ca3af; margin: 0; }
    .btn-refresh {
      padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600;
      border: 1px solid rgba(0, 242, 254, 0.3); background: rgba(0, 242, 254, 0.1); color: #00f2fe;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .btn-refresh:hover:not(:disabled) { background: rgba(0, 242, 254, 0.2); }
    .btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

    @keyframes stat-panel-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .stats-bar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin: 18px 0 28px;
    }
    @media (max-width: 1200px) { .stats-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .stats-bar { grid-template-columns: 1fr; } }

    .stat-panel {
      --kpi-accent: #67e8f9;
      --kpi-accent-soft: rgba(0, 212, 255, 0.16);
      position: relative; overflow: hidden; isolation: isolate;
      display: flex; flex-direction: column; gap: 10px;
      min-width: 0; min-height: 148px; padding: 16px 16px 14px 18px;
      border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08);
      background:
        radial-gradient(120% 90% at 100% 0%, var(--kpi-accent-soft), transparent 55%),
        linear-gradient(165deg, rgba(255, 255, 255, 0.05), transparent 46%),
        rgba(10, 13, 22, 0.92);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 14px 32px rgba(0, 0, 0, 0.32);
      animation: stat-panel-in 0.48s cubic-bezier(0.22, 1, 0.36, 1) both;
      transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
      text-decoration: none; color: inherit;
    }
    .stat-panel::before {
      content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px;
      border-radius: 0 4px 4px 0;
      background: linear-gradient(180deg, var(--kpi-accent), transparent 95%);
      box-shadow: 0 0 12px color-mix(in srgb, var(--kpi-accent) 55%, transparent);
    }
    .stat-panel:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--kpi-accent) 42%, rgba(255, 255, 255, 0.08));
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.06) inset,
        0 0 28px color-mix(in srgb, var(--kpi-accent) 14%, transparent),
        0 18px 36px rgba(0, 0, 0, 0.36);
    }
    .stat-panel:nth-child(1) { animation-delay: 0s; }
    .stat-panel:nth-child(2) { animation-delay: 0.05s; }
    .stat-panel:nth-child(3) { animation-delay: 0.1s; }
    .stat-panel:nth-child(4) { animation-delay: 0.15s; }
    .stat-panel:nth-child(5) { animation-delay: 0.2s; }
    .stat-panel:nth-child(6) { animation-delay: 0.25s; }
    .stat-panel:nth-child(7) { animation-delay: 0.3s; }
    .stat-panel:nth-child(8) { animation-delay: 0.35s; }
    .stat-panel.tone-cyan { --kpi-accent: #00d4ff; --kpi-accent-soft: rgba(0, 212, 255, 0.18); }
    .stat-panel.tone-green { --kpi-accent: #00ff88; --kpi-accent-soft: rgba(0, 255, 136, 0.16); }
    .stat-panel.tone-orange { --kpi-accent: #ffaa00; --kpi-accent-soft: rgba(255, 170, 0, 0.16); }
    .stat-panel.tone-violet { --kpi-accent: #a78bfa; --kpi-accent-soft: rgba(167, 139, 250, 0.16); }

    .stat-panel-mark {
      position: absolute; right: -6px; bottom: -10px; font-size: 5.2rem; line-height: 1;
      color: var(--kpi-accent); opacity: 0.09; transform: rotate(-8deg); pointer-events: none; z-index: 0;
    }
    .stat-panel:hover .stat-panel-mark { opacity: 0.14; transform: rotate(-4deg) translateY(-2px); }
    .stat-panel-head, .stat-panel-value, .stat-panel-meter, .stat-panel-foot { position: relative; z-index: 1; }
    .stat-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
    .stat-panel-label {
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: rgba(226, 232, 240, 0.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .stat-panel-badge {
      flex-shrink: 0; padding: 2px 7px; border-radius: 999px; font-size: 0.6rem; font-weight: 700;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: color-mix(in srgb, var(--kpi-accent) 88%, #fff);
      background: color-mix(in srgb, var(--kpi-accent) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--kpi-accent) 35%, transparent);
    }
    .stat-panel-value {
      margin: 2px 0 0; font-size: clamp(1.25rem, 0.8vw + 1rem, 1.65rem); font-weight: 700;
      letter-spacing: 0.02em; line-height: 1.1; color: #f8fafc; font-variant-numeric: tabular-nums;
      text-shadow: 0 0 22px color-mix(in srgb, var(--kpi-accent) 28%, transparent);
    }
    .stat-panel-meter {
      height: 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); overflow: hidden;
    }
    .stat-panel-meter span {
      display: block; height: 100%; border-radius: inherit;
      background: linear-gradient(90deg, color-mix(in srgb, var(--kpi-accent) 55%, #fff), var(--kpi-accent));
      box-shadow: 0 0 10px color-mix(in srgb, var(--kpi-accent) 45%, transparent);
      transition: width 0.55s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .stat-panel-foot { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
    .stat-panel-chip {
      display: inline-flex; align-items: center; max-width: 100%; padding: 3px 8px; border-radius: 999px;
      font-size: 0.68rem; font-weight: 600; color: rgba(226, 232, 240, 0.86);
      background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .stat-panel-chip.soft {
      color: color-mix(in srgb, var(--kpi-accent) 80%, #e2e8f0);
      border-color: color-mix(in srgb, var(--kpi-accent) 28%, transparent);
      background: color-mix(in srgb, var(--kpi-accent) 10%, transparent);
    }

    .chart-section { margin-bottom: 32px; }
    .chart-section h2 {
      color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; display: flex; align-items: center; gap: 8px;
    }
    .chart-section h2 i { color: #00e5ff; }
    .chart-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .chart-card {
      background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px; padding: 18px; overflow: hidden; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    }
    .chart-card.wide { padding: 20px; }
    .chart-card h3 { color: #ccc; font-size: 0.85rem; margin: 0 0 14px; font-weight: 500; }
    .chart-empty { text-align: center; padding: 40px; color: #555; font-size: 0.85rem; }

    .hbar-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 360px;
      overflow-y: auto;
      padding-right: 2px;
    }
    .hbar-row {
      display: flex;
      flex-direction: column;
      gap: 5px;
      width: 100%;
      padding: 0;
      border: none;
      background: transparent;
      text-align: left;
      cursor: pointer;
      color: inherit;
    }
    .hbar-row.static { cursor: default; }
    .hbar-row:not(.static):hover .hbar-label,
    .hbar-row.active .hbar-label { color: #e0f7ff; }
    .hbar-row:not(.static):hover .hbar-track,
    .hbar-row.active .hbar-track {
      box-shadow: inset 0 0 0 1px rgba(0, 229, 255, 0.28);
    }
    .hbar-meta {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }
    .hbar-label {
      font-size: 0.78rem;
      color: #c5d0dc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .hbar-value {
      flex-shrink: 0;
      font-size: 0.78rem;
      font-weight: 700;
      color: #f8fafc;
      font-variant-numeric: tabular-nums;
    }
    .hbar-track {
      height: 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.06);
      overflow: hidden;
    }
    .hbar-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      min-width: 4px;
      transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .hbar-fill.tone-0 { background: linear-gradient(90deg, #7c3aed, #a855f7); }
    .hbar-fill.tone-1 { background: linear-gradient(90deg, #0284c7, #38bdf8); }
    .hbar-fill.tone-2 { background: linear-gradient(90deg, #0e7490, #22d3ee); }
    .hbar-fill.tone-3 { background: linear-gradient(90deg, #047857, #34d399); }
    .hbar-fill.tone-4 { background: linear-gradient(90deg, #a16207, #facc15); }
    .hbar-fill.tone-5 { background: linear-gradient(90deg, #c2410c, #fb923c); }
    .hbar-fill.tone-6 { background: linear-gradient(90deg, #be123c, #fb7185); }
    .hbar-fill.tone-7 { background: linear-gradient(90deg, #6d28d9, #c084fc); }

    .alert-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .alert-card {
      background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 10px;
      min-height: 72px; text-decoration: none; color: inherit;
    }
    .alert-card.level-high { border-color: rgba(239, 68, 68, 0.45); box-shadow: 0 0 16px rgba(239, 68, 68, 0.14); }
    .alert-card.level-medium { border-color: rgba(245, 158, 11, 0.45); box-shadow: 0 0 16px rgba(245, 158, 11, 0.1); }
    .alert-card.level-low { border-color: rgba(45, 212, 191, 0.35); }
    .alert-icon {
      width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
      background: rgba(0, 242, 254, 0.12); color: #67e8f9; font-size: 1.05rem;
    }
    .alert-copy { display: flex; flex-direction: column; gap: 2px; }
    .alert-copy strong { color: #e6f7ff; font-size: 0.83rem; }
    .alert-copy span { color: #9ca3af; font-size: 0.76rem; }

    .insight-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
    .insight-card {
      background: rgba(255, 255, 255, 0.035); border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 4px;
    }
    .insight-card strong { color: #e6f7ff; font-size: 0.84rem; }
    .insight-card span { color: #a5b4c3; font-size: 0.78rem; }
    .insight-card.tone-positive { border-color: rgba(34, 197, 94, 0.35); }
    .insight-card.tone-warning { border-color: rgba(245, 158, 11, 0.45); }
    .insight-card.tone-neutral { border-color: rgba(56, 189, 248, 0.25); }

    .breakdown-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .filter-chip {
      border: 1px solid rgba(0, 242, 254, 0.28); background: rgba(0, 242, 254, 0.09); color: #a5f3fc;
      border-radius: 999px; padding: 4px 10px; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 6px;
      cursor: pointer;
    }
    .filter-chip.clear-all { background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.35); color: #ddd6fe; }

    ::ng-deep .ngx-charts text { fill: #aaa !important; }
    ::ng-deep .ngx-charts .gridline-path { stroke: rgba(255, 255, 255, 0.06) !important; }
    ::ng-deep .ngx-charts .tick text { fill: #888 !important; font-size: 10px !important; }

    .quick-actions { margin-bottom: 32px; }
    .quick-actions h2 { color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; }
    .action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .action-card {
      background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;
      padding: 18px; text-align: center; text-decoration: none; display: flex; flex-direction: column;
      align-items: center; gap: 10px; position: relative; transition: all 0.25s;
    }
    .action-card i { font-size: 1.8rem; color: #00e5ff; }
    .action-card span { color: #ccc; font-size: 0.82rem; font-weight: 500; }
    .action-card:hover { border-color: #00e5ff; transform: translateY(-2px); box-shadow: 0 0 20px rgba(0, 212, 255, 0.15); }
    .action-badge {
      position: absolute; top: 8px; right: 8px; background: #ff2a6d; color: #fff;
      font-size: 0.65rem; padding: 2px 6px; border-radius: 8px; font-weight: 700;
    }

    .recent-section h2 { color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; }
    .activity-list {
      background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px; overflow: hidden;
    }
    .activity-empty {
      padding: 40px; text-align: center; color: #555; display: flex; flex-direction: column;
      align-items: center; gap: 8px;
    }
    .activity-empty i { font-size: 2rem; }
    .activity-item {
      display: flex; align-items: flex-start; gap: 14px; padding: 14px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-icon-wrap {
      width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0;
    }
    .activity-icon-wrap.timeoff { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
    .activity-icon-wrap.document { background: rgba(0, 212, 255, 0.15); color: #00d4ff; }
    .activity-icon-wrap.applicant { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
    .activity-content { display: flex; flex-direction: column; gap: 2px; }
    .activity-content strong { color: #e0f7ff; font-size: 0.85rem; }
    .activity-content span { color: #888; font-size: 0.8rem; }
    .activity-content .time { font-size: 0.72rem; color: #555; }

    @media (max-width: 1100px) { .chart-grid-3 { grid-template-columns: 1fr; } }
  `]
})
export class HrDashboardComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private resizeHandler = () => this.updateChartWidth();

  loading = signal(false);
  metrics = signal({
    totalEmployees: 0,
    activeEmployees: 0,
    activeDrivers: 0,
    totalDrivers: 0,
    dispatchers: 0,
    driversWithDispatcher: 0,
    openApplicants: 0,
    pendingTimeOff: 0,
    pendingPaychecks: 0,
    bulkStaging: 0,
    complianceAtRisk: 0,
    trailersActive: 0,
    trailersUnassigned: 0,
    docsExpiring: 0,
    docsExpired: 0
  });

  recentActivity = signal<ActivityItem[]>([]);
  employeePopulation = signal<any[]>([]);
  selectedDepartment = signal<string | null>(null);
  selectedRole = signal<string | null>(null);
  deptChartData = signal<ChartPoint[]>([]);
  roleChartData = signal<ChartPoint[]>([]);
  driverStatusChart = signal<ChartPoint[]>([]);
  headcountData = signal<ChartPoint[]>([]);
  wideChartWidth = 960;

  headcountChartData = computed(() => [{ name: 'Headcount', series: this.headcountData() }]);

  private toBarRows(points: ChartPoint[]) {
    const max = Math.max(...points.map((p) => p.value), 1);
    return points.map((p) => ({
      name: p.name,
      value: p.value,
      pct: Math.max(4, Math.round((p.value / max) * 100))
    }));
  }

  deptBarRows = computed(() => this.toBarRows(this.deptChartData()));
  roleBarRows = computed(() => this.toBarRows(this.roleChartData()));
  driverBarRows = computed(() => this.toBarRows(this.driverStatusChart()));

  headcountDelta30d = computed(() => {
    const points = this.headcountData();
    if (points.length < 2) return '0';
    const delta = (points[points.length - 1]?.value ?? 0) - (points[0]?.value ?? 0);
    return delta > 0 ? `+${delta}` : `${delta}`;
  });

  private pct(n: number, d: number): number {
    return d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0;
  }

  statPanels = computed<StatPanel[]>(() => {
    const m = this.metrics();
    const inactiveEmployees = Math.max(m.totalEmployees - m.activeEmployees, 0);
    const assignedDriversPct = this.pct(m.driversWithDispatcher, m.activeDrivers || m.totalDrivers);
    const unassignedTrailersPct = this.pct(m.trailersUnassigned, m.trailersActive || 1);
    const compliancePct = this.pct(m.complianceAtRisk, m.activeDrivers || m.totalDrivers || 1);

    return [
      {
        tone: 'cyan',
        icon: 'bx-group',
        label: 'Active Employees',
        badge: 'Office',
        value: m.activeEmployees,
        meter: this.pct(m.activeEmployees, m.totalEmployees || 1),
        chip: `${inactiveEmployees} inactive`,
        soft: `${m.totalEmployees} total`,
        route: '/hr/roster'
      },
      {
        tone: 'green',
        icon: 'bx-id-card',
        label: 'Active Drivers',
        badge: 'Fleet',
        value: m.activeDrivers,
        meter: this.pct(m.activeDrivers, m.totalDrivers || 1),
        chip: `${m.totalDrivers} on roster`,
        soft: `${this.pct(m.activeDrivers, m.totalDrivers || 1)}% active`,
        route: '/drivers'
      },
      {
        tone: 'orange',
        icon: 'bx-broadcast',
        label: 'Dispatchers',
        badge: 'Ops',
        value: m.dispatchers,
        meter: m.dispatchers > 0 ? 100 : 0,
        chip: `${m.driversWithDispatcher} drivers linked`,
        soft: `${assignedDriversPct}% coverage`,
        route: '/dispatchers'
      },
      {
        tone: 'violet',
        icon: 'bx-user-plus',
        label: 'Open Applicants',
        badge: 'Hiring',
        value: m.openApplicants,
        meter: Math.min(100, m.openApplicants),
        chip: 'In pipeline',
        soft: 'Needs review',
        route: '/hr/applicants'
      },
      {
        tone: 'orange',
        icon: 'bx-calendar-event',
        label: 'Pending Time Off',
        badge: 'PTO',
        value: m.pendingTimeOff,
        meter: Math.min(100, m.pendingTimeOff * 12),
        chip: 'Awaiting approval',
        soft: m.pendingTimeOff > 0 ? 'Action needed' : 'Clear',
        route: '/hr/time-off'
      },
      {
        tone: 'cyan',
        icon: 'bx-money',
        label: 'Pending Paychecks',
        badge: 'Payroll',
        value: m.pendingPaychecks,
        meter: Math.min(100, m.pendingPaychecks * 10),
        chip: m.bulkStaging > 0 ? `${m.bulkStaging} staging` : 'Queue',
        soft: m.pendingPaychecks > 0 ? 'Review payroll' : 'Caught up',
        route: '/hr/payroll'
      },
      {
        tone: 'violet',
        icon: 'bx-shield-alt-2',
        label: 'Compliance At Risk',
        badge: 'DOT',
        value: m.complianceAtRisk,
        meter: compliancePct,
        chip: `${m.docsExpired} expired docs`,
        soft: `${m.docsExpiring} expiring`,
        route: '/compliance/driver-database'
      },
      {
        tone: 'green',
        icon: 'bx-trailer',
        label: 'Unassigned Trailers',
        badge: 'Assets',
        value: m.trailersUnassigned,
        meter: unassignedTrailersPct,
        chip: `${m.trailersActive} active`,
        soft: `${unassignedTrailersPct}% open`,
        route: '/compliance/tags-permits'
      }
    ];
  });

  actionAlerts = computed<ActionAlert[]>(() => {
    const m = this.metrics();
    const alerts: ActionAlert[] = [];
    if (m.docsExpired > 0) {
      alerts.push({
        id: 'expired-docs',
        level: 'high',
        icon: 'bx-error',
        title: `${m.docsExpired} HR/compliance docs expired`,
        detail: 'Renew expired documents to reduce compliance exposure.',
        route: '/hr/documents'
      });
    }
    if (m.complianceAtRisk > 0) {
      alerts.push({
        id: 'compliance-risk',
        level: 'high',
        icon: 'bx-shield-x',
        title: `${m.complianceAtRisk} drivers need compliance attention`,
        detail: 'Review expired or missing compliance items on the driver board.',
        route: '/compliance/driver-database'
      });
    }
    if (m.pendingPaychecks > 0) {
      alerts.push({
        id: 'pending-pay',
        level: 'high',
        icon: 'bx-money-withdraw',
        title: `${m.pendingPaychecks} pending paychecks`,
        detail: 'Payroll queue needs review before pay run.',
        route: '/hr/payroll'
      });
    }
    if (m.pendingTimeOff > 0) {
      alerts.push({
        id: 'pending-pto',
        level: 'medium',
        icon: 'bx-calendar-exclamation',
        title: `${m.pendingTimeOff} time-off requests pending`,
        detail: 'Approve or deny before schedules lock.',
        route: '/hr/time-off'
      });
    }
    if (m.openApplicants > 0) {
      alerts.push({
        id: 'applicants',
        level: 'medium',
        icon: 'bx-user-plus',
        title: `${m.openApplicants} applicants in pipeline`,
        detail: 'Move candidates forward or close stale applications.',
        route: '/hr/applicants'
      });
    }
    if (m.trailersUnassigned > 0) {
      alerts.push({
        id: 'trailers',
        level: 'low',
        icon: 'bx-trailer',
        title: `${m.trailersUnassigned} active trailers unassigned`,
        detail: 'Assign drivers or move unused trailers to inactive.',
        route: '/compliance/tags-permits'
      });
    }
    return alerts.slice(0, 6);
  });

  opsInsights = computed<InsightItem[]>(() => {
    const m = this.metrics();
    const items: InsightItem[] = [];
    const driverCoverage = this.pct(m.driversWithDispatcher, m.activeDrivers || 1);
    const activeDriverPct = this.pct(m.activeDrivers, m.totalDrivers || 1);
    const delta = this.headcountDelta30d();

    items.push({
      id: 'dispatch-coverage',
      tone: driverCoverage >= 80 ? 'positive' : driverCoverage >= 50 ? 'neutral' : 'warning',
      title: `${driverCoverage}% of active drivers have a dispatcher`,
      detail: driverCoverage >= 80
        ? 'Dispatcher coverage looks solid across the Landmark roster.'
        : 'Assign remaining Landmark drivers so dispatch ownership is clear.'
    });
    items.push({
      id: 'driver-health',
      tone: activeDriverPct >= 70 ? 'positive' : 'warning',
      title: `${m.activeDrivers} of ${m.totalDrivers} drivers are active`,
      detail: activeDriverPct >= 70
        ? 'Fleet availability is healthy for current operations.'
        : 'Review inactive drivers and onboarding status.'
    });
    items.push({
      id: 'headcount',
      tone: delta.startsWith('+') ? 'positive' : 'neutral',
      title: `Headcount trend: ${delta} over recent snapshots`,
      detail: delta.startsWith('+')
        ? 'Headcount is growing — confirm onboarding and 90-day retention.'
        : 'Headcount is flat or down — watch attrition by role and department.'
    });
    if (m.complianceAtRisk > 0 || m.docsExpiring > 0) {
      items.push({
        id: 'compliance',
        tone: 'warning',
        title: 'Compliance pressure is elevated',
        detail: `${m.complianceAtRisk} drivers at risk and ${m.docsExpiring} docs expiring within 90 days.`
      });
    }
    return items.slice(0, 4);
  });

  areaScheme: Color = {
    name: 'area', selectable: true, group: ScaleType.Ordinal, domain: ['#00ff88']
  };

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
    this.wideChartWidth = Math.max(320, Math.min(1100, w - 80));
  }

  async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.loadRosterSummary(),
        this.loadDriversAndDispatchers(),
        this.loadApplicants(),
        this.loadTrailers(),
        this.loadCompliance(),
        this.loadTimeOff(),
        this.loadPaychecks(),
        this.loadStaging(),
        this.loadHrDocs(),
        this.loadSnapshots(),
        this.loadEmployeePopulation(),
        this.loadRecentActivity()
      ]);
    } finally {
      this.loading.set(false);
    }
  }

  private async fetch<T>(url: string): Promise<T | null> {
    try {
      return await lastValueFrom(
        this.http.get<T>(url).pipe(catchError(() => of(null as any)))
      );
    } catch {
      return null;
    }
  }

  private asArray(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  private isActiveStatus(value: unknown): boolean {
    const s = String(value ?? '').trim().toLowerCase();
    return !s || ['active', 'available', 'assigned', 'dispatched', 'current', 'hired'].includes(s);
  }

  private isInactiveStatus(value: unknown): boolean {
    const s = String(value ?? '').trim().toLowerCase();
    return ['inactive', 'terminated', 'archived', 'off-duty', 'off duty', 'disabled'].includes(s);
  }

  private hasDispatcher(driver: any): boolean {
    const id = Number(driver?.dispatchUserId ?? driver?.dispatcherId ?? driver?.assignedDispatcherId);
    if (Number.isFinite(id) && id > 0) return true;
    const notes = String(driver?.notes ?? '');
    return /\[dispatch-assignee-id:\d+/i.test(notes);
  }

  async loadRosterSummary(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/employee-roster/summary`);
    if (!res) return;
    this.metrics.update((m) => ({
      ...m,
      totalEmployees: Number(res.totalEmployees ?? 0),
      activeEmployees: Number(res.activeEmployees ?? 0)
    }));
    if (this.employeePopulation().length === 0) {
      const depts = (res.byDepartment ?? []).sort((a: any, b: any) => b.count - a.count);
      const roles = (res.byRole ?? []).sort((a: any, b: any) => b.count - a.count);
      this.deptChartData.set(depts.slice(0, 10).map((d: any) => ({ name: d.department || 'Unassigned', value: d.count })));
      this.roleChartData.set(roles.slice(0, 10).map((r: any) => ({ name: r.role || 'Unassigned', value: r.count })));
    }
  }

  async loadDriversAndDispatchers(): Promise<void> {
    const [driversRes, usersRes] = await Promise.all([
      this.fetch<any>(`${this.apiUrl}/api/v1/drivers?limit=5000`),
      this.fetch<any>(`${this.apiUrl}/api/v1/users?role=dispatcher&limit=500`)
    ]);
    const drivers = this.asArray(driversRes);
    const activeDrivers = drivers.filter((d) => this.isActiveStatus(d?.status) && !this.isInactiveStatus(d?.status));
    const withDispatcher = activeDrivers.filter((d) => this.hasDispatcher(d)).length;
    const statusCounts = new Map<string, number>();
    for (const d of drivers) {
      const label = this.isInactiveStatus(d?.status)
        ? 'Inactive'
        : this.isActiveStatus(d?.status)
          ? 'Active'
          : String(d?.status || 'Other');
      statusCounts.set(label, (statusCounts.get(label) ?? 0) + 1);
    }
    this.driverStatusChart.set(
      Array.from(statusCounts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    );

    let dispatchers = this.asArray(usersRes).filter((u) => {
      const role = String(u?.role ?? u?.Role ?? '').toLowerCase();
      return role.includes('dispatch');
    });
    if (dispatchers.length === 0) {
      const allUsers = await this.fetch<any>(`${this.apiUrl}/api/v1/users?limit=2000`);
      dispatchers = this.asArray(allUsers).filter((u) => {
        const role = String(u?.role ?? u?.Role ?? '').toLowerCase();
        return role.includes('dispatch');
      });
    }

    this.metrics.update((m) => ({
      ...m,
      totalDrivers: drivers.length,
      activeDrivers: activeDrivers.length,
      driversWithDispatcher: withDispatcher,
      dispatchers: dispatchers.length
    }));
  }

  async loadApplicants(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/applicants/records?includeCv=false`);
    const rows = this.asArray(res);
    const closed = new Set(['hired', 'rejected', 'declined', 'withdrawn', 'closed', 'archived']);
    const open = rows.filter((r) => !closed.has(String(r?.status ?? '').toLowerCase())).length;
    this.metrics.update((m) => ({ ...m, openApplicants: open }));
  }

  async loadTrailers(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/trailer-assignments?limit=2000`);
    const rows = this.asArray(res);
    const active = rows.filter((r) => {
      const status = String(r?.trailerStatus ?? 'active').toLowerCase();
      return status === 'active' || status === '';
    });
    const unassigned = active.filter((r) => {
      const id = Number(r?.assignedDriverId);
      const name = String(r?.assignedDriverName ?? '').trim();
      return !(Number.isFinite(id) && id > 0) && !name;
    }).length;
    this.metrics.update((m) => ({
      ...m,
      trailersActive: active.length,
      trailersUnassigned: unassigned
    }));
  }

  async loadCompliance(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/drivers/compliance-board?limit=10000`);
    const rows = this.asArray(res);
    const atRisk = rows.filter((r) => {
      const status = String(r?.overallStatus ?? r?.status ?? r?.complianceStatus ?? '').toLowerCase();
      return status.includes('expired') || status.includes('missing') || status.includes('expiring') || status.includes('at_risk') || status.includes('risk');
    }).length;
    this.metrics.update((m) => ({ ...m, complianceAtRisk: atRisk }));
  }

  async loadTimeOff(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/time-off/requests?status=pending&pageSize=100`);
    this.metrics.update((m) => ({
      ...m,
      pendingTimeOff: this.asArray(res).length || Number(res?.total ?? 0)
    }));
  }

  async loadPaychecks(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/paychecks?status=pending&pageSize=100`);
    this.metrics.update((m) => ({
      ...m,
      pendingPaychecks: this.asArray(res).length || Number(res?.total ?? 0)
    }));
  }

  async loadStaging(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/employee-data/staging`);
    this.metrics.update((m) => ({
      ...m,
      bulkStaging: this.asArray(res).length || Number(res?.total ?? 0)
    }));
  }

  async loadHrDocs(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/employee-documents?pageSize=250`);
    const docs = this.asArray(res);
    const now = Date.now();
    const in90 = now + 90 * 24 * 60 * 60 * 1000;
    let expiring = 0;
    let expired = 0;
    for (const d of docs) {
      const status = String(d?.status ?? '').toLowerCase();
      const expiry = d?.expiryDate ?? d?.expirationDate;
      const t = expiry ? new Date(expiry).getTime() : NaN;
      if (status === 'expired' || (Number.isFinite(t) && t < now)) expired++;
      else if (status === 'expiring' || (Number.isFinite(t) && t >= now && t <= in90)) expiring++;
    }
    this.metrics.update((m) => ({ ...m, docsExpiring: expiring, docsExpired: expired }));
  }

  async loadSnapshots(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/employee-snapshots`);
    const snaps = this.asArray(res).slice(0, 12).reverse();
    this.headcountData.set(
      snaps.map((s: any) => ({
        name: this.formatMonth(String(s.month ?? '')),
        value: Number(s.activeCount ?? 0)
      }))
    );
  }

  async loadEmployeePopulation(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/employee-roster?limit=500`);
    const employees = this.asArray(res).filter(
      (e: any) => String(e?.status ?? '').toLowerCase() === 'active' || !e?.status
    );
    this.employeePopulation.set(employees);
    this.applyWorkforceFilters();
  }

  async loadRecentActivity(): Promise<void> {
    const [timeOffRes, docsRes, applicantsRes] = await Promise.all([
      this.fetch<any>(`${this.apiUrl}/api/v1/time-off/requests?pageSize=5`),
      this.fetch<any>(`${this.apiUrl}/api/v1/employee-documents?pageSize=5`),
      this.fetch<any>(`${this.apiUrl}/api/v1/applicants/records?includeCv=false`)
    ]);
    const activities: ActivityItem[] = [];

    for (const r of this.asArray(timeOffRes).slice(0, 5)) {
      activities.push({
        id: `to-${r.id}`,
        icon: r.status === 'approved' ? 'bx-check-circle' : r.status === 'denied' ? 'bx-x-circle' : 'bx-calendar-event',
        title: `Time Off ${String(r.status ?? 'requested')}`,
        description: `${r.employeeName ?? 'Employee'}`,
        time: this.timeAgo(r.createdAt ?? r.requestedAt),
        date: new Date(r.createdAt ?? r.requestedAt ?? 0),
        category: 'timeoff'
      });
    }
    for (const d of this.asArray(docsRes).slice(0, 5)) {
      activities.push({
        id: `doc-${d.id}`,
        icon: 'bx-file',
        title: 'Document Uploaded',
        description: `${d.documentType ?? d.fileName ?? 'Document'} — ${d.employeeName ?? 'Employee'}`,
        time: this.timeAgo(d.createdAt ?? d.uploadedAt),
        date: new Date(d.createdAt ?? d.uploadedAt ?? 0),
        category: 'document'
      });
    }
    for (const a of this.asArray(applicantsRes)
      .sort((x, y) => new Date(y?.appliedDate ?? y?.createdAt ?? 0).getTime() - new Date(x?.appliedDate ?? x?.createdAt ?? 0).getTime())
      .slice(0, 4)) {
      activities.push({
        id: `app-${a.id}`,
        icon: 'bx-user-plus',
        title: 'Applicant Update',
        description: `${a.name ?? a.applicantName ?? 'Applicant'} — ${a.status ?? 'submitted'}`,
        time: this.timeAgo(a.appliedDate ?? a.createdAt),
        date: new Date(a.appliedDate ?? a.createdAt ?? 0),
        category: 'applicant'
      });
    }

    activities.sort((a, b) => b.date.getTime() - a.date.getTime());
    this.recentActivity.set(activities.slice(0, 10));
  }

  onDepartmentChartSelect(event: any): void {
    const name = event?.name ? String(event.name) : null;
    if (!name) return;
    this.selectedDepartment.set(this.selectedDepartment() === name ? null : name);
    this.applyWorkforceFilters();
  }

  onRoleChartSelect(event: any): void {
    const name = event?.name ? String(event.name) : null;
    if (!name) return;
    this.selectedRole.set(this.selectedRole() === name ? null : name);
    this.applyWorkforceFilters();
  }

  clearDepartmentFilter(): void {
    this.selectedDepartment.set(null);
    this.applyWorkforceFilters();
  }

  clearRoleFilter(): void {
    this.selectedRole.set(null);
    this.applyWorkforceFilters();
  }

  clearWorkforceFilters(): void {
    this.selectedDepartment.set(null);
    this.selectedRole.set(null);
    this.applyWorkforceFilters();
  }

  private applyWorkforceFilters(): void {
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
    return `${months[parseInt(m, 10) - 1] ?? m} ${String(y).slice(2)}`;
  }

  formatBreakdownLabel(value: string): string {
    return String(value ?? '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
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
