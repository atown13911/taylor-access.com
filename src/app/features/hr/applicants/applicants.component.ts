import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

type ApplicantStatus = 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';

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
      </div>

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
                    <option value="rejected">Rejected</option>
                  </select>
                </td>
                <td>{{ row.appliedDate || '—' }}</td>
                <td>
                  @if (row.cvDataUrl) {
                    <button class="cv-link-btn" (click)="$event.stopPropagation(); viewCv(row)">View</button>
                  } @else {
                    —
                  }
                </td>
                <td>{{ row.notes || '—' }}</td>
                <td>
                  <div class="action-icons">
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
    .filters { display: flex; gap: 10px; margin: 10px 0 14px; input, select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 8px 10px; } input { min-width: 280px; } }
    .sync-error { margin: -4px 0 10px; color: #fda4af; font-size: 0.82rem; }
    .table-wrap { border: 1px solid #2a2a4e; border-radius: 10px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 12px; background: #0d0d1a; color: #8aa0b8; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid #2a2a4e; }
    td { padding: 12px; color: #d1d5db; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
    .applicant-row { cursor: pointer; }
    .applicant-row.selected td { background: rgba(0, 212, 255, 0.08); }
    td select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 6px 8px; }
    .action-icons { display: flex; gap: 6px; }
    .icon-btn { border: 1px solid #2a2a4e; background: #111827; color: #cbd5e1; border-radius: 6px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .icon-btn:hover { border-color: #4b5c84; color: #fff; }
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
  positionStateFilter = signal<'active' | 'inactive'>('active');
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

  filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const selectedPosition = this.selectedPosition();
    return this.rows().filter((r) => {
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
      cvDataUrl: row.cvDataUrl
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

  setPositionStateFilter(mode: 'active' | 'inactive'): void {
    this.positionStateFilter.set(mode);
    this.selectedPosition.set('all');
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
      cvDataUrl: ''
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
    };
    reader.readAsDataURL(file);
  }

  viewCv(row: ApplicantRow): void {
    if (!row.cvDataUrl) return;
    const w = window.open(row.cvDataUrl, '_blank', 'noopener,noreferrer');
    if (!w) {
      this.applicantsSyncError.set('Popup blocked. Please allow popups to view CV files.');
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
        this.http.get<{ data?: unknown[] }>(`${this.apiUrl}/api/v1/applicants/records`)
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
          cvDataUrl: this.normalizePositionName(row['cvDataUrl'] ?? row['CvDataUrl'])
        } as ApplicantRow;
      })
      .filter((row): row is ApplicantRow => !!row);
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
    if (v === 'screening' || v === 'interview' || v === 'offer' || v === 'hired' || v === 'rejected') {
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
}

