import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-tags-permits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tags-permits.component.html',
  styleUrls: ['./tags-permits.component.scss']
})
export class TagsPermitsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private apiUrl = environment.apiUrl;

  activeTab = signal<'permits' | 'irp' | 'fuel-cards'>('permits');
  permits = signal<any[]>([]);
  drivers = signal<any[]>([]);
  motivFuelCards = signal<any[]>([]);
  searchTerm = signal('');
  typeFilter = signal('');
  statusFilter = signal('');
  loading = signal(false);
  saving = signal(false);
  showAddModal = signal(false);
  editingPermit = signal<any>(null);

  // Document upload
  uploadingDoc = signal(false);
  uploadTarget = signal<any>(null);   // permit being uploaded to
  permitDocFile: File | null = null;

  permitForm: any = { permitNumber: '', permitType: 'overweight', state: '', issueDate: '', expiryDate: '', cost: null, assignedDriverId: null, assignedTruckNumber: '', notes: '' };

  filteredPermits = computed(() => {
    let list = this.permits().filter(p => !this.irpTypes.includes(p.permitType));
    const search = this.searchTerm().toLowerCase();
    const type = this.typeFilter();
    const status = this.statusFilter();

    if (search) {
      list = list.filter(p =>
        (p.permitNumber || '').toLowerCase().includes(search) ||
        (p.assignedDriverName || '').toLowerCase().includes(search) ||
        (p.assignedTruckNumber || '').toLowerCase().includes(search) ||
        (p.state || '').toLowerCase().includes(search)
      );
    }
    if (type) list = list.filter(p => p.permitType === type);
    if (status) list = list.filter(p => this.getPermitStatus(p) === status);
    return list;
  });

  irpTypes = ['irp', 'ifta', 'cab_card'];

  filteredIrpPermits = computed(() => {
    let list = this.permits().filter(p => this.irpTypes.includes(p.permitType));
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();

    if (search) {
      list = list.filter(p =>
        (p.permitNumber || '').toLowerCase().includes(search) ||
        (p.assignedDriverName || '').toLowerCase().includes(search) ||
        (p.assignedTruckNumber || '').toLowerCase().includes(search) ||
        (p.state || '').toLowerCase().includes(search)
      );
    }
    if (status) list = list.filter(p => this.getPermitStatus(p) === status);
    return list;
  });

  filteredDrivers = computed(() => {
    const search = this.searchTerm().toLowerCase();
    let list = this.drivers();
    if (search) {
      list = list.filter((d: any) =>
        (d.name || '').toLowerCase().includes(search) ||
        (d.truckNumber || '').toLowerCase().includes(search) ||
        (d.truckTag || '').toLowerCase().includes(search)
      );
    }
    return list;
  });

  filteredFuelCardDrivers = computed(() => {
    const search = this.searchTerm().toLowerCase();
    const assignments = this.buildFuelCardAssignmentMap();
    let list = this.drivers()
      .filter((d: any) => this.isActiveDriverStatus(d?.status))
      .map((d: any) => {
        const key = this.buildDriverLookupKeys(d);
        const assigned = key
          .map(k => assignments.get(k))
          .find(v => !!v);

        return {
          id: d?.id,
          name: d?.name || d?.driverName || 'Unknown Driver',
          email: d?.email || '',
          truckNumber: d?.truckNumber || d?.assignedTruckNumber || d?.truckTag || '',
          status: d?.status || 'active',
          assignedFuelCard: assigned?.label ?? 'Unassigned',
          assignedFuelCardLast4: assigned?.last4 ?? 'N/A'
        };
      });

    if (search) {
      list = list.filter((d: any) =>
        String(d.name || '').toLowerCase().includes(search) ||
        String(d.email || '').toLowerCase().includes(search) ||
        String(d.truckNumber || '').toLowerCase().includes(search) ||
        String(d.assignedFuelCard || '').toLowerCase().includes(search)
      );
    }

    return list.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  });

  activePermits = computed(() => this.permits().filter(p => this.getPermitStatus(p) === 'active').length);
  expiringPermits = computed(() => this.permits().filter(p => this.getPermitStatus(p) === 'expiring').length);
  expiredPermits = computed(() => this.permits().filter(p => this.getPermitStatus(p) === 'expired').length);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    this.http.get<any>(`${this.apiUrl}/api/v1/company-permits`).subscribe({
      next: (res) => this.permits.set(res?.data || []),
      error: () => this.permits.set([])
    });
    this.http.get<any>(`${this.apiUrl}/api/v1/drivers?limit=1000`).subscribe({
      next: (res) => { this.drivers.set(res?.data || []); this.loading.set(false); },
      error: () => { this.drivers.set([]); this.loading.set(false); }
    });
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/fuel-cards`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivFuelCards.set(this.extractRows(payload));
      },
      error: () => this.motivFuelCards.set([])
    });
  }

  getPermitStatus(p: any): string {
    if (p.status === 'expired') return 'expired';
    if (!p.expiryDate) return p.status || 'active';
    const days = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring';
    return 'active';
  }

  openAddModal() {
    const defaultType = this.activeTab() === 'irp' ? 'irp' : 'overweight';
    this.permitForm = { permitNumber: '', permitType: defaultType, state: '', issueDate: '', expiryDate: '', cost: null, assignedDriverId: null, assignedTruckNumber: '', notes: '' };
    this.editingPermit.set(null);
    this.showAddModal.set(true);
  }

  editPermit(p: any) {
    this.editingPermit.set(p);
    this.permitForm = {
      permitNumber: p.permitNumber, permitType: p.permitType, state: p.state || '',
      issueDate: p.issueDate ? new Date(p.issueDate).toISOString().split('T')[0] : '',
      expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString().split('T')[0] : '',
      cost: p.cost, assignedDriverId: p.assignedDriverId, assignedTruckNumber: p.assignedTruckNumber || '', notes: p.notes || ''
    };
    this.showAddModal.set(true);
  }

  closeModal() {
    this.showAddModal.set(false);
    this.editingPermit.set(null);
    this.permitForm = { permitNumber: '', permitType: 'overweight', state: '', issueDate: '', expiryDate: '', cost: null, assignedDriverId: null, assignedTruckNumber: '', notes: '' };
  }

  savePermit() {
    if (!this.permitForm.permitNumber.trim()) { this.toast.error('Permit number is required', 'Error'); return; }
    this.saving.set(true);
    const editing = this.editingPermit();
    const body = { ...this.permitForm };
    if (body.issueDate) body.issueDate = new Date(body.issueDate).toISOString();
    if (body.expiryDate) body.expiryDate = new Date(body.expiryDate).toISOString();

    const req = editing
      ? this.http.put(`${this.apiUrl}/api/v1/company-permits/${editing.id}`, body)
      : this.http.post(`${this.apiUrl}/api/v1/company-permits`, body);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.loadData();
        this.toast.champagne(editing ? 'Permit updated' : 'Permit created', 'Success');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error || 'Failed to save permit', 'Error');
      }
    });
  }

  deletePermit(p: any) {
    if (!confirm(`Delete permit #${p.permitNumber}?`)) return;
    this.http.delete(`${this.apiUrl}/api/v1/company-permits/${p.id}`).subscribe({
      next: () => { this.loadData(); this.toast.champagne('Permit deleted', 'Deleted'); },
      error: () => this.toast.error('Failed to delete', 'Error')
    });
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getExpiryClass(d: string): string {
    if (!d) return '';
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring';
    return 'valid';
  }

  // ── Document handling ──────────────────────────────────────────────────

  openUploadDoc(p: any): void {
    this.uploadTarget.set(p);
    this.permitDocFile = null;
    // Trigger a hidden file input
    const input = document.getElementById('permit-doc-input') as HTMLInputElement;
    if (input) { input.value = ''; input.click(); }
  }

  onPermitDocSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.permitDocFile = file;
    this.uploadPermitDoc();
  }

  uploadPermitDoc(): void {
    const p = this.uploadTarget();
    const file = this.permitDocFile;
    if (!p || !file) return;

    this.uploadingDoc.set(true);
    const fd = new FormData();
    fd.append('file', file);

    this.http.post(`${this.apiUrl}/api/v1/company-permits/${p.id}/upload`, fd).subscribe({
      next: () => {
        this.toast.success(`Document uploaded for permit #${p.permitNumber}`, 'Uploaded');
        this.uploadingDoc.set(false);
        this.uploadTarget.set(null);
        this.permitDocFile = null;
        this.loadData(); // refresh so hasFile updates
      },
      error: () => {
        this.toast.error('Failed to upload document', 'Error');
        this.uploadingDoc.set(false);
      }
    });
  }

  viewPermitDoc(p: any): void {
    this.http.get(`${this.apiUrl}/api/v1/company-permits/${p.id}/document`,
      { responseType: 'blob' }
    ).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.toast.error('Failed to load document', 'Error')
    });
  }

  downloadPermitDoc(p: any): void {
    this.http.get(`${this.apiUrl}/api/v1/company-permits/${p.id}/download`,
      { responseType: 'blob' }
    ).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = p.fileName || `permit-${p.permitNumber}`;
        a.click();
      },
      error: () => this.toast.error('Failed to download', 'Error')
    });
  }

  deletePermitDoc(p: any): void {
    if (!confirm(`Remove document from permit #${p.permitNumber}?`)) return;
    this.http.delete(`${this.apiUrl}/api/v1/company-permits/${p.id}/document`).subscribe({
      next: () => { this.toast.success('Document removed', 'Removed'); this.loadData(); },
      error: () => this.toast.error('Failed to remove document', 'Error')
    });
  }

  private extractRows(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.cards)) return payload.cards;
    if (Array.isArray(payload?.fuel_cards)) return payload.fuel_cards;
    if (Array.isArray(payload?.payment_cards)) return payload.payment_cards;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  private isActiveDriverStatus(status: string): boolean {
    const normalized = String(status ?? '').trim().toLowerCase();
    return !normalized || normalized === 'active' || normalized === 'available' || normalized === 'online' || normalized === 'in_service';
  }

  private normalizeKey(value: any): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private normalizeNameKey(value: any): string {
    return this.normalizeKey(value).replace(/\s+/g, ' ').trim();
  }

  private buildDriverLookupKeys(driver: any): string[] {
    const keys = new Set<string>();
    const idKey = this.normalizeKey(driver?.id);
    const emailKey = this.normalizeKey(driver?.email);
    const nameKey = this.normalizeNameKey(driver?.name || driver?.driverName);
    if (idKey) keys.add(`id:${idKey}`);
    if (emailKey) keys.add(`email:${emailKey}`);
    if (nameKey) keys.add(`name:${nameKey}`);
    return Array.from(keys);
  }

  private buildFuelCardDisplay(card: any): string {
    const id = String(card?.id ?? card?.card_id ?? card?.cardId ?? '').trim();
    const name = String(card?.name ?? card?.card_name ?? card?.display_name ?? card?.nickname ?? '').trim();
    const rawLast4 =
      card?.last_four ??
      card?.last4 ??
      card?.last_digits ??
      card?.number_last4 ??
      card?.pan_last4 ??
      card?.masked_card_number ??
      card?.card_number;
    const digits = String(rawLast4 ?? '').replace(/\D/g, '');
    const last4 = digits.length >= 4 ? digits.slice(-4) : '';
    if (name) return name;
    if (last4) return `**** ${last4}`;
    if (id) return `Card ${id}`;
    return 'Assigned';
  }

  private buildFuelCardLast4(card: any): string {
    const rawLast4 =
      card?.last_four ??
      card?.last4 ??
      card?.last_digits ??
      card?.number_last4 ??
      card?.pan_last4 ??
      card?.masked_card_number ??
      card?.card_number;
    const digits = String(rawLast4 ?? '').replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : 'N/A';
  }

  private buildFuelCardAssignmentMap(): Map<string, { label: string; last4: string }> {
    const map = new Map<string, { label: string; last4: string }>();
    for (const raw of this.motivFuelCards()) {
      const card = raw?.card ?? raw?.fuel_card ?? raw?.payment_card ?? raw ?? {};
      const assignment = {
        label: this.buildFuelCardDisplay(card),
        last4: this.buildFuelCardLast4(card)
      };
      const assigned = card?.assigned_driver ?? card?.driver ?? card?.user ?? card?.holder ?? raw?.assigned_driver ?? raw?.driver ?? raw?.user ?? raw?.holder ?? {};
      const assignedName = [assigned?.first_name ?? assigned?.firstName, assigned?.last_name ?? assigned?.lastName].filter(Boolean).join(' ').trim() || assigned?.name;
      const assignedEmail = assigned?.email ?? assigned?.driver_email ?? raw?.assigned_driver_email;
      const assignedId = assigned?.id ?? assigned?.driver_id ?? assigned?.user_id ?? raw?.assigned_driver_id ?? raw?.driver_id ?? raw?.user_id;

      const idKey = this.normalizeKey(assignedId);
      const emailKey = this.normalizeKey(assignedEmail);
      const nameKey = this.normalizeNameKey(assignedName);

      if (idKey) map.set(`id:${idKey}`, assignment);
      if (emailKey) map.set(`email:${emailKey}`, assignment);
      if (nameKey) map.set(`name:${nameKey}`, assignment);
    }
    return map;
  }

  async copyAssignedFuelCard(value: string): Promise<void> {
    const text = String(value ?? '').trim();
    if (!text || text === 'Unassigned') return;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Fuel card copied', 'Copied');
    } catch {
      this.toast.error('Unable to copy fuel card', 'Error');
    }
  }
}
