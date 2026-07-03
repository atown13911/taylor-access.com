import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';

type TrailerAssignmentRecord = {
  permitNumber?: string;
  permitType?: string;
  state?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  cost?: number | null;
  vendor?: string;
  chargeFrequency?: string;
  trailerStatus?: 'active' | 'inactive' | 'returned' | 'closed_out';
  assignedDriverId?: any;
  assignedDriverName?: string;
  driverOverride?: boolean;
  assignedTruckNumber?: string;
  notes?: string;
  fileName?: string | null;
  hasFile?: boolean;
};

@Component({
  selector: 'app-tags-permits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tags-permits.component.html',
  styleUrls: ['./tags-permits.component.scss']
})
export class TagsPermitsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private apiUrl = environment.apiUrl;
  private assetsGatewayUrl = environment.apiUrl.replace(/\/open\/taylor-access\/?$/i, '/open/taylor-assets');
  private trailerApiUrl = `${this.apiUrl}/api/v1/assets-proxy`;
  private trailerApiRoot = this.trailerApiUrl.replace(/\/+$/, '');
  private readonly trailerAssignmentsMigratedKey = 'ta_trailer_assignments_migrated_v1';
  private readonly legacyTrailerStatusOverridesKey = 'ta_trailer_status_overrides';
  private readonly legacyTrailerFieldOverridesKey = 'ta_trailer_field_overrides';
  private readonly fuelCardAssignmentOverridesKey = 'ta_fuel_card_assignment_overrides_v1';

  activeTab = signal<'permits' | 'irp' | 'trailer' | 'fuel-cards' | 'elds' | 'cameras' | 'cables'>('permits');
  trailerSubTab = signal<'active' | 'inactive'>('active');
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
  selectedTrailerDrawer = signal<any | null>(null);
  showFuelCardDetailsModal = signal(false);
  showFuelCardAssignModal = signal(false);
  selectedFuelCardDriver = signal<any | null>(null);
  selectedFuelCardDetail = signal<any | null>(null);
  fuelCardAssignCardId = signal('');
  savingFuelCardAssignment = signal(false);

  // Document upload
  uploadingDoc = signal(false);
  uploadTarget = signal<any>(null);   // permit being uploaded to
  permitDocFile: File | null = null;
  trailerPhotoUploading = signal(false);
  trailerPhotoBatchUploading = signal(false);
  trailerPhotoFileName = signal('');
  trailerPhotoPreviewUrl = signal<string | null>(null);
  trailerDrawerPhotoPreviewUrl = signal<string | null>(null);
  trailerPhotoHistory = signal<any[]>([]);
  trailerPhotoHistoryLoading = signal(false);
  private trailerPhotoMeta = signal<Record<string, {
    count: number;
    previewUrl: string | null;
    thumbBlobUrl: string | null;
  }>>({});
  private trailerPhotoFile: File | null = null;
  private trailerAssignments = signal<Record<string, TrailerAssignmentRecord>>({});
  private fuelCardAssignmentOverrides = signal<Record<string, {
    driverId: string;
    driverName?: string;
    driverEmail?: string;
  }>>({});
  readonly trailerVendorOptions = ['ryder', 'metro', 'taylor_leasing', 'other'] as const;

  permitForm: any = { trailerId: null, permitNumber: '', permitType: 'overweight', state: '', issueDate: '', expiryDate: '', cost: null, vendor: 'other', chargeFrequency: 'monthly', trailerStatus: 'active', assignedDriverId: null, assignedTruckNumber: '', notes: '' };

  filteredPermits = computed(() => {
    let list = this.permits().filter((p: any) => {
      const type = String(p?.permitType ?? '').trim().toLowerCase();
      return !this.irpTypes.includes(type) && !this.equipmentTypes.includes(type);
    });
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
  equipmentTypes = ['eld', 'camera', 'cable'];

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

  filteredEldPermits = computed(() => {
    return this.filterByPermitType('eld');
  });

  filteredCameraPermits = computed(() => {
    return this.filterByPermitType('camera');
  });

  filteredCablePermits = computed(() => {
    return this.filterByPermitType('cable');
  });

  filteredTrailerPermits = computed(() => {
    let list = this.trailers().map((t: any) => this.mapTrailerRow(t));
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    const type = this.typeFilter();
    const trailerSubTab = this.trailerSubTab();

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
    list = list.filter((p: any) => {
      const assignmentStatus = this.getTrailerAssignmentStatus(p);
      if (trailerSubTab === 'active') return assignmentStatus === 'active';
      return assignmentStatus === 'inactive' || assignmentStatus === 'returned' || assignmentStatus === 'closed_out';
    });
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
          assignedFuelCardId: assigned?.cardId ?? '',
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
      const assigned = rows.filter((d: any) => !!String(d?.assignedFuelCardId || '').trim()).length;
      const unassigned = Math.max(rows.length - assigned, 0);
      const uniqueAssignedCards = new Set(
        rows
          .map((d: any) => String(d?.assignedFuelCardId || '').trim())
          .filter((v: string) => !!v)
      ).size;

      return [
        { icon: 'bx-user-check', label: 'Active Drivers', value: rows.length },
        { icon: 'bx-credit-card-front', label: 'Assigned Cards', value: assigned },
        { icon: 'bx-user-x', label: 'Unassigned Drivers', value: unassigned },
        { icon: 'bx-card', label: 'Unique Cards In Use', value: uniqueAssignedCards }
      ];
    }

    if (tab === 'trailer') {
      const allRows = this.trailers().map((t: any) => this.mapTrailerRow(t));
      const rows = this.filteredTrailerPermits();
      const assigned = allRows.filter((p: any) => String(p?.assignedDriverName || '').trim().length > 0).length;
      const unassigned = Math.max(allRows.length - assigned, 0);
      const expiring = allRows.filter((p: any) => this.getPermitStatus(p) === 'expiring').length;

      return [
        { icon: 'bx-package', label: 'Total Trailers', value: allRows.length },
        { icon: 'bx-user-check', label: 'Assigned Drivers', value: assigned },
        { icon: 'bx-user-x', label: 'Unassigned Trailers', value: unassigned },
        { icon: 'bx-error', label: 'Expiring Soon', value: expiring }
      ];
    }

    if (tab === 'elds' || tab === 'cameras' || tab === 'cables') {
      const rows = tab === 'elds'
        ? this.filteredEldPermits()
        : (tab === 'cameras' ? this.filteredCameraPermits() : this.filteredCablePermits());
      const totalLabel = tab === 'elds'
        ? 'Total ELDs'
        : (tab === 'cameras' ? 'Total Cameras' : 'Total Cables');
      const active = rows.filter((p: any) => this.getPermitStatus(p) === 'active').length;
      const expiring = rows.filter((p: any) => this.getPermitStatus(p) === 'expiring').length;
      const expired = rows.filter((p: any) => this.getPermitStatus(p) === 'expired').length;

      return [
        { icon: 'bx-chip', label: totalLabel, value: rows.length },
        { icon: 'bx-check-circle', label: 'Active', value: active },
        { icon: 'bx-error', label: 'Expiring Soon', value: expiring },
        { icon: 'bx-x-circle', label: 'Expired', value: expired }
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
        id: this.resolveTrailerId(t),
        number: t?.number || t?.trailerNumber || t?.unitNumber || t?.truckNumber || '',
        tag: t?.tagNumber || t?.permitNumber || '',
        type: t?.type || 'trailer'
      }))
      .filter((t: any) => t.id != null)
      .sort((a: any, b: any) => String(a.number || a.tag || a.id).localeCompare(String(b.number || b.tag || b.id)));
  });

  ngOnInit() {
    void this.migrateLocalTrailerOverridesIfNeeded();
    this.loadFuelCardAssignmentOverrides();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.revokeTrailerThumbBlobs();
    this.setTrailerDrawerPhotoPreview(null);
    this.setTrailerPhotoPreview(null);
  }

  getTrailerPhotoCount(row: any): number {
    const id = this.resolveTrailerPhotoMetaId(row);
    return id ? (this.trailerPhotoMeta()[id]?.count ?? 0) : 0;
  }

  getTrailerPhotoThumb(row: any): string | null {
    const id = this.resolveTrailerPhotoMetaId(row);
    if (!id) return null;
    return this.trailerPhotoMeta()[id]?.thumbBlobUrl ?? null;
  }

  private resolveTrailerPhotoMetaId(row: any): string {
    return String(this.resolveTrailerId(row) ?? row?.id ?? '').trim();
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

    if (isAssigned) return 'active';

    if (
      rawStatus === 'inactive'
      || rawStatus === 'available'
      || rawStatus === 'unassigned'
      || rawStatus === 'idle'
    ) {
      return 'inactive';
    }

    return 'inactive';
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

  private getTrailerAssignment(trailerId: unknown): TrailerAssignmentRecord | null {
    const key = String(trailerId ?? '').trim();
    if (!key) return null;
    return this.trailerAssignments()[key] ?? null;
  }

  private mapApiTrailerAssignment(row: any): TrailerAssignmentRecord {
    return {
      permitNumber: row?.permitNumber ?? '',
      permitType: row?.permitType ?? '',
      state: row?.state ?? '',
      issueDate: row?.issueDate ?? null,
      expiryDate: row?.expiryDate ?? null,
      cost: row?.cost ?? null,
      vendor: row?.vendor ?? '',
      chargeFrequency: row?.chargeFrequency ?? 'monthly',
      trailerStatus: this.normalizeTrailerStatus(row?.trailerStatus),
      assignedDriverId: row?.assignedDriverId ?? null,
      assignedDriverName: row?.assignedDriverName ?? '',
      driverOverride: !!row?.driverOverride,
      assignedTruckNumber: row?.assignedTruckNumber ?? '',
      notes: row?.notes ?? '',
      fileName: row?.fileName ?? null,
      hasFile: !!row?.hasFile
    };
  }

  private async loadTrailerAssignmentsFromApi(trailerIds?: string[]): Promise<void> {
    try {
      const ids = (trailerIds ?? this.trailers()
        .map((t: any) => String(this.resolveTrailerId(t) ?? '').trim())
        .filter((id: string) => !!id));
      const uniqueIds = Array.from(new Set(ids));
      const query = uniqueIds.length
        ? `?trailerIds=${encodeURIComponent(uniqueIds.join(','))}`
        : '';
      const res: any = await firstValueFrom(
        this.http.get<any>(`${this.apiUrl}/api/v1/trailer-assignments${query}`)
      );
      const rows = Array.isArray(res?.data) ? res.data : [];
      const next: Record<string, TrailerAssignmentRecord> = { ...this.trailerAssignments() };
      for (const row of rows) {
        const trailerId = String(row?.trailerId ?? '').trim();
        if (!trailerId) continue;
        next[trailerId] = this.mapApiTrailerAssignment(row);
      }
      this.trailerAssignments.set(next);
    } catch {
      // Keep current in-memory assignments if API is unavailable.
    }
  }

  private async migrateLocalTrailerOverridesIfNeeded(): Promise<void> {
    if (localStorage.getItem(this.trailerAssignmentsMigratedKey) === '1') return;

    let statuses: Record<string, any> = {};
    let fields: Record<string, any> = {};
    try {
      const statusRaw = localStorage.getItem(this.legacyTrailerStatusOverridesKey);
      const fieldRaw = localStorage.getItem(this.legacyTrailerFieldOverridesKey);
      statuses = statusRaw ? JSON.parse(statusRaw) : {};
      fields = fieldRaw ? JSON.parse(fieldRaw) : {};
    } catch {
      localStorage.setItem(this.trailerAssignmentsMigratedKey, '1');
      return;
    }

    const trailerIds = new Set([
      ...Object.keys(statuses || {}),
      ...Object.keys(fields || {})
    ]);
    if (!trailerIds.size) {
      localStorage.setItem(this.trailerAssignmentsMigratedKey, '1');
      return;
    }

    const items = Array.from(trailerIds).map((trailerId) => {
      const field = fields?.[trailerId] || {};
      const status = statuses?.[trailerId] ?? field?.trailerStatus ?? 'active';
      return {
        trailerId,
        permitNumber: field?.permitNumber ?? null,
        permitType: field?.permitType ?? null,
        state: field?.state ?? null,
        issueDate: field?.issueDate ?? null,
        expiryDate: field?.expiryDate ?? null,
        cost: field?.cost ?? null,
        vendor: field?.vendor ?? null,
        chargeFrequency: field?.chargeFrequency ?? null,
        trailerStatus: this.normalizeTrailerStatus(status),
        assignedDriverId: field?.assignedDriverId ?? null,
        assignedDriverName: field?.assignedDriverName ?? null,
        assignedTruckNumber: field?.assignedTruckNumber ?? null,
        notes: field?.notes ?? null,
        clearAssignedDriver: status === 'inactive'
      };
    });

    try {
      await firstValueFrom(
        this.http.post<any>(`${this.apiUrl}/api/v1/trailer-assignments/bulk-upsert`, { items })
      );
      localStorage.removeItem(this.legacyTrailerStatusOverridesKey);
      localStorage.removeItem(this.legacyTrailerFieldOverridesKey);
    } catch {
      // Keep legacy local values until migration succeeds.
      return;
    }

    localStorage.setItem(this.trailerAssignmentsMigratedKey, '1');
  }

  private buildTrailerAssignmentPayload(
    values: TrailerAssignmentRecord,
    options?: { clearAssignedDriver?: boolean }
  ): Record<string, any> {
    const payload: Record<string, any> = {
      permitNumber: values.permitNumber ?? null,
      permitType: values.permitType ?? null,
      state: values.state ?? null,
      issueDate: values.issueDate ? new Date(values.issueDate).toISOString() : null,
      expiryDate: values.expiryDate ? new Date(values.expiryDate).toISOString() : null,
      cost: values.cost ?? null,
      vendor: values.vendor ?? null,
      chargeFrequency: values.chargeFrequency ?? null,
      trailerStatus: values.trailerStatus ?? null,
      assignedDriverId: values.assignedDriverId ?? null,
      assignedDriverName: values.assignedDriverName ?? null,
      assignedTruckNumber: values.assignedTruckNumber ?? null,
      notes: values.notes ?? null
    };
    if (options?.clearAssignedDriver) {
      payload['clearAssignedDriver'] = true;
    }
    if (options?.clearAssignedDriver || values.assignedDriverId != null || String(values.assignedDriverName || '').trim()) {
      payload['driverOverride'] = true;
    }
    return payload;
  }

  private async persistTrailerAssignment(
    trailerId: unknown,
    values: Partial<TrailerAssignmentRecord>,
    options?: { clearAssignedDriver?: boolean }
  ): Promise<void> {
    const key = String(trailerId ?? '').trim();
    if (!key) return;

    const current = this.getTrailerAssignment(key) || {};
    const merged = { ...current, ...values };
    this.trailerAssignments.set({
      ...this.trailerAssignments(),
      [key]: merged
    });

    try {
      await firstValueFrom(
        this.http.put<any>(
          `${this.apiUrl}/api/v1/trailer-assignments/${encodeURIComponent(key)}`,
          this.buildTrailerAssignmentPayload(merged, options)
        )
      );
    } catch {
      this.toast.warning('Trailer assignment saved locally but database sync failed.', 'Save');
    }
  }

  private async applyTrailerAssignmentState(
    trailerId: string,
    status: 'active' | 'inactive' | 'returned' | 'closed_out',
    assignedDriverId: any,
    assignedDriverName: string
  ): Promise<void> {
    await this.persistTrailerAssignment(trailerId, {
      trailerStatus: status,
      assignedDriverId,
      assignedDriverName,
      driverOverride: true
    }, { clearAssignedDriver: !assignedDriverId });
  }

  private resolvePermitDocBase(p: any): string {
    if (this.activeTab() === 'trailer') {
      const trailerId = encodeURIComponent(String(this.resolveTrailerId(p) ?? p?.id ?? '').trim());
      return `${this.apiUrl}/api/v1/trailer-assignments/${trailerId}`;
    }
    return `${this.apiUrl}/api/v1/company-permits/${p.id}`;
  }

  selectMainTab(tab: 'permits' | 'irp' | 'trailer' | 'fuel-cards' | 'elds' | 'cameras' | 'cables'): void {
    this.activeTab.set(tab);

    if (tab === 'trailer') {
      this.trailerSubTab.set('active');
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
      : tab === 'elds'
        ? 'eld'
        : tab === 'cameras'
          ? 'camera'
          : tab === 'cables'
            ? 'cable'
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
      trailerId: this.resolveTrailerId(p),
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

  openTrailerDrawer(row: any): void {
    if (this.activeTab() !== 'trailer') return;
    this.selectedTrailerDrawer.set(row);
    void this.loadTrailerPhotoHistory(this.resolveTrailerId(row));
  }

  closeTrailerDrawer(): void {
    this.selectedTrailerDrawer.set(null);
    this.setTrailerDrawerPhotoPreview(null);
    this.trailerPhotoHistory.set([]);
    this.trailerPhotoHistoryLoading.set(false);
  }

  openTrailerEditFromDrawer(): void {
    const row = this.selectedTrailerDrawer();
    if (!row) return;
    this.closeTrailerDrawer();
    this.editPermit(row);
    this.trailerModalTab.set('details');
  }

  openTrailerPhotoFromDrawer(): void {
    const row = this.selectedTrailerDrawer();
    if (!row) return;
    this.closeTrailerDrawer();
    this.editPermit(row);
    this.trailerModalTab.set('photo');
  }

  onTrailerSelectionChange(trailerId: any): void {
    if (this.activeTab() !== 'trailer') return;
    const id = String(trailerId ?? '').trim();
    if (!id) return;
    const trailer = this.trailers().find((t: any) => `${this.resolveTrailerId(t)}` === id);
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
    const body = this.normalizePermitPayloadForApi({ ...this.permitForm });
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
        const entityLabel = this.modalRecordLabel();
        this.toast.champagne(
          editing ? `${entityLabel} updated` : `${entityLabel} created`,
          'Success'
        );
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(this.getApiErrorMessage(err, 'Failed to save permit'), 'Error');
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
    if (this.activeTab() === 'elds') return 'Manage ELD permits and subscription records';
    if (this.activeTab() === 'cameras') return 'Manage camera permits and subscription records';
    if (this.activeTab() === 'cables') return 'Manage cable permits and subscription records';
    return this.isTrailerTab()
      ? 'Add trailer tags and assign drivers to active trailers'
      : 'Manage company-owned overweight/oversize permits and IRP registrations';
  }

  searchPlaceholder(): string {
    if (this.activeTab() === 'elds') return 'Search ELD records...';
    if (this.activeTab() === 'cameras') return 'Search camera records...';
    if (this.activeTab() === 'cables') return 'Search cable records...';
    return this.isTrailerTab() ? 'Search trailer tags...' : 'Search permits...';
  }

  addButtonLabel(): string {
    const tab = this.activeTab();
    if (tab === 'irp') return 'Add IRP Tag';
    if (tab === 'trailer') return 'Add Trailer';
    if (tab === 'elds') return 'Add ELD';
    if (tab === 'cameras') return 'Add Camera';
    if (tab === 'cables') return 'Add Cable';
    return 'Add Permit';
  }

  isCustomEquipmentTab(): boolean {
    const tab = this.activeTab();
    return tab === 'elds' || tab === 'cameras' || tab === 'cables';
  }

  modalRecordLabel(): string {
    const tab = this.activeTab();
    if (tab === 'trailer') return 'Trailer';
    if (tab === 'elds') return 'ELD';
    if (tab === 'cameras') return 'Camera';
    if (tab === 'cables') return 'Cable';
    return 'Permit';
  }

  modalNumberLabel(): string {
    const tab = this.activeTab();
    if (tab === 'trailer') return 'Trailer Tag Number';
    if (tab === 'elds') return 'ELD Number / Device ID';
    if (tab === 'cameras') return 'Camera Number / Device ID';
    if (tab === 'cables') return 'Cable Number / Asset ID';
    return 'Permit Number';
  }

  modalNumberPlaceholder(): string {
    const tab = this.activeTab();
    if (tab === 'trailer') return 'e.g., TR-2026-12345';
    if (tab === 'elds') return 'e.g., ELD-1024 or device serial';
    if (tab === 'cameras') return 'e.g., CAM-1184 or serial';
    if (tab === 'cables') return 'e.g., CBL-2042 or kit ID';
    return 'e.g., OW-2026-12345';
  }

  modalRegionLabel(): string {
    const tab = this.activeTab();
    if (tab === 'elds') return 'Provider';
    if (tab === 'cameras') return 'Camera Vendor';
    if (tab === 'cables') return 'Cable Type / Vendor';
    return 'State';
  }

  modalRegionPlaceholder(): string {
    const tab = this.activeTab();
    if (tab === 'elds') return 'e.g., Motive, Samsara';
    if (tab === 'cameras') return 'e.g., Lytx, Motive';
    if (tab === 'cables') return 'e.g., Harness, Coax, OEM';
    return 'e.g., FL';
  }

  modalRegionMaxLength(): number {
    return this.isCustomEquipmentTab() ? 40 : 5;
  }

  modalCostLabel(): string {
    const tab = this.activeTab();
    if (tab === 'elds' || tab === 'cameras') return 'Monthly Cost';
    if (tab === 'cables') return 'Replacement Cost';
    return 'Cost';
  }

  modalIssueDateLabel(): string {
    const tab = this.activeTab();
    if (tab === 'elds') return 'Activated Date';
    if (tab === 'cameras') return 'Installed Date';
    if (tab === 'cables') return 'Installed Date';
    return 'Issue Date';
  }

  modalExpiryDateLabel(): string {
    const tab = this.activeTab();
    if (tab === 'elds') return 'Renewal Date';
    if (tab === 'cameras') return 'Warranty / Renewal Date';
    if (tab === 'cables') return 'Service / Replacement Date';
    return 'Expiry Date';
  }

  modalTruckLabel(): string {
    const tab = this.activeTab();
    if (tab === 'elds' || tab === 'cameras' || tab === 'cables') return 'Truck / Unit #';
    return 'Truck #';
  }

  modalTruckPlaceholder(): string {
    const tab = this.activeTab();
    if (tab === 'elds' || tab === 'cameras' || tab === 'cables') return 'e.g., Unit 1210';
    return 'e.g., 1210';
  }

  equipmentAssetOptions(): string[] {
    const values = this.trailerOptions()
      .map((t: any) => String(t?.number || t?.tag || t?.id || '').trim())
      .filter((v: string) => !!v);
    const current = String(this.permitForm?.assignedTruckNumber ?? '').trim();
    if (current) values.push(current);
    return Array.from(new Set(values));
  }

  modalNotesLabel(): string {
    const tab = this.activeTab();
    if (tab === 'elds') return 'Device Notes';
    if (tab === 'cameras') return 'Camera Notes';
    if (tab === 'cables') return 'Cable Notes';
    return 'Notes';
  }

  modalNotesPlaceholder(): string {
    const tab = this.activeTab();
    if (tab === 'elds') return 'Optional login, install, or support notes...';
    if (tab === 'cameras') return 'Optional placement, install, or support notes...';
    if (tab === 'cables') return 'Optional cable type, routing, or service notes...';
    return 'Optional notes...';
  }

  activePermitRows(): any[] {
    const tab = this.activeTab();
    if (tab === 'irp') return this.filteredIrpPermits();
    if (tab === 'elds') return this.filteredEldPermits();
    if (tab === 'cameras') return this.filteredCameraPermits();
    if (tab === 'cables') return this.filteredCablePermits();
    return this.filteredPermits();
  }

  activePermitEmptyText(): string {
    const tab = this.activeTab();
    if (tab === 'irp') return 'No IRP tags found. Click "Add IRP Tag" to create one.';
    if (tab === 'elds') return 'No ELD records found. Click "Add ELD" to create one.';
    if (tab === 'cameras') return 'No camera records found. Click "Add Camera" to create one.';
    if (tab === 'cables') return 'No cable records found. Click "Add Cable" to create one.';
    return 'No permits found. Click "Add Permit" to create one.';
  }

  private filterByPermitType(targetType: string): any[] {
    const normalizedTarget = String(targetType || '').trim().toLowerCase();
    let list = this.permits().filter((p: any) =>
      String(p?.permitType || '').trim().toLowerCase() === normalizedTarget
    );
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();

    if (search) {
      list = list.filter((p: any) =>
        (p.permitNumber || '').toLowerCase().includes(search) ||
        (p.assignedDriverName || '').toLowerCase().includes(search) ||
        (p.assignedTruckNumber || '').toLowerCase().includes(search) ||
        (p.state || '').toLowerCase().includes(search)
      );
    }
    if (status) list = list.filter((p: any) => this.getPermitStatus(p) === status);
    return list;
  }

  private normalizePermitPayloadForApi(payload: any): any {
    const normalized = { ...payload };
    const isEquipmentTab = this.isCustomEquipmentTab();
    const stateText = String(normalized?.state ?? '').trim();

    // CompanyPermit.State is constrained to max 5 chars server-side.
    // For equipment tabs, preserve full provider/vendor text in notes and
    // send a 5-char state-safe token to avoid 400 model validation failures.
    if (isEquipmentTab && stateText.length > 5) {
      const existingNotes = String(normalized?.notes ?? '').trim();
      const providerLine = `Provider: ${stateText}`;
      normalized.notes = existingNotes
        ? (existingNotes.toLowerCase().includes('provider:') ? existingNotes : `${providerLine}\n${existingNotes}`)
        : providerLine;
      normalized.state = stateText.slice(0, 5);
    } else {
      normalized.state = stateText;
    }

    return normalized;
  }

  private getApiErrorMessage(err: any, fallback: string): string {
    const body = err?.error;
    if (typeof body === 'string' && body.trim()) return body.trim();
    if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
    if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim();
    const errors = body?.errors;
    if (errors && typeof errors === 'object') {
      for (const value of Object.values(errors)) {
        if (Array.isArray(value) && value.length > 0) {
          const first = String(value[0] ?? '').trim();
          if (first) return first;
        }
      }
    }
    return fallback;
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

    this.http.post(`${this.resolvePermitDocBase(p)}/upload`, fd).subscribe({
      next: async () => {
        this.toast.success(`Document uploaded for ${this.activeTab() === 'trailer' ? 'trailer' : 'permit'} #${p.permitNumber}`, 'Uploaded');
        this.uploadingDoc.set(false);
        this.uploadTarget.set(null);
        this.permitDocFile = null;
        if (this.activeTab() === 'trailer') {
          const trailerId = this.resolveTrailerId(p);
          await this.loadTrailerAssignmentsFromApi([String(trailerId ?? '').trim()]);
        }
        this.loadData();
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

  openDrawerTrailerPhotoPicker(): void {
    const input = document.getElementById('trailer-drawer-photo-input') as HTMLInputElement | null;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onDrawerTrailerPhotosSelected(event: Event): void {
    const files = Array.from((event.target as HTMLInputElement)?.files || []);
    if (!files.length) return;
    const trailer = this.selectedTrailerDrawer();
    const trailerId = this.resolveTrailerId(trailer);
    if (!trailerId) {
      this.toast.error('Select a trailer first.', 'Photo upload');
      return;
    }
    void this.uploadTrailerPhotoBatch(trailerId, files);
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
      await this.loadTrailerPhotoHistory(trailerId);
      await this.syncTrailerPhotoOverrides();
      this.loadData();
    } catch (err: any) {
      this.toast.error(this.extractErrorMessage(err, 'Failed to upload trailer photo'), 'Photo upload');
    } finally {
      this.trailerPhotoUploading.set(false);
    }
  }

  private async uploadTrailerPhotoBatch(trailerId: any, files: File[]): Promise<void> {
    const normalizedTrailerId = String(trailerId ?? '').trim();
    if (!normalizedTrailerId || !files.length) return;

    this.trailerPhotoBatchUploading.set(true);
    let successCount = 0;
    for (const file of files) {
      try {
        await this.tryUploadTrailerPhoto(normalizedTrailerId, file);
        successCount++;
      } catch {
        // Keep uploading remaining files.
      }
    }

    await this.loadTrailerPhotoHistory(normalizedTrailerId);
    await this.syncTrailerPhotoOverrides();
    this.loadData();
    this.trailerPhotoBatchUploading.set(false);

    if (successCount > 0) {
      this.toast.success(`${successCount} trailer photo${successCount === 1 ? '' : 's'} uploaded`, 'Success');
    } else {
      this.toast.error('Failed to upload trailer photos', 'Photo upload');
    }
  }

  openTrailerPhotoFromHistory(photo: any): void {
    const rawUrl = String(photo?.photoUrl || '').trim();
    if (!rawUrl) return;
    const absoluteUrl = rawUrl.startsWith('/api/') ? `${this.apiUrl}${rawUrl}` : rawUrl;
    this.openPhotoUrlWithAuth(absoluteUrl, String(photo?.fileName || '').trim() || 'trailer-photo');
  }

  async deleteTrailerPhotoFromHistory(photo: any): Promise<void> {
    const id = Number(photo?.id || 0);
    if (!id || !confirm('Delete this trailer photo?')) return;
    try {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/api/v1/trailer-photos/photo/${id}`));
      const trailerId = this.resolveTrailerId(this.selectedTrailerDrawer());
      await this.loadTrailerPhotoHistory(trailerId);
      await this.syncTrailerPhotoOverrides();
      this.loadData();
      this.toast.success('Trailer photo deleted', 'Deleted');
    } catch {
      this.toast.error('Failed to delete trailer photo', 'Error');
    }
  }

  formatFileSize(size: any): string {
    const bytes = Number(size || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  viewPermitDoc(p: any): void {
    this.http.get(`${this.resolvePermitDocBase(p)}/document`,
      { responseType: 'blob' }
    ).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.toast.error('Failed to load document', 'Error')
    });
  }

  downloadPermitDoc(p: any): void {
    this.http.get(`${this.resolvePermitDocBase(p)}/download`,
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
    const label = this.activeTab() === 'trailer' ? 'trailer' : 'permit';
    if (!confirm(`Remove document from ${label} #${p.permitNumber}?`)) return;
    this.http.delete(`${this.resolvePermitDocBase(p)}/document`).subscribe({
      next: async () => {
        this.toast.success('Document removed', 'Removed');
        if (this.activeTab() === 'trailer') {
          const trailerId = this.resolveTrailerId(p);
          await this.loadTrailerAssignmentsFromApi([String(trailerId ?? '').trim()]);
        }
        this.loadData();
      },
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

  private buildFuelCardAssignmentMap(): Map<string, { label: string; last4: string; cardId: string }> {
    const map = new Map<string, { label: string; last4: string; cardId: string }>();
    for (const card of this.getResolvedFuelCards()) {
      const assignment = { label: card.label, last4: card.last4, cardId: card.id };
      const idKey = this.normalizeKey(card.assignedDriverId);
      const emailKey = this.normalizeKey(card.assignedDriverEmail);
      const nameKey = this.normalizeNameKey(card.assignedDriverName);

      if (idKey) map.set(`id:${idKey}`, assignment);
      if (emailKey) map.set(`email:${emailKey}`, assignment);
      if (nameKey) map.set(`name:${nameKey}`, assignment);
    }
    return map;
  }

  private extractFuelCardId(card: any, fallbackIndex: number): string {
    const rawId = card?.id ?? card?.card_id ?? card?.cardId ?? card?.uuid ?? card?.external_id ?? card?.externalId;
    const normalizedRaw = String(rawId ?? '').trim();
    if (normalizedRaw) return normalizedRaw;
    const last4 = this.buildFuelCardLast4(card);
    const name = String(card?.name ?? card?.card_name ?? card?.display_name ?? card?.nickname ?? '').trim();
    return `${name || 'card'}-${last4 || 'na'}-${fallbackIndex + 1}`;
  }

  private getResolvedFuelCards(): Array<{
    id: string;
    raw: any;
    card: any;
    label: string;
    last4: string;
    assignedDriverId: string;
    assignedDriverName: string;
    assignedDriverEmail: string;
  }> {
    const overrides = this.fuelCardAssignmentOverrides();
    const cards: Array<{
      id: string;
      raw: any;
      card: any;
      label: string;
      last4: string;
      assignedDriverId: string;
      assignedDriverName: string;
      assignedDriverEmail: string;
    }> = [];

    this.motivFuelCards().forEach((raw: any, index: number) => {
      const card = raw?.card ?? raw?.fuel_card ?? raw?.payment_card ?? raw ?? {};
      const assigned = card?.assigned_driver ?? card?.driver ?? card?.user ?? card?.holder ?? raw?.assigned_driver ?? raw?.driver ?? raw?.user ?? raw?.holder ?? {};
      const assignedName = [assigned?.first_name ?? assigned?.firstName, assigned?.last_name ?? assigned?.lastName].filter(Boolean).join(' ').trim() || String(assigned?.name ?? '').trim();
      const assignedEmail = String(assigned?.email ?? assigned?.driver_email ?? raw?.assigned_driver_email ?? '').trim();
      const assignedId = String(assigned?.id ?? assigned?.driver_id ?? assigned?.user_id ?? raw?.assigned_driver_id ?? raw?.driver_id ?? raw?.user_id ?? '').trim();
      const id = this.extractFuelCardId(card, index);
      const override = overrides[id];

      let resolvedDriverId = assignedId;
      let resolvedDriverName = assignedName;
      let resolvedDriverEmail = assignedEmail;

      if (override) {
        if (!String(override.driverId ?? '').trim()) {
          resolvedDriverId = '';
          resolvedDriverName = '';
          resolvedDriverEmail = '';
        } else {
          const overrideDriverId = String(override.driverId).trim();
          const driver = this.drivers().find((d: any) => this.normalizeKey(d?.id) === this.normalizeKey(overrideDriverId));
          resolvedDriverId = overrideDriverId;
          resolvedDriverName = String(driver?.name ?? override.driverName ?? '').trim();
          resolvedDriverEmail = String(driver?.email ?? override.driverEmail ?? '').trim();
        }
      }

      cards.push({
        id,
        raw,
        card,
        label: this.buildFuelCardDisplay(card),
        last4: this.buildFuelCardLast4(card),
        assignedDriverId: resolvedDriverId,
        assignedDriverName: resolvedDriverName,
        assignedDriverEmail: resolvedDriverEmail
      });
    });

    return cards;
  }

  getFuelCardAssignmentOptions(): Array<{ id: string; label: string }> {
    const selectedDriverId = this.normalizeKey(this.selectedFuelCardDriver()?.id);
    return this.getResolvedFuelCards().map((card) => {
      const assignedToCurrent = this.normalizeKey(card.assignedDriverId) === selectedDriverId;
      const assignedLabel = !card.assignedDriverId
        ? 'Unassigned'
        : (assignedToCurrent ? 'Assigned to selected driver' : `Assigned to ${card.assignedDriverName || card.assignedDriverEmail || `Driver ${card.assignedDriverId}`}`);
      const last4 = card.last4 && card.last4 !== 'N/A' ? ` • ${card.last4}` : '';
      return { id: card.id, label: `${card.label}${last4} (${assignedLabel})` };
    });
  }

  openFuelCardDetails(driverRow: any): void {
    const assignedCard = this.getAssignedFuelCardForDriver(driverRow);
    if (!assignedCard) {
      this.toast.error('No fuel card assigned to this driver.', 'Card details');
      return;
    }
    this.selectedFuelCardDetail.set({
      driverName: driverRow?.name || 'Unknown Driver',
      cardLabel: assignedCard.label,
      last4: assignedCard.last4 || 'N/A',
      cardId: assignedCard.id,
      status: assignedCard.card?.status ?? assignedCard.raw?.status ?? '—',
      network: assignedCard.card?.network ?? assignedCard.raw?.network ?? assignedCard.card?.provider ?? assignedCard.raw?.provider ?? '—',
      cardType: assignedCard.card?.type ?? assignedCard.raw?.type ?? assignedCard.card?.card_type ?? assignedCard.raw?.card_type ?? '—',
      nickname: assignedCard.card?.nickname ?? assignedCard.raw?.nickname ?? assignedCard.card?.name ?? assignedCard.raw?.name ?? '—',
      spendLimit: assignedCard.card?.spend_limit ?? assignedCard.raw?.spend_limit ?? assignedCard.card?.limit ?? assignedCard.raw?.limit ?? null
    });
    this.showFuelCardDetailsModal.set(true);
  }

  closeFuelCardDetailsModal(): void {
    this.showFuelCardDetailsModal.set(false);
    this.selectedFuelCardDetail.set(null);
  }

  openFuelCardAssignModal(driverRow: any): void {
    this.selectedFuelCardDriver.set(driverRow);
    this.fuelCardAssignCardId.set(String(driverRow?.assignedFuelCardId ?? '').trim());
    this.showFuelCardAssignModal.set(true);
  }

  closeFuelCardAssignModal(): void {
    this.showFuelCardAssignModal.set(false);
    this.selectedFuelCardDriver.set(null);
    this.fuelCardAssignCardId.set('');
    this.savingFuelCardAssignment.set(false);
  }

  saveFuelCardAssignment(): void {
    const driver = this.selectedFuelCardDriver();
    if (!driver) return;

    this.savingFuelCardAssignment.set(true);
    const driverId = String(driver?.id ?? '').trim();
    const selectedCardId = String(this.fuelCardAssignCardId() ?? '').trim();
    const currentCardId = String(driver?.assignedFuelCardId ?? '').trim();
    const next = { ...this.fuelCardAssignmentOverrides() };

    for (const [cardId, assignment] of Object.entries(next)) {
      if (String((assignment as any)?.driverId ?? '').trim() === driverId) {
        delete next[cardId];
      }
    }

    if (currentCardId && currentCardId !== selectedCardId) {
      next[currentCardId] = { driverId: '' };
    }

    if (selectedCardId) {
      next[selectedCardId] = {
        driverId,
        driverName: String(driver?.name ?? '').trim(),
        driverEmail: String(driver?.email ?? '').trim()
      };
    } else if (currentCardId) {
      next[currentCardId] = { driverId: '' };
    }

    this.fuelCardAssignmentOverrides.set(next);
    this.persistFuelCardAssignmentOverrides(next);
    this.savingFuelCardAssignment.set(false);
    this.closeFuelCardAssignModal();
    this.toast.champagne('Fuel card assignment updated', 'Success');
  }

  private getAssignedFuelCardForDriver(driverRow: any): {
    id: string;
    raw: any;
    card: any;
    label: string;
    last4: string;
    assignedDriverId: string;
    assignedDriverName: string;
    assignedDriverEmail: string;
  } | null {
    const targetCardId = String(driverRow?.assignedFuelCardId ?? '').trim();
    if (targetCardId) {
      return this.getResolvedFuelCards().find((card) => card.id === targetCardId) ?? null;
    }

    const targetDriverKeys = this.buildDriverLookupKeys(driverRow);
    const keySet = new Set(targetDriverKeys);
    return this.getResolvedFuelCards().find((card) => {
      const cardKeys = [
        `id:${this.normalizeKey(card.assignedDriverId)}`,
        `email:${this.normalizeKey(card.assignedDriverEmail)}`,
        `name:${this.normalizeNameKey(card.assignedDriverName)}`
      ].filter((k: string) => !k.endsWith(':'));
      return cardKeys.some((k: string) => keySet.has(k));
    }) ?? null;
  }

  private loadFuelCardAssignmentOverrides(): void {
    try {
      const raw = localStorage.getItem(this.fuelCardAssignmentOverridesKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      this.fuelCardAssignmentOverrides.set(parsed);
    } catch {
      // Ignore malformed local values.
    }
  }

  private persistFuelCardAssignmentOverrides(
    overrides: Record<string, { driverId: string; driverName?: string; driverEmail?: string }>
  ): void {
    try {
      localStorage.setItem(this.fuelCardAssignmentOverridesKey, JSON.stringify(overrides));
    } catch {
      // Ignore storage issues.
    }
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
    const trailerId = this.resolveTrailerId(t);
    const backendStatus = this.getTrailerAssignmentStatus(t);
    const assignment = this.getTrailerAssignment(trailerId) || {};
    const useAssignmentDriver = !!assignment.driverOverride;
    const resolvedAssignedDriverId = useAssignmentDriver
      ? (assignment.assignedDriverId ?? null)
      : (assignment.assignedDriverId ?? assignedDriverId);
    const resolvedAssignedDriverName = useAssignmentDriver
      ? String(assignment.assignedDriverName ?? '').trim()
      : (String(assignment.assignedDriverName || assignedDriverName || '').trim());
    const resolvedTrailerStatus = assignment.trailerStatus
      ? this.normalizeTrailerStatus(assignment.trailerStatus)
      : backendStatus;

    const photoMeta = this.trailerPhotoMeta()[String(trailerId ?? '').trim()];
    const resolvedPhotoUrl = (photoMeta?.count ?? 0) > 0
      ? this.buildTrailerPhotoViewUrl(trailerId)
      : null;

    return {
      id: trailerId,
      permitNumber: assignment.permitNumber || t?.tagNumber || t?.permitNumber || t?.number || t?.trailerNumber || t?.unitNumber || '',
      permitType: assignment.permitType || t?.type || t?.subtype || 'standard_equipment',
      state: assignment.state || t?.state || t?.currentLocation || '',
      issueDate: assignment.issueDate ?? (t?.issueDate || t?.registrationStartDate || t?.createdAt || null),
      expiryDate: assignment.expiryDate ?? (t?.expiryDate || t?.registrationExpiry || null),
      cost: assignment.cost ?? t?.cost ?? t?.purchasePrice ?? null,
      vendor: this.normalizeTrailerVendor(assignment.vendor || t?.vendor || t?.lessor || t?.leasingVendor || t?.provider),
      vendorLabel: this.getTrailerVendorLabel(assignment.vendor || t?.vendor || t?.lessor || t?.leasingVendor || t?.provider),
      chargeFrequency: assignment.chargeFrequency || t?.chargeFrequency || t?.billingFrequency || t?.rateFrequency || t?.frequency || 'monthly',
      trailerStatus: resolvedTrailerStatus,
      assignedDriverId: resolvedAssignedDriverId,
      assignedDriverName: resolvedAssignedDriverName,
      assignedTruckNumber: assignment.assignedTruckNumber || t?.number || t?.trailerNumber || t?.unitNumber || t?.truckNumber || '',
      status: t?.status || (resolvedAssignedDriverId ? 'active' : 'expiring'),
      notes: assignment.notes || t?.notes || '',
      photoUrl: resolvedPhotoUrl,
      hasFile: !!assignment.hasFile,
      fileName: assignment.fileName ?? null
    };
  }

  private async saveTrailer(): Promise<void> {
    this.saving.set(true);
    const editing = this.editingPermit();
    const selectedTrailerId = this.permitForm.trailerId ? `${this.permitForm.trailerId}` : '';
    const editingTrailerId = this.resolveTrailerId(editing);
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
      let trailerId = selectedTrailerId || (editingTrailerId ? `${editingTrailerId}` : '');
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
        await this.persistTrailerAssignment(trailerId, {
          permitNumber: trailerBody.permitNumber || '',
          permitType: trailerBody.type || 'standard_equipment',
          state: trailerBody.state || '',
          issueDate: trailerBody.issueDate || null,
          expiryDate: trailerBody.expiryDate || null,
          cost: trailerBody.cost ?? null,
          vendor: this.normalizeTrailerVendor(trailerBody.vendor),
          chargeFrequency: trailerBody.chargeFrequency || 'monthly',
          trailerStatus: selectedTrailerStatus,
          assignedDriverId: persistedDriverId,
          assignedDriverName: persistedDriverName || '',
          driverOverride: true,
          assignedTruckNumber: trailerBody.number || '',
          notes: trailerBody.notes || ''
        }, { clearAssignedDriver: !persistedDriverId });
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

  async unassignTrailerDriver(row: any): Promise<void> {
    const trailerId = String(this.resolveTrailerId(row) ?? '').trim();
    const driverName = String(row?.assignedDriverName || '').trim();
    if (!trailerId || !driverName) return;
    if (!confirm(`Unassign ${driverName} from trailer ${row?.permitNumber || row?.assignedTruckNumber || trailerId}?`)) return;

    try {
      const res: any = await firstValueFrom(
        this.http.post(
          `${this.apiUrl}/api/v1/trailer-assignments/${encodeURIComponent(trailerId)}/unassign-driver`,
          {}
        )
      );
      const mapped = this.mapApiTrailerAssignment({ trailerId, ...(res?.data ?? {}) });
      this.trailerAssignments.set({
        ...this.trailerAssignments(),
        [trailerId]: mapped
      });
      this.loadData();
      if (res?.assetsSynced === false) {
        this.toast.success('Driver unassigned in Taylor Access', 'Unassigned');
      } else {
        this.toast.success('Driver unassigned from trailer', 'Unassigned');
      }
    } catch (err: any) {
      this.toast.error(this.extractErrorMessage(err, 'Failed to unassign driver'), 'Error');
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

  async moveTrailerToInactive(row: any): Promise<void> {
    const trailerId = String(this.resolveTrailerId(row) ?? '').trim();
    if (!trailerId) {
      this.toast.error('Invalid trailer id', 'Status update');
      return;
    }
    if (!confirm(`Move trailer ${row?.permitNumber || row?.assignedTruckNumber || trailerId} to inactive?`)) return;

    const inactiveTrailerStatus: 'active' | 'inactive' | 'returned' | 'closed_out' = 'inactive';
    const trailerPayload = {
      status: this.mapTrailerBackendStatus(inactiveTrailerStatus),
      assignmentStatus: inactiveTrailerStatus,
      trailerStatus: inactiveTrailerStatus,
      assignedDriverId: null,
      driverId: null,
      assignedDriverName: null,
      ownerName: null
    };
    const equipmentPayload = {
      status: this.mapEquipmentBackendStatus(inactiveTrailerStatus),
      assignmentStatus: inactiveTrailerStatus,
      trailerStatus: inactiveTrailerStatus,
      assignedDriverId: null,
      driverId: null,
      ownerName: null
    };

    const requests = [
      () => firstValueFrom(this.http.patch(this.trailerPath(`/equipment/${trailerId}`), equipmentPayload)),
      () => firstValueFrom(this.http.put(this.trailerPath(`/equipment/${trailerId}`), equipmentPayload)),
      () => firstValueFrom(this.http.patch(this.trailerPath(`/trailers/${trailerId}`), trailerPayload)),
      () => firstValueFrom(this.http.put(this.trailerPath(`/trailers/${trailerId}`), trailerPayload))
    ];

    let success = false;
    for (const request of requests) {
      try {
        await request();
        success = true;
        break;
      } catch {
        // Try next status update strategy.
      }
    }

    if (!success) {
      await this.applyTrailerAssignmentState(trailerId, inactiveTrailerStatus, null, '');
      this.loadData();
      this.toast.warning('Trailer marked inactive in Taylor Access; Taylor Assets sync is pending.', 'Status update');
      return;
    }

    await this.applyTrailerAssignmentState(trailerId, inactiveTrailerStatus, null, '');
    this.loadData();
    this.toast.success('Trailer moved to inactive', 'Status updated');
  }

  async reactivateTrailer(row: any): Promise<void> {
    const trailerId = String(this.resolveTrailerId(row) ?? '').trim();
    if (!trailerId) {
      this.toast.error('Invalid trailer id', 'Status update');
      return;
    }
    if (!confirm(`Reactivate trailer ${row?.permitNumber || row?.assignedTruckNumber || trailerId}?`)) return;

    const activeTrailerStatus: 'active' | 'inactive' | 'returned' | 'closed_out' = 'active';
    const persistedDriverId = row?.assignedDriverId ?? null;
    const persistedDriverName = String(row?.assignedDriverName || '').trim() || null;
    const trailerPayload = {
      status: this.mapTrailerBackendStatus(activeTrailerStatus),
      assignmentStatus: activeTrailerStatus,
      trailerStatus: activeTrailerStatus,
      assignedDriverId: persistedDriverId,
      driverId: persistedDriverId,
      assignedDriverName: persistedDriverName,
      ownerName: persistedDriverName
    };
    const equipmentPayload = {
      status: this.mapEquipmentBackendStatus(activeTrailerStatus),
      assignmentStatus: activeTrailerStatus,
      trailerStatus: activeTrailerStatus,
      assignedDriverId: persistedDriverId,
      driverId: persistedDriverId,
      ownerName: persistedDriverName
    };

    const requests = [
      () => firstValueFrom(this.http.patch(this.trailerPath(`/equipment/${trailerId}`), equipmentPayload)),
      () => firstValueFrom(this.http.put(this.trailerPath(`/equipment/${trailerId}`), equipmentPayload)),
      () => firstValueFrom(this.http.patch(this.trailerPath(`/trailers/${trailerId}`), trailerPayload)),
      () => firstValueFrom(this.http.put(this.trailerPath(`/trailers/${trailerId}`), trailerPayload))
    ];

    let success = false;
    for (const request of requests) {
      try {
        await request();
        success = true;
        break;
      } catch {
        // Try next status update strategy.
      }
    }

    if (!success) {
      await this.applyTrailerAssignmentState(trailerId, activeTrailerStatus, persistedDriverId, persistedDriverName || '');
      this.loadData();
      this.toast.warning('Trailer reactivated in Taylor Access; Taylor Assets sync is pending.', 'Status update');
      return;
    }

    await this.applyTrailerAssignmentState(trailerId, activeTrailerStatus, persistedDriverId, persistedDriverName || '');
    this.loadData();
    this.toast.success('Trailer reactivated', 'Status updated');
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

  private resolveTrailerId(source: any): any {
    return source?.id
      ?? source?.equipmentId
      ?? source?.trailerId
      ?? source?.assetId
      ?? source?.unitId
      ?? source?._id
      ?? source?.uuid
      ?? null;
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
    if (Number(err?.status || 0) === 415) {
      return 'Photo upload failed: unsupported media format for this endpoint.';
    }
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
    const payload = new FormData();
    payload.append('file', file);
    const encodedTrailerId = encodeURIComponent(String(trailerId).trim());
    const res: any = await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/api/v1/trailer-photos/${encodedTrailerId}/upload`, payload)
    );
    const preferred = String(
      res?.latestPhotoUrl ??
      res?.photoUrl ??
      res?.data?.latestPhotoUrl ??
      res?.data?.photoUrl ??
      ''
    ).trim();
    if (preferred) {
      return preferred.startsWith('/api/') ? `${this.apiUrl}${preferred}` : preferred;
    }
    return this.buildTrailerPhotoViewUrl(trailerId);
  }

  private buildTrailerPhotoViewUrl(trailerId: unknown): string {
    const encodedTrailerId = encodeURIComponent(String(trailerId ?? '').trim());
    return `${this.apiUrl}/api/v1/trailer-photos/${encodedTrailerId}/view`;
  }

  private normalizeTrailerPhotoUrl(value: unknown, trailerId: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        if (parsed.hostname.includes('railway.internal')) {
          return this.buildTrailerPhotoViewUrl(trailerId);
        }
      } catch {
        return this.buildTrailerPhotoViewUrl(trailerId);
      }
      return raw;
    }

    if (raw.startsWith('/api/v1/trailer-photos/')) {
      return `${this.apiUrl}${raw}`;
    }

    return raw;
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

  private async afterTrailersLoaded(): Promise<void> {
    await this.loadTrailerAssignmentsFromApi();
    await this.syncTrailerPhotoOverrides();
  }

  private async loadTrailersWithFallback(): Promise<void> {
    try {
      const proxyRes: any = await firstValueFrom(
        this.http.get<any>(`${this.apiUrl}/api/v1/assets-proxy/trailers?limit=1000`)
      );
      const proxyData = Array.isArray(proxyRes?.data) ? proxyRes.data : [];
      if (proxyData.length > 0) {
        this.trailers.set(proxyData);
        await this.afterTrailersLoaded();
        return;
      }
      if (!proxyRes?.warning) {
        this.trailers.set([]);
        return;
      }
    } catch (err: any) {
      const status = Number(err?.status || 0);
      if (status !== 404 && status !== 401 && status !== 403) {
        this.trailers.set([]);
        return;
      }
    }

    const directSources = [
      `${this.assetsGatewayUrl}/api/v1/equipment?equipmentType=trailer&limit=1000`,
      `${this.assetsGatewayUrl}/api/v1/trailers?limit=1000`,
      `${environment.assetsApiUrl}/api/v1/equipment?equipmentType=trailer&limit=1000`,
      `${environment.assetsApiUrl}/api/v1/trailers?limit=1000`
    ];

    for (const url of directSources) {
      try {
        const res: any = await firstValueFrom(this.http.get<any>(url));
        const data = Array.isArray(res?.data) ? res.data : [];
        if (data.length > 0) {
          this.trailers.set(data);
          await this.afterTrailersLoaded();
          return;
        }
      } catch {
        // Try next source.
      }
    }

    try {
      const res: any = await this.trailerGetWithPathFallback('/equipment?equipmentType=trailer&limit=1000');
      const data = Array.isArray(res?.data) ? res.data : [];
      if (data.length > 0) {
        this.trailers.set(data);
        await this.afterTrailersLoaded();
        return;
      }
    } catch (err: any) {
      if (!this.shouldFallbackToEquipment(err)) {
        this.trailers.set([]);
        return;
      }
    }

    try {
      const res: any = await this.trailerGetWithPathFallback('/trailers?limit=1000');
      this.trailers.set(Array.isArray(res?.data) ? res.data : []);
      await this.afterTrailersLoaded();
    } catch {
      this.trailers.set([]);
    }
  }

  private async syncTrailerPhotoOverrides(): Promise<void> {
    const trailerIds = this.trailers()
      .map((t: any) => String(this.resolveTrailerId(t) ?? '').trim())
      .filter((id: string) => !!id);
    if (!trailerIds.length) return;

    try {
      const query = encodeURIComponent(Array.from(new Set(trailerIds)).join(','));
      const res: any = await firstValueFrom(
        this.http.get<any>(`${this.apiUrl}/api/v1/trailer-photos?trailerIds=${query}`)
      );
      const photos = Array.isArray(res?.data) ? res.data : [];
      const uniqueIds = Array.from(new Set(trailerIds));

      const previousMeta = this.trailerPhotoMeta();
      const nextMeta: Record<string, { count: number; previewUrl: string | null; thumbBlobUrl: string | null }> = {};
      for (const trailerId of uniqueIds) {
        nextMeta[trailerId] = { count: 0, previewUrl: null, thumbBlobUrl: null };
      }

      for (const row of photos) {
        const trailerId = String(row?.trailerId ?? '').trim();
        if (!trailerId) continue;

        const count = Math.max(0, Number(row?.photoCount ?? 1));
        const photoUrl = this.normalizeTrailerPhotoUrl(row?.photoUrl, trailerId) || this.buildTrailerPhotoViewUrl(trailerId);
        const previous = previousMeta[trailerId];
        const reuseThumb = previous?.previewUrl === photoUrl ? previous.thumbBlobUrl : null;

        nextMeta[trailerId] = {
          count,
          previewUrl: photoUrl,
          thumbBlobUrl: reuseThumb
        };
      }

      for (const [trailerId, info] of Object.entries(previousMeta)) {
        if (nextMeta[trailerId] || !info.thumbBlobUrl?.startsWith('blob:')) continue;
        URL.revokeObjectURL(info.thumbBlobUrl);
      }

      this.trailerPhotoMeta.set(nextMeta);
      await this.loadTrailerTableThumbnails();
    } catch {
      // Ignore photo override sync failures.
    }
  }

  private async loadTrailerTableThumbnails(): Promise<void> {
    const pending = Object.entries(this.trailerPhotoMeta())
      .filter(([, info]) => info.count > 0 && !!info.previewUrl && !info.thumbBlobUrl);
    if (!pending.length) return;

    const updated = { ...this.trailerPhotoMeta() };
    await Promise.all(pending.map(async ([trailerId, info]) => {
      try {
        const blob = await firstValueFrom(this.http.get(info.previewUrl!, { responseType: 'blob' }));
        if (!blob || blob.size <= 0) return;
        updated[trailerId] = {
          ...info,
          thumbBlobUrl: URL.createObjectURL(blob)
        };
      } catch {
        // Ignore thumbnail load failures for individual trailers.
      }
    }));

    this.trailerPhotoMeta.set(updated);
  }

  private revokeTrailerThumbBlobs(meta?: Record<string, { count: number; previewUrl: string | null; thumbBlobUrl: string | null }>): void {
    const source = meta ?? this.trailerPhotoMeta();
    for (const info of Object.values(source)) {
      if (info.thumbBlobUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(info.thumbBlobUrl);
      }
    }
  }

  private async loadTrailerPhotoHistory(trailerId: any): Promise<void> {
    const id = String(trailerId ?? '').trim();
    if (!id) {
      this.trailerPhotoHistory.set([]);
      return;
    }

    this.trailerPhotoHistoryLoading.set(true);
    try {
      const encodedTrailerId = encodeURIComponent(id);
      const res: any = await firstValueFrom(
        this.http.get<any>(`${this.apiUrl}/api/v1/trailer-photos/${encodedTrailerId}/photos`)
      );
      const rows = Array.isArray(res?.data) ? res.data : [];
      this.trailerPhotoHistory.set(rows);
      if (rows.length > 0) {
        const latestUrl = this.normalizeTrailerPhotoUrl(rows[0]?.photoUrl, id);
        if (latestUrl) {
          await this.loadTrailerDrawerPreviewFromUrl(latestUrl);
        } else {
          await this.loadTrailerDrawerPreview(id);
        }
      } else {
        this.setTrailerDrawerPhotoPreview(null);
      }
    } catch {
      this.trailerPhotoHistory.set([]);
      this.setTrailerDrawerPhotoPreview(null);
    } finally {
      this.trailerPhotoHistoryLoading.set(false);
    }
  }

  private async loadTrailerDrawerPreview(trailerId: string): Promise<void> {
    const encodedTrailerId = encodeURIComponent(String(trailerId || '').trim());
    if (!encodedTrailerId) {
      this.setTrailerDrawerPhotoPreview(null);
      return;
    }
    await this.loadTrailerDrawerPreviewFromUrl(`${this.apiUrl}/api/v1/trailer-photos/${encodedTrailerId}/view`);
  }

  private async loadTrailerDrawerPreviewFromUrl(url: string): Promise<void> {
    const target = String(url || '').trim();
    if (!target) {
      this.setTrailerDrawerPhotoPreview(null);
      return;
    }
    try {
      const blob = await firstValueFrom(
        this.http.get(target, { responseType: 'blob' })
      );
      if (!blob || blob.size <= 0) {
        this.setTrailerDrawerPhotoPreview(null);
        return;
      }
      this.setTrailerDrawerPhotoPreview(URL.createObjectURL(blob));
    } catch {
      this.setTrailerDrawerPhotoPreview(null);
    }
  }

  private setTrailerDrawerPhotoPreview(url: string | null): void {
    const previous = this.trailerDrawerPhotoPreviewUrl();
    if (previous && previous.startsWith('blob:')) {
      URL.revokeObjectURL(previous);
    }
    this.trailerDrawerPhotoPreviewUrl.set(url);
  }

  private openPhotoUrlWithAuth(url: string, fileName: string): void {
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob: Blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const opened = window.open(objectUrl, '_blank');
        if (!opened) {
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = fileName || 'trailer-photo';
          a.click();
        }
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      },
      error: () => this.toast.error('Failed to load trailer photo', 'Photo')
    });
  }
}
