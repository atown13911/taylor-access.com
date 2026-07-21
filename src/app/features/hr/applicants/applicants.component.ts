import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Color, NgxChartsModule, ScaleType } from '@swimlane/ngx-charts';
import { Observable, firstValueFrom } from 'rxjs';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { environment } from '../../../../environments/environment';

type ApplicantStatus = 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected' | 'no response' | 'no show';
type GoalPeriod = 'weekly' | 'monthly' | 'yearly';
type PositionGroup = 'office' | 'fleet';

interface ApplicantRow {
  id: number;
  fullName: string;
  gender: string;
  age: number | null;
  position: string;
  source: string;
  state: string;
  trainingGroupAssignment: string;
  status: ApplicantStatus;
  appliedDate: string;
  notes: string;
  cvFileName: string;
  cvDataUrl: string;
  hasCv: boolean;
  isHistorical: boolean;
}

interface ApplicantPosition {
  name: string;
  isActive: boolean;
  color?: string | null;
  group?: PositionGroup | null;
}

interface ApplicantGoal {
  id: number;
  sources: string[];
  period: GoalPeriod;
  targetApplicants: number;
  targetInterviews: number;
  targetHires: number;
  notes: string;
  updatedAt: string;
}
interface ApplicantGoalProgressRow extends ApplicantGoal {
  actualApplicants: number;
  actualInterviews: number;
  actualHires: number;
  applicantsProgress: number;
  interviewsProgress: number;
  hiresProgress: number;
  overallProgress: number;
}
interface GoalComparisonItem {
  key: 'applicants' | 'interviews' | 'hires';
  label: string;
  target: number;
  actual: number;
  progress: number;
  color: string;
}
interface SuggestedGoalPack {
  period: GoalPeriod;
  applicants: number;
  interviews: number;
  hires: number;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}
type SuggestedGoalMode = 'aggressive' | 'balanced' | 'conservative';
type MarketPresentationMode = 'neon' | 'executive';
interface OfficeRegionInsightRow {
  region: string;
  applicants: number;
  sharePct: number;
  monthlyApplicantsTarget: number;
  monthlyInterviewsTarget: number;
  monthlyHiresTarget: number;
  posture: 'expand' | 'hold' | 'optimize';
}
interface FleetOtrPayTargetRow {
  tier: 'entry' | 'standard' | 'premium';
  label: string;
  hourly: number;
  weeklyGross: number;
  annualGross: number;
  cpm: number;
}
interface MarketAuditRow {
  savedAt: string;
  presetKey: string;
  positionGroup: PositionGroup;
  suggestedMode: SuggestedGoalMode;
  pipelineCount: number;
  driverPay: number | null;
  laborDemand: number | null;
  laborTightness: number | null;
  inflation: number | null;
  insuranceCost: number | null;
}
interface PositionTableMetric {
  count: number;
  avgPerDay: string;
  avgAge: string;
  maleCount: number;
  femaleCount: number;
  mostRecentEntry: string;
}

type BlsMarketKey = 'driverPay' | 'laborTightness' | 'laborDemand' | 'inflation' | 'insuranceCost';
interface BlsMarketSnapshot {
  key: BlsMarketKey;
  label: string;
  seriesId: string;
  latestValue: number | null;
  latestLabel: string;
  priorValue: number | null;
  changePct: number | null;
  points: ChartPoint[];
}
interface MarketPresetOption {
  key: string;
  label: string;
  seriesDraft: Record<BlsMarketKey, string>;
}

type ApplicantDraft = Omit<ApplicantRow, 'id' | 'status'> & { status?: ApplicantStatus };
type ChartPoint = { name: string; value: number };
type ChartSeries = { name: string; series: ChartPoint[] };
type BubbleSeriesPoint = { name: string; x: number; y: number; r: number };

