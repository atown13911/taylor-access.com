import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventTrackingService } from '../../../core/services/event-tracking.service';

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

  isLoading = signal(false);
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
    if (tab === 'archived') return all.filter(d => d.status === 'archived');
    if (tab === 'inactive') return all.filter(d => d.status === 'inactive' || d.status === 'off-duty' || d.status === 'terminated');
    return all.filter(d => d.status !== 'archived' && d.status !== 'inactive' && d.status !== 'terminated');
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
      active: all.filter(d => d.status !== 'archived' && d.status !== 'inactive' && d.status !== 'terminated').length,
      inactive: all.filter(d => d.status === 'inactive' || d.status === 'off-duty' || d.status === 'terminated').length,
      archived: all.filter(d => d.status === 'archived').length
    };
  });

  stats = computed(() => {
    const all = this.drivers();
    return {
      total: all.length,
      active: all.filter(d => d.status === 'active' || d.status === 'available').length,
      dispatched: all.filter(d => d.status === 'dispatched' || d.status === 'en-route').length,
      offDuty: all.filter(d => d.status === 'off-duty' || d.status === 'inactive').length
    };
  });

  ngOnInit(): void {
    this.loadDrivers();
    this.loadFleets();
    this.loadOrganizations();
  }

  loadOrganizations(): void {
    this.api.getOrganizations().subscribe({
      next: (res: any) => this.availableOrganizations.set(res?.data || res || []),
      error: () => this.availableOrganizations.set([])
    });
  }

  loadFleets(): void {
    this.api.getFleets().subscribe({
      next: (res: any) => this.availableFleets.set(res?.data || res || []),
      error: () => this.availableFleets.set([])
    });
  }

  loadDrivers(): void {
    this.isLoading.set(true);

    // Load drivers -- the backend already filters by the user's org/entity access
    this.api.getDrivers({ limit: 200 }).subscribe({
      next: (res) => {
        const data = res?.data || res || [];
        const mapped: DriverRow[] = data.map((d: any) => ({
          id: d.id,
          name: d.name || '',
          phone: d.phone || '',
          email: d.email || '',
          licenseNumber: d.licenseNumber || '',
          licenseExpiry: d.licenseExpiry || '',
          status: d.status || 'active',
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

  // Slide-out panel (row click)
  selectedDriver = signal<any>(null);
  detailTab = signal<'overview' | 'pm'>('overview');
  driverPmDocs = signal<any[]>([]);
  pmManageMode = signal(false);
  pmSelectedIds = signal<string[]>([]);
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
    insurance: 'insurance', vehicleDocs: 'vehicle', permits: 'permits'
  };

  private readonly compSubMap: Record<string, string> = {
    cdl: 'cdl_license', medical: 'medical_card', mvr: 'annual_mvr', drugTest: 'pre_employment',
    dqf: 'application', employment: 'offer_letter', training: 'entry_level_driver',
    insurance: 'certificate_of_insurance', vehicleDocs: 'registration', permits: 'oversize'
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
          truckNumber: '', truckMake: '', truckModel: '', truckYear: null, truckVin: '', truckTag: '',
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
      truckNumber: '', truckMake: '', truckModel: '', truckYear: null, truckVin: '', truckTag: '',
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

  deactivateDriver(driver: DriverRow): void {
    if (!confirm(`Deactivate ${driver.name}?`)) return;
    this.api.updateDriver(driver.id, { status: 'inactive' }).subscribe({
      next: () => {
        this.toast.success(`${driver.name} deactivated`, 'Success');
        this.loadDrivers();
      },
      error: () => this.toast.error('Failed to deactivate driver', 'Error')
    });
  }

  reactivateDriver(driver: DriverRow): void {
    if (!confirm(`Reactivate ${driver.name}?`)) return;
    this.api.updateDriver(driver.id, { status: 'active' }).subscribe({
      next: () => {
        this.toast.success(`${driver.name} reactivated`, 'Success');
        this.loadDrivers();
      },
      error: () => this.toast.error('Failed to reactivate driver', 'Error')
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
}
