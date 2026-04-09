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
  position: string;
  source: string;
  status: ApplicantStatus;
  appliedDate: string;
  notes: string;
}

interface ApplicantPosition {
  name: string;
  isActive: boolean;
}

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

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Position</th>
              <th>Source</th>
              <th>Status</th>
              <th>Applied</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            @for (row of filteredRows(); track row.id) {
              <tr>
                <td><strong>{{ row.fullName }}</strong></td>
                <td>{{ row.position || '—' }}</td>
                <td>{{ row.source || '—' }}</td>
                <td>
                  <select [ngModel]="row.status" (ngModelChange)="setStatus(row.id, $event)">
                    <option value="new">New</option>
                    <option value="screening">Screening</option>
                    <option value="interview">Interview</option>
                    <option value="offer">Offer</option>
                    <option value="hired">Hired</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </td>
                <td>{{ row.appliedDate || '—' }}</td>
                <td>{{ row.notes || '—' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="empty">No applicants yet.</td>
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
            <div class="actions">
              <button class="btn-secondary" (click)="showCreate.set(false)">Cancel</button>
              <button class="btn-primary" (click)="saveDraft()">Save</button>
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
    .table-wrap { border: 1px solid #2a2a4e; border-radius: 10px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 12px; background: #0d0d1a; color: #8aa0b8; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid #2a2a4e; }
    td { padding: 12px; color: #d1d5db; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
    td select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 6px 8px; }
    .empty { text-align: center; color: #8aa0b8; padding: 20px; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { width: 100%; max-width: 520px; background: #161a2a; border: 1px solid #2a2a4e; border-radius: 12px; padding: 16px; h3 { margin-top: 0; color: #fff; } }
    .modal-small { max-width: 420px; }
    .form-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; label { color: #8aa0b8; font-size: 0.8rem; } input, textarea, select { background: #111827; color: #d1d5db; border: 1px solid #2a2a4e; border-radius: 8px; padding: 8px 10px; } }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  `]
})
export class ApplicantsComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly storageKey = 'ta.hr.applicants.v1';
  private readonly localFallbackPositionsStorageKey = 'ta.hr.applicant-positions.v1';
  private readonly apiUrl = environment.apiUrl;
  rows = signal<ApplicantRow[]>([]);
  customPositions = signal<ApplicantPosition[]>([]);
  selectedPosition = signal<string>('all');
  positionStateFilter = signal<'active' | 'inactive'>('active');
  search = signal('');
  statusFilter = signal<'all' | ApplicantStatus>('all');
  showCreate = signal(false);
  showAddPosition = signal(false);
  showPositionSettings = signal(false);
  newPositionName = signal('');
  positionSettingsOriginalName = signal('');
  positionSettingsTargetName = signal('');
  positionSettingsTargetActive = signal(true);
  private positionsRefreshTimer: any;
  draft: Omit<ApplicantRow, 'id' | 'status'> & { status?: ApplicantStatus } = this.emptyDraft();

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
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.rows.set(parsed as ApplicantRow[]);
      }
    } catch {
      // no-op
    }

    try {
      const raw = localStorage.getItem(this.localFallbackPositionsStorageKey);
      if (raw) {
        this.customPositions.set(this.parsePositionPayload(JSON.parse(raw)));
      }
    } catch {
      // no-op
    }

    void this.loadSharedPositions();
    this.positionsRefreshTimer = setInterval(() => void this.loadSharedPositions(), 15000);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  ngOnDestroy(): void {
    if (this.positionsRefreshTimer) clearInterval(this.positionsRefreshTimer);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  openCreate(): void {
    this.draft = this.emptyDraft();
    this.showCreate.set(true);
  }

  async saveDraft(): Promise<void> {
    const fullName = String(this.draft.fullName || '').trim();
    if (!fullName) return;
    const position = String(this.draft.position || '').trim();
    const next: ApplicantRow = {
      id: Date.now(),
      fullName,
      position,
      source: String(this.draft.source || '').trim(),
      status: this.draft.status || 'new',
      appliedDate: this.draft.appliedDate || new Date().toISOString().slice(0, 10),
      notes: String(this.draft.notes || '').trim()
    };
    this.rows.update((list) => [next, ...list]);
    if (position) await this.addCustomPosition(position, true, true);
    this.persist();
    this.showCreate.set(false);
  }

  setStatus(id: number, status: ApplicantStatus): void {
    this.rows.update((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
    this.persist();
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

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.rows()));
    } catch {
      // no-op
    }
  }

  private emptyDraft() {
    return {
      fullName: '',
      position: '',
      source: '',
      appliedDate: new Date().toISOString().slice(0, 10),
      notes: ''
    };
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

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
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

  private ensureSelectedPositionValid(): void {
    const selected = this.selectedPosition();
    if (selected === 'all') return;
    const valid = this.positionTabs().some((tab) => tab.toLowerCase() === selected.toLowerCase());
    if (!valid) this.selectedPosition.set('all');
  }

  private normalizePositionName(value: unknown): string {
    return String(value ?? '').trim();
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

