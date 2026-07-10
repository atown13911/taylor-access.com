import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventTrackingService } from '../../../core/services/event-tracking.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AdminService } from '../../../core/services/admin.service';
import { environment } from '../../../../environments/environment';

interface DriverRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseExpiry: string;
  truckNumber: string;
  status: string;
  fleetId: number | null;
  fleetName: string;
  hireDate: string;
  terminationDate: string;
  terminationNotes?: string;
  type: string;
  notes?: string;
  dispatchUserId?: number | null;
}

interface DispatchUserRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  title: string;
  status: string;
}

@Component({
  selector: 'app-driver-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-list.component.html',
  styleUrls: ['./driver-list.component.scss']
})
export class DriverListComponent implements OnInit {
  private http = inject(HttpClient);
  private api = inject(VanTacApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private tracking = inject(EventTrackingService);
  private confirmDialog = inject(ConfirmService);
  private adminService = inject(AdminService);
  private baseUrl = environment.apiUrl;
  readonly usPhonePattern = String.raw`\(\d{3}\) \d{3}-\d{4}`;

  isLoading = signal(false);
  syncingArchived = signal(false);
  loadingDispatchUsers = signal(false);
  drivers = signal<DriverRow[]>([]);
  searchQuery = signal('');
  fleetFilter = signal<'all' | 'unassigned' | string>('all');
  fleetName = signal<string>('');
  activeTab = signal<'active' | 'inactive' | 'archived'>('active');
  dispatchersView = signal(false);
  dispatchersDriverTab = signal<'otr' | 'drayage'>('otr');
  selectedDispatcherId = signal<number | null>(null);
  showAssignDriverModal = signal(false);
  assignDriverSaving = signal(false);
  assignDriverId = signal<string | null>(null);

  // Modal state
  showModal = signal(false);
  modalType = signal<'add' | 'edit'>('add');
  saving = signal(false);
  editingId = signal<string | null>(null);
  availableFleets = signal<any[]>([]);
  availableOrganizations = signal<any[]>([]);
  availableDispatchUsers = signal<DispatchUserRow[]>([]);
  private dispatchUsersLoaded = false;
  private originalDriverNotes = signal('');

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
    terminationDate: '',
    terminationNotes: '',
    payRate: 0,
    payType: 'mile' as 'mile' | 'hour' | 'percentage',
    driverType: 'company' as string,
    dispatchUserId: null as number | null,
    teamDriverId: null as number | null,
    teamDriverName: '' as string
  });

  fleetFilterOptions = computed<string[]>(() =>
    Array.from(new Set(
      this.drivers()
        .map((d) => String(d.fleetName || '').trim())
        .filter((name) => !!name && name !== '—')
    )).sort((a, b) => a.localeCompare(b))
  );

  tabbedDrivers = computed(() => {
    const tab = this.activeTab();
    const all = this.drivers();
    if (tab === 'archived') return all.filter(d => this.isArchivedStatus(d.status));
    if (tab === 'inactive') return all.filter(d => this.isInactiveStatus(d.status));
    return all.filter(d => !this.isArchivedStatus(d.status) && !this.isInactiveStatus(d.status));
  });

  filteredDrivers = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const fleet = this.fleetFilter();
    let pool = this.tabbedDrivers();

    if (fleet === 'unassigned') {
      pool = pool.filter((d) => String(d.fleetName || '').trim() === '—');
    } else if (fleet !== 'all') {
      pool = pool.filter((d) => String(d.fleetName || '').trim() === fleet);
    }

    if (!query) return pool;
    return pool.filter((d) =>
      d.name.toLowerCase().includes(query) ||
      d.phone.includes(query) ||
      d.email?.toLowerCase().includes(query) ||
      d.licenseNumber?.toLowerCase().includes(query)
    );
  });

  dispatcherRows = computed(() => {
    const rows = this.availableDispatchUsers();
    const activeLandmarkAssigned = this.activeLandmarkDispatchDrivers();
    return rows.map((u) => ({
      ...u,
      assignedDrivers: activeLandmarkAssigned.filter((d) => this.toNullableNumber(d.dispatchUserId) === u.id).length
    }));
  });

  dispatcherAssignedDrivers = computed(() => {
    return this.dispatchersDriverTab() === 'drayage'
      ? this.landmarkDrayageDrivers()
      : this.landmarkOtrDrivers();
  });

  landmarkOtrDrivers = computed(() =>
    this.drivers()
      .filter((d) => this.isLandmarkOtrFleet(d.fleetName))
      .filter((d) => this.isActiveStatus(d.status))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  landmarkDrayageDrivers = computed(() =>
    this.drivers()
      .filter((d) => this.isLandmarkDrayageFleet(d.fleetName))
      .filter((d) => this.isActiveStatus(d.status))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  activeLandmarkDispatchDrivers = computed(() => {
    const combined = [...this.landmarkOtrDrivers(), ...this.landmarkDrayageDrivers()];
    const byId = new Map<string, DriverRow>();
    for (const driver of combined) {
      byId.set(String(driver.id), driver);
    }
    return Array.from(byId.values());
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

  dispatcherStats = computed(() => {
    const dispatchers = this.dispatcherRows();
    const totalDispatchers = dispatchers.length;
    const dispatchersWithAssignedDrivers = dispatchers.filter((d) => d.assignedDrivers > 0).length;
    const eligibleLandmarkDrivers = this.activeLandmarkDispatchDrivers();
    const driversWithDispatcher = eligibleLandmarkDrivers.filter((d) => this.toNullableNumber(d.dispatchUserId) !== null).length;
    const unassignedDrivers = Math.max(eligibleLandmarkDrivers.length - driversWithDispatcher, 0);
    return {
      totalDispatchers,
      dispatchersWithAssignedDrivers,
      driversWithDispatcher,
      unassignedDrivers
    };
  });

  ngOnInit(): void {
    this.updateDispatchersViewFromRoute();
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateDispatchersViewFromRoute(event.urlAfterRedirects || event.url);
      }
    });
    this.loadDrivers();
    this.loadFleets();
    this.loadOrganizations();
    this.loadDispatchUsers();
  }

  pageTitle(): string {
    return this.dispatchersView() ? 'Dispatchers' : 'Drivers';
  }

  pageSubtitle(): string {
    if (this.dispatchersView()) {
      return 'Manage dispatcher users and assigned drivers';
    }
    if (this.fleetName()) {
      return `Drivers assigned to ${this.fleetName()}`;
    }
    return 'All drivers in your organization';
  }

  private asArray(input: any): any[] {
    if (Array.isArray(input)) return input;
    if (Array.isArray(input?.data)) return input.data;
    if (Array.isArray(input?.items)) return input.items;
    if (Array.isArray(input?.rows)) return input.rows;
    if (Array.isArray(input?.drivers)) return input.drivers;
    if (Array.isArray(input?.apps)) return input.apps;
    if (Array.isArray(input?.assignments)) return input.assignments;
    if (Array.isArray(input?.data?.items)) return input.data.items;
    if (Array.isArray(input?.data?.rows)) return input.data.rows;
    if (Array.isArray(input?.data?.drivers)) return input.data.drivers;
    if (Array.isArray(input?.data?.apps)) return input.data.apps;
    if (Array.isArray(input?.data?.assignments)) return input.data.assignments;
    return [];
  }

  private extractAppAssignments(input: any): any[] {
    const direct = this.asArray(input);
    if (direct.length) return direct;

    const discovered: any[] = [];
    const queue: any[] = [input];
    const visited = new Set<any>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object' || visited.has(current)) continue;
      visited.add(current);

      if (Array.isArray(current)) {
        for (const item of current) queue.push(item);
        continue;
      }

      for (const [key, value] of Object.entries(current)) {
        if (Array.isArray(value)) {
          const hasAssignmentLikeObjects = value.some((entry: any) =>
            entry && typeof entry === 'object' && (
              Object.prototype.hasOwnProperty.call(entry, 'appClientId') ||
              Object.prototype.hasOwnProperty.call(entry, 'clientId') ||
              Object.prototype.hasOwnProperty.call(entry, 'appName') ||
              Object.prototype.hasOwnProperty.call(entry, 'clientName') ||
              Object.prototype.hasOwnProperty.call(entry, 'role') ||
              Object.prototype.hasOwnProperty.call(entry, 'permissions') ||
              Object.prototype.hasOwnProperty.call(entry, 'scopes')
            )
          );

          if (hasAssignmentLikeObjects) {
            discovered.push(...value);
          } else {
            for (const item of value) queue.push(item);
          }
        } else if (value && typeof value === 'object') {
          queue.push(value);
        }

        if (key.toLowerCase().includes('assignment') || key.toLowerCase().includes('app')) {
          if (value && typeof value === 'object') queue.push(value);
        }
      }
    }

    return discovered;
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
      next: (res: any) => {
        this.availableFleets.set(this.asArray(res));
        this.reconcileDriverFleetNames();
      },
      error: () => this.availableFleets.set([])
    });
  }

  loadDrivers(options: { silent?: boolean } = {}): void {
    if (!options.silent) {
      this.isLoading.set(true);
    }

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
          truckNumber: d.truckNumber || '',
          status: this.normalizeStatus(d.status || 'active'),
          fleetId: this.toNullableNumber(
            d.fleetId
            ?? d.FleetId
            ?? d.fleet_id
            ?? d.fleet?.id
            ?? d.fleet?.Id
          ),
          fleetName: this.resolveFleetName(d),
          hireDate: d.hireDate || d.createdAt || '',
          terminationDate: d.terminationDate || '',
          terminationNotes: String(d.terminationNotes ?? '').trim(),
          type: this.normalizeDriverType(d.driverType),
          notes: String(d.notes ?? '').trim(),
          dispatchUserId: this.resolveDispatchUserId(d)
        }));
        this.drivers.set(mapped);

        // Derive fleet name from data if available
        const fleets = [...new Set(mapped.filter(d => d.fleetName !== '—').map(d => d.fleetName))];
        this.fleetName.set(fleets.length === 1 ? fleets[0] : '');

        if (!options.silent) {
          this.isLoading.set(false);
        }
      },
      error: () => {
        if (!options.silent) {
          this.toast.error('Failed to load drivers', 'Error');
          this.isLoading.set(false);
        }
      }
    });
  }

  private toNullableNumber(value: any): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private resolveFleetName(driverLike: any): string {
    const direct = String(
      driverLike?.fleet?.name
      ?? driverLike?.fleet?.Name
      ?? driverLike?.fleetName
      ?? driverLike?.FleetName
      ?? driverLike?.fleet_name
      ?? driverLike?.fleet?.fleetName
      ?? (typeof driverLike?.fleet === 'string' ? driverLike.fleet : '')
      ?? ''
    ).trim();
    if (direct) return direct;

    const fleetId = this.toNullableNumber(
      driverLike?.fleetId
      ?? driverLike?.FleetId
      ?? driverLike?.fleet_id
      ?? driverLike?.fleet?.id
      ?? driverLike?.fleet?.Id
    );
    if (fleetId) {
      const fleet = this.availableFleets().find((f: any) => this.toNullableNumber(f?.id) === fleetId);
      const fallback = String(fleet?.name ?? fleet?.fleetName ?? '').trim();
      if (fallback) return fallback;
    }

    // Some environments represent assignments via fleetDrivers join rows
    // without populating driver.fleetId. Resolve by membership as fallback.
    const driverId = this.toNullableNumber(driverLike?.id);
    if (driverId) {
      const byMembership = this.availableFleets().find((fleet: any) => {
        const rows = Array.isArray(fleet?.fleetDrivers) ? fleet.fleetDrivers : [];
        return rows.some((fd: any) => this.toNullableNumber(fd?.driverId ?? fd?.DriverId) === driverId);
      });
      const membershipName = String(byMembership?.name ?? byMembership?.fleetName ?? '').trim();
      if (membershipName) return membershipName;
    }

    return '—';
  }

  private isLandmarkOtrFleet(fleetName: string): boolean {
    const normalized = String(fleetName ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return normalized.includes('landmark otr');
  }

  private isLandmarkDrayageFleet(fleetName: string): boolean {
    const normalized = String(fleetName ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return normalized.includes('landmark drayage');
  }

  setDispatchersDriverTab(tab: 'otr' | 'drayage'): void {
    this.dispatchersDriverTab.set(tab);
  }

  private reconcileDriverFleetNames(): void {
    this.drivers.update((rows) =>
      rows.map((row) => {
        const nextName = this.resolveFleetName(row);
        if (nextName === row.fleetName) return row;
        return { ...row, fleetName: nextName };
      })
    );
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
  profileDocs = signal<any[]>([]);

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
    const docs = this.getComplianceDocsForDriver(driver);
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

    const doc = this.getComplianceDocByKey(key, docs);
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
          hireDate: d.hireDate || driver.hireDate || '',
          terminationDate: d.terminationDate || '',
          terminationNotes: String(d.terminationNotes ?? '').trim(),
          notes: String(d.notes ?? driver.notes ?? '').trim(),
          dispatchUserId: this.resolveDispatchUserId(d),
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

  private getComplianceDocByKey(key: string, docs: any[]): any {
    const sub = this.compSubMap[key];
    const cat = this.compCategoryMap[key];
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

  getPanelDoc(key: string): any {
    return this.getComplianceDocByKey(key, this.panelDocs());
  }

  private getComplianceDocsForDriver(driver: any): any[] {
    const driverId = String(driver?.id || '').trim();
    const profileId = String(this.profileDriver()?.id || '').trim();
    if (driverId && profileId && driverId === profileId) {
      return this.profileDocs();
    }
    return this.panelDocs();
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
    this.profileDocs.set([]);
    this._fetchTarget = 'modal';
    this.fetchFullDriver(driver);
    this.loadProfileDocs(driver);
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
    this.profileDocs.set([]);
  }

  private loadProfileDocs(driver: DriverRow | any): void {
    const aliasIds = this.resolveAliasDriverIds(driver);
    Promise.all(
      aliasIds.map((id: string) =>
        this.api.getDriverDocuments(id).toPromise().then((res: any) => res?.data || []).catch(() => [])
      )
    ).then((docLists: any[]) => {
      this.profileDocs.set(this.mergeDocuments(...docLists));
    }).catch(() => this.profileDocs.set([]));
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
    this.originalDriverNotes.set('');
    this.resetForm();
    this.loadDispatchUsers();
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
          phone: this.formatPhoneInput(d.phone || ''),
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
          truckOwnerPhone: this.formatPhoneInput(d.truckOwnerPhone || ''),
          truckOwnerCompany: d.truckOwnerCompany || '',
          emergencyContact: d.emergencyContactName || d.emergencyContact || '',
          emergencyPhone: this.formatPhoneInput(d.emergencyContactPhone || d.emergencyPhone || ''),
          hireDate: d.hireDate ? d.hireDate.split('T')[0] : '',
          terminationDate: d.terminationDate ? d.terminationDate.split('T')[0] : '',
          terminationNotes: String(d.terminationNotes ?? '').trim(),
          payRate: d.payRate || 0,
          payType: d.payType || 'mile',
          driverType: this.normalizeFormDriverType(d.driverType),
          dispatchUserId: this.resolveDispatchUserId(d),
          teamDriverId: d.teamDriverId || null,
          teamDriverName: d.teamDriverName || ''
        });
        this.originalDriverNotes.set(String(d.notes ?? '').trim());
        if (d.fleetId) this.loadDivisionsForFleet(d.fleetId);
        if (d.divisionId) this.loadTerminalsForDivision(d.divisionId);
        this.loadDispatchUsers();
        this.showModal.set(true);
      },
      error: () => {
        this.driverForm.set({
          name: driver.name, email: driver.email, phone: this.formatPhoneInput(driver.phone || ''),
          organizationId: null, fleetId: null, divisionId: null, driverTerminalId: null, licenseNumber: driver.licenseNumber, licenseState: '',
          licenseExpiry: driver.licenseExpiry ? driver.licenseExpiry.split('T')[0] : '',
          dateOfBirth: '', address: '', city: '', state: '', zip: '', ssn: '',
          truckNumber: '', truckMake: '', truckModel: '', truckYear: null, truckVin: '', truckTag: '', twiccCardNumber: '', twiccExpiry: '',
          truckOwnerName: '', truckOwnerPhone: '', truckOwnerCompany: '',
          emergencyContact: '', emergencyPhone: '',
          hireDate: driver.hireDate ? driver.hireDate.split('T')[0] : '',
          terminationDate: (driver as any).terminationDate ? String((driver as any).terminationDate).split('T')[0] : '',
          terminationNotes: String((driver as any).terminationNotes ?? '').trim(),
          payRate: 0, payType: 'mile', driverType: this.normalizeFormDriverType(driver.type),
          dispatchUserId: this.resolveDispatchUserId(driver),
          teamDriverId: null, teamDriverName: ''
        });
        this.originalDriverNotes.set(String((driver as any)?.notes ?? '').trim());
        this.loadDispatchUsers();
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
      hireDate: '', terminationDate: '', terminationNotes: '', payRate: 0, payType: 'mile', driverType: 'company', dispatchUserId: null,
      teamDriverId: null, teamDriverName: ''
    });
    this.availableDivisions.set([]);
    this.availableDriverTerminals.set([]);
  }

  updateField(field: string, value: any): void {
    if (this.isPhoneField(field)) {
      value = this.formatPhoneInput(String(value ?? ''));
    }
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
    if (!this.isValidUsPhone(form.phone)) {
      this.toast.error('Enter a valid 10-digit phone number', 'Invalid Phone');
      return;
    }
    if (form.emergencyPhone?.trim() && !this.isValidUsPhone(form.emergencyPhone)) {
      this.toast.error('Enter a valid emergency contact phone number', 'Invalid Phone');
      return;
    }
    if (form.truckOwnerPhone?.trim() && !this.isValidUsPhone(form.truckOwnerPhone)) {
      this.toast.error('Enter a valid truck owner phone number', 'Invalid Phone');
      return;
    }

    this.saving.set(true);
    const payload = {
      name: form.name,
      email: form.email,
      phone: this.normalizePhoneForSave(form.phone),
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
      emergencyContactPhone: form.emergencyPhone?.trim() ? this.normalizePhoneForSave(form.emergencyPhone) : null,
      emergencyPhone: form.emergencyPhone?.trim() ? this.normalizePhoneForSave(form.emergencyPhone) : null,
      hireDate: form.hireDate || null,
      terminationDate: form.terminationDate || null,
      terminationNotes: form.terminationNotes?.trim() || null,
      ...(this.modalType() === 'edit'
        ? {
            resetTerminationDate: !form.terminationDate,
            resetTerminationNotes: !form.terminationNotes?.trim()
          }
        : {}),
      payRate: form.payRate,
      payType: form.payType,
      driverType: this.normalizeFormDriverType(form.driverType),
      notes: this.composeDriverNotesWithDispatch(
        this.originalDriverNotes(),
        form.dispatchUserId
      ),
      dispatchUserId: form.dispatchUserId || null
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
      this.api.createDriver({ ...payload, status: 'active' }).subscribe({
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
      this.sameDriverId(row.id, targetIdRaw)
        ? { ...row, status: this.normalizeStatus(targetStatus) }
        : row
    ));

    if (targetStatus === 'archived' && this.sameDriverId(this.selectedDriver()?.id, targetIdRaw)) {
      this.selectedDriver.set(null);
    }

    this.toast.success(`${driver.name} ${successVerb}`, 'Success');

    this.api.updateDriver(driver.id, { status: targetStatus }).subscribe({
      next: () => {
        // Reconcile with server shortly after optimistic update without remounting the table.
        setTimeout(() => this.loadDrivers({ silent: true }), 1500);
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

  showTerminationDateColumn(): boolean {
    return this.activeTab() !== 'active';
  }

  getEmploymentDateColumnLabel(): string {
    return this.showTerminationDateColumn() ? 'Termination Date' : 'Hire Date';
  }

  getDriverEmploymentDate(driver: DriverRow): string {
    return this.showTerminationDateColumn() ? driver.terminationDate : driver.hireDate;
  }

  formatTruckNumber(truckNumber: string): string {
    const value = String(truckNumber ?? '').trim();
    return value || '—';
  }

  formatPhoneDisplay(value: string): string {
    const formatted = this.formatPhoneInput(value);
    return this.isValidUsPhone(formatted) ? formatted : (String(value ?? '').trim() || '—');
  }

  formatPhoneInput(value: string): string {
    const digits = String(value ?? '').replace(/\D/g, '');
    const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    const local = normalized.slice(0, 10);
    if (!local) return '';
    if (local.length <= 3) return `(${local}`;
    if (local.length <= 6) return `(${local.slice(0, 3)}) ${local.slice(3)}`;
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }

  isValidUsPhone(value: string): boolean {
    return /^\d{10}$/.test(String(value ?? '').replace(/\D/g, ''));
  }

  normalizePhoneForSave(value: string): string {
    return this.formatPhoneInput(value);
  }

  private isPhoneField(field: string): boolean {
    return field === 'phone' || field === 'emergencyPhone' || field === 'truckOwnerPhone';
  }

  formatDriverType(type: string): string {
    switch (this.normalizeDriverType(type)) {
      case 'owner_operator': return 'Owner Operator';
      case 'company': return 'Company';
      case 'lease': return 'Lease';
      case 'team': return 'Team';
      case 'driver': return 'Driver';
      default: return type?.trim() ? type.replace(/_/g, ' ') : '—';
    }
  }

  private normalizeDriverType(type: string | null | undefined): string {
    const normalized = String(type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!normalized) return 'company';
    return normalized;
  }

  private normalizeFormDriverType(type: string | null | undefined): string {
    const normalized = this.normalizeDriverType(type);
    const allowed = new Set(['company', 'owner_operator', 'lease', 'team', 'driver']);
    return allowed.has(normalized) ? normalized : 'company';
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

  isArchivedStatus(status: string): boolean {
    return this.normalizeStatus(status) === 'archived';
  }

  isInactiveStatus(status: string): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'inactive' ||
      normalized === 'off-duty' ||
      normalized === 'terminated' ||
      normalized === 'deactivated' ||
      normalized === 'disabled' ||
      normalized === 'suspended';
  }

  showRestoreDriverAction(driver: DriverRow): boolean {
    return this.isArchivedStatus(driver.status);
  }

  showArchiveDriverAction(driver: DriverRow): boolean {
    return this.isInactiveStatus(driver.status);
  }

  showDeactivateDriverAction(driver: DriverRow): boolean {
    return !this.showRestoreDriverAction(driver) && !this.showArchiveDriverAction(driver);
  }

  private sameDriverId(left: unknown, right: unknown): boolean {
    const leftId = String(left ?? '').trim();
    const rightId = String(right ?? '').trim();
    return !!leftId && !!rightId && leftId === rightId;
  }

  private isActiveStatus(status: string): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'active' || normalized === 'available' || normalized === 'online';
  }

  private isDispatchedStatus(status: string): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'dispatched' || normalized === 'en-route' || normalized === 'at-location';
  }

  private containsDispatchSignal(value: any): boolean {
    const text = String(
      typeof value === 'string'
        ? value
        : Array.isArray(value)
          ? value.join(' ')
          : JSON.stringify(value ?? '')
    ).toLowerCase();
    return text.includes('dispatch');
  }

  private isUserRecordEligibleForDispatch(user: any): boolean {
    const normalized = String(user?.status ?? '')
      .trim()
      .toLowerCase();
    if (!normalized) return true;
    return !['inactive', 'archived', 'deleted', 'disabled', 'suspended', 'terminated'].includes(normalized);
  }

  private assignmentHasDispatchRights(assignment: any): boolean {
    const rawStatus = String(assignment?.status ?? '').trim().toLowerCase();
    if (rawStatus && rawStatus !== 'active') return false;

    const appRole = String(
      assignment?.role?.name ??
      assignment?.role?.displayName ??
      assignment?.role?.key ??
      assignment?.role?.slug ??
      assignment?.role ??
      assignment?.appRole ??
      assignment?.appRoleName ??
      assignment?.roleLabel ??
      assignment?.role_title ??
      assignment?.roleName ??
      assignment?.roleId ??
      ''
    ).trim().toLowerCase();
    const normalizedRole = appRole.replace(/[^a-z0-9]/g, '');

    const explicitDispatchFlag =
      assignment?.canDispatch === true ||
      assignment?.isDispatcher === true ||
      assignment?.dispatchAccess === true;

    return explicitDispatchFlag ||
      normalizedRole.includes('dispatcher');
  }

  private assignmentMatchesDispatchApp(assignment: any): boolean {
    const identity = String(
      assignment?.appName ??
      assignment?.clientName ??
      assignment?.applicationName ??
      ''
    ).trim().toLowerCase();

    const normalized = identity.replace(/[\s_-]+/g, '');
    return normalized.includes('vantactms');
  }

  private assignmentBelongsToClientIds(assignment: any, clientIds: Set<string>): boolean {
    if (!clientIds.size) return true;
    const assignmentClientId = String(
      assignment?.appClientId ??
      assignment?.clientId ??
      ''
    ).trim();
    return !!assignmentClientId && clientIds.has(assignmentClientId);
  }

  private resolveVanTacTmsClientIds(clients: any[]): Set<string> {
    const ids = new Set<string>();
    for (const client of clients) {
      const name = String(client?.name ?? client?.displayName ?? '').trim().toLowerCase();
      const normalized = name.replace(/[\s_-]+/g, '');
      if (!normalized.includes('vantactms')) continue;

      const clientId = String(client?.clientId ?? client?.id ?? '').trim();
      if (clientId) ids.add(clientId);
    }
    return ids;
  }

  private async loadDispatchUsers(): Promise<void> {
    if (this.dispatchUsersLoaded || this.loadingDispatchUsers()) return;
    this.loadingDispatchUsers.set(true);
    try {
      const dispatcherRoleId = '4';
      const roleUsersRes: any = await this.adminService.getUsersByRoleId(dispatcherRoleId).toPromise();
      const users = this.asArray(roleUsersRes);

      const candidates: DispatchUserRow[] = users
        .map((user: any) => {
          const userId = Number(user?.id);
          if (!Number.isFinite(userId) || userId <= 0) return null;

          const firstName = String(user?.firstName ?? user?.first_name ?? '').trim();
          const lastName = String(user?.lastName ?? user?.last_name ?? '').trim();
          const combinedName = `${firstName} ${lastName}`.trim();

          return {
            id: userId,
            name: String(user?.name ?? user?.fullName ?? user?.displayName ?? '').trim() || combinedName || `User ${userId}`,
            email: String(user?.email ?? user?.workEmail ?? '').trim(),
            phone: String(user?.phone ?? user?.mobilePhone ?? user?.phoneNumber ?? user?.workPhone ?? '').trim(),
            title: String(
              user?.position ??
              user?.jobPosition ??
              user?.jobTitle ??
              user?.title ??
              user?.department ??
              ''
            ).trim() || 'Dispatcher',
            status: String(user?.status ?? 'active').trim().toLowerCase() || 'active'
          } as DispatchUserRow;
        })
        .filter((row): row is DispatchUserRow => !!row);

      this.availableDispatchUsers.set(
        candidates.sort((a, b) => a.name.localeCompare(b.name))
      );
      if (this.dispatchersView() && !this.selectedDispatcherId() && candidates.length > 0) {
        this.selectedDispatcherId.set(candidates[0].id);
      }
      this.dispatchUsersLoaded = true;
    } catch {
      this.availableDispatchUsers.set([]);
    } finally {
      this.loadingDispatchUsers.set(false);
    }
  }

  private updateDispatchersViewFromRoute(routeUrl?: string): void {
    const rawPath = String(routeUrl ?? this.router.url ?? '').split('?')[0];
    const normalizedPath = rawPath.replace(/\/+$/, '') || '/';
    const isDispatchersRoute = normalizedPath === '/dispatchers';
    const wasDispatchersRoute = this.dispatchersView();

    this.dispatchersView.set(isDispatchersRoute);

    if (isDispatchersRoute && (!wasDispatchersRoute || !this.dispatchUsersLoaded)) {
      this.loadDispatchUsers();
    }

    if (!isDispatchersRoute && wasDispatchersRoute) {
      this.selectedDispatcherId.set(null);
    }
  }

  selectDispatcherForView(dispatcherId: number): void {
    this.selectedDispatcherId.set(dispatcherId);
  }

  selectedDispatcherName(): string {
    const id = this.selectedDispatcherId();
    if (!id) return 'No dispatcher selected';
    const match = this.availableDispatchUsers().find((u) => u.id === id);
    return match?.name || `Dispatcher ${id}`;
  }

  hasDispatcherAssignment(driver: DriverRow): boolean {
    return this.toNullableNumber(driver.dispatchUserId) !== null;
  }

  resolveDispatcherName(driver: DriverRow): string {
    const dispatcherId = this.toNullableNumber(driver.dispatchUserId);
    if (!dispatcherId) return '—';
    const match = this.availableDispatchUsers().find((u) => u.id === dispatcherId);
    return match?.name || `Dispatcher ${dispatcherId}`;
  }

  assignableDriversForSelectedDispatcher(): DriverRow[] {
    const selectedId = this.selectedDispatcherId();
    if (!selectedId) return [];
    return this.dispatcherAssignedDrivers();
  }

  openAssignDriverModal(): void {
    if (!this.selectedDispatcherId()) {
      this.toast.info('Select a dispatcher first', 'Dispatcher Required');
      return;
    }
    this.assignDriverId.set(null);
    this.showAssignDriverModal.set(true);
  }

  openAssignDispatcherForDriver(driver: DriverRow): void {
    if (!this.selectedDispatcherId()) {
      this.toast.info('Select a dispatcher first', 'Dispatcher Required');
      return;
    }
    this.assignDriverToSelectedDispatcher(driver);
  }

  unassignDispatcherForDriver(driver: DriverRow): void {
    const dispatcherId = this.toNullableNumber(driver.dispatchUserId);
    if (!dispatcherId) return;

    this.assignDriverSaving.set(true);
    const payload = {
      dispatchUserId: null,
      notes: this.composeDriverNotesWithDispatch(String(driver.notes ?? ''), null)
    };

    this.api.updateDriver(driver.id, payload).subscribe({
      next: () => {
        this.toast.success(`${driver.name} unassigned from dispatcher`, 'Dispatcher Unassigned');
        this.assignDriverSaving.set(false);
        this.loadDrivers();
      },
      error: (err: any) => {
        this.toast.error(err?.error?.error || 'Failed to unassign dispatcher', 'Unassign Failed');
        this.assignDriverSaving.set(false);
      }
    });
  }

  closeAssignDriverModal(): void {
    this.showAssignDriverModal.set(false);
    this.assignDriverId.set(null);
    this.assignDriverSaving.set(false);
  }

  saveAssignedDriver(): void {
    const driverId = this.assignDriverId();
    if (!driverId) {
      this.toast.error('Select a driver to assign', 'Missing Driver');
      return;
    }

    const selectedDriver = this.drivers().find((d) => String(d.id) === String(driverId));
    if (!selectedDriver) {
      this.toast.error('Selected driver was not found', 'Assign Failed');
      return;
    }

    this.assignDriverToSelectedDispatcher(selectedDriver);
  }

  private assignDriverToSelectedDispatcher(selectedDriver: DriverRow): void {
    const dispatcherId = this.selectedDispatcherId();
    if (!dispatcherId) {
      this.toast.info('Select a dispatcher first', 'Dispatcher Required');
      return;
    }

    this.assignDriverSaving.set(true);
    const payload = {
      dispatchUserId: dispatcherId,
      notes: this.composeDriverNotesWithDispatch(String(selectedDriver.notes ?? ''), dispatcherId)
    };

    this.api.updateDriver(selectedDriver.id, payload).subscribe({
      next: () => {
        this.toast.success(`${selectedDriver.name} assigned to ${this.selectedDispatcherName()}`, 'Driver Assigned');
        if (this.showAssignDriverModal()) {
          this.closeAssignDriverModal();
        } else {
          this.assignDriverSaving.set(false);
        }
        this.loadDrivers();
      },
      error: (err: any) => {
        this.toast.error(err?.error?.error || 'Failed to assign driver', 'Assign Failed');
        this.assignDriverSaving.set(false);
      }
    });
  }

  private extractDispatchTag(notes: string): { id: number | null; label: string | null } {
    const raw = String(notes ?? '');
    const match = raw.match(/\[dispatch-assignee-id:(\d+)(?:\|name:([^\]]+))?\]/i);
    if (!match) return { id: null, label: null };
    const id = Number(match[1]);
    return {
      id: Number.isFinite(id) && id > 0 ? id : null,
      label: String(match[2] ?? '').trim() || null
    };
  }

  private stripDispatchTag(notes: string): string {
    return String(notes ?? '')
      .replace(/\s*\[dispatch-assignee-id:\d+(?:\|name:[^\]]+)?\]\s*/gi, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  private resolveDispatchUserId(driverLike: any): number | null {
    const direct = Number(
      driverLike?.dispatchUserId ??
      driverLike?.dispatcherUserId ??
      driverLike?.dispatchAssignedUserId ??
      0
    );
    if (Number.isFinite(direct) && direct > 0) return direct;
    const parsed = this.extractDispatchTag(String(driverLike?.notes ?? '')).id;
    return parsed && parsed > 0 ? parsed : null;
  }

  private composeDriverNotesWithDispatch(existingNotes: string, dispatchUserId: number | null): string | null {
    const clean = this.stripDispatchTag(existingNotes);
    if (!dispatchUserId) return clean || null;

    const selected = this.availableDispatchUsers().find((u) => u.id === dispatchUserId);
    const dispatchLabel = String(selected?.name ?? '').trim();
    const tag = `[dispatch-assignee-id:${dispatchUserId}${dispatchLabel ? `|name:${dispatchLabel}` : ''}]`;
    return clean ? `${clean}\n${tag}` : tag;
  }

}
