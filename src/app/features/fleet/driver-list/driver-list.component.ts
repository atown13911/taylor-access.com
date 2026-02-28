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

  // Profile view
  selectedDriver = signal<any>(null);
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

  viewDriver(driver: DriverRow): void {
    this.profileTab.set('profile');
    this.driverDocuments.set([]);
    this.api.getDriver(driver.id).subscribe({
      next: (res: any) => {
        const d = res?.data || res;
        this.selectedDriver.set({
          ...driver,
          licenseState: d.licenseState || '',
          licenseClass: d.licenseClass || '',
          address: d.addressRef?.street1 || d.address || d.fullAddress || '',
          city: d.addressRef?.city || d.city || '',
          state: d.addressRef?.state || d.state || '',
          zip: d.addressRef?.zipCode || d.zipCode || d.zip || '',
          emergencyContact: d.emergencyContactName || d.emergencyContact || '',
          emergencyPhone: d.emergencyContactPhone || d.emergencyPhone || '',
          dateOfBirth: d.dateOfBirth || '',
          medicalCardExpiry: d.medicalCardExpiry || '',
          payRate: d.payRate || 0,
          payType: d.payType || '',
        });
      },
      error: () => this.selectedDriver.set(driver as any)
    });
  }

  closeProfile(): void {
    this.selectedDriver.set(null);
    this.profileTab.set('profile');
    this.driverDocuments.set([]);
  }

  switchProfileTab(tab: 'profile' | 'documents'): void {
    this.profileTab.set(tab);
    if (tab === 'documents' && this.selectedDriver()) {
      this.loadDriverDocuments(this.selectedDriver()!.id);
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
          fleetId: null, divisionId: null, driverTerminalId: null, licenseNumber: driver.licenseNumber, licenseState: '',
          licenseExpiry: driver.licenseExpiry ? driver.licenseExpiry.split('T')[0] : '',
          dateOfBirth: '', address: '', city: '', state: '', zip: '', ssn: '',
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
      name: '', email: '', phone: '', fleetId: null, divisionId: null, driverTerminalId: null,
      licenseNumber: '', licenseState: '', licenseExpiry: '', dateOfBirth: '',
      address: '', city: '', state: '', zip: '', ssn: '', emergencyContact: '', emergencyPhone: '',
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
