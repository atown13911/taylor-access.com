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
  createdAt?: string;
}

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
          <i class='bx bx-file'></i> Reviews
        </button>
        <button class="page-tab" [class.active]="pageTab() === 'calls'" (click)="pageTab.set('calls')">
          <i class='bx bx-phone'></i> Call Metrics
        </button>
      </div>

      @if (pageTab() === 'reviews') {
      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-card"><div class="stat-icon total"><i class='bx bx-file'></i></div><div><span class="stat-val">{{ reviews().length }}</span><span class="stat-lbl">Total Reviews</span></div></div>
        <div class="stat-card"><div class="stat-icon pending"><i class='bx bx-time'></i></div><div><span class="stat-val">{{ getReviewCount('pending') }}</span><span class="stat-lbl">Pending</span></div></div>
        <div class="stat-card"><div class="stat-icon completed"><i class='bx bx-check-circle'></i></div><div><span class="stat-val">{{ getReviewCount('completed') }}</span><span class="stat-lbl">Completed</span></div></div>
        <div class="stat-card"><div class="stat-icon draft"><i class='bx bx-edit'></i></div><div><span class="stat-val">{{ getReviewCount('draft') }}</span><span class="stat-lbl">Drafts</span></div></div>
      </div>

      <!-- Sub-Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="activeTab() === 'all'" (click)="activeTab.set('all')">All</button>
        <button class="tab" [class.active]="activeTab() === 'pending'" (click)="activeTab.set('pending')">Pending</button>
        <button class="tab" [class.active]="activeTab() === 'completed'" (click)="activeTab.set('completed')">Completed</button>
        <button class="tab" [class.active]="activeTab() === 'draft'" (click)="activeTab.set('draft')">Drafts</button>
      </div>

      <!-- Reviews Table -->
      @if (filteredReviews().length === 0) {
        <div class="empty-state">
          <i class='bx bx-bar-chart-square'></i>
          <h3>No reviews found</h3>
          <p>Create a performance review to get started</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Period</th>
                <th>Rating</th>
                <th>Reviewer</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (review of filteredReviews(); track review.id) {
                <tr>
                  <td><strong>{{ review.employeeName || 'Employee #' + review.employeeId }}</strong></td>
                  <td><span class="type-badge">{{ review.reviewType | titlecase }}</span></td>
                  <td>{{ review.period }}</td>
                  <td>
                    <div class="rating">
                      @for (star of stars; track star) {
                        <i class='bx'
                           [class.bxs-star]="star <= review.overallRating"
                           [class.bx-star]="star > review.overallRating"
                           [class.filled]="star <= review.overallRating"></i>
                      }
                    </div>
                  </td>
                  <td>{{ review.reviewerName || '—' }}</td>
                  <td><span class="status-badge" [class]="review.status">{{ review.status | titlecase }}</span></td>
                  <td>{{ review.createdAt | date:'shortDate' }}</td>
                  <td>
                    <button class="icon-btn" title="View" (click)="viewReview(review)"><i class='bx bx-show'></i></button>
                    <button class="icon-btn" title="Edit" (click)="editReview(review)"><i class='bx bx-edit'></i></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      } <!-- end reviews tab -->

      @if (pageTab() === 'calls') {
      <!-- Call Metrics Stats -->
      <div class="stats-row">
        <div class="stat-card"><div class="stat-icon total"><i class='bx bx-phone-call'></i></div><div><span class="stat-val">{{ callLogs().length }}</span><span class="stat-lbl">Total Calls</span></div></div>
        <div class="stat-card"><div class="stat-icon completed"><i class='bx bx-phone-incoming'></i></div><div><span class="stat-val">{{ getCallCount('answered') }}</span><span class="stat-lbl">Answered</span></div></div>
        <div class="stat-card"><div class="stat-icon pending"><i class='bx bx-phone-outgoing'></i></div><div><span class="stat-val">{{ getCallCount('outbound') }}</span><span class="stat-lbl">Outbound</span></div></div>
        <div class="stat-card"><div class="stat-icon draft"><i class='bx bx-phone-off'></i></div><div><span class="stat-val">{{ getCallCount('missed') }}</span><span class="stat-lbl">Missed</span></div></div>
      </div>

      <!-- Log Call Button -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
        <button class="btn-primary" (click)="showCallModal.set(true)">
          <i class='bx bx-plus'></i> Log Call
        </button>
      </div>

      <!-- Call Logs Table -->
      @if (callLogs().length === 0) {
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
              @for (call of callLogs(); track call.id) {
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
                    @for (emp of employees(); track emp.id) {
                      <option [ngValue]="emp.id">{{ emp.name }}</option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label>Call Type</label>
                  <select [(ngModel)]="callForm.callType">
                    <option value="outbound">Outbound</option>
                    <option value="inbound">Inbound</option>
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
                  <select [(ngModel)]="formData.reviewType">
                    <option value="annual">Annual</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="probation">Probation</option>
                    <option value="promotion">Promotion</option>
                    <option value="improvement_plan">Improvement Plan</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Review Period</label>
                  <input type="text" [(ngModel)]="formData.period" placeholder="e.g., Q1 2026, Jan-Jun 2026">
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
                  <option value="draft">Draft</option>
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
    .stat-card { background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 14px; }
    .stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; }
    .stat-icon.total { background: rgba(0, 212, 255, 0.12); color: #00d4ff; }
    .stat-icon.pending { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }
    .stat-icon.completed { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
    .stat-icon.draft { background: rgba(156, 163, 175, 0.12); color: #9ca3af; }
    .stat-val { font-size: 1.4rem; font-weight: 700; color: #fff; display: block; }
    .stat-lbl { font-size: 0.78rem; color: #888; }
    .page-tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 2px solid #2a2a4e; }
    .page-tab { padding: 12px 22px; border: none; background: none; color: #888; cursor: pointer; font-weight: 600; font-size: 0.95rem; border-bottom: 2px solid transparent; display: flex; align-items: center; gap: 8px; transition: all 0.2s; margin-bottom: -2px; }
    .page-tab.active { color: #00d4ff; border-bottom-color: #00d4ff; }
    .page-tab:hover { color: #ccc; }
    .tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid #2a2a4e; }
    .notes-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; font-size: 0.82rem; }
    .tab { padding: 10px 18px; border: none; background: none; color: #888; cursor: pointer; font-weight: 600; font-size: 0.88rem; border-bottom: 2px solid transparent; &.active { color: #00d4ff; border-bottom-color: #00d4ff; } &:hover { color: #ccc; } }
    .table-wrap { border-radius: 12px; border: 1px solid #2a2a4e; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 12px 16px; text-align: left; font-size: 0.75rem; color: #888; text-transform: uppercase; background: #0d0d1a; border-bottom: 1px solid #2a2a4e; }
    td { padding: 14px 16px; color: #ccc; font-size: 0.88rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
    tr:hover td { background: rgba(0, 212, 255, 0.03); }
    .type-badge { background: rgba(0, 212, 255, 0.1); color: #00d4ff; padding: 3px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
    .status-badge { padding: 3px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
    .status-badge.pending { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }
    .status-badge.completed { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
    .status-badge.draft { background: rgba(156, 163, 175, 0.12); color: #9ca3af; }
    .rating i { font-size: 1rem; color: #333; &.filled { color: #fbbf24; } }
    .star-input i { font-size: 1.4rem; cursor: pointer; color: #333; &.filled { color: #fbbf24; } &:hover { color: #fbbf24; } }
    .icon-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 1.1rem; padding: 4px; &:hover { color: #00d4ff; } }
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

  stars = [1, 2, 3, 4, 5];
  pageTab = signal<'reviews' | 'calls'>('reviews');
  reviews = signal<Review[]>([]);

  // Call Metrics
  callLogs = signal<any[]>([]);
  showCallModal = signal(false);
  callForm: any = {
    employeeId: 0, callType: 'outbound', contactName: '', contactNumber: '',
    duration: 0, outcome: 'answered', notes: ''
  };
  employees = signal<any[]>([]);
  activeTab = signal<'all' | 'pending' | 'completed' | 'draft'>('all');
  showModal = signal(false);
  editingReview = signal<Review | null>(null);
  viewingReview = signal<Review | null>(null);
  saving = signal(false);

  formData: any = {
    employeeId: 0, reviewType: 'annual', period: '', overallRating: 3,
    strengths: '', areasForImprovement: '', goals: '', comments: '', status: 'draft'
  };

  getCallCount(type: string): number {
    if (type === 'outbound') return this.callLogs().filter(c => c.callType === 'outbound' || c.callType === 'follow_up').length;
    return this.callLogs().filter(c => c.outcome === type).length;
  }

  saveCallLog(): void {
    if (!this.callForm.employeeId) { this.toast.warning('Please select an employee'); return; }
    const emp = this.employees().find(e => e.id === +this.callForm.employeeId);
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

  getReviewCount(status: string): number {
    return this.reviews().filter(r => r.status === status).length;
  }

  setRating(star: number): void {
    this.formData.overallRating = star;
  }

  filteredReviews = computed(() => {
    const tab = this.activeTab();
    if (tab === 'all') return this.reviews();
    return this.reviews().filter(r => r.status === tab);
  });

  ngOnInit() {
    this.loadEmployees();
    // Reviews would load from API when backend endpoint exists
    // For now, stored in-memory
  }

  async loadEmployees() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/users?status=active&pageSize=5000`).toPromise();
      this.employees.set(res?.data || []);
    } catch { }
  }

  openCreateModal() {
    this.editingReview.set(null);
    this.formData = { employeeId: 0, reviewType: 'annual', period: '', overallRating: 3, strengths: '', areasForImprovement: '', goals: '', comments: '', status: 'draft' };
    this.showModal.set(true);
  }

  editReview(review: Review) {
    this.editingReview.set(review);
    this.formData = { ...review };
    this.showModal.set(true);
  }

  viewReview(review: Review) {
    this.viewingReview.set(review);
  }

  saveReview() {
    if (!this.formData.employeeId) { this.toast.warning('Please select an employee'); return; }

    const emp = this.employees().find(e => e.id === +this.formData.employeeId);
    const review: Review = {
      ...this.formData,
      id: this.editingReview()?.id || Date.now(),
      employeeName: emp?.name || 'Unknown',
      reviewerName: 'Austin Taylor', // TODO: use current user
      reviewerId: 999,
      createdAt: this.editingReview()?.createdAt || new Date().toISOString()
    };

    if (this.editingReview()) {
      this.reviews.update(list => list.map(r => r.id === review.id ? review : r));
      this.toast.success('Review updated');
    } else {
      this.reviews.update(list => [review, ...list]);
      this.toast.champagne('Performance review created!');
    }
    this.showModal.set(false);
  }
}
