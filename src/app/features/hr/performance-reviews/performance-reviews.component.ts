import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';

interface Review {
  id?: number;
  employeeId: number;
  employeeName?: string;
  reviewerId: number;
  reviewerName?: string;
  reviewType: string;
  period: string;
  overallRating: number;
  strengths: string;
  areasForImprovement: string;
  goals: string;
  comments: string;
  status: string;
  year?: number;
  month?: number;
  callVolume?: number;
  textVolume?: number;
  clockedHours?: number;
  workHours?: number;
  activityRate?: number;
  invoicedRevenue?: number;
  score?: number;
  createdAt?: string;
  isSeeded?: boolean;
}
interface ReviewMetricRow extends Review {
  callVolume: number;
  totalCallMinutes: number;
  avgCallMinutes: number;
  textVolume: number;
  meetingsHosted: number;
  meetingsJoined: number;
  totalMeetingMinutes: number;
  totalHours: number;
  activeHours: number;
  idleHours: number;
  activityRate: number;
  invoicedRevenue: number;
  score: number;
}
interface ZoomMetricRow {
  employeeId: number;
  callVolume: number;
  totalCallMinutes?: number;
  avgCallMinutes?: number;
  textVolume: number;
  meetingsHosted?: number;
  meetingsJoined?: number;
  totalMeetingMinutes?: number;
  email?: string;
  employeeName?: string;
}
interface PersistedMetricRow {
  employeeId: number;
  employeeName?: string;
  callVolume: number;
  textVolume: number;
  clockedHours: number;
  workHours: number;
  activityRate: number;
  invoicedRevenue: number;
  score: number;
}
type ReviewTableSort =
  | 'employee-asc'
  | 'employee-desc'
  | 'score-desc'
  | 'score-asc'
  | 'activity-desc'
  | 'activity-asc'
  | 'calls-desc'
  | 'calls-asc'
  | 'meetings-hosted-desc'
  | 'meetings-hosted-asc'
  | 'meetings-joined-desc'
  | 'meetings-joined-asc'
  | 'meetingtime-desc'
  | 'meetingtime-asc'
  | 'calltime-desc'
  | 'calltime-asc'
  | 'clocked-desc'
  | 'clocked-asc';
type IntegrationState = 'checking' | 'connected' | 'not-connected';
type RosterEmployee = Record<string, any>;

