import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Color, NgxChartsModule, ScaleType } from '@swimlane/ngx-charts';
import { Observable, firstValueFrom } from 'rxjs';
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
      @if (positionStateFilter() === 'active' || positionStateFilter() === 'inactive' || positionStateFilter() === 'historical') {
        <div class="applicant-mode-tabs-header">
          <button
            class="applicant-mode-tab"
            [class.active]="positionStateFilter() !== 'historical' && applicantSectionMode() === 'application'"
            (click)="selectApplicantsTopMode('application')"
          >
            Application
          </button>
          <button
            class="applicant-mode-tab"
            [class.active]="positionStateFilter() !== 'historical' && applicantSectionMode() === 'hiring'"
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
        </div>
      }
      <header class="page-header">
        <div>
          <h1><i class='bx bx-user-plus'></i> Applicants</h1>
          <p>Track Taylor Access candidate pipeline</p>
        </div>
        @if (positionStateFilter() === 'active' || positionStateFilter() === 'inactive' || positionStateFilter() === 'historical') {
          <button class="btn-primary" (click)="openCreate()">
            <i class='bx bx-plus'></i> {{ positionStateFilter() === 'historical' ? 'Add Historical Applicant' : 'Add Applicant' }}
          </button>
        }
      </header>

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
          <button
            class="state-tab"
            [class.active]="positionStateFilter() === 'report'"
            (click)="setPositionStateFilter('report')"
          >
            Report
          </button>
          <button
            class="state-tab"
            [class.active]="positionStateFilter() === 'goals'"
            (click)="setPositionStateFilter('goals')"
          >
            Goals
          </button>
        }
      </div>
      @if (
        positionStateFilter() === 'active'
        || positionStateFilter() === 'inactive'
        || positionStateFilter() === 'report'
        || positionStateFilter() === 'goals'
        || (positionStateFilter() === 'historical' && historicalViewMode() === 'report')
      ) {
        <div class="position-group-tabs">
          <button
            class="group-tab"
            [class.active]="positionGroupFilter() === 'office'"
            (click)="setPositionGroupFilter('office')"
          >
            <i class='bx bx-briefcase-alt-2'></i> Office
          </button>
          <button
            class="group-tab"
            [class.active]="positionGroupFilter() === 'fleet'"
            (click)="setPositionGroupFilter('fleet')"
          >
            <i class='bx bx-car'></i> Fleet
          </button>
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
      } @else {
        @if (positionStateFilter() === 'historical') {
          <div class="historical-banner">
            Backfill prior applicant records here to improve reporting on previous application and hiring trends.
          </div>
        }
        @if (positionStateFilter() !== 'historical') {
          <div class="position-tabs-wrap">
            <div class="position-tabs">
              @for (position of positionTabs(); track position) {
                <button
                  class="position-tab"
                  [class.position-colored]="position !== 'all' && !!getPositionColor(position)"
                  [class.active]="selectedPosition() === position"
                  [style.--position-color]="position !== 'all' ? getPositionColor(position) : null"
                  [style.--position-color-soft]="position !== 'all' ? getPositionSoftColor(position) : null"
                  (click)="selectPosition(position)"
                >
                  @if (position !== 'all' && getPositionColor(position)) {
                    <span class="position-color-dot" [style.background]="getPositionColor(position)"></span>
                  }
                  <span>{{ position === 'all' ? 'All Positions' : position }}</span>
                  @if (position !== 'all') {
                    <i
                      class="bx bx-cog position-settings-icon"
                      (click)="openPositionSettings(position, $event)"
                      title="Position settings"
                    ></i>
                  }
                </button>
              }
            </div>
            <button class="btn-secondary add-position-btn" (click)="openAddPosition()">
              <i class='bx bx-plus'></i> Position
            </button>
          </div>
        }

        <div class="filters">
          <div class="pipeline-tiles">
            <article class="pipeline-tile">
              <span>Total</span>
              <strong>{{ tableTotalCount() }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Working</span>
              <strong>{{ tableWorkingCount() }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Rejected</span>
              <strong>{{ tableRejectedCount() }}</strong>
            </article>
            <article class="pipeline-tile">
              <span>Hired</span>
              <strong>{{ tableHiredCount() }}</strong>
            </article>
          </div>
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
                      <option value="new">New</option>
                      <option value="screening">Screening</option>
                      <option value="interview">Interview</option>
                      <option value="offer">Offer</option>
                      <option value="hired">Hired</option>
                      <option value="no response">No Response</option>
                      <option value="no show">No Show</option>
                      <option value="rejected">Rejected</option>
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
    .applicant-mode-tabs-header { display: inline-flex; gap: 10px; margin-bottom: 12px; }
    .applicant-mode-tab {
      background: #111827;
      color: #9fb2c8;
      border: 1px solid #2a2a4e;
      border-radius: 999px;
      padding: 9px 18px;
      cursor: pointer;
      font-size: 0.92rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      transition: all 0.15s ease;
    }
    .applicant-mode-tab.active { border-color: #00d4ff; color: #d9f6ff; background: rgba(0, 212, 255, 0.14); box-shadow: 0 0 0 1px rgba(0, 212, 255, 0.25) inset; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; h1 { margin: 0; color: #fff; display: flex; align-items: center; gap: 10px; i { color: #00d4ff; } } p { margin: 4px 0 0; color: #8aa0b8; } }
    .btn-primary { background: linear-gradient(135deg, #00d4ff, #0080ff); border: none; color: #0a0a14; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .btn-secondary { background: #253049; border: none; color: #dbeafe; border-radius: 8px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
    .btn-danger { background: #3b1118; border: 1px solid #7f1d1d; color: #fecaca; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; margin-right: auto; }
    .position-state-tabs { display: flex; gap: 8px; margin-bottom: 10px; }
    .state-tab { background: #111827; color: #9fb2c8; border: 1px solid #2a2a4e; border-radius: 999px; padding: 6px 14px; cursor: pointer; font-size: 0.84rem; }
    .state-tab.active { border-color: #00d4ff; color: #d9f6ff; background: rgba(0, 212, 255, 0.12); }
    .historical-banner { margin-bottom: 10px; border: 1px solid #2a2a4e; background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(16, 25, 44, 0.9)); border-radius: 10px; padding: 10px 12px; color: #b9d5f6; font-size: 0.85rem; }
    .position-group-tabs { display: inline-flex; gap: 8px; margin: -2px 0 10px; }
    .group-tab { background: #111827; color: #9fb2c8; border: 1px solid #2a2a4e; border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; }
    .group-tab.active { border-color: #00d4ff; color: #d9f6ff; background: rgba(0, 212, 255, 0.12); }
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
    .position-tabs-wrap { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .position-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
    .position-tab { background: #111827; color: #9fb2c8; border: 1px solid #2a2a4e; border-radius: 999px; padding: 6px 10px; cursor: pointer; font-size: 0.84rem; display: inline-flex; align-items: center; gap: 6px; }
    .position-tab.position-colored { border-color: var(--position-color, #2a2a4e); }
    .position-tab.active { border-color: #00d4ff; color: #d9f6ff; background: rgba(0, 212, 255, 0.12); }
    .position-tab.position-colored.active { border-color: var(--position-color, #00d4ff); background: var(--position-color-soft, rgba(56, 189, 248, 0.2)); color: #f8fafc; }
    .position-color-dot { width: 8px; height: 8px; border-radius: 999px; box-shadow: 0 0 0 1px rgba(255,255,255,0.25); }
    .position-settings-icon { font-size: 0.9rem; color: #8aa0b8; border-radius: 999px; padding: 1px; }
    .position-settings-icon:hover { color: #d9f6ff; background: rgba(255,255,255,0.08); }
    .add-position-btn { display: inline-flex; align-items: center; gap: 4px; padding: 8px 12px; }
    .filters { display: flex; gap: 10px; margin: 10px 0 14px; align-items: center; flex-wrap: wrap; input, select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 8px 10px; } input { min-width: 280px; } }
    .pipeline-tiles { width: 100%; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 2px; }
    .pipeline-tile { border: 1px solid #2a2a4e; border-radius: 10px; padding: 8px 10px; background: #10192c; display: flex; justify-content: space-between; align-items: baseline; }
    .pipeline-tile span { color: #8aa0b8; font-size: 0.78rem; }
    .pipeline-tile strong { color: #e0f2fe; font-size: 1rem; }
    .pipeline-tabs { display: inline-flex; gap: 6px; margin-right: 2px; }
    .pipeline-tab { background: #111827; color: #9fb2c8; border: 1px solid #2a2a4e; border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 0.82rem; }
    .pipeline-tab.active { border-color: #00d4ff; color: #d9f6ff; background: rgba(0, 212, 255, 0.12); }
    .sync-error { margin: -4px 0 10px; color: #fda4af; font-size: 0.82rem; }
    .table-wrap { border: 1px solid #2a2a4e; border-radius: 10px; overflow: hidden; }
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
    th { text-align: left; padding: 12px; background: #0d0d1a; color: #8aa0b8; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid #2a2a4e; }
    td { padding: 12px; color: #d1d5db; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
    .applicant-row { cursor: pointer; }
    .applicant-row.selected td { background: rgba(0, 212, 255, 0.08); }
    td select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 6px 8px; }
    .action-icons { display: flex; gap: 6px; }
    .icon-btn { border: 1px solid #2a2a4e; background: #111827; color: #cbd5e1; border-radius: 6px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .icon-btn:hover { border-color: #4b5c84; color: #fff; }
    .icon-btn.warn:hover { border-color: #f59e0b; color: #fde68a; }
    .icon-btn.success:hover { border-color: #22c55e; color: #86efac; }
    .icon-btn.danger:hover { border-color: #ef4444; color: #fecaca; }
    .cv-link-btn { background: transparent; color: #7dd3fc; border: none; text-decoration: underline; cursor: pointer; padding: 0; font-size: 0.86rem; }
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
  `]
})
export class ApplicantsComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly legacyApplicantsStorageKey = 'ta.hr.applicants.v1';
  private readonly legacyImportDoneStorageKey = 'ta.hr.applicants.legacyImportDone';
  private readonly localFallbackPositionsStorageKey = 'ta.hr.applicant-positions.v1';
  private readonly localApplicantGoalsStorageKey = 'ta.hr.applicant-goals.v1';
  private readonly apiUrl = environment.apiUrl;
  rows = signal<ApplicantRow[]>([]);
  customPositions = signal<ApplicantPosition[]>([]);
  selectedPosition = signal<string>('all');
  positionStateFilter = signal<'active' | 'inactive' | 'historical' | 'report' | 'goals'>('active');
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

    if (this.applicantSectionMode() === 'hiring') {
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

  tableTotalCount = computed(() => this.tableScopeRows().length);
  tableWorkingCount = computed(() => this.tableScopeRows().filter((r) => r.status !== 'rejected').length);
  tableRejectedCount = computed(() => this.tableScopeRows().filter((r) => r.status === 'rejected').length);
  tableHiredCount = computed(() => this.tableScopeRows().filter((r) => r.status === 'hired').length);
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

  setPositionStateFilter(mode: 'active' | 'inactive' | 'historical' | 'report' | 'goals'): void {
    this.positionStateFilter.set(mode);
    this.selectedPosition.set('all');
    if (mode === 'historical') this.historicalViewMode.set('applicants');
  }

  setPositionGroupFilter(mode: 'office' | 'fleet'): void {
    this.positionGroupFilter.set(mode);
    this.selectedPosition.set('all');
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
    this.selectedApplicantId.set(null);
    this.showHiredDetails.set(false);
  }

  selectApplicantsTopMode(mode: 'application' | 'hiring'): void {
    if (this.positionStateFilter() === 'historical') {
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
    return status === 'offer' || status === 'hired';
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
    if (selected === 'all') return;
    const valid = this.positionTabs().some((tab) => tab.toLowerCase() === selected.toLowerCase());
    if (!valid) this.selectedPosition.set('all');
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