@Component({
  selector: 'app-applicants',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxChartsModule],
  template: `
    <div class="applicants-page">
      @if (
        positionStateFilter() === 'active'
        || positionStateFilter() === 'inactive'
        || positionStateFilter() === 'historical'
        || positionStateFilter() === 'report'
        || positionStateFilter() === 'goals'
        || positionStateFilter() === 'market'
      ) {
        <div class="applicant-mode-tabs-header">
          <button
            class="applicant-mode-tab"
            [class.active]="(positionStateFilter() === 'active' || positionStateFilter() === 'inactive') && applicantSectionMode() === 'application'"
            (click)="selectApplicantsTopMode('application')"
          >
            Application
          </button>
          <button
            class="applicant-mode-tab"
            [class.active]="(positionStateFilter() === 'active' || positionStateFilter() === 'inactive') && applicantSectionMode() === 'hiring'"
            (click)="selectApplicantsTopMode('hiring')"
          >
            Hiring
          </button>
          <button
            class="applicant-mode-tab"
            [class.active]="positionStateFilter() === 'historical'"
            (click)="setPositionStateFilter('historical')"
          >
            Historical
          </button>
          <button
            class="applicant-mode-tab"
            [class.active]="positionStateFilter() === 'report'"
            (click)="setPositionStateFilter('report')"
          >
            Report
          </button>
          <button
            class="applicant-mode-tab"
            [class.active]="positionStateFilter() === 'goals'"
            (click)="setPositionStateFilter('goals')"
          >
            Goals
          </button>
          <button
            class="applicant-mode-tab"
            [class.active]="positionStateFilter() === 'market'"
            (click)="setPositionStateFilter('market')"
          >
            Market
          </button>
        </div>
      }
      <header class="page-header">
        <div>
          <h1><i class='bx bx-user-plus'></i> Applicants</h1>
          <p>Track Taylor Access candidate pipeline</p>
        </div>
        <div class="page-header-actions">
          @if (
            positionStateFilter() === 'active'
            || positionStateFilter() === 'inactive'
            || positionStateFilter() === 'historical'
            || positionStateFilter() === 'report'
            || positionStateFilter() === 'goals'
            || positionStateFilter() === 'market'
          ) {
            <div class="position-group-tabs position-group-tabs-header">
              <button
                class="group-tab office-tab"
                [class.active]="positionGroupFilter() === 'office'"
                (click)="setPositionGroupFilter('office')"
              >
                <i class='bx bx-briefcase-alt-2'></i> Office
              </button>
              <button
                class="group-tab fleet-tab"
                [class.active]="positionGroupFilter() === 'fleet'"
                (click)="setPositionGroupFilter('fleet')"
              >
                <i class='bx bx-car'></i> Fleet
              </button>
            </div>
          }
        </div>
      </header>
      @if (
        positionStateFilter() === 'active'
        || positionStateFilter() === 'inactive'
        || (positionStateFilter() === 'historical' && historicalViewMode() === 'applicants')
      ) {
        <div class="pipeline-tiles dashboard-tiles">
          @for (panel of pipelineStatPanels(); track panel.label) {
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
        </div>
      }

      @if (positionStateFilter() !== 'goals' && positionStateFilter() !== 'market') {
        <div class="position-state-tabs">
          @if (positionStateFilter() === 'historical') {
            <button
              class="state-tab"
              [class.active]="historicalViewMode() === 'applicants'"
              (click)="historicalViewMode.set('applicants')"
            >
              Applicants
            </button>
            <button
              class="state-tab"
              [class.active]="historicalViewMode() === 'report'"
              (click)="historicalViewMode.set('report')"
            >
              Report
            </button>
          } @else {
            <button
              class="state-tab"
              [class.active]="positionStateFilter() === 'active'"
              (click)="setPositionStateFilter('active')"
            >
              Active
            </button>
            <button
              class="state-tab"
              [class.active]="positionStateFilter() === 'inactive'"
              (click)="setPositionStateFilter('inactive')"
            >
              Inactive
            </button>
          }
        </div>
      }
      @if (positionStateFilter() === 'report' || (positionStateFilter() === 'historical' && historicalViewMode() === 'report')) {
        <section class="report-view">
          <div class="report-toolbar">
            <div class="applicant-mode-tabs-inline">
              <button
                class="applicant-mode-tab"
                [class.active]="applicantSectionMode() === 'application'"
                (click)="setApplicantSectionMode('application')"
              >
                Application
              </button>
              <button
                class="applicant-mode-tab"
                [class.active]="applicantSectionMode() === 'hiring'"
                (click)="setApplicantSectionMode('hiring')"
              >
                Hiring
              </button>
            </div>
            <label for="report-range">Range</label>
            <select
              id="report-range"
              [ngModel]="reportRange()"
              (ngModelChange)="reportRange.set($event)"
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom range</option>
            </select>
            <label for="report-position">Position</label>
            <select
              id="report-position"
              [ngModel]="reportPositionFilter()"
              (ngModelChange)="reportPositionFilter.set($event)"
            >
              @for (position of reportPositionOptions(); track position) {
                <option [value]="position">{{ position === 'all' ? 'All positions' : position }}</option>
              }
            </select>
            @if (reportRange() === 'custom') {
              <div class="report-date-range">
                <input
                  type="date"
                  [ngModel]="reportDateFrom()"
                  (ngModelChange)="reportDateFrom.set($event)"
                  aria-label="Report from date"
                />
                <span>to</span>
                <input
                  type="date"
                  [ngModel]="reportDateTo()"
                  (ngModelChange)="reportDateTo.set($event)"
                  aria-label="Report to date"
                />
              </div>
            }
          </div>
          <div class="report-cards report-cards-primary">
            <article class="report-card">
              <span>Total Applicants</span>
              <strong>{{ reportRows().length }}</strong>
            </article>
            <article class="report-card">
              <span>Active Positions</span>
              <strong>{{ activePositionsCount() }}</strong>
            </article>
            <article class="report-card">
              <span>Inactive Positions</span>
              <strong>{{ inactivePositionsCount() }}</strong>
            </article>
            <article class="report-card">
              <span>Hired</span>
              <strong>{{ hiredCount() }}</strong>
            </article>
            <article class="report-card">
              <div class="report-card-head">
                <span>Applicants / Day</span>
                <select
                  class="report-card-select"
                  [ngModel]="reportWeekSelection()"
                  (ngModelChange)="reportWeekSelection.set($event)"
                  aria-label="Applicants per day week selection"
                >
                  <option value="thisWeek">This week</option>
                  <option value="lastWeek">Last week</option>
                  <option value="allTime">All time</option>
                </select>
              </div>
              <strong>{{ applicantsPerDayLabel() }}</strong>
              <small>{{ applicantsPerDayTotal() }} applicants</small>
            </article>
          </div>

          <div class="report-cards report-cards-demographics">
            <article class="report-card">
              <span>Average Age</span>
              <strong>{{ averageAgeLabel() }}</strong>
            </article>
            <article class="report-card">
              <span>Male</span>
              <strong>{{ maleCount() }}</strong>
            </article>
            <article class="report-card">
              <span>Female</span>
              <strong>{{ femaleCount() }}</strong>
            </article>
            <article class="report-card">
              <span>Non-binary</span>
              <strong>{{ nonBinaryCount() }}</strong>
            </article>
          </div>

          <div class="report-grid">
            <div class="report-panel">
              <h3>Status Breakdown</h3>
              @if (statusChartData().length > 0) {
                <ngx-charts-bar-vertical
                  [results]="statusChartData()"
                  [view]="reportChartView()"
                  [scheme]="chartScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [showDataLabel]="true"
                  [animations]="true"
                  [gradient]="true">
                </ngx-charts-bar-vertical>
              } @else {
                <div class="chart-empty">No applicants yet.</div>
              }
            </div>

            <div class="report-panel">
              <h3>Position Breakdown</h3>
              @if (positionChartData().length > 0) {
                <ngx-charts-bar-horizontal
                  [results]="positionChartData()"
                  [view]="reportChartView()"
                  [scheme]="chartScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [showDataLabel]="true"
                  [animations]="true"
                  [gradient]="true">
                </ngx-charts-bar-horizontal>
              } @else {
                <div class="chart-empty">No applicants yet.</div>
              }
            </div>

            <div class="report-panel">
              <h3>Gender Breakdown</h3>
              @if (genderChartData().length > 0) {
                <ngx-charts-pie-chart
                  [results]="genderChartData()"
                  [view]="reportChartView()"
                  [scheme]="pieChartScheme"
                  [labels]="true"
                  [doughnut]="true"
                  [animations]="true">
                </ngx-charts-pie-chart>
              } @else {
                <div class="chart-empty">No applicants yet.</div>
              }
            </div>

            <div class="report-panel">
              <h3>Age Scatter</h3>
              @if (ageScatterChartData().length > 0) {
                <ngx-charts-bubble-chart
                  [results]="ageScatterChartData()"
                  [view]="reportChartView()"
                  [scheme]="chartScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [xAxisLabel]="'Applicant'"
                  [yAxisLabel]="'Age'"
                  [showXAxisLabel]="true"
                  [showYAxisLabel]="true"
                  [animations]="true">
                </ngx-charts-bubble-chart>
              } @else {
                <div class="chart-empty">No age data yet.</div>
              }
            </div>

            <div class="report-panel report-panel-wide">
              <h3>Applicant Source Breakdown</h3>
              @if (sourceChartData().length > 0) {
                <ngx-charts-bar-horizontal
                  [results]="sourceChartData()"
                  [view]="reportWideChartView()"
                  [scheme]="chartScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [showDataLabel]="true"
                  [animations]="true"
                  [gradient]="true">
                </ngx-charts-bar-horizontal>
              } @else {
                <div class="chart-empty">No source data yet.</div>
              }
            </div>
          </div>
        </section>
      } @else if (positionStateFilter() === 'goals') {
        <section class="goals-view">
          <div class="goals-toolbar">
            <div>
              <h3>Applicant Goals</h3>
              <p>Set manual weekly/monthly/yearly targets for recruiting positions.</p>
            </div>
            <button class="btn-secondary" (click)="addApplicantGoal()">
              <i class='bx' [class.bx-plus]="applicantGoals().length === 0" [class.bx-edit-alt]="applicantGoals().length > 0"></i>
              {{ applicantGoals().length === 0 ? 'Add Goal' : 'Edit Goal' }}
            </button>
          </div>
          <div class="suggested-goals-wrap">
            <div class="suggested-goals-head">
              <h4>System Suggested Goals (Trucking Market)</h4>
              <small>Uses BLS pay, labor-demand, and labor-tightness signals + your last 90-day conversion baseline.</small>
              <div class="suggested-mode-toggle">
                <button class="state-tab" [class.active]="suggestedGoalMode() === 'aggressive'" (click)="setSuggestedGoalMode('aggressive')">Aggressive</button>
                <button class="state-tab" [class.active]="suggestedGoalMode() === 'balanced'" (click)="setSuggestedGoalMode('balanced')">Balanced</button>
                <button class="state-tab" [class.active]="suggestedGoalMode() === 'conservative'" (click)="setSuggestedGoalMode('conservative')">Conservative</button>
              </div>
            </div>
            <div class="suggested-goals-grid">
              @for (suggestion of suggestedGoalPacks(); track suggestion.period) {
                <article class="suggested-goal-card">
                  <div class="suggested-goal-top">
                    <strong>{{ suggestion.period | titlecase }}</strong>
                    <span class="suggested-confidence" [class.high]="suggestion.confidence === 'high'" [class.medium]="suggestion.confidence === 'medium'" [class.low]="suggestion.confidence === 'low'">
                      {{ confidenceLabel(suggestion.confidence) }}
                    </span>
                  </div>
                  <div class="suggested-metrics">
                    <span>Applicants <b>{{ suggestion.applicants }}</b></span>
                    <span>Interviews <b>{{ suggestion.interviews }}</b></span>
                    <span>Hires <b>{{ suggestion.hires }}</b></span>
                  </div>
                  <p>{{ suggestion.rationale }}</p>
                  <button class="btn-secondary" (click)="applySuggestedGoal(suggestion.period)">
                    <i class='bx bx-target-lock'></i> Apply {{ suggestion.period | titlecase }} Suggestion
                  </button>
                </article>
              }
            </div>
          </div>
          <div class="goals-summary">
            <article class="pipeline-tile">
              <span>Total Goals</span>
              <strong>{{ applicantGoalSummary().goals }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Target Applicants</span>
              <strong>{{ applicantGoalSummary().applicants }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Target Interviews</span>
              <strong>{{ applicantGoalSummary().interviews }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Target Hires</span>
              <strong>{{ applicantGoalSummary().hires }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Actual Applicants</span>
              <strong>{{ applicantGoalSummary().actualApplicants }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Actual Interviews</span>
              <strong>{{ applicantGoalSummary().actualInterviews }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Actual Hires</span>
              <strong>{{ applicantGoalSummary().actualHires }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Overall Completion</span>
              <strong>{{ applicantGoalSummary().overallProgress | number:'1.0-0' }}%</strong>
            </article>
          </div>
          <div class="goals-visual-grid">
            <article class="goals-panel goals-panel-donut">
              <h4>Overall Goal Completion</h4>
              <div class="completion-donut-wrap">
                <div class="completion-donut" [style.background]="goalCompletionDonutStyle()">
                  <div class="completion-donut-center">
                    <strong>{{ applicantGoalSummary().overallProgress | number:'1.0-0' }}%</strong>
                    <span>complete</span>
                  </div>
                </div>
              </div>
            </article>
            <article class="goals-panel">
              <h4>Target vs Actual</h4>
              <div class="goal-comparison-list">
                @for (item of goalComparisonItems(); track item.key) {
                  <div class="goal-comparison-row">
                    <div class="goal-comparison-head">
                      <span>{{ item.label }}</span>
                      <small>{{ item.actual }} / {{ item.target }}</small>
                    </div>
                    <div class="goal-comparison-track">
                      <div class="goal-comparison-fill" [style.width.%]="item.progress" [style.background]="item.color"></div>
                    </div>
                    <strong>{{ item.progress | number:'1.0-0' }}%</strong>
                  </div>
                }
              </div>
            </article>
          </div>
          <div class="goals-analytics-grid">
            <article class="report-panel">
              <h3>Applicants by Month (12 Months)</h3>
              @if (goalApplicantsTrendSeries().length > 0) {
                <ngx-charts-line-chart
                  [results]="goalApplicantsTrendSeries()"
                  [view]="reportWideChartView()"
                  [scheme]="chartScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [autoScale]="true"
                  [showXAxisLabel]="false"
                  [showYAxisLabel]="false"
                  [animations]="true">
                </ngx-charts-line-chart>
              } @else {
                <div class="chart-empty">No applicant month data yet.</div>
              }
            </article>
            <article class="report-panel">
              <h3>
                Source Counts
                <span class="goals-analytics-toggle">
                  <button
                    class="state-tab"
                    [class.active]="goalSourceChartMode() === 'ytd'"
                    (click)="goalSourceChartMode.set('ytd')"
                  >
                    YTD
                  </button>
                  <button
                    class="state-tab"
                    [class.active]="goalSourceChartMode() === 'monthly'"
                    (click)="goalSourceChartMode.set('monthly')"
                  >
                    Monthly
                  </button>
                </span>
              </h3>
              @if (goalSourceCountsChartData().length > 0) {
                <ngx-charts-bar-horizontal
                  [results]="goalSourceCountsChartData()"
                  [view]="reportWideChartView()"
                  [scheme]="chartScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [showDataLabel]="true"
                  [animations]="true"
                  [gradient]="true">
                </ngx-charts-bar-horizontal>
              } @else {
                <div class="chart-empty">No source data for selected range.</div>
              }
            </article>
          </div>
          <div class="goal-sections-grid">
            @for (goal of applicantGoalProgressRows(); track goal.id) {
              <article class="goal-section-card">
                <div class="goal-section-head">
                  <strong>{{ goalSourceLabel(goal.sources) }}</strong>
                  <span class="goal-period-chip">{{ goal.period | titlecase }}</span>
                </div>
                <div class="goal-section-row">
                  <span>Applicants</span>
                  <small>{{ goal.actualApplicants }} / {{ goal.targetApplicants }}</small>
                </div>
                <div class="goal-comparison-track">
                  <div class="goal-comparison-fill" [style.width.%]="goal.applicantsProgress" style="background: linear-gradient(90deg, #22d3ee, #0ea5e9);"></div>
                </div>
                <div class="goal-section-row">
                  <span>Interviews</span>
                  <small>{{ goal.actualInterviews }} / {{ goal.targetInterviews }}</small>
                </div>
                <div class="goal-comparison-track">
                  <div class="goal-comparison-fill" [style.width.%]="goal.interviewsProgress" style="background: linear-gradient(90deg, #a78bfa, #818cf8);"></div>
                </div>
                <div class="goal-section-row">
                  <span>Hires</span>
                  <small>{{ goal.actualHires }} / {{ goal.targetHires }}</small>
                </div>
                <div class="goal-comparison-track">
                  <div class="goal-comparison-fill" [style.width.%]="goal.hiresProgress" style="background: linear-gradient(90deg, #22c55e, #16a34a);"></div>
                </div>
                <div class="goal-section-overall">
                  <span>Overall</span>
                  <strong>{{ goal.overallProgress | number:'1.0-0' }}%</strong>
                </div>
              </article>
            } @empty {
              <div class="chart-empty">Add a goal to see per-goal tracking sections.</div>
            }
          </div>
          <div class="table-wrap">
            <table class="goals-table">
              <thead>
                <tr>
                  <th>Positions</th>
                  <th>Period</th>
                  <th>Applicants</th>
                  <th>Actual Apps</th>
                  <th>Apps %</th>
                  <th>Interviews</th>
                  <th>Actual Int</th>
                  <th>Int %</th>
                  <th>Hires</th>
                  <th>Actual Hires</th>
                  <th>Hire %</th>
                  <th>Progress</th>
                  <th>Notes</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (goal of applicantGoalProgressRows(); track goal.id) {
                  <tr>
                    <td>
                      <div class="goal-source-editor">
                        <div class="goal-source-list">
                          @for (source of goal.sources; track source) {
                            <span class="goal-source-chip">
                              {{ source }}
                              @if (isGoalEditing(goal.id)) {
                                <button
                                  class="goal-source-remove"
                                  (click)="removeGoalSource(goal.id, source)"
                                  title="Remove position"
                                >
                                  <i class='bx bx-x'></i>
                                </button>
                              }
                            </span>
                          } @empty {
                            <span class="goal-source-empty">All positions</span>
                          }
                        </div>
                        @if (isGoalEditing(goal.id)) {
                          <div class="goal-source-actions">
                            <select
                              [ngModel]="goalSourceDraft(goal.id)"
                              (ngModelChange)="setGoalSourceDraft(goal.id, $event)"
                            >
                              <option value="">Select position</option>
                              @for (source of goalSourceOptions(); track source) {
                                <option [value]="source">{{ source }}</option>
                              }
                            </select>
                            <button class="icon-btn" (click)="addGoalSource(goal.id)" title="Add position">
                              <i class='bx bx-plus'></i>
                            </button>
                          </div>
                        }
                      </div>
                    </td>
                    <td>
                      <select [disabled]="!isGoalEditing(goal.id)" [ngModel]="goal.period" (ngModelChange)="updateApplicantGoal(goal.id, 'period', $event)">
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </td>
                    <td><input type="number" min="0" [disabled]="!isGoalEditing(goal.id)" [ngModel]="goal.targetApplicants" (ngModelChange)="updateApplicantGoal(goal.id, 'targetApplicants', $event)" /></td>
                    <td>{{ goal.actualApplicants }}</td>
                    <td><span class="goal-progress-pill">{{ goal.applicantsProgress | number:'1.0-0' }}%</span></td>
                    <td><input type="number" min="0" [disabled]="!isGoalEditing(goal.id)" [ngModel]="goal.targetInterviews" (ngModelChange)="updateApplicantGoal(goal.id, 'targetInterviews', $event)" /></td>
                    <td>{{ goal.actualInterviews }}</td>
                    <td><span class="goal-progress-pill">{{ goal.interviewsProgress | number:'1.0-0' }}%</span></td>
                    <td><input type="number" min="0" [disabled]="!isGoalEditing(goal.id)" [ngModel]="goal.targetHires" (ngModelChange)="updateApplicantGoal(goal.id, 'targetHires', $event)" /></td>
                    <td>{{ goal.actualHires }}</td>
                    <td><span class="goal-progress-pill">{{ goal.hiresProgress | number:'1.0-0' }}%</span></td>
                    <td>
                      <div class="goal-progress-track">
                        <div class="goal-progress-fill" [style.width.%]="goal.overallProgress"></div>
                      </div>
                      <small class="goal-progress-label">{{ goal.overallProgress | number:'1.0-0' }}%</small>
                    </td>
                    <td><input type="text" [disabled]="!isGoalEditing(goal.id)" [ngModel]="goal.notes" (ngModelChange)="updateApplicantGoal(goal.id, 'notes', $event)" placeholder="Optional" /></td>
                    <td>{{ goal.updatedAt | date:'short' }}</td>
                    <td>
                      <button
                        class="icon-btn"
                        [class.active]="isGoalEditing(goal.id)"
                        (click)="toggleGoalEditing(goal.id)"
                        [title]="isGoalEditing(goal.id) ? 'Lock goal' : 'Edit goal'"
                      >
                        <i class='bx' [class.bx-lock-open-alt]="isGoalEditing(goal.id)" [class.bx-edit-alt]="!isGoalEditing(goal.id)"></i>
                      </button>
                      <button class="icon-btn danger" (click)="removeApplicantGoal(goal.id)" title="Delete goal">
                        <i class='bx bx-trash'></i>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="15" class="empty">No goals yet. Click "Add Goal" to begin.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      } @else if (positionStateFilter() === 'market') {
        <section class="market-view" [class.market-theme-executive]="marketPresentationMode() === 'executive'" [class.market-theme-neon]="marketPresentationMode() === 'neon'">
          <div class="market-toolbar">
            <div>
              <h3>BLS Market Intelligence</h3>
              <p>Benchmark driver pay, labor tightness, and macro demand against your applicant pipeline.</p>
              @if (marketLastUpdated()) {
                <small class="hint">Last refreshed: {{ marketLastUpdated() | date:'short' }}</small>
              }
            </div>
            <div class="market-toolbar-actions">
              <div class="market-theme-toggle">
                <button class="state-tab" [class.active]="marketPresentationMode() === 'neon'" (click)="setMarketPresentationMode('neon')">Neon</button>
                <button class="state-tab" [class.active]="marketPresentationMode() === 'executive'" (click)="setMarketPresentationMode('executive')">Executive</button>
              </div>
              <button class="btn-secondary" (click)="loadMarketIntelligence()" [disabled]="marketLoading()">
                <i class='bx bx-refresh'></i> Refresh Market Data
              </button>
            </div>
          </div>

          <div class="market-series-grid">
            <label class="market-preset-field">
              Dataset Preset
              <select [ngModel]="marketPresetKey()" (ngModelChange)="applyMarketPreset($event)">
                @for (preset of marketPresetOptions; track preset.key) {
                  <option [value]="preset.key">{{ preset.label }}</option>
                }
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Driver Pay Series ID
              <input type="text" [ngModel]="marketSeriesDraft.driverPay" (ngModelChange)="setMarketSeriesId('driverPay', $event)" />
            </label>
            <label>
              Labor Tightness Series ID
              <input type="text" [ngModel]="marketSeriesDraft.laborTightness" (ngModelChange)="setMarketSeriesId('laborTightness', $event)" />
            </label>
            <label>
              Labor Demand Series ID
              <input type="text" [ngModel]="marketSeriesDraft.laborDemand" (ngModelChange)="setMarketSeriesId('laborDemand', $event)" />
            </label>
            <label>
              Inflation Series ID
              <input type="text" [ngModel]="marketSeriesDraft.inflation" (ngModelChange)="setMarketSeriesId('inflation', $event)" />
            </label>
            <label>
              Insurance Cost Pressure Series ID
              <input type="text" [ngModel]="marketSeriesDraft.insuranceCost" (ngModelChange)="setMarketSeriesId('insuranceCost', $event)" />
            </label>
            <div class="market-series-actions">
              <button class="btn-secondary" (click)="saveMarketSeriesDraft()">
                <i class='bx bx-save'></i> Save Series IDs
              </button>
            </div>
          </div>

          @if (marketError()) {
            <div class="sync-error">{{ marketError() }}</div>
          }

          <div class="market-cards market-cards-bold">
            <article class="report-card">
              <span>Current Pipeline</span>
              <strong>{{ marketPipelineCount() }}</strong>
              <small>{{ positionGroupFilter() | titlecase }} applicants in scope</small>
            </article>
            <article class="report-card">
              <span>Driver Pay Benchmark</span>
              <strong>{{ marketSnapshotValue('driverPay') }}</strong>
              <small>{{ marketSnapshotDelta('driverPay') }}</small>
            </article>
            <article class="report-card">
              <span>Labor Tightness</span>
              <strong>{{ marketSnapshotValue('laborTightness') }}</strong>
              <small>{{ marketSnapshotDelta('laborTightness') }}</small>
            </article>
            <article class="report-card">
              <span>Macro Labor Demand</span>
              <strong>{{ marketSnapshotValue('laborDemand') }}</strong>
              <small>{{ marketSnapshotDelta('laborDemand') }}</small>
            </article>
            <article class="report-card">
              <span>Inflation Context</span>
              <strong>{{ marketSnapshotValue('inflation') }}</strong>
              <small>{{ marketSnapshotDelta('inflation') }}</small>
            </article>
            <article class="report-card">
              <span>Insurance Cost Pressure</span>
              <strong>{{ marketSnapshotValue('insuranceCost') }}</strong>
              <small>{{ marketSnapshotDelta('insuranceCost') }}</small>
            </article>
            <article class="report-card">
              <span>Pipeline vs Demand</span>
              <strong>{{ marketPipelineVsDemandLabel() }}</strong>
              <small>Applicants per labor-demand index point</small>
            </article>
          </div>

          <div class="report-grid">
            <article class="report-panel report-panel-wide">
              <h3>BLS Trend Benchmarks</h3>
              @if (marketMacroTrendSeries().length > 0) {
                <ngx-charts-line-chart
                  [results]="marketMacroTrendSeries()"
                  [view]="reportWideChartView()"
                  [scheme]="chartScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [autoScale]="true"
                  [showXAxisLabel]="false"
                  [showYAxisLabel]="false"
                  [animations]="true">
                </ngx-charts-line-chart>
              } @else {
                <div class="chart-empty">No BLS trend data yet. Click refresh to load benchmark series.</div>
              }
            </article>

            <article class="report-panel report-panel-wide">
              <h3>Applicants vs Macro Labor Demand</h3>
              @if (marketPipelineVsDemandSeries().length > 0) {
                <ngx-charts-line-chart
                  [results]="marketPipelineVsDemandSeries()"
                  [view]="reportWideChartView()"
                  [scheme]="chartScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [autoScale]="true"
                  [showXAxisLabel]="false"
                  [showYAxisLabel]="false"
                  [animations]="true">
                </ngx-charts-line-chart>
              } @else {
                <div class="chart-empty">No overlapping applicant + demand timeline yet.</div>
              }
            </article>
          </div>

          <div class="report-grid">
            <article class="report-panel">
              <h3>Market Momentum (Change %)</h3>
              @if (marketMomentumChartData().length > 0) {
                <ngx-charts-bar-vertical
                  [results]="marketMomentumChartData()"
                  [view]="reportChartView()"
                  [scheme]="marketBoldScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [showDataLabel]="true"
                  [animations]="true"
                  [gradient]="true">
                </ngx-charts-bar-vertical>
              } @else {
                <div class="chart-empty">No market momentum data yet.</div>
              }
            </article>

            <article class="report-panel">
              <h3>Indicator Influence Mix</h3>
              @if (marketIndicatorMixChartData().length > 0) {
                <ngx-charts-pie-chart
                  [results]="marketIndicatorMixChartData()"
                  [view]="reportChartView()"
                  [scheme]="marketPieBoldScheme"
                  [labels]="true"
                  [doughnut]="true"
                  [animations]="true">
                </ngx-charts-pie-chart>
              } @else {
                <div class="chart-empty">No indicator mix data yet.</div>
              }
            </article>
          </div>

          <div class="report-grid">
            <article class="report-panel report-panel-wide">
              <h3>Audit Trend (Pipeline vs Driver Pay)</h3>
              @if (marketAuditTrendSeries().length > 0) {
                <ngx-charts-line-chart
                  [results]="marketAuditTrendSeries()"
                  [view]="reportWideChartView()"
                  [scheme]="marketBoldScheme"
                  [xAxis]="true"
                  [yAxis]="true"
                  [autoScale]="true"
                  [showXAxisLabel]="false"
                  [showYAxisLabel]="false"
                  [animations]="true">
                </ngx-charts-line-chart>
              } @else {
                <div class="chart-empty">No audit history chart data yet.</div>
              }
            </article>
          </div>

          @if (positionGroupFilter() === 'office') {
            <div class="report-grid">
              <article class="report-panel">
                <h3>Office Regional Pipeline Mix</h3>
                @if (officeRegionChartData().length > 0) {
                  <ngx-charts-bar-horizontal
                    [results]="officeRegionChartData()"
                    [view]="reportChartView()"
                    [scheme]="chartScheme"
                    [xAxis]="true"
                    [yAxis]="true"
                    [showDataLabel]="true"
                    [animations]="true"
                    [gradient]="true">
                  </ngx-charts-bar-horizontal>
                } @else {
                  <div class="chart-empty">No office applicant state data yet.</div>
                }
              </article>
              <article class="report-panel">
                <h3>Office Market Goal Posture</h3>
                <div class="goal-comparison-list">
                  @for (row of officeRegionInsights(); track row.region) {
                    <div class="goal-comparison-row">
                      <div class="goal-comparison-head">
                        <span>{{ row.region }}</span>
                        <small>{{ row.applicants }} applicants ({{ row.sharePct | number:'1.0-1' }}%)</small>
                      </div>
                      <div class="goal-comparison-track">
                        <div
                          class="goal-comparison-fill"
                          [style.width.%]="row.sharePct"
                          [style.background]="row.posture === 'expand'
                            ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                            : row.posture === 'hold'
                              ? 'linear-gradient(90deg, #38bdf8, #0ea5e9)'
                              : 'linear-gradient(90deg, #f59e0b, #d97706)'">
                        </div>
                      </div>
                      <strong>{{ row.posture | titlecase }}</strong>
                    </div>
                  } @empty {
                    <div class="chart-empty">No office region posture available yet.</div>
                  }
                </div>
              </article>
            </div>
          }

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Series ID</th>
                  <th>Latest</th>
                  <th>Previous</th>
                  <th>Change %</th>
                  <th>As Of</th>
                </tr>
              </thead>
              <tbody>
                @for (item of marketSnapshots(); track item.key) {
                  <tr>
                    <td>{{ item.label }}</td>
                    <td>{{ item.seriesId }}</td>
                    <td>{{ formatMarketNumber(item.latestValue) }}</td>
                    <td>{{ formatMarketNumber(item.priorValue) }}</td>
                    <td>{{ formatMarketChange(item.changePct) }}</td>
                    <td>{{ item.latestLabel }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="empty">No market series loaded yet.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (positionGroupFilter() === 'office') {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Applicants</th>
                    <th>Share</th>
                    <th>Suggested Monthly Applicants</th>
                    <th>Suggested Monthly Interviews</th>
                    <th>Suggested Monthly Hires</th>
                    <th>Posture</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of officeRegionInsights(); track row.region) {
                    <tr>
                      <td>{{ row.region }}</td>
                      <td>{{ row.applicants }}</td>
                      <td>{{ row.sharePct | number:'1.0-1' }}%</td>
                      <td>{{ row.monthlyApplicantsTarget }}</td>
                      <td>{{ row.monthlyInterviewsTarget }}</td>
                      <td>{{ row.monthlyHiresTarget }}</td>
                      <td>{{ row.posture | titlecase }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="7" class="empty">No office-region records yet.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          @if (positionGroupFilter() === 'fleet') {
            <section class="fleet-otr-pay-section">
              <div class="fleet-otr-pay-head">
                <div>
                  <h3>OTR Driver Target Pay (Fleet)</h3>
                  <p>Market-benchmarked OTR targets using current driver pay trend and your operating assumptions.</p>
                </div>
              </div>
              <div class="fleet-otr-inputs">
                <label>
                  Weekly Miles (OTR)
                  <input type="number" min="500" [ngModel]="fleetOtrWeeklyMiles()" (ngModelChange)="setFleetOtrWeeklyMiles($event)" />
                </label>
                <label>
                  Weekly Hours
                  <input type="number" min="20" [ngModel]="fleetOtrHoursPerWeek()" (ngModelChange)="setFleetOtrHoursPerWeek($event)" />
                </label>
                <label>
                  Benefits / Burden %
                  <input type="number" min="0" [ngModel]="fleetOtrBenefitsLoadPct()" (ngModelChange)="setFleetOtrBenefitsLoadPct($event)" />
                </label>
              </div>
              <div class="market-cards fleet-otr-summary-cards">
                <article class="report-card">
                  <span>Market Driver Pay (Hourly)</span>
                  <strong>{{ formatCurrency(fleetDriverMarketHourly()) }}</strong>
                </article>
                <article class="report-card">
                  <span>Standard OTR Weekly (Loaded)</span>
                  <strong>{{ formatCurrency(fleetOtrFullyLoadedWeekly()) }}</strong>
                </article>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Target Hourly</th>
                      <th>Target Weekly Gross</th>
                      <th>Target Annual Gross</th>
                      <th>Target CPM</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of fleetOtrPayTargets(); track row.tier) {
                      <tr>
                        <td>{{ row.label }}</td>
                        <td>{{ formatCurrency(row.hourly) }}</td>
                        <td>{{ formatCurrency(row.weeklyGross) }}</td>
                        <td>{{ formatCurrency(row.annualGross) }}</td>
                        <td>{{ formatCpm(row.cpm) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Saved At</th>
                  <th>Preset</th>
                  <th>Group</th>
                  <th>Goal Mode</th>
                  <th>Pipeline</th>
                  <th>Driver Pay</th>
                  <th>Labor Demand</th>
                  <th>Labor Tightness</th>
                  <th>Inflation</th>
                  <th>Insurance Cost</th>
                </tr>
              </thead>
              <tbody>
                @for (row of marketAuditRows(); track row.savedAt) {
                  <tr>
                    <td>{{ row.savedAt | date:'short' }}</td>
                    <td>{{ row.presetKey }}</td>
                    <td>{{ row.positionGroup | titlecase }}</td>
                    <td>{{ row.suggestedMode | titlecase }}</td>
                    <td>{{ row.pipelineCount }}</td>
                    <td>{{ formatCurrency(row.driverPay) }}</td>
                    <td>{{ formatMarketNumber(row.laborDemand) }}</td>
                    <td>{{ formatMarketNumber(row.laborTightness) }}</td>
                    <td>{{ formatMarketNumber(row.inflation) }}</td>
                    <td>{{ formatMarketNumber(row.insuranceCost) }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="10" class="empty">No market audit records yet.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      } @else {
        @if (positionStateFilter() === 'historical') {
          <div class="historical-banner">
            Backfill prior applicant records here to improve reporting on previous application and hiring trends.
          </div>
        }
        @if (positionStateFilter() !== 'historical') {
          <div class="position-filter-table-wrap">
            <div class="position-filter-table-head">
              <h4>Position Filters</h4>
              <button class="btn-secondary add-position-btn" (click)="openAddPosition()">
                <i class='bx bx-plus'></i> Position
              </button>
            </div>
            <table class="position-filter-table">
              <thead>
                <tr>
                  <th class="col-position">Position</th>
                  <th class="col-count">Applicants</th>
                  <th class="col-avg-day">Avg/Day</th>
                  <th class="col-avg-age">Avg Age</th>
                  <th class="col-male">Male</th>
                  <th class="col-female">Female</th>
                  <th class="col-most-recent">Most Recent Entry</th>
                  <th class="col-status">Status</th>
                  <th class="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (position of positionTabs(); track position) {
                  <tr
                    class="position-option-row"
                    [class.active]="selectedPosition() === position && position !== 'all'"
                    (click)="selectPosition(position)"
                    (keydown.enter)="selectPosition(position); $event.preventDefault()"
                    (keydown.space)="selectPosition(position); $event.preventDefault()"
                    role="button"
                    [attr.aria-label]="'Select position ' + (position === 'all' ? 'all positions' : position)"
                    tabindex="0"
                  >
                    <td class="col-position">
                      <div class="position-selection-cell">
                        <span class="position-name">{{ position === 'all' ? 'All Positions' : position }}</span>
                        @if (selectedPosition() === position && position !== 'all') {
                          <span class="position-selected-pill">Selected</span>
                        }
                      </div>
                    </td>
                    <td class="col-count">{{ positionMetric(position).count }}</td>
                    <td class="col-avg-day">{{ positionMetric(position).avgPerDay }}</td>
                    <td class="col-avg-age">{{ positionMetric(position).avgAge }}</td>
                    <td class="col-male">{{ positionMetric(position).maleCount }}</td>
                    <td class="col-female">{{ positionMetric(position).femaleCount }}</td>
                    <td class="col-most-recent">{{ positionMetric(position).mostRecentEntry }}</td>
                    <td class="col-status">
                      @if (position === 'all') {
                        <span class="position-state all">All</span>
                      } @else {
                        <span class="position-state" [class.active]="isPositionActive(position)" [class.inactive]="!isPositionActive(position)">
                          {{ isPositionActive(position) ? 'Active' : 'Inactive' }}
                        </span>
                      }
                    </td>
                    <td class="col-actions">
                      @if (position !== 'all') {
                        <button class="icon-btn" title="Position settings" (click)="openPositionSettings(position, $event)">
                          <i class='bx bx-cog'></i>
                        </button>
                      } @else {
                        <span class="position-color-none">—</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (positionStateFilter() === 'active' || positionStateFilter() === 'inactive' || positionStateFilter() === 'historical') {
          <div class="table-top-actions">
            <button class="btn-primary" (click)="openCreate()">
              <i class='bx bx-plus'></i> {{ positionStateFilter() === 'historical' ? 'Add Historical Applicant' : 'Add Applicant' }}
            </button>
          </div>
        }
        <div class="filters">
          @if (applicantSectionMode() === 'application') {
            <div class="pipeline-tabs">
              <button
                class="pipeline-tab"
                [class.active]="pipelineFilter() === 'working'"
                (click)="setPipelineFilter('working')"
              >
                Working
              </button>
              <button
                class="pipeline-tab"
                [class.active]="pipelineFilter() === 'rejected'"
                (click)="setPipelineFilter('rejected')"
              >
                Rejected
              </button>
              <button
                class="pipeline-tab"
                [class.active]="pipelineFilter() === 'hired'"
                (click)="setPipelineFilter('hired')"
              >
                Hired
              </button>
            </div>
          }
          <input
            type="text"
            placeholder="Search applicants..."
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
          <select [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
            <option value="all">All statuses</option>
            @if (applicantSectionMode() === 'hiring') {
              @if (positionGroupFilter() !== 'fleet') {
                <option value="offer">Offer</option>
              }
              <option value="hired">Hired</option>
            } @else {
              <option value="new">New</option>
              <option value="screening">Screening</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer</option>
              <option value="hired">Hired</option>
              <option value="no response">No Response</option>
              <option value="no show">No Show</option>
              <option value="rejected">Rejected</option>
            }
          </select>
        </div>
        @if (applicantsSyncError()) {
          <div class="sync-error">{{ applicantsSyncError() }}</div>
        }
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Gender</th>
                <th>Age</th>
                <th>Position</th>
                <th>Source</th>
                <th>State</th>
                <th>Training Group</th>
                <th>Status</th>
                <th>Applied</th>
                <th>CV</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (row of filteredRows(); track row.id) {
                <tr
                  class="applicant-row"
                  [class.selected]="selectedApplicantId() === row.id"
                  (click)="onApplicantRowClick(row)"
                >
                  <td><strong>{{ row.fullName }}</strong></td>
                  <td>{{ row.gender || '—' }}</td>
                  <td>{{ row.age ?? '—' }}</td>
                  <td>
                    @if (row.position) {
                      <span
                        class="position-pill"
                        [class.has-color]="!!getPositionColor(row.position)"
                        [style.--position-color]="getPositionColor(row.position)"
                        [style.--position-color-soft]="getPositionSoftColor(row.position)"
                      >
                        {{ row.position }}
                      </span>
                    } @else {
                      —
                    }
                  </td>
                  <td>{{ row.source || '—' }}</td>
                  <td>{{ row.state || '—' }}</td>
                  <td>{{ row.trainingGroupAssignment || '—' }}</td>
                  <td>
                    <select [ngModel]="row.status" (click)="$event.stopPropagation()" (ngModelChange)="setStatus(row.id, $event)">
                      @if (applicantSectionMode() === 'hiring') {
                        @if (positionGroupFilter() !== 'fleet') {
                          <option value="offer">Offer</option>
                        }
                        <option value="hired">Hired</option>
                      } @else {
                        <option value="new">New</option>
                        <option value="screening">Screening</option>
                        <option value="interview">Interview</option>
                        <option value="offer">Offer</option>
                        <option value="hired">Hired</option>
                        <option value="no response">No Response</option>
                        <option value="no show">No Show</option>
                        <option value="rejected">Rejected</option>
                      }
                    </select>
                  </td>
                  <td>{{ row.appliedDate || '—' }}</td>
                  <td>
                    @if (row.hasCv || row.cvDataUrl) {
                      <button class="cv-link-btn" (click)="$event.stopPropagation(); viewCv(row)">View</button>
                    } @else {
                      —
                    }
                  </td>
                  <td>{{ row.notes || '—' }}</td>
                  <td>
                    <div class="action-icons">
                      @if (pipelineFilter() === 'working') {
                        <button
                          class="icon-btn warn"
                          title="Send to Rejected"
                          (click)="$event.stopPropagation(); sendToRejected(row.id)"
                        >
                          <i class='bx bx-x-circle'></i>
                        </button>
                      } @else if (pipelineFilter() === 'rejected') {
                        <button
                          class="icon-btn success"
                          title="Return to Active"
                          (click)="$event.stopPropagation(); returnToActive(row.id)"
                        >
                          <i class='bx bx-undo'></i>
                        </button>
                      }
                      <button class="icon-btn" title="Edit applicant" (click)="$event.stopPropagation(); openEdit(row)">
                        <i class='bx bx-edit'></i>
                      </button>
                      <button class="icon-btn danger" title="Delete applicant" (click)="$event.stopPropagation(); deleteApplicant(row.id)">
                        <i class='bx bx-trash'></i>
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="12" class="empty">No applicants yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (showCreate()) {
        <div class="modal-overlay" (click)="showCreate.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Add Applicant</h3>
            <div class="form-row">
              <label>Name</label>
              <input type="text" [(ngModel)]="draft.fullName" />
            </div>
            <div class="form-grid">
              <div class="form-row">
                <label>Gender</label>
                <select [(ngModel)]="draft.gender">
                  <option value="">Select gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div class="form-row">
                <label>Age</label>
                <input type="number" min="16" max="100" [(ngModel)]="draft.age" />
              </div>
            </div>
            <div class="form-row">
              <label>Position</label>
              @if (positionStateFilter() === 'historical') {
                <input type="text" [(ngModel)]="draft.position" placeholder="Enter historical position" />
              } @else {
                <select [(ngModel)]="draft.position">
                  <option value="">Select position</option>
                  @for (position of positionOptionsForForm(); track position) {
                    <option [value]="position">{{ position }}</option>
                  }
                </select>
              }
            </div>
            <div class="form-row">
              <label>Source</label>
              <input type="text" [(ngModel)]="draft.source" placeholder="Indeed, Referral, LinkedIn..." />
            </div>
            <div class="form-row">
              <label>State</label>
              <input type="text" [(ngModel)]="draft.state" placeholder="SC, TX, GA..." />
            </div>
            <div class="form-row">
              <label>Training Group Assignment</label>
              <input type="text" [(ngModel)]="draft.trainingGroupAssignment" placeholder="Group A, Week 1 Cohort..." />
            </div>
            <div class="form-row">
              <label>Applied Date</label>
              <input type="date" [(ngModel)]="draft.appliedDate" />
            </div>
            <div class="form-row">
              <label>Status</label>
              <select [(ngModel)]="draft.status">
                <option value="new">New</option>
                <option value="screening">Screening</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="hired">Hired</option>
                <option value="no response">No Response</option>
                <option value="no show">No Show</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div class="form-row">
              <label>Notes</label>
              <textarea rows="3" [(ngModel)]="draft.notes"></textarea>
            </div>
            <div class="form-row">
              <label>CV Upload</label>
              <input type="file" accept=".pdf,.doc,.docx,.txt,.rtf" (change)="onCvSelected($event)" />
              @if (draft.cvFileName) {
                <small class="hint">Selected: {{ draft.cvFileName }}</small>
              } @else {
                <small class="hint">Optional. Max 5MB.</small>
              }
            </div>
            <div class="actions">
              <button class="btn-secondary" (click)="showCreate.set(false)">Cancel</button>
              <button class="btn-primary" (click)="saveDraft()">Save</button>
            </div>
          </div>
        </div>
      }

      @if (showEdit()) {
        <div class="modal-overlay" (click)="showEdit.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Edit Applicant</h3>
            <div class="form-row">
              <label>Name</label>
              <input type="text" [(ngModel)]="editDraft.fullName" />
            </div>
            <div class="form-grid">
              <div class="form-row">
                <label>Gender</label>
                <select [(ngModel)]="editDraft.gender">
                  <option value="">Select gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div class="form-row">
                <label>Age</label>
                <input type="number" min="16" max="100" [(ngModel)]="editDraft.age" />
              </div>
            </div>
            <div class="form-row">
              <label>Position</label>
              <select [(ngModel)]="editDraft.position">
                <option value="">Select position</option>
                @for (position of positionOptionsForForm(); track position) {
                  <option [value]="position">{{ position }}</option>
                }
              </select>
            </div>
            <div class="form-row">
              <label>Source</label>
              <input type="text" [(ngModel)]="editDraft.source" />
            </div>
            <div class="form-row">
              <label>State</label>
              <input type="text" [(ngModel)]="editDraft.state" />
            </div>
            <div class="form-row">
              <label>Training Group Assignment</label>
              <input type="text" [(ngModel)]="editDraft.trainingGroupAssignment" />
            </div>
            <div class="form-row">
              <label>Applied Date</label>
              <input type="date" [(ngModel)]="editDraft.appliedDate" />
            </div>
            <div class="form-row">
              <label>Notes</label>
              <textarea rows="3" [(ngModel)]="editDraft.notes"></textarea>
            </div>
            <div class="form-row">
              <label>Status</label>
              <select [(ngModel)]="editDraft.status">
                <option value="new">New</option>
                <option value="screening">Screening</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="hired">Hired</option>
                <option value="no response">No Response</option>
                <option value="no show">No Show</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div class="form-row">
              <label>CV Upload</label>
              <input type="file" accept=".pdf,.doc,.docx,.txt,.rtf" (change)="onEditCvSelected($event)" />
              @if (editDraft.cvFileName) {
                <small class="hint">Selected: {{ editDraft.cvFileName }}</small>
              }
            </div>
            <div class="actions">
              <button class="btn-secondary" (click)="showEdit.set(false)">Cancel</button>
              <button class="btn-primary" (click)="saveEdit()">Save</button>
            </div>
          </div>
        </div>
      }

      @if (showHiredDetails()) {
        <div class="modal-overlay" (click)="showHiredDetails.set(false)">
          <div class="modal modal-hired-details" (click)="$event.stopPropagation()">
            <h3>Hired Applicant Details</h3>
            @if (selectedHiredApplicant(); as row) {
              <div class="hired-details-grid">
                <div><span>Name</span><strong>{{ row.fullName || '—' }}</strong></div>
                <div><span>Position</span><strong>{{ row.position || '—' }}</strong></div>
                <div><span>Source</span><strong>{{ row.source || '—' }}</strong></div>
                <div><span>State</span><strong>{{ row.state || '—' }}</strong></div>
                <div><span>Applied</span><strong>{{ row.appliedDate || '—' }}</strong></div>
              </div>
              <div class="form-row">
                <label>Training Group Assignment</label>
                <input
                  type="text"
                  [ngModel]="hiredDetailsTrainingGroupAssignment()"
                  (ngModelChange)="hiredDetailsTrainingGroupAssignment.set($event)"
                  placeholder="Group A, Week 1 Cohort..."
                />
              </div>
              <div class="form-row">
                <label>Notes</label>
                <textarea rows="3" [value]="row.notes || ''" readonly></textarea>
              </div>
              <div class="actions">
                <button class="btn-secondary" (click)="showHiredDetails.set(false)">Close</button>
                <button class="btn-primary" (click)="saveHiredDetails()">Save Details</button>
              </div>
            }
          </div>
        </div>
      }

      @if (showAddPosition()) {
        <div class="modal-overlay" (click)="showAddPosition.set(false)">
          <div class="modal modal-small" (click)="$event.stopPropagation()">
            <h3>Add Position</h3>
            <div class="form-row">
              <label>Position Name</label>
              <input
                type="text"
                [ngModel]="newPositionName()"
                (ngModelChange)="newPositionName.set($event)"
                placeholder="Dispatcher, Recruiter, Driver Manager..."
              />
            </div>
            <div class="form-row">
              <label>Color</label>
              <div class="color-field">
                <input
                  type="color"
                  [ngModel]="newPositionColor()"
                  (ngModelChange)="newPositionColor.set(normalizeColorHex($event) || '#38BDF8')"
                />
                <input
                  type="text"
                  [ngModel]="newPositionColor()"
                  (ngModelChange)="newPositionColor.set(normalizeColorHex($event) || '#38BDF8')"
                  placeholder="#38BDF8"
                />
              </div>
            </div>
            <div class="actions">
              <button class="btn-secondary" (click)="showAddPosition.set(false)">Cancel</button>
              <button class="btn-primary" (click)="addPosition()">Add</button>
            </div>
          </div>
        </div>
      }

      @if (showPositionSettings()) {
        <div class="modal-overlay" (click)="showPositionSettings.set(false)">
          <div class="modal modal-small" (click)="$event.stopPropagation()">
            <h3>Position Settings</h3>
            <div class="form-row">
              <label>Position</label>
              <input type="text" [ngModel]="positionSettingsTargetName()" (ngModelChange)="positionSettingsTargetName.set($event)" />
            </div>
            <div class="form-row">
              <label>Status</label>
              <select [ngModel]="positionSettingsTargetActive() ? 'active' : 'inactive'" (ngModelChange)="positionSettingsTargetActive.set($event === 'active')">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div class="form-row">
              <label>Group</label>
              <select [ngModel]="positionSettingsTargetGroup()" (ngModelChange)="positionSettingsTargetGroup.set($event === 'fleet' ? 'fleet' : 'office')">
                <option value="office">Office</option>
                <option value="fleet">Fleet</option>
              </select>
            </div>
            <div class="form-row">
              <label>Color</label>
              <div class="color-field">
                <input
                  type="color"
                  [ngModel]="positionSettingsTargetColor()"
                  (ngModelChange)="positionSettingsTargetColor.set(normalizeColorHex($event) || '#38BDF8')"
                />
                <input
                  type="text"
                  [ngModel]="positionSettingsTargetColor()"
                  (ngModelChange)="positionSettingsTargetColor.set(normalizeColorHex($event) || '#38BDF8')"
                  placeholder="#38BDF8"
                />
              </div>
            </div>
            <div class="actions">
              <button class="btn-danger" (click)="deletePositionTab()">Delete Position</button>
              <button class="btn-secondary" (click)="showPositionSettings.set(false)">Cancel</button>
              <button class="btn-primary" (click)="savePositionSettings()">Save</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .applicants-page { padding: 24px; }
    .applicant-mode-tabs-header { display: inline-flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; padding: 5px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(10, 13, 22, 0.75); box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
    .applicant-mode-tab {
      position: relative;
      background: transparent;
      color: #9fb2c8;
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 9px 16px;
      cursor: pointer;
      font-size: 0.88rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      transition: all 0.18s ease;
    }
    .applicant-mode-tab:hover { color: #e2e8f0; background: rgba(148, 163, 184, 0.1); }
    .applicant-mode-tab.active {
      color: #e0f7ff;
      border-color: rgba(0, 212, 255, 0.45);
      background: linear-gradient(135deg, rgba(0, 212, 255, 0.22), rgba(0, 128, 255, 0.12));
      box-shadow: 0 0 18px rgba(0, 212, 255, 0.22), inset 0 1px 0 rgba(255,255,255,0.06);
    }
    .page-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; h1 { margin: 0; color: #fff; display: flex; align-items: center; gap: 10px; i { color: #00d4ff; filter: drop-shadow(0 0 8px rgba(0, 212, 255, 0.45)); } } p { margin: 4px 0 0; color: #8aa0b8; } }
    .page-header-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; margin-left: auto; }
    .btn-primary { background: linear-gradient(135deg, #00d4ff, #0080ff); border: none; color: #0a0a14; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .btn-secondary { background: #253049; border: none; color: #dbeafe; border-radius: 8px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
    .btn-danger { background: #3b1118; border: 1px solid #7f1d1d; color: #fecaca; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; margin-right: auto; }
    .position-state-tabs { display: inline-flex; gap: 6px; margin-bottom: 12px; padding: 4px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(10, 13, 22, 0.72); }
    .state-tab { background: transparent; color: #9fb2c8; border: 1px solid transparent; border-radius: 999px; padding: 7px 14px; cursor: pointer; font-size: 0.84rem; font-weight: 700; transition: all 0.15s ease; }
    .state-tab:hover { color: #e2e8f0; background: rgba(148, 163, 184, 0.1); }
    .state-tab.active { border-color: rgba(0, 212, 255, 0.45); color: #d9f6ff; background: rgba(0, 212, 255, 0.16); box-shadow: 0 0 14px rgba(0, 212, 255, 0.2); }
    .historical-banner { margin-bottom: 10px; border: 1px solid #2a2a4e; background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(16, 25, 44, 0.9)); border-radius: 10px; padding: 10px 12px; color: #b9d5f6; font-size: 0.85rem; }
    .position-group-tabs { display: inline-flex; gap: 8px; }
    .position-group-tabs-header { margin: 0; padding: 5px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; background: rgba(10, 13, 22, 0.78); box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 0 20px rgba(0, 212, 255, 0.06); }
    .group-tab { background: transparent; color: #9fb2c8; border: 1px solid transparent; border-radius: 999px; padding: 8px 14px; cursor: pointer; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 7px; transition: all 160ms ease; }
    .group-tab i { font-size: 1rem; }
    .office-tab i { color: #fbbf24; text-shadow: 0 0 8px rgba(251, 191, 36, 0.35); }
    .fleet-tab i { color: #38bdf8; text-shadow: 0 0 8px rgba(56, 189, 248, 0.35); }
    .group-tab:hover { color: #d0e7ff; background: rgba(148, 163, 184, 0.1); }
    .office-tab:hover i { color: #fcd34d; text-shadow: 0 0 12px rgba(252, 211, 77, 0.55); }
    .fleet-tab:hover i { color: #67e8f9; text-shadow: 0 0 12px rgba(103, 232, 249, 0.55); }
    .group-tab.active { color: #f8fafc; }
    .office-tab.active { border-color: rgba(251, 191, 36, 0.55); background: linear-gradient(135deg, rgba(251, 191, 36, 0.22), rgba(245, 158, 11, 0.1)); box-shadow: 0 0 18px rgba(251, 191, 36, 0.28); }
    .office-tab.active i { color: #facc15; text-shadow: 0 0 14px rgba(250, 204, 21, 0.7); }
    .fleet-tab.active { border-color: rgba(56, 189, 248, 0.55); background: linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(14, 165, 233, 0.1)); box-shadow: 0 0 18px rgba(56, 189, 248, 0.28); }
    .fleet-tab.active i { color: #22d3ee; text-shadow: 0 0 14px rgba(34, 211, 238, 0.7); }
    .goals-view { display: flex; flex-direction: column; gap: 10px; }
    .goals-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .goals-toolbar h3 { margin: 0; color: #e2e8f0; font-size: 0.98rem; }
    .goals-toolbar p { margin: 2px 0 0; color: #8aa0b8; font-size: 0.8rem; }
    .goals-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .goals-summary .pipeline-tile { background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(16, 25, 44, 0.92)); border-color: #334155; }
    .goals-visual-grid { display: grid; grid-template-columns: minmax(220px, 280px) 1fr; gap: 10px; }
    .goals-analytics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .goals-analytics-grid .report-panel h3 { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .goals-analytics-toggle { display: inline-flex; gap: 6px; }
    .goals-analytics-toggle .state-tab { padding: 4px 10px; font-size: 0.74rem; }
    .goals-panel { border: 1px solid #2a2a4e; border-radius: 10px; background: #10192c; padding: 12px; }
    .goals-panel h4 { margin: 0 0 10px; color: #dbeafe; font-size: 0.84rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .completion-donut-wrap { display: flex; align-items: center; justify-content: center; min-height: 150px; }
    .completion-donut {
      width: 128px;
      height: 128px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(148, 163, 184, 0.3);
    }
    .completion-donut-center {
      width: 78px;
      height: 78px;
      border-radius: 999px;
      background: #0f172a;
      border: 1px solid rgba(148, 163, 184, 0.2);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
    }
    .completion-donut-center strong { color: #e2e8f0; font-size: 1rem; line-height: 1; }
    .completion-donut-center span { color: #8aa0b8; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .goal-comparison-list { display: grid; gap: 10px; }
    .goal-comparison-row { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "head pct" "track pct"; gap: 4px 10px; align-items: center; }
    .goal-comparison-head { grid-area: head; display: flex; justify-content: space-between; gap: 8px; color: #cbd5e1; font-size: 0.8rem; }
    .goal-comparison-head small { color: #8aa0b8; font-size: 0.72rem; }
    .goal-comparison-track { grid-area: track; width: 100%; height: 8px; border-radius: 999px; background: rgba(148, 163, 184, 0.2); overflow: hidden; }
    .goal-comparison-fill { height: 100%; border-radius: 999px; min-width: 2px; }
    .goal-comparison-row strong { grid-area: pct; color: #e2e8f0; font-size: 0.76rem; min-width: 38px; text-align: right; }
    .goal-sections-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
    .goal-section-card { border: 1px solid #2a2a4e; border-radius: 10px; background: #10192c; padding: 10px; display: grid; gap: 6px; }
    .goal-section-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 2px; }
    .goal-section-head strong { color: #e2e8f0; font-size: 0.82rem; }
    .goal-period-chip { border: 1px solid #334155; background: #0f172a; color: #93c5fd; border-radius: 999px; font-size: 0.66rem; padding: 2px 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .goal-section-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: #cbd5e1; font-size: 0.76rem; }
    .goal-section-row small { color: #8aa0b8; font-size: 0.7rem; }
    .goal-section-overall { margin-top: 4px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(148,163,184,0.2); padding-top: 6px; }
    .goal-section-overall span { color: #8aa0b8; font-size: 0.74rem; }
    .goal-section-overall strong { color: #e2e8f0; font-size: 0.84rem; }
    .goals-table th, .goals-table td { vertical-align: middle; }
    .goals-table select, .goals-table input { width: 100%; background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 6px 8px; font-size: 0.8rem; }
    .goals-table select:disabled, .goals-table input:disabled { opacity: 0.7; cursor: default; background: #0f172a; color: #94a3b8; }
    .icon-btn.active { border-color: #22d3ee; color: #67e8f9; background: rgba(34, 211, 238, 0.12); }
    .goal-source-editor { display: grid; gap: 6px; min-width: 200px; }
    .goal-source-list { display: flex; flex-wrap: wrap; gap: 4px; }
    .goal-source-chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px; border-radius: 999px; border: 1px solid #334155; background: #0f172a; color: #cbd5e1; font-size: 0.7rem; }
    .goal-source-remove { border: none; background: transparent; color: #93c5fd; cursor: pointer; padding: 0; display: inline-flex; align-items: center; }
    .goal-source-empty { color: #8aa0b8; font-size: 0.72rem; }
    .goal-source-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
    .goal-progress-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 48px; padding: 2px 8px; border-radius: 999px; background: rgba(34, 211, 238, 0.12); color: #67e8f9; border: 1px solid rgba(34, 211, 238, 0.35); font-size: 0.74rem; font-weight: 700; }
    .goal-progress-track { width: 100%; height: 8px; border-radius: 999px; background: rgba(148, 163, 184, 0.22); overflow: hidden; margin-bottom: 4px; }
    .goal-progress-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #22d3ee); border-radius: 999px; min-width: 2px; }
    .goal-progress-label { color: #8aa0b8; font-size: 0.7rem; }
    .position-filter-table-wrap {
      position: relative;
      isolation: isolate;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 14px;
      background:
        linear-gradient(165deg, rgba(255, 255, 255, 0.07), transparent 42%),
        rgba(12, 18, 32, 0.48);
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.08) inset,
        0 0 0 1px rgba(0, 212, 255, 0.06) inset,
        0 18px 40px rgba(0, 0, 0, 0.35);
    }
    .position-filter-table-wrap::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
      pointer-events: none;
      z-index: 2;
    }
    .position-filter-table-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent);
    }
    .position-filter-table-head h4 {
      margin: 0;
      color: rgba(226, 232, 240, 0.88);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }
    .position-filter-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .position-filter-table th, .position-filter-table td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      text-align: left;
      font-size: 0.8rem;
    }
    .position-filter-table th {
      color: rgba(148, 163, 184, 0.92);
      font-weight: 700;
      letter-spacing: 0.04em;
      background: rgba(8, 12, 22, 0.35);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .position-filter-table tbody tr:last-child td { border-bottom: none; }
    .position-filter-table .col-position { width: 34%; }
    .position-filter-table .col-count { width: 9%; }
    .position-filter-table .col-avg-day { width: 9%; }
    .position-filter-table .col-avg-age { width: 9%; }
    .position-filter-table .col-male { width: 7%; }
    .position-filter-table .col-female { width: 7%; }
    .position-filter-table .col-most-recent { width: 13%; }
    .position-filter-table .col-status { width: 9%; }
    .position-filter-table .col-actions { width: 6%; text-align: center; }
    .position-filter-table .col-status,
    .position-filter-table .col-count,
    .position-filter-table .col-avg-day,
    .position-filter-table .col-avg-age,
    .position-filter-table .col-male,
    .position-filter-table .col-female,
    .position-filter-table .col-most-recent,
    .position-filter-table .col-actions { text-align: center; white-space: nowrap; }
    .position-option-row { cursor: pointer; transition: background 140ms ease, box-shadow 140ms ease; }
    .position-option-row:focus-visible { outline: none; }
    .position-option-row:focus-visible td { box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.7); }
    .position-option-row:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .position-option-row.active {
      background:
        linear-gradient(90deg, rgba(0, 212, 255, 0.16), rgba(0, 212, 255, 0.05) 55%, transparent);
      box-shadow: inset 3px 0 0 #22d3ee;
    }
    .position-option-row:hover td,
    .position-option-row.active td { background: transparent; }
    .position-selection-cell { display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; }
    .position-selected-pill {
      display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 999px;
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.02em; color: #d9f6ff;
      border: 1px solid rgba(34, 211, 238, 0.45);
      background: rgba(34, 211, 238, 0.18);
      box-shadow: 0 0 12px rgba(34, 211, 238, 0.18);
      backdrop-filter: blur(6px);
    }
    .position-name { color: #e2e8f0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .position-color-none { color: #64748b; }
    .position-state {
      display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 0.72rem;
      border: 1px solid transparent; backdrop-filter: blur(6px);
    }
    .position-state.active { color: #86efac; border-color: rgba(34, 197, 94, 0.4); background: rgba(22, 101, 52, 0.28); }
    .position-state.inactive { color: #fda4af; border-color: rgba(239, 68, 68, 0.4); background: rgba(127, 29, 29, 0.28); }
    .position-state.all { color: #cbd5e1; border-color: rgba(148, 163, 184, 0.35); background: rgba(51, 65, 85, 0.32); }
    .add-position-btn {
      display: inline-flex; align-items: center; gap: 4px; padding: 8px 12px;
      border-radius: 999px !important;
      border: 1px solid rgba(0, 212, 255, 0.35) !important;
      background: linear-gradient(135deg, rgba(0, 212, 255, 0.22), rgba(124, 58, 237, 0.18)) !important;
      color: #e0f7ff !important;
      box-shadow: 0 0 16px rgba(0, 212, 255, 0.16);
      backdrop-filter: blur(8px);
    }
    .add-position-btn:hover {
      border-color: rgba(0, 212, 255, 0.55) !important;
      box-shadow: 0 0 22px rgba(0, 212, 255, 0.28);
    }
    .position-filter-table-wrap .icon-btn {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(6px);
    }
    .position-filter-table-wrap .icon-btn:hover {
      border-color: rgba(0, 212, 255, 0.45);
      background: rgba(0, 212, 255, 0.12);
      color: #e0f7ff;
    }
    .filters { display: flex; gap: 10px; margin: 10px 0 14px; align-items: center; flex-wrap: wrap; input, select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 8px 10px; } input { min-width: 280px; } }
    .pipeline-tiles { width: 100%; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 2px; }
    .dashboard-tiles { margin: 0 0 14px; }
    .pipeline-tile { position: relative; border: 1px solid #2a2a4e; border-radius: 12px; padding: 11px 12px 10px; background: linear-gradient(180deg, #111b2f 0%, #0f172a 100%); display: flex; flex-direction: column; gap: 4px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 10px 24px rgba(2, 6, 23, 0.3); overflow: hidden; transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease; }
    .pipeline-tile::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 2px; background: linear-gradient(90deg, rgba(125, 211, 252, 0.95), rgba(45, 212, 191, 0.85)); opacity: 0.9; }
    .pipeline-tile:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 14px 28px rgba(2, 6, 23, 0.34); }
    .pipeline-tile-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .pipeline-tile span { color: #9fb2c8; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
    .pipeline-tile i { font-size: 0.95rem; color: #7dd3fc; opacity: 0.96; width: 24px; height: 24px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: rgba(125, 211, 252, 0.14); border: 1px solid rgba(125, 211, 252, 0.28); }
    .pipeline-tile strong { color: #f0f9ff; font-size: 1.45rem; line-height: 1.05; letter-spacing: 0.01em; }
    .pipeline-tile small { color: #7f94ad; font-size: 0.74rem; }
    .pipeline-tile.total { border-color: rgba(56, 189, 248, 0.35); }
    .pipeline-tile.total::before { background: linear-gradient(90deg, #38bdf8, #22d3ee); }
    .pipeline-tile.working { border-color: rgba(14, 165, 233, 0.38); }
    .pipeline-tile.working::before { background: linear-gradient(90deg, #0ea5e9, #38bdf8); }
    .pipeline-tile.rejected { border-color: rgba(244, 63, 94, 0.35); }
    .pipeline-tile.rejected::before { background: linear-gradient(90deg, #fb7185, #f43f5e); }
    .pipeline-tile.rejected i { color: #fb7185; background: rgba(251, 113, 133, 0.12); border-color: rgba(251, 113, 133, 0.26); }
    .pipeline-tile.hired { border-color: rgba(34, 197, 94, 0.35); }
    .pipeline-tile.hired::before { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .pipeline-tile.hired i { color: #4ade80; background: rgba(74, 222, 128, 0.12); border-color: rgba(74, 222, 128, 0.26); }

    @keyframes stat-panel-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .dashboard-tiles .stat-panel {
      --kpi-accent: #67e8f9;
      --kpi-accent-soft: rgba(0, 212, 255, 0.16);
      position: relative; overflow: hidden; isolation: isolate;
      display: flex; flex-direction: column; gap: 8px;
      min-width: 0; min-height: 132px; padding: 14px 14px 12px 16px;
      border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.08);
      background:
        radial-gradient(120% 90% at 100% 0%, var(--kpi-accent-soft), transparent 55%),
        linear-gradient(165deg, rgba(255, 255, 255, 0.05), transparent 46%),
        rgba(10, 13, 22, 0.92);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.05) inset,
        0 0 20px color-mix(in srgb, var(--kpi-accent) 16%, transparent),
        0 12px 28px rgba(0, 0, 0, 0.3);
      animation: stat-panel-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      text-align: left; color: inherit; font: inherit;
    }
    .dashboard-tiles .stat-panel::before {
      content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px;
      border-radius: 0 4px 4px 0;
      background: linear-gradient(180deg, var(--kpi-accent), transparent 95%);
      box-shadow: 0 0 12px color-mix(in srgb, var(--kpi-accent) 70%, transparent);
    }
    .dashboard-tiles .stat-panel:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--kpi-accent) 48%, rgba(255, 255, 255, 0.08));
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.06) inset,
        0 0 32px color-mix(in srgb, var(--kpi-accent) 26%, transparent),
        0 16px 32px rgba(0, 0, 0, 0.34);
    }
    .dashboard-tiles .stat-panel:nth-child(1) { animation-delay: 0s; }
    .dashboard-tiles .stat-panel:nth-child(2) { animation-delay: 0.04s; }
    .dashboard-tiles .stat-panel:nth-child(3) { animation-delay: 0.08s; }
    .dashboard-tiles .stat-panel:nth-child(4) { animation-delay: 0.12s; }
    .dashboard-tiles .stat-panel.tone-cyan { --kpi-accent: #00d4ff; --kpi-accent-soft: rgba(0, 212, 255, 0.18); }
    .dashboard-tiles .stat-panel.tone-green { --kpi-accent: #22c55e; --kpi-accent-soft: rgba(34, 197, 94, 0.16); }
    .dashboard-tiles .stat-panel.tone-red { --kpi-accent: #ef4444; --kpi-accent-soft: rgba(239, 68, 68, 0.14); }
    .dashboard-tiles .stat-panel.tone-violet { --kpi-accent: #a855f7; --kpi-accent-soft: rgba(168, 85, 247, 0.16); }
    .dashboard-tiles .stat-panel-mark {
      position: absolute; right: -6px; bottom: -10px; font-size: 4.6rem; line-height: 1;
      color: var(--kpi-accent); opacity: 0.1; transform: rotate(-8deg); pointer-events: none; z-index: 0;
    }
    .dashboard-tiles .stat-panel:hover .stat-panel-mark { opacity: 0.16; transform: rotate(-4deg) translateY(-2px); }
    .dashboard-tiles .stat-panel-head,
    .dashboard-tiles .stat-panel-value,
    .dashboard-tiles .stat-panel-meter,
    .dashboard-tiles .stat-panel-foot { position: relative; z-index: 1; }
    .dashboard-tiles .stat-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
    .dashboard-tiles .stat-panel-label {
      font-size: 0.62rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
      color: rgba(226, 232, 240, 0.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .dashboard-tiles .stat-panel-badge {
      flex-shrink: 0; padding: 2px 6px; border-radius: 999px; font-size: 0.58rem; font-weight: 700;
      letter-spacing: 0.05em; text-transform: uppercase;
      color: color-mix(in srgb, var(--kpi-accent) 88%, #fff);
      background: color-mix(in srgb, var(--kpi-accent) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--kpi-accent) 35%, transparent);
    }
    .dashboard-tiles .stat-panel-value {
      margin: 0; font-size: clamp(1.15rem, 0.7vw + 0.95rem, 1.45rem); font-weight: 700;
      letter-spacing: 0.02em; line-height: 1.1; color: #f8fafc; font-variant-numeric: tabular-nums;
      text-shadow: 0 0 18px color-mix(in srgb, var(--kpi-accent) 28%, transparent);
    }
    .dashboard-tiles .stat-panel-meter {
      height: 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); overflow: hidden;
    }
    .dashboard-tiles .stat-panel-meter span {
      display: block; height: 100%; border-radius: inherit;
      background: linear-gradient(90deg, color-mix(in srgb, var(--kpi-accent) 55%, #fff), var(--kpi-accent));
      box-shadow: 0 0 10px color-mix(in srgb, var(--kpi-accent) 45%, transparent);
    }
    .dashboard-tiles .stat-panel-foot { display: flex; flex-wrap: wrap; gap: 5px; margin-top: auto; }
    .dashboard-tiles .stat-panel-chip {
      padding: 2px 7px; border-radius: 999px; font-size: 0.62rem; font-weight: 600;
      color: rgba(248, 250, 252, 0.92); background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .dashboard-tiles .stat-panel-chip.soft { color: rgba(203, 213, 225, 0.85); background: transparent; }

    @media (max-width: 1180px) { .pipeline-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 680px) { .pipeline-tiles { grid-template-columns: 1fr; } }
    .pipeline-tabs { display: inline-flex; gap: 6px; margin-right: 2px; }
    .pipeline-tab { background: #111827; color: #9fb2c8; border: 1px solid #2a2a4e; border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 0.82rem; }
    .pipeline-tab.active { border-color: #00d4ff; color: #d9f6ff; background: rgba(0, 212, 255, 0.12); }
    .sync-error { margin: -4px 0 10px; color: #fda4af; font-size: 0.82rem; }
    .table-top-actions { display: flex; justify-content: flex-end; margin: 14px 0 18px; }
    .table-wrap {
      position: relative;
      isolation: isolate;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      overflow: hidden;
      background:
        linear-gradient(165deg, rgba(255, 255, 255, 0.07), transparent 42%),
        rgba(12, 18, 32, 0.48);
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.08) inset,
        0 0 0 1px rgba(0, 212, 255, 0.06) inset,
        0 18px 40px rgba(0, 0, 0, 0.35);
    }
    .table-wrap::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
      pointer-events: none;
      z-index: 2;
    }
    .report-view { margin-top: 6px; }
    .report-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .applicant-mode-tabs-inline { display: inline-flex; gap: 8px; margin-right: 4px; }
    .report-toolbar label { color: #8aa0b8; font-size: 0.8rem; }
    .report-toolbar select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 6px 10px; min-width: 140px; }
    .report-date-range { display: inline-flex; align-items: center; gap: 8px; }
    .report-date-range input { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 6px 8px; }
    .report-date-range span { color: #8aa0b8; font-size: 0.8rem; }
    .report-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .report-cards-primary { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .report-cards-demographics { margin-top: -2px; }
    .report-card { background: #10192c; border: 1px solid #2a2a4e; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
    .report-card span { color: #8aa0b8; font-size: 0.8rem; }
    .report-card strong { color: #e0f2fe; font-size: 1.2rem; }
    .report-card small { color: #7f94ad; font-size: 0.72rem; }
    .report-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .report-card-select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 6px; padding: 3px 6px; font-size: 0.72rem; min-width: 90px; }
    .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .report-panel { border: 1px solid #2a2a4e; border-radius: 10px; overflow: hidden; }
    .report-panel-wide { grid-column: 1 / -1; min-height: 320px; }
    .report-panel h3 { margin: 0; padding: 10px 12px; font-size: 0.88rem; color: #cbd5e1; background: #0d0d1a; border-bottom: 1px solid #2a2a4e; }
    .count-cell { text-align: right; font-weight: 700; color: #e2e8f0; }
    .chart-empty { text-align: center; color: #8aa0b8; padding: 24px; }
    ::ng-deep .ngx-charts { text { fill: #a5b4c8 !important; } .gridline-path { stroke: rgba(255,255,255,0.08) !important; } }
    ::ng-deep .ngx-charts .tick text { fill: #8aa0b8 !important; font-size: 10px !important; }
    ::ng-deep .ngx-charts .label { fill: #cbd5e1 !important; font-size: 11px !important; }
    ::ng-deep ngx-charts-bar-vertical, ::ng-deep ngx-charts-bar-horizontal, ::ng-deep ngx-charts-pie-chart, ::ng-deep ngx-charts-bubble-chart, ::ng-deep ngx-charts-line-chart { display: block; position: relative; z-index: 0; }
    table { width: 100%; border-collapse: collapse; }
    .table-wrap th {
      text-align: left;
      padding: 12px;
      background: rgba(8, 12, 22, 0.35);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: rgba(148, 163, 184, 0.92);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .table-wrap td {
      padding: 12px;
      color: #d1d5db;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      vertical-align: top;
    }
    .table-wrap tbody tr:last-child td { border-bottom: none; }
    th { text-align: left; padding: 12px; background: #0d0d1a; color: #8aa0b8; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid #2a2a4e; }
    td { padding: 12px; color: #d1d5db; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
    .applicant-row { cursor: pointer; transition: background 140ms ease; }
    .applicant-row:hover td { background: rgba(255, 255, 255, 0.03); }
    .applicant-row.selected td {
      background: linear-gradient(90deg, rgba(0, 212, 255, 0.14), rgba(0, 212, 255, 0.04) 55%, transparent);
      box-shadow: inset 3px 0 0 #22d3ee;
    }
    .table-wrap td select {
      background: rgba(255, 255, 255, 0.05);
      color: #d1d5db;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 6px 8px;
      backdrop-filter: blur(6px);
    }
    .table-wrap td select:focus {
      outline: none;
      border-color: rgba(0, 212, 255, 0.45);
      box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.12);
    }
    td select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 6px 8px; }
    .action-icons { display: flex; gap: 6px; }
    .icon-btn { border: 1px solid #2a2a4e; background: #111827; color: #cbd5e1; border-radius: 6px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .table-wrap .icon-btn {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(6px);
    }
    .table-wrap .icon-btn:hover {
      border-color: rgba(0, 212, 255, 0.45);
      background: rgba(0, 212, 255, 0.12);
      color: #e0f7ff;
    }
    .icon-btn:hover { border-color: #4b5c84; color: #fff; }
    .icon-btn.warn:hover { border-color: #f59e0b; color: #fde68a; }
    .icon-btn.success:hover { border-color: #22c55e; color: #86efac; }
    .icon-btn.danger:hover { border-color: #ef4444; color: #fecaca; }
    .cv-link-btn { background: transparent; color: #7dd3fc; border: none; text-decoration: underline; cursor: pointer; padding: 0; font-size: 0.86rem; }
    .table-wrap .position-pill {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(6px);
    }
    .position-pill { display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid #2a2a4e; padding: 3px 10px; font-size: 0.78rem; color: #d1d5db; background: rgba(17,24,39,0.8); }
    .position-pill.has-color { border-color: var(--position-color, #2a2a4e); background: var(--position-color-soft, rgba(56, 189, 248, 0.16)); color: #f8fafc; }
    .empty { text-align: center; color: #8aa0b8; padding: 20px; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { width: 100%; max-width: 520px; background: #161a2a; border: 1px solid #2a2a4e; border-radius: 12px; padding: 16px; h3 { margin-top: 0; color: #fff; } }
    .modal-small { max-width: 420px; }
    .modal-hired-details { max-width: 640px; }
    .hired-details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
    .hired-details-grid div { border: 1px solid #2a2a4e; border-radius: 8px; padding: 10px; background: #111827; display: flex; flex-direction: column; gap: 4px; }
    .hired-details-grid span { color: #8aa0b8; font-size: 0.75rem; }
    .hired-details-grid strong { color: #e2e8f0; font-size: 0.9rem; }
    .form-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; label { color: #8aa0b8; font-size: 0.8rem; } input, textarea, select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 8px 10px; } }
    .color-field { display: flex; gap: 8px; align-items: center; }
    .color-field input[type='color'] { width: 52px; min-width: 52px; height: 38px; padding: 4px; border-radius: 8px; cursor: pointer; }
    .color-field input[type='text'] { flex: 1; text-transform: uppercase; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .hint { color: #8aa0b8; font-size: 0.78rem; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    .market-view { display: grid; gap: 14px; }
    .market-toolbar-actions { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
    .market-theme-toggle { display: inline-flex; gap: 6px; }
    .market-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; border: 1px solid #334155; border-radius: 12px; padding: 12px; background: linear-gradient(135deg, rgba(6, 20, 42, 0.95), rgba(17, 24, 39, 0.95)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 24px rgba(2, 6, 23, 0.35); }
    .market-toolbar h3 { margin: 0 0 4px; color: #e2e8f0; font-size: 1rem; }
    .market-toolbar p { margin: 0; color: #8aa0b8; font-size: 0.84rem; }
    .market-series-grid { border: 1px solid #334155; border-radius: 12px; background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(10, 16, 31, 0.96)); padding: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .market-series-grid label { display: flex; flex-direction: column; gap: 6px; color: #9fb2c8; font-size: 0.78rem; }
    .market-series-grid input, .market-series-grid select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 8px 10px; font-size: 0.82rem; text-transform: uppercase; }
    .market-preset-field { grid-column: 1 / -1; }
    .market-series-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
    .market-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .market-cards .report-card { min-height: 88px; display: flex; flex-direction: column; justify-content: center; }
    .market-cards-bold .report-card { border-color: rgba(0, 229, 255, 0.28); background: linear-gradient(145deg, rgba(4, 24, 43, 0.95), rgba(17, 24, 39, 0.95)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 30px rgba(2, 6, 23, 0.35); }
    .market-cards-bold .report-card strong { color: #f0fdff; text-shadow: 0 0 12px rgba(0, 229, 255, 0.22); }
    .market-cards-bold .report-card:nth-child(2n) { border-color: rgba(124, 77, 255, 0.3); }
    .market-cards-bold .report-card:nth-child(3n) { border-color: rgba(255, 77, 141, 0.28); }
    .market-theme-executive .market-toolbar { background: linear-gradient(135deg, #101827, #1f2937); border-color: #475569; box-shadow: none; }
    .market-theme-executive .market-series-grid { background: linear-gradient(135deg, #0f172a, #1e293b); border-color: #475569; }
    .market-theme-executive .market-cards-bold .report-card { background: linear-gradient(145deg, #111827, #1f2937); border-color: #475569; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.22); }
    .market-theme-executive .market-cards-bold .report-card strong { text-shadow: none; color: #f8fafc; }
    .market-theme-executive .market-cards-bold .report-card:nth-child(2n),
    .market-theme-executive .market-cards-bold .report-card:nth-child(3n) { border-color: #64748b; }
    .market-theme-executive .report-panel { background: linear-gradient(180deg, #0f172a, #1e293b); border-color: #475569; }
    .market-theme-neon .state-tab.active { box-shadow: 0 0 16px rgba(0, 212, 255, 0.28); }
    @media (max-width: 1160px) { .market-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 780px) { .market-series-grid, .market-cards { grid-template-columns: 1fr; } .market-series-actions { justify-content: flex-start; } }
    .suggested-goals-wrap { border: 1px solid #2a2a4e; border-radius: 12px; padding: 12px; background: linear-gradient(180deg, rgba(12, 20, 38, 0.94), rgba(10, 17, 32, 0.9)); display: grid; gap: 10px; }
    .suggested-goals-head h4 { margin: 0; color: #e2e8f0; }
    .suggested-goals-head small { color: #8aa0b8; }
    .suggested-mode-toggle { margin-top: 8px; display: inline-flex; gap: 6px; flex-wrap: wrap; }
    .suggested-goals-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .suggested-goal-card { border: 1px solid #334155; border-radius: 10px; background: rgba(15, 23, 42, 0.72); padding: 10px; display: grid; gap: 8px; }
    .suggested-goal-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .suggested-confidence { border-radius: 999px; border: 1px solid transparent; padding: 2px 8px; font-size: 0.72rem; }
    .suggested-confidence.high { color: #86efac; border-color: #166534; background: rgba(22, 101, 52, 0.2); }
    .suggested-confidence.medium { color: #fcd34d; border-color: #92400e; background: rgba(120, 53, 15, 0.2); }
    .suggested-confidence.low { color: #fecaca; border-color: #7f1d1d; background: rgba(127, 29, 29, 0.2); }
    .suggested-metrics { display: flex; flex-wrap: wrap; gap: 8px; color: #cbd5e1; font-size: 0.82rem; }
    .suggested-metrics b { color: #f8fafc; margin-left: 4px; }
    .suggested-goal-card p { margin: 0; color: #94a3b8; font-size: 0.76rem; line-height: 1.35; min-height: 36px; }
    @media (max-width: 1200px) { .suggested-goals-grid { grid-template-columns: 1fr; } }
    .fleet-otr-pay-section { border: 1px solid #2a2a4e; border-radius: 12px; padding: 12px; background: linear-gradient(180deg, rgba(12, 20, 38, 0.94), rgba(10, 17, 32, 0.9)); display: grid; gap: 10px; }
    .fleet-otr-pay-head h3 { margin: 0 0 4px; color: #e2e8f0; font-size: 1rem; }
    .fleet-otr-pay-head p { margin: 0; color: #8aa0b8; font-size: 0.82rem; }
    .fleet-otr-inputs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .fleet-otr-inputs label { display: flex; flex-direction: column; gap: 6px; color: #9fb2c8; font-size: 0.78rem; }
    .fleet-otr-inputs input { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 8px 10px; font-size: 0.82rem; }
    .fleet-otr-summary-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @media (max-width: 960px) { .fleet-otr-inputs, .fleet-otr-summary-cards { grid-template-columns: 1fr; } }
  `]
})
export class ApplicantsComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly legacyApplicantsStorageKey = 'ta.hr.applicants.v1';
  private readonly legacyImportDoneStorageKey = 'ta.hr.applicants.legacyImportDone';
  private readonly localFallbackPositionsStorageKey = 'ta.hr.applicant-positions.v1';
  private readonly localApplicantGoalsStorageKey = 'ta.hr.applicant-goals.v1';
  private readonly localMarketSeriesStorageKey = 'ta.hr.applicants.market-series.v1';
  private readonly localMarketPresetStorageKey = 'ta.hr.applicants.market-preset.v1';
  private readonly localMarketControlsStorageKey = 'ta.hr.applicants.market-controls.v1';
  private readonly dbMarketSeriesSettingsKey = 'ta.hr.applicants.market-series.v1';
  private readonly dbMarketSnapshotSettingsKey = 'ta.hr.applicants.market-snapshots.v1';
  private readonly dbMarketControlsSettingsKey = 'ta.hr.applicants.market-controls.v1';
  private readonly dbMarketAuditSettingsKey = 'ta.hr.applicants.market-audit.v1';
  private readonly dbApplicantGoalsSettingsKey = 'ta.hr.applicant-goals.v1';
  private readonly marketSeriesFallback: Record<BlsMarketKey, string> = {
    driverPay: 'CEU4348400003',
    laborTightness: 'LNS14000000',
    laborDemand: 'JTS000000000000000JOL',
    inflation: 'CUUR0000SA0',
    insuranceCost: 'CUUR0000SETA02'
  };
  private readonly apiUrl = environment.apiUrl;
  private readonly userSettings = inject(UserSettingsService);
  rows = signal<ApplicantRow[]>([]);
  customPositions = signal<ApplicantPosition[]>([]);
  selectedPosition = signal<string>('');
  positionStateFilter = signal<'active' | 'inactive' | 'historical' | 'report' | 'goals' | 'market'>('active');
  historicalViewMode = signal<'applicants' | 'report'>('applicants');
  positionGroupFilter = signal<'office' | 'fleet'>('office');
  applicantGoals = signal<ApplicantGoal[]>([]);
  editingGoalIds = signal<number[]>([]);
  goalSourceDrafts = signal<Record<number, string>>({});
  goalSourceChartMode = signal<'ytd' | 'monthly'>('ytd');
  applicantSectionMode = signal<'application' | 'hiring'>('application');
  pipelineFilter = signal<'working' | 'rejected' | 'hired'>('working');
  reportRange = signal<'all' | '7d' | '30d' | 'custom'>('all');
  reportPositionFilter = signal<string>('all');
  reportWeekSelection = signal<'thisWeek' | 'lastWeek' | 'allTime'>('thisWeek');
  reportDateFrom = signal('');
  reportDateTo = signal('');
  search = signal('');
  statusFilter = signal<'all' | ApplicantStatus>('all');
  showCreate = signal(false);
  showEdit = signal(false);
  showAddPosition = signal(false);
  showPositionSettings = signal(false);
  showHiredDetails = signal(false);
  hiredDetailsTrainingGroupAssignment = signal('');
  newPositionName = signal('');
  newPositionColor = signal('#38BDF8');
  positionSettingsOriginalName = signal('');
  positionSettingsTargetName = signal('');
  positionSettingsTargetActive = signal(true);
  positionSettingsTargetColor = signal('#38BDF8');
  positionSettingsTargetGroup = signal<PositionGroup>('office');
  selectedApplicantId = signal<number | null>(null);
  applicantsSyncError = signal('');
  marketLoading = signal(false);
  marketError = signal('');
  marketLastUpdated = signal('');
  marketSnapshots = signal<BlsMarketSnapshot[]>([]);
  marketAuditRows = signal<MarketAuditRow[]>([]);
  marketPresentationMode = signal<MarketPresentationMode>('neon');
  fleetOtrWeeklyMiles = signal(2800);
  fleetOtrHoursPerWeek = signal(60);
  fleetOtrBenefitsLoadPct = signal(18);
  suggestedGoalMode = signal<SuggestedGoalMode>('balanced');
  marketPresetKey = signal<string>('US');
  marketSeriesDraft: Record<BlsMarketKey, string> = {
    ...this.marketSeriesFallback
  };
  marketPresetOptions: MarketPresetOption[] = this.buildMarketPresets();
  private positionsRefreshTimer: any;
  private applicantsRefreshTimer: any;
  private attemptedLegacyImport = false;
  editTargetId = signal<number | null>(null);
  draft: ApplicantDraft = this.emptyDraft();
  editDraft: ApplicantDraft = this.emptyDraft();

  allPositions = computed(() => {
    const map = new Map<string, ApplicantPosition>();
    for (const p of this.customPositions()) {
      const normalized = this.normalizePositionName(p?.name);
      if (!normalized) continue;
      map.set(normalized.toLowerCase(), {
        name: normalized,
        isActive: !!p.isActive,
        color: this.normalizeColorHex(p.color),
        group: this.normalizePositionGroup(p.group, normalized)
      });
    }
    for (const row of this.rows()) {
      const normalized = this.normalizePositionName(row.position);
      if (!normalized) continue;
      if (!map.has(normalized.toLowerCase())) {
        map.set(normalized.toLowerCase(), {
          name: normalized,
          isActive: true,
          color: null,
          group: this.normalizePositionGroup(null, normalized)
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  positionTabs = computed(() => {
    const mode = this.positionStateFilter();
    const list = this.allPositions()
      .filter((p) => mode === 'active' ? p.isActive : mode === 'inactive' ? !p.isActive : true)
      .filter((p) => {
        if (mode !== 'active' && mode !== 'inactive') return true;
        return this.positionGroupFilter() === 'fleet'
          ? this.normalizePositionGroup(p.group, p.name) === 'fleet'
          : this.normalizePositionGroup(p.group, p.name) === 'office';
      })
      .map((p) => p.name);
    return ['all', ...list];
  });

  positionOptionsForForm = computed(() => this.allPositions().filter((p) => p.isActive).map((p) => p.name));
  reportPositionOptions = computed(() => {
    const targetGroup = this.positionGroupFilter();
    const list = this.allPositions()
      .filter((p) => this.normalizePositionGroup(p.group, p.name) === targetGroup)
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b));
    return ['all', ...list];
  });
  selectedHiredApplicant = computed(() => {
    const id = this.selectedApplicantId();
    if (!id) return null;
    return this.rows().find((row) => row.id === id) ?? null;
  });

  reportRows = computed(() => {
    const range = this.reportRange();
    const useHistorical = this.positionStateFilter() === 'historical';
    const targetGroup = this.positionGroupFilter();
    let scopedRows = this.rows().filter((row) => useHistorical ? this.isHistoricalApplicantRow(row) : !this.isHistoricalApplicantRow(row));
    scopedRows = scopedRows.filter((row) => {
      const isFleet = this.isFleetPosition(row.position);
      return targetGroup === 'fleet' ? isFleet : !isFleet;
    });

    if (range === 'custom') {
      const from = this.parseDateOnly(this.reportDateFrom());
      const to = this.parseDateOnly(this.reportDateTo());

      if (!from && !to) {
        scopedRows = this.rows();
      } else {
        const fromBound = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : null;
        const toBound = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : null;

        scopedRows = this.rows().filter((row) => {
          const parsed = this.parseDateOnly(row.appliedDate);
          if (!parsed) return false;
          if (fromBound && parsed < fromBound) return false;
          if (toBound && parsed > toBound) return false;
          return true;
        });
      }
    } else if (range !== 'all') {
      const days = range === '7d' ? 7 : 30;
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

      scopedRows = this.rows().filter((row) => {
        const parsed = this.parseDateOnly(row.appliedDate);
        return !!parsed && parsed >= cutoff;
      });
    }

    const position = String(this.reportPositionFilter() || 'all').trim();
    if (position && position !== 'all') {
      scopedRows = scopedRows.filter((row) => String(row.position || '').trim().toLowerCase() === position.toLowerCase());
    }

    const inReportView = this.positionStateFilter() === 'report'
      || (this.positionStateFilter() === 'historical' && this.historicalViewMode() === 'report');
    if (this.applicantSectionMode() === 'hiring' && !inReportView) {
      scopedRows = scopedRows.filter((row) => this.isSelectedForHiringStatus(row.status));
    }

    return scopedRows;
  });
  reportPositionScopedRows = computed(() => this.reportRows());

  activePositionsCount = computed(() =>
    this.allPositions()
      .filter((p) => p.isActive)
      .filter((p) => this.normalizePositionGroup(p.group, p.name) === this.positionGroupFilter())
      .length
  );
  inactivePositionsCount = computed(() =>
    this.allPositions()
      .filter((p) => !p.isActive)
      .filter((p) => this.normalizePositionGroup(p.group, p.name) === this.positionGroupFilter())
      .length
  );
  hiredCount = computed(() => this.reportPositionScopedRows().filter((r) => r.status === 'hired').length);
  applicantsPerDayTotal = computed(() => this.weekScopedRows().length);
  applicantsPerDayLabel = computed(() => {
    const rows = this.weekScopedRows();
    if (!rows.length) return '0.0';
    if (this.reportWeekSelection() !== 'allTime') return (rows.length / 7).toFixed(1);

    const timestamps = rows
      .map((row) => this.parseDateOnly(row.appliedDate)?.getTime() ?? 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    if (!timestamps.length) return rows.length.toFixed(1);
    const daySpan = Math.max(1, Math.floor((timestamps[timestamps.length - 1] - timestamps[0]) / 86400000) + 1);
    return (rows.length / daySpan).toFixed(1);
  });

  statusBreakdown = computed(() => {
    const order: ApplicantStatus[] = ['new', 'screening', 'interview', 'offer', 'hired', 'no response', 'no show', 'rejected'];
    return order
      .map((status) => ({
        status,
        count: this.reportRows().filter((r) => r.status === status).length
      }))
      .filter((item) => item.count > 0);
  });

  positionBreakdown = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.reportRows()) {
      const position = this.normalizePositionName(row.position) || 'Unassigned';
      map.set(position, (map.get(position) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([position, count]) => ({ position, count }))
      .sort((a, b) => b.count - a.count || a.position.localeCompare(b.position));
  });

  statusChartData = computed<ChartPoint[]>(() =>
    this.statusBreakdown().map((item) => ({ name: this.statusLabel(item.status), value: item.count }))
  );

  positionChartData = computed<ChartPoint[]>(() =>
    this.positionBreakdown().slice(0, 10).map((item) => ({ name: item.position, value: item.count }))
  );

  averageAgeLabel = computed(() => {
    const ages = this.reportRows()
      .map((r) => r.age)
      .filter((age): age is number => typeof age === 'number' && Number.isFinite(age));
    if (ages.length === 0) return '—';
    const total = ages.reduce((sum, age) => sum + age, 0);
    return (total / ages.length).toFixed(1);
  });

  maleCount = computed(() => this.reportRows().filter((r) => this.normalizeGenderBucket(r.gender) === 'male').length);
  femaleCount = computed(() => this.reportRows().filter((r) => this.normalizeGenderBucket(r.gender) === 'female').length);
  nonBinaryCount = computed(() => this.reportRows().filter((r) => this.normalizeGenderBucket(r.gender) === 'non-binary').length);

  genderBreakdown = computed(() => {
    const order: Array<{ key: string; label: string }> = [
      { key: 'male', label: 'Male' },
      { key: 'female', label: 'Female' },
      { key: 'non-binary', label: 'Non-binary' },
      { key: 'prefer not to say', label: 'Prefer not to say' },
      { key: 'unspecified', label: 'Unspecified' }
    ];
    return order
      .map((item) => ({
        label: item.label,
        count: this.reportRows().filter((r) => this.normalizeGenderBucket(r.gender) === item.key).length
      }))
      .filter((item) => item.count > 0);
  });

  genderChartData = computed<ChartPoint[]>(() =>
    this.genderBreakdown().map((item) => ({ name: item.label, value: item.count }))
  );

  ageBreakdown = computed(() => {
    const groups = [
      { label: 'Under 25', count: 0 },
      { label: '25-34', count: 0 },
      { label: '35-44', count: 0 },
      { label: '45+', count: 0 },
      { label: 'Unknown', count: 0 }
    ];

    for (const row of this.reportRows()) {
      const age = row.age;
      if (typeof age !== 'number' || !Number.isFinite(age)) {
        groups[4].count++;
      } else if (age < 25) {
        groups[0].count++;
      } else if (age < 35) {
        groups[1].count++;
      } else if (age < 45) {
        groups[2].count++;
      } else {
        groups[3].count++;
      }
    }

    return groups.filter((g) => g.count > 0);
  });

  ageScatterChartData = computed(() => {
    const series: BubbleSeriesPoint[] = this.reportRows()
      .filter((row): row is ApplicantRow & { age: number } => typeof row.age === 'number' && Number.isFinite(row.age))
      .slice(0, 80)
      .map((row, idx) => ({
        name: row.fullName || `Applicant ${idx + 1}`,
        x: idx + 1,
        y: row.age,
        r: 5
      }));
    if (series.length === 0) return [];
    return [{ name: 'Applicants', series }];
  });

  sourceBreakdown = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.reportRows()) {
      const source = this.normalizePositionName(row.source) || 'Unspecified';
      map.set(source, (map.get(source) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  });

  sourceChartData = computed<ChartPoint[]>(() =>
    this.sourceBreakdown().slice(0, 12).map((item) => ({ name: item.source, value: item.count }))
  );

  weekScopedRows = computed(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const lastWeekStart = new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate());
    const selection = this.reportWeekSelection();
    if (selection === 'allTime') return this.reportRows();
    const start = selection === 'lastWeek' ? lastWeekStart : thisWeekStart;
    const end = selection === 'lastWeek' ? lastWeekEnd : tomorrow;

    return this.reportRows().filter((row) => {
      const parsed = this.parseDateOnly(row.appliedDate);
      return !!parsed && parsed >= start && parsed < end;
    });
  });

  reportChartView = signal<[number, number]>([500, 260]);
  reportWideChartView = computed<[number, number]>(() => {
    const [w] = this.reportChartView();
    return [Math.max(w * 2 + 10, 760), 280];
  });
  chartScheme: Color = {
    name: 'applicants-chart',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#00d4ff', '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8']
  };
  pieChartScheme: Color = {
    name: 'applicants-pie',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#00d4ff', '#22c55e', '#a855f7', '#f59e0b', '#64748b']
  };
  marketBoldScheme: Color = {
    name: 'market-bold',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#00E5FF', '#00FFA3', '#7C4DFF', '#FF4D8D', '#FFC94D', '#00B8FF']
  };
  marketPieBoldScheme: Color = {
    name: 'market-pie-bold',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#00E5FF', '#00FFA3', '#FF4D8D', '#FFC94D']
  };

  tableScopeRows = computed(() => {
    const selectedPosition = this.selectedPosition();
    const sectionMode = this.applicantSectionMode();
    const mode = this.positionStateFilter();
    return this.rows().filter((r) => {
      if (mode === 'historical' && !this.isHistoricalApplicantRow(r)) return false;
      if ((mode === 'active' || mode === 'inactive') && this.isHistoricalApplicantRow(r)) return false;
      if (mode === 'active' || mode === 'inactive') {
        const isFleet = this.isFleetPosition(r.position);
        if (this.positionGroupFilter() === 'fleet' && !isFleet) return false;
        if (this.positionGroupFilter() === 'office' && isFleet) return false;
      }
      const positionPass = selectedPosition === 'all' || String(r.position || '').trim() === selectedPosition;
      if (!positionPass) return false;
      if (sectionMode === 'hiring') return this.isSelectedForHiringStatus(r.status);
      return true;
    });
  });
  positionMetricsScopeRows = computed(() => {
    const sectionMode = this.applicantSectionMode();
    const mode = this.positionStateFilter();
    return this.rows().filter((r) => {
      if (mode === 'historical' && !this.isHistoricalApplicantRow(r)) return false;
      if ((mode === 'active' || mode === 'inactive') && this.isHistoricalApplicantRow(r)) return false;
      if (mode === 'active' || mode === 'inactive') {
        const isFleet = this.isFleetPosition(r.position);
        if (this.positionGroupFilter() === 'fleet' && !isFleet) return false;
        if (this.positionGroupFilter() === 'office' && isFleet) return false;
      }
      if (sectionMode === 'hiring') return this.isSelectedForHiringStatus(r.status);
      return true;
    });
  });
  positionMetricsByKey = computed(() => {
    const map = new Map<string, PositionTableMetric>();
    const allRows = this.positionMetricsScopeRows();
    map.set('all', this.buildPositionMetric(allRows));

    for (const position of this.positionTabs()) {
      const key = this.normalizeSourceKey(position);
      if (key === 'all') continue;
      const rows = allRows.filter((row) => this.normalizeSourceKey(row.position) === key);
      map.set(key, this.buildPositionMetric(rows));
    }

    return map;
  });

  tableTotalCount = computed(() => this.tableScopeRows().length);
  tableWorkingCount = computed(() => this.tableScopeRows().filter((r) => r.status !== 'rejected').length);
  tableRejectedCount = computed(() => this.tableScopeRows().filter((r) => r.status === 'rejected').length);
  tableHiredCount = computed(() => this.tableScopeRows().filter((r) => r.status === 'hired').length);

  pipelineStatPanels = computed(() => {
    const total = this.tableTotalCount();
    const working = this.tableWorkingCount();
    const rejected = this.tableRejectedCount();
    const hired = this.tableHiredCount();
    const denom = total || 1;
    const pct = (n: number) => Math.round((n / denom) * 100);
    return [
      {
        tone: 'cyan',
        icon: 'bx-group',
        label: 'Total',
        badge: 'Pipeline',
        value: total,
        meter: 100,
        chip: 'All visible',
        soft: `${working} working`
      },
      {
        tone: 'violet',
        icon: 'bx-loader-circle',
        label: 'Working',
        badge: 'Active',
        value: working,
        meter: pct(working),
        chip: `${pct(working)}%`,
        soft: 'In process'
      },
      {
        tone: 'red',
        icon: 'bx-x-circle',
        label: 'Rejected',
        badge: 'Closed',
        value: rejected,
        meter: pct(rejected),
        chip: `${pct(rejected)}%`,
        soft: 'Closed out'
      },
      {
        tone: 'green',
        icon: 'bx-check-shield',
        label: 'Hired',
        badge: 'Won',
        value: hired,
        meter: pct(hired),
        chip: `${pct(hired)}%`,
        soft: 'Onboarded'
      }
    ];
  });

  goalGroupRows = computed(() => {
    const targetGroup = this.positionGroupFilter();
    return this.rows().filter((row) => {
      if (this.isHistoricalApplicantRow(row)) return false;
      const isFleet = this.isFleetPosition(row.position);
      return targetGroup === 'fleet' ? isFleet : !isFleet;
    });
  });
  goalSourceOptions = computed(() =>
    Array.from(
      this.goalGroupRows().reduce((map, row) => {
        const display = this.normalizeSourceDisplay(row.position);
        const key = this.normalizeSourceKey(display);
        if (!key) return map;
        if (!map.has(key)) map.set(key, display);
        return map;
      }, new Map<string, string>()).values()
    ).sort((a, b) => a.localeCompare(b))
  );
  goalScopedRows = computed(() => {
    const goal = this.applicantGoals()[0];
    if (!goal) return this.goalGroupRows();
    const positionKeys = new Set(goal.sources.map((source) => this.normalizeSourceKey(source)).filter((value) => !!value));
    if (positionKeys.size === 0) return this.goalGroupRows();
    return this.goalGroupRows().filter((row) => positionKeys.has(this.normalizeSourceKey(row.position)));
  });
  goalApplicantsTrendSeries = computed<ChartSeries[]>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const monthCounts = new Array<number>(12).fill(0);
    for (const row of this.goalScopedRows()) {
      const parsed = this.parseDateOnly(row.appliedDate);
      if (!parsed || parsed.getFullYear() !== year) continue;
      monthCounts[parsed.getMonth()]++;
    }
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return [{
      name: `${year}`,
      series: monthLabels.map((name, idx) => ({ name, value: monthCounts[idx] }))
    }];
  });
  goalSourceCountsChartData = computed<ChartPoint[]>(() => {
    const mode = this.goalSourceChartMode();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const map = new Map<string, { name: string; count: number }>();
    for (const row of this.goalScopedRows()) {
      const parsed = this.parseDateOnly(row.appliedDate);
      if (!parsed) continue;
      if (mode === 'monthly') {
        if (parsed < monthStart || parsed > now) continue;
      } else {
        if (parsed < yearStart || parsed > now) continue;
      }
      const sourceName = this.normalizeSourceDisplay(row.source) || 'Unspecified';
      const sourceKey = this.normalizeSourceKey(sourceName);
      const existing = map.get(sourceKey);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(sourceKey, { name: sourceName, count: 1 });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map((item) => ({ name: `${item.name} (${item.count})`, value: item.count }))
      .slice(0, 12);
  });
  applicantGoalSummary = computed(() => {
    const goals = this.applicantGoalProgressRows();
    return {
      goals: goals.length,
      applicants: goals.reduce((sum, g) => sum + Number(g.targetApplicants || 0), 0),
      interviews: goals.reduce((sum, g) => sum + Number(g.targetInterviews || 0), 0),
      hires: goals.reduce((sum, g) => sum + Number(g.targetHires || 0), 0),
      actualApplicants: goals.reduce((sum, g) => sum + Number(g.actualApplicants || 0), 0),
      actualInterviews: goals.reduce((sum, g) => sum + Number(g.actualInterviews || 0), 0),
      actualHires: goals.reduce((sum, g) => sum + Number(g.actualHires || 0), 0),
      overallProgress: goals.length
        ? goals.reduce((sum, g) => sum + Number(g.overallProgress || 0), 0) / goals.length
        : 0
    };
  });
  marketPressureScore = computed(() => {
    const demand = this.marketSnapshots().find((item) => item.key === 'laborDemand')?.changePct ?? 0;
    const tightness = this.marketSnapshots().find((item) => item.key === 'laborTightness')?.changePct ?? 0;
    const pay = this.marketSnapshots().find((item) => item.key === 'driverPay')?.changePct ?? 0;
    // Positive values mean harder market -> increase top-of-funnel goals.
    return (Number(demand) * 0.5) + (Number(tightness) * 0.35) + (Number(pay) * 0.15);
  });
  suggestedGoalPacks = computed<SuggestedGoalPack[]>(() => {
    const rows = this.goalGroupRows().filter((row) => !this.isHistoricalApplicantRow(row));
    const now = new Date();
    const last90 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
    const recent = rows.filter((row) => {
      const parsed = this.parseDateOnly(row.appliedDate);
      return !!parsed && parsed >= last90 && parsed <= now;
    });

    const hires90 = recent.filter((row) => row.status === 'hired').length;
    const interviews90 = recent.filter((row) => row.status === 'interview' || row.status === 'offer' || row.status === 'hired').length;
    const applicants90 = recent.length;

    const hiresMonthlyBaseline = Math.max(1, Math.round((hires90 / 90) * 30));
    const pressureFactor = Math.max(0.75, Math.min(1.45, 1 + (this.marketPressureScore() / 100)));
    const mode = this.suggestedGoalMode();
    const modeFactor = mode === 'aggressive' ? 1.2 : mode === 'conservative' ? 0.85 : 1;
    const hiresMonthly = Math.max(1, Math.round(hiresMonthlyBaseline * pressureFactor * modeFactor));

    const baseInterviewRatio = applicants90 > 0 ? (interviews90 / applicants90) : 0.35;
    const baseHireRatio = interviews90 > 0 ? (hires90 / interviews90) : 0.28;
    const interviewRatio = Math.max(0.18, Math.min(0.55, baseInterviewRatio * (1 - (this.marketPressureScore() / 220))));
    const hireRatio = Math.max(0.1, Math.min(0.45, baseHireRatio * (1 - (this.marketPressureScore() / 260))));

    const interviewsMonthly = Math.max(1, Math.round(hiresMonthly / hireRatio));
    const applicantsMonthly = Math.max(1, Math.round(interviewsMonthly / interviewRatio));

    const confidence: 'high' | 'medium' | 'low' =
      applicants90 >= 120 ? 'high'
      : applicants90 >= 45 ? 'medium'
      : 'low';
    const rationale = `Based on last 90 days (${applicants90} applicants, ${interviews90} interviews, ${hires90} hires), trucking market pressure score ${this.marketPressureScore().toFixed(1)}, and ${mode} planning mode.`;

    return [
      {
        period: 'weekly',
        applicants: Math.max(1, Math.round(applicantsMonthly / 4)),
        interviews: Math.max(1, Math.round(interviewsMonthly / 4)),
        hires: Math.max(1, Math.round(hiresMonthly / 4)),
        confidence,
        rationale
      },
      {
        period: 'monthly',
        applicants: applicantsMonthly,
        interviews: interviewsMonthly,
        hires: hiresMonthly,
        confidence,
        rationale
      },
      {
        period: 'yearly',
        applicants: applicantsMonthly * 12,
        interviews: interviewsMonthly * 12,
        hires: hiresMonthly * 12,
        confidence,
        rationale
      }
    ];
  });
  applicantGoalProgressRows = computed<ApplicantGoalProgressRow[]>(() => {
    const rows = this.goalGroupRows();
    return this.applicantGoals().map((goal) => {
      const range = this.getGoalRange(goal.period);
      const sourceKeys = new Set(goal.sources.map((source) => this.normalizeSourceKey(source)).filter((value) => !!value));
      const scoped = rows.filter((row) => {
        const parsed = this.parseDateOnly(row.appliedDate);
        if (!parsed) return false;
        if (parsed < range.start || parsed > range.end) return false;
        if (sourceKeys.size === 0) return true;
        return sourceKeys.has(this.normalizeSourceKey(row.position));
      });
      const actualApplicants = scoped.length;
      const actualInterviews = scoped.filter((row) => row.status === 'interview' || row.status === 'offer' || row.status === 'hired').length;
      const actualHires = scoped.filter((row) => row.status === 'hired').length;
      const targetApplicants = Number(goal.targetApplicants || 0) > 0
        ? Math.max(0, Math.trunc(Number(goal.targetApplicants || 0)))
        : actualApplicants;
      const applicantsProgress = this.percentProgress(actualApplicants, targetApplicants);
      const interviewsProgress = this.percentProgress(actualInterviews, goal.targetInterviews);
      const hiresProgress = this.percentProgress(actualHires, goal.targetHires);
      const overallProgress = hiresProgress;
      return {
        ...goal,
        targetApplicants,
        actualApplicants,
        actualInterviews,
        actualHires,
        applicantsProgress,
        interviewsProgress,
        hiresProgress,
        overallProgress: Math.max(0, Math.min(100, overallProgress))
      };
    });
  });
  goalComparisonItems = computed<GoalComparisonItem[]>(() => {
    const summary = this.applicantGoalSummary();
    return [
      {
        key: 'applicants',
        label: 'Applicants',
        target: Number(summary.applicants || 0),
        actual: Number(summary.actualApplicants || 0),
        progress: this.percentProgress(Number(summary.actualApplicants || 0), Number(summary.applicants || 0)),
        color: 'linear-gradient(90deg, #22d3ee, #0ea5e9)'
      },
      {
        key: 'interviews',
        label: 'Interviews',
        target: Number(summary.interviews || 0),
        actual: Number(summary.actualInterviews || 0),
        progress: this.percentProgress(Number(summary.actualInterviews || 0), Number(summary.interviews || 0)),
        color: 'linear-gradient(90deg, #a78bfa, #818cf8)'
      },
      {
        key: 'hires',
        label: 'Hires',
        target: Number(summary.hires || 0),
        actual: Number(summary.actualHires || 0),
        progress: this.percentProgress(Number(summary.actualHires || 0), Number(summary.hires || 0)),
        color: 'linear-gradient(90deg, #22c55e, #16a34a)'
      }
    ];
  });
  goalCompletionDonutStyle = computed(() => {
    const completion = Math.max(0, Math.min(100, Number(this.applicantGoalSummary().overallProgress || 0)));
    const angle = (completion / 100) * 360;
    return `conic-gradient(#22c55e 0deg ${angle}deg, rgba(148,163,184,0.25) ${angle}deg 360deg)`;
  });

  marketPipelineRows = computed(() => {
    const targetGroup = this.positionGroupFilter();
    return this.rows().filter((row) => {
      if (this.isHistoricalApplicantRow(row)) return false;
      const isFleet = this.isFleetPosition(row.position);
      return targetGroup === 'fleet' ? isFleet : !isFleet;
    });
  });
  marketPipelineCount = computed(() => this.marketPipelineRows().length);
  marketMacroTrendSeries = computed<ChartSeries[]>(() =>
    this.marketSnapshots()
      .filter((item) => item.points.length > 0)
      .map((item) => ({ name: item.label, series: item.points }))
  );
  marketPipelineVsDemandSeries = computed<ChartSeries[]>(() => {
    const demand = this.marketSnapshots().find((item) => item.key === 'laborDemand');
    if (!demand || demand.points.length === 0) return [];

    const pipelineMonthMap = new Map<string, number>();
    const pipelineQuarterMap = new Map<string, number>();
    const pipelineYearMap = new Map<string, number>();
    for (const row of this.marketPipelineRows()) {
      const parsed = this.parseDateOnly(row.appliedDate);
      if (!parsed) continue;
      const year = parsed.getFullYear();
      const month = parsed.getMonth() + 1;
      const quarter = Math.floor((month - 1) / 3) + 1;
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const quarterKey = `${year}-Q${quarter}`;
      const yearKey = `${year}`;
      pipelineMonthMap.set(monthKey, (pipelineMonthMap.get(monthKey) ?? 0) + 1);
      pipelineQuarterMap.set(quarterKey, (pipelineQuarterMap.get(quarterKey) ?? 0) + 1);
      pipelineYearMap.set(yearKey, (pipelineYearMap.get(yearKey) ?? 0) + 1);
    }

    const demandSeries = demand.points.map((point) => ({
      name: point.name,
      value: point.value
    }));
    const pipelineSeries = demand.points.map((point) => ({
      name: point.name,
      value: this.resolvePipelineValueForDemandBucket(point.name, pipelineMonthMap, pipelineQuarterMap, pipelineYearMap)
    }));

    return [
      { name: 'Applicant pipeline (monthly)', series: pipelineSeries },
      { name: 'Labor demand (BLS)', series: demandSeries }
    ];
  });
  marketPipelineVsDemandLabel = computed(() => {
    const demand = this.marketSnapshots().find((item) => item.key === 'laborDemand');
    const latestDemand = Number(demand?.latestValue ?? 0);
    if (!latestDemand || latestDemand <= 0) return '—';
    return (this.marketPipelineCount() / latestDemand).toFixed(2);
  });
  officeRegionInsights = computed<OfficeRegionInsightRow[]>(() => {
    if (this.positionGroupFilter() !== 'office') return [];
    const rows = this.marketPipelineRows();
    if (!rows.length) return [];
    const monthlySuggestion = this.suggestedGoalPacks().find((item) => item.period === 'monthly');
    const baselineApplicants = Math.max(1, Number(monthlySuggestion?.applicants ?? 1));
    const baselineInterviews = Math.max(1, Number(monthlySuggestion?.interviews ?? 1));
    const baselineHires = Math.max(1, Number(monthlySuggestion?.hires ?? 1));
    const pressure = this.marketPressureScore();
    const regionCounts = new Map<string, number>();
    for (const row of rows) {
      const region = this.regionForState(row.state);
      regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    }
    const total = rows.length;
    return Array.from(regionCounts.entries())
      .map(([region, applicants]) => {
        const sharePct = total > 0 ? (applicants / total) * 100 : 0;
        const scale = sharePct / 100;
        const marketScale = Math.max(0.8, Math.min(1.4, 1 + pressure / 160));
        const monthlyApplicantsTarget = Math.max(1, Math.round(baselineApplicants * scale * marketScale));
        const monthlyInterviewsTarget = Math.max(1, Math.round(baselineInterviews * scale * marketScale));
        const monthlyHiresTarget = Math.max(1, Math.round(baselineHires * scale * marketScale));
        const posture: OfficeRegionInsightRow['posture'] =
          sharePct >= 28 ? 'optimize'
          : pressure >= 4 ? 'expand'
          : 'hold';
        return {
          region,
          applicants,
          sharePct,
          monthlyApplicantsTarget,
          monthlyInterviewsTarget,
          monthlyHiresTarget,
          posture
        };
      })
      .sort((a, b) => b.applicants - a.applicants || a.region.localeCompare(b.region));
  });
  officeRegionChartData = computed<ChartPoint[]>(() =>
    this.officeRegionInsights().map((row) => ({ name: row.region, value: row.applicants }))
  );
  fleetDriverMarketHourly = computed(() => {
    const value = this.marketSnapshots().find((item) => item.key === 'driverPay')?.latestValue;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    return 33.5;
  });
  fleetOtrPayTargets = computed<FleetOtrPayTargetRow[]>(() => {
    const baseHourly = this.fleetDriverMarketHourly();
    const weeklyMiles = Math.max(500, Number(this.fleetOtrWeeklyMiles() || 0));
    const weeklyHours = Math.max(20, Number(this.fleetOtrHoursPerWeek() || 0));
    const tiers: Array<{ tier: FleetOtrPayTargetRow['tier']; label: string; factor: number }> = [
      { tier: 'entry', label: 'Entry OTR', factor: 0.92 },
      { tier: 'standard', label: 'Standard OTR', factor: 1.0 },
      { tier: 'premium', label: 'Premium OTR', factor: 1.14 }
    ];
    return tiers.map((item) => {
      const hourly = baseHourly * item.factor;
      const weeklyGross = hourly * weeklyHours;
      const annualGross = weeklyGross * 52;
      const cpm = weeklyGross / weeklyMiles;
      return {
        tier: item.tier,
        label: item.label,
        hourly,
        weeklyGross,
        annualGross,
        cpm
      };
    });
  });
  fleetOtrFullyLoadedWeekly = computed(() => {
    const standard = this.fleetOtrPayTargets().find((row) => row.tier === 'standard');
    const benefitsLoad = Math.max(0, Number(this.fleetOtrBenefitsLoadPct() || 0));
    if (!standard) return 0;
    return standard.weeklyGross * (1 + benefitsLoad / 100);
  });
  marketMomentumChartData = computed<ChartPoint[]>(() => {
    const order: BlsMarketKey[] = ['driverPay', 'laborDemand', 'laborTightness', 'inflation', 'insuranceCost'];
    return order.map((key) => {
      const row = this.marketSnapshots().find((item) => item.key === key);
      const pct = Number(row?.changePct ?? 0);
      const name = row?.label || key;
      return { name, value: Number.isFinite(pct) ? Number(pct.toFixed(2)) : 0 };
    });
  });
  marketIndicatorMixChartData = computed<ChartPoint[]>(() => {
    const rows = this.marketSnapshots()
      .map((row) => ({ name: row.label, value: Math.abs(Number(row.changePct ?? 0)) }))
      .filter((row) => Number.isFinite(row.value) && row.value > 0);
    if (!rows.length) return [];
    const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
    return rows.map((row) => ({ name: row.name, value: Number(((row.value / total) * 100).toFixed(1)) }));
  });
  marketAuditTrendSeries = computed<ChartSeries[]>(() => {
    const records = [...this.marketAuditRows()]
      .filter((row) => !!row.savedAt)
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
      .slice(-16);
    if (!records.length) return [];
    return [
      {
        name: 'Pipeline',
        series: records.map((row) => ({ name: this.shortDateLabel(row.savedAt), value: Number(row.pipelineCount || 0) }))
      },
      {
        name: 'Driver Pay',
        series: records.map((row) => ({ name: this.shortDateLabel(row.savedAt), value: Number(row.driverPay || 0) }))
      }
    ];
  });

  filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const selectedPosition = this.selectedPosition();
    const mode = this.positionStateFilter();
    const sectionMode = this.applicantSectionMode();
    const stateMap = new Map<string, boolean>();
    for (const p of this.allPositions()) {
      stateMap.set(p.name.toLowerCase(), !!p.isActive);
    }
    const pipeline = this.pipelineFilter();
    return this.rows().filter((r) => {
      const normalizedPosition = String(r.position || '').trim();
      const key = normalizedPosition.toLowerCase();
      const isActivePosition = normalizedPosition ? (stateMap.get(key) ?? true) : false;

      // Apply Active/Inactive mode to the All Positions view.
      // This ensures each tab shows only its related position data.
      if (selectedPosition === 'all') {
        if (mode === 'active' && !isActivePosition) return false;
        if (mode === 'inactive' && isActivePosition) return false;
      }
      if (mode === 'historical' && !this.isHistoricalApplicantRow(r)) return false;
      if ((mode === 'active' || mode === 'inactive') && this.isHistoricalApplicantRow(r)) return false;
      if (mode === 'active' || mode === 'inactive') {
        const isFleet = this.isFleetPosition(normalizedPosition);
        if (this.positionGroupFilter() === 'fleet' && !isFleet) return false;
        if (this.positionGroupFilter() === 'office' && isFleet) return false;
      }

      if (sectionMode === 'hiring' && !this.isSelectedForHiringStatus(r.status)) return false;

      const pipelinePass = sectionMode === 'hiring'
        ? true
        : pipeline === 'working'
          ? (r.status !== 'rejected' && r.status !== 'hired')
          : pipeline === 'rejected'
            ? r.status === 'rejected'
            : r.status === 'hired';
      if (!pipelinePass) return false;
      const statusPass = status === 'all' || r.status === status;
      if (!statusPass) return false;
      const positionPass = selectedPosition === 'all' || normalizedPosition === selectedPosition;
      if (!positionPass) return false;
      if (!term) return true;
      return [r.fullName, r.position, r.source, r.notes].some((v) => String(v || '').toLowerCase().includes(term));
    });
  });

  ngOnInit(): void {
    try {
      const raw = localStorage.getItem(this.localFallbackPositionsStorageKey);
      if (raw) {
        this.customPositions.set(this.parsePositionPayload(JSON.parse(raw)));
      }
    } catch {
      // no-op
    }
    this.restoreApplicantGoals();
    this.restoreMarketSeriesDraft();
    this.restoreMarketControlsFromLocal();
    void this.restoreMarketStateFromDatabase();

    if (this.isLegacyImportDone()) {
      this.attemptedLegacyImport = true;
    }
    void this.loadSharedApplicants();
    void this.loadSharedPositions();
    this.applicantsRefreshTimer = setInterval(() => void this.loadSharedApplicants(), 15000);
    this.positionsRefreshTimer = setInterval(() => void this.loadSharedPositions(), 15000);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  ngOnDestroy(): void {
    if (this.applicantsRefreshTimer) clearInterval(this.applicantsRefreshTimer);
    if (this.positionsRefreshTimer) clearInterval(this.positionsRefreshTimer);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  openCreate(): void {
    this.draft = this.emptyDraft();
    if (this.positionStateFilter() === 'historical') {
      const now = new Date();
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      this.draft.appliedDate = lastDayPrevMonth.toISOString().slice(0, 10);
    }
    this.showCreate.set(true);
  }

  openEdit(row: ApplicantRow): void {
    this.editTargetId.set(row.id);
    this.editDraft = {
      fullName: row.fullName,
      gender: row.gender,
      age: row.age,
      position: row.position,
      source: row.source,
      state: row.state,
      trainingGroupAssignment: row.trainingGroupAssignment,
      status: row.status,
      isHistorical: row.isHistorical,
      appliedDate: row.appliedDate,
      notes: row.notes,
      cvFileName: row.cvFileName,
      cvDataUrl: row.cvDataUrl,
      hasCv: row.hasCv
    };
    this.showEdit.set(true);
  }

  async saveDraft(): Promise<void> {
    const fullName = String(this.draft.fullName || '').trim();
    if (!fullName) return;
    const position = String(this.draft.position || '').trim();
    const isHistoricalEntry = this.positionStateFilter() === 'historical';
    const payload = {
      fullName,
      gender: this.normalizePositionName(this.draft.gender) || null,
      age: this.normalizeAge(this.draft.age),
      position: position || null,
      source: String(this.draft.source || '').trim() || null,
      state: String(this.draft.state || '').trim() || null,
      trainingGroupAssignment: String(this.draft.trainingGroupAssignment || '').trim() || null,
      status: this.draft.status || 'new',
      isHistorical: isHistoricalEntry,
      appliedDate: this.toIsoDateOnly(this.draft.appliedDate) || null,
      notes: String(this.draft.notes || '').trim() || null,
      cvFileName: String(this.draft.cvFileName || '').trim() || null,
      cvDataUrl: String(this.draft.cvDataUrl || '').trim() || null
    };

    try {
      const res = await firstValueFrom(
        this.http.post<{ data?: unknown }>(`${this.apiUrl}/api/v1/applicants/records`, payload)
      );
      const created = this.parseApplicantPayload(res?.data ? [res.data] : []);
      if (created.length > 0) {
        this.rows.update((list) => [created[0], ...list.filter((r) => r.id !== created[0].id)]);
      } else {
        await this.loadSharedApplicants();
      }
      this.applicantsSyncError.set('');
    } catch {
      this.applicantsSyncError.set('Unable to save applicant to shared database right now.');
      return;
    }

    if (position && !isHistoricalEntry) await this.addCustomPosition(position, true, true);
    this.showCreate.set(false);
  }

  async setStatus(id: number, status: ApplicantStatus): Promise<void> {
    this.rows.update((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await firstValueFrom(
        this.http.put(`${this.apiUrl}/api/v1/applicants/records/${id}/status`, { status })
      );
      this.applicantsSyncError.set('');
    } catch {
      // If API update fails, pull latest DB state.
      this.applicantsSyncError.set('Unable to update applicant status in database.');
      await this.loadSharedApplicants();
    }
  }

  async sendToRejected(id: number): Promise<void> {
    await this.setStatus(id, 'rejected');
  }

  async returnToActive(id: number): Promise<void> {
    await this.setStatus(id, 'new');
  }

  async saveEdit(): Promise<void> {
    const id = this.editTargetId();
    if (!id) return;

    const fullName = String(this.editDraft.fullName || '').trim();
    if (!fullName) return;

    const payload = {
      fullName,
      gender: this.normalizePositionName(this.editDraft.gender) || null,
      age: this.normalizeAge(this.editDraft.age),
      position: this.normalizePositionName(this.editDraft.position) || null,
      source: this.normalizePositionName(this.editDraft.source) || null,
      state: this.normalizePositionName(this.editDraft.state) || null,
      trainingGroupAssignment: this.normalizePositionName(this.editDraft.trainingGroupAssignment) || null,
      status: this.normalizeStatus(this.editDraft.status),
      isHistorical: this.toBoolean(this.editDraft.isHistorical, false),
      appliedDate: this.toIsoDateOnly(this.editDraft.appliedDate) || null,
      notes: this.normalizePositionName(this.editDraft.notes) || null,
      cvFileName: this.normalizePositionName(this.editDraft.cvFileName) || null,
      cvDataUrl: this.normalizePositionName(this.editDraft.cvDataUrl) || null
    };

    try {
      await firstValueFrom(
        this.http.put(`${this.apiUrl}/api/v1/applicants/records/${id}`, payload)
      );
      await this.loadSharedApplicants();
      this.showEdit.set(false);
      this.applicantsSyncError.set('');
    } catch {
      this.applicantsSyncError.set('Unable to save applicant changes to database.');
    }
  }

  async deleteApplicant(id: number): Promise<void> {
    const ok = typeof window !== 'undefined'
      ? window.confirm('Delete this applicant?')
      : true;
    if (!ok) return;

    try {
      await firstValueFrom(
        this.http.delete(`${this.apiUrl}/api/v1/applicants/records/${id}`)
      );
      this.rows.update((list) => list.filter((r) => r.id !== id));
      this.ensureSelectedApplicantValid();
      this.applicantsSyncError.set('');
      this.markLegacyImportDone();
    } catch {
      this.applicantsSyncError.set('Unable to delete applicant from database. The row will reappear on the next sync.');
      await this.loadSharedApplicants();
    }
  }

  selectApplicant(id: number): void {
    this.selectedApplicantId.set(id);
  }

  onApplicantRowClick(row: ApplicantRow): void {
    this.selectApplicant(row.id);
    if (this.pipelineFilter() !== 'hired') return;
    if (row.status !== 'hired') return;
    this.hiredDetailsTrainingGroupAssignment.set(row.trainingGroupAssignment || '');
    this.showHiredDetails.set(true);
  }

  selectPosition(position: string): void {
    this.selectedPosition.set(position);
  }

  positionMetric(position: string): PositionTableMetric {
    const key = this.normalizeSourceKey(position);
    return this.positionMetricsByKey().get(key) ?? this.buildPositionMetric([]);
  }

  isPositionActive(position: string): boolean {
    if (String(position || '').trim().toLowerCase() === 'all') return true;
    const normalized = String(position || '').trim().toLowerCase();
    const match = this.allPositions().find((p) => String(p?.name || '').trim().toLowerCase() === normalized);
    return !!(match?.isActive ?? false);
  }

  setPositionStateFilter(mode: 'active' | 'inactive' | 'historical' | 'report' | 'goals' | 'market'): void {
    this.positionStateFilter.set(mode);
    this.selectedPosition.set(this.getDefaultPositionSelection(mode));
    if (mode === 'historical') this.historicalViewMode.set('applicants');
    if (mode === 'market') void this.loadMarketIntelligence();
  }

  setMarketSeriesId(key: BlsMarketKey, value: string): void {
    this.marketPresetKey.set('custom');
    this.marketSeriesDraft = { ...this.marketSeriesDraft, [key]: String(value || '').trim().toUpperCase() };
  }

  async applyMarketPreset(presetKey: string): Promise<void> {
    const key = String(presetKey || '').trim();
    if (!key || key === 'custom') {
      this.marketPresetKey.set('custom');
      return;
    }
    const preset = this.marketPresetOptions.find((item) => item.key === key);
    if (!preset) {
      this.marketPresetKey.set('custom');
      return;
    }
    this.marketPresetKey.set(preset.key);
    this.marketSeriesDraft = { ...preset.seriesDraft };
    await this.saveMarketSeriesDraft();
  }

  setSuggestedGoalMode(mode: SuggestedGoalMode): void {
    this.suggestedGoalMode.set(mode);
    void this.persistMarketControlsToStorageAndDatabase();
  }

  setFleetOtrWeeklyMiles(value: unknown): void {
    const numeric = Number(value);
    this.fleetOtrWeeklyMiles.set(Number.isFinite(numeric) && numeric > 0 ? numeric : 2800);
    void this.persistMarketControlsToStorageAndDatabase();
  }

  setFleetOtrHoursPerWeek(value: unknown): void {
    const numeric = Number(value);
    this.fleetOtrHoursPerWeek.set(Number.isFinite(numeric) && numeric > 0 ? numeric : 60);
    void this.persistMarketControlsToStorageAndDatabase();
  }

  setFleetOtrBenefitsLoadPct(value: unknown): void {
    const numeric = Number(value);
    this.fleetOtrBenefitsLoadPct.set(Number.isFinite(numeric) && numeric >= 0 ? numeric : 18);
    void this.persistMarketControlsToStorageAndDatabase();
  }

  setMarketPresentationMode(mode: MarketPresentationMode): void {
    this.marketPresentationMode.set(mode === 'executive' ? 'executive' : 'neon');
    void this.persistMarketControlsToStorageAndDatabase();
  }

  async saveMarketSeriesDraft(): Promise<void> {
    try {
      localStorage.setItem(this.localMarketSeriesStorageKey, JSON.stringify(this.marketSeriesDraft));
      localStorage.setItem(this.localMarketPresetStorageKey, this.marketPresetKey());
      await firstValueFrom(this.userSettings.set(this.dbMarketSeriesSettingsKey, {
        presetKey: this.marketPresetKey(),
        seriesDraft: this.marketSeriesDraft
      }));
      await this.persistMarketControlsToStorageAndDatabase();
      this.marketError.set('');
      if (this.positionStateFilter() === 'market') {
        void this.loadMarketIntelligence();
      }
    } catch {
      this.marketError.set('Unable to save market series IDs locally.');
    }
  }

  async loadMarketIntelligence(): Promise<void> {
    const ids = Array.from(
      new Set(
        ([...Object.values(this.marketSeriesDraft), ...Object.values(this.marketSeriesFallback)] as string[])
          .map((value) => String(value || '').trim())
          .filter((value) => !!value)
      )
    );
    if (!ids.length) {
      this.marketError.set('Add at least one BLS series ID to load market intelligence.');
      return;
    }

    const nowYear = new Date().getFullYear();
    this.marketLoading.set(true);
    this.marketError.set('');
    try {
      const response = await firstValueFrom(
        this.http.post<{ ok?: boolean; message?: string; series?: unknown }>(`${this.apiUrl}/api/v1/integrations/bls/series`, {
          seriesIds: ids,
          startYear: String(nowYear - 5),
          endYear: String(nowYear)
        })
      );

      if (!response?.ok) {
        this.marketSnapshots.set([]);
        this.marketError.set(response?.message || 'Unable to load BLS series data.');
        return;
      }

      const snapshots = this.buildMarketSnapshots(response?.series);
      this.marketSnapshots.set(snapshots);
      this.marketLastUpdated.set(new Date().toISOString());
      await this.persistMarketSnapshotsToDatabase();
      await this.appendMarketAuditEntryAndPersist();
    } catch (err) {
      const details = err instanceof HttpErrorResponse
        ? String(err.error?.message || err.message || 'Request failed')
        : 'Request failed';
      this.marketError.set(`Unable to load BLS market data: ${details}`);
      this.marketSnapshots.set([]);
    } finally {
      this.marketLoading.set(false);
    }
  }

  marketSnapshotValue(key: BlsMarketKey): string {
    const snapshot = this.marketSnapshots().find((item) => item.key === key);
    return this.formatMarketNumber(snapshot?.latestValue ?? null);
  }

  marketSnapshotDelta(key: BlsMarketKey): string {
    const snapshot = this.marketSnapshots().find((item) => item.key === key);
    if (!snapshot) return 'No data';
    if (snapshot.changePct === null || !Number.isFinite(snapshot.changePct)) return 'Insufficient history';
    const trend = snapshot.changePct >= 0 ? 'up' : 'down';
    return `${this.formatMarketChange(snapshot.changePct)} vs prior (${trend})`;
  }

  formatMarketNumber(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—';
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  formatMarketChange(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }

  formatCurrency(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—';
    return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  }

  formatCpm(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—';
    return `${this.formatCurrency(value)}/mi`;
  }

  private shortDateLabel(iso: string): string {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
  }

  setPositionGroupFilter(mode: 'office' | 'fleet'): void {
    this.positionGroupFilter.set(mode);
    this.selectedPosition.set(this.getDefaultPositionSelection());
    if (this.applicantSectionMode() === 'hiring' && !this.isSelectedForHiringStatus(this.statusFilter() as ApplicantStatus)) {
      this.statusFilter.set('all');
    }
  }

  addApplicantGoal(): void {
    if (this.applicantGoals().length > 0) {
      const existingId = this.applicantGoals()[0]?.id;
      if (existingId) this.editingGoalIds.update((ids) => (ids.includes(existingId) ? ids : [existingId, ...ids]));
      return;
    }
    const nextId = this.applicantGoals().reduce((max, g) => Math.max(max, Number(g.id || 0)), 0) + 1;
    const defaultSource = this.goalSourceOptions()[0] || '';
    this.applicantGoals.update((list) => [
      {
        id: nextId,
        sources: defaultSource ? [defaultSource] : [],
        period: 'weekly',
        targetApplicants: 0,
        targetInterviews: 0,
        targetHires: 0,
        notes: '',
        updatedAt: new Date().toISOString()
      },
      ...list
    ]);
    this.editingGoalIds.update((ids) => (ids.includes(nextId) ? ids : [nextId, ...ids]));
    this.persistApplicantGoals();
  }

  applySuggestedGoal(period: GoalPeriod): void {
    const suggestion = this.suggestedGoalPacks().find((item) => item.period === period);
    if (!suggestion) return;
    if (this.applicantGoals().length === 0) {
      this.addApplicantGoal();
    }
    const targetId = this.applicantGoals()[0]?.id;
    if (!targetId) return;

    this.applicantGoals.update((list) =>
      list.map((goal) =>
        goal.id !== targetId
          ? goal
          : {
              ...goal,
              period,
              targetApplicants: suggestion.applicants,
              targetInterviews: suggestion.interviews,
              targetHires: suggestion.hires,
              notes: `System suggested from trucking market data. ${suggestion.rationale}`.trim(),
              updatedAt: new Date().toISOString()
            }
      )
    );
    this.persistApplicantGoals();
  }

  confidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
    if (confidence === 'high') return 'High confidence';
    if (confidence === 'medium') return 'Medium confidence';
    return 'Low confidence';
  }

  updateApplicantGoal(id: number, field: keyof ApplicantGoal, value: unknown): void {
    this.applicantGoals.update((list) =>
      list.map((goal) => {
        if (goal.id !== id) return goal;
        const next = { ...goal, updatedAt: new Date().toISOString() };
        if (field === 'notes') {
          (next as any)[field] = String(value ?? '').trim();
        } else if (field === 'period') {
          next.period = value === 'monthly' ? 'monthly' : value === 'yearly' ? 'yearly' : 'weekly';
        } else if (field === 'targetApplicants' || field === 'targetInterviews' || field === 'targetHires') {
          const num = Number(value);
          (next as any)[field] = Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
        }
        return next;
      })
    );
    this.persistApplicantGoals();
  }

  removeApplicantGoal(id: number): void {
    this.applicantGoals.update((list) => list.filter((goal) => goal.id !== id));
    this.editingGoalIds.update((ids) => ids.filter((item) => item !== id));
    this.goalSourceDrafts.update((drafts) => {
      const next = { ...drafts };
      delete next[id];
      return next;
    });
    this.persistApplicantGoals();
  }

  isGoalEditing(id: number): boolean {
    return this.editingGoalIds().includes(id);
  }

  toggleGoalEditing(id: number): void {
    this.editingGoalIds.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
    );
  }

  goalSourceDraft(id: number): string {
    return this.goalSourceDrafts()[id] || '';
  }

  setGoalSourceDraft(id: number, value: unknown): void {
    const normalized = this.normalizeSourceDisplay(value);
    this.goalSourceDrafts.update((drafts) => ({ ...drafts, [id]: normalized }));
  }

  addGoalSource(id: number): void {
    const source = this.goalSourceDraft(id);
    if (!source) return;
    this.applicantGoals.update((list) =>
      list.map((goal) => {
        if (goal.id !== id) return goal;
        const existing = new Set(goal.sources.map((item) => this.normalizeSourceKey(item)));
        if (existing.has(this.normalizeSourceKey(source))) return goal;
        return { ...goal, sources: [...goal.sources, source], updatedAt: new Date().toISOString() };
      })
    );
    this.goalSourceDrafts.update((drafts) => ({ ...drafts, [id]: '' }));
    this.persistApplicantGoals();
  }

  removeGoalSource(id: number, source: string): void {
    const normalized = this.normalizeSourceKey(source);
    this.applicantGoals.update((list) =>
      list.map((goal) =>
        goal.id !== id
          ? goal
          : {
              ...goal,
              sources: goal.sources.filter((item) => this.normalizeSourceKey(item) !== normalized),
              updatedAt: new Date().toISOString()
            }
      )
    );
    this.persistApplicantGoals();
  }

  goalSourceLabel(sources: string[]): string {
    if (!Array.isArray(sources) || sources.length === 0) return 'All Positions';
    return sources.join(', ');
  }

  setPipelineFilter(mode: 'working' | 'rejected' | 'hired'): void {
    this.pipelineFilter.set(mode);
    this.selectedApplicantId.set(null);
    this.showHiredDetails.set(false);
  }

  setApplicantSectionMode(mode: 'application' | 'hiring'): void {
    this.applicantSectionMode.set(mode);
    if (mode === 'hiring' && !this.isSelectedForHiringStatus(this.statusFilter() as ApplicantStatus)) {
      this.statusFilter.set('all');
    }
    this.selectedApplicantId.set(null);
    this.showHiredDetails.set(false);
  }

  selectApplicantsTopMode(mode: 'application' | 'hiring'): void {
    if (this.positionStateFilter() !== 'active' && this.positionStateFilter() !== 'inactive') {
      this.setPositionStateFilter('active');
    }
    this.setApplicantSectionMode(mode);
  }

  async saveHiredDetails(): Promise<void> {
    const id = this.selectedApplicantId();
    if (!id) return;
    const row = this.rows().find((item) => item.id === id);
    if (!row) return;
    const trainingGroupAssignment = this.normalizePositionName(this.hiredDetailsTrainingGroupAssignment());
    const payload = {
      fullName: this.normalizePositionName(row.fullName) || '',
      gender: this.normalizePositionName(row.gender) || null,
      age: this.normalizeAge(row.age),
      position: this.normalizePositionName(row.position) || null,
      source: this.normalizePositionName(row.source) || null,
      trainingGroupAssignment: trainingGroupAssignment || null,
      status: this.normalizeStatus(row.status),
      appliedDate: this.toIsoDateOnly(row.appliedDate) || null,
      notes: this.normalizePositionName(row.notes) || null,
      cvFileName: this.normalizePositionName(row.cvFileName) || null,
      cvDataUrl: this.normalizePositionName(row.cvDataUrl) || null
    };
    try {
      await firstValueFrom(this.http.put(`${this.apiUrl}/api/v1/applicants/records/${id}`, payload));
      this.rows.update((list) =>
        list.map((item) => (item.id === id ? { ...item, trainingGroupAssignment: trainingGroupAssignment || '' } : item))
      );
      this.showHiredDetails.set(false);
      this.applicantsSyncError.set('');
    } catch {
      this.applicantsSyncError.set('Unable to save hired applicant details.');
    }
  }

  statusLabel(status: ApplicantStatus): string {
    if (status === 'no response') return 'No Response';
    if (status === 'no show') return 'No Show';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  openAddPosition(): void {
    this.newPositionName.set('');
    this.newPositionColor.set('#38BDF8');
    this.showAddPosition.set(true);
  }

  async addPosition(): Promise<void> {
    const value = String(this.newPositionName() || '').trim();
    if (!value) return;
    const color = this.normalizeColorHex(this.newPositionColor());
    await this.addCustomPosition(value, true, true, color, this.normalizePositionGroup(null, value));
    this.positionStateFilter.set('active');
    this.selectedPosition.set(value);
    this.newPositionName.set('');
    this.newPositionColor.set('#38BDF8');
    this.showAddPosition.set(false);
  }

  openPositionSettings(position: string, event: MouseEvent): void {
    event.stopPropagation();
    const target = this.allPositions().find((p) => p.name.toLowerCase() === position.toLowerCase());
    this.positionSettingsOriginalName.set(position);
    this.positionSettingsTargetName.set(position);
    this.positionSettingsTargetActive.set(target?.isActive ?? true);
    this.positionSettingsTargetColor.set(this.normalizeColorHex(target?.color) || '#38BDF8');
    this.positionSettingsTargetGroup.set(this.normalizePositionGroup(target?.group, target?.name || position));
    this.showPositionSettings.set(true);
  }

  async savePositionSettings(): Promise<void> {
    const newName = this.normalizePositionName(this.positionSettingsTargetName());
    if (!newName) return;
    const currentName = this.normalizePositionName(this.positionSettingsOriginalName());
    if (!currentName) return;
    const isActive = this.positionSettingsTargetActive();
    const color = this.normalizeColorHex(this.positionSettingsTargetColor());
    const group = this.positionSettingsTargetGroup();

    this.customPositions.update((list) => {
      const idx = list.findIndex((p) => p.name.toLowerCase() === currentName.toLowerCase());
      if (idx < 0) return list;
      const next = [...list];
      next[idx] = { ...next[idx], name: newName, isActive, color, group };
      return next;
    });
    this.persistLocalPositions();

    try {
      const res = await firstValueFrom(
        this.http.put<{ data?: unknown[] }>(
          `${this.apiUrl}/api/v1/applicants/positions`,
          { currentName, newName, isActive, color, group }
        )
      );
      this.customPositions.set(this.parsePositionPayload(res?.data));
      this.persistLocalPositions();
    } catch {
      // keep local state if API is temporarily unavailable
    }

    if (this.selectedPosition().toLowerCase() === currentName.toLowerCase()) {
      this.selectedPosition.set(!isActive ? 'all' : newName);
    }
    if (!isActive && this.selectedPosition().toLowerCase() === newName.toLowerCase()) {
      this.selectedPosition.set('all');
    }
    this.showPositionSettings.set(false);
  }

  async deletePositionTab(): Promise<void> {
    const name = this.normalizePositionName(this.positionSettingsOriginalName() || this.positionSettingsTargetName());
    if (!name) return;

    const ok = typeof window !== 'undefined'
      ? window.confirm(`Delete position "${name}"? This will remove it from tabs and clear it from applicants.`)
      : true;
    if (!ok) return;

    try {
      const encoded = encodeURIComponent(name);
      const res = await firstValueFrom(
        this.http.delete<{ data?: unknown[] }>(`${this.apiUrl}/api/v1/applicants/positions/${encoded}`)
      );
      this.customPositions.set(this.parsePositionPayload(res?.data));
      this.persistLocalPositions();
      if (this.selectedPosition().toLowerCase() === name.toLowerCase()) {
        this.selectedPosition.set('all');
      }
      await this.loadSharedApplicants();
      this.showPositionSettings.set(false);
      this.applicantsSyncError.set('');
    } catch {
      this.applicantsSyncError.set('Unable to delete position tab from database.');
    }
  }

  private emptyDraft() {
    return {
      fullName: '',
      gender: '',
      age: null as number | null,
      position: '',
      source: '',
      state: '',
      trainingGroupAssignment: '',
      isHistorical: false,
      appliedDate: new Date().toISOString().slice(0, 10),
      notes: '',
      cvFileName: '',
      cvDataUrl: '',
      hasCv: false
    };
  }

  onCvSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Keep local storage payload manageable for this prototype.
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.draft.cvFileName = file.name;
      this.draft.cvDataUrl = typeof reader.result === 'string' ? reader.result : '';
      this.draft.hasCv = !!this.draft.cvDataUrl;
    };
    reader.readAsDataURL(file);
  }

  onEditCvSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.editDraft.cvFileName = file.name;
      this.editDraft.cvDataUrl = typeof reader.result === 'string' ? reader.result : '';
      this.editDraft.hasCv = !!this.editDraft.cvDataUrl;
    };
    reader.readAsDataURL(file);
  }

  async viewCv(row: ApplicantRow): Promise<void> {
    let cvDataUrl = row.cvDataUrl;
    let cvFileName = row.cvFileName;

    if (!cvDataUrl && row.hasCv) {
      const loaded = await this.fetchApplicantCv(row.id);
      if (!loaded) {
        this.applicantsSyncError.set('Unable to load CV file for this applicant.');
        return;
      }
      cvDataUrl = loaded.cvDataUrl;
      cvFileName = loaded.cvFileName || cvFileName;
    }

    if (!cvDataUrl) {
      this.applicantsSyncError.set('No CV is available for this applicant.');
      return;
    }

    const parsed = this.parseDataUrlMetadata(cvDataUrl);
    const objectUrl = this.toObjectUrl(cvDataUrl, parsed?.mimeType);
    if (!objectUrl || !parsed) {
      this.applicantsSyncError.set('Unable to open CV. Invalid or unsupported file data.');
      return;
    }

    const title = this.escapeHtml(cvFileName || 'CV');
    const safeName = this.escapeHtml(cvFileName || 'cv-file');
    const mime = parsed.mimeType.toLowerCase();

    // Render a lightweight viewer page first, then embed/open the blob URL.
    // This avoids top-frame data: navigation and provides download fallback.
    try {
      const w = window.open('', '_blank');
      if (!w) {
        URL.revokeObjectURL(objectUrl);
        this.applicantsSyncError.set('Popup blocked. Please allow popups to view CV files.');
        return;
      }

      const canPreviewInline =
        mime.startsWith('application/pdf') ||
        mime.startsWith('image/') ||
        mime.startsWith('text/');

      w.document.open();
      w.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${title}</title>
            <style>
              html, body { margin: 0; height: 100%; background: #0b1020; color: #e5e7eb; font-family: Arial, sans-serif; }
              .bar { height: 46px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid #243049; background: #0f172a; }
              .name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; color: #cbd5e1; }
              .btn { text-decoration: none; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; padding: 6px 10px; border-radius: 8px; font-size: 12px; }
              .btn.primary { background: #0ea5e9; border-color: #0284c7; color: #00111a; font-weight: 700; }
              .viewer { height: calc(100% - 47px); }
              iframe, object, img { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
              img { object-fit: contain; background: #0b1020; }
              .fallback { padding: 24px; color: #cbd5e1; }
            </style>
          </head>
          <body>
            <div class="bar">
              <div class="name">${title}</div>
              <a class="btn primary" href="${objectUrl}" target="_self">Open File</a>
              <a class="btn" href="${objectUrl}" download="${safeName}">Download</a>
            </div>
            <div class="viewer">
              ${canPreviewInline
                ? (mime.startsWith('image/')
                  ? `<img src="${objectUrl}" alt="${title}" />`
                  : `<iframe src="${objectUrl}" title="${title}"></iframe>`)
                : `<div class="fallback">Preview is unavailable for this file type. Use <strong>Open File</strong> or <strong>Download</strong>.</div>`}
            </div>
          </body>
        </html>
      `);
      w.document.close();
      this.applicantsSyncError.set('');

      // Keep URL alive long enough for built-in viewers to finish loading.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60_000);
    } catch {
      URL.revokeObjectURL(objectUrl);
      this.applicantsSyncError.set('Unable to open CV in a new tab.');
    }
  }

  private toObjectUrl(dataUrl: string, mimeType?: string): string | null {
    const blob = this.dataUrlToBlob(dataUrl, mimeType);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  private parseDataUrlMetadata(dataUrl: string): { mimeType: string; isBase64: boolean } | null {
    const raw = String(dataUrl || '').trim();
    if (!raw.toLowerCase().startsWith('data:')) return null;
    const commaIndex = raw.indexOf(',');
    if (commaIndex <= 5) return null;
    const metadata = raw.slice(5, commaIndex);
    const metadataParts = metadata.split(';').map((x) => x.trim()).filter(Boolean);
    const mimeType = metadataParts.length > 0 ? metadataParts[0] : 'application/octet-stream';
    const isBase64 = metadataParts.some((part) => part.toLowerCase() === 'base64');
    return { mimeType, isBase64 };
  }

  private dataUrlToBlob(dataUrl: string, mimeTypeHint?: string): Blob | null {
    try {
      const raw = String(dataUrl || '').trim();
      if (!raw.toLowerCase().startsWith('data:')) return null;

      const commaIndex = raw.indexOf(',');
      if (commaIndex <= 5) return null;

      const payload = raw.slice(commaIndex + 1);
      const metadata = this.parseDataUrlMetadata(raw);
      const mimeType = mimeTypeHint || metadata?.mimeType || 'application/octet-stream';
      const isBase64 = !!metadata?.isBase64;

      if (isBase64) {
        const bin = atob(payload);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: mimeType });
      }

      const textPayload = decodeURIComponent(payload);
      return new Blob([textPayload], { type: mimeType });
    } catch {
      return null;
    }
  }

  private async addCustomPosition(position: string, isActive = true, syncToApi = false, color?: string | null, group?: PositionGroup | null): Promise<void> {
    const normalized = this.normalizePositionName(position);
    if (!normalized) return;
    const normalizedColor = this.normalizeColorHex(color);
    const normalizedGroup = this.normalizePositionGroup(group, normalized);
    this.customPositions.update((list) => {
      const idx = list.findIndex((p) => p.name.toLowerCase() === normalized.toLowerCase());
      if (idx >= 0) {
        const next = [...list];
        next[idx] = { ...next[idx], isActive, color: normalizedColor ?? next[idx].color ?? null, group: normalizedGroup };
        return next;
      }
      return [...list, { name: normalized, isActive, color: normalizedColor ?? null, group: normalizedGroup }]
        .sort((a, b) => a.name.localeCompare(b.name));
    });
    this.persistLocalPositions();

    if (!syncToApi) return;

    try {
      const res = await firstValueFrom(
        this.http.post<{ data?: unknown[] }>(`${this.apiUrl}/api/v1/applicants/positions`, { name: normalized, color: normalizedColor, group: normalizedGroup })
      );
      this.customPositions.set(this.parsePositionPayload(res?.data));
      this.persistLocalPositions();
    } catch {
      // keep local fallback list when API is temporarily unavailable
    }
  }

  private async loadSharedPositions(): Promise<void> {
    try {
      const res = await this.requestWith502Retry(
        () => this.http.get<{ data?: unknown[] }>(`${this.apiUrl}/api/v1/applicants/positions`),
        2,
        700
      );
      this.customPositions.set(this.parsePositionPayload(res?.data));
      this.persistLocalPositions();
      this.ensureSelectedPositionValid();
    } catch (err) {
      const httpErr = err as HttpErrorResponse | undefined;
      if (httpErr?.status === 502) {
        this.applicantsSyncError.set('Gateway is temporarily unavailable. Retrying shortly may resolve it.');
      }
      // If API fails, keep local fallback positions loaded in ngOnInit.
    }
  }

  private async loadSharedApplicants(): Promise<void> {
    try {
      const res = await this.requestWith502Retry(
        () => this.http.get<{ data?: unknown[] }>(`${this.apiUrl}/api/v1/applicants/records?includeCv=false`),
        2,
        700
      );
      const parsed = this.parseApplicantPayload(res?.data);
      this.rows.set(parsed);
      this.ensureSelectedApplicantValid();
      this.applicantsSyncError.set('');
      this.attemptedLegacyImport = true;

      // One-time bridge for older local-only applicant entries (never re-run when table is empty after deletes).
      if (parsed.length === 0 && !this.isLegacyImportDone()) {
        await this.importLegacyApplicantsToDb();
      }
    } catch (err) {
      // Keep current rows if API is temporarily unavailable.
      const httpErr = err as HttpErrorResponse | undefined;
      if (httpErr?.status === 401 || httpErr?.status === 403) {
        this.applicantsSyncError.set('Access denied loading shared applicants. Ask admin to sync your user access.');
      } else {
        this.applicantsSyncError.set('Unable to load shared applicants from database.');
      }
    }
  }

  private async importLegacyApplicantsToDb(): Promise<void> {
    this.attemptedLegacyImport = true;
    this.markLegacyImportDone();

    let legacyRows: ApplicantRow[] = [];
    try {
      const raw = localStorage.getItem(this.legacyApplicantsStorageKey);
      if (!raw) return;
      legacyRows = this.parseApplicantPayload(JSON.parse(raw));
    } catch {
      return;
    }
    if (legacyRows.length === 0) return;

    let imported = 0;
    for (const row of legacyRows) {
      try {
        await firstValueFrom(
          this.http.post(`${this.apiUrl}/api/v1/applicants/records`, {
            fullName: row.fullName,
            gender: row.gender || null,
            age: row.age,
            position: row.position || null,
            source: row.source || null,
            trainingGroupAssignment: row.trainingGroupAssignment || null,
            status: row.status,
            isHistorical: false,
            appliedDate: this.toIsoDateOnly(row.appliedDate) || null,
            notes: row.notes || null,
            cvFileName: row.cvFileName || null,
            cvDataUrl: row.cvDataUrl || null
          })
        );
        imported++;
      } catch {
        // continue best-effort import
      }
    }

    if (imported > 0) {
      try {
        localStorage.removeItem(this.legacyApplicantsStorageKey);
      } catch {
        // no-op
      }
      await this.loadSharedApplicants();
    }
  }

  private isLegacyImportDone(): boolean {
    try {
      return localStorage.getItem(this.legacyImportDoneStorageKey) === '1';
    } catch {
      return false;
    }
  }

  private markLegacyImportDone(): void {
    try {
      localStorage.setItem(this.legacyImportDoneStorageKey, '1');
    } catch {
      // no-op
    }
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.loadSharedApplicants();
      void this.loadSharedPositions();
    }
  };

  private persistLocalPositions(): void {
    try {
      localStorage.setItem(this.localFallbackPositionsStorageKey, JSON.stringify(this.customPositions()));
    } catch {
      // no-op
    }
  }

  private restoreApplicantGoals(): void {
    try {
      const raw = localStorage.getItem(this.localApplicantGoalsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const rows: ApplicantGoal[] = parsed
        .map((item: any): ApplicantGoal => ({
          id: Number(item?.id || 0),
          sources: this.normalizeGoalSources(
            Array.isArray(item?.sources)
              ? item.sources
              : (this.normalizePositionName(item?.position) ? [this.normalizePositionName(item?.position)] : [])
          ),
          period: item?.period === 'monthly' ? 'monthly' : item?.period === 'yearly' ? 'yearly' : 'weekly',
          targetApplicants: Math.max(0, Math.trunc(Number(item?.targetApplicants || 0))),
          targetInterviews: Math.max(0, Math.trunc(Number(item?.targetInterviews || 0))),
          targetHires: Math.max(0, Math.trunc(Number(item?.targetHires || 0))),
          notes: this.normalizePositionName(item?.notes),
          updatedAt: this.normalizePositionName(item?.updatedAt) || new Date().toISOString()
        }))
        .filter((row) => row.id > 0);
      this.applicantGoals.set(rows.slice(0, 1));
    } catch {
      // no-op
    }
  }

  private persistApplicantGoals(): void {
    try {
      localStorage.setItem(this.localApplicantGoalsStorageKey, JSON.stringify(this.applicantGoals()));
    } catch {
      // no-op
    }
    void this.persistApplicantGoalsToDatabase();
  }

  private async persistApplicantGoalsToDatabase(): Promise<void> {
    try {
      await firstValueFrom(this.userSettings.set(this.dbApplicantGoalsSettingsKey, {
        goals: this.applicantGoals(),
        savedAt: new Date().toISOString()
      }));
    } catch {
      // no-op
    }
  }

  private percentProgress(actual: number, target: number): number {
    const safeTarget = Math.max(0, Number(target || 0));
    if (safeTarget <= 0) return actual > 0 ? 100 : 0;
    return Math.max(0, Math.min(100, (Number(actual || 0) / safeTarget) * 100));
  }

  private getGoalRange(period: GoalPeriod): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    if (period === 'yearly') {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return { start, end };
    }
    if (period === 'monthly') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end };
    }
    const day = now.getDay(); // Sun=0..Sat=6
    const delta = day === 0 ? 6 : day - 1; // shift to Monday start
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - delta, 0, 0, 0, 0);
    return { start, end };
  }

  private isSelectedForHiringStatus(status: ApplicantStatus): boolean {
    if (status === 'hired') return true;
    if (status === 'offer') return this.positionGroupFilter() !== 'fleet';
    return false;
  }

  private isFleetPositionName(value: unknown): boolean {
    const text = this.normalizePositionName(value).toLowerCase();
    if (!text) return false;
    const strongFleetIndicators = [
      'driver',
      'otr',
      'cdl',
      'truck',
      'tractor',
      'fleet',
      'owner operator',
      'owner-operator'
    ];
    return strongFleetIndicators.some((token) => text.includes(token));
  }

  private normalizePositionGroup(value: unknown, positionName?: unknown): PositionGroup {
    const normalized = this.normalizePositionName(value).toLowerCase();
    if (normalized === 'fleet') return 'fleet';
    if (normalized === 'office') return 'office';
    return this.isFleetPositionName(positionName) ? 'fleet' : 'office';
  }

  private isFleetPosition(value: unknown): boolean {
    const normalizedName = this.normalizePositionName(value);
    if (!normalizedName) return false;
    const match = this.customPositions().find(
      (p) => this.normalizePositionName(p.name).toLowerCase() === normalizedName.toLowerCase()
    );
    if (match) return this.normalizePositionGroup(match.group, match.name) === 'fleet';
    return this.isFleetPositionName(normalizedName);
  }

  private isHistoricalApplicantRow(row: ApplicantRow): boolean {
    return this.toBoolean(row?.isHistorical, false);
  }

  private normalizeSourceDisplay(value: unknown): string {
    return this.normalizePositionName(value).replace(/\s+/g, ' ');
  }

  private normalizeSourceKey(value: unknown): string {
    return this.normalizeSourceDisplay(value).toLowerCase();
  }

  private normalizeGoalSources(values: unknown[]): string[] {
    const map = new Map<string, string>();
    for (const value of values) {
      const display = this.normalizeSourceDisplay(value);
      const key = this.normalizeSourceKey(display);
      if (!key) continue;
      if (!map.has(key)) map.set(key, display);
    }
    return Array.from(map.values());
  }

  private parsePositionPayload(payload: unknown): ApplicantPosition[] {
    if (!Array.isArray(payload)) return [];

    const map = new Map<string, ApplicantPosition>();
    for (const item of payload) {
      if (typeof item === 'string') {
        const name = this.normalizePositionName(item);
        if (!name) continue;
        map.set(name.toLowerCase(), { name, isActive: true });
        continue;
      }

      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        const name = this.normalizePositionName(row['name'] ?? row['Name']);
        if (!name) continue;
        const isActive = this.toBoolean(row['isActive'] ?? row['IsActive'], true);
        const color = this.normalizeColorHex(row['color'] ?? row['Color']);
        const group = this.normalizePositionGroup(row['group'] ?? row['Group'], name);
        map.set(name.toLowerCase(), { name, isActive, color, group });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private parseApplicantPayload(payload: unknown): ApplicantRow[] {
    if (!Array.isArray(payload)) return [];

    return payload
      .map((item) => {
        const row = (item && typeof item === 'object') ? item as Record<string, unknown> : null;
        if (!row) return null;

        const id = Number(row['id'] ?? 0);
        if (!Number.isFinite(id) || id <= 0) return null;

        return {
          id,
          fullName: this.normalizePositionName(row['fullName'] ?? row['FullName']),
          gender: this.normalizePositionName(row['gender'] ?? row['Gender']),
          age: this.normalizeAge(row['age'] ?? row['Age']),
          position: this.normalizePositionName(row['position'] ?? row['Position']),
          source: this.normalizePositionName(row['source'] ?? row['Source']),
          state: this.normalizePositionName(row['state'] ?? row['State']),
          trainingGroupAssignment: this.normalizePositionName(row['trainingGroupAssignment'] ?? row['TrainingGroupAssignment']),
          status: this.normalizeStatus(row['status'] ?? row['Status']),
          appliedDate: this.toIsoDateOnly(row['appliedDate'] ?? row['AppliedDate']),
          notes: this.normalizePositionName(row['notes'] ?? row['Notes']),
          cvFileName: this.normalizePositionName(row['cvFileName'] ?? row['CvFileName']),
          cvDataUrl: this.normalizePositionName(row['cvDataUrl'] ?? row['CvDataUrl']),
          hasCv: this.toBoolean(row['hasCv'] ?? row['HasCv'], !!this.normalizePositionName(row['cvDataUrl'] ?? row['CvDataUrl'])),
          isHistorical: this.toBoolean(row['isHistorical'] ?? row['IsHistorical'], false)
        } as ApplicantRow;
      })
      .filter((row): row is ApplicantRow => !!row);
  }

  private async fetchApplicantCv(id: number): Promise<{ cvDataUrl: string; cvFileName: string } | null> {
    try {
      const res = await this.requestWith502Retry(
        () => this.http.get<{ data?: unknown }>(`${this.apiUrl}/api/v1/applicants/records/${id}/cv`),
        2,
        500
      );
      const row = res?.data && typeof res.data === 'object' ? res.data as Record<string, unknown> : null;
      if (!row) return null;

      const cvDataUrl = this.normalizePositionName(row['cvDataUrl'] ?? row['CvDataUrl']);
      if (!cvDataUrl) return null;
      const cvFileName = this.normalizePositionName(row['cvFileName'] ?? row['CvFileName']);

      // Cache loaded CV in-memory for this session.
      this.rows.update((list) =>
        list.map((item) =>
          item.id === id
            ? { ...item, cvDataUrl, cvFileName: cvFileName || item.cvFileName, hasCv: true }
            : item
        )
      );

      return { cvDataUrl, cvFileName };
    } catch {
      return null;
    }
  }

  private async requestWith502Retry<T>(
    requestFactory: () => Observable<T>,
    maxRetries = 2,
    delayMs = 700
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= maxRetries) {
      try {
        return await firstValueFrom(requestFactory());
      } catch (err) {
        lastError = err;
        const httpErr = err as HttpErrorResponse | undefined;
        const isRetryable = httpErr?.status === 502;
        if (!isRetryable || attempt === maxRetries) break;
        await this.sleep(delayMs * (attempt + 1));
      }
      attempt++;
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private ensureSelectedPositionValid(): void {
    const selected = this.selectedPosition();
    if (!selected) {
      this.selectedPosition.set(this.getDefaultPositionSelection());
      return;
    }
    if (selected === 'all') return;
    const valid = this.positionTabs().some((tab) => tab.toLowerCase() === selected.toLowerCase());
    if (!valid) this.selectedPosition.set(this.getDefaultPositionSelection());
  }

  private getDefaultPositionSelection(mode: 'active' | 'inactive' | 'historical' | 'report' | 'goals' | 'market' = this.positionStateFilter()): string {
    if (mode === 'historical' || mode === 'report' || mode === 'goals' || mode === 'market') return 'all';
    const firstRealPosition = this.positionTabs().find((tab) => tab.toLowerCase() !== 'all');
    return firstRealPosition || 'all';
  }

  private restoreMarketSeriesDraft(): void {
    try {
      const raw = localStorage.getItem(this.localMarketSeriesStorageKey);
      const parsed = raw ? JSON.parse(raw) as Partial<Record<BlsMarketKey, string>> : {};
      const localPreset = String(localStorage.getItem(this.localMarketPresetStorageKey) || '').trim();
      const next: Record<BlsMarketKey, string> = {
        driverPay: String(parsed?.driverPay || this.marketSeriesFallback.driverPay).trim().toUpperCase(),
        laborTightness: String(parsed?.laborTightness || this.marketSeriesFallback.laborTightness).trim().toUpperCase(),
        laborDemand: String(parsed?.laborDemand || this.marketSeriesFallback.laborDemand).trim().toUpperCase(),
        inflation: String(parsed?.inflation || this.marketSeriesFallback.inflation).trim().toUpperCase(),
        insuranceCost: String(parsed?.insuranceCost || this.marketSeriesFallback.insuranceCost).trim().toUpperCase()
      };
      if (next.driverPay === 'OEUN0000000533032') next.driverPay = this.marketSeriesFallback.driverPay;
      if (next.laborDemand === 'JTU48009900JOR') next.laborDemand = this.marketSeriesFallback.laborDemand;
      this.marketSeriesDraft = next;
      localStorage.setItem(this.localMarketSeriesStorageKey, JSON.stringify(this.marketSeriesDraft));
      if (localPreset) this.marketPresetKey.set(localPreset);
    } catch {
      this.marketSeriesDraft = { ...this.marketSeriesFallback };
      this.marketPresetKey.set('US');
    }
  }

  private restoreMarketControlsFromLocal(): void {
    try {
      const raw = localStorage.getItem(this.localMarketControlsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        suggestedGoalMode?: SuggestedGoalMode;
        marketPresentationMode?: MarketPresentationMode;
        fleetOtrWeeklyMiles?: number;
        fleetOtrHoursPerWeek?: number;
        fleetOtrBenefitsLoadPct?: number;
      };
      if (parsed?.suggestedGoalMode === 'aggressive' || parsed?.suggestedGoalMode === 'balanced' || parsed?.suggestedGoalMode === 'conservative') {
        this.suggestedGoalMode.set(parsed.suggestedGoalMode);
      }
      if (parsed?.marketPresentationMode === 'executive' || parsed?.marketPresentationMode === 'neon') {
        this.marketPresentationMode.set(parsed.marketPresentationMode);
      }
      if (Number.isFinite(Number(parsed?.fleetOtrWeeklyMiles))) this.fleetOtrWeeklyMiles.set(Number(parsed?.fleetOtrWeeklyMiles));
      if (Number.isFinite(Number(parsed?.fleetOtrHoursPerWeek))) this.fleetOtrHoursPerWeek.set(Number(parsed?.fleetOtrHoursPerWeek));
      if (Number.isFinite(Number(parsed?.fleetOtrBenefitsLoadPct))) this.fleetOtrBenefitsLoadPct.set(Number(parsed?.fleetOtrBenefitsLoadPct));
    } catch {
      // no-op
    }
  }

  private async restoreMarketStateFromDatabase(): Promise<void> {
    try {
      const savedSeries = await firstValueFrom(this.userSettings.get(this.dbMarketSeriesSettingsKey));
      if (savedSeries && typeof savedSeries === 'object') {
        const envelope = savedSeries as { presetKey?: string; seriesDraft?: Partial<Record<BlsMarketKey, string>> };
        const parsed = (envelope?.seriesDraft && typeof envelope.seriesDraft === 'object'
          ? envelope.seriesDraft
          : savedSeries) as Partial<Record<BlsMarketKey, string>>;
        this.marketSeriesDraft = {
          driverPay: String(parsed.driverPay || this.marketSeriesDraft.driverPay).trim().toUpperCase(),
          laborTightness: String(parsed.laborTightness || this.marketSeriesDraft.laborTightness).trim().toUpperCase(),
          laborDemand: String(parsed.laborDemand || this.marketSeriesDraft.laborDemand).trim().toUpperCase(),
          inflation: String(parsed.inflation || this.marketSeriesDraft.inflation).trim().toUpperCase(),
          insuranceCost: String(parsed.insuranceCost || this.marketSeriesDraft.insuranceCost).trim().toUpperCase()
        };
        const presetKey = String(envelope?.presetKey || '').trim();
        if (presetKey) this.marketPresetKey.set(presetKey);
        localStorage.setItem(this.localMarketSeriesStorageKey, JSON.stringify(this.marketSeriesDraft));
        localStorage.setItem(this.localMarketPresetStorageKey, this.marketPresetKey());
      }
    } catch {
      // no-op
    }

    try {
      const savedSnapshot = await firstValueFrom(this.userSettings.get(this.dbMarketSnapshotSettingsKey));
      const snapshotRows = Array.isArray(savedSnapshot?.snapshots) ? savedSnapshot.snapshots as BlsMarketSnapshot[] : [];
      if (snapshotRows.length > 0) {
        this.marketSnapshots.set(snapshotRows);
      }
      const savedAt = String(savedSnapshot?.savedAt || '').trim();
      if (savedAt) {
        this.marketLastUpdated.set(savedAt);
      }
    } catch {
      // no-op
    }

    try {
      const savedControls = await firstValueFrom(this.userSettings.get(this.dbMarketControlsSettingsKey));
      if (savedControls && typeof savedControls === 'object') {
        const controls = savedControls as {
          suggestedGoalMode?: SuggestedGoalMode;
          marketPresentationMode?: MarketPresentationMode;
          fleetOtrWeeklyMiles?: number;
          fleetOtrHoursPerWeek?: number;
          fleetOtrBenefitsLoadPct?: number;
        };
        if (controls.suggestedGoalMode === 'aggressive' || controls.suggestedGoalMode === 'balanced' || controls.suggestedGoalMode === 'conservative') {
          this.suggestedGoalMode.set(controls.suggestedGoalMode);
        }
        if (controls.marketPresentationMode === 'executive' || controls.marketPresentationMode === 'neon') {
          this.marketPresentationMode.set(controls.marketPresentationMode);
        }
        if (Number.isFinite(Number(controls.fleetOtrWeeklyMiles))) this.fleetOtrWeeklyMiles.set(Number(controls.fleetOtrWeeklyMiles));
        if (Number.isFinite(Number(controls.fleetOtrHoursPerWeek))) this.fleetOtrHoursPerWeek.set(Number(controls.fleetOtrHoursPerWeek));
        if (Number.isFinite(Number(controls.fleetOtrBenefitsLoadPct))) this.fleetOtrBenefitsLoadPct.set(Number(controls.fleetOtrBenefitsLoadPct));
        localStorage.setItem(this.localMarketControlsStorageKey, JSON.stringify({
          suggestedGoalMode: this.suggestedGoalMode(),
          marketPresentationMode: this.marketPresentationMode(),
          fleetOtrWeeklyMiles: this.fleetOtrWeeklyMiles(),
          fleetOtrHoursPerWeek: this.fleetOtrHoursPerWeek(),
          fleetOtrBenefitsLoadPct: this.fleetOtrBenefitsLoadPct()
        }));
      }
    } catch {
      // no-op
    }

    try {
      const savedGoals = await firstValueFrom(this.userSettings.get(this.dbApplicantGoalsSettingsKey));
      const rows = Array.isArray(savedGoals) ? savedGoals : Array.isArray(savedGoals?.goals) ? savedGoals.goals : [];
      if (rows.length > 0) {
        this.applicantGoals.set(rows.slice(0, 1));
      }
    } catch {
      // no-op
    }

    try {
      const savedAudit = await firstValueFrom(this.userSettings.get(this.dbMarketAuditSettingsKey));
      const rows = Array.isArray(savedAudit?.records) ? savedAudit.records : Array.isArray(savedAudit) ? savedAudit : [];
      if (rows.length > 0) {
        this.marketAuditRows.set(
          rows
            .map((item: any) => ({
              savedAt: String(item?.savedAt || ''),
              presetKey: String(item?.presetKey || ''),
              positionGroup: item?.positionGroup === 'fleet' ? 'fleet' : 'office',
              suggestedMode: item?.suggestedMode === 'aggressive' || item?.suggestedMode === 'conservative' ? item.suggestedMode : 'balanced',
              pipelineCount: Number(item?.pipelineCount || 0),
              driverPay: this.toBlsNumber(item?.driverPay),
              laborDemand: this.toBlsNumber(item?.laborDemand),
              laborTightness: this.toBlsNumber(item?.laborTightness),
              inflation: this.toBlsNumber(item?.inflation),
              insuranceCost: this.toBlsNumber(item?.insuranceCost)
            }))
            .filter((item: MarketAuditRow) => !!item.savedAt)
            .sort((a: MarketAuditRow, b: MarketAuditRow) => b.savedAt.localeCompare(a.savedAt))
            .slice(0, 200)
        );
      }
    } catch {
      // no-op
    }
  }

  private async persistMarketSnapshotsToDatabase(): Promise<void> {
    try {
      await firstValueFrom(this.userSettings.set(this.dbMarketSnapshotSettingsKey, {
        savedAt: new Date().toISOString(),
        snapshots: this.marketSnapshots(),
        seriesDraft: this.marketSeriesDraft
      }));
    } catch {
      // no-op
    }
  }

  private async persistMarketControlsToStorageAndDatabase(): Promise<void> {
    const payload = {
      suggestedGoalMode: this.suggestedGoalMode(),
      marketPresentationMode: this.marketPresentationMode(),
      fleetOtrWeeklyMiles: this.fleetOtrWeeklyMiles(),
      fleetOtrHoursPerWeek: this.fleetOtrHoursPerWeek(),
      fleetOtrBenefitsLoadPct: this.fleetOtrBenefitsLoadPct()
    };
    try {
      localStorage.setItem(this.localMarketControlsStorageKey, JSON.stringify(payload));
    } catch {
      // no-op
    }
    try {
      await firstValueFrom(this.userSettings.set(this.dbMarketControlsSettingsKey, payload));
    } catch {
      // no-op
    }
  }

  private async appendMarketAuditEntryAndPersist(): Promise<void> {
    const lookup = (key: BlsMarketKey) => this.marketSnapshots().find((item) => item.key === key)?.latestValue ?? null;
    const entry: MarketAuditRow = {
      savedAt: new Date().toISOString(),
      presetKey: this.marketPresetKey(),
      positionGroup: this.positionGroupFilter(),
      suggestedMode: this.suggestedGoalMode(),
      pipelineCount: this.marketPipelineCount(),
      driverPay: lookup('driverPay'),
      laborDemand: lookup('laborDemand'),
      laborTightness: lookup('laborTightness'),
      inflation: lookup('inflation'),
      insuranceCost: lookup('insuranceCost')
    };
    const next = [entry, ...this.marketAuditRows()].slice(0, 200);
    this.marketAuditRows.set(next);
    try {
      await firstValueFrom(this.userSettings.set(this.dbMarketAuditSettingsKey, {
        savedAt: new Date().toISOString(),
        records: next
      }));
    } catch {
      // no-op
    }
  }

  private buildMarketSnapshots(rawSeries: unknown): BlsMarketSnapshot[] {
    const list = Array.isArray(rawSeries) ? rawSeries : [];
    const byId = new Map<string, Record<string, unknown>>();
    for (const item of list) {
      const row = item as Record<string, unknown>;
      const id = String(row['seriesID'] ?? row['seriesId'] ?? '').trim();
      if (!id) continue;
      byId.set(id.toUpperCase(), row);
    }

    const defs: Array<{ key: BlsMarketKey; label: string }> = [
      { key: 'driverPay', label: 'Driver Pay Benchmark' },
      { key: 'laborTightness', label: 'Labor Tightness' },
      { key: 'laborDemand', label: 'Macro Labor Demand' },
      { key: 'inflation', label: 'Inflation Context' },
      { key: 'insuranceCost', label: 'Insurance Cost Pressure' }
    ];

    return defs.map((def) => {
      const requestedId = String(this.marketSeriesDraft[def.key] || '').trim().toUpperCase();
      const fallbackId = String(this.marketSeriesFallback[def.key] || '').trim().toUpperCase();
      const requestedSource = byId.get(requestedId);
      const fallbackSource = byId.get(fallbackId);
      let normalized = this.normalizeSeriesPoints(requestedSource);
      let sourceId = requestedId;
      if (normalized.length === 0 && fallbackId && fallbackId !== requestedId) {
        const fallbackNormalized = this.normalizeSeriesPoints(fallbackSource);
        if (fallbackNormalized.length > 0) {
          normalized = fallbackNormalized;
          sourceId = fallbackId;
        }
      }

      const latest = normalized[0] ?? null;
      const prior = normalized[1] ?? null;
      const changePct = latest && prior && prior.value !== 0
        ? ((latest.value - prior.value) / Math.abs(prior.value)) * 100
        : null;

      const points = normalized
        .slice(0, 60)
        .reverse()
        .map((entry) => ({
          name: entry.bucket,
          value: entry.value
        }));

      return {
        key: def.key,
        label: def.label,
        seriesId: sourceId,
        latestValue: latest?.value ?? null,
        latestLabel: latest?.label ?? '—',
        priorValue: prior?.value ?? null,
        changePct,
        points
      };
    });
  }

  private toBlsNumber(value: unknown): number | null {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private buildMarketPresets(): MarketPresetOption[] {
    const base = this.marketSeriesFallback;
    const states: Array<{ code: string; name: string; fips: string }> = [
      { code: 'AL', name: 'Alabama', fips: '01' }, { code: 'AK', name: 'Alaska', fips: '02' },
      { code: 'AZ', name: 'Arizona', fips: '04' }, { code: 'AR', name: 'Arkansas', fips: '05' },
      { code: 'CA', name: 'California', fips: '06' }, { code: 'CO', name: 'Colorado', fips: '08' },
      { code: 'CT', name: 'Connecticut', fips: '09' }, { code: 'DE', name: 'Delaware', fips: '10' },
      { code: 'DC', name: 'District of Columbia', fips: '11' }, { code: 'FL', name: 'Florida', fips: '12' },
      { code: 'GA', name: 'Georgia', fips: '13' }, { code: 'HI', name: 'Hawaii', fips: '15' },
      { code: 'ID', name: 'Idaho', fips: '16' }, { code: 'IL', name: 'Illinois', fips: '17' },
      { code: 'IN', name: 'Indiana', fips: '18' }, { code: 'IA', name: 'Iowa', fips: '19' },
      { code: 'KS', name: 'Kansas', fips: '20' }, { code: 'KY', name: 'Kentucky', fips: '21' },
      { code: 'LA', name: 'Louisiana', fips: '22' }, { code: 'ME', name: 'Maine', fips: '23' },
      { code: 'MD', name: 'Maryland', fips: '24' }, { code: 'MA', name: 'Massachusetts', fips: '25' },
      { code: 'MI', name: 'Michigan', fips: '26' }, { code: 'MN', name: 'Minnesota', fips: '27' },
      { code: 'MS', name: 'Mississippi', fips: '28' }, { code: 'MO', name: 'Missouri', fips: '29' },
      { code: 'MT', name: 'Montana', fips: '30' }, { code: 'NE', name: 'Nebraska', fips: '31' },
      { code: 'NV', name: 'Nevada', fips: '32' }, { code: 'NH', name: 'New Hampshire', fips: '33' },
      { code: 'NJ', name: 'New Jersey', fips: '34' }, { code: 'NM', name: 'New Mexico', fips: '35' },
      { code: 'NY', name: 'New York', fips: '36' }, { code: 'NC', name: 'North Carolina', fips: '37' },
      { code: 'ND', name: 'North Dakota', fips: '38' }, { code: 'OH', name: 'Ohio', fips: '39' },
      { code: 'OK', name: 'Oklahoma', fips: '40' }, { code: 'OR', name: 'Oregon', fips: '41' },
      { code: 'PA', name: 'Pennsylvania', fips: '42' }, { code: 'RI', name: 'Rhode Island', fips: '44' },
      { code: 'SC', name: 'South Carolina', fips: '45' }, { code: 'SD', name: 'South Dakota', fips: '46' },
      { code: 'TN', name: 'Tennessee', fips: '47' }, { code: 'TX', name: 'Texas', fips: '48' },
      { code: 'UT', name: 'Utah', fips: '49' }, { code: 'VT', name: 'Vermont', fips: '50' },
      { code: 'VA', name: 'Virginia', fips: '51' }, { code: 'WA', name: 'Washington', fips: '53' },
      { code: 'WV', name: 'West Virginia', fips: '54' }, { code: 'WI', name: 'Wisconsin', fips: '55' },
      { code: 'WY', name: 'Wyoming', fips: '56' }
    ];

    const national: MarketPresetOption = {
      key: 'US',
      label: 'United States (National)',
      seriesDraft: { ...base }
    };
    const allStatesNational: MarketPresetOption = {
      key: 'ALL_STATES',
      label: 'All States (National Benchmarks)',
      seriesDraft: { ...base }
    };

    const statePresets = states.map((state) => ({
      key: `STATE_${state.code}`,
      label: `${state.name} (${state.code})`,
      seriesDraft: {
        ...base,
        laborTightness: `LAUST${state.fips}000000000003`
      }
    }));

    return [national, allStatesNational, ...statePresets];
  }

  private resolvePipelineValueForDemandBucket(
    bucket: string,
    monthly: Map<string, number>,
    quarterly: Map<string, number>,
    yearly: Map<string, number>
  ): number {
    const key = String(bucket || '').trim();
    if (/^\d{4}-\d{2}$/.test(key)) return monthly.get(key) ?? 0;
    if (/^\d{4}-Q[1-4]$/i.test(key)) return quarterly.get(key.toUpperCase()) ?? 0;
    if (/^\d{4}$/.test(key)) return yearly.get(key) ?? 0;
    return monthly.get(key) ?? quarterly.get(key.toUpperCase()) ?? yearly.get(key) ?? 0;
  }

  private toPeriodSortValue(year: number, period: string): number {
    const monthMatch = /^M(\d{2})$/i.exec(period);
    if (monthMatch) {
      const month = Number(monthMatch[1]);
      if (month >= 1 && month <= 12) return Date.UTC(year, month - 1, 1);
      if (month === 13) return Date.UTC(year, 11, 31);
    }
    const quarterMatch = /^Q([1-4])$/i.exec(period);
    if (quarterMatch) {
      const q = Number(quarterMatch[1]);
      return Date.UTC(year, (q - 1) * 3, 1);
    }
    return Date.UTC(year, 0, 1);
  }

  private toPeriodBucket(year: number, period: string): string {
    const monthMatch = /^M(\d{2})$/i.exec(period);
    if (monthMatch) {
      const month = Number(monthMatch[1]);
      if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, '0')}`;
      if (month === 13) return `${year}`;
    }
    const quarterMatch = /^Q([1-4])$/i.exec(period);
    if (quarterMatch) return `${year}-Q${quarterMatch[1]}`;
    return `${year}`;
  }

  private normalizeSeriesPoints(source: Record<string, unknown> | undefined): Array<{ value: number; label: string; bucket: string; sortValue: number }> {
    const rows = Array.isArray(source?.['data']) ? source['data'] as Array<Record<string, unknown>> : [];
    return rows
      .map((entry) => {
        const value = this.toBlsNumber(entry['value']);
        const year = Number(String(entry['year'] ?? '').trim());
        const period = String(entry['period'] ?? '').trim().toUpperCase();
        const periodName = String(entry['periodName'] ?? period).trim();
        if (value === null || !Number.isFinite(year)) return null;
        return {
          value,
          label: `${periodName} ${year}`,
          bucket: this.toPeriodBucket(year, period),
          sortValue: this.toPeriodSortValue(year, period)
        };
      })
      .filter((entry): entry is { value: number; label: string; bucket: string; sortValue: number } => !!entry)
      .sort((a, b) => b.sortValue - a.sortValue);
  }

  private ensureSelectedApplicantValid(): void {
    const selected = this.selectedApplicantId();
    if (selected === null) return;
    const exists = this.rows().some((r) => r.id === selected);
    if (!exists) this.selectedApplicantId.set(null);
  }

  private normalizePositionName(value: unknown): string {
    if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>;
      const nested = row['name'] ?? row['Name'] ?? row['value'] ?? row['Value'] ?? row['label'] ?? row['Label'];
      if (nested !== undefined && nested !== null) {
        return this.normalizePositionName(nested);
      }
      return '';
    }
    return String(value ?? '').trim();
  }

  private regionForState(stateRaw: unknown): string {
    const state = String(stateRaw ?? '').trim().toUpperCase();
    if (!state) return 'Unknown';
    const northeast = new Set(['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA']);
    const midwest = new Set(['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD']);
    const south = new Set(['DE', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'DC', 'WV', 'AL', 'KY', 'MS', 'TN', 'AR', 'LA', 'OK', 'TX']);
    const west = new Set(['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'AK', 'CA', 'HI', 'OR', 'WA']);
    if (northeast.has(state)) return 'Northeast';
    if (midwest.has(state)) return 'Midwest';
    if (south.has(state)) return 'South';
    if (west.has(state)) return 'West';
    return 'Unknown';
  }

  getPositionColor(positionName: unknown): string | null {
    const name = this.normalizePositionName(positionName);
    if (!name) return null;
    const match = this.allPositions().find((p) => p.name.toLowerCase() === name.toLowerCase());
    return this.normalizeColorHex(match?.color);
  }

  getPositionSoftColor(positionName: unknown): string | null {
    const color = this.getPositionColor(positionName);
    if (!color) return null;
    return this.hexToRgba(color, 0.22);
  }

  normalizeColorHex(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const candidate = raw.startsWith('#') ? raw : `#${raw}`;
    if (!/^#[0-9A-Fa-f]{6}$/.test(candidate)) return null;
    return candidate.toUpperCase();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const normalized = this.normalizeColorHex(hex);
    if (!normalized) return `rgba(56, 189, 248, ${alpha})`;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private normalizeAge(value: unknown): number | null {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.round(n);
    if (rounded < 16 || rounded > 100) return null;
    return rounded;
  }

  private buildPositionMetric(rows: ApplicantRow[]): PositionTableMetric {
    const count = rows.length;
    if (!count) {
      return { count: 0, avgPerDay: '0.0', avgAge: '—', maleCount: 0, femaleCount: 0, mostRecentEntry: '—' };
    }

    const timestamps = rows
      .map((row) => this.parseDateOnly(row.appliedDate)?.getTime() ?? 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    const daySpan = timestamps.length
      ? Math.max(1, Math.floor((timestamps[timestamps.length - 1] - timestamps[0]) / 86400000) + 1)
      : 1;

    const ages = rows
      .map((row) => row.age)
      .filter((age): age is number => typeof age === 'number' && Number.isFinite(age));
    const avgAge = ages.length
      ? (ages.reduce((sum, age) => sum + age, 0) / ages.length).toFixed(1)
      : '—';

    const maleCount = rows.filter((row) => this.normalizeGenderBucket(row.gender) === 'male').length;
    const femaleCount = rows.filter((row) => this.normalizeGenderBucket(row.gender) === 'female').length;
    const mostRecentEntry = timestamps.length
      ? new Date(timestamps[timestamps.length - 1]).toISOString().slice(0, 10)
      : '—';

    return {
      count,
      avgPerDay: (count / daySpan).toFixed(1),
      avgAge,
      maleCount,
      femaleCount,
      mostRecentEntry
    };
  }

  private normalizeStatus(value: unknown): ApplicantStatus {
    const v = String(value ?? '').trim().toLowerCase();
    if (
      v === 'screening' ||
      v === 'interview' ||
      v === 'offer' ||
      v === 'hired' ||
      v === 'rejected' ||
      v === 'no response' ||
      v === 'no show'
    ) {
      return v;
    }
    return 'new';
  }

  private normalizeGenderBucket(value: unknown): 'male' | 'female' | 'non-binary' | 'prefer not to say' | 'unspecified' {
    const v = String(value ?? '').trim().toLowerCase();
    if (v === 'male') return 'male';
    if (v === 'female') return 'female';
    if (v === 'non-binary' || v === 'non binary') return 'non-binary';
    if (v === 'prefer not to say') return 'prefer not to say';
    return 'unspecified';
  }

  private toIsoDateOnly(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return fallback;
  }

  private parseDateOnly(value: string): Date | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const date = new Date(`${raw}T00:00:00`);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

