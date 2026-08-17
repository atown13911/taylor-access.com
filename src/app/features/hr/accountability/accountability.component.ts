import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import {
  AccountabilityEntry,
  AccountabilityWritePayload,
  AccountabilityService,
} from '../../../core/services/accountability.service';

@Component({
  selector: 'app-accountability',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './accountability.component.html',
  styleUrls: ['./accountability.component.scss'],
})
export class AccountabilityComponent implements OnInit {
  private api = inject(AccountabilityService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  loading = signal(false);
  saving = signal(false);
  searchQuery = signal('');
  showForm = signal(false);
  editingId = signal<number | null>(null);

  form: AccountabilityWritePayload = this.blankForm();

  entries = this.api.entries;

  filtered = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    let rows = this.entries();
    if (q) {
      rows = rows.filter(
        (e) =>
          e.jobPosition.toLowerCase().includes(q) ||
          (e.individual || '').toLowerCase().includes(q) ||
          (e.notes || '').toLowerCase().includes(q)
      );
    }
    return rows;
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.load().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load accountability chart');
      },
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form = this.blankForm();
    this.showForm.set(true);
  }

  openEdit(row: AccountabilityEntry): void {
    this.editingId.set(row.id);
    this.form = {
      jobPosition: row.jobPosition,
      individual: row.individual || '',
      notes: row.notes || '',
    };
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    const jobPosition = (this.form.jobPosition || '').trim();
    if (!jobPosition) {
      this.toast.error('Job position is required');
      return;
    }

    const payload: AccountabilityWritePayload = {
      jobPosition,
      individual: (this.form.individual || '').trim() || null,
      notes: (this.form.notes || '').trim() || null,
    };

    this.saving.set(true);
    const id = this.editingId();
    const req$ = id == null ? this.api.create(payload) : this.api.update(id, payload);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.editingId.set(null);
        this.toast.success(id == null ? 'Position added' : 'Position updated');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error || 'Save failed');
      },
    });
  }

  async remove(row: AccountabilityEntry): Promise<void> {
    const ok = await this.confirm.danger(
      `Remove "${row.jobPosition}" from the accountability chart?`,
      'Remove Position'
    );
    if (!ok) return;

    this.api.delete(row.id).subscribe({
      next: () => this.toast.success('Position removed'),
      error: () => this.toast.error('Failed to remove position'),
    });
  }

  private blankForm(): AccountabilityWritePayload {
    return { jobPosition: '', individual: '', notes: '' };
  }
}
