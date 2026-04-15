import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
  private trailerApiUrl = `${this.apiUrl}/api/v1/assets-proxy`;
  private trailerApiRoot = this.trailerApiUrl.replace(/\/+$/, '');
  private readonly trailerStatusOverridesKey = 'ta_trailer_status_overrides';

  activeTab = signal<'permits' | 'irp' | 'trailer' | 'fuel-cards'>('permits');
  permits = signal<any[]>([]);
  trailers = signal<any[]>([]);
  drivers = signal<any[]>([]);
  motivFuelCards = signal<any[]>([]);
  searchTerm = signal('');
  typeFilter = signal('');
  statusFilter = signal('');
  loading = signal(false);
  saving = signal(false);
  showAddModal = signal(false);
  editingPermit = signal<any>(null);
  trailerModalTab = signal<'details' | 'photo'>('details');

  // Document upload
  uploadingDoc = signal(false);
  uploadTarget = signal<any>(null);   // permit being uploaded to
  permitDocFile: File | null = null;
  trailerPhotoUploading = signal(false);
  trailerPhotoFileName = signal('');
  trailerPhotoPreviewUrl = signal<string | null>(null);
  private trailerPhotoFile: File | null = null;
  private trailerStatusOverrides = signal<Record<string, 'active' | 'inactive' | 'returned' | 'closed_out'>>({});
  readonly trailerVendorOptions = ['ryder', 'metro', 'taylor_leasing', 'other'] as const;

  permitForm: any = { trailerId: null, permitNumber: '', permitType: 'overweight', state: '', issueDate: '', expiryDate: '', cost: null, vendor: 'other', chargeFrequency: 'monthly', trailerStatus: 'active', assignedDriverId: null, assignedTruckNumber: '', notes: '' };

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

  filteredTrailerPermits = computed(() => {
    let list = this.trailers().map((t: any) => this.mapTrailerRow(t));
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    const type = this.typeFilter();

    if (search) {
      list = list.filter(p =>
        (p.permitNumber || '').toLowerCase().includes(search) ||
        (p.notes || '').toLowerCase().includes(search) ||
        (p.vendorLabel || p.vendor || '').toLowerCase().includes(search) ||
        (p.assignedDriverName || '').toLowerCase().includes(search) ||
        (p.assignedTruckNumber || '').toLowerCase().includes(search) ||
        (p.state || '').toLowerCase().includes(search)
      );
    }
    if (type) list = list.filter(p => (p.permitType || '') === type);
    if (status === 'active' || status === 'inactive' || status === 'returned' || status === 'closed_out') {
      list = list.filter(p => this.getTrailerAssignmentStatus(p) === status);
    }
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

  dashboardCards = computed(() => {
    const tab = this.activeTab();

    if (tab === 'fuel-cards') {
      const rows = this.filteredFuelCardDrivers();
      const assigned = rows.filter((d: any) => String(d?.assignedFuelCard || '') !== 'Unassigned').length;
      const unassigned = Math.max(rows.length - assigned, 0);
      const uniqueAssignedCards = new Set(
        rows
          .map((d: any) => String(d?.assignedFuelCard || '').trim())
          .filter((v: string) => !!v && v !== 'Unassigned')
      ).size;

      return [
        { icon: 'bx-user-check', label: 'Active Drivers', value: rows.length },
        { icon: 'bx-credit-card-front', label: 'Assigned Cards', value: assigned },
        { icon: 'bx-user-x', label: 'Unassigned Drivers', value: unassigned },
        { icon: 'bx-card', label: 'Unique Cards In Use', value: uniqueAssignedCards }
      ];
    }

    if (tab === 'trailer') {
      const rows = this.filteredTrailerPermits();
      const assigned = rows.filter((p: any) => String(p?.assignedDriverName || '').trim().length > 0).length;
      const unassigned = Math.max(rows.length - assigned, 0);
      const expiring = rows.filter((p: any) => this.getPermitStatus(p) === 'expiring').length;

      return [
        { icon: 'bx-package', label: 'Total Trailers', value: rows.length },
        { icon: 'bx-user-check', label: 'Assigned Drivers', value: assigned },
        { icon: 'bx-user-x', label: 'Unassigned Trailers', value: unassigned },
        { icon: 'bx-error', label: 'Expiring Soon', value: expiring }
      ];
    }

    const rows = tab === 'irp' ? this.filteredIrpPermits() : this.filteredPermits();
    const totalLabel = tab === 'irp' ? 'Total IRP Tags' : 'Total Permits';
    const active = rows.filter((p: any) => this.getPermitStatus(p) === 'active').length;
    const expiring = rows.filter((p: any) => this.getPermitStatus(p) === 'expiring').length;
    const expired = rows.filter((p: any) => this.getPermitStatus(p) === 'expired').length;

    return [
      { icon: 'bx-file', label: totalLabel, value: rows.length },
      { icon: 'bx-check-circle', label: 'Active', value: active },
      { icon: 'bx-error', label: 'Expiring Soon', value: expiring },
      { icon: 'bx-x-circle', label: 'Expired', value: expired }
    ];
  });

  private readonly baseTrailerTypeOptions: Array<{ value: string; label: string }> = [
    { value: 'standard_equipment', label: 'Standard Equipment' },
    { value: 'dry_van', label: 'Dry Van' },
    { value: 'reefer', label: 'Reefer' },
    { value: 'flatbed', label: 'Flatbed' },
    { value: 'step_deck', label: 'Step Deck' },
    { value: 'conestoga', label: 'Conestoga' },
    { value: 'lowboy', label: 'Lowboy' },
    { value: 'tanker', label: 'Tanker' },
    { value: 'chassis', label: 'Chassis' },
    { value: 'dump', label: 'Dump' },
    { value: 'power_only', label: 'Power Only' },
    { value: 'other', label: 'Other' }
  ];
  trailerTypeOptions = computed(() => {
    const options = [...this.baseTrailerTypeOptions];
    const known = new Set(options.map(o => o.value.toLowerCase()));
    const fromData = this.trailers()
      .map((t: any) => String(t?.type ?? '').trim().toLowerCase())
      .filter((v: string) => !!v);

    for (const value of fromData) {
      if (known.has(value)) continue;
      known.add(value);
      options.push({ value, label: this.formatTypeLabel(value) });
    }

    return options;
  });
  trailerOptions = computed(() => {
    return this.trailers()
      .map((t: any) => ({
        id: t?.id,
        number: t?.number || t?.trailerNumber || t?.unitNumber || t?.truckNumber || '',
        tag: t?.tagNumber || t?.permitNumber || '',
        type: t?.type || 'trailer'
      }))
      .filter((t: any) => t.id != null)
      .sort((a: any, b: any) => String(a.number || a.tag || a.id).localeCompare(String(b.number || b.tag || b.id)));
  });

  ngOnInit() {
    this.loadTrailerStatusOverrides();
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
    void this.loadTrailersWithFallback();
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

  getTrailerAssignmentStatus(p: any): 'active' | 'inactive' | 'returned' | 'closed_out' {
    const rawStatus = String(
      p?.assignmentStatus
      ?? p?.trailerStatus
      ?? p?.driverAssignmentStatus
      ?? p?.status
      ?? ''
    ).trim().toLowerCase();

    if (
      rawStatus === 'inactive'
      || rawStatus === 'available'
      || rawStatus === 'unassigned'
      || rawStatus === 'idle'
    ) {
      return 'inactive';
    }
    if (rawStatus === 'return' || rawStatus === 'returned') {
      return 'returned';
    }
    if (rawStatus === 'closed out' || rawStatus === 'closed_out' || rawStatus === 'closedout' || rawStatus === 'closed-out') {
      return 'closed_out';
    }

    const isAssigned = !!(
      p?.assignedDriverId
      || String(p?.assignedDriverName || '').trim()
      || rawStatus === 'active'
      || rawStatus === 'assigned'
      || rawStatus === 'rented'
      || rawStatus === 'in_use'
      || rawStatus === 'in-use'
    );

    return isAssigned ? 'active' : 'inactive';
  }

  getTrailerStatusLabel(p: any): string {
    const code = this.getTrailerAssignmentStatus(p);
    if (code === 'closed_out') return 'Closed Out';
    if (code === 'returned') return 'Returned';
    return code === 'active' ? 'Active' : 'Inactive';
  }

  private normalizeTrailerStatus(value: unknown): 'active' | 'inactive' | 'returned' | 'closed_out' {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'returned' || raw === 'return') return 'returned';
    if (raw === 'closed_out' || raw === 'closed out' || raw === 'closed-out' || raw === 'closedout') return 'closed_out';
    if (raw === 'inactive') return 'inactive';
    return 'active';
  }

  private normalizeTrailerVendor(value: unknown): 'ryder' | 'metro' | 'taylor_leasing' | 'other' {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return 'other';
    if (raw === 'ryder') return 'ryder';
    if (raw === 'metro') return 'metro';
    if (raw === 'taylor_leasing' || raw === 'taylor leasing' || raw === 'taylor-leasing') return 'taylor_leasing';
    return 'other';
  }

  getTrailerVendorLabel(value: unknown): string {
    const vendor = this.normalizeTrailerVendor(value);
    if (vendor === 'ryder') return 'Ryder';
    if (vendor === 'metro') return 'Metro';
    if (vendor === 'taylor_leasing') return 'Taylor Leasing';
    return 'Other';
  }

  private mapTrailerBackendStatus(status: 'active' | 'inactive' | 'returned' | 'closed_out'): string {
    if (status === 'active') return 'rented';
    if (status === 'inactive') return 'available';
    return status;
  }

  private mapEquipmentBackendStatus(status: 'active' | 'inactive' | 'returned' | 'closed_out'): string {
    if (status === 'active') return 'in_use';
    if (status === 'inactive') return 'available';
    return status;
  }

  private getTrailerStatusOverride(trailerId: unknown): 'active' | 'inactive' | 'returned' | 'closed_out' | null {
    const key = String(trailerId ?? '').trim();
    if (!key) return null;
    return this.trailerStatusOverrides()[key] ?? null;
  }

  private setTrailerStatusOverride(trailerId: unknown, status: 'active' | 'inactive' | 'returned' | 'closed_out'): void {
    const key = String(trailerId ?? '').trim();
    if (!key) return;
    const next = { ...this.trailerStatusOverrides(), [key]: status };
    this.trailerStatusOverrides.set(next);
    this.persistTrailerStatusOverrides(next);
  }

  private loadTrailerStatusOverrides(): void {
    try {
      const raw = localStorage.getItem(this.trailerStatusOverridesKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const next: Record<string, 'active' | 'inactive' | 'returned' | 'closed_out'> = {};
      for (const [id, value] of Object.entries(parsed)) {
        next[String(id)] = this.normalizeTrailerStatus(value);
      }
      this.trailerStatusOverrides.set(next);
    } catch {
      // Ignore malformed local values.
    }
  }

  private persistTrailerStatusOverrides(overrides: Record<string, 'active' | 'inactive' | 'returned' | 'closed_out'>): void {
    try {
      localStorage.setItem(this.trailerStatusOverridesKey, JSON.stringify(overrides));
    } catch {
      // Ignore storage issues.
    }
  }

  selectMainTab(tab: 'permits' | 'irp' | 'trailer' | 'fuel-cards'): void {
    this.activeTab.set(tab);

    if (tab === 'trailer') {
      const value = this.statusFilter();
      if (value && value !== 'active' && value !== 'inactive' && value !== 'returned' && value !== 'closed_out') {
        this.statusFilter.set('');
      }
      return;
    }

    if (this.statusFilter() === 'inactive' || this.statusFilter() === 'returned' || this.statusFilter() === 'closed_out') {
      this.statusFilter.set('');
    }
  }

  openAddModal() {
    const tab = this.activeTab();
    const defaultType = tab === 'irp'
      ? 'irp'
      : (tab === 'trailer' ? 'standard_equipment' : 'overweight');
    this.permitForm = { trailerId: null, permitNumber: '', permitType: defaultType, state: '', issueDate: '', expiryDate: '', cost: null, vendor: 'other', chargeFrequency: 'monthly', trailerStatus: 'active', assignedDriverId: null, assignedTruckNumber: '', notes: '' };
    this.editingPermit.set(null);
    this.trailerModalTab.set('details');
    this.resetTrailerPhotoState();
    this.showAddModal.set(true);
  }

  editPermit(p: any) {
    this.editingPermit.set(p);
    this.permitForm = {
      trailerId: p.id ?? null,
      permitNumber: p.permitNumber, permitType: p.permitType, state: p.state || '',
      issueDate: p.issueDate ? new Date(p.issueDate).toISOString().split('T')[0] : '',
      expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString().split('T')[0] : '',
      cost: p.cost,
      vendor: this.normalizeTrailerVendor(p.vendor || p.lessor || p.leasingVendor || p.provider),
      chargeFrequency: p.chargeFrequency || p.billingFrequency || p.rateFrequency || p.frequency || 'monthly',
      trailerStatus: p.trailerStatus || this.getTrailerAssignmentStatus(p),
      assignedDriverId: p.assignedDriverId, assignedTruckNumber: p.assignedTruckNumber || '', notes: p.notes || '',
      photoUrl: p.photoUrl || p.imageUrl || p.trailerPhotoUrl || p.avatarUrl || null
    };
    this.trailerModalTab.set('details');
    this.resetTrailerPhotoState(this.permitForm.photoUrl || null);
    this.showAddModal.set(true);
  }

  closeModal() {
    this.showAddModal.set(false);
    this.editingPermit.set(null);
    this.trailerModalTab.set('details');
    this.resetTrailerPhotoState();
    this.permitForm = { trailerId: null, permitNumber: '', permitType: 'overweight', state: '', issueDate: '', expiryDate: '', cost: null, vendor: 'other', chargeFrequency: 'monthly', trailerStatus: 'active', assignedDriverId: null, assignedTruckNumber: '', notes: '' };
  }

  onTrailerSelectionChange(trailerId: any): void {
    if (this.activeTab() !== 'trailer') return;
    const id = String(trailerId ?? '').trim();
    if (!id) return;
    const trailer = this.trailers().find((t: any) => `${t?.id}` === id);
    if (!trailer) return;

    const row = this.mapTrailerRow(trailer);
    this.permitForm = {
      ...this.permitForm,
      trailerId: trailer?.id ?? null,
      permitNumber: row.permitNumber || this.permitForm.permitNumber,
      permitType: row.permitType || this.permitForm.permitType || 'trailer',
      state: row.state || this.permitForm.state || '',
      issueDate: row.issueDate ? new Date(row.issueDate).toISOString().split('T')[0] : (this.permitForm.issueDate || ''),
      expiryDate: row.expiryDate ? new Date(row.expiryDate).toISOString().split('T')[0] : (this.permitForm.expiryDate || ''),
      cost: row.cost ?? this.permitForm.cost ?? null,
      vendor: row.vendor || this.permitForm.vendor || 'other',
      chargeFrequency: row.chargeFrequency || this.permitForm.chargeFrequency || 'monthly',
      trailerStatus: row.trailerStatus || this.permitForm.trailerStatus || 'active',
      assignedDriverId: row.assignedDriverId ?? this.permitForm.assignedDriverId ?? null,
      assignedTruckNumber: row.assignedTruckNumber || this.permitForm.assignedTruckNumber || '',
      notes: row.notes || this.permitForm.notes || '',
      photoUrl: row.photoUrl || row.imageUrl || this.permitForm.photoUrl || null
    };
    this.resetTrailerPhotoState(this.permitForm.photoUrl || null);
  }

  savePermit() {
    if (this.activeTab() === 'trailer') {
      const selectedTrailer = this.trailers().find((t: any) => `${t?.id}` === `${this.permitForm?.trailerId ?? ''}`);
      const derivedTrailerTag = String(
        this.permitForm?.permitNumber ||
        this.permitForm?.assignedTruckNumber ||
        selectedTrailer?.tagNumber ||
        selectedTrailer?.permitNumber ||
        selectedTrailer?.number ||
        selectedTrailer?.trailerNumber ||
        ''
      ).trim();
      if (!derivedTrailerTag) {
        this.toast.error('Trailer tag number or trailer # is required', 'Error');
        return;
      }
      this.permitForm = { ...this.permitForm, permitNumber: derivedTrailerTag };
      void this.saveTrailer();
      return;
    }
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
    if (this.activeTab() === 'trailer') {
      this.deleteTrailer(p);
      return;
    }
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

  isTrailerTab(): boolean {
    return this.activeTab() === 'trailer';
  }

  pageTitle(): string {
    return this.isTrailerTab() ? 'Trailer Assignments' : 'Company Tags & Permits';
  }

  pageSubtitle(): string {
    return this.isTrailerTab()
      ? 'Add trailer tags and assign drivers to active trailers'
      : 'Manage company-owned overweight/oversize permits and IRP registrations';
  }

  searchPlaceholder(): string {
    return this.isTrailerTab() ? 'Search trailer tags...' : 'Search permits...';
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

  openTrailerPhotoPicker(): void {
    const input = document.getElementById('trailer-photo-input') as HTMLInputElement | null;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onTrailerPhotoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (!file) return;
    this.trailerPhotoFile = file;
    this.trailerPhotoFileName.set(file.name);
    this.setTrailerPhotoPreview(URL.createObjectURL(file));
  }

  clearTrailerPhotoSelection(): void {
    this.trailerPhotoFile = null;
    this.trailerPhotoFileName.set('');
    this.setTrailerPhotoPreview(this.permitForm?.photoUrl || null);
  }

  async uploadTrailerPhoto(): Promise<void> {
    const trailerId = String(this.permitForm?.trailerId ?? this.editingPermit()?.id ?? '').trim();
    if (!trailerId) {
      this.toast.error('Save or select a trailer first before uploading a photo.', 'Photo upload');
      return;
    }
    if (!this.trailerPhotoFile) {
      this.toast.error('Select a photo file first.', 'Photo upload');
      return;
    }

    this.trailerPhotoUploading.set(true);
    try {
      const url = await this.tryUploadTrailerPhoto(trailerId, this.trailerPhotoFile);
      if (url) {
        this.permitForm = { ...this.permitForm, photoUrl: url };
        this.setTrailerPhotoPreview(url);
      }
      this.trailerPhotoFile = null;
      this.trailerPhotoFileName.set('');
      this.toast.success('Trailer photo uploaded', 'Success');
      this.loadData();
    } catch (err: any) {
      this.toast.error(this.extractErrorMessage(err, 'Failed to upload trailer photo'), 'Photo upload');
    } finally {
      this.trailerPhotoUploading.set(false);
    }
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

  private isTrailerPermitType(rawType: any): boolean {
    const type = String(rawType ?? '').trim().toLowerCase();
    if (!type) return false;
    return type === 'trailer'
      || type === 'trailer_tag'
      || type === 'trailer_registration'
      || type === 'trailer-permit'
      || type.includes('trailer');
  }

  private mapTrailerRow(t: any): any {
    const assignments = Array.isArray(t?.driverAssignments)
      ? t.driverAssignments
      : (Array.isArray(t?.assignments) ? t.assignments : []);
    const preferredStatuses = new Set(['active', 'assigned', 'rented', 'in_use', 'in-use', 'current']);
    const pickedAssignment = assignments.find((a: any) => preferredStatuses.has(String(a?.status || '').toLowerCase()))
      || assignments[0]
      || null;

    const assignedDriverName =
      pickedAssignment?.driverName
      || pickedAssignment?.name
      || t?.assignedDriverName
      || t?.driverName
      || t?.ownerName
      || null;

    const rawAssignedDriverId =
      pickedAssignment?.driverId
      ?? pickedAssignment?.assignedDriverId
      ?? pickedAssignment?.driver_id
      ?? t?.assignedDriverId
      ?? t?.driverId
      ?? t?.assigned_driver_id
      ?? t?.driver_id
      ?? null;
    const assignedDriverId = rawAssignedDriverId ?? this.findDriverIdByName(assignedDriverName);
    const backendStatus = this.getTrailerAssignmentStatus(t);
    const overrideStatus = this.getTrailerStatusOverride(t?.id);
    const resolvedTrailerStatus = overrideStatus ?? backendStatus;

    return {
      id: t?.id,
      permitNumber: t?.tagNumber || t?.permitNumber || t?.number || t?.trailerNumber || t?.unitNumber || '',
      permitType: t?.type || t?.subtype || 'standard_equipment',
      state: t?.state || t?.currentLocation || '',
      issueDate: t?.issueDate || t?.registrationStartDate || t?.createdAt || null,
      expiryDate: t?.expiryDate || t?.registrationExpiry || null,
      cost: t?.cost ?? t?.purchasePrice ?? null,
      vendor: this.normalizeTrailerVendor(t?.vendor || t?.lessor || t?.leasingVendor || t?.provider),
      vendorLabel: this.getTrailerVendorLabel(t?.vendor || t?.lessor || t?.leasingVendor || t?.provider),
      chargeFrequency: t?.chargeFrequency || t?.billingFrequency || t?.rateFrequency || t?.frequency || 'monthly',
      trailerStatus: resolvedTrailerStatus,
      assignedDriverId,
      assignedDriverName: assignedDriverName || '',
      assignedTruckNumber: t?.number || t?.trailerNumber || t?.unitNumber || t?.truckNumber || '',
      status: t?.status || (assignedDriverId ? 'active' : 'expiring'),
      notes: t?.notes || '',
      photoUrl: t?.photoUrl || t?.imageUrl || t?.trailerPhotoUrl || t?.avatarUrl || null,
      hasFile: false,
      fileName: null
    };
  }

  private async saveTrailer(): Promise<void> {
    this.saving.set(true);
    const editing = this.editingPermit();
    const selectedTrailerId = this.permitForm.trailerId ? `${this.permitForm.trailerId}` : '';
    const organizationId = this.getOrganizationId();
    const selectedDriver = this.drivers().find((d: any) => `${d?.id}` === `${this.permitForm?.assignedDriverId ?? ''}`);
    const assignedDriverName = String(selectedDriver?.name || '').trim() || null;
    const selectedTrailerStatus = this.normalizeTrailerStatus(this.permitForm.trailerStatus);
    const persistedDriverId = this.permitForm.assignedDriverId ?? null;
    const persistedDriverName = assignedDriverName;
    const trailerBody: any = {
      number: this.permitForm.assignedTruckNumber || this.permitForm.permitNumber,
      trailerNumber: this.permitForm.assignedTruckNumber || this.permitForm.permitNumber,
      tagNumber: this.permitForm.permitNumber,
      permitNumber: this.permitForm.permitNumber,
      type: this.permitForm.permitType || 'trailer',
      state: this.permitForm.state || null,
      issueDate: this.permitForm.issueDate ? new Date(this.permitForm.issueDate).toISOString() : null,
      expiryDate: this.permitForm.expiryDate ? new Date(this.permitForm.expiryDate).toISOString() : null,
      cost: this.permitForm.cost ?? null,
      vendor: this.normalizeTrailerVendor(this.permitForm.vendor),
      lessor: this.normalizeTrailerVendor(this.permitForm.vendor),
      leasingVendor: this.normalizeTrailerVendor(this.permitForm.vendor),
      chargeFrequency: this.permitForm.chargeFrequency || 'monthly',
      billingFrequency: this.permitForm.chargeFrequency || 'monthly',
      status: this.mapTrailerBackendStatus(selectedTrailerStatus),
      assignmentStatus: selectedTrailerStatus,
      trailerStatus: selectedTrailerStatus,
      notes: this.permitForm.notes || null,
      photoUrl: this.permitForm.photoUrl || null,
      imageUrl: this.permitForm.photoUrl || null,
      assignedDriverId: persistedDriverId,
      driverId: persistedDriverId,
      assignedDriverName: persistedDriverName,
      organizationId
    };
    const equipmentBody: any = {
      unitNumber: trailerBody.number,
      equipmentTypeName: 'trailer',
      subtype: trailerBody.type,
      currentLocation: trailerBody.state,
      registrationStartDate: trailerBody.issueDate,
      registrationExpiry: trailerBody.expiryDate,
      purchasePrice: trailerBody.cost,
      vendor: trailerBody.vendor,
      lessor: trailerBody.lessor,
      leasingVendor: trailerBody.leasingVendor,
      chargeFrequency: trailerBody.chargeFrequency,
      billingFrequency: trailerBody.billingFrequency,
      status: this.mapEquipmentBackendStatus(selectedTrailerStatus),
      assignmentStatus: selectedTrailerStatus,
      trailerStatus: selectedTrailerStatus,
      assignedDriverId: trailerBody.assignedDriverId,
      driverId: trailerBody.driverId,
      ownerName: persistedDriverName,
      notes: trailerBody.notes,
      photoUrl: trailerBody.photoUrl,
      imageUrl: trailerBody.imageUrl,
      organizationId
    };

    try {
      let trailerId = selectedTrailerId || editing?.id;
      if (trailerId) {
        try {
          await firstValueFrom(this.http.put<any>(this.trailerPath(`/equipment/${trailerId}`), equipmentBody));
        } catch {
          await firstValueFrom(this.http.put<any>(this.trailerPath(`/trailers/${trailerId}`), trailerBody));
        }
      } else {
        try {
          const created: any = await firstValueFrom(this.http.post<any>(this.trailerPath('/equipment'), equipmentBody));
          trailerId = created?.data?.id ?? created?.id ?? trailerId;
        } catch {
          const created: any = await firstValueFrom(this.http.post<any>(this.trailerPath('/trailers'), trailerBody));
          trailerId = created?.data?.id ?? created?.id ?? trailerId;
        }
      }

      if (trailerId && persistedDriverId && selectedTrailerStatus === 'active') {
        await this.assignDriverToTrailer(trailerId, this.permitForm.assignedDriverId, assignedDriverName);
      }
      if (trailerId) {
        this.setTrailerStatusOverride(trailerId, selectedTrailerStatus);
      }

      this.saving.set(false);
      this.closeModal();
      this.loadData();
      this.toast.champagne(editing ? 'Trailer assignment updated' : 'Trailer assignment created', 'Success');
    } catch (err: any) {
      this.saving.set(false);
      this.toast.error(this.extractErrorMessage(err, 'Failed to save trailer assignment'), 'Error');
    }
  }

  private async assignDriverToTrailer(trailerId: any, driverId: any, driverName?: string | null): Promise<void> {
    const id = `${trailerId}`;
    const resolvedDriverName = String(driverName || '').trim();
    const payloads = [
      () => firstValueFrom(this.http.patch(this.trailerPath(`/equipment/${id}`), { ownerName: resolvedDriverName, assignedDriverId: driverId, driverId, status: 'in_use' })),
      () => firstValueFrom(this.http.put(this.trailerPath(`/equipment/${id}`), { ownerName: resolvedDriverName, assignedDriverId: driverId, driverId, status: 'in_use' })),
      () => firstValueFrom(this.http.post(this.trailerPath(`/trailers/${id}/assign-driver`), { driverId, driverName: resolvedDriverName })),
      () => firstValueFrom(this.http.post(this.trailerPath(`/trailers/${id}/assignments`), { driverId, driverName: resolvedDriverName, status: 'rented' })),
      () => firstValueFrom(this.http.patch(this.trailerPath(`/trailers/${id}`), { assignedDriverId: driverId, assignedDriverName: resolvedDriverName, status: 'rented' })),
      () => firstValueFrom(this.http.put(this.trailerPath(`/trailers/${id}`), { assignedDriverId: driverId, assignedDriverName: resolvedDriverName, status: 'rented' }))
    ];

    for (const request of payloads) {
      try {
        await request();
        return;
      } catch {
        // Try next assignment strategy.
      }
    }
  }

  private deleteTrailer(row: any): void {
    if (!confirm(`Delete trailer assignment #${row?.permitNumber || row?.assignedTruckNumber || row?.id}?`)) return;
    this.http.delete(this.trailerPath(`/equipment/${row.id}`)).subscribe({
      next: () => { this.loadData(); this.toast.champagne('Trailer assignment deleted', 'Deleted'); },
      error: (err: any) => {
        if (!this.shouldFallbackToEquipment(err)) {
          this.toast.error('Failed to delete trailer assignment', 'Error');
          return;
        }
        this.http.delete(this.trailerPath(`/trailers/${row.id}`)).subscribe({
          next: () => { this.loadData(); this.toast.champagne('Trailer assignment deleted', 'Deleted'); },
          error: () => this.toast.error('Failed to delete trailer assignment', 'Error')
        });
      }
    });
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

  private formatTypeLabel(raw: string): string {
    return String(raw || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private findDriverIdByName(name: unknown): any {
    const normalizedTarget = this.normalizeNameKey(name);
    if (!normalizedTarget) return null;
    const match = this.drivers().find((d: any) => this.normalizeNameKey(d?.name || d?.driverName) === normalizedTarget);
    return match?.id ?? null;
  }

  private getOrganizationId(): number | null {
    try {
      const userRaw = localStorage.getItem('vantac_user');
      const orgRaw = localStorage.getItem('vantac_org');
      const user = userRaw ? JSON.parse(userRaw) : null;
      const org = orgRaw ? JSON.parse(orgRaw) : null;
      const value = user?.organizationId ?? org?.id ?? null;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  private extractErrorMessage(err: any, fallback: string): string {
    const body = err?.error;
    if (typeof body === 'string' && body.trim()) return body.trim();
    if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
    if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim();
    if (typeof err?.message === 'string' && err.message.trim()) return err.message.trim();
    return fallback;
  }

  private shouldFallbackToEquipment(err: any): boolean {
    const status = Number(err?.status || 0);
    return status === 400 || status === 404;
  }

  private trailerPath(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.trailerApiRoot}${normalizedPath}`;
  }

  private async tryUploadTrailerPhoto(trailerId: string, file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('photo', file);
    fd.append('image', file);

    const paths = [
      `/trailers/${trailerId}/photo`,
      `/trailers/${trailerId}/upload-photo`,
      `/trailers/${trailerId}/image`,
      `/equipment/${trailerId}/photo`,
      `/equipment/${trailerId}/upload-photo`,
      `/equipment/${trailerId}/image`
    ];

    let lastErr: any = null;
    for (const path of paths) {
      try {
        const res: any = await firstValueFrom(this.http.post<any>(this.trailerPath(path), fd));
        return this.extractUploadedPhotoUrl(res) || null;
      } catch (err: any) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error('Unable to upload trailer photo');
  }

  private extractUploadedPhotoUrl(payload: any): string | null {
    const candidates = [
      payload?.url,
      payload?.photoUrl,
      payload?.imageUrl,
      payload?.data?.url,
      payload?.data?.photoUrl,
      payload?.data?.imageUrl,
      payload?.result?.url,
      payload?.result?.photoUrl,
      payload?.result?.imageUrl
    ];
    for (const value of candidates) {
      const text = String(value ?? '').trim();
      if (text) return text;
    }
    return null;
  }

  private setTrailerPhotoPreview(url: string | null): void {
    const previous = this.trailerPhotoPreviewUrl();
    if (previous && previous.startsWith('blob:')) {
      URL.revokeObjectURL(previous);
    }
    this.trailerPhotoPreviewUrl.set(url);
  }

  private resetTrailerPhotoState(initialUrl: string | null = null): void {
    this.trailerPhotoFile = null;
    this.trailerPhotoFileName.set('');
    this.trailerPhotoUploading.set(false);
    this.setTrailerPhotoPreview(initialUrl);
  }

  private async trailerGetWithPathFallback(path: string): Promise<any> {
    return await firstValueFrom(this.http.get<any>(this.trailerPath(path)));
  }

  private async loadTrailersWithFallback(): Promise<void> {
    try {
      const proxyRes: any = await firstValueFrom(
        this.http.get<any>(`${this.apiUrl}/api/v1/assets-proxy/trailers?limit=1000`)
      );
      this.trailers.set(Array.isArray(proxyRes?.data) ? proxyRes.data : []);
      return;
    } catch (err: any) {
      // If proxy endpoint exists but upstream failed, avoid browser-side direct fallback
      // that triggers CORS errors and noisy console logs.
      if (Number(err?.status || 0) !== 404) {
        this.trailers.set([]);
        return;
      }
      // Proxy not deployed yet (404): use legacy direct/gateway fallback.
    }

    try {
      const res: any = await this.trailerGetWithPathFallback('/equipment?equipmentType=trailer&limit=1000');
      this.trailers.set(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) {
      if (!this.shouldFallbackToEquipment(err)) {
        this.trailers.set([]);
        return;
      }
      try {
        const res: any = await this.trailerGetWithPathFallback('/trailers?limit=1000');
        this.trailers.set(Array.isArray(res?.data) ? res.data : []);
      } catch {
        this.trailers.set([]);
      }
    }
  }
}
