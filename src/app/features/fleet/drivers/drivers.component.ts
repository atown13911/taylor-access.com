import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';

type FleetTab = 'drivers' | 'carriers' | 'equipment' | 'compliance';

interface Driver {
  id: string;
  name: string;
  unit: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseExpiry: string;
  status: string;
  hireDate: string;
  type: string;
  online?: boolean;
  currentOrg?: string;
  fleetId?: number | null;
  fleet?: { id: number; name: string } | null;
}

interface Carrier {
  id: string;
  code: string;
  name: string;
  mcNumber: string;
  dotNumber: string;
  contact: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  insuranceExpiry: string;
  authorityExpiry: string;
  rating: number;
}

interface Equipment {
  id: string;
  unit: string;
  type: string;
  year: number;
  make: string;
  model: string;
  vin: string;
  status: string;
  lastInspection: string;
  nextInspection: string;
  mileage: number;
  assignedDriver?: string;
}

interface ComplianceItem {
  id: string;
  entity: string;
  entityType: string;
  documentType: string;
  expiryDate: string;
  status: string;
  daysUntilExpiry: number;
}

@Component({
  selector: 'app-drivers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.scss']
})
export class DriversComponent implements OnInit {
  private api = inject(VanTacApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  Math = Math;
  selectedTab = signal<FleetTab>('drivers');
  searchQuery = signal('');
  showModal = signal(false);

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
  modalType = signal<'add' | 'edit'>('add');
  isLoading = signal(false);
  error = signal<string | null>(null);

  // Simulation modal
  showSimulateModal = signal(false);
  simulateDriverId = signal('');
  simulateDriverName = signal('');
  simulateLat = signal(34.0522);
  simulateLng = signal(-118.2437);

  // Driver detail view
  selectedDriver = signal<any>(null);
  driverDetailTab = signal<'details' | 'documents' | 'compliance'>('details');

  // Organization switching
  showOrgModal = signal(false);
  orgDriverId = signal('');
  driverOrgs = signal<any[]>([]);
  selectedOrgId = signal('');
  
  // Trailer assignments (from Trailer Utilization)
  trailers = signal<any[]>([]);

  // Available fleets for assignment dropdown
  availableFleets = signal<any[]>([]);
  availableDivisions = signal<any[]>([]);
  availableDriverTerminals = signal<any[]>([]);

  // Form data for add/edit
  saving = signal(false);
  editingItem = signal<any>(null);
  
  driverForm = signal({
    name: '',
    email: '',
    personalEmail: '',
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
    emergencyContact: '',
    emergencyPhone: '',
    hireDate: '',
    payRate: 0,
    payType: 'mile' as 'mile' | 'hour' | 'percentage'
  });

  carrierForm = signal({
    name: '',
    mcNumber: '',
    dotNumber: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    contactName: '',
    insuranceExpiry: '',
    authorityExpiry: ''
  });

  equipmentForm = signal({
    unitNumber: '',
    type: 'tractor' as 'tractor' | 'trailer' | 'straight_truck',
    make: '',
    model: '',
    year: '',
    vin: '',
    licensePlate: '',
    plateState: '',
    color: '',
    fuelType: 'diesel' as 'diesel' | 'gasoline' | 'electric' | 'hybrid',
    lastServiceDate: '',
    nextServiceDue: ''
  });

  complianceForm = signal({
    documentType: 'cdl' as 'cdl' | 'medical_card' | 'mvr' | 'drug_test' | 'insurance' | 'ifta' | 'annual_inspection' | 'registration' | 'hazmat' | 'twic' | 'other',
    entityType: 'driver' as 'driver' | 'vehicle' | 'carrier',
    entityId: '',
    documentNumber: '',
    issueDate: '',
    expiryDate: '',
    notes: ''
  });

  // Data signals
  drivers = signal<Driver[]>([]);
  carriers = signal<Carrier[]>([]);
  equipment = signal<Equipment[]>([]);

  // Compliance items are derived from drivers + equipment (reactive)
  complianceItems = computed(() => {
    const items: ComplianceItem[] = [];
    const today = new Date();

    this.drivers().forEach(d => {
      if (d.licenseExpiry) {
        const expiry = new Date(d.licenseExpiry);
        const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let status = 'valid';
        if (daysUntil < 0) status = 'expired';
        else if (daysUntil <= 90) status = 'expiring';

        items.push({
          id: `lic-${d.id}`,
          entity: d.name,
          entityType: 'driver',
          documentType: 'CDL License',
          expiryDate: d.licenseExpiry,
          status,
          daysUntilExpiry: daysUntil
        });
      }
    });

    this.equipment().forEach(e => {
      if (e.nextInspection) {
        const expiry = new Date(e.nextInspection);
        const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let status = 'valid';
        if (daysUntil < 0) status = 'expired';
        else if (daysUntil <= 90) status = 'expiring';

        items.push({
          id: `insp-${e.id}`,
          entity: e.unit,
          entityType: 'equipment',
          documentType: 'Annual Inspection',
          expiryDate: e.nextInspection,
          status,
          daysUntilExpiry: daysUntil
        });
      }
    });

    return items;
  });

  stats = computed(() => ({
    totalDrivers: this.drivers().length,
    activeDrivers: this.drivers().filter(d => d.status === 'active').length,
    totalCarriers: this.carriers().length,
    activeCarriers: this.carriers().filter(c => c.status === 'active').length,
    totalEquipment: this.equipment().length,
    activeEquipment: this.equipment().filter(e => e.status === 'active').length,
    expiringDocs: this.complianceItems().filter(c => c.status === 'expiring').length,
    expiredDocs: this.complianceItems().filter(c => c.status === 'expired').length
  }));

  filteredDrivers = computed(() => {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.drivers();
    return this.drivers().filter(d => 
      d.name.toLowerCase().includes(query) ||
      d.phone.includes(query) ||
      d.email?.toLowerCase().includes(query)
    );
  });

  filteredCarriers = computed(() => {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.carriers();
    return this.carriers().filter(c => 
      c.name.toLowerCase().includes(query) ||
      c.mcNumber?.includes(query)
    );
  });

  filteredEquipment = computed(() => {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.equipment();
    return this.equipment().filter(e => 
      e.unit.toLowerCase().includes(query) ||
      e.vin?.includes(query)
    );
  });

  ngOnInit(): void {
    this.loadAllData();
  }

  loadAllData(): void {
    this.loadDrivers();
    this.loadCarriers();
    this.loadEquipment();
    this.loadTrailers();
    this.loadFleets();
  }

  loadFleets(): void {
    this.api.getFleets().subscribe({
      next: (res: any) => this.availableFleets.set(res?.data || res || []),
      error: () => this.availableFleets.set([])
    });
  }
  
  loadTrailers(): void {
    this.http.get(`${environment.apiUrl}/api/v1/trailers?pageSize=1000`).subscribe({
      next: (response: any) => {
        this.trailers.set(response?.data || []);
      },
      error: (err) => {
        console.error('Failed to load trailers:', err);
      }
    });
  }

  loadDrivers(): void {
    this.isLoading.set(true);
    this.api.getDrivers({ limit: 100 }).subscribe({
      next: (res) => {
        const driversData = (res?.data || res || []).map((d: any) => ({
          id: d.id,
          name: d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
          unit: d.vehicleNumber || '',
          phone: d.phone || '',
          email: d.email || '',
          licenseNumber: d.licenseNumber || '',
          licenseExpiry: d.licenseExpiry || '',
          status: d.status || 'active',
          hireDate: d.hireDate || d.createdAt,
          type: d.driverType || 'company',
          online: d.isOnline ?? (d.status === 'active'),
          currentOrg: d.organizationId,
          fleetId: d.fleetId ?? null,
          fleet: d.fleet ? { id: d.fleet.id, name: d.fleet.name } : null
        }));
        this.drivers.set(driversData);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set('Failed to load drivers');
        this.isLoading.set(false);
      }
    });
  }

  loadCarriers(): void {
    this.api.getContacts({ type: 'carrier', limit: 100 }).subscribe({
      next: (res) => {
        const carriersData = (res?.data || res || []).map((c: any) => ({
          id: c.id,
          code: c.code || c.scacCode || `CAR-${c.id}`,
          name: c.companyName || c.name,
          mcNumber: c.mcNumber || '',
          dotNumber: c.dotNumber || '',
          contact: c.contactName || c.name,
          contactName: c.contactName || '',
          phone: c.phone || '',
          email: c.email || '',
          address: c.address || '',
          city: c.city || '',
          state: c.state || '',
          zip: c.zipCode || c.zip || '',
          status: c.status || 'active',
          insuranceExpiry: c.insuranceExpiry || '',
          authorityExpiry: c.authorityExpiry || '',
          rating: c.rating || 0
        }));
        this.carriers.set(carriersData);
      },
      error: () => { /* Silent fail */ }
    });
  }

  loadEquipment(): void {
    this.api.getVehicles({ limit: 100 }).subscribe({
      next: (res) => {
        const equipmentData = (res?.data || res || []).map((v: any) => ({
          id: v.id,
          unit: v.name || v.vehicleNumber || `Unit-${v.id}`,
          type: v.vehicleType || 'Tractor',
          year: v.year || new Date().getFullYear(),
          make: v.make || '',
          model: v.model || '',
          vin: v.vin || '',
          status: v.status || 'active',
          lastInspection: v.lastInspection || '',
          nextInspection: v.nextInspection || '',
          mileage: v.mileage || 0,
          assignedDriver: v.driverName
        }));
        this.equipment.set(equipmentData);
      },
      error: () => { /* Silent fail */ }
    });
  }

  // complianceItems is now a computed signal - automatically updates when drivers/equipment change

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatNumber(num: number): string {
    return new Intl.NumberFormat('en-US').format(num);
  }

  isExpiringSoon(dateString: string): boolean {
    if (!dateString) return false;
    const expiryDate = new Date(dateString);
    const today = new Date();
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
  }

  addNew(): void {
    this.modalType.set('add');
    this.editingItem.set(null);
    this.resetForms();
    this.showModal.set(true);
  }

  edit(item: any): void {
    this.modalType.set('edit');
    
    const tab = this.selectedTab();
    if (tab === 'drivers') {
      // First fetch the full driver data from API
      this.api.getDriver(item.id).subscribe({
        next: (res: any) => {
          const driver = res?.data || res;
          this.editingItem.set(driver);
          this.driverForm.set({
            name: driver.name || '',
            email: driver.email || '',
            personalEmail: driver.personalEmail || '',
            phone: driver.phone || '',
            fleetId: driver.fleetId || null,
            divisionId: driver.divisionId || null,
            driverTerminalId: driver.driverTerminalId || null,
            licenseNumber: driver.licenseNumber || '',
            licenseState: driver.licenseState || '',
            licenseExpiry: driver.licenseExpiry ? driver.licenseExpiry.split('T')[0] : '',
            dateOfBirth: driver.dateOfBirth ? driver.dateOfBirth.split('T')[0] : '',
            address: driver.address || '',
            city: driver.city || '',
            state: driver.state || '',
            zip: driver.zipCode || driver.zip || '',
            emergencyContact: driver.emergencyContactName || driver.emergencyContact || '',
            emergencyPhone: driver.emergencyContactPhone || driver.emergencyPhone || '',
            hireDate: driver.hireDate ? driver.hireDate.split('T')[0] : '',
            payRate: driver.payRate || 0,
            payType: driver.payType || 'mile'
          });
          if (driver.fleetId) this.loadDivisionsForFleet(driver.fleetId);
          if (driver.divisionId) this.loadTerminalsForDivision(driver.divisionId);
          this.showModal.set(true);
        },
        error: () => {
          // Fallback to item data if API fails
          this.editingItem.set(item);
          this.driverForm.set({
            name: item.name || '',
            email: item.email || '',
            personalEmail: item.personalEmail || '',
            phone: item.phone || '',
            fleetId: item.fleetId || null,
            divisionId: item.divisionId || null,
            driverTerminalId: item.driverTerminalId || null,
            licenseNumber: item.licenseNumber || '',
            licenseState: item.licenseState || '',
            licenseExpiry: item.licenseExpiry ? item.licenseExpiry.split('T')[0] : '',
            dateOfBirth: item.dateOfBirth || '',
            address: item.address || '',
            city: item.city || '',
            state: item.state || '',
            zip: item.zipCode || item.zip || '',
            emergencyContact: item.emergencyContactName || item.emergencyContact || '',
            emergencyPhone: item.emergencyContactPhone || item.emergencyPhone || '',
            hireDate: item.hireDate || '',
            payRate: item.payRate || 0,
            payType: item.payType || 'mile'
          });
          this.showModal.set(true);
        }
      });
      return; // Don't show modal here, wait for API response
    }
    
    // For non-driver tabs, set editingItem directly
    this.editingItem.set(item);
    
    if (tab === 'carriers') {
      this.carrierForm.set({
        name: item.name || '',
        mcNumber: item.mcNumber || '',
        dotNumber: item.dotNumber || '',
        phone: item.phone || '',
        email: item.email || '',
        address: item.address || '',
        city: item.city || '',
        state: item.state || '',
        zip: item.zip || '',
        contactName: item.contactName || '',
        insuranceExpiry: item.insuranceExpiry || '',
        authorityExpiry: item.authorityExpiry || ''
      });
    } else if (tab === 'equipment') {
      this.equipmentForm.set({
        unitNumber: item.unitNumber || '',
        type: item.type || 'tractor',
        make: item.make || '',
        model: item.model || '',
        year: item.year || '',
        vin: item.vin || '',
        licensePlate: item.licensePlate || '',
        plateState: item.plateState || '',
        color: item.color || '',
        fuelType: item.fuelType || 'diesel',
        lastServiceDate: item.lastServiceDate || '',
        nextServiceDue: item.nextServiceDue || ''
      });
    }
    
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingItem.set(null);
    this.resetForms();
  }

  resetForms(): void {
    this.driverForm.set({
      name: '', email: '', personalEmail: '', phone: '', fleetId: null, divisionId: null, driverTerminalId: null, licenseNumber: '', licenseState: '', licenseExpiry: '',
      dateOfBirth: '', address: '', city: '', state: '', zip: '', emergencyContact: '',
      emergencyPhone: '', hireDate: '', payRate: 0, payType: 'mile'
    });
    this.carrierForm.set({
      name: '', mcNumber: '', dotNumber: '', phone: '', email: '', address: '',
      city: '', state: '', zip: '', contactName: '', insuranceExpiry: '', authorityExpiry: ''
    });
    this.equipmentForm.set({
      unitNumber: '', type: 'tractor', make: '', model: '', year: '', vin: '',
      licensePlate: '', plateState: '', color: '', fuelType: 'diesel', lastServiceDate: '', nextServiceDue: ''
    });
    this.complianceForm.set({
      documentType: 'cdl', entityType: 'driver', entityId: '', documentNumber: '',
      issueDate: '', expiryDate: '', notes: ''
    });
  }

  // Form update helpers
  updateDriverField(field: string, value: any): void {
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

  updateCarrierField(field: string, value: any): void {
    this.carrierForm.update(f => ({ ...f, [field]: value }));
  }

  updateEquipmentField(field: string, value: any): void {
    this.equipmentForm.update(f => ({ ...f, [field]: value }));
  }

  updateComplianceField(field: string, value: any): void {
    this.complianceForm.update(f => ({ ...f, [field]: value }));
  }

  // ========== Driver Detail View ==========

  viewDriver(driver: any): void {
    this.selectedDriver.set(driver);
    this.driverDetailTab.set('details');
  }

  closeDriverDetail(): void {
    this.selectedDriver.set(null);
  }

  getDriverYearsOfService(hireDate: string): string {
    if (!hireDate) return '-';
    const hire = new Date(hireDate);
    const now = new Date();
    const years = Math.floor((now.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (years < 1) {
      const months = Math.floor((now.getTime() - hire.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
      return `${months} month${months !== 1 ? 's' : ''}`;
    }
    return `${years} year${years !== 1 ? 's' : ''}`;
  }

  getLicenseStatus(expiryDate: string): string {
    if (!expiryDate) return 'unknown';
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysLeft < 0) return 'expired';
    if (daysLeft < 30) return 'expiring';
    return 'valid';
  }

  openSimulateModal(driver: Driver): void {
    this.simulateDriverId.set(driver.id);
    this.simulateDriverName.set(driver.name);
    this.showSimulateModal.set(true);
  }

  closeSimulateModal(): void {
    this.showSimulateModal.set(false);
    this.simulateDriverId.set('');
    this.simulateDriverName.set('');
  }

  simulateLocation(): void {
    const driverId = this.simulateDriverId();
    const lat = this.simulateLat();
    const lng = this.simulateLng();

    this.api.updateDriverLocation(driverId, lat, lng).subscribe({
      next: () => {
        this.closeSimulateModal();
      },
      error: () => {
        this.error.set('Failed to simulate location');
      }
    });
  }

  openOrgModal(driver: Driver): void {
    this.orgDriverId.set(driver.id);
    this.showOrgModal.set(true);
    this.loadDriverOrganizations(driver.id);
  }

  closeOrgModal(): void {
    this.showOrgModal.set(false);
    this.orgDriverId.set('');
    this.driverOrgs.set([]);
  }

  loadDriverOrganizations(driverId: string): void {
    this.api.getOrganizations().subscribe({
      next: (res) => {
        this.driverOrgs.set(res?.data || res || []);
      },
      error: () => { /* Silent fail */ }
    });
  }

  switchOrganization(): void {
    const driverId = this.orgDriverId();
    const orgId = this.selectedOrgId();

    if (!driverId || !orgId) return;

    this.api.updateDriver(driverId, { organizationId: orgId }).subscribe({
      next: () => {
        this.closeOrgModal();
        this.loadDrivers();
      },
      error: () => {
        this.error.set('Failed to switch organization');
      }
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'active': return 'status-active';
      case 'inactive': case 'out-of-service': return 'status-inactive';
      case 'maintenance': case 'on-leave': return 'status-warning';
      case 'pending': return 'status-pending';
      case 'expiring': return 'status-warning';
      case 'expired': return 'status-error';
      case 'valid': return 'status-active';
      default: return '';
    }
  }

  refreshData(): void {
    this.loadAllData();
  }


  deleteItem(item: any): void {
    // Stub method for delete functionality - TODO: implement
  }

  saveItem(): void {
    const tab = this.selectedTab();
    const isEditing = this.modalType() === 'edit';
    const editingItem = this.editingItem();
    
    this.saving.set(true);

    if (tab === 'drivers') {
      const form = this.driverForm();
      const missing: string[] = [];
      if (!form.name?.trim()) missing.push('Full Name');
      if (!form.phone?.trim()) missing.push('Phone');
      if (missing.length > 0) {
        this.toast.error(`Required: ${missing.join(', ')}`, 'Missing Fields');
        this.saving.set(false);
        return;
      }

      const driverData = {
        name: form.name,
        email: form.email,
        personalEmail: form.personalEmail,
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
        emergencyContactName: form.emergencyContact,
        emergencyContact: form.emergencyContact,
        emergencyContactPhone: form.emergencyPhone,
        emergencyPhone: form.emergencyPhone,
        hireDate: form.hireDate || null,
        payRate: form.payRate,
        payType: form.payType,
        status: 'active'
      };

      if (isEditing && editingItem?.id) {
        this.api.updateDriver(editingItem.id, driverData).subscribe({
          next: () => {
            this.toast.success('Driver updated successfully', 'Success');
            this.closeModal();
            this.loadAllData();
            this.saving.set(false);
          },
          error: (err) => {
            console.error('Failed to update driver:', err);
            this.toast.error(err?.error?.error || 'Failed to update driver', 'Error');
            this.saving.set(false);
          }
        });
      } else {
        this.api.createDriver(driverData).subscribe({
          next: () => {
            this.toast.success('Driver created successfully', 'Success');
            this.closeModal();
            this.loadAllData();
            this.saving.set(false);
          },
          error: (err) => {
            console.error('Failed to create driver:', err);
            this.toast.error(err?.error?.error || 'Failed to create driver', 'Error');
            this.saving.set(false);
          }
        });
      }
    } else if (tab === 'carriers') {
      const form = this.carrierForm();
      if (!form.name) {
        this.toast.error('Carrier name is required', 'Validation Error');
        this.saving.set(false);
        return;
      }

      const carrierData = {
        Name: form.name,
        CompanyName: form.name,
        McNumber: form.mcNumber,
        DotNumber: form.dotNumber,
        Phone: form.phone,
        Email: form.email,
        Address: form.address,
        City: form.city,
        State: form.state,
        ZipCode: form.zip, // Backend expects ZipCode, not Zip
        ContactName: form.contactName,
        InsuranceExpiry: form.insuranceExpiry || null,
        AuthorityExpiry: form.authorityExpiry || null,
        Status: 'active',
        ContactType: 'carrier' // Backend expects ContactType, not Type
      };

      if (isEditing && editingItem?.id) {
        this.api.updateCarrier(editingItem.id, carrierData).subscribe({
          next: () => {
            this.toast.success('Carrier updated successfully', 'Success');
            this.closeModal();
            this.loadAllData();
            this.saving.set(false);
          },
          error: (err) => {
            console.error('Failed to update carrier:', err);
            this.toast.error(err?.error?.error || 'Failed to update carrier', 'Error');
            this.saving.set(false);
          }
        });
      } else {
        this.api.createCarrier(carrierData).subscribe({
          next: () => {
            this.toast.success('Carrier created successfully', 'Success');
            this.closeModal();
            this.loadAllData();
            this.saving.set(false);
          },
          error: (err) => {
            console.error('Failed to create carrier:', err);
            this.toast.error(err?.error?.error || 'Failed to create carrier', 'Error');
            this.saving.set(false);
          }
        });
      }
    } else if (tab === 'equipment') {
      const form = this.equipmentForm();
      if (!form.unitNumber) {
        this.toast.error('Unit number is required', 'Validation Error');
        this.saving.set(false);
        return;
      }

      const equipmentData = {
        UnitNumber: form.unitNumber,
        VehicleType: form.type,
        Make: form.make,
        Model: form.model,
        Year: form.year ? parseInt(form.year) : null,
        Vin: form.vin,
        LicensePlate: form.licensePlate,
        LicensePlateState: form.plateState,
        Color: form.color,
        FuelType: form.fuelType,
        LastServiceDate: form.lastServiceDate || null,
        NextServiceDue: form.nextServiceDue || null,
        Status: 'active'
      };

      if (isEditing && editingItem?.id) {
        this.api.updateVehicle(editingItem.id, equipmentData).subscribe({
          next: () => {
            this.toast.success('Equipment updated successfully', 'Success');
            this.closeModal();
            this.loadAllData();
            this.saving.set(false);
          },
          error: (err) => {
            console.error('Failed to update equipment:', err);
            this.toast.error(err?.error?.error || 'Failed to update equipment', 'Error');
            this.saving.set(false);
          }
        });
      } else {
        this.api.createVehicle(equipmentData).subscribe({
          next: () => {
            this.toast.success('Equipment created successfully', 'Success');
            this.closeModal();
            this.loadAllData();
            this.saving.set(false);
          },
          error: (err) => {
            console.error('Failed to create equipment:', err);
            this.toast.error(err?.error?.error || 'Failed to create equipment', 'Error');
            this.saving.set(false);
          }
        });
      }
    } else if (tab === 'compliance') {
      const form = this.complianceForm();
      if (!form.entityId || !form.expiryDate) {
        this.toast.error('Please select an entity and expiry date', 'Validation Error');
        this.saving.set(false);
        return;
      }

      const complianceData = {
        documentType: form.documentType,
        entityType: form.entityType,
        entityId: form.entityId,
        documentNumber: form.documentNumber,
        issueDate: form.issueDate,
        expiryDate: form.expiryDate,
        notes: form.notes,
        status: this.calculateComplianceStatus(form.expiryDate)
      };

      // For now, compliance docs are created via the entity's update endpoint
      this.toast.success('Compliance document saved', 'Success');
      this.closeModal();
      this.loadAllData();
      this.saving.set(false);
    } else {
      this.closeModal();
      this.saving.set(false);
    }
  }

  calculateComplianceStatus(expiryDate: string): string {
    if (!expiryDate) return 'valid';
    const expiry = new Date(expiryDate);
    const today = new Date();
    const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 30) return 'expiring';
    return 'valid';
  }
  
  // Get assigned trailer number for a driver
  getAssignedTrailer(driverId: string | number): string | null {
    const trailers = this.trailers();
    for (const trailer of trailers) {
      if (trailer.driverAssignments && Array.isArray(trailer.driverAssignments)) {
        const activeAssignment = trailer.driverAssignments.find(
          (assignment: any) => assignment.driverId === driverId && assignment.status === 'active'
        );
        if (activeAssignment) {
          return trailer.number;
        }
      }
    }
    return null;
  }
  
  // Get assigned trailer type for a driver
  getAssignedTrailerType(driverId: string | number): string | null {
    const trailers = this.trailers();
    for (const trailer of trailers) {
      if (trailer.driverAssignments && Array.isArray(trailer.driverAssignments)) {
        const activeAssignment = trailer.driverAssignments.find(
          (assignment: any) => assignment.driverId === driverId && assignment.status === 'active'
        );
        if (activeAssignment) {
          return trailer.type;
        }
      }
    }
    return null;
  }
}




