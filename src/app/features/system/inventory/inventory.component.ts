import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import {
  ExternalSiteRecord,
  ExternalSiteWritePayload,
  ExternalSitesService,
} from '../../../core/services/external-sites.service';

type InventoryStatusTab = 'active' | 'inactive';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss'],
})
export class InventoryComponent implements OnInit {
  private sitesApi = inject(ExternalSitesService);
  private toast = inject(ToastService);

  loading = signal(false);
  saving = signal(false);
  searchQuery = signal('');
  statusTab = signal<InventoryStatusTab>('active');
  showForm = signal(false);
  editingId = signal<number | null>(null);
  revealedPasswords = signal<Set<number>>(new Set());

  form: ExternalSiteWritePayload = this.blankForm();
  categories = ['Terminal', 'Steamship', 'Broker', 'Chassis', 'Customs', 'Other'];

  sites = this.sitesApi.sites;

  filtered = computed(() => {
    const wantActive = this.statusTab() === 'active';
    let rows = this.sites().filter((s) => !!s.isActive === wantActive);
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.url || '').toLowerCase().includes(q) ||
          (s.username || '').toLowerCase().includes(q) ||
          (s.category || '').toLowerCase().includes(q) ||
          (s.notes || '').toLowerCase().includes(q)
      );
    }
    return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
  });

  stats = computed(() => {
    const all = this.sites();
    return {
      total: all.length,
      active: all.filter((s) => s.isActive).length,
      inactive: all.filter((s) => !s.isActive).length,
    };
  });

  ngOnInit(): void {
    this.reload();
  }

  setStatusTab(tab: InventoryStatusTab): void {
    this.statusTab.set(tab);
  }

  reload(): void {
    this.loading.set(true);
    this.sitesApi.load(true).subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load site inventory');
      },
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form = this.blankForm();
    this.form.isActive = this.statusTab() === 'active';
    this.showForm.set(true);
  }

  openEdit(row: ExternalSiteRecord): void {
    this.editingId.set(row.id);
    this.form = {
      name: row.name,
      url: row.url || '',
      username: row.username || '',
      password: row.password || '',
      category: row.category || '',
      notes: row.notes || '',
      isActive: row.isActive,
    };
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    const name = (this.form.name || '').trim();
    const url = (this.form.url || '').trim();
    if (!name) {
      this.toast.error('Site name is required');
      return;
    }
    if (!url) {
      this.toast.error('URL is required');
      return;
    }

    const payload: ExternalSiteWritePayload = {
      name,
      url,
      username: (this.form.username || '').trim() || null,
      password: (this.form.password || '').trim() || null,
      category: (this.form.category || '').trim() || null,
      notes: (this.form.notes || '').trim() || null,
      isActive: this.form.isActive !== false,
    };

    this.saving.set(true);
    const id = this.editingId();
    const req$ = id == null ? this.sitesApi.create(payload) : this.sitesApi.update(id, payload);
    req$.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.showForm.set(false);
        this.editingId.set(null);
        this.toast.success(id == null ? 'Site added' : 'Site updated');
        if (saved && typeof saved.isActive === 'boolean') {
          this.statusTab.set(saved.isActive ? 'active' : 'inactive');
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error || 'Save failed');
      },
    });
  }

  isPasswordRevealed(id: number): boolean {
    return this.revealedPasswords().has(id);
  }

  togglePassword(id: number): void {
    this.revealedPasswords.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async copyText(value: string | null | undefined, label: string): Promise<void> {
    const text = (value || '').trim();
    if (!text) {
      this.toast.error(`No ${label} to copy`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(`${label} copied`);
    } catch {
      this.toast.error(`Could not copy ${label}`);
    }
  }

  openSite(url: string | null | undefined): void {
    const href = (url || '').trim();
    if (!href) {
      this.toast.error('No URL set for this site');
      return;
    }
    const withProtocol =
      /^https?:\/\//i.test(href) ? href : `https://${href}`;
    window.open(withProtocol, '_blank', 'noopener,noreferrer');
  }

  displayHost(url: string | null | undefined): string {
    const raw = (url || '').trim();
    if (!raw) return '—';
    try {
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      return new URL(withProtocol).hostname.replace(/^www\./i, '');
    } catch {
      return raw;
    }
  }

  private blankForm(): ExternalSiteWritePayload {
    return {
      name: '',
      url: '',
      username: '',
      password: '',
      category: '',
      notes: '',
      isActive: true,
    };
  }
}
