import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventTrackingService } from '../../../core/services/event-tracking.service';
import { ConfirmService } from '../../../core/services/confirm.service';

interface DriverRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseExpiry: string;
  status: string;
  fleetName: string;
  hireDate: string;
  type: string;
}

@Component({
  selector: 'app-driver-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-list.component.html',
  styleUrls: ['./driver-list.component.scss']
})
export class DriverListComponent implements OnInit {
  private api = inject(VanTacApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private tracking = inject(EventTrackingService);
  private confirmDialog = inject(ConfirmService);

  isLoading = signal(false);
  syncingArchived = signal(false);
  drivers = signal<DriverRow[]>([]);
  searchQuery = signal('');
  fleetName = signal<string>('');
  activeTab = signal<'active' | 'inactive' | 'archived'>('active');

  // Modal state
  showModal = signal(false);
  modalType = signal<'add' | 'edit'>('add');
  saving = signal(false);
  editingId = signal<string | null>(null);
  availableFleets = signal<any[]>([]);
  availableOrganizations = signal<any[]>([]);

  readonly usStates = [
    { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'District of Columbia' }
  ];

  availableDivisions = signal<any[]>([]);
  availableDriverTerminals = signal<any[]>([]);

  driverForm = signal({
    name: '',
    email: '',
    phone: '',
    organizationId: null as number | null,
    fleetId: null as number | null,
    divisionId: null as number | null,
    driverTerminalId: null as number | null,
    licenseNumber: '',
    licenseState: '',
    licenseExpiry: '',
    dateOfBirth: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    ssn: '',
    truckNumber: '',
    truckMake: '',
    truckModel: '',
    truckYear: null as number | null,
    truckVin: '',
    truckTag: '',
    twiccCardNumber: '',
    twiccExpiry: '',
    truckOwnerName: '',
    truckOwnerPhone: '',
    truckOwnerCompany: '',
    emergencyContact: '',
    emergencyPhone: '',
    hireDate: '',
    payRate: 0,
    payType: 'mile' as 'mile' | 'hour' | 'percentage',
    driverType: 'company' as string,
    teamDriverId: null as number | null,
    teamDriverName: '' as string
  });

  tabbedDrivers = computed(() => {
    const tab = this.activeTab();
    const all = this.drivers();
    if (tab === 'archived') return all.filter(d => this.isArchivedStatus(d.status));
    if (tab === 'inactive') return all.filter(d => this.isInactiveStatus(d.status));
    return all.filter(d => !this.isArchivedStatus(d.status) && !this.isInactiveStatus(d.status));
  });

  filteredDrivers = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const pool = this.tabbedDrivers();
    if (!query) return pool;
    return pool.filter(d =>
      d.name.toLowerCase().includes(query) ||
      d.phone.includes(query) ||
      d.email?.toLowerCase().includes(query) ||
      d.licenseNumber?.toLowerCase().includes(query)
    );
  });

  tabCounts = computed(() => {
    const all = this.drivers();
    return {
      active: all.filter(d => !this.isArchivedStatus(d.status) && !this.isInactiveStatus(d.status)).length,
      inactive: all.filter(d => this.isInactiveStatus(d.status)).length,
      archived: all.filter(d => this.isArchivedStatus(d.status)).length
    };
  });

  stats = computed(() => {
    const all = this.drivers();
    return {
      total: all.length,
      active: all.filter(d => this.isActiveStatus(d.status)).length,
      dispatched: all.filter(d => this.isDispatchedStatus(d.status)).length,
      offDuty: all.filter(d => this.isInactiveStatus(d.status)).length
    };
  });

  ngOnInit(): void {
    this.loadDrivers();
    this.loadFleets();
    this.loadOrganizations();
  }

  private asArray(input: any): any[] {
    if (Array.isArray(input)) return input;
    if (Array.isArray(input?.data)) return input.data;
    if (Array.isArray(input?.items)) return input.items;
    if (Array.isArray(input?.rows)) return input.rows;
    if (Array.isArray(input?.drivers)) return input.drivers;
    if (Array.isArray(input?.data?.items)) return input.data.items;
    if (Array.isArray(input?.data?.rows)) return input.data.rows;
    if (Array.isArray(input?.data?.drivers)) return input.data.drivers;
    return [];
  }

  setActiveTab(tab: 'active' | 'inactive' | 'archived'): void {
    this.activeTab.set(tab);
    if (tab === 'archived' && this.tabCounts().archived === 0) {
      this.syncArchivedFromDrayTac(false);
    }
  }

  loadOrganizations(): void {
    this.api.getOrganizations().subscribe({
      next: (res: any) => this.availableOrganizations.set(this.asArray(res)),
      error: () => this.availableOrganizations.set([])
    });
  }

  loadFleets(): void {
    this.api.getFleets().subscribe({
      next: (res: any) => this.availableFleets.set(this.asArray(res)),
      error: () => this.availableFleets.set([])
    });
  }

  loadDrivers(): void {
    this.isLoading.set(true);

    // Load drivers -- the backend already filters by the user's org/entity access
    this.api.getDrivers({ limit: 2000 }).subscribe({
      next: (res) => {
        const data = this.asArray(res);
        const mapped: DriverRow[] = data.map((d: any) => ({
          id: d.id,
          name: d.name || '',
          phone: d.phone || '',
          email: d.email || '',
          licenseNumber: d.licenseNumber || '',
          licenseExpiry: d.licenseExpiry || '',
          status: this.normalizeStatus(d.status || 'active'),
          fleetName: d.fleet?.name || '—',
          hireDate: d.hireDate || d.createdAt || '',
          type: d.driverType || 'company'
        }));
        this.drivers.set(mapped);

        // Derive fleet name from data if available
        const fleets = [...new Set(mapped.filter(d => d.fleetName !== '—').map(d => d.fleetName))];
        this.fleetName.set(fleets.length === 1 ? fleets[0] : '');

        this.isLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load drivers', 'Error');
        this.isLoading.set(false);
      }
    });
  }

  syncArchivedFromDrayTac(showToast = true): void {
    if (this.syncingArchived()) return;
    this.syncingArchived.set(true);
    this.api.importDrayTacArchivedDrivers(10000, true).subscribe({
      next: (res: any) => {
        const fetched = res?.fetched ?? 0;
        const created = res?.created ?? 0;
        const updated = res?.updated ?? 0;
        if (showToast) {
          this.toast.success(`DrayTac sync complete: ${fetched} scanned, ${created} created, ${updated} updated.`, 'Archived Sync');
        }
        this.loadDrivers();
        this.syncingArchived.set(false);
      },
      error: (err: any) => {
        if (showToast) {
          this.toast.error(err?.error?.error || 'Failed syncing archived drivers from DrayTac', 'Sync Failed');
        }
        this.syncingArchived.set(false);
      }
    });
  }

  // Slide-out panel (row click)
  selectedDriver = signal<any>(null);
  detailTab = signal<'overview' | 'pm' | 'paperlogs'>('overview');
  driverPmDocs = signal<any[]>([]);
  driverPaperLogs = signal<any[]>([]);
  pmManageMode = signal(false);
  pmSelectedIds = signal<string[]>([]);
  panelDocs = signal<any[]>([]);
  compUploadOpen = signal(false);
  compUploadItem = signal<any>(null);
  compUploading = signal(false);
  compUploadFile: File | null = null;
  compUploadForm = { documentName: '', documentNumber: '', issueDate: '', expiryDate: '', notes: '' };
  // Profile modal popup (icon click)
  profileDriver = signal<any>(null);
  profileTab = signal<'profile' | 'documents'>('profile');
  driverDocuments = signal<any[]>([]);

  complianceItems = [
    { key: 'cdl', label: 'CDL / License' },
    { key: 'medical', label: 'Medical Certificate' },
    { key: 'mvr', label: 'Motor Vehicle Record' },
    { key: 'drugTest', label: 'Drug & Alcohol Test' },
    { key: 'dqf', label: 'Driver Qualification File' },
    { key: 'employment', label: 'Employment Verification' },
    { key: 'training', label: 'Training' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'vehicleDocs', label: 'Vehicle Docs' },
    { key: 'permits', label: 'Permits' },
    { key: 'i9', label: 'I-9' },
    { key: 'w9', label: 'W-9' },
    { key: 'directDeposit', label: 'Direct Deposit' },
    { key: 'deduction', label: 'Deduction' },
  ];

  getComplianceStatus(driver: any, key: string): string {
    if (key === 'cdl' && driver.licenseNumber) {
      return this.isExpired(driver.licenseExpiry) ? 'dot-red' :
             this.isExpiringSoon(driver.licenseExpiry) ? 'dot-yellow' : 'dot-green';
    }
    if (key === 'medical' && driver.medicalCardExpiry) {
      return this.isExpired(driver.medicalCardExpiry) ? 'dot-red' :
             this.isExpiringSoon(driver.medicalCardExpiry) ? 'dot-yellow' : 'dot-green';
    }
    if (key === 'employment' && driver.hireDate) return 'dot-green';

    if (key === 'permits' && driver.twiccExpiry) {
      return this.isExpired(driver.twiccExpiry) ? 'dot-red' :
             this.isExpiringSoon(driver.twiccExpiry) ? 'dot-yellow' : 'dot-green';
    }

    const doc = this.getPanelDoc(key);
    if (doc) {
      if (doc.status === 'expired') return 'dot-red';
      if (doc.status === 'expiring') return 'dot-yellow';
      return 'dot-green';
    }
    return 'dot-gray';
  }

  private fetchFullDriver(driver: DriverRow): void {
    this.api.getDriver(driver.id).subscribe({
      next: (res: any) => {
        const d = res?.data || res;
        const full = {
          ...driver,
          licenseState: d.licenseState || '',
          licenseClass: d.licenseClass || '',
          address: d.addressRef?.street1 || d.address || d.fullAddress || '',
          city: d.addressRef?.city || d.city || '',
          state: d.addressRef?.state || d.state || '',
          zip: d.addressRef?.zipCode || d.zipCode || d.zip || '',
          ssn: d.ssn || d.socialSecurityNumber || '',
          truckNumber: d.truckNumber || '',
          truckMake: d.truckMake || '',
          truckModel: d.truckModel || '',
          truckYear: d.truckYear || null,
          truckVin: d.truckVin || '',
          truckTag: d.truckTag || '',
          emergencyContact: d.emergencyContactName || d.emergencyContact || '',
          emergencyPhone: d.emergencyContactPhone || d.emergencyPhone || '',
          dateOfBirth: d.dateOfBirth || '',
          medicalCardExpiry: d.medicalCardExpiry || '',
          payRate: d.payRate || 0,
          payType: d.payType || '',
        };
        if (this._fetchTarget === 'panel') this.selectedDriver.set(full);
        else this.profileDriver.set(full);
      },
      error: () => {
        if (this._fetchTarget === 'panel') this.selectedDriver.set(driver as any);
        else this.profileDriver.set(driver as any);
      }
    });
  }
  private _fetchTarget: 'panel' | 'modal' = 'panel';

  selectDriverRow(driver: DriverRow): void {
    this._fetchTarget = 'panel';
    this.fetchFullDriver(driver);
    this.loadPanelDocs(driver);
  }

  loadPanelDocs(driver: DriverRow | any): void {
    const aliasIds = this.resolveAliasDriverIds(driver);
    Promise.all(
      aliasIds.map((id: string) =>
        this.api.getDriverDocuments(id).toPromise().then((res: any) => res?.data || []).catch(() => [])
      )
    ).then((docLists: any[]) => {
      this.panelDocs.set(this.mergeDocuments(...docLists));
    }).catch(() => this.panelDocs.set([]));
  }

  getPanelDoc(key: string): any {
    const sub = this.compSubMap[key];
    const cat = this.compCategoryMap[key];
    const docs = this.panelDocs();
    if (!docs.length) return null;
    let doc = docs.find((d: any) => d.subCategory === sub);
    if (doc) return doc;
    if (cat) { doc = docs.find((d: any) => d.category === cat); if (doc) return doc; }
    const labels: Record<string, string[]> = {
      cdl: ['cdl', 'license'], medical: ['medical', 'dot physical'], mvr: ['mvr', 'motor vehicle'],
      drugTest: ['drug', 'alcohol'], dqf: ['dqf', 'qualification'], employment: ['employment', 'verification'],
      training: ['training'], insurance: ['insurance'], vehicleDocs: ['vehicle', 'registration'],
      permits: ['permit', 'twic']
    };
    const terms = labels[key] || [key];
    return docs.find((d: any) => {
      const name = ((d.documentName || '') + ' ' + (d.subCategory || '') + ' ' + (d.category || '')).toLowerCase();
      return terms.some((t: string) => name.includes(t));
    }) || null;
  }

  private resolveAliasDriverIds(driver: DriverRow | any): string[] {
    const toId = (value: any) => String(value ?? '').trim();
    const baseId = toId(driver?.id);
    const baseEmail = String(driver?.email || '').trim().toLowerCase();
    const basePhone = String(driver?.phone || '').replace(/\D+/g, '');
    const basePhoneLast7 = basePhone.length >= 7 ? basePhone.slice(-7) : '';
    const baseName = String(driver?.name || '').trim().toLowerCase().replace(/\s+/g, ' ');

    const ids = new Set<string>();
    if (baseId) ids.add(baseId);

    for (const row of this.drivers()) {
      const rowId = toId((row as any)?.id);
      if (!rowId) continue;
      const rowEmail = String((row as any)?.email || '').trim().toLowerCase();
      const rowPhone = String((row as any)?.phone || '').replace(/\D+/g, '');
      const rowPhoneLast7 = rowPhone.length >= 7 ? rowPhone.slice(-7) : '';
      const rowName = String((row as any)?.name || '').trim().toLowerCase().replace(/\s+/g, ' ');

      const emailMatch = !!baseEmail && baseEmail === rowEmail;
      const phoneMatch = !!basePhone && basePhone === rowPhone;
      const namePhoneMatch = !!baseName && !!basePhoneLast7 && baseName === rowName && basePhoneLast7 === rowPhoneLast7;
      if (emailMatch || phoneMatch || namePhoneMatch) {
        ids.add(rowId);
      }
    }

    return Array.from(ids);
  }

  private mergeDocuments(...docSets: any[][]): any[] {
    const byId = new Map<string, any>();
    for (const set of docSets) {
      for (const doc of set || []) {
        const key = String(doc?.id ?? `${doc?.driverId ?? ''}|${doc?.category ?? ''}|${doc?.subCategory ?? ''}|${doc?.documentName ?? ''}`).trim();
        if (!key) continue;
        const existing = byId.get(key);
        if (!existing) {
          byId.set(key, doc);
          continue;
        }
        const existingTs = new Date(existing?.updatedAt || existing?.createdAt || 0).getTime();
        const nextTs = new Date(doc?.updatedAt || doc?.createdAt || 0).getTime();
        if (nextTs >= existingTs) byId.set(key, doc);
      }
    }
    return Array.from(byId.values());
  }

  archivePanelDoc(item: any): void {
    const doc = this.getPanelDoc(item.key);
    if (!doc?.id) return;
    if (!confirm(`Archive "${item.label}"? The document will be saved in history but removed from the active view.`)) return;

    this.api.updateDriverDocument(doc.id, { status: 'archived' }).subscribe({
      next: () => {
        this.toast.success(`${item.label} archived`, 'Archived');
        this.panelDocs.update(docs => docs.filter(d => d.id !== doc.id));
      },
      error: () => this.toast.error('Failed to archive', 'Error')
    });
  }

  viewPanelDoc(item: any): void {
    const doc = this.getPanelDoc(item.key);
    if (doc?.id) {
      this.api.downloadDriverDocumentFile(doc.id).subscribe({
        next: (blob: Blob) => window.open(URL.createObjectURL(blob), '_blank'),
        error: () => this.toast.error('Failed to load document', 'Error')
      });
    }
  }

  viewDriver(driver: DriverRow): void {
    this.profileTab.set('profile');
    this.driverDocuments.set([]);
    this._fetchTarget = 'modal';
    this.fetchFullDriver(driver);
  }

  closeProfile(): void {
    this.selectedDriver.set(null);
    this.detailTab.set('overview');
    this.driverPmDocs.set([]);
    this.driverPaperLogs.set([]);
    this.panelDocs.set([]);
    this.pmManageMode.set(false);
    this.pmSelectedIds.set([]);
  }

  togglePmSelect(id: string): void {
    this.pmSelectedIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
  }

  toggleSelectAllPm(): void {
    if (this.pmSelectedIds().length === this.driverPmDocs().length) {
      this.pmSelectedIds.set([]);
    } else {
      this.pmSelectedIds.set(this.driverPmDocs().map(d => d.id));
    }
  }

  archiveSelectedPm(): void {
    const count = this.pmSelectedIds().length;
    if (!confirm(`Archive ${count} document${count > 1 ? 's' : ''}?`)) return;

    const ids = this.pmSelectedIds();
    let completed = 0;
    for (const id of ids) {
      this.api.deleteDriverDocument(id).subscribe({
        next: () => { completed++; if (completed === ids.length) { this.toast.success(`${count} document(s) archived`, 'Archived'); this.pmSelectedIds.set([]); this.loadDriverPmDocs(); } },
        error: () => { completed++; }
      });
    }
  }

  verifySelectedPm(): void {
    const count = this.pmSelectedIds().length;
    const ids = this.pmSelectedIds();
    let completed = 0;

    for (const id of ids) {
      this.api.updateDriverDocument(id, { status: 'verified', verifiedAt: new Date().toISOString() }).subscribe({
        next: () => { completed++; if (completed === ids.length) { this.toast.success(`${count} document(s) verified`, 'Verified'); this.pmSelectedIds.set([]); this.loadDriverPmDocs(); } },
        error: () => { completed++; }
      });
    }
  }

  private readonly compCategoryMap: Record<string, string> = {
    cdl: 'cdl_endorsements', medical: 'medical', mvr: 'mvr', drugTest: 'drug_tests',
    dqf: 'dqf', employment: 'employment', training: 'training',
    insurance: 'insurance', vehicleDocs: 'vehicle', permits: 'permits',
    i9: 'i9', w9: 'w9', directDeposit: 'direct_deposit', deduction: 'deduction'
  };

  private readonly compSubMap: Record<string, string> = {
    cdl: 'cdl_license', medical: 'medical_card', mvr: 'annual_mvr', drugTest: 'pre_employment',
    dqf: 'application', employment: 'offer_letter', training: 'entry_level_driver',
    insurance: 'certificate_of_insurance', vehicleDocs: 'registration', permits: 'oversize',
    i9: 'i9_form', w9: 'w9_form', directDeposit: 'direct_deposit_form', deduction: 'deduction_form'
  };

  openComplianceUpload(item: any): void {
    this.compUploadItem.set(item);
    this.compUploadFile = null;
    this.compUploadForm = { documentName: item.label, documentNumber: '', issueDate: '', expiryDate: '', notes: '' };
    this.compUploadOpen.set(true);
  }

  submitComplianceUpload(): void {
    const driver = this.selectedDriver();
    const item = this.compUploadItem();
    if (!driver || !item) return;
    if (!this.compUploadForm.documentName.trim()) { this.toast.error('Document name required', 'Required'); return; }

    this.compUploading.set(true);

    const fd = new FormData();
    fd.append('driverId', driver.id);
    fd.append('category', this.compCategoryMap[item.key] || item.key);
    fd.append('subCategory', this.compSubMap[item.key] || item.key);
    fd.append('documentName', this.compUploadForm.documentName);
    fd.append('documentNumber', this.compUploadForm.documentNumber);
    if (this.compUploadForm.issueDate) fd.append('issueDate', this.compUploadForm.issueDate);
    if (this.compUploadForm.expiryDate) fd.append('expiryDate', this.compUploadForm.expiryDate);
    fd.append('notes', this.compUploadForm.notes);
    if (this.compUploadFile) fd.append('file', this.compUploadFile);

    this.api.createDriverDocument(fd).subscribe({
      next: () => {
        this.toast.success(`${item.label} uploaded`, 'Success');
        this.compUploading.set(false);
        this.compUploadOpen.set(false);
      },
      error: (err) => {
        this.toast.error(err?.error?.error || 'Upload failed', 'Error');
        this.compUploading.set(false);
      }
    });
  }

  viewPmDoc(doc: any): void {
    if (doc.id) {
      this.api.downloadDriverDocumentFile(doc.id).subscribe({
        next: (blob: Blob) => {
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        },
        error: () => this.toast.error('Failed to load document', 'Error')
      });
    }
  }

  uploadPmDoc(event: any): void {
    const file = event.target?.files?.[0];
    if (!file) return;
    const driver = this.selectedDriver();
    if (!driver) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('driverId', driver.id);
    formData.append('category', 'pm');
    formData.append('subCategory', 'other_pm');
    formData.append('documentName', file.name);

    this.toast.success(`Uploading ${file.name}...`, 'Upload');
    this.api.createDriverDocument(formData).subscribe({
      next: () => {
        this.toast.success('PM document uploaded', 'Success');
        this.loadDriverPmDocs();
      },
      error: () => this.toast.error('Failed to upload', 'Error')
    });

    event.target.value = '';
  }

  loadDriverPmDocs(): void {
    const driver = this.selectedDriver();
    if (!driver) return;
    this.api.getDriverDocuments(driver.id).subscribe({
      next: (res: any) => {
        const docs = (res?.data || []).filter((d: any) => d.category === 'pm');
        this.driverPmDocs.set(docs);
      },
      error: () => this.driverPmDocs.set([])
    });
  }

  uploadPaperLog(event: any): void {
    const file = event.target?.files?.[0];
    if (!file) return;
    const driver = this.selectedDriver();
    if (!driver) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('driverId', driver.id);
    formData.append('category', 'paper_log');
    formData.append('subCategory', 'paper_log');
    formData.append('documentName', file.name);

    this.toast.success(`Uploading ${file.name}...`, 'Upload');
    this.api.createDriverDocument(formData).subscribe({
      next: () => {
        this.toast.success('Paper log uploaded', 'Success');
        this.loadDriverPaperLogs();
      },
      error: () => this.toast.error('Failed to upload', 'Error')
    });

    event.target.value = '';
  }

  loadDriverPaperLogs(): void {
    const driver = this.selectedDriver();
    if (!driver) return;
    this.api.getDriverDocuments(driver.id).subscribe({
      next: (res: any) => {
        const docs = (res?.data || []).filter((d: any) => d.category === 'paper_log');
        this.driverPaperLogs.set(docs);
      },
      error: () => this.driverPaperLogs.set([])
    });
  }

  viewPaperLog(doc: any): void {
    if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank');
    }
  }

  closeProfileModal(): void {
    this.profileDriver.set(null);
    this.profileTab.set('profile');
    this.driverDocuments.set([]);
  }

  switchProfileTab(tab: 'profile' | 'documents'): void {
    this.profileTab.set(tab);
    if (tab === 'documents' && this.profileDriver()) {
      this.loadDriverDocuments(this.profileDriver()!.id);
    }
  }

  loadDriverDocuments(driverId: string): void {
    // Load from employee-documents endpoint if available
    this.api.getDriver(driverId).subscribe({
      next: (res: any) => {
        const d = res?.data || res;
        // Build document list from driver data
        const docs: any[] = [];
        if (d.licenseNumber) {
          docs.push({
            type: 'CDL License',
            icon: 'bx-id-card',
            number: d.licenseNumber,
            expiry: d.licenseExpiry,
            status: this.getDocStatus(d.licenseExpiry)
          });
        }
        if (d.medicalCardExpiry) {
          docs.push({
            type: 'Medical Card (DOT Physical)',
            icon: 'bx-plus-medical',
            number: '',
            expiry: d.medicalCardExpiry,
            status: this.getDocStatus(d.medicalCardExpiry)
          });
        }
        // Always show standard doc types even if not uploaded
        if (!d.licenseNumber) {
          docs.push({ type: 'CDL License', icon: 'bx-id-card', number: '', expiry: '', status: 'missing' });
        }
        if (!d.medicalCardExpiry) {
          docs.push({ type: 'Medical Card (DOT Physical)', icon: 'bx-plus-medical', number: '', expiry: '', status: 'missing' });
        }
        docs.push({ type: 'Motor Vehicle Record (MVR)', icon: 'bx-car', number: '', expiry: '', status: 'missing' });
        docs.push({ type: 'Drug Test Results', icon: 'bx-test-tube', number: '', expiry: '', status: 'missing' });
        docs.push({ type: 'Employment Application', icon: 'bx-file', number: '', expiry: '', status: 'missing' });
        this.driverDocuments.set(docs);
      },
      error: () => this.driverDocuments.set([])
    });
  }

  getDocStatus(dateString: string): string {
    if (!dateString) return 'missing';
    const expiry = new Date(dateString);
    const now = new Date();
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 90) return 'expiring';
    return 'valid';
  }

  getDocStatusLabel(status: string): string {
    switch (status) {
      case 'valid': return 'Valid';
      case 'expiring': return 'Expiring Soon';
      case 'expired': return 'Expired';
      case 'missing': return 'Not Uploaded';
      default: return status;
    }
  }

  previewDocument(doc: any): void {
    if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank');
    } else {
      this.toast.info(`No file uploaded for ${doc.type}`, 'Preview');
    }
  }

  uploadDocument(event: any, doc: any): void {
    const file = event.target?.files?.[0];
    if (!file) return;

    const driver = this.profileDriver();
    if (!driver) return;

    this.toast.success(`Uploading ${file.name} for ${doc.type}...`, 'Upload');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', doc.type);
    formData.append('driverId', driver.id);

    this.api.uploadDriverDocument(driver.id, formData).subscribe({
      next: () => {
        this.toast.success(`${doc.type} uploaded successfully`, 'Success');
        this.loadDriverDocuments(driver.id);
      },
      error: () => this.toast.error(`Failed to upload ${doc.type}`, 'Error')
    });
  }

  archiveDocument(doc: any): void {
    if (!confirm(`Archive "${doc.type}"? It will be moved to archived documents.`)) return;

    const driver = this.profileDriver();
    if (!driver) return;

    this.toast.success(`${doc.type} archived`, 'Archived');
    this.driverDocuments.update(docs => docs.map(d =>
      d.type === doc.type ? { ...d, status: 'missing', number: '', expiry: '' } : d
    ));
  }

  // Modal methods
  openAddModal(): void {
    this.modalType.set('add');
    this.editingId.set(null);
    this.resetForm();
    this.showModal.set(true);
  }

  editDriver(driver: DriverRow): void {
    this.modalType.set('edit');
    this.editingId.set(driver.id);

    this.api.getDriver(driver.id).subscribe({
      next: (res: any) => {
        const d = res?.data || res;
        this.driverForm.set({
          name: d.name || '',
          email: d.email || '',
          phone: d.phone || '',
          organizationId: d.organizationId || null,
          fleetId: d.fleetId || null,
          divisionId: d.divisionId || null,
          driverTerminalId: d.driverTerminalId || null,
          licenseNumber: d.licenseNumber || '',
          licenseState: d.licenseState || '',
          licenseExpiry: d.licenseExpiry ? d.licenseExpiry.split('T')[0] : '',
          dateOfBirth: d.dateOfBirth ? d.dateOfBirth.split('T')[0] : '',
          address: d.addressRef?.street1 || d.address || d.fullAddress || '',
          city: d.addressRef?.city || d.city || '',
          state: d.addressRef?.state || d.state || '',
          zip: d.addressRef?.zipCode || d.zipCode || d.zip || '',
          ssn: d.ssn || d.socialSecurityNumber || '',
          truckNumber: d.truckNumber || '',
          truckMake: d.truckMake || '',
          truckModel: d.truckModel || '',
          truckYear: d.truckYear || null,
          truckVin: d.truckVin || '',
          truckTag: d.truckTag || '',
          twiccCardNumber: d.twiccCardNumber || '',
          twiccExpiry: d.twiccExpiry ? d.twiccExpiry.split('T')[0] : '',
          truckOwnerName: d.truckOwnerName || '',
          truckOwnerPhone: d.truckOwnerPhone || '',
          truckOwnerCompany: d.truckOwnerCompany || '',
          emergencyContact: d.emergencyContactName || d.emergencyContact || '',
          emergencyPhone: d.emergencyContactPhone || d.emergencyPhone || '',
          hireDate: d.hireDate ? d.hireDate.split('T')[0] : '',
          payRate: d.payRate || 0,
          payType: d.payType || 'mile',
          driverType: d.driverType || 'company',
          teamDriverId: d.teamDriverId || null,
          teamDriverName: d.teamDriverName || ''
        });
        if (d.fleetId) this.loadDivisionsForFleet(d.fleetId);
        if (d.divisionId) this.loadTerminalsForDivision(d.divisionId);
        this.showModal.set(true);
      },
      error: () => {
        this.driverForm.set({
          name: driver.name, email: driver.email, phone: driver.phone,
          organizationId: null, fleetId: null, divisionId: null, driverTerminalId: null, licenseNumber: driver.licenseNumber, licenseState: '',
          licenseExpiry: driver.licenseExpiry ? driver.licenseExpiry.split('T')[0] : '',
          dateOfBirth: '', address: '', city: '', state: '', zip: '', ssn: '',
          truckNumber: '', truckMake: '', truckModel: '', truckYear: null, truckVin: '', truckTag: '', twiccCardNumber: '', twiccExpiry: '',
          truckOwnerName: '', truckOwnerPhone: '', truckOwnerCompany: '',
          emergencyContact: '', emergencyPhone: '',
          hireDate: driver.hireDate ? driver.hireDate.split('T')[0] : '',
          payRate: 0, payType: 'mile', driverType: driver.type || 'company',
          teamDriverId: null, teamDriverName: ''
        });
        this.showModal.set(true);
      }
    });
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  resetForm(): void {
    this.driverForm.set({
      name: '', email: '', phone: '', organizationId: null, fleetId: null, divisionId: null, driverTerminalId: null,
      licenseNumber: '', licenseState: '', licenseExpiry: '', dateOfBirth: '',
      address: '', city: '', state: '', zip: '', ssn: '',
      truckNumber: '', truckMake: '', truckModel: '', truckYear: null, truckVin: '', truckTag: '', twiccCardNumber: '', twiccExpiry: '',
      truckOwnerName: '', truckOwnerPhone: '', truckOwnerCompany: '',
      emergencyContact: '', emergencyPhone: '',
      hireDate: '', payRate: 0, payType: 'mile', driverType: 'company',
      teamDriverId: null, teamDriverName: ''
    });
    this.availableDivisions.set([]);
    this.availableDriverTerminals.set([]);
  }

  updateField(field: string, value: any): void {
    this.driverForm.update(f => ({ ...f, [field]: value }));
    if (field === 'fleetId') {
      this.driverForm.update(f => ({ ...f, divisionId: null, driverTerminalId: null }));
      this.loadDivisionsForFleet(value);
      this.availableDriverTerminals.set([]);
    }
    if (field === 'divisionId') {
      this.driverForm.update(f => ({ ...f, driverTerminalId: null }));
      this.loadTerminalsForDivision(value);
    }
    if (field === 'driverType' && value !== 'team') {
      this.driverForm.update(f => ({ ...f, teamDriverId: null, teamDriverName: '' }));
    }
  }

  getDriverNameById(id: number): string {
    const driver = this.drivers().find(d => d.id === id?.toString() || +d.id === id);
    return driver?.name || '';
  }

  loadDivisionsForFleet(fleetId: number | null): void {
    if (!fleetId) {
      this.availableDivisions.set([]);
      this.availableDriverTerminals.set([]);
      return;
    }
    this.api.getDivisions({ fleetId }).subscribe({
      next: (res: any) => this.availableDivisions.set(res?.data || []),
      error: () => this.availableDivisions.set([])
    });
  }

  loadTerminalsForDivision(divisionId: number | null): void {
    if (!divisionId) {
      this.availableDriverTerminals.set([]);
      return;
    }
    this.api.getDriverTerminals({ divisionId }).subscribe({
      next: (res: any) => this.availableDriverTerminals.set(res?.data || []),
      error: () => this.availableDriverTerminals.set([])
    });
  }

  saveDriver(): void {
    const form = this.driverForm();
    const missing: string[] = [];
    if (!form.name?.trim()) missing.push('Full Name');
    if (!form.phone?.trim()) missing.push('Phone');
    if (missing.length > 0) {
      this.toast.error(`Required: ${missing.join(', ')}`, 'Missing Fields');
      return;
    }

    this.saving.set(true);
    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      organizationId: form.organizationId || null,
      fleetId: form.fleetId || null,
      divisionId: form.divisionId || null,
      driverTerminalId: form.driverTerminalId || null,
      licenseNumber: form.licenseNumber,
      licenseState: form.licenseState,
      licenseExpiry: form.licenseExpiry || null,
      dateOfBirth: form.dateOfBirth || null,
      address: form.address,
      city: form.city,
      state: form.state,
      zipCode: form.zip,
      zip: form.zip,
      ssn: form.ssn || null,
      truckNumber: form.truckNumber || null,
      truckMake: form.truckMake || null,
      truckModel: form.truckModel || null,
      truckYear: form.truckYear || null,
      truckVin: form.truckVin || null,
      truckTag: form.truckTag || null,
      emergencyContactName: form.emergencyContact,
      emergencyContact: form.emergencyContact,
      emergencyContactPhone: form.emergencyPhone,
      emergencyPhone: form.emergencyPhone,
      hireDate: form.hireDate || null,
      payRate: form.payRate,
      payType: form.payType,
      driverType: form.driverType,
      status: 'active'
    };

    if (this.modalType() === 'edit' && this.editingId()) {
      this.api.updateDriver(this.editingId()!, payload).subscribe({
        next: () => {
          this.toast.success('Driver updated', 'Success');
          this.tracking.trackUpdate('Driver', this.editingId()!, payload.name);
          this.saving.set(false);
          this.closeModal();
          this.loadDrivers();
        },
        error: (err) => {
          this.toast.error(err?.error?.error || 'Failed to update driver', 'Error');
          this.saving.set(false);
        }
      });
    } else {
      this.api.createDriver(payload).subscribe({
        next: () => {
          this.toast.success('Driver created', 'Success');
          this.tracking.trackCreate('Driver', undefined, payload.name);
          this.saving.set(false);
          this.closeModal();
          this.loadDrivers();
        },
        error: (err) => {
          this.toast.error(err?.error?.error || 'Failed to create driver', 'Error');
          this.saving.set(false);
        }
      });
    }
  }

  async deactivateDriver(driver: DriverRow): Promise<void> {
    const ok = await this.confirmDialog.show({
      title: 'Deactivate Driver',
      message: `Deactivate ${driver.name}?`,
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (!ok) return;
    this.updateDriverStatus(driver, 'inactive', 'deactivated', 'Failed to deactivate driver');
  }

  async reactivateDriver(driver: DriverRow): Promise<void> {
    const ok = await this.confirmDialog.show({
      title: 'Reactivate Driver',
      message: `Reactivate ${driver.name}?`,
      confirmText: 'Reactivate',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    this.updateDriverStatus(driver, 'active', 'reactivated', 'Failed to reactivate driver');
  }

  async archiveDriver(driver: DriverRow): Promise<void> {
    const ok = await this.confirmDialog.show({
      title: 'Archive Driver',
      message: `Archive ${driver.name}?`,
      confirmText: 'Archive',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (!ok) return;
    this.updateDriverStatus(driver, 'archived', 'archived', 'Failed to archive driver');
  }

  async restoreArchivedDriver(driver: DriverRow): Promise<void> {
    const ok = await this.confirmDialog.show({
      title: 'Restore Driver',
      message: `Restore ${driver.name} to active?`,
      confirmText: 'Restore',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    this.updateDriverStatus(driver, 'active', 'restored', 'Failed to restore driver');
  }

  private updateDriverStatus(
    driver: DriverRow,
    targetStatus: 'active' | 'inactive' | 'archived',
    successVerb: string,
    fallbackError: string
  ): void {
    const targetIdRaw = String(driver.id ?? '').trim();
    if (!targetIdRaw) {
      this.toast.error(`Invalid driver id for ${driver.name}`, 'Error');
      return;
    }

    const previousRows = this.drivers();
    this.drivers.update(rows => rows.map((row) =>
      String(row.id ?? '').trim() === targetIdRaw
        ? { ...row, status: this.normalizeStatus(targetStatus) }
        : row
    ));
    this.toast.success(`${driver.name} ${successVerb}`, 'Success');

    this.api.updateDriver(driver.id, { status: targetStatus }).subscribe({
      next: () => {
        // Reconcile with server shortly after optimistic update.
        setTimeout(() => this.loadDrivers(), 1500);
      },
      error: (err: any) => {
        this.drivers.set(previousRows);
        this.toast.error(err?.error?.error || fallbackError, 'Error');
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'active': case 'available': return 'status-active';
      case 'dispatched': case 'en-route': case 'at-location': return 'status-dispatched';
      case 'off-duty': case 'inactive': case 'sleeper': return 'status-inactive';
      case 'vacation': return 'status-vacation';
      default: return '';
    }
  }

  isExpiringSoon(dateString: string): boolean {
    if (!dateString) return false;
    const expiry = new Date(dateString);
    const today = new Date();
    const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 90 && daysLeft > 0;
  }

  isExpired(dateString: string): boolean {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
  }

  private normalizeStatus(status: string): string {
    const normalized = String(status ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/_/g, '-');
    return normalized || 'active';
  }

  private isArchivedStatus(status: string): boolean {
    return this.normalizeStatus(status) === 'archived';
  }

  private isInactiveStatus(status: string): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'inactive' ||
      normalized === 'off-duty' ||
      normalized === 'terminated' ||
      normalized === 'deactivated' ||
      normalized === 'disabled';
  }

  private isActiveStatus(status: string): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'active' || normalized === 'available' || normalized === 'online';
  }

  private isDispatchedStatus(status: string): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'dispatched' || normalized === 'en-route' || normalized === 'at-location';
  }
}