@Component({
  selector: 'app-performance-reviews',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="reviews-page">
      <header class="page-header">
        <div>
          <h1><i class='bx bx-bar-chart-square'></i> Performance Reviews</h1>
          <p class="subtitle">Employee evaluations and performance tracking</p>
        </div>
        <button class="btn-primary" (click)="openCreateModal()">
          <i class='bx bx-plus'></i> New Review
        </button>
      </header>

      <!-- Page Tabs -->
      <div class="page-tabs">
        <button class="page-tab" [class.active]="pageTab() === 'reviews'" (click)="pageTab.set('reviews')">
          <i class='bx bx-file'></i> Brokerage
        </button>
        <button class="page-tab" [class.active]="pageTab() === 'calls'" (click)="pageTab.set('calls')">
          <i class='bx bx-phone'></i> Management
        </button>
      </div>

      @if (pageTab() === 'reviews') {
      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-card"><div class="stat-icon staff"><i class='bx bx-group'></i></div><div><span class="stat-val">{{ performanceSummary().totalStaff }}</span><span class="stat-lbl">Total Staff</span></div></div>
        <div class="stat-card"><div class="stat-icon calls"><i class='bx bx-phone-call'></i></div><div><span class="stat-val">{{ performanceSummary().totalCalls }}</span><span class="stat-lbl">Total Calls</span></div></div>
        <div class="stat-card"><div class="stat-icon total"><i class='bx bx-time-five'></i></div><div><span class="stat-val">{{ performanceSummary().totalCallMinutes | number:'1.0-0' }}m</span><span class="stat-lbl">Total Call Time</span></div></div>
        <div class="stat-card"><div class="stat-icon total"><i class='bx bx-video'></i></div><div><span class="stat-val">{{ performanceSummary().totalMeetingMinutes | number:'1.0-0' }}m</span><span class="stat-lbl">Total Meeting Time</span></div></div>
        <div class="stat-card"><div class="stat-icon activity"><i class='bx bx-line-chart'></i></div><div><span class="stat-val">{{ performanceSummary().avgActivityPercent | number:'1.0-0' }}%</span><span class="stat-lbl">Avg Activity</span></div></div>
        <div class="stat-card"><div class="stat-icon completed"><i class='bx bx-medal'></i></div><div><span class="stat-val">{{ performanceSummary().avgScore | number:'1.0-0' }}</span><span class="stat-lbl">Avg Score</span></div></div>
        <div class="stat-card"><div class="stat-icon pending"><i class='bx bx-user-check'></i></div><div><span class="stat-val">{{ performanceSummary().activeStaff }}</span><span class="stat-lbl">Active Staff</span></div></div>
      </div>
      <div class="integration-status-row">
        <div class="status-item">
          <span class="label">Google API</span>
          <span class="status-chip" [class.connected]="googleApiStatus() === 'connected'" [class.not-connected]="googleApiStatus() === 'not-connected'">
            {{ integrationStatusLabel(googleApiStatus()) }}
          </span>
        </div>
        <div class="status-item">
          <span class="label">Zoom API</span>
          <span class="status-chip" [class.connected]="zoomApiStatus() === 'connected'" [class.not-connected]="zoomApiStatus() === 'not-connected'">
            {{ integrationStatusLabel(zoomApiStatus()) }}
          </span>
        </div>
        <div class="status-item">
          <span class="label">Last API Check</span>
          <span class="value">{{ lastApiCheckAt() || '—' }}</span>
        </div>
      </div>

      <!-- Sub-Tabs -->
      <div class="review-controls">
        <div class="review-tab-stack">
          <div class="tabs period-mode-tabs">
            <span class="table-title-chip">Saved Performance Table</span>
          </div>
          <div class="tabs period-mode-tabs">
            <button class="tab" [class.active]="!showReportsTab() && periodMode() === 'weekly'" (click)="showReportsTab.set(false); onPeriodModeChange('weekly')">Weekly</button>
            <button class="tab" [class.active]="!showReportsTab() && periodMode() === 'monthly'" (click)="showReportsTab.set(false); onPeriodModeChange('monthly')">Monthly</button>
            <button class="tab" [class.active]="showReportsTab()" (click)="openReportsTab()">Report</button>
          </div>
        </div>
        <div class="search-filter">
          <label>Search</label>
          <input
            type="text"
            [ngModel]="tableSearchTerm()"
            (ngModelChange)="tableSearchTerm.set(($event || '').toString())"
            placeholder="Employee name..."
          />
        </div>
        <div class="month-filter">
          <label>Review Period</label>
          @if (periodMode() === 'weekly') {
            <div class="week-selector">
              <select [ngModel]="selectedWeekNumber()" (ngModelChange)="onWeekNumberChange($event)">
                @for (week of weekOptions; track week) {
                  <option [ngValue]="week">Week {{ week }}</option>
                }
              </select>
              <select [ngModel]="selectedWeekYear()" (ngModelChange)="onWeekYearChange($event)">
                @for (year of reviewYearOptions(); track year) {
                  <option [ngValue]="year">{{ year }}</option>
                }
              </select>
            </div>
          } @else {
            <select [ngModel]="selectedReviewMonth()" (ngModelChange)="onReviewMonthChange($event)">
              @for (opt of reviewPeriodOptions(); track opt.value) {
                <option [value]="opt.value">{{ opt.label }}</option>
              }
            </select>
          }
        </div>
        @if (!showReportsTab()) {
          <div class="sort-filter">
            <label>Sort By</label>
            <select [ngModel]="selectedTableSort()" (ngModelChange)="selectedTableSort.set($event)">
              @for (opt of tableSortOptions; track opt.value) {
                <option [value]="opt.value">{{ opt.label }}</option>
              }
            </select>
          </div>
        }
      </div>

      <!-- Reviews Table -->
      @if (showReportsTab()) {
        <section class="report-view">
          <div class="report-cards report-cards-primary">
            <article class="report-card">
              <span>Total Staff</span>
              <strong>{{ performanceSummary().totalStaff }}</strong>
            </article>
            <article class="report-card">
              <span>Active Staff</span>
              <strong>{{ performanceSummary().activeStaff }}</strong>
            </article>
            <article class="report-card">
              <span>Total Calls</span>
              <strong>{{ performanceSummary().totalCalls }}</strong>
            </article>
            <article class="report-card">
              <span>Total Call Time</span>
              <strong>{{ performanceSummary().totalCallMinutes | number:'1.0-0' }} min</strong>
            </article>
            <article class="report-card">
              <span>Total Meeting Time</span>
              <strong>{{ performanceSummary().totalMeetingMinutes | number:'1.0-0' }} min</strong>
            </article>
            <article class="report-card">
              <span>Average Activity</span>
              <strong>{{ performanceSummary().avgActivityPercent | number:'1.0-0' }}%</strong>
            </article>
          </div>

          <div class="report-grid">
            <div class="report-panel">
              <h3>Status Breakdown</h3>
              @for (item of reportStatusBreakdown(); track item.label) {
                <div class="report-row">
                  <span>{{ item.label }}</span>
                  <div class="report-bar-wrap"><div class="report-bar" [style.width.%]="item.percent"></div></div>
                  <strong>{{ item.count }}</strong>
                </div>
              } @empty {
                <div class="chart-empty">No review data yet.</div>
              }
            </div>
            <div class="report-panel">
              <h3>Activity Buckets</h3>
              @for (bucket of reportActivityBuckets(); track bucket.label) {
                <div class="report-row">
                  <span>{{ bucket.label }}</span>
                  <div class="report-bar-wrap"><div class="report-bar alt" [style.width.%]="bucket.percent"></div></div>
                  <strong>{{ bucket.count }}</strong>
                </div>
              } @empty {
                <div class="chart-empty">No activity data yet.</div>
              }
            </div>
            <div class="report-panel report-panel-wide">
              <h3>Top Performers (Activity %)</h3>
              <div class="report-table-head">
                <span>Employee</span>
                <span>Activity %</span>
                <span>Calls</span>
                <span>Call Time</span>
              </div>
              @for (row of reportTopActivityRows(); track row.employeeId) {
                <div class="report-table-row">
                  <span>{{ row.employeeName || ('Employee #' + row.employeeId) }}</span>
                  <span>{{ (row.activityRate * 100) | number:'1.0-0' }}%</span>
                  <span>{{ row.callVolume }}</span>
                  <span>{{ row.totalCallMinutes | number:'1.0-0' }} min</span>
                </div>
              } @empty {
                <div class="chart-empty">No ranked rows available.</div>
              }
            </div>
          </div>
        </section>
      } @else if (loadingReviews()) {
        <div class="loading-state">
          <i class='bx bx-loader-alt bx-spin'></i>
          <h3>Loading performance reviews...</h3>
          <p>Please wait while data syncs</p>
        </div>
      } @else if (filteredReviews().length === 0) {
        <div class="empty-state">
          <i class='bx bx-bar-chart-square'></i>
          <h3>No reviews found</h3>
          <p>Create a performance review to get started</p>
        </div>
      } @else {
        <div class="table-wrap reviews-table-wrap">
          <table class="reviews-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Calls</th>
                <th>Total Call Time</th>
                <th>Avg Call Time</th>
                <th>Texts</th>
                <th>Meetings Hosted</th>
                <th>Meetings Joined</th>
                <th>Total Meeting Time</th>
                <th>Clocked Hrs</th>
                <th>Work Hrs</th>
                <th>Activity %</th>
                <th>Invoiced Rev (30d)</th>
                <th>Score</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (review of sortedMetricRows(); track review.id) {
                <tr>
                  <td><strong>{{ review.employeeName || 'Employee #' + review.employeeId }}</strong></td>
                  <td>{{ review.callVolume }}</td>
                  <td>{{ review.totalCallMinutes | number:'1.1-1' }} min</td>
                  <td>{{ review.avgCallMinutes | number:'1.1-2' }} min</td>
                  <td>{{ review.textVolume }}</td>
                  <td>{{ review.meetingsHosted }}</td>
                  <td>{{ review.meetingsJoined }}</td>
                  <td>{{ review.totalMeetingMinutes | number:'1.1-1' }} min</td>
                  <td>{{ review.totalHours | number:'1.1-1' }}</td>
                  <td>{{ review.activeHours | number:'1.1-1' }}</td>
                  <td>{{ (review.activityRate * 100) | number:'1.0-0' }}%</td>
                  <td>{{ review.invoicedRevenue | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td>
                    <div class="score-pill" [class.high]="review.score >= 80" [class.med]="review.score >= 60 && review.score < 80" [class.low]="review.score < 60">
                      {{ review.score }}
                    </div>
                  </td>
                  <td><span class="status-badge" [class]="review.status">{{ review.status | titlecase }}</span></td>
                  <td>
                    <button class="icon-btn" title="View" (click)="viewReview(review)"><i class='bx bx-show'></i></button>
                    <button class="icon-btn" title="Edit" (click)="editReview(review)"><i class='bx bx-edit'></i></button>
                    @if (review.isSeeded) {
                      <button class="icon-btn" title="Create Review" (click)="createFromSeed(review)"><i class='bx bx-plus-circle'></i></button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      } <!-- end reviews tab -->

      @if (pageTab() === 'calls') {
      <div class="management-title-tabs">
        @for (title of managementTitleTabs(); track title) {
          <button class="tab" [class.active]="activeManagementTitleTab() === title" (click)="selectManagementTitleTab(title)">
            {{ title }}
          </button>
        }
        <button class="tab add-title-tab" (click)="toggleTitlePicker()">
          <i class='bx bx-plus'></i>
        </button>
        <button class="tab settings-title-tab" title="Manage tabs" (click)="toggleTitleSettings()">
          <i class='bx bx-cog'></i>
        </button>
      </div>

      @if (showTitlePicker()) {
        <div class="title-picker">
          <select [ngModel]="newManagementTitle()" (ngModelChange)="newManagementTitle.set($event)">
            <option value="">Select job title</option>
            @for (title of availableManagementTitleOptions(); track title) {
              <option [value]="title">{{ title }}</option>
            }
          </select>
          <button class="btn-secondary" (click)="addManagementTitleTab()">Add Tab</button>
        </div>
      }
      @if (showTitleSettings()) {
        <div class="title-settings-popover">
          <div class="title-settings-header">Manage Tabs</div>
          @for (title of managementTitleTabs(); track title) {
            <div class="title-settings-row">
              <span>{{ title }}</span>
              <button class="remove-tab-btn" title="Delete tab" (click)="removeManagementTitleTab(title)">
                <i class='bx bx-trash'></i>
              </button>
            </div>
          } @empty {
            <div class="title-settings-empty">No tabs to manage.</div>
          }
        </div>
      }

      <!-- Call Metrics Stats -->
      <div class="stats-row">
        <div class="stat-card"><div class="stat-icon staff"><i class='bx bx-group'></i></div><div><span class="stat-val">{{ managementPerformanceSummary().staff }}</span><span class="stat-lbl">Team Members</span></div></div>
        <div class="stat-card"><div class="stat-icon total"><i class='bx bx-phone-call'></i></div><div><span class="stat-val">{{ managementPerformanceSummary().calls }}</span><span class="stat-lbl">Total Calls</span></div></div>
        <div class="stat-card"><div class="stat-icon pending"><i class='bx bx-message-rounded-dots'></i></div><div><span class="stat-val">{{ managementPerformanceSummary().texts }}</span><span class="stat-lbl">Texts</span></div></div>
        <div class="stat-card"><div class="stat-icon completed"><i class='bx bx-video'></i></div><div><span class="stat-val">{{ managementPerformanceSummary().meetings }}</span><span class="stat-lbl">Meetings Hosted</span></div></div>
      </div>

      <!-- Log Call Button -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
        <button class="btn-primary" (click)="showCallModal.set(true)">
          <i class='bx bx-plus'></i> Log Call
        </button>
      </div>

      <!-- Call Logs Table -->
      @if (managementCallLogs().length === 0) {
        <div class="empty-state">
          <i class='bx bx-phone'></i>
          <h3>No call logs yet</h3>
          <p>Log your first call to start tracking metrics</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Duration</th>
                <th>Outcome</th>
                <th>Date</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              @for (call of managementCallLogs(); track call.id) {
                <tr>
                  <td><strong>{{ call.employeeName }}</strong></td>
                  <td><span class="type-badge">{{ call.callType }}</span></td>
                  <td>{{ call.contactName || call.contactNumber }}</td>
                  <td>{{ call.duration }} min</td>
                  <td><span class="status-badge" [class]="call.outcome">{{ call.outcome }}</span></td>
                  <td>{{ call.createdAt | date:'short' }}</td>
                  <td class="notes-cell">{{ call.notes || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      } <!-- end calls tab -->

      <!-- Log Call Modal -->
      @if (showCallModal()) {
        <div class="modal-overlay" (click)="showCallModal.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Log Phone Call</h3>
              <button class="close-btn" (click)="showCallModal.set(false)"><i class='bx bx-x'></i></button>
            </div>
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Employee *</label>
                  <select [(ngModel)]="callForm.employeeId">
                    <option [ngValue]="0">Select Employee</option>
                    @for (emp of managementEmployees(); track emp.id) {
                      <option [ngValue]="emp.id">{{ emp.name }}</option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label>Call Type</label>
                  <select [(ngModel)]="callForm.callType">
                    <option value="outbound">Outbound</option>
                    <option value="inbound">Inbound</option>
                    <option value="text">Text</option>
                    <option value="follow_up">Follow Up</option>
                    <option value="conference">Conference</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Contact Name</label>
                  <input type="text" [(ngModel)]="callForm.contactName" placeholder="Who was called">
                </div>
                <div class="form-group">
                  <label>Contact Number</label>
                  <input type="text" [(ngModel)]="callForm.contactNumber" placeholder="Phone number">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Duration (minutes)</label>
                  <input type="number" [(ngModel)]="callForm.duration" placeholder="0">
                </div>
                <div class="form-group">
                  <label>Outcome</label>
                  <select [(ngModel)]="callForm.outcome">
                    <option value="answered">Answered</option>
                    <option value="missed">Missed</option>
                    <option value="voicemail">Voicemail</option>
                    <option value="busy">Busy</option>
                    <option value="no_answer">No Answer</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>Notes</label>
                <textarea [(ngModel)]="callForm.notes" rows="3" placeholder="Call summary or follow-up needed..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" (click)="showCallModal.set(false)">Cancel</button>
              <button class="btn-primary" (click)="saveCallLog()">
                <i class='bx bx-phone'></i> Log Call
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Create/Edit Modal -->
      @if (showModal()) {
        <div class="modal-overlay" (click)="showModal.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>{{ editingReview() ? 'Edit Review' : 'New Performance Review' }}</h3>
              <button class="close-btn" (click)="showModal.set(false)"><i class='bx bx-x'></i></button>
            </div>
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Employee *</label>
                  <select [(ngModel)]="formData.employeeId">
                    <option [ngValue]="0">Select Employee</option>
                    @for (emp of employees(); track emp.id) {
                      <option [ngValue]="emp.id">{{ emp.name }}</option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label>Review Type</label>
                  <input type="text" [ngModel]="'Monthly'" disabled>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Review Period</label>
                  <input type="text" [ngModel]="selectedReviewMonthLabel()" disabled>
                </div>
                <div class="form-group">
                  <label>Overall Rating (1-5)</label>
                  <div class="star-input">
                    @for (star of stars; track star) {
                      <i class='bx'
                         [class.bxs-star]="star <= formData.overallRating"
                         [class.bx-star]="star > formData.overallRating"
                         [class.filled]="star <= formData.overallRating"
                         (click)="setRating(star)"></i>
                    }
                  </div>
                </div>
              </div>
              <div class="form-group">
                <label>Strengths</label>
                <textarea [(ngModel)]="formData.strengths" rows="3" placeholder="Key strengths and accomplishments..."></textarea>
              </div>
              <div class="form-group">
                <label>Areas for Improvement</label>
                <textarea [(ngModel)]="formData.areasForImprovement" rows="3" placeholder="Areas that need development..."></textarea>
              </div>
              <div class="form-group">
                <label>Goals for Next Period</label>
                <textarea [(ngModel)]="formData.goals" rows="3" placeholder="Objectives and targets..."></textarea>
              </div>
              <div class="form-group">
                <label>Additional Comments</label>
                <textarea [(ngModel)]="formData.comments" rows="2" placeholder="Any other notes..."></textarea>
              </div>
              <div class="form-group">
                <label>Status</label>
                <select [(ngModel)]="formData.status">
                  <option value="pending">Pending Review</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" (click)="showModal.set(false)">Cancel</button>
              <button class="btn-primary" (click)="saveReview()" [disabled]="saving()">
                {{ saving() ? 'Saving...' : (editingReview() ? 'Update' : 'Create Review') }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- View Modal -->
      @if (viewingReview()) {
        <div class="modal-overlay" (click)="viewingReview.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Performance Review</h3>
              <button class="close-btn" (click)="viewingReview.set(null)"><i class='bx bx-x'></i></button>
            </div>
            <div class="modal-body">
              <div class="view-header">
                <h2>{{ viewingReview()!.employeeName }}</h2>
                <div class="view-meta">
                  <span class="type-badge">{{ viewingReview()!.reviewType | titlecase }}</span>
                  <span class="status-badge" [class]="viewingReview()!.status">{{ viewingReview()!.status | titlecase }}</span>
                  <span>{{ viewingReview()!.period }}</span>
                </div>
              </div>
              <div class="view-rating">
                @for (star of stars; track star) {
                  <i class='bx bxs-star'
                     [class.filled]="star <= viewingReview()!.overallRating"
                     [class.empty]="star > viewingReview()!.overallRating"></i>
                }
                <span>{{ viewingReview()!.overallRating }}/5</span>
              </div>
              <div class="view-section" *ngIf="viewingReview()!.strengths">
                <h4><i class='bx bx-trophy'></i> Strengths</h4>
                <p>{{ viewingReview()!.strengths }}</p>
              </div>
              <div class="view-section" *ngIf="viewingReview()!.areasForImprovement">
                <h4><i class='bx bx-target-lock'></i> Areas for Improvement</h4>
                <p>{{ viewingReview()!.areasForImprovement }}</p>
              </div>
              <div class="view-section" *ngIf="viewingReview()!.goals">
                <h4><i class='bx bx-flag'></i> Goals</h4>
                <p>{{ viewingReview()!.goals }}</p>
              </div>
              <div class="view-section" *ngIf="viewingReview()!.comments">
                <h4><i class='bx bx-message-detail'></i> Comments</h4>
                <p>{{ viewingReview()!.comments }}</p>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .reviews-page { padding: 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .page-header h1 { color: #fff; font-size: 1.8rem; margin: 0; display: flex; align-items: center; gap: 12px; i { color: #00d4ff; } }
    .subtitle { color: #888; margin: 6px 0 0; font-size: 0.9rem; }
    .btn-primary { background: linear-gradient(135deg, #00d4ff, #0080ff); color: #0a0a14; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px; &:disabled { opacity: 0.5; } }
    .btn-secondary { padding: 10px 20px; background: #2a2a4e; color: #aaa; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
    .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .integration-status-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .status-item { background: #131a2e; border: 1px solid #2a2a4e; border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .status-item .label { color: #8aa0b8; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .status-item .value { color: #dbeafe; font-size: 0.86rem; font-weight: 600; }
    .status-chip { border: 1px solid #334155; color: #fbbf24; background: rgba(245, 158, 11, 0.12); border-radius: 999px; font-size: 0.72rem; padding: 3px 10px; font-weight: 700; }
    .status-chip.connected { color: #22c55e; border-color: rgba(34, 197, 94, 0.5); background: rgba(34, 197, 94, 0.12); }
    .status-chip.not-connected { color: #ef4444; border-color: rgba(239, 68, 68, 0.5); background: rgba(239, 68, 68, 0.12); }
    .stat-card { background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 14px; }
    .stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; }
    .stat-icon.total { background: rgba(0, 212, 255, 0.12); color: #00d4ff; }
    .stat-icon.pending { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }
    .stat-icon.completed { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
    .stat-icon.staff { background: rgba(59, 130, 246, 0.14); color: #60a5fa; }
    .stat-icon.calls { background: rgba(14, 165, 233, 0.14); color: #38bdf8; }
    .stat-icon.activity { background: rgba(139, 92, 246, 0.14); color: #a78bfa; }
    .stat-icon.draft { background: rgba(156, 163, 175, 0.12); color: #9ca3af; }
    .stat-val { font-size: 1.4rem; font-weight: 700; color: #fff; display: block; }
    .stat-lbl { font-size: 0.78rem; color: #888; }
    .page-tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 2px solid #2a2a4e; }
    .page-tab { padding: 12px 22px; border: none; background: none; color: #888; cursor: pointer; font-weight: 600; font-size: 0.95rem; border-bottom: 2px solid transparent; display: flex; align-items: center; gap: 8px; transition: all 0.2s; margin-bottom: -2px; }
    .page-tab.active { color: #00d4ff; border-bottom-color: #00d4ff; }
    .page-tab:hover { color: #ccc; }
    .review-controls { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .review-tab-stack { display: flex; flex-direction: column; gap: 2px; }
    .period-mode-tabs { margin-bottom: 0; }
    .table-title-chip { display: inline-flex; align-items: center; padding: 8px 12px; border-radius: 999px; border: 1px solid #2a2a4e; color: #9dc7ff; background: rgba(66, 165, 255, 0.08); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .month-filter { display: flex; align-items: center; gap: 8px; }
    .search-filter { display: flex; align-items: center; gap: 8px; }
    .sort-filter { display: flex; align-items: center; gap: 8px; }
    .week-selector { display: flex; align-items: center; gap: 8px; }
    .month-filter label, .sort-filter label, .search-filter label { font-size: 0.76rem; color: #8aa0b8; text-transform: uppercase; letter-spacing: 0.04em; }
    .month-filter select, .month-filter input[type="date"], .sort-filter select, .search-filter input {
      min-width: 180px;
      background: #111827;
      color: #d1d5db;
      border: 1px solid #2a2a4e;
      border-radius: 8px;
      padding: 8px 10px;
    }
    .tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid #2a2a4e; }
    .management-title-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid #2a2a4e; flex-wrap: wrap; }
    .add-title-tab { min-width: 42px; display: inline-flex; align-items: center; justify-content: center; }
    .settings-title-tab { min-width: 42px; display: inline-flex; align-items: center; justify-content: center; }
    .title-picker { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
    .title-picker select { min-width: 220px; background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 8px 10px; }
    .title-settings-popover {
      width: min(420px, 100%);
      border: 1px solid #2a2a4e;
      border-radius: 10px;
      background: #0f172a;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .title-settings-header {
      padding: 10px 12px;
      border-bottom: 1px solid #2a2a4e;
      color: #dbeafe;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .title-settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      color: #cbd5e1;
      font-size: 0.9rem;
    }
    .title-settings-row:last-child { border-bottom: none; }
    .title-settings-empty { padding: 12px; color: #94a3b8; font-size: 0.84rem; }
    .remove-tab-btn {
      border: 1px solid rgba(239, 68, 68, 0.45);
      background: rgba(239, 68, 68, 0.12);
      color: #fecaca;
      border-radius: 6px;
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .remove-tab-btn:hover { background: rgba(239, 68, 68, 0.2); color: #fff; }
    .notes-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; font-size: 0.82rem; }
    .tab { padding: 10px 18px; border: none; background: none; color: #888; cursor: pointer; font-weight: 600; font-size: 0.88rem; border-bottom: 2px solid transparent; &.active { color: #00d4ff; border-bottom-color: #00d4ff; } &:hover { color: #ccc; } }
    .table-wrap { border-radius: 12px; border: 1px solid #2a2a4e; overflow: hidden; }
    .reviews-table-wrap { max-height: 68vh; overflow: auto; border-color: #374151; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 12px 16px; text-align: left; font-size: 0.75rem; color: #888; text-transform: uppercase; background: #0d0d1a; border-bottom: 1px solid #2a2a4e; }
    td { padding: 14px 16px; color: #ccc; font-size: 0.88rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
    tr:hover td { background: rgba(0, 212, 255, 0.03); }
    .reviews-table thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
      color: #cbd5e1;
      font-size: 0.72rem;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #334155;
      white-space: nowrap;
    }
    .reviews-table tbody tr:nth-child(odd) td { background: rgba(15, 23, 42, 0.35); }
    .reviews-table tbody tr:nth-child(even) td { background: rgba(2, 6, 23, 0.65); }
    .reviews-table tbody tr:hover td {
      background: rgba(14, 165, 233, 0.14);
      color: #e2e8f0;
    }
    .reviews-table th,
    .reviews-table td { vertical-align: middle; }
    .reviews-table td:nth-child(2),
    .reviews-table td:nth-child(3),
    .reviews-table td:nth-child(4),
    .reviews-table td:nth-child(5),
    .reviews-table td:nth-child(6),
    .reviews-table td:nth-child(7),
    .reviews-table td:nth-child(8),
    .reviews-table td:nth-child(9),
    .reviews-table td:nth-child(10),
    .reviews-table td:nth-child(11),
    .reviews-table td:nth-child(12),
    .reviews-table td:nth-child(13),
    .reviews-table td:nth-child(14),
    .reviews-table td:nth-child(15),
    .reviews-table th:nth-child(2),
    .reviews-table th:nth-child(3),
    .reviews-table th:nth-child(4),
    .reviews-table th:nth-child(5),
    .reviews-table th:nth-child(6),
    .reviews-table th:nth-child(7),
    .reviews-table th:nth-child(8),
    .reviews-table th:nth-child(9),
    .reviews-table th:nth-child(10),
    .reviews-table th:nth-child(11),
    .reviews-table th:nth-child(12),
    .reviews-table th:nth-child(13),
    .reviews-table th:nth-child(14),
    .reviews-table th:nth-child(15) {
      text-align: center;
    }
    .reviews-table td:first-child,
    .reviews-table th:first-child {
      position: sticky;
      left: 0;
      z-index: 1;
      background: #0b1220;
      min-width: 180px;
    }
    .reviews-table thead th:first-child { z-index: 3; }
    .report-view { margin-top: 8px; }
    .report-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .report-card { background: #10192c; border: 1px solid #2a2a4e; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
    .report-card span { color: #8aa0b8; font-size: 0.78rem; }
    .report-card strong { color: #e0f2fe; font-size: 1.12rem; }
    .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .report-panel { border: 1px solid #2a2a4e; border-radius: 10px; overflow: hidden; background: #0f172a; }
    .report-panel-wide { grid-column: 1 / -1; }
    .report-panel h3 { margin: 0; padding: 10px 12px; font-size: 0.88rem; color: #cbd5e1; background: #0d0d1a; border-bottom: 1px solid #2a2a4e; }
    .report-row { display: grid; grid-template-columns: 140px 1fr 46px; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .report-row span { color: #cbd5e1; font-size: 0.82rem; }
    .report-row strong { color: #e2e8f0; text-align: right; font-size: 0.82rem; }
    .report-bar-wrap { width: 100%; height: 8px; border-radius: 999px; background: rgba(148, 163, 184, 0.2); overflow: hidden; }
    .report-bar { height: 100%; background: linear-gradient(90deg, #22d3ee, #0ea5e9); border-radius: 999px; }
    .report-bar.alt { background: linear-gradient(90deg, #a78bfa, #818cf8); }
    .report-table-head, .report-table-row { display: grid; grid-template-columns: 1.6fr 0.7fr 0.5fr 0.8fr; gap: 10px; align-items: center; padding: 10px 12px; }
    .report-table-head { color: #8aa0b8; text-transform: uppercase; font-size: 0.72rem; border-bottom: 1px solid #2a2a4e; background: #0d0d1a; letter-spacing: 0.04em; }
    .report-table-row { color: #dbeafe; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.84rem; }
    .type-badge { background: rgba(0, 212, 255, 0.1); color: #00d4ff; padding: 3px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
    .status-badge { padding: 3px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
    .status-badge.pending { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }
    .status-badge.completed { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
    .status-badge.draft { background: rgba(156, 163, 175, 0.12); color: #9ca3af; }
    .score-pill { display: inline-flex; min-width: 42px; justify-content: center; padding: 3px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
    .score-pill.high { background: rgba(34, 197, 94, 0.16); color: #22c55e; }
    .score-pill.med { background: rgba(251, 191, 36, 0.16); color: #fbbf24; }
    .score-pill.low { background: rgba(239, 68, 68, 0.16); color: #ef4444; }
    .rating i { font-size: 1rem; color: #333; &.filled { color: #fbbf24; } }
    .star-input i { font-size: 1.4rem; cursor: pointer; color: #333; &.filled { color: #fbbf24; } &:hover { color: #fbbf24; } }
    .icon-btn { background: rgba(30, 41, 59, 0.45); border: 1px solid #334155; color: #a5b4fc; cursor: pointer; font-size: 1rem; padding: 4px 6px; border-radius: 6px; &:hover { color: #22d3ee; border-color: #22d3ee; background: rgba(34, 211, 238, 0.12); } }
    .loading-state { text-align: center; padding: 60px 20px; color: #8fb6ff; i { font-size: 2.4rem; color: #42a5ff; display: block; margin-bottom: 10px; } h3 { color: #d7e7ff; margin: 0 0 6px; } p { margin: 0; font-size: 0.9rem; color: #9bb5d3; } }
    .empty-state { text-align: center; padding: 60px 20px; color: #888; i { font-size: 3rem; color: #444; display: block; margin-bottom: 12px; } h3 { color: #ccc; margin: 0 0 6px; } p { margin: 0; font-size: 0.9rem; } }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 14px; width: 90%; max-width: 650px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid #2a2a4e; h3 { margin: 0; color: #fff; } }
    .close-btn { background: none; border: none; color: #888; font-size: 1.4rem; cursor: pointer; &:hover { color: #fff; } }
    .modal-body { padding: 22px; overflow-y: auto; flex: 1; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 22px; border-top: 1px solid #2a2a4e; }
    .form-row { display: flex; gap: 14px; }
    .form-group { flex: 1; margin-bottom: 16px; label { display: block; font-size: 0.82rem; color: #aaa; margin-bottom: 6px; } }
    .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 10px 12px; border: 1px solid #2a2a4e; border-radius: 8px; background: #0a0a14; color: #fff; font-size: 0.88rem; &:focus { outline: none; border-color: #00d4ff; } }
    .form-group textarea { resize: vertical; }
    .view-header { margin-bottom: 20px; h2 { color: #fff; margin: 0 0 8px; } }
    .view-meta { display: flex; gap: 10px; align-items: center; }
    .view-rating { margin-bottom: 20px; display: flex; align-items: center; gap: 4px; i { font-size: 1.5rem; color: #fbbf24; &.empty { color: #333; } } span { color: #888; margin-left: 8px; font-size: 0.9rem; } }
    .view-section { background: rgba(0,0,0,0.2); border-radius: 10px; padding: 16px; margin-bottom: 12px; h4 { color: #00d4ff; margin: 0 0 8px; font-size: 0.95rem; display: flex; align-items: center; gap: 6px; } p { color: #ccc; margin: 0; white-space: pre-wrap; line-height: 1.6; } }
  `]
})
export class PerformanceReviewsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private apiUrl = environment.apiUrl;
  private readonly managementTabsStorageKey = 'ta.performanceReviews.managementTabs.v1';

  stars = [1, 2, 3, 4, 5];
  pageTab = signal<'reviews' | 'calls'>('reviews');
  reviews = signal<Review[]>([]);
  loadingReviews = signal<boolean>(true);
  timeclockSummaries = signal<any[]>([]);
  revenueSeries = signal<any[]>([]);
  zoomMetricMap = signal<Record<number, ZoomMetricRow>>({});
  zoomMetricByEmail = signal<Record<string, ZoomMetricRow>>({});
  zoomMetricByName = signal<Record<string, ZoomMetricRow>>({});
  persistedMetricMap = signal<Record<number, PersistedMetricRow>>({});
  googleApiStatus = signal<IntegrationState>('checking');
  zoomApiStatus = signal<IntegrationState>('checking');
  lastApiCheckAt = signal<string>('');
  selectedReviewMonth = signal('current');
  selectedWeekNumber = signal(1);
  selectedWeekYear = signal(new Date().getUTCFullYear());
  selectedTableSort = signal<ReviewTableSort>('score-desc');
  tableSearchTerm = signal('');
  showReportsTab = signal(false);
  periodMode = signal<'weekly' | 'monthly'>('weekly');
  weekOptions = Array.from({ length: 52 }, (_, idx) => idx + 1);
  tableSortOptions: Array<{ value: ReviewTableSort; label: string }> = [
    { value: 'score-desc', label: 'Score: High to Low' },
    { value: 'score-asc', label: 'Score: Low to High' },
    { value: 'activity-desc', label: 'Activity %: High to Low' },
    { value: 'activity-asc', label: 'Activity %: Low to High' },
    { value: 'calls-desc', label: 'Calls: High to Low' },
    { value: 'calls-asc', label: 'Calls: Low to High' },
    { value: 'meetings-hosted-desc', label: 'Meetings Hosted: High to Low' },
    { value: 'meetings-hosted-asc', label: 'Meetings Hosted: Low to High' },
    { value: 'meetings-joined-desc', label: 'Meetings Joined: High to Low' },
    { value: 'meetings-joined-asc', label: 'Meetings Joined: Low to High' },
    { value: 'meetingtime-desc', label: 'Meeting Time: High to Low' },
    { value: 'meetingtime-asc', label: 'Meeting Time: Low to High' },
    { value: 'calltime-desc', label: 'Total Call Time: High to Low' },
    { value: 'calltime-asc', label: 'Total Call Time: Low to High' },
    { value: 'clocked-desc', label: 'Clocked Hrs: High to Low' },
    { value: 'clocked-asc', label: 'Clocked Hrs: Low to High' },
    { value: 'employee-asc', label: 'Employee: A to Z' },
    { value: 'employee-desc', label: 'Employee: Z to A' }
  ];

  // Call Metrics
  callLogs = signal<any[]>([]);
  managementTitleTabs = signal<string[]>([]);
  activeManagementTitleTab = signal<string>('');
  showTitlePicker = signal(false);
  showTitleSettings = signal(false);
  newManagementTitle = signal<string>('');
  showCallModal = signal(false);
  callForm: any = {
    employeeId: 0, callType: 'outbound', contactName: '', contactNumber: '',
    duration: 0, outcome: 'answered', notes: ''
  };
  employees = signal<any[]>([]);
  showModal = signal(false);
  editingReview = signal<Review | null>(null);
  viewingReview = signal<Review | null>(null);
  saving = signal(false);

  formData: any = {
    employeeId: 0, reviewType: 'annual', period: '', overallRating: 3,
    strengths: '', areasForImprovement: '', goals: '', comments: '', status: 'pending'
  };

  getCallCount(type: string): number {
    const rows = this.managementCallLogs();
    if (type === 'outbound') return rows.filter(c => c.callType === 'outbound' || c.callType === 'follow_up').length;
    return rows.filter(c => c.outcome === type).length;
  }

  saveCallLog(): void {
    if (!this.callForm.employeeId) { this.toast.warning('Please select an employee'); return; }
    const emp = this.managementEmployees().find(e => e.id === +this.callForm.employeeId);
    const log = {
      ...this.callForm,
      id: Date.now(),
      employeeName: emp?.name || 'Unknown',
      createdAt: new Date().toISOString()
    };
    this.callLogs.update(list => [log, ...list]);
    this.showCallModal.set(false);
    this.callForm = { employeeId: 0, callType: 'outbound', contactName: '', contactNumber: '', duration: 0, outcome: 'answered', notes: '' };
    this.toast.success('Call logged');
  }

  availableManagementTitleOptions = computed(() => {
    const selectedKeys = new Set(this.managementTitleTabs().map(t => this.normalizeManagementKey(t)).filter(Boolean));
    const displayByKey = new Map<string, string>();
    for (const emp of this.employees()) {
      for (const candidate of this.extractEmployeeTitleCandidatesRaw(emp)) {
        const key = this.normalizeManagementKey(candidate);
        if (!key || selectedKeys.has(key) || displayByKey.has(key)) continue;
        displayByKey.set(key, candidate);
      }
    }
    return Array.from(displayByKey.values()).sort((a, b) => a.localeCompare(b));
  });

  managementEmployees = computed(() => {
    const all = this.employees();
    const tabs = this.managementTitleTabs();
    if (tabs.length === 0) return all;

    const selectedTab = this.activeManagementTitleTab();
    const effectiveTab = selectedTab || tabs[0];
    const selectedKey = this.normalizeManagementKey(effectiveTab);
    return all.filter((emp) =>
      this.extractEmployeeTitleCandidatesRaw(emp)
        .some(candidate => this.normalizeManagementKey(candidate) === selectedKey)
    );
  });

  managementEmployeeIdSet = computed(() => new Set(this.managementEmployees().map(e => Number(e.id)).filter(Boolean)));
  managementMetricRows = computed(() => {
    const idSet = this.managementEmployeeIdSet();
    return this.metricRows().filter(row => idSet.has(Number(row.employeeId)));
  });
  managementPerformanceSummary = computed(() => {
    const rows = this.managementMetricRows();
    return {
      staff: rows.length,
      calls: rows.reduce((sum, row) => sum + Number(row.callVolume || 0), 0),
      texts: rows.reduce((sum, row) => sum + Number(row.textVolume || 0), 0),
      meetings: rows.reduce((sum, row) => sum + Number(row.meetingsHosted || 0), 0)
    };
  });

  managementCallLogs = computed(() => {
    const idSet = this.managementEmployeeIdSet();
    return this.callLogs().filter(c => idSet.has(Number(c.employeeId)));
  });

  toggleTitlePicker(): void {
    const next = !this.showTitlePicker();
    this.showTitlePicker.set(next);
    if (next) this.showTitleSettings.set(false);
    if (next) this.newManagementTitle.set('');
  }

  toggleTitleSettings(): void {
    const next = !this.showTitleSettings();
    this.showTitleSettings.set(next);
    if (next) this.showTitlePicker.set(false);
  }

  addManagementTitleTab(): void {
    const title = (this.newManagementTitle() || '').trim();
    if (!title) return;

    this.managementTitleTabs.update((tabs) => {
      if (tabs.some(t => t.toLowerCase() === title.toLowerCase())) return tabs;
      return [...tabs, title];
    });
    this.activeManagementTitleTab.set(title);
    this.persistManagementTabs();
    this.newManagementTitle.set('');
    this.showTitlePicker.set(false);
  }

  selectManagementTitleTab(title: string): void {
    this.activeManagementTitleTab.set(title);
    this.showTitleSettings.set(false);
    this.persistManagementTabs();
  }

  removeManagementTitleTab(title: string): void {
    const normalized = title.trim().toLowerCase();
    const nextTabs = this.managementTitleTabs().filter(t => t.trim().toLowerCase() !== normalized);
    this.managementTitleTabs.set(nextTabs);

    if (nextTabs.length === 0) {
      this.activeManagementTitleTab.set('');
      this.showTitleSettings.set(false);
      this.persistManagementTabs();
      return;
    }

    if (this.activeManagementTitleTab().trim().toLowerCase() === normalized) {
      this.activeManagementTitleTab.set(nextTabs[0]);
    }
    this.persistManagementTabs();
  }

  getReviewCount(status: string): number {
    if (status === 'pending') {
      return this.reviewRows().filter(r => this.normalizeReviewStatus(r.status) === 'pending').length;
    }
    return this.reviewRows().filter(r => this.normalizeReviewStatus(r.status) === status).length;
  }

  setRating(star: number): void {
    this.formData.overallRating = star;
  }

  reviewRows = computed<Review[]>(() => {
    const activeEmployees = this.employees();
    if (!activeEmployees.length) return this.reviews();

    // Latest authored review per employee takes precedence.
    const latestByEmployee = new Map<number, Review>();
    for (const review of this.reviews()) {
      const employeeId = Number(review.employeeId);
      if (!employeeId) continue;
      const current = latestByEmployee.get(employeeId);
      const reviewTs = review.createdAt ? new Date(review.createdAt).getTime() : 0;
      const currentTs = current?.createdAt ? new Date(current.createdAt).getTime() : 0;
      if (!current || reviewTs >= currentTs) {
        latestByEmployee.set(employeeId, { ...review, isSeeded: false });
      }
    }

    return activeEmployees
      .map((emp: any) => {
        const employeeId = Number(emp.id);
        return latestByEmployee.get(employeeId) ?? this.buildSeedReview(emp);
      })
      .sort((a, b) => {
        // Real reviews first, then seeded.
        if (!!a.isSeeded !== !!b.isSeeded) return a.isSeeded ? 1 : -1;
        const aTs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTs - aTs;
      });
  });

  filteredReviews = computed(() => this.reviewRows());
  metricRows = computed<ReviewMetricRow[]>(() => {
    return this.filteredReviews().map((review) => this.toMetricRow(review));
  });
  performanceSummary = computed(() => {
    const rows = this.metricRows();
    const totalStaff = this.employees().length || rows.length;
    const totalCalls = rows.reduce((sum, row) => sum + Number(row.callVolume || 0), 0);
    const totalCallMinutes = rows.reduce((sum, row) => sum + Number(row.totalCallMinutes || 0), 0);
    const totalMeetingMinutes = rows.reduce((sum, row) => sum + Number(row.totalMeetingMinutes || 0), 0);
    const avgActivityPercent = rows.length
      ? rows.reduce((sum, row) => sum + (Number(row.activityRate || 0) * 100), 0) / rows.length
      : 0;
    const avgScore = rows.length
      ? rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length
      : 0;
    const activeStaff = rows.filter(row =>
      Number(row.callVolume || 0) > 0
      || Number(row.textVolume || 0) > 0
      || Number(row.totalCallMinutes || 0) > 0
      || Number(row.totalHours || 0) > 0
    ).length;
    return {
      totalStaff,
      totalCalls,
      totalCallMinutes,
      totalMeetingMinutes,
      avgActivityPercent,
      avgScore,
      activeStaff
    };
  });
  sortedMetricRows = computed<ReviewMetricRow[]>(() => {
    const searchTerm = this.tableSearchTerm().trim().toLowerCase();
    const rows = [...this.metricRows()].filter((row) => {
      if (!searchTerm) return true;
      const employeeName = String(row.employeeName || `Employee #${row.employeeId}`).toLowerCase();
      const employeeId = String(row.employeeId || '').toLowerCase();
      const employee = this.employees().find(e => Number(e.id) === Number(row.employeeId));
      const emailTokens = [
        String(employee?.email || '').toLowerCase(),
        String(employee?.workEmail || '').toLowerCase(),
        String(employee?.personalEmail || '').toLowerCase(),
        String(employee?.zoomEmail || '').toLowerCase()
      ].filter(Boolean);
      return employeeName.includes(searchTerm)
        || employeeId.includes(searchTerm)
        || emailTokens.some(email => email.includes(searchTerm));
    });
    const sort = this.selectedTableSort();
    const employeeLabel = (r: ReviewMetricRow) => String(r.employeeName || `Employee #${r.employeeId}`).trim().toLowerCase();

    rows.sort((a, b) => {
      switch (sort) {
        case 'employee-asc':
          return employeeLabel(a).localeCompare(employeeLabel(b));
        case 'employee-desc':
          return employeeLabel(b).localeCompare(employeeLabel(a));
        case 'score-asc':
          return a.score - b.score;
        case 'score-desc':
          return b.score - a.score;
        case 'activity-asc':
          return a.activityRate - b.activityRate;
        case 'activity-desc':
          return b.activityRate - a.activityRate;
        case 'calls-asc':
          return a.callVolume - b.callVolume;
        case 'calls-desc':
          return b.callVolume - a.callVolume;
        case 'meetings-hosted-asc':
          return a.meetingsHosted - b.meetingsHosted;
        case 'meetings-hosted-desc':
          return b.meetingsHosted - a.meetingsHosted;
        case 'meetings-joined-asc':
          return a.meetingsJoined - b.meetingsJoined;
        case 'meetings-joined-desc':
          return b.meetingsJoined - a.meetingsJoined;
        case 'meetingtime-asc':
          return a.totalMeetingMinutes - b.totalMeetingMinutes;
        case 'meetingtime-desc':
          return b.totalMeetingMinutes - a.totalMeetingMinutes;
        case 'calltime-asc':
          return a.totalCallMinutes - b.totalCallMinutes;
        case 'calltime-desc':
          return b.totalCallMinutes - a.totalCallMinutes;
        case 'clocked-asc':
          return a.totalHours - b.totalHours;
        case 'clocked-desc':
          return b.totalHours - a.totalHours;
        default:
          return b.score - a.score;
      }
    });

    return rows;
  });
  reportStatusBreakdown = computed(() => {
    const rows = this.metricRows();
    const total = rows.length || 1;
    const pending = rows.filter(r => this.normalizeReviewStatus(r.status) === 'pending').length;
    const completed = rows.filter(r => this.normalizeReviewStatus(r.status) === 'completed').length;
    const seeded = rows.filter(r => !!r.isSeeded).length;
    return [
      { label: 'Pending', count: pending, percent: (pending / total) * 100 },
      { label: 'Completed', count: completed, percent: (completed / total) * 100 },
      { label: 'Draft/Seeded', count: seeded, percent: (seeded / total) * 100 }
    ].filter(x => x.count > 0);
  });
  reportActivityBuckets = computed(() => {
    const rows = this.metricRows();
    const total = rows.length || 1;
    const buckets = [
      { label: '0% - 24%', count: 0 },
      { label: '25% - 49%', count: 0 },
      { label: '50% - 74%', count: 0 },
      { label: '75% - 100%', count: 0 }
    ];
    for (const row of rows) {
      const pct = Number(row.activityRate || 0) * 100;
      if (pct < 25) buckets[0].count++;
      else if (pct < 50) buckets[1].count++;
      else if (pct < 75) buckets[2].count++;
      else buckets[3].count++;
    }
    return buckets.map(b => ({ ...b, percent: (b.count / total) * 100 })).filter(b => b.count > 0);
  });
  reportTopActivityRows = computed(() => {
    return [...this.metricRows()]
      .sort((a, b) => (b.activityRate - a.activityRate) || (b.callVolume - a.callVolume))
      .slice(0, 8);
  });
  totalInvoicedRevenue30d = computed(() => {
    const seriesTotal = this.revenueSeries().reduce(
      (sum: number, point: any) => sum + Number(point?.value ?? point?.revenue ?? 0),
      0
    );
    if (seriesTotal > 0) return seriesTotal;
    return this.reviews().reduce((sum: number, review: any) => sum + Number(review?.invoicedRevenue ?? 0), 0);
  });

  reviewPeriodOptions = computed(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    if (this.periodMode() === 'monthly') {
      opts.push({ value: 'current', label: 'Current Month' });
      for (let i = 1; i <= 18; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        opts.push({ value, label });
      }
      return opts;
    }

    opts.push({ value: 'current', label: 'Current Week' });
    for (let i = 1; i <= 12; i++) {
      const start = new Date(now);
      start.setDate(start.getDate() - (i * 7));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const value = `${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`;
      const label = `${this.formatShortDate(start)} - ${this.formatShortDate(end)}`;
      opts.push({ value, label });
    }
    return opts;
  });

  reviewYearOptions = computed(() => {
    const current = new Date().getUTCFullYear();
    return Array.from({ length: 7 }, (_, idx) => current - 3 + idx);
  });

  selectedReviewMonthLabel = computed(() => {
    const selected = this.selectedReviewMonth();
    const found = this.reviewPeriodOptions().find(o => o.value === selected);
    if (found) return found.label;
    const parsed = this.parseMonthKey(selected);
    return `${this.formatShortDate(parsed.from)} - ${this.formatShortDate(parsed.to)}`;
  });

  ngOnInit() {
    this.initializeCurrentWeekSelection();
    this.restoreManagementTabs();
    void this.reloadReviewData();
    this.loadIntegrationStatuses();
  }

  integrationStatusLabel(status: IntegrationState): string {
    if (status === 'connected') return 'Connected';
    if (status === 'not-connected') return 'Not Connected';
    return 'Checking...';
  }

  async loadEmployees() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-roster?status=active&limit=5000`).toPromise();
      const rows = Array.isArray(res?.data) ? res.data : [];
      const normalized = rows.map((row: any) => {
        const positionNode = row?.position ?? row?.Position ?? null;
        return {
          ...row,
          role: row?.role ?? row?.Role ?? '',
          jobTitle: row?.jobTitle ?? row?.JobTitle ?? '',
          position: positionNode,
          positionName: row?.positionName
            ?? row?.PositionName
            ?? row?.positionTitle
            ?? row?.PositionTitle
            ?? positionNode?.name
            ?? positionNode?.Name
            ?? positionNode?.title
            ?? positionNode?.Title
            ?? ''
        };
      });
      this.employees.set(normalized);
    } catch { }
  }
  async loadTimeclockSummary() {
    try {
      const range = this.parseMonthKey(this.selectedReviewMonth());
      const dates = this.enumerateDateKeys(range.from, range.to);
      const merged = new Map<string, any>();
      for (const date of dates) {
        try {
          const res: any = await this.http.get(`${this.apiUrl}/api/v1/timeclock/daily-summary?date=${date}`).toPromise();
          const rows: any[] = Array.isArray(res?.data) ? res.data : [];
          for (const row of rows) {
            const userId = Number(row?.userId || 0);
            const userEmail = String(row?.userEmail || '').trim().toLowerCase();
            const userName = String(row?.userName || row?.employeeName || row?.name || '').trim();
            const key = userId > 0 ? `id:${userId}` : (userEmail ? `email:${userEmail}` : `name:${this.normalizeName(userName)}`);
            if (!key || key.endsWith(':')) continue;
            const existing = merged.get(key) || {
              userId: userId || null,
              userEmail,
              userName,
              activeSeconds: 0,
              idleSeconds: 0,
              totalSeconds: 0
            };
            existing.activeSeconds += Number(row?.activeSeconds || 0);
            existing.idleSeconds += Number(row?.idleSeconds || 0);
            existing.totalSeconds += Number(row?.totalSeconds || 0);
            merged.set(key, existing);
          }
        } catch {
          // Keep aggregating other dates.
        }
      }
      this.timeclockSummaries.set(Array.from(merged.values()));
    } catch {
      this.timeclockSummaries.set([]);
    }
  }

  async loadRevenueData() {
    // Revenue chart endpoint is not available in TaylorAccess.API.
    // Keep this as a no-op and rely on review snapshots as fallback revenue source.
    this.revenueSeries.set([]);
  }

  async loadReviews() {
    try {
      const { year, month } = this.parseMonthKey(this.selectedReviewMonth());
      const res: any = await this.http
        .get(`${this.apiUrl}/api/v1/performance-reviews?year=${year}&month=${month}&limit=500`)
        .toPromise();
      this.reviews.set(res?.data || []);
    } catch {
      this.reviews.set([]);
    }
  }

  async loadZoomMetrics() {
    try {
      const { year, month, fromKey, toKey } = this.parseMonthKey(this.selectedReviewMonth());
      const res: any = await this.http
        .get(`${this.apiUrl}/api/v1/performance-reviews/zoom-metrics?year=${year}&month=${month}&from=${encodeURIComponent(fromKey)}&to=${encodeURIComponent(toKey)}&sync=true`)
        .toPromise();
      const map: Record<number, ZoomMetricRow> = {};
      const emailMap: Record<string, ZoomMetricRow> = {};
      const nameMap: Record<string, ZoomMetricRow> = {};
      const rows = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.metrics)
          ? res.data.metrics
          : Array.isArray(res?.metrics)
            ? res.metrics
            : [];
      for (const row of rows) {
        const employeeId = this.readNumeric(row, ['employeeId', 'userId', 'staffId', 'driverId', 'id']);
        const email = String(
          row?.email ||
          row?.userEmail ||
          row?.zoomEmail ||
          row?.employeeEmail ||
          row?.workEmail ||
          ''
        ).trim().toLowerCase();
        const metric: ZoomMetricRow = {
          employeeId: Number.isFinite(employeeId) ? employeeId : 0,
          callVolume: this.readNumeric(row, ['callVolume', 'totalCalls', 'calls', 'callCount', 'phoneCalls']),
          totalCallMinutes: Number(
            row?.totalCallMinutes
            ?? row?.total_call_minutes
            ?? row?.totalCallDuration
            ?? row?.callDurationMinutes
            ?? 0
          ),
          avgCallMinutes: Number(
            row?.avgCallMinutes
            ?? row?.avg_call_minutes
            ?? row?.averageCallMinutes
            ?? 0
          ),
          textVolume: this.readNumeric(row, ['textVolume', 'totalTexts', 'texts', 'smsCount', 'textCount']),
          meetingsHosted: this.readNumeric(row, ['meetingsHosted', 'meetings_hosted', 'hostedMeetings', 'hosted_meetings', 'meetings', 'meetingCount', 'meeting_count']),
          meetingsJoined: this.readNumeric(row, ['meetingsJoined', 'meetings_joined', 'joinedMeetings', 'joined_meetings']),
          totalMeetingMinutes: Number(
            row?.totalMeetingMinutes
            ?? row?.total_meeting_minutes
            ?? row?.meetingMinutes
            ?? row?.meeting_minutes
            ?? 0
          ),
          email: email || undefined,
          employeeName: String(row?.employeeName || row?.name || row?.displayName || '').trim() || undefined
        };
        if (employeeId) {
          map[employeeId] = metric;
        }
        if (email) {
          emailMap[email] = metric;
        }
        const nameKey = this.normalizeName(metric.employeeName);
        if (nameKey) {
          nameMap[nameKey] = metric;
        }
      }
      this.zoomMetricMap.set(map);
      this.zoomMetricByEmail.set(emailMap);
      this.zoomMetricByName.set(nameMap);
    } catch {
      this.zoomMetricMap.set({});
      this.zoomMetricByEmail.set({});
      this.zoomMetricByName.set({});
    }
  }

  async loadIntegrationStatuses() {
    this.googleApiStatus.set('checking');
    this.zoomApiStatus.set('checking');
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/performance-reviews/integration-status`).toPromise();
      const data = res?.data ?? {};
      this.googleApiStatus.set(data?.google?.connected ? 'connected' : 'not-connected');
      this.zoomApiStatus.set(data?.zoom?.connected ? 'connected' : 'not-connected');
      const checkedAt = data?.last?.checkedAtUtc ? new Date(data.last.checkedAtUtc) : null;
      this.lastApiCheckAt.set(checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt.toLocaleString() : '');
    } catch {
      this.googleApiStatus.set('not-connected');
      this.zoomApiStatus.set('not-connected');
      this.lastApiCheckAt.set(new Date().toLocaleString());
    }
  }

  async onReviewMonthChange(value: string) {
    if (!value) return;
    this.selectedReviewMonth.set(value);
    this.loadingReviews.set(true);
    await Promise.all([
      this.loadReviews(),
      this.loadZoomMetrics(),
      this.loadPersistedDailyMetrics()
    ]);
    await this.persistDailyMetricsSnapshot();
    await this.persistMonthlyMetricsSnapshot();
    this.loadingReviews.set(false);
  }

  async onPeriodModeChange(mode: 'weekly' | 'monthly') {
    if (this.periodMode() === mode) return;
    this.periodMode.set(mode);
    this.showReportsTab.set(false);
    if (mode === 'weekly') {
      this.initializeCurrentWeekSelection();
      this.selectedReviewMonth.set(this.buildWeekRangeValue(this.selectedWeekYear(), this.selectedWeekNumber()));
    } else {
      this.selectedReviewMonth.set('current');
    }
    this.loadingReviews.set(true);
    await Promise.all([
      this.loadReviews(),
      this.loadZoomMetrics(),
      this.loadTimeclockSummary(),
      this.loadPersistedDailyMetrics()
    ]);
    await this.persistDailyMetricsSnapshot();
    await this.persistMonthlyMetricsSnapshot();
    this.loadingReviews.set(false);
  }

  openReportsTab(): void {
    this.showReportsTab.set(true);
  }

  async onWeekNumberChange(value: number | string): Promise<void> {
    const week = Number(value);
    if (!Number.isFinite(week) || week < 1 || week > 52) return;
    this.selectedWeekNumber.set(week);
    await this.onReviewMonthChange(this.buildWeekRangeValue(this.selectedWeekYear(), week));
  }

  async onWeekYearChange(value: number | string): Promise<void> {
    const year = Number(value);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) return;
    this.selectedWeekYear.set(year);
    await this.onReviewMonthChange(this.buildWeekRangeValue(year, this.selectedWeekNumber()));
  }

  private async reloadReviewData(): Promise<void> {
    this.loadingReviews.set(true);
    await Promise.all([
      this.loadEmployees(),
      this.loadTimeclockSummary(),
      this.loadReviews(),
      this.loadZoomMetrics(),
      this.loadPersistedDailyMetrics()
    ]);
    await this.persistDailyMetricsSnapshot();
    await this.persistMonthlyMetricsSnapshot();
    this.loadingReviews.set(false);
  }

  openCreateModal() {
    this.editingReview.set(null);
    this.formData = {
      employeeId: 0,
      reviewType: 'monthly',
      period: this.selectedReviewMonthLabel(),
      overallRating: 3,
      strengths: '',
      areasForImprovement: '',
      goals: '',
      comments: '',
      status: 'pending'
    };
    this.showModal.set(true);
  }

  editReview(review: Review) {
    if (review.isSeeded) {
      this.createFromSeed(review);
      return;
    }
    this.editingReview.set(review);
    this.formData = { ...review };
    this.showModal.set(true);
  }

  viewReview(review: Review) {
    this.viewingReview.set(review);
  }

  async saveReview() {
    if (!this.formData.employeeId) { this.toast.warning('Please select an employee'); return; }

    const emp = this.employees().find(e => e.id === +this.formData.employeeId);
    const employeeId = Number(this.formData.employeeId);
    const monthInfo = this.parseMonthKey(this.selectedReviewMonth());
    const liveComms = this.getEmployeeCommunicationMetrics(employeeId);
    const liveCallVolume = liveComms.callVolume;
    const liveTextVolume = liveComms.textVolume;
    const liveTime = this.getEmployeeTime(employeeId);
    const liveRevenue = this.getAttributedRevenue(employeeId);
    const liveScore = this.computePerformanceScore(liveCallVolume, liveTextVolume, liveTime.activeHours, liveTime.totalHours, liveRevenue);

    const review: Review = {
      ...this.formData,
      id: this.editingReview()?.id,
      employeeName: emp?.name || 'Unknown',
      reviewType: 'monthly',
      period: this.selectedReviewMonthLabel(),
      year: monthInfo.year,
      month: monthInfo.month,
      reviewerName: this.editingReview()?.reviewerName || '—',
      reviewerId: this.editingReview()?.reviewerId || 0,
      status: this.normalizeReviewStatus(this.formData.status),
      callVolume: liveCallVolume,
      textVolume: liveTextVolume,
      clockedHours: Number(liveTime.totalHours.toFixed(2)),
      workHours: Number(liveTime.activeHours.toFixed(2)),
      activityRate: Number(liveTime.activityRate.toFixed(4)),
      invoicedRevenue: Number(liveRevenue.toFixed(2)),
      score: liveScore,
      createdAt: this.editingReview()?.createdAt
    };

    this.saving.set(true);
    try {
      const payload = {
        employeeId: review.employeeId,
        year: monthInfo.year,
        month: monthInfo.month,
        period: review.period,
        overallRating: review.overallRating,
        strengths: review.strengths,
        areasForImprovement: review.areasForImprovement,
        goals: review.goals,
        comments: review.comments,
        status: review.status,
        callVolume: review.callVolume,
        textVolume: review.textVolume,
        clockedHours: review.clockedHours,
        workHours: review.workHours,
        activityRate: review.activityRate,
        invoicedRevenue: review.invoicedRevenue,
        score: review.score
      };
      await this.http.post(`${this.apiUrl}/api/v1/performance-reviews/monthly-upsert`, payload).toPromise();
      await this.loadReviews();
      this.toast.success(this.editingReview() ? 'Monthly review updated' : 'Monthly review saved');
      this.showModal.set(false);
    } catch {
      this.toast.error('Failed to save monthly review');
    } finally {
      this.saving.set(false);
    }
  }

  createFromSeed(review: Review) {
    this.editingReview.set(null);
    this.formData = {
      employeeId: review.employeeId,
      reviewType: 'monthly',
      period: this.selectedReviewMonthLabel(),
      overallRating: review.overallRating && review.overallRating > 0 ? review.overallRating : 3,
      strengths: '',
      areasForImprovement: '',
      goals: '',
      comments: '',
      status: 'pending'
    };
    this.showModal.set(true);
  }

  private buildSeedReview(emp: any): Review {
    const employeeId = Number(emp.id);
    return {
      id: -employeeId,
      employeeId,
      employeeName: emp.name || `Employee #${employeeId}`,
      reviewerId: 999,
      reviewerName: '—',
      reviewType: 'monthly',
      period: this.selectedReviewMonthLabel(),
      overallRating: 0,
      strengths: '',
      areasForImprovement: '',
      goals: '',
      comments: '',
      status: 'pending',
      createdAt: emp.updatedAt || emp.lastLoginAt || emp.createdAt || new Date().toISOString(),
      isSeeded: true
    };
  }

  private normalizeReviewStatus(status: string): 'pending' | 'completed' {
    return status === 'completed' ? 'completed' : 'pending';
  }

  private getEmployeeCallVolume(employeeId: number): number {
    return this.callLogs().filter(c => Number(c.employeeId) === Number(employeeId) && c.callType !== 'text').length;
  }

  private getEmployeeTextVolume(employeeId: number): number {
    return this.callLogs().filter(c => Number(c.employeeId) === Number(employeeId) && c.callType === 'text').length;
  }

  private getEmployeeCommunicationMetrics(employeeId: number, employeeName?: string): { callVolume: number; totalCallMinutes: number; avgCallMinutes: number; textVolume: number; meetingsHosted: number; meetingsJoined: number; totalMeetingMinutes: number } {
    const localCalls = this.managementCallLogs().filter(c => Number(c.employeeId) === Number(employeeId) && c.callType !== 'text').length;
    const localTexts = this.managementCallLogs().filter(c => Number(c.employeeId) === Number(employeeId) && c.callType === 'text').length;
    const zoomById = this.zoomMetricMap()[employeeId];
    const emp = this.employees().find(e => Number(e.id) === Number(employeeId))
      ?? this.employees().find(e => this.normalizeName(e?.name) === this.normalizeName(employeeName));
    const candidateEmails = [
      String(emp?.email || '').trim().toLowerCase(),
      String(emp?.workEmail || '').trim().toLowerCase(),
      String(emp?.personalEmail || '').trim().toLowerCase(),
      String(emp?.zoomEmail || '').trim().toLowerCase()
    ].filter(Boolean);
    let zoomByEmail: ZoomMetricRow | undefined;
    for (const key of candidateEmails) {
      const match = this.zoomMetricByEmail()[key];
      if (match) {
        zoomByEmail = match;
        break;
      }
    }
    const nameKey = this.normalizeName(employeeName || emp?.name);
    const zoomByName = nameKey ? this.zoomMetricByName()[nameKey] : undefined;
    const zoom = zoomById ?? zoomByEmail ?? zoomByName;
    const callVolume = Math.max(localCalls, Number(zoom?.callVolume || 0));
    const totalCallMinutes = Math.max(0, Number(zoom?.totalCallMinutes || 0));
    const avgCallMinutes = callVolume > 0
      ? (Number(zoom?.avgCallMinutes || 0) > 0 ? Number(zoom?.avgCallMinutes || 0) : totalCallMinutes / callVolume)
      : 0;
    return {
      callVolume,
      totalCallMinutes,
      avgCallMinutes,
      textVolume: Math.max(localTexts, Number(zoom?.textVolume || 0)),
      meetingsHosted: Number(zoom?.meetingsHosted || 0),
      meetingsJoined: Number(zoom?.meetingsJoined || 0),
      totalMeetingMinutes: Math.max(0, Number(zoom?.totalMeetingMinutes || 0))
    };
  }

  private readNumeric(source: Record<string, any>, keys: string[]): number {
    for (const key of keys) {
      const value = Number(source?.[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
    return 0;
  }

  private normalizeName(value: any): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private toMetricRow(review: Review): ReviewMetricRow {
    const persisted = this.persistedMetricMap()[Number(review.employeeId)];
    const hasSnapshot = !review.isSeeded && (review.clockedHours != null || review.score != null);
    const assignedWorkHours = this.getAssignedWorkHoursForSelectedRange();
    const liveComms = this.getEmployeeCommunicationMetrics(review.employeeId, review.employeeName);
    const { callVolume: liveCallVolume, totalCallMinutes: liveTotalCallMinutes, avgCallMinutes: liveAvgCallMinutes, textVolume: liveTextVolume, meetingsHosted: liveMeetingsHosted, meetingsJoined: liveMeetingsJoined, totalMeetingMinutes: liveTotalMeetingMinutes } = liveComms;
    const liveTime = this.getEmployeeTime(review.employeeId, review.employeeName);
    const liveRevenue = this.getAttributedRevenue(review.employeeId);

    const snapshotCallVolume = this.readNumeric(review as Record<string, any>, ['callVolume', 'totalCalls', 'calls', 'callCount']);
    const snapshotTextVolume = this.readNumeric(review as Record<string, any>, ['textVolume', 'totalTexts', 'texts', 'smsCount', 'textCount']);
    const callVolume = persisted?.callVolume ?? Math.max(snapshotCallVolume, liveCallVolume);
    const totalCallMinutes = Math.max(0, liveTotalCallMinutes);
    const avgCallMinutes = callVolume > 0 ? (liveAvgCallMinutes > 0 ? liveAvgCallMinutes : totalCallMinutes / callVolume) : 0;
    const textVolume = persisted?.textVolume ?? Math.max(snapshotTextVolume, liveTextVolume);
    const rawTotalHours = persisted?.clockedHours ?? (hasSnapshot ? Math.max(Number(review.clockedHours || 0), liveTime.totalHours) : liveTime.totalHours);
    const activityHoursEstimate = this.estimateActivityHours(callVolume, textVolume, liveMeetingsHosted, assignedWorkHours);
    const totalHours = rawTotalHours > 0 ? Math.min(rawTotalHours, assignedWorkHours) : activityHoursEstimate;
    const activeHours = assignedWorkHours;
    const idleHours = Math.max(0, activeHours - totalHours);
    const activityRate = activeHours > 0 ? Math.min(1, totalHours / activeHours) : 0;
    const invoicedRevenue = persisted?.invoicedRevenue ?? (hasSnapshot ? Math.max(Number(review.invoicedRevenue || 0), liveRevenue) : liveRevenue);
    const computedScore = this.computePerformanceScore(callVolume, textVolume, activeHours, totalHours, invoicedRevenue);
    const score = persisted?.score ?? (hasSnapshot ? Math.max(Number(review.score || 0), computedScore) : computedScore);

    return {
      ...review,
      callVolume,
      totalCallMinutes,
      avgCallMinutes,
      textVolume,
      meetingsHosted: liveMeetingsHosted,
      meetingsJoined: liveMeetingsJoined,
      totalMeetingMinutes: liveTotalMeetingMinutes,
      totalHours,
      activeHours,
      idleHours,
      activityRate,
      invoicedRevenue,
      score
    };
  }

  private getAssignedWorkHoursForSelectedRange(): number {
    const { from, to } = this.parseMonthKey(this.selectedReviewMonth());
    const cursor = new Date(from.getTime());
    let businessDays = 0;
    while (cursor.getTime() <= to.getTime()) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) {
        businessDays += 1;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return Math.max(0, businessDays) * 8;
  }

  private estimateActivityHours(callVolume: number, textVolume: number, meetingsHosted: number, assignedHours: number): number {
    const callHours = Math.max(0, callVolume) * 0.2;
    const textHours = Math.max(0, textVolume) * 0.04;
    const meetingHours = Math.max(0, meetingsHosted) * 0.5;
    const estimated = callHours + textHours + meetingHours;
    return Math.min(assignedHours, Number(estimated.toFixed(2)));
  }

  private async loadPersistedDailyMetrics(): Promise<void> {
    const { fromKey, toKey } = this.parseMonthKey(this.selectedReviewMonth());
    try {
      const res: any = await this.http
        .get(`${this.apiUrl}/api/v1/performance-reviews/daily-metrics-table?from=${encodeURIComponent(fromKey)}&to=${encodeURIComponent(toKey)}`)
        .toPromise();
      const rows: any[] = Array.isArray(res?.data) ? res.data : [];
      const nextMap: Record<number, PersistedMetricRow> = {};
      for (const row of rows) {
        const employeeId = Number(row?.employeeId || 0);
        if (!employeeId) continue;
        nextMap[employeeId] = {
          employeeId,
          employeeName: String(row?.employeeName || '').trim() || undefined,
          callVolume: Number(row?.callVolume || 0),
          textVolume: Number(row?.textVolume || 0),
          clockedHours: Number(row?.clockedHours || 0),
          workHours: Number(row?.workHours || 0),
          activityRate: Number(row?.activityRate || 0),
          invoicedRevenue: Number(row?.invoicedRevenue || 0),
          score: Number(row?.score || 0)
        };
      }
      this.persistedMetricMap.set(nextMap);
    } catch {
      this.persistedMetricMap.set({});
    }
  }

  private async persistDailyMetricsSnapshot(): Promise<void> {
    const { toKey } = this.parseMonthKey(this.selectedReviewMonth());
    const rows = this.reviewRows().map((review) => this.toMetricRow(review));
    if (!rows.length) return;
    const payload = {
      metricDate: toKey,
      forceUpdateExisting: false,
      rows: rows.map((row) => ({
        employeeId: Number(row.employeeId || 0),
        employeeName: row.employeeName || '',
        callVolume: Number(row.callVolume || 0),
        textVolume: Number(row.textVolume || 0),
        clockedHours: Number((row.totalHours || 0).toFixed(2)),
        workHours: Number((row.activeHours || 0).toFixed(2)),
        activityRate: Number((row.activityRate || 0).toFixed(4)),
        invoicedRevenue: Number((row.invoicedRevenue || 0).toFixed(2)),
        score: Number(row.score || 0),
        source: 'zoom-google-sync'
      }))
    };
    try {
      await this.http.post(`${this.apiUrl}/api/v1/performance-reviews/daily-metrics-upsert`, payload).toPromise();
      await this.loadPersistedDailyMetrics();
    } catch {
      // Best-effort persistence. UI can still use live values if this call fails.
    }
  }

  private async persistMonthlyMetricsSnapshot(): Promise<void> {
    const rows = this.reviewRows().map((review) => this.toMetricRow(review));
    if (!rows.length) return;
    const hasAnySignal = rows.some((row) =>
      Number(row.callVolume || 0) > 0
      || Number(row.textVolume || 0) > 0
      || Number(row.totalHours || 0) > 0
      || Number(row.activeHours || 0) > 0
      || Number(row.invoicedRevenue || 0) > 0
      || Number(row.score || 0) > 0
    );
    if (!hasAnySignal) return;

    const periodInfo = this.parseMonthKey(this.selectedReviewMonth());
    const { year, month, fromKey, toKey, to } = periodInfo;
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const finalizeMonthly = this.periodMode() === 'monthly' && to.getTime() < currentMonthStart.getTime();
    const payload = {
      year,
      month,
      period: `${fromKey}_${toKey}`,
      periodMode: this.periodMode(),
      finalizeMonthly: finalizeMonthly,
      rows: rows.map((row) => ({
        employeeId: Number(row.employeeId),
        employeeName: row.employeeName || '',
        callVolume: Number(row.callVolume || 0),
        textVolume: Number(row.textVolume || 0),
        clockedHours: Number((row.totalHours || 0).toFixed(2)),
        workHours: Number((row.activeHours || 0).toFixed(2)),
        activityRate: Number((row.activityRate || 0).toFixed(4)),
        invoicedRevenue: Number((row.invoicedRevenue || 0).toFixed(2)),
        score: Number(row.score || 0)
      }))
    };

    try {
      await this.http.post(`${this.apiUrl}/api/v1/performance-reviews/metrics-snapshot`, payload).toPromise();
    } catch {
      // Snapshot persistence is best-effort; keep screen responsive even if background save fails.
    }
  }

  private extractEmployeeTitle(emp: RosterEmployee): string {
    const value = this.extractEmployeeTitleCandidatesRaw(emp)[0] || '';
    return String(value).toLowerCase().trim();
  }

  private extractEmployeeTitleRaw(emp: RosterEmployee): string {
    return this.extractEmployeeTitleCandidatesRaw(emp)[0] || '';
  }

  private extractEmployeeTitleCandidatesRaw(emp: RosterEmployee): string[] {
    const positionNode = emp?.['position'] ?? emp?.['Position'];
    const values: string[] = [];
    const pushValue = (value: any) => {
      if (value == null) return;
      if (Array.isArray(value)) {
        for (const item of value) pushValue(item);
        return;
      }
      const text = String(value).trim();
      if (!text) return;
      if (!values.some(v => v.toLowerCase() === text.toLowerCase())) values.push(text);
    };

    pushValue(emp?.['positionName'] ?? emp?.['PositionName']);
    pushValue(emp?.['positionTitle'] ?? emp?.['PositionTitle']);
    pushValue(emp?.['position_label'] ?? emp?.['PositionLabel']);
    if (typeof positionNode === 'object' && positionNode) {
      pushValue(positionNode['name'] ?? positionNode['Name']);
      pushValue(positionNode['title'] ?? positionNode['Title']);
      pushValue(positionNode['label'] ?? positionNode['Label']);
    } else {
      pushValue(positionNode);
    }
    pushValue(emp?.['jobTitle'] ?? emp?.['JobTitle']);
    pushValue(emp?.['title'] ?? emp?.['Title']);
    pushValue(emp?.['role'] ?? emp?.['Role']);
    pushValue(emp?.['roles'] ?? emp?.['Roles']);
    pushValue(emp?.['userRole'] ?? emp?.['UserRole']);
    pushValue(emp?.['accessRole'] ?? emp?.['AccessRole']);
    pushValue(emp?.['permissionRole'] ?? emp?.['PermissionRole']);
    pushValue(emp?.['departmentTitle'] ?? emp?.['DepartmentTitle']);

    if (
      emp?.['isSuperAdmin'] === true
      || emp?.['superAdmin'] === true
      || emp?.['is_super_admin'] === true
      || emp?.['IsSuperAdmin'] === true
      || emp?.['SuperAdmin'] === true
      || emp?.['Is_Super_Admin'] === true
    ) {
      pushValue('superadmin');
    }

    return values;
  }

  private normalizeManagementKey(value: string): string {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private extractEmployeeDescription(emp: RosterEmployee): string {
    const value = emp?.['jobDescription']
      ?? emp?.['description']
      ?? emp?.['positionDescription']
      ?? emp?.['notes']
      ?? '';
    return String(value).toLowerCase().trim();
  }

  private getEmployeeTime(employeeId: number, employeeName?: string): { totalHours: number; activeHours: number; idleHours: number; activityRate: number; totalSeconds: number } {
    const emp = this.employees().find(e => Number(e.id) === Number(employeeId))
      ?? this.employees().find(e => this.normalizeName(e?.name) === this.normalizeName(employeeName));
    const email = String(emp?.email || '').toLowerCase();
    const name = this.normalizeName(employeeName || emp?.name);
    const row = this.timeclockSummaries().find((s: any) =>
      Number(s?.userId) === Number(employeeId)
      || (email.length > 0 && String(s?.userEmail || '').toLowerCase() === email)
      || (name.length > 0 && this.normalizeName(s?.userName || s?.employeeName || s?.name) === name)
    );
    const activeSeconds = Number(row?.activeSeconds || 0);
    const idleSeconds = Number(row?.idleSeconds || 0);
    const totalSeconds = Number(row?.totalSeconds || (activeSeconds + idleSeconds) || 0);
    const totalHours = totalSeconds / 3600;
    const activeHours = activeSeconds / 3600;
    const idleHours = idleSeconds / 3600;
    const activityRate = totalSeconds > 0 ? activeSeconds / totalSeconds : 0;
    return { totalHours, activeHours, idleHours, activityRate, totalSeconds };
  }

  private getAttributedRevenue(employeeId: number): number {
    const totalRevenue = this.totalInvoicedRevenue30d();
    if (totalRevenue <= 0) return 0;
    const allTime = this.employees().map(e => this.getEmployeeTime(Number(e.id)).totalSeconds);
    const totalTrackedSeconds = allTime.reduce((sum, s) => sum + s, 0);
    if (totalTrackedSeconds <= 0) return 0;
    const empSeconds = this.getEmployeeTime(employeeId).totalSeconds;
    return totalRevenue * (empSeconds / totalTrackedSeconds);
  }

  private computePerformanceScore(
    callVolume: number,
    textVolume: number,
    activeHours: number,
    totalHours: number,
    invoicedRevenue: number
  ): number {
    const targetRevenue = Math.max(1, this.totalInvoicedRevenue30d() / Math.max(1, this.employees().length));
    const callScore = Math.min(callVolume / 20, 1) * 25;
    const textScore = Math.min(textVolume / 40, 1) * 15;
    const activeHoursScore = Math.min(activeHours / 160, 1) * 30;
    const activityRatioScore = (totalHours > 0 ? Math.min(activeHours / totalHours, 1) : 0) * 15;
    const revenueScore = Math.min(invoicedRevenue / targetRevenue, 1) * 15;
    return Math.round(callScore + textScore + activeHoursScore + activityRatioScore + revenueScore);
  }

  private initializeCurrentWeekSelection(): void {
    const now = new Date();
    const info = this.getIsoWeekInfo(now);
    this.selectedWeekNumber.set(Math.min(52, Math.max(1, info.week)));
    this.selectedWeekYear.set(info.year);
  }

  private buildWeekRangeValue(year: number, week: number): string {
    const normalizedWeek = Math.min(52, Math.max(1, Math.trunc(week)));
    const start = this.getIsoWeekStartDate(year, normalizedWeek);
    const end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
    return `${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`;
  }

  private getIsoWeekInfo(input: Date): { year: number; week: number } {
    const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
    const dayNumber = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNumber + 3);
    const isoYear = date.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
    const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return { year: isoYear, week: Math.min(52, Math.max(1, week)) };
  }

  private getIsoWeekStartDate(year: number, week: number): Date {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayNumber = (jan4.getUTCDay() + 6) % 7;
    const weekOneMonday = new Date(jan4.getTime());
    weekOneMonday.setUTCDate(jan4.getUTCDate() - dayNumber);
    const start = new Date(weekOneMonday.getTime());
    start.setUTCDate(weekOneMonday.getUTCDate() + (week - 1) * 7);
    return start;
  }

  private parseMonthKey(value: string): { year: number; month: number; from: Date; to: Date; fromKey: string; toKey: string } {
    const now = new Date();
    const toUtcDate = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    let from: Date;
    let to: Date;

    if (!value || value === 'current') {
      if (this.periodMode() === 'monthly') {
        from = toUtcDate(new Date(now.getFullYear(), now.getMonth(), 1));
        to = toUtcDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      } else {
        from = this.getIsoWeekStartDate(this.selectedWeekYear(), this.selectedWeekNumber());
        to = new Date(from.getTime());
        to.setUTCDate(to.getUTCDate() + 6);
      }
    } else if (value.includes('_')) {
      const [fromRaw, toRaw] = value.split('_');
      const fromParsed = new Date(fromRaw);
      const toParsed = new Date(toRaw);
      if (!Number.isNaN(fromParsed.getTime()) && !Number.isNaN(toParsed.getTime())) {
        from = toUtcDate(fromParsed);
        to = toUtcDate(toParsed);
      } else {
        to = toUtcDate(now);
        from = toUtcDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
      }
    } else {
      const monthlyMatch = /^(\d{4})-(\d{2})$/.exec(value);
      if (monthlyMatch) {
        const year = Number(monthlyMatch[1]);
        const month = Number(monthlyMatch[2]);
        from = toUtcDate(new Date(year, month - 1, 1));
        to = toUtcDate(new Date(year, month, 0));
      } else {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          to = toUtcDate(parsed);
          from = toUtcDate(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() - 6));
        } else if (this.periodMode() === 'monthly') {
          from = toUtcDate(new Date(now.getFullYear(), now.getMonth(), 1));
          to = toUtcDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        } else {
          to = toUtcDate(now);
          from = toUtcDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
        }
      }
    }

    const fromKey = from.toISOString().slice(0, 10);
    const toKey = to.toISOString().slice(0, 10);
    return { year: to.getUTCFullYear(), month: to.getUTCMonth() + 1, from, to, fromKey, toKey };
  }

  private enumerateDateKeys(from: Date, to: Date): string[] {
    const dates: string[] = [];
    const cursor = new Date(from.getTime());
    while (cursor.getTime() <= to.getTime()) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  private formatShortDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private restoreManagementTabs(): void {
    try {
      const raw = localStorage.getItem(this.managementTabsStorageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { tabs?: string[]; active?: string };
      const tabs = Array.isArray(parsed?.tabs)
        ? parsed.tabs.map(v => String(v || '').trim()).filter(Boolean)
        : [];

      if (!tabs.length) return;

      const deduped = Array.from(new Set(tabs));
      this.managementTitleTabs.set(deduped);

      const active = String(parsed?.active || '').trim();
      if (active && deduped.some(t => t.toLowerCase() === active.toLowerCase())) {
        const exact = deduped.find(t => t.toLowerCase() === active.toLowerCase()) || deduped[0];
        this.activeManagementTitleTab.set(exact);
      } else {
        this.activeManagementTitleTab.set(deduped[0]);
      }
    } catch {
      // Ignore storage parsing issues and continue with defaults.
    }
  }

  private persistManagementTabs(): void {
    try {
      const payload = {
        tabs: this.managementTitleTabs(),
        active: this.activeManagementTitleTab()
      };
      localStorage.setItem(this.managementTabsStorageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage write failures.
    }
  }
}
