import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

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

      <div class="position-tabs-wrap">
        <div class="position-tabs">
          @for (position of positionTabs(); track position) {
            <button
              class="position-tab"
              [class.active]="selectedPosition() === position"
              (click)="selectPosition(position)"
            >
              {{ position === 'all' ? 'All Positions' : position }}
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
    </div>
  `,
  styles: [`
    .applicants-page { padding: 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; h1 { margin: 0; color: #fff; display: flex; align-items: center; gap: 10px; i { color: #00d4ff; } } p { margin: 4px 0 0; color: #8aa0b8; } }
    .btn-primary { background: linear-gradient(135deg, #00d4ff, #0080ff); border: none; color: #0a0a14; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .btn-secondary { background: #253049; border: none; color: #dbeafe; border-radius: 8px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
    .position-tabs-wrap { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .position-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
    .position-tab { background: #111827; color: #9fb2c8; border: 1px solid #2a2a4e; border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 0.84rem; }
    .position-tab.active { border-color: #00d4ff; color: #d9f6ff; background: rgba(0, 212, 255, 0.12); }
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
export class ApplicantsComponent implements OnInit {
  private readonly storageKey = 'ta.hr.applicants.v1';
  private readonly positionsStorageKey = 'ta.hr.applicant-positions.v1';
  rows = signal<ApplicantRow[]>([]);
  customPositions = signal<string[]>([]);
  selectedPosition = signal<string>('all');
  search = signal('');
  statusFilter = signal<'all' | ApplicantStatus>('all');
  showCreate = signal(false);
  showAddPosition = signal(false);
  newPositionName = signal('');
  draft: Omit<ApplicantRow, 'id' | 'status'> & { status?: ApplicantStatus } = this.emptyDraft();

  positionTabs = computed(() => {
    const merged = new Set<string>();
    for (const p of this.customPositions()) {
      const normalized = String(p || '').trim();
      if (normalized) merged.add(normalized);
    }
    for (const row of this.rows()) {
      const normalized = String(row.position || '').trim();
      if (normalized) merged.add(normalized);
    }
    return ['all', ...Array.from(merged).sort((a, b) => a.localeCompare(b))];
  });

  positionOptionsForForm = computed(() => this.positionTabs().filter((p) => p !== 'all'));

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
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.rows.set(parsed as ApplicantRow[]);
    } catch {
      // no-op
    }

    try {
      const raw = localStorage.getItem(this.positionsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.customPositions.set(
          parsed
            .map((p: unknown) => String(p || '').trim())
            .filter((p: string) => !!p)
        );
      }
    } catch {
      // no-op
    }
  }

  openCreate(): void {
    this.draft = this.emptyDraft();
    this.showCreate.set(true);
  }

  saveDraft(): void {
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
    if (position) this.addCustomPosition(position);
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

  openAddPosition(): void {
    this.newPositionName.set('');
    this.showAddPosition.set(true);
  }

  addPosition(): void {
    const value = String(this.newPositionName() || '').trim();
    if (!value) return;
    this.addCustomPosition(value);
    this.selectedPosition.set(value);
    this.newPositionName.set('');
    this.showAddPosition.set(false);
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

  private addCustomPosition(position: string): void {
    const normalized = String(position || '').trim();
    if (!normalized) return;
    this.customPositions.update((list) => {
      const exists = list.some((p) => p.toLowerCase() === normalized.toLowerCase());
      if (exists) return list;
      const next = [...list, normalized].sort((a, b) => a.localeCompare(b));
      try {
        localStorage.setItem(this.positionsStorageKey, JSON.stringify(next));
      } catch {
        // no-op
      }
      return next;
    });
  }
}

