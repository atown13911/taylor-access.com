import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Color, NgxChartsModule, ScaleType } from '@swimlane/ngx-charts';
import { catchError, lastValueFrom, of } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface ChartPoint { name: string; value: number; }
interface HeadcountSnapshot { month: string; value: number; }
interface WavePoint { key: string; label: string; value: number; x: number; y: number; }
interface WaveSeries {
  key: string;
  name: string;
  color: string;
  linePath: string;
  areaPath: string;
  points: WavePoint[];
  latest: number;
}
type HeadcountMode = 'roles' | 'positions' | 'fleet' | 'total';
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
  tone: 'cyan' | 'green' | 'orange' | 'violet';
  icon: string;
  label: string;
  badge: string;
  value: string | number;
  meter: number;
  chip: string;
  soft: string;
  detail: string;
  route?: string;
}
interface InsightItem {
  id: string;
  tone: 'positive' | 'warning' | 'neutral';
  icon: string;
  label: string;
  badge: string;
  value: string | number;
  meter: number;
  chip: string;
  soft: string;
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

      @if (deptChartData().length > 0 || roleChartData().length > 0 || driverTenureWave().points.length > 0) {
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
              <div class="chart-card dept-pie-card">
                <h3>By Department</h3>
                <div class="dept-pie-layout">
                  <div class="pie-chart-wrap" [class.has-selection]="!!selectedDepartment()">
                    <div class="pie-glow-ring" aria-hidden="true"></div>
                    <ngx-charts-pie-chart
                      [results]="deptChartData()"
                      [view]="deptPieView"
                      [scheme]="deptPieScheme"
                      [labels]="false"
                      [doughnut]="true"
                      [arcWidth]="0.38"
                      [legend]="false"
                      [tooltipDisabled]="false"
                      [animations]="true"
                      [gradient]="true"
                      (select)="onDepartmentChartSelect($event)">
                    </ngx-charts-pie-chart>
                    <div class="pie-center-stat">
                      <strong>{{ deptPieTotal() }}</strong>
                      <span>Total</span>
                    </div>
                  </div>
                  <div class="dept-pie-side">
                    @for (row of deptPieRows(); track row.name; let i = $index) {
                      <button
                        type="button"
                        class="dept-pie-row"
                        [class.active]="selectedDepartment() === row.name"
                        (click)="onDepartmentChartSelect(row)">
                        <span class="dept-swatch" [style.--swatch]="deptPieColors[i % deptPieColors.length]"></span>
                        <span class="dept-name">{{ formatBreakdownLabel(row.name) }}</span>
                        <span class="dept-count">{{ row.value }}</span>
                        <span class="dept-pct">{{ row.pct }}%</span>
                      </button>
                    }
                  </div>
                </div>
              </div>
            }
            @if (roleChartData().length > 0) {
              <div class="chart-card">
                <h3>By Role</h3>
                <div class="vbar-chart">
                  @for (row of roleBarRows(); track row.name; let i = $index) {
                    <button
                      type="button"
                      class="vbar-col"
                      [class.active]="selectedRole() === row.name"
                      [title]="formatBreakdownLabel(row.name) + ': ' + row.value"
                      (click)="onRoleChartSelect(row)">
                      <span class="vbar-value">{{ row.value }}</span>
                      <div class="vbar-track">
                        <span class="vbar-fill tone-{{ i % 8 }}" [style.height.%]="row.pct"></span>
                      </div>
                      <span class="vbar-label">{{ formatBreakdownLabel(row.name) }}</span>
                    </button>
                  }
                </div>
              </div>
            }
            @if (driverTenureWave().points.length > 0) {
              <div class="chart-card">
                <h3>Driver Length of Employment</h3>
                <div class="tenure-wave">
                  <svg
                    class="tenure-wave-svg"
                    [attr.viewBox]="'0 0 ' + tenureView.w + ' ' + tenureView.h"
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    aria-label="Driver length of employment distribution">
                    <defs>
                      <linearGradient id="tenureFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.4"></stop>
                        <stop offset="100%" stop-color="#a78bfa" stop-opacity="0.03"></stop>
                      </linearGradient>
                      <filter id="tenureGlow" x="-20%" y="-40%" width="140%" height="180%">
                        <feGaussianBlur stdDeviation="2" result="blur"></feGaussianBlur>
                        <feMerge>
                          <feMergeNode in="blur"></feMergeNode>
                          <feMergeNode in="SourceGraphic"></feMergeNode>
                        </feMerge>
                      </filter>
                    </defs>
                    @for (tick of driverTenureWave().yTicks; track tick.label) {
                      <line
                        class="tenure-grid"
                        [attr.x1]="tenureView.padL"
                        [attr.x2]="tenureView.w - tenureView.padR"
                        [attr.y1]="tick.y"
                        [attr.y2]="tick.y">
                      </line>
                      <text class="tenure-y" [attr.x]="tenureView.padL - 6" [attr.y]="tick.y + 3" text-anchor="end">{{ tick.label }}</text>
                    }
                    <path class="tenure-area" [attr.d]="driverTenureWave().areaPath" fill="url(#tenureFill)"></path>
                    <path
                      class="tenure-line"
                      [attr.d]="driverTenureWave().linePath"
                      fill="none"
                      stroke="#a78bfa"
                      stroke-width="2.6"
                      filter="url(#tenureGlow)">
                    </path>
                    @for (pt of driverTenureWave().points; track pt.key) {
                      <circle class="tenure-dot" [attr.cx]="pt.x" [attr.cy]="pt.y" r="4">
                        <title>{{ pt.label }}: {{ pt.value }}</title>
                      </circle>
                      <text class="tenure-value" [attr.x]="pt.x" [attr.y]="pt.y - 10" text-anchor="middle">{{ pt.value }}</text>
                      <text class="tenure-x" [attr.x]="pt.x" [attr.y]="tenureView.h - 8" text-anchor="middle">{{ pt.label }}</text>
                    }
                  </svg>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <div class="chart-section">
        <h2><i class="bx bx-bell"></i> Action Needed</h2>
        @if (actionAlerts().length > 0) {
          <div class="alert-grid">
            @for (alert of actionAlerts(); track alert.id) {
              @if (alert.route) {
                <a class="stat-panel action-panel" [routerLink]="alert.route" [ngClass]="['tone-' + alert.tone, 'level-' + alert.level]">
                  <i class="bx stat-panel-mark" [ngClass]="alert.icon" aria-hidden="true"></i>
                  <header class="stat-panel-head">
                    <span class="stat-panel-label">{{ alert.label }}</span>
                    <span class="stat-panel-badge">{{ alert.badge }}</span>
                  </header>
                  <p class="stat-panel-value">{{ alert.value }}</p>
                  <div class="stat-panel-meter" aria-hidden="true"><span [style.width.%]="alert.meter"></span></div>
                  <footer class="stat-panel-foot">
                    <span class="stat-panel-chip">{{ alert.chip }}</span>
                    <span class="stat-panel-chip soft">{{ alert.soft }}</span>
                  </footer>
                  <p class="action-panel-detail">{{ alert.detail }}</p>
                </a>
              } @else {
                <article class="stat-panel action-panel" [ngClass]="['tone-' + alert.tone, 'level-' + alert.level]">
                  <i class="bx stat-panel-mark" [ngClass]="alert.icon" aria-hidden="true"></i>
                  <header class="stat-panel-head">
                    <span class="stat-panel-label">{{ alert.label }}</span>
                    <span class="stat-panel-badge">{{ alert.badge }}</span>
                  </header>
                  <p class="stat-panel-value">{{ alert.value }}</p>
                  <div class="stat-panel-meter" aria-hidden="true"><span [style.width.%]="alert.meter"></span></div>
                  <footer class="stat-panel-foot">
                    <span class="stat-panel-chip">{{ alert.chip }}</span>
                    <span class="stat-panel-chip soft">{{ alert.soft }}</span>
                  </footer>
                  <p class="action-panel-detail">{{ alert.detail }}</p>
                </article>
              }
            }
          </div>
        } @else {
          <div class="chart-card glow-panel"><div class="chart-empty">No critical items right now</div></div>
        }
      </div>

      <div class="chart-section">
        <h2><i class="bx bx-bulb"></i> Ops Insights</h2>
        <div class="insight-grid">
          @for (insight of opsInsights(); track insight.id) {
            <article class="stat-panel insight-panel" [ngClass]="'tone-' + (insight.tone === 'positive' ? 'green' : insight.tone === 'warning' ? 'orange' : 'cyan')">
              <i class="bx stat-panel-mark" [ngClass]="insight.icon" aria-hidden="true"></i>
              <header class="stat-panel-head">
                <span class="stat-panel-label">{{ insight.label }}</span>
                <span class="stat-panel-badge">{{ insight.badge }}</span>
              </header>
              <p class="stat-panel-value">{{ insight.value }}</p>
              <div class="stat-panel-meter" aria-hidden="true"><span [style.width.%]="insight.meter"></span></div>
              <footer class="stat-panel-foot">
                <span class="stat-panel-chip">{{ insight.chip }}</span>
                <span class="stat-panel-chip soft">{{ insight.soft }}</span>
              </footer>
              <p class="action-panel-detail">{{ insight.detail }}</p>
            </article>
          }
        </div>
      </div>

      <div class="chart-section">
        <div class="chart-section-head">
          <h2><i class="bx bx-trending-up"></i> Headcount Trend</h2>
          <div class="wave-mode-toggle" role="tablist" aria-label="Headcount breakdown">
            <button type="button" role="tab" [class.active]="headcountMode() === 'roles'" (click)="setHeadcountMode('roles')">Roles</button>
            <button type="button" role="tab" [class.active]="headcountMode() === 'positions'" (click)="setHeadcountMode('positions')">Positions</button>
            <button type="button" role="tab" [class.active]="headcountMode() === 'fleet'" (click)="setHeadcountMode('fleet')">Fleet</button>
            <button type="button" role="tab" [class.active]="headcountMode() === 'total'" (click)="setHeadcountMode('total')">Total</button>
          </div>
        </div>
        <div class="chart-card wide">
          @if (headcountWave().series.length > 0) {
            <div class="wave-legend">
              @for (s of headcountWave().series; track s.key) {
                <button
                  type="button"
                  class="wave-legend-item"
                  [class.dimmed]="hiddenWaveSeries().has(s.key)"
                  (click)="toggleWaveSeries(s.key)">
                  <i class="wave-swatch" [style.background]="s.color"></i>
                  <span>{{ s.name }}</span>
                  <strong>{{ s.latest }}</strong>
                </button>
              }
            </div>
            <div class="wave-layout">
              <aside class="wave-side left" aria-label="Series summary">
                <h4>{{ headcountSummary().leftTitle }}</h4>
                @for (row of headcountSummary().leftRows; track row.key) {
                  <div class="wave-side-row">
                    <div class="wave-side-row-top">
                      <span class="wave-side-dot" [style.background]="row.color"></span>
                      <span class="wave-side-name">{{ row.name }}</span>
                      <strong>{{ row.value }}</strong>
                    </div>
                    <div class="wave-side-meter"><span [style.width.%]="row.pct" [style.background]="row.color"></span></div>
                    <div class="wave-side-meta">
                      <span>{{ row.pct }}%</span>
                      <span [class.up]="row.delta > 0" [class.down]="row.delta < 0">{{ row.deltaLabel }}</span>
                    </div>
                  </div>
                }
              </aside>

              <div class="wave-chart" [style.--wave-w.px]="wideChartWidth">
                <svg
                  class="wave-svg"
                  [attr.viewBox]="'0 0 ' + waveView.w + ' ' + waveView.h"
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  [attr.aria-label]="'Monthly headcount by ' + headcountMode()">
                  <defs>
                    <filter id="headcountGlow" x="-20%" y="-40%" width="140%" height="180%">
                      <feGaussianBlur stdDeviation="2.2" result="blur"></feGaussianBlur>
                      <feMerge>
                        <feMergeNode in="blur"></feMergeNode>
                        <feMergeNode in="SourceGraphic"></feMergeNode>
                      </feMerge>
                    </filter>
                    @for (s of headcountWave().series; track s.key) {
                      <linearGradient [attr.id]="'waveFill-' + s.key" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" [attr.stop-color]="s.color" stop-opacity="0.28"></stop>
                        <stop offset="100%" [attr.stop-color]="s.color" stop-opacity="0.02"></stop>
                      </linearGradient>
                    }
                  </defs>

                  @for (tick of headcountWave().yTicks; track tick.label) {
                    <line
                      class="wave-grid"
                      [attr.x1]="waveView.padL"
                      [attr.x2]="waveView.w - waveView.padR"
                      [attr.y1]="tick.y"
                      [attr.y2]="tick.y">
                    </line>
                    <text class="wave-y-label" [attr.x]="waveView.padL - 8" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
                  }

                  @for (s of headcountWave().series; track s.key) {
                    @if (!hiddenWaveSeries().has(s.key)) {
                      <path class="wave-area" [attr.d]="s.areaPath" [attr.fill]="'url(#waveFill-' + s.key + ')'"></path>
                      <path
                        class="wave-line"
                        [attr.d]="s.linePath"
                        fill="none"
                        [attr.stroke]="s.color"
                        stroke-width="2.5"
                        filter="url(#headcountGlow)">
                      </path>
                      @for (pt of s.points; track pt.key) {
                        <circle class="wave-dot" [attr.cx]="pt.x" [attr.cy]="pt.y" r="3.2" [attr.fill]="s.color" [attr.stroke]="s.color">
                          <title>{{ s.name }} · {{ pt.label }}: {{ pt.value }}</title>
                        </circle>
                      }
                    }
                  }

                  @for (pt of headcountWave().xLabels; track pt.key) {
                    <text class="wave-x-label" [attr.x]="pt.x" [attr.y]="waveView.h - 10" text-anchor="middle">{{ pt.label }}</text>
                  }
                </svg>
              </div>

              <aside class="wave-side right" aria-label="Trend summary">
                <h4>{{ headcountSummary().rightTitle }}</h4>
                @for (kpi of headcountSummary().rightKpis; track kpi.label) {
                  <div class="wave-side-kpi" [ngClass]="'tone-' + kpi.tone">
                    <span class="wave-side-kpi-label">{{ kpi.label }}</span>
                    <strong class="wave-side-kpi-value">{{ kpi.value }}</strong>
                    <span class="wave-side-kpi-soft">{{ kpi.soft }}</span>
                  </div>
                }
              </aside>
            </div>
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
      box-shadow: 0 0 16px rgba(0, 242, 254, 0.18);
    }
    .btn-refresh:hover:not(:disabled) {
      background: rgba(0, 242, 254, 0.2);
      box-shadow: 0 0 24px rgba(0, 242, 254, 0.32);
    }
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
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.05) inset,
        0 0 22px color-mix(in srgb, var(--kpi-accent) 18%, transparent),
        0 14px 32px rgba(0, 0, 0, 0.32);
      animation: stat-panel-in 0.48s cubic-bezier(0.22, 1, 0.36, 1) both;
      transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
      text-decoration: none; color: inherit;
    }
    .stat-panel::before {
      content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px;
      border-radius: 0 4px 4px 0;
      background: linear-gradient(180deg, var(--kpi-accent), transparent 95%);
      box-shadow: 0 0 14px color-mix(in srgb, var(--kpi-accent) 70%, transparent);
    }
    .stat-panel:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--kpi-accent) 50%, rgba(255, 255, 255, 0.08));
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.06) inset,
        0 0 36px color-mix(in srgb, var(--kpi-accent) 28%, transparent),
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
    .chart-section-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      margin: 0 0 16px; flex-wrap: wrap;
    }
    .chart-section-head h2 {
      color: #e0f7ff; font-size: 1.1rem; margin: 0; display: flex; align-items: center; gap: 8px;
      text-shadow: 0 0 18px rgba(0, 229, 255, 0.25);
    }
    .chart-section h2 {
      color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; display: flex; align-items: center; gap: 8px;
      text-shadow: 0 0 18px rgba(0, 229, 255, 0.25);
    }
    .chart-section h2 i, .chart-section-head h2 i { color: #00e5ff; filter: drop-shadow(0 0 8px rgba(0, 229, 255, 0.45)); }

    .wave-mode-toggle {
      display: inline-flex; gap: 4px; padding: 3px;
      border-radius: 999px; border: 1px solid rgba(0, 229, 255, 0.22);
      background: rgba(0, 229, 255, 0.06);
    }
    .wave-mode-toggle button {
      border: 0; background: transparent; color: rgba(226, 232, 240, 0.72);
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      padding: 6px 12px; border-radius: 999px; cursor: pointer;
    }
    .wave-mode-toggle button.active {
      color: #041018; background: linear-gradient(135deg, #00e5ff, #00ff88);
      box-shadow: 0 0 16px rgba(0, 229, 255, 0.35);
    }

    .wave-legend {
      display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;
    }
    .wave-legend-item {
      display: inline-flex; align-items: center; gap: 6px;
      border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.04);
      border-radius: 999px; padding: 4px 10px; color: #e2e8f0; font-size: 0.72rem; cursor: pointer;
    }
    .wave-legend-item strong { font-variant-numeric: tabular-nums; color: #f8fafc; }
    .wave-legend-item.dimmed { opacity: 0.35; }
    .wave-swatch {
      width: 8px; height: 8px; border-radius: 999px; display: inline-block;
      box-shadow: 0 0 8px currentColor;
    }

    .wave-layout {
      display: grid;
      grid-template-columns: minmax(180px, 220px) minmax(0, 1fr) minmax(160px, 200px);
      gap: 14px;
      align-items: stretch;
    }
    @media (max-width: 1100px) {
      .wave-layout { grid-template-columns: 1fr; }
    }

    .wave-side {
      display: flex; flex-direction: column; gap: 10px;
      padding: 12px; border-radius: 12px;
      border: 1px solid rgba(0, 229, 255, 0.14);
      background: rgba(8, 14, 26, 0.55);
      min-height: 280px;
    }
    .wave-side h4 {
      margin: 0 0 2px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: rgba(226, 232, 240, 0.7);
    }
    .wave-side-row { display: flex; flex-direction: column; gap: 4px; }
    .wave-side-row-top {
      display: flex; align-items: center; gap: 6px; min-width: 0;
    }
    .wave-side-row-top strong {
      margin-left: auto; font-variant-numeric: tabular-nums; color: #f8fafc; font-size: 0.85rem;
    }
    .wave-side-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
    .wave-side-name {
      font-size: 0.74rem; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .wave-side-meter {
      height: 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); overflow: hidden;
    }
    .wave-side-meter span { display: block; height: 100%; border-radius: inherit; }
    .wave-side-meta {
      display: flex; justify-content: space-between; gap: 8px;
      font-size: 0.68rem; color: rgba(148, 163, 184, 0.95);
    }
    .wave-side-meta .up { color: #34d399; }
    .wave-side-meta .down { color: #fb7185; }

    .wave-side-kpi {
      --kpi-accent: #00d4ff;
      padding: 10px; border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--kpi-accent) 28%, transparent);
      background:
        radial-gradient(120% 100% at 100% 0%, color-mix(in srgb, var(--kpi-accent) 14%, transparent), transparent 55%),
        rgba(255, 255, 255, 0.03);
    }
    .wave-side-kpi.tone-cyan { --kpi-accent: #00d4ff; }
    .wave-side-kpi.tone-green { --kpi-accent: #00ff88; }
    .wave-side-kpi.tone-orange { --kpi-accent: #ffaa00; }
    .wave-side-kpi.tone-violet { --kpi-accent: #a78bfa; }
    .wave-side-kpi-label {
      display: block; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.07em;
      text-transform: uppercase; color: rgba(226, 232, 240, 0.68);
    }
    .wave-side-kpi-value {
      display: block; margin-top: 4px; font-size: 1.05rem; color: #f8fafc;
      text-shadow: 0 0 14px color-mix(in srgb, var(--kpi-accent) 28%, transparent);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .wave-side-kpi-soft {
      display: block; margin-top: 2px; font-size: 0.7rem;
      color: color-mix(in srgb, var(--kpi-accent) 72%, #e2e8f0);
    }

    .chart-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .chart-card, .glow-panel {
      background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(0, 229, 255, 0.14);
      border-radius: 14px; padding: 18px; overflow: hidden;
      box-shadow:
        0 0 24px rgba(0, 229, 255, 0.08),
        0 8px 32px rgba(0, 0, 0, 0.15);
    }
    .chart-card.wide { padding: 20px; }
    .chart-card h3 { color: #ccc; font-size: 0.85rem; margin: 0 0 14px; font-weight: 500; }
    .chart-empty { text-align: center; padding: 40px; color: #555; font-size: 0.85rem; }

    .tenure-wave { width: 100%; height: 260px; }
    .tenure-wave-svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .tenure-grid { stroke: rgba(255, 255, 255, 0.06); stroke-width: 1; }
    .tenure-y, .tenure-x { fill: #8b93a7; font-size: 10px; font-family: inherit; }
    .tenure-value { fill: #e2e8f0; font-size: 11px; font-weight: 700; font-family: inherit; }
    .tenure-line { stroke-linecap: round; stroke-linejoin: round; }
    .tenure-dot {
      fill: #0b1220; stroke: #a78bfa; stroke-width: 2.2;
      filter: drop-shadow(0 0 6px rgba(167, 139, 250, 0.55));
    }

    .wave-chart {
      width: 100%;
      max-width: none;
      height: 300px;
      margin: 0;
      min-width: 0;
    }
    .wave-svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .wave-grid { stroke: rgba(255, 255, 255, 0.06); stroke-width: 1; }
    .wave-y-label { fill: #888; font-size: 11px; font-family: inherit; }
    .wave-x-label { fill: #9ca3af; font-size: 11px; font-family: inherit; }
    .wave-line { stroke-linecap: round; stroke-linejoin: round; }
    .wave-dot {
      stroke-width: 1.5;
      fill-opacity: 0.95;
      filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.15));
    }

    .dept-pie-layout {
      display: grid;
      grid-template-columns: minmax(160px, 1fr) minmax(140px, 1.05fr);
      gap: 12px 16px;
      align-items: center;
      min-height: 260px;
    }
    .pie-chart-wrap {
      position: relative;
      min-height: 220px;
      height: 240px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pie-glow-ring {
      position: absolute;
      inset: 18%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(0, 229, 255, 0.18) 0%, rgba(0, 255, 163, 0.06) 45%, transparent 70%);
      pointer-events: none;
      filter: blur(6px);
      z-index: 0;
    }
    .pie-center-stat {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 2;
      gap: 2px;
    }
    .pie-center-stat strong {
      font-size: 1.35rem;
      font-weight: 700;
      color: #f8fafc;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      text-shadow: 0 0 12px rgba(0, 229, 255, 0.45);
    }
    .pie-center-stat span {
      font-size: 0.65rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
    }
    ::ng-deep ngx-charts-pie-chart {
      display: block;
      position: relative;
      z-index: 1;
    }
    ::ng-deep .pie-chart-wrap ngx-charts-pie-chart .arc path {
      filter:
        drop-shadow(0 0 4px rgba(0, 229, 255, 0.55))
        drop-shadow(0 0 10px rgba(0, 255, 163, 0.28));
      stroke: rgba(8, 12, 18, 0.65);
      stroke-width: 1.5px;
      transition: filter 0.2s ease, opacity 0.2s ease;
    }
    ::ng-deep .pie-chart-wrap ngx-charts-pie-chart .arc:hover path,
    ::ng-deep .pie-chart-wrap.has-selection ngx-charts-pie-chart .arc path {
      filter:
        drop-shadow(0 0 6px rgba(0, 229, 255, 0.85))
        drop-shadow(0 0 14px rgba(255, 77, 141, 0.35));
    }
    .dept-pie-side {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 240px;
      overflow-y: auto;
      padding-right: 2px;
    }
    .dept-pie-row {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 8px;
      padding: 7px 8px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      color: inherit;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .dept-pie-row:hover {
      background: rgba(0, 229, 255, 0.08);
      border-color: rgba(0, 229, 255, 0.2);
    }
    .dept-pie-row.active {
      background: rgba(0, 229, 255, 0.12);
      border-color: rgba(0, 229, 255, 0.35);
      box-shadow: 0 0 12px rgba(0, 229, 255, 0.15);
    }
    .dept-swatch {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      background: var(--swatch, #00e5ff);
      box-shadow: 0 0 8px color-mix(in srgb, var(--swatch, #00e5ff) 70%, transparent);
      flex-shrink: 0;
    }
    .dept-name {
      font-size: 0.72rem;
      color: #cbd5e1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dept-pie-row.active .dept-name { color: #e0f7ff; }
    .dept-count {
      font-size: 0.75rem;
      font-weight: 700;
      color: #f8fafc;
      font-variant-numeric: tabular-nums;
    }
    .dept-pct {
      font-size: 0.68rem;
      color: #94a3b8;
      font-variant-numeric: tabular-nums;
      min-width: 2.4em;
      text-align: right;
    }
    @media (max-width: 1100px) {
      .dept-pie-layout { grid-template-columns: 1fr; }
    }
    .vbar-chart {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      min-height: 260px;
      height: 280px;
      overflow-x: auto;
      padding: 4px 2px 0;
    }
    .vbar-col {
      flex: 1 1 0;
      min-width: 42px;
      max-width: 72px;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .vbar-col.static { cursor: default; }
    .vbar-col:not(.static):hover .vbar-label,
    .vbar-col.active .vbar-label { color: #e0f7ff; }
    .vbar-col:not(.static):hover .vbar-track,
    .vbar-col.active .vbar-track {
      box-shadow: inset 0 0 0 1px rgba(0, 229, 255, 0.28);
    }
    .vbar-value {
      font-size: 0.72rem;
      font-weight: 700;
      color: #f8fafc;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .vbar-track {
      width: 100%;
      flex: 1 1 auto;
      min-height: 120px;
      border-radius: 10px 10px 4px 4px;
      background: rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: flex-end;
      overflow: hidden;
    }
    .vbar-fill {
      display: block;
      width: 100%;
      min-height: 6px;
      border-radius: 10px 10px 2px 2px;
      transition: height 0.45s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .vbar-label {
      width: 100%;
      min-height: 2.4em;
      font-size: 0.62rem;
      line-height: 1.15;
      color: #9ca3af;
      text-align: center;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    .vbar-fill.tone-0 { background: linear-gradient(180deg, #a855f7, #7c3aed); }
    .vbar-fill.tone-1 { background: linear-gradient(180deg, #38bdf8, #0284c7); }
    .vbar-fill.tone-2 { background: linear-gradient(180deg, #22d3ee, #0e7490); }
    .vbar-fill.tone-3 { background: linear-gradient(180deg, #34d399, #047857); }
    .vbar-fill.tone-4 { background: linear-gradient(180deg, #facc15, #a16207); }
    .vbar-fill.tone-5 { background: linear-gradient(180deg, #fb923c, #c2410c); }
    .vbar-fill.tone-6 { background: linear-gradient(180deg, #fb7185, #be123c); }
    .vbar-fill.tone-7 { background: linear-gradient(180deg, #c084fc, #6d28d9); }

    .alert-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    .insight-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    .action-panel, .insight-panel { min-height: 178px; }
    .action-panel-detail {
      position: relative; z-index: 1; margin: 2px 0 0;
      font-size: 0.72rem; line-height: 1.35; color: rgba(180, 198, 214, 0.88);
    }
    .stat-panel.level-high {
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.05) inset,
        0 0 28px color-mix(in srgb, var(--kpi-accent) 32%, transparent),
        0 14px 32px rgba(0, 0, 0, 0.32);
    }
    .stat-panel.level-medium {
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.05) inset,
        0 0 24px color-mix(in srgb, var(--kpi-accent) 24%, transparent),
        0 14px 32px rgba(0, 0, 0, 0.32);
    }

    .breakdown-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .filter-chip {
      border: 1px solid rgba(0, 242, 254, 0.28); background: rgba(0, 242, 254, 0.09); color: #a5f3fc;
      border-radius: 999px; padding: 4px 10px; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 6px;
      cursor: pointer; box-shadow: 0 0 14px rgba(0, 229, 255, 0.12);
    }
    .filter-chip.clear-all { background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.35); color: #ddd6fe; }

    .quick-actions { margin-bottom: 32px; }
    .quick-actions h2 { color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; text-shadow: 0 0 18px rgba(0, 229, 255, 0.25); }
    .action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .action-card {
      background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(0, 229, 255, 0.16); border-radius: 12px;
      padding: 18px; text-align: center; text-decoration: none; display: flex; flex-direction: column;
      align-items: center; gap: 10px; position: relative; transition: all 0.25s;
      box-shadow: 0 0 18px rgba(0, 229, 255, 0.1);
    }
    .action-card i { font-size: 1.8rem; color: #00e5ff; filter: drop-shadow(0 0 8px rgba(0, 229, 255, 0.45)); }
    .action-card span { color: #ccc; font-size: 0.82rem; font-weight: 500; }
    .action-card:hover {
      border-color: #00e5ff; transform: translateY(-2px);
      box-shadow: 0 0 28px rgba(0, 212, 255, 0.28);
    }
    .action-badge {
      position: absolute; top: 8px; right: 8px; background: #ff2a6d; color: #fff;
      font-size: 0.65rem; padding: 2px 6px; border-radius: 8px; font-weight: 700;
      box-shadow: 0 0 12px rgba(255, 42, 109, 0.45);
    }

    .recent-section h2 { color: #e0f7ff; font-size: 1.1rem; margin: 0 0 16px; text-shadow: 0 0 18px rgba(0, 229, 255, 0.25); }
    .activity-list {
      background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(0, 229, 255, 0.14);
      border-radius: 14px; overflow: hidden;
      box-shadow: 0 0 24px rgba(0, 229, 255, 0.08);
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
  driverPopulation = signal<any[]>([]);
  selectedDepartment = signal<string | null>(null);
  selectedRole = signal<string | null>(null);
  deptChartData = signal<ChartPoint[]>([]);
  roleChartData = signal<ChartPoint[]>([]);
  driverStatusChart = signal<ChartPoint[]>([]);
  headcountSnapshots = signal<HeadcountSnapshot[]>([]);
  headcountMode = signal<HeadcountMode>('roles');
  hiddenWaveSeries = signal<Set<string>>(new Set());
  wideChartWidth = 960;
  readonly waveView = { w: 1000, h: 300, padL: 52, padR: 20, padT: 18, padB: 40 };
  private readonly waveColors = [
    '#00ff88', '#00d4ff', '#ffaa00', '#a78bfa', '#fb7185', '#38bdf8', '#f472b6', '#facc15', '#94a3b8'
  ];

  private toBarRows(points: ChartPoint[]) {
    const max = Math.max(...points.map((p) => p.value), 1);
    return points.map((p) => ({
      name: p.name,
      value: p.value,
      pct: Math.max(4, Math.round((p.value / max) * 100))
    }));
  }

  readonly deptPieColors = [
    '#00E5FF', '#00FFA3', '#FF4D8D', '#FFC94D', '#7C4DFF', '#38BDF8', '#FB923C', '#A3E635'
  ];
  readonly deptPieView: [number, number] = [220, 220];
  deptPieScheme: Color = {
    name: 'hr-dept-pie',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: this.deptPieColors
  };
  deptPieTotal = computed(() => this.deptChartData().reduce((sum, p) => sum + p.value, 0));
  deptPieRows = computed(() => {
    const total = Math.max(this.deptPieTotal(), 1);
    return this.deptChartData().map((p) => ({
      name: p.name,
      value: p.value,
      pct: Math.round((p.value / total) * 1000) / 10
    }));
  });

  roleBarRows = computed(() => this.toBarRows(this.roleChartData()));
  readonly tenureView = { w: 420, h: 260, padL: 36, padR: 16, padT: 28, padB: 36 };

  /** Tenure distribution as a smooth line — better for ordered buckets than bars. */
  driverTenureWave = computed(() => {
    const rows = this.driverStatusChart().filter((r) => r.name !== 'Unknown' || r.value > 0);
    const view = this.tenureView;
    if (!rows.length) {
      return { points: [] as WavePoint[], linePath: '', areaPath: '', yTicks: [] as { y: number; label: string }[] };
    }

    const values = rows.map((r) => r.value);
    const maxV = Math.max(...values, 1);
    const yMax = Math.ceil(maxV * 1.15) || 1;
    const plotW = view.w - view.padL - view.padR;
    const plotH = view.h - view.padT - view.padB;
    const n = rows.length;
    const xAt = (i: number) => view.padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v: number) => view.padT + (1 - v / yMax) * plotH;
    const baseY = view.h - view.padB;

    const points: WavePoint[] = rows.map((r, i) => ({
      key: r.name,
      label: r.name,
      value: r.value,
      x: xAt(i),
      y: yAt(r.value)
    }));
    const linePath = this.smoothWavePath(points);
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`
      : '';

    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount }, (_, i) => {
      const t = i / (tickCount - 1);
      const value = Math.round(yMax * (1 - t));
      return { y: yAt(value), label: String(value) };
    });

    return { points, linePath, areaPath, yTicks };
  });

  /** Multi-series monthly wave: Roles, Positions, Fleet, or Total. */
  headcountWave = computed(() => {
    const mode = this.headcountMode();
    const view = this.waveView;
    const empty = {
      series: [] as WaveSeries[],
      xLabels: [] as WavePoint[],
      yTicks: [] as { y: number; label: string }[]
    };

    const months = this.lastTwelveMonthKeys();
    const rawSeries =
      mode === 'total'
        ? this.buildTotalSeries(months)
        : mode === 'fleet'
          ? this.buildFleetSeries(months)
          : this.buildBreakdownSeries(months, mode);

    if (!rawSeries.length) return empty;

    const allValues = rawSeries.flatMap((s) => s.values);
    const minV = Math.min(...allValues);
    const maxV = Math.max(...allValues);
    const pad = Math.max(2, Math.ceil((maxV - minV) * 0.12) || 2);
    const yMin = Math.max(0, Math.floor(minV - pad));
    const yMax = Math.ceil(maxV + pad);
    const plotW = view.w - view.padL - view.padR;
    const plotH = view.h - view.padT - view.padB;
    const n = months.length;
    const xAt = (i: number) => view.padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v: number) => view.padT + (1 - (v - yMin) / Math.max(yMax - yMin, 1)) * plotH;
    const baseY = view.h - view.padB;

    const series: WaveSeries[] = rawSeries.map((s, idx) => {
      const points: WavePoint[] = months.map((month, i) => ({
        key: `${s.key}-${month}`,
        label: this.formatMonthShort(month),
        value: s.values[i] ?? 0,
        x: xAt(i),
        y: yAt(s.values[i] ?? 0)
      }));
      const linePath = this.smoothWavePath(points);
      const areaPath = points.length
        ? `${linePath} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`
        : '';
      return {
        key: s.key,
        name: s.name,
        color: this.waveColors[idx % this.waveColors.length],
        linePath,
        areaPath,
        points,
        latest: s.values[s.values.length - 1] ?? 0
      };
    });

    const xLabels: WavePoint[] = months.map((month, i) => ({
      key: month,
      label: this.formatMonthShort(month),
      value: 0,
      x: xAt(i),
      y: baseY
    }));

    const tickCount = 5;
    const yTicks = Array.from({ length: tickCount }, (_, i) => {
      const t = i / (tickCount - 1);
      const value = Math.round(yMax - t * (yMax - yMin));
      return { y: yAt(value), label: String(value) };
    });

    return { series, xLabels, yTicks };
  });

  headcountSummary = computed(() => {
    const mode = this.headcountMode();
    const wave = this.headcountWave();
    const visible = wave.series.filter((s) => !this.hiddenWaveSeries().has(s.key));
    const totalLatest = visible.reduce((sum, s) => sum + s.latest, 0);
    const leftTitle =
      mode === 'fleet' ? 'Fleet Mix' : mode === 'positions' ? 'Top Positions' : mode === 'total' ? 'Headcount' : 'Top Roles';

    const leftRows = visible.slice(0, 6).map((s) => {
      const first = s.points[0]?.value ?? 0;
      const delta = s.latest - first;
      const pct = totalLatest > 0 ? Math.round((s.latest / totalLatest) * 100) : 0;
      return {
        key: s.key,
        name: s.name,
        color: s.color,
        value: s.latest,
        pct,
        delta,
        deltaLabel: delta > 0 ? `+${delta} 12mo` : delta < 0 ? `${delta} 12mo` : 'flat 12mo'
      };
    });

    const leader = visible[0];
    const totalFirst = visible.reduce((sum, s) => sum + (s.points[0]?.value ?? 0), 0);
    const totalDelta = totalLatest - totalFirst;
    const m = this.metrics();

    const rightKpis =
      mode === 'fleet'
        ? [
            { label: 'Active Drivers', value: m.activeDrivers, soft: `${m.totalDrivers} on roster`, tone: 'green' },
            {
              label: 'Dispatch Coverage',
              value: `${this.pct(m.driversWithDispatcher, m.activeDrivers || 1)}%`,
              soft: `${m.driversWithDispatcher} linked`,
              tone: 'orange'
            },
            {
              label: 'Unassigned',
              value: Math.max(m.activeDrivers - m.driversWithDispatcher, 0),
              soft: 'Need dispatcher',
              tone: 'cyan'
            },
            {
              label: 'Compliance Risk',
              value: m.complianceAtRisk,
              soft: 'At risk drivers',
              tone: 'violet'
            }
          ]
        : [
            {
              label: 'Shown Total',
              value: totalLatest,
              soft: `${visible.length} series`,
              tone: 'cyan'
            },
            {
              label: 'Leading',
              value: leader?.name ?? '—',
              soft: leader ? `${leader.latest} people` : 'n/a',
              tone: 'green'
            },
            {
              label: '12-Mo Change',
              value: totalDelta > 0 ? `+${totalDelta}` : `${totalDelta}`,
              soft: totalFirst > 0 ? `from ${totalFirst}` : 'baseline',
              tone: totalDelta >= 0 ? 'orange' : 'violet'
            },
            {
              label: mode === 'total' ? 'Snapshot Delta' : 'Share Leader',
              value:
                mode === 'total'
                  ? this.headcountDelta30d()
                  : leader && totalLatest > 0
                    ? `${Math.round((leader.latest / totalLatest) * 100)}%`
                    : '—',
              soft: mode === 'total' ? 'First → last' : 'Of visible mix',
              tone: 'violet'
            }
          ];

    return {
      leftTitle,
      leftRows,
      rightTitle: mode === 'fleet' ? 'Fleet Pulse' : 'Trend Pulse',
      rightKpis
    };
  });

  headcountDelta30d = computed(() => {
    const total = this.buildTotalSeries(this.lastTwelveMonthKeys());
    const values = total[0]?.values ?? [];
    if (values.length < 2) return '0';
    const delta = (values[values.length - 1] ?? 0) - (values[0] ?? 0);
    return delta > 0 ? `+${delta}` : `${delta}`;
  });

  toggleWaveSeries(key: string): void {
    const next = new Set(this.hiddenWaveSeries());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.hiddenWaveSeries.set(next);
  }

  setHeadcountMode(mode: HeadcountMode): void {
    this.headcountMode.set(mode);
    this.hiddenWaveSeries.set(new Set());
  }

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
        tone: 'orange',
        icon: 'bx-error',
        label: 'Expired Documents',
        badge: 'Urgent',
        value: m.docsExpired,
        meter: Math.min(100, m.docsExpired * 8),
        chip: `${m.docsExpiring} expiring`,
        soft: 'Renew now',
        detail: 'Renew expired documents to reduce compliance exposure.',
        route: '/hr/documents'
      });
    }
    if (m.complianceAtRisk > 0) {
      alerts.push({
        id: 'compliance-risk',
        level: 'high',
        tone: 'violet',
        icon: 'bx-shield-x',
        label: 'Compliance At Risk',
        badge: 'DOT',
        value: m.complianceAtRisk,
        meter: this.pct(m.complianceAtRisk, m.activeDrivers || m.totalDrivers || 1),
        chip: `${m.activeDrivers} active drivers`,
        soft: 'Board review',
        detail: 'Review expired or missing compliance items on the driver board.',
        route: '/compliance/driver-database'
      });
    }
    if (m.pendingPaychecks > 0) {
      alerts.push({
        id: 'pending-pay',
        level: 'high',
        tone: 'cyan',
        icon: 'bx-money-withdraw',
        label: 'Pending Paychecks',
        badge: 'Payroll',
        value: m.pendingPaychecks,
        meter: Math.min(100, m.pendingPaychecks * 10),
        chip: m.bulkStaging > 0 ? `${m.bulkStaging} staging` : 'Queue open',
        soft: 'Needs review',
        detail: 'Payroll queue needs review before pay run.',
        route: '/hr/payroll'
      });
    }
    if (m.pendingTimeOff > 0) {
      alerts.push({
        id: 'pending-pto',
        level: 'medium',
        tone: 'orange',
        icon: 'bx-calendar-exclamation',
        label: 'Pending Time Off',
        badge: 'PTO',
        value: m.pendingTimeOff,
        meter: Math.min(100, m.pendingTimeOff * 12),
        chip: 'Awaiting approval',
        soft: 'Schedule lock',
        detail: 'Approve or deny before schedules lock.',
        route: '/hr/time-off'
      });
    }
    if (m.openApplicants > 0) {
      alerts.push({
        id: 'applicants',
        level: 'medium',
        tone: 'violet',
        icon: 'bx-user-plus',
        label: 'Applicants In Pipeline',
        badge: 'Hiring',
        value: m.openApplicants,
        meter: Math.min(100, Math.round(m.openApplicants / 30)),
        chip: 'Open records',
        soft: 'Advance or close',
        detail: 'Move candidates forward or close stale applications.',
        route: '/hr/applicants'
      });
    }
    if (m.trailersUnassigned > 0) {
      alerts.push({
        id: 'trailers',
        level: 'low',
        tone: 'green',
        icon: 'bx-trailer',
        label: 'Unassigned Trailers',
        badge: 'Assets',
        value: m.trailersUnassigned,
        meter: this.pct(m.trailersUnassigned, m.trailersActive || 1),
        chip: `${m.trailersActive} active`,
        soft: 'Assign or park',
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
      icon: 'bx-broadcast',
      label: 'Dispatcher Coverage',
      badge: 'Ops',
      value: `${driverCoverage}%`,
      meter: driverCoverage,
      chip: `${m.driversWithDispatcher} linked`,
      soft: `${m.activeDrivers} active`,
      detail: driverCoverage >= 80
        ? 'Dispatcher coverage looks solid across the Landmark roster.'
        : 'Assign remaining Landmark drivers so dispatch ownership is clear.'
    });
    items.push({
      id: 'driver-health',
      tone: activeDriverPct >= 70 ? 'positive' : 'warning',
      icon: 'bx-id-card',
      label: 'Driver Availability',
      badge: 'Fleet',
      value: m.activeDrivers,
      meter: activeDriverPct,
      chip: `${activeDriverPct}% active`,
      soft: `${m.totalDrivers} total`,
      detail: activeDriverPct >= 70
        ? 'Fleet availability is healthy for current operations.'
        : 'Review inactive drivers and onboarding status.'
    });
    items.push({
      id: 'headcount',
      tone: delta.startsWith('+') ? 'positive' : 'neutral',
      icon: 'bx-trending-up',
      label: 'Headcount Trend',
      badge: '30d',
      value: delta,
      meter: delta.startsWith('+') ? 78 : 42,
      chip: 'Snapshot delta',
      soft: 'Workforce',
      detail: delta.startsWith('+')
        ? 'Headcount is growing — confirm onboarding and 90-day retention.'
        : 'Headcount is flat or down — watch attrition by role and department.'
    });
    if (m.complianceAtRisk > 0 || m.docsExpiring > 0) {
      items.push({
        id: 'compliance',
        tone: 'warning',
        icon: 'bx-shield-alt-2',
        label: 'Compliance Pressure',
        badge: 'Watch',
        value: m.complianceAtRisk,
        meter: this.pct(m.complianceAtRisk + m.docsExpiring, (m.activeDrivers || 1) + m.docsExpiring),
        chip: `${m.docsExpiring} docs soon`,
        soft: 'At risk',
        detail: `${m.complianceAtRisk} drivers at risk and ${m.docsExpiring} docs expiring within 90 days.`
      });
    }
    return items.slice(0, 4);
  });

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
    this.driverStatusChart.set(this.buildDriverTenureBuckets(activeDrivers));

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
    this.driverPopulation.set(drivers);
  }

  private buildDriverTenureBuckets(drivers: any[]): ChartPoint[] {
    const buckets: Array<{ name: string; minMonths: number; maxMonths: number | null }> = [
      { name: '< 6 mo', minMonths: 0, maxMonths: 6 },
      { name: '6–12 mo', minMonths: 6, maxMonths: 12 },
      { name: '1–2 yr', minMonths: 12, maxMonths: 24 },
      { name: '2–5 yr', minMonths: 24, maxMonths: 60 },
      { name: '5+ yr', minMonths: 60, maxMonths: null }
    ];
    const counts = new Map<string, number>(buckets.map((b) => [b.name, 0]));
    let unknown = 0;
    const now = Date.now();

    for (const d of drivers) {
      const start = this.driverStartDate(d);
      if (!start) {
        unknown += 1;
        continue;
      }
      const months = Math.max(0, (now - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
      const bucket = buckets.find((b) => months >= b.minMonths && (b.maxMonths == null || months < b.maxMonths));
      if (bucket) counts.set(bucket.name, (counts.get(bucket.name) ?? 0) + 1);
      else unknown += 1;
    }

    const rows = buckets.map((b) => ({ name: b.name, value: counts.get(b.name) ?? 0 }));
    if (unknown > 0) rows.push({ name: 'Unknown', value: unknown });
    return rows;
  }

  private driverStartDate(driver: any): Date | null {
    const raw = driver?.hireDate ?? driver?.HireDate ?? driver?.createdAt ?? driver?.CreatedAt ?? '';
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
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
    const snaps = this.asArray(res)
      .map((s: any) => ({
        month: this.normalizeMonthKey(String(s.month ?? '')),
        value: Number(s.activeCount ?? 0)
      }))
      .filter((s) => !!s.month)
      .sort((a, b) => a.month.localeCompare(b.month));
    this.headcountSnapshots.set(snaps);
  }

  async loadEmployeePopulation(): Promise<void> {
    const res = await this.fetch<any>(`${this.apiUrl}/api/v1/employee-roster?limit=2000`);
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

  formatMonthShort(month: string): string {
    if (!month) return '';
    const m = parseInt(month.split('-')[1] ?? '0', 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[m - 1] ?? month;
  }

  private normalizeMonthKey(raw: string): string {
    const s = String(raw ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return '';
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private lastTwelveMonthKeys(): string[] {
    const end = new Date();
    end.setDate(1);
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  }

  private buildTotalSeries(months: string[]): Array<{ key: string; name: string; values: number[] }> {
    const filled = this.buildMonthlyHeadcountSeries(this.headcountSnapshots());
    if (filled.length) {
      const byMonth = new Map(filled.map((m) => [m.month, m.value]));
      return [
        {
          key: 'total',
          name: 'Total Headcount',
          values: months.map((m) => byMonth.get(m) ?? 0)
        }
      ];
    }

    // Fallback: sum reconstructed role counts when snapshots are missing.
    const roles = this.buildBreakdownSeries(months, 'roles');
    if (!roles.length) return [];
    const values = months.map((_, i) => roles.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
    return [{ key: 'total', name: 'Total Headcount', values }];
  }

  /** Reconstruct monthly counts by role/position from hire/created dates. */
  private buildBreakdownSeries(
    months: string[],
    mode: 'roles' | 'positions'
  ): Array<{ key: string; name: string; values: number[] }> {
    const employees = this.employeePopulation();
    if (!employees.length) return [];

    const tallies = new Map<string, number[]>();
    for (const emp of employees) {
      const label =
        mode === 'roles'
          ? this.formatBreakdownLabel(String(emp?.role ?? 'Unassigned'))
          : this.formatBreakdownLabel(
              String(emp?.position?.title ?? emp?.jobTitle ?? emp?.position ?? 'Unassigned')
            );
      const startKey = this.employeeStartMonth(emp);
      if (!tallies.has(label)) tallies.set(label, months.map(() => 0));
      const row = tallies.get(label)!;
      months.forEach((month, i) => {
        if (!startKey || startKey <= month) row[i] += 1;
      });
    }

    return this.rankAndCapSeries(tallies, months);
  }

  /** Fleet series: Active / Inactive / Assigned / Unassigned over hire timeline. */
  private buildFleetSeries(months: string[]): Array<{ key: string; name: string; values: number[] }> {
    const drivers = this.driverPopulation();
    if (!drivers.length) return [];

    const buckets: Array<{ key: string; name: string; match: (d: any) => boolean }> = [
      {
        key: 'active',
        name: 'Active',
        match: (d) => this.isActiveStatus(d?.status) && !this.isInactiveStatus(d?.status)
      },
      {
        key: 'inactive',
        name: 'Inactive',
        match: (d) => this.isInactiveStatus(d?.status)
      },
      {
        key: 'assigned',
        name: 'Dispatcher Linked',
        match: (d) =>
          this.isActiveStatus(d?.status) && !this.isInactiveStatus(d?.status) && this.hasDispatcher(d)
      },
      {
        key: 'unassigned',
        name: 'Unassigned',
        match: (d) =>
          this.isActiveStatus(d?.status) && !this.isInactiveStatus(d?.status) && !this.hasDispatcher(d)
      }
    ];

    return buckets.map((bucket) => {
      const values = months.map((month) => {
        let count = 0;
        for (const d of drivers) {
          if (!bucket.match(d)) continue;
          const startKey = this.employeeStartMonth(d);
          if (!startKey || startKey <= month) count += 1;
        }
        return count;
      });
      return { key: bucket.key, name: bucket.name, values };
    });
  }

  private rankAndCapSeries(
    tallies: Map<string, number[]>,
    months: string[]
  ): Array<{ key: string; name: string; values: number[] }> {
    const ranked = Array.from(tallies.entries())
      .map(([name, values]) => ({
        key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        values,
        latest: values[values.length - 1] ?? 0
      }))
      .sort((a, b) => b.latest - a.latest);

    const topN = 7;
    if (ranked.length <= topN) {
      return ranked.map(({ key, name, values }) => ({ key, name, values }));
    }

    const top = ranked.slice(0, topN);
    const rest = ranked.slice(topN);
    const otherValues = months.map((_, i) => rest.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
    return [
      ...top.map(({ key, name, values }) => ({ key, name, values })),
      { key: 'other', name: 'Other', values: otherValues }
    ];
  }

  private employeeStartMonth(emp: any): string {
    const raw = emp?.hireDate ?? emp?.HireDate ?? emp?.createdAt ?? emp?.CreatedAt ?? '';
    return this.normalizeMonthKey(String(raw));
  }

  /** Build the last 12 calendar months; interpolate across missing snapshot months. */
  private buildMonthlyHeadcountSeries(snaps: HeadcountSnapshot[]): HeadcountSnapshot[] {
    if (!snaps.length) return [];

    const byMonth = new Map(snaps.map((s) => [s.month, s.value]));
    const months = this.lastTwelveMonthKeys();

    const known = months
      .map((month, index) => (byMonth.has(month) ? { index, value: byMonth.get(month)! } : null))
      .filter((x): x is { index: number; value: number } => !!x);

    // If no snapshot falls in the window, use nearest known values across the full history.
    if (!known.length) {
      const first = snaps[0];
      const last = snaps[snaps.length - 1];
      return months.map((month) => {
        if (month <= first.month) return { month, value: first.value };
        if (month >= last.month) return { month, value: last.value };
        let lo = snaps[0];
        let hi = snaps[snaps.length - 1];
        for (let i = 0; i < snaps.length; i++) {
          if (snaps[i].month <= month) lo = snaps[i];
          if (snaps[i].month >= month) {
            hi = snaps[i];
            break;
          }
        }
        if (lo.month === hi.month) return { month, value: lo.value };
        const t = this.monthIndex(month) - this.monthIndex(lo.month);
        const span = Math.max(1, this.monthIndex(hi.month) - this.monthIndex(lo.month));
        return { month, value: Math.round(lo.value + ((hi.value - lo.value) * t) / span) };
      });
    }

    return months.map((month, index) => {
      if (byMonth.has(month)) return { month, value: byMonth.get(month)! };

      const prev = known.filter((k) => k.index < index).pop();
      const next = known.find((k) => k.index > index);
      if (!prev && next) return { month, value: next.value };
      if (prev && !next) return { month, value: prev.value };
      if (!prev || !next) return { month, value: snaps[snaps.length - 1].value };

      const span = Math.max(1, next.index - prev.index);
      const t = (index - prev.index) / span;
      return { month, value: Math.round(prev.value + (next.value - prev.value) * t) };
    });
  }

  private monthIndex(month: string): number {
    const [y, m] = month.split('-').map((n) => parseInt(n, 10));
    return y * 12 + (m - 1);
  }

  private smoothWavePath(points: WavePoint[]): string {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
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
