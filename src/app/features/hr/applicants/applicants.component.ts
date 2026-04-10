import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

type ApplicantStatus = 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected' | 'no response' | 'no show';

interface ApplicantRow {
  id: number;
  fullName: string;
  gender: string;
  age: number | null;
  position: string;
  source: string;
  status: ApplicantStatus;
  appliedDate: string;
  notes: string;
  cvFileName: string;
  cvDataUrl: string;
  hasCv: boolean;
}

interface ApplicantPosition {
  name: string;
  isActive: boolean;
}

type ApplicantDraft = Omit<ApplicantRow, 'id' | 'status'> & { status?: ApplicantStatus };

@Component({
  selector: 'app-applicants',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="applicants-page">
      <header class="page-header">
        <div>
          <h1><i class='bx bx-user-plus'></i> Applicants</h1>
          <p>Track Taylor Access candidate pipeline</p>
        </div>
        <button class="btn-primary" (click)="openCreate()">
          <i class='bx bx-plus'></i> Add Applicant
        </button>
      </header>

      <div class="position-state-tabs">
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
      </div>

      @if (positionStateFilter() === 'report') {
        <section class="report-view">
          <div class="report-toolbar">
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
          <div class="report-cards">
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
          </div>

          <div class="report-grid">
            <div class="report-panel">
              <h3>Status Breakdown</h3>
              <table>
                <tbody>
                  @for (item of statusBreakdown(); track item.status) {
                    <tr>
                      <td>{{ statusLabel(item.status) }}</td>
                      <td class="count-cell">{{ item.count }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="2" class="empty">No applicants yet.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="report-panel">
              <h3>Position Breakdown</h3>
              <table>
                <tbody>
                  @for (item of positionBreakdown(); track item.position) {
                    <tr>
                      <td>{{ item.position }}</td>
                      <td class="count-cell">{{ item.count }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="2" class="empty">No applicants yet.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      } @else {
        <div class="position-tabs-wrap">
          <div class="position-tabs">
            @for (position of positionTabs(); track position) {
              <button
                class="position-tab"
                [class.active]="selectedPosition() === position"
                (click)="selectPosition(position)"
              >
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
                  (click)="selectApplicant(row.id)"
                >
                  <td><strong>{{ row.fullName }}</strong></td>
                  <td>{{ row.gender || '—' }}</td>
                  <td>{{ row.age ?? '—' }}</td>
                  <td>{{ row.position || '—' }}</td>
                  <td>{{ row.source || '—' }}</td>
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
                  <td colspan="10" class="empty">No applicants yet.</td>
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
              <select [(ngModel)]="draft.position">
                <option value="">Select position</option>
                @for (position of positionOptionsForForm(); track position) {
                  <option [value]="position">{{ position }}</option>
                }
              </select>
            </div>
            <div class="form-row">
              <label>Source</label>
              <input type="text" [(ngModel)]="draft.source" placeholder="Indeed, Referral, LinkedIn..." />
            </div>
            <div class="form-row">
              <label>Applied Date</label>
              <input type="date" [(ngModel)]="draft.appliedDate" />
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
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; h1 { margin: 0; color: #fff; display: flex; align-items: center; gap: 10px; i { color: #00d4ff; } } p { margin: 4px 0 0; color: #8aa0b8; } }
    .btn-primary { background: linear-gradient(135deg, #00d4ff, #0080ff); border: none; color: #0a0a14; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .btn-secondary { background: #253049; border: none; color: #dbeafe; border-radius: 8px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
    .btn-danger { background: #3b1118; border: 1px solid #7f1d1d; color: #fecaca; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; margin-right: auto; }
    .position-state-tabs { display: flex; gap: 8px; margin-bottom: 10px; }
    .state-tab { background: #111827; color: #9fb2c8; border: 1px solid #2a2a4e; border-radius: 999px; padding: 6px 14px; cursor: pointer; font-size: 0.84rem; }
    .state-tab.active { border-color: #00d4ff; color: #d9f6ff; background: rgba(0, 212, 255, 0.12); }
    .position-tabs-wrap { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .position-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
    .position-tab { background: #111827; color: #9fb2c8; border: 1px solid #2a2a4e; border-radius: 999px; padding: 6px 10px; cursor: pointer; font-size: 0.84rem; display: inline-flex; align-items: center; gap: 6px; }
    .position-tab.active { border-color: #00d4ff; color: #d9f6ff; background: rgba(0, 212, 255, 0.12); }
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
    .report-toolbar label { color: #8aa0b8; font-size: 0.8rem; }
    .report-toolbar select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 6px 10px; min-width: 140px; }
    .report-date-range { display: inline-flex; align-items: center; gap: 8px; }
    .report-date-range input { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 6px 8px; }
    .report-date-range span { color: #8aa0b8; font-size: 0.8rem; }
    .report-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .report-card { background: #10192c; border: 1px solid #2a2a4e; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
    .report-card span { color: #8aa0b8; font-size: 0.8rem; }
    .report-card strong { color: #e0f2fe; font-size: 1.2rem; }
    .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .report-panel { border: 1px solid #2a2a4e; border-radius: 10px; overflow: hidden; }
    .report-panel h3 { margin: 0; padding: 10px 12px; font-size: 0.88rem; color: #cbd5e1; background: #0d0d1a; border-bottom: 1px solid #2a2a4e; }
    .count-cell { text-align: right; font-weight: 700; color: #e2e8f0; }
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
    .empty { text-align: center; color: #8aa0b8; padding: 20px; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { width: 100%; max-width: 520px; background: #161a2a; border: 1px solid #2a2a4e; border-radius: 12px; padding: 16px; h3 { margin-top: 0; color: #fff; } }
    .modal-small { max-width: 420px; }
    .form-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; label { color: #8aa0b8; font-size: 0.8rem; } input, textarea, select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 8px 10px; } }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .hint { color: #8aa0b8; font-size: 0.78rem; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  `]
})
export class ApplicantsComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly legacyApplicantsStorageKey = 'ta.hr.applicants.v1';
  private readonly localFallbackPositionsStorageKey = 'ta.hr.applicant-positions.v1';
  private readonly apiUrl = environment.apiUrl;
  rows = signal<ApplicantRow[]>([]);
  customPositions = signal<ApplicantPosition[]>([]);
  selectedPosition = signal<string>('all');
  positionStateFilter = signal<'active' | 'inactive' | 'report'>('active');
  pipelineFilter = signal<'working' | 'rejected' | 'hired'>('working');
  reportRange = signal<'all' | '7d' | '30d' | 'custom'>('all');
  reportDateFrom = signal('');
  reportDateTo = signal('');
  search = signal('');
  statusFilter = signal<'all' | ApplicantStatus>('all');
  showCreate = signal(false);
  showEdit = signal(false);
  showAddPosition = signal(false);
  showPositionSettings = signal(false);
  newPositionName = signal('');
  positionSettingsOriginalName = signal('');
  positionSettingsTargetName = signal('');
  positionSettingsTargetActive = signal(true);
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
      map.set(normalized.toLowerCase(), { name: normalized, isActive: !!p.isActive });
    }
    for (const row of this.rows()) {
      const normalized = this.normalizePositionName(row.position);
      if (!normalized) continue;
      if (!map.has(normalized.toLowerCase())) {
        map.set(normalized.toLowerCase(), { name: normalized, isActive: true });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  positionTabs = computed(() => {
    const mode = this.positionStateFilter();
    const list = this.allPositions()
      .filter((p) => mode === 'active' ? p.isActive : !p.isActive)
      .map((p) => p.name);
    return ['all', ...list];
  });

  positionOptionsForForm = computed(() => this.allPositions().filter((p) => p.isActive).map((p) => p.name));

  reportRows = computed(() => {
    const range = this.reportRange();
    if (range === 'all') return this.rows();

    if (range === 'custom') {
      const from = this.parseDateOnly(this.reportDateFrom());
      const to = this.parseDateOnly(this.reportDateTo());

      if (!from && !to) return this.rows();

      const fromBound = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : null;
      const toBound = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : null;

      return this.rows().filter((row) => {
        const parsed = this.parseDateOnly(row.appliedDate);
        if (!parsed) return false;
        if (fromBound && parsed < fromBound) return false;
        if (toBound && parsed > toBound) return false;
        return true;
      });
    }

    const days = range === '7d' ? 7 : 30;
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

    return this.rows().filter((row) => {
      const parsed = this.parseDateOnly(row.appliedDate);
      return !!parsed && parsed >= cutoff;
    });
  });

  activePositionsCount = computed(() => this.allPositions().filter((p) => p.isActive).length);
  inactivePositionsCount = computed(() => this.allPositions().filter((p) => !p.isActive).length);
  hiredCount = computed(() => this.reportRows().filter((r) => r.status === 'hired').length);

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

  tableScopeRows = computed(() => {
    const selectedPosition = this.selectedPosition();
    return this.rows().filter((r) => selectedPosition === 'all' || String(r.position || '').trim() === selectedPosition);
  });

  tableTotalCount = computed(() => this.tableScopeRows().length);
  tableWorkingCount = computed(() => this.tableScopeRows().filter((r) => r.status !== 'rejected').length);
  tableRejectedCount = computed(() => this.tableScopeRows().filter((r) => r.status === 'rejected').length);
  tableHiredCount = computed(() => this.tableScopeRows().filter((r) => r.status === 'hired').length);

  filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const selectedPosition = this.selectedPosition();
    const pipeline = this.pipelineFilter();
    return this.rows().filter((r) => {
      const pipelinePass = pipeline === 'working'
        ? (r.status !== 'rejected' && r.status !== 'hired')
        : pipeline === 'rejected'
          ? r.status === 'rejected'
          : r.status === 'hired';
      if (!pipelinePass) return false;
      const statusPass = status === 'all' || r.status === status;
      if (!statusPass) return false;
      const positionPass = selectedPosition === 'all' || String(r.position || '').trim() === selectedPosition;
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
      status: row.status,
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
    const payload = {
      fullName,
      gender: this.normalizePositionName(this.draft.gender) || null,
      age: this.normalizeAge(this.draft.age),
      position: position || null,
      source: String(this.draft.source || '').trim() || null,
      status: this.draft.status || 'new',
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

    if (position) await this.addCustomPosition(position, true, true);
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
      status: this.normalizeStatus(this.editDraft.status),
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
    } catch {
      this.applicantsSyncError.set('Unable to delete applicant from database.');
      await this.loadSharedApplicants();
    }
  }

  selectApplicant(id: number): void {
    this.selectedApplicantId.set(id);
  }

  selectPosition(position: string): void {
    this.selectedPosition.set(position);
  }

  setPositionStateFilter(mode: 'active' | 'inactive' | 'report'): void {
    this.positionStateFilter.set(mode);
    this.selectedPosition.set('all');
  }

  setPipelineFilter(mode: 'working' | 'rejected' | 'hired'): void {
    this.pipelineFilter.set(mode);
    this.selectedApplicantId.set(null);
  }

  statusLabel(status: ApplicantStatus): string {
    if (status === 'no response') return 'No Response';
    if (status === 'no show') return 'No Show';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  openAddPosition(): void {
    this.newPositionName.set('');
    this.showAddPosition.set(true);
  }

  async addPosition(): Promise<void> {
    const value = String(this.newPositionName() || '').trim();
    if (!value) return;
    await this.addCustomPosition(value, true, true);
    this.positionStateFilter.set('active');
    this.selectedPosition.set(value);
    this.newPositionName.set('');
    this.showAddPosition.set(false);
  }

  openPositionSettings(position: string, event: MouseEvent): void {
    event.stopPropagation();
    const target = this.allPositions().find((p) => p.name.toLowerCase() === position.toLowerCase());
    this.positionSettingsOriginalName.set(position);
    this.positionSettingsTargetName.set(position);
    this.positionSettingsTargetActive.set(target?.isActive ?? true);
    this.showPositionSettings.set(true);
  }

  async savePositionSettings(): Promise<void> {
    const newName = this.normalizePositionName(this.positionSettingsTargetName());
    if (!newName) return;
    const currentName = this.normalizePositionName(this.positionSettingsOriginalName());
    if (!currentName) return;
    const isActive = this.positionSettingsTargetActive();

    this.customPositions.update((list) => {
      const idx = list.findIndex((p) => p.name.toLowerCase() === currentName.toLowerCase());
      if (idx < 0) return list;
      const next = [...list];
      next[idx] = { ...next[idx], name: newName, isActive };
      return next;
    });
    this.persistLocalPositions();

    try {
      const res = await firstValueFrom(
        this.http.put<{ data?: unknown[] }>(
          `${this.apiUrl}/api/v1/applicants/positions`,
          { currentName, newName, isActive }
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

  private async addCustomPosition(position: string, isActive = true, syncToApi = false): Promise<void> {
    const normalized = this.normalizePositionName(position);
    if (!normalized) return;
    this.customPositions.update((list) => {
      const idx = list.findIndex((p) => p.name.toLowerCase() === normalized.toLowerCase());
      if (idx >= 0) {
        const next = [...list];
        next[idx] = { ...next[idx], isActive };
        return next;
      }
      return [...list, { name: normalized, isActive }]
        .sort((a, b) => a.name.localeCompare(b.name));
    });
    this.persistLocalPositions();

    if (!syncToApi) return;

    try {
      const res = await firstValueFrom(
        this.http.post<{ data?: unknown[] }>(`${this.apiUrl}/api/v1/applicants/positions`, { name: normalized })
      );
      this.customPositions.set(this.parsePositionPayload(res?.data));
      this.persistLocalPositions();
    } catch {
      // keep local fallback list when API is temporarily unavailable
    }
  }

  private async loadSharedPositions(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data?: unknown[] }>(`${this.apiUrl}/api/v1/applicants/positions`)
      );
      this.customPositions.set(this.parsePositionPayload(res?.data));
      this.persistLocalPositions();
      this.ensureSelectedPositionValid();
    } catch {
      // If API fails, keep local fallback positions loaded in ngOnInit.
    }
  }

  private async loadSharedApplicants(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data?: unknown[] }>(`${this.apiUrl}/api/v1/applicants/records?includeCv=false`)
      );
      const parsed = this.parseApplicantPayload(res?.data);
      this.rows.set(parsed);
      this.ensureSelectedApplicantValid();
      this.applicantsSyncError.set('');

      // One-time bridge for older local-only applicant entries.
      if (parsed.length === 0 && !this.attemptedLegacyImport) {
        this.attemptedLegacyImport = true;
        await this.importLegacyApplicantsToDb();
      }
    } catch {
      // Keep current rows if API is temporarily unavailable.
      this.applicantsSyncError.set('Unable to load shared applicants from database.');
    }
  }

  private async importLegacyApplicantsToDb(): Promise<void> {
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
            status: row.status,
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
        map.set(name.toLowerCase(), { name, isActive });
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
          status: this.normalizeStatus(row['status'] ?? row['Status']),
          appliedDate: this.toIsoDateOnly(row['appliedDate'] ?? row['AppliedDate']),
          notes: this.normalizePositionName(row['notes'] ?? row['Notes']),
          cvFileName: this.normalizePositionName(row['cvFileName'] ?? row['CvFileName']),
          cvDataUrl: this.normalizePositionName(row['cvDataUrl'] ?? row['CvDataUrl']),
          hasCv: this.toBoolean(row['hasCv'] ?? row['HasCv'], !!this.normalizePositionName(row['cvDataUrl'] ?? row['CvDataUrl']))
        } as ApplicantRow;
      })
      .filter((row): row is ApplicantRow => !!row);
  }

  private async fetchApplicantCv(id: number): Promise<{ cvDataUrl: string; cvFileName: string } | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data?: unknown }>(`${this.apiUrl}/api/v1/applicants/records/${id}/cv`)
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

