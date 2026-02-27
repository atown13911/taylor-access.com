import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import { TranslationService } from '../../../core/services/translation.service';
import { US_STATES } from '../../../core/data/us-states';
import { AddressAutocompleteComponent } from '../../../shared/components/address-autocomplete/address-autocomplete.component';
import { AddressResult } from '../../../core/services/address-lookup.service';
import { ConfirmService } from '../../../core/services/confirm.service';

interface Satellite {
  id: number;
  name: string;
  code?: string;
  dbaName?: string;
  status: string;
  city?: string;
  state?: string;
  contactPhone?: string;
  contactEmail?: string;
  managerUserId?: number;
  manager?: { name: string };
  employeeCount?: number;
  createdAt: string;
}

@Component({
  selector: 'app-satellites',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AddressAutocompleteComponent],
  templateUrl: './satellites.component.html',
  styleUrls: ['./satellites.component.scss']
})
export class SatellitesComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  t = inject(TranslationService); // Expose for template
  private confirm = inject(ConfirmService);

  satellites = signal<Satellite[]>([]);
  loading = signal(true);
  totalPages = signal(0);
  currentPage = signal(1);
  
  // Computed stats
  activeCount = computed(() => this.satellites().filter(s => s.status === 'active').length);
  totalEmployees = computed(() => this.satellites().reduce((sum, s) => sum + (s.employeeCount || 0), 0));
  
  // Filters
  searchTerm = signal('');
  statusFilter = signal('all');
  orgFilter = signal('all');
  organizations = signal<any[]>([]);
  
  // State options
  states = US_STATES;
  
  // Create/Edit modal
  showModal = signal(false);
  modalMode = signal<'create' | 'edit'>('create');
  editingSatellite = signal<Satellite | null>(null);
  wizardStep = signal<1 | 2>(1);
  selectedOrgId = signal<number | null>(null);
  satelliteEmployees = signal<any[]>([]);
  satelliteOwners = signal<any[]>([]);
  showOwnerForm = signal(false);
  ownerForm: any = { name: '', role: 'owner', ownershipPercent: 0, userId: null };
  
  selectedOrgCountry = computed(() => {
    const orgId = this.selectedOrgId();
    const org = this.organizations().find((o: any) => o.id == orgId);
    const name = (org?.name || '').toLowerCase();
    const country = (org?.country || '').toLowerCase();
    if (name.includes('bosni') || country.includes('bosni') || country === 'ba') return 'BA';
    return 'US';
  });

  // Form
  form: any = {
    name: '',
    code: '',
    dbaName: '',
    status: 'active',
    legalBusinessName: '',
    einTaxId: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    dotNumber: '',
    mcNumber: '',
    jib: '',
    pdvNumber: '',
    courtRegistration: '',
    activityCode: '',
    registrationNumber: '',
    organizationId: null as number | null,
    bankName: '',
    routingNumber: '',
    accountNumber: '',
    iban: '',
    swiftBic: '',
    paymentTerms: '',
    commissionRate: null as number | null,
    revenueSharePercent: null as number | null
  };

  ngOnInit() {
    this.loadSatellites();
    this.loadOrganizations();
  }
  
  async loadOrganizations() {
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/organizations`).toPromise();
      this.organizations.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  }

  loadSatellites() {
    this.loading.set(true);
    const params = new URLSearchParams({
      page: this.currentPage().toString(),
      pageSize: '50',
      ...(this.statusFilter() !== 'all' && { status: this.statusFilter() }),
      ...(this.searchTerm() && { search: this.searchTerm() })
    });

    this.http.get<any>(`${this.apiUrl}/api/v1/satellites?${params}`)
      .subscribe({
        next: (response) => {
          this.satellites.set(response.data || []);
          this.totalPages.set(response.totalPages || 0);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Failed to load satellites:', err);
          this.loading.set(false);
        }
      });
  }

  openCreateModal() {
    this.modalMode.set('create');
    this.resetForm();
    this.wizardStep.set(1);
    this.selectedOrgId.set(null);
    this.showModal.set(true);
  }

  selectOrgAndNext(orgId: number) {
    this.selectedOrgId.set(orgId);
    this.form.organizationId = orgId;
    this.wizardStep.set(2);
  }

  openEditModal(satellite: Satellite) {
    this.modalMode.set('edit');
    this.editingSatellite.set(satellite);
    this.selectedOrgId.set((satellite as any).organizationId || null);
    this.wizardStep.set(2);
    this.form = {
      name: satellite.name,
      code: satellite.code || '',
      dbaName: satellite.dbaName || '',
      status: satellite.status,
      legalBusinessName: (satellite as any).legalBusinessName || '',
      einTaxId: (satellite as any).einTaxId || '',
      address: (satellite as any).address || '',
      city: satellite.city || '',
      state: satellite.state || '',
      zipCode: (satellite as any).zipCode || '',
      contactName: (satellite as any).contactName || '',
      contactEmail: satellite.contactEmail || '',
      contactPhone: satellite.contactPhone || '',
      dotNumber: (satellite as any).dotNumber || '',
      mcNumber: (satellite as any).mcNumber || '',
      jib: (satellite as any).jib || '',
      pdvNumber: (satellite as any).pdvNumber || '',
      courtRegistration: (satellite as any).courtRegistration || '',
      activityCode: (satellite as any).activityCode || '',
      registrationNumber: (satellite as any).registrationNumber || '',
      organizationId: (satellite as any).organizationId || null,
      bankName: (satellite as any).bankName || '',
      routingNumber: (satellite as any).routingNumber || '',
      accountNumber: (satellite as any).accountNumber || '',
      iban: (satellite as any).iban || '',
      swiftBic: (satellite as any).swiftBic || '',
      paymentTerms: (satellite as any).paymentTerms || '',
      commissionRate: (satellite as any).commissionRate || null,
      revenueSharePercent: (satellite as any).revenueSharePercent || null
    };
    this.showModal.set(true);
    this.loadSatelliteEmployees(satellite.id);
    this.loadSatelliteOwners(satellite.id);
    this.showOwnerForm.set(false);
  }

  loadSatelliteEmployees(satelliteId: number) {
    this.http.get<any>(`${this.apiUrl}/api/v1/users?adminReport=true&includeAll=true&limit=5000`)
      .subscribe({
        next: (res) => {
          const all = res?.data || [];
          const filtered = all.filter((u: any) => u.satelliteId === satelliteId || u.satellite?.id === satelliteId);
          this.satelliteEmployees.set(filtered);
        },
        error: () => this.satelliteEmployees.set([])
      });
  }

  loadSatelliteOwners(satelliteId: number) {
    this.http.get<any>(`${this.apiUrl}/api/v1/satellites/${satelliteId}/owners`)
      .subscribe({
        next: (res) => this.satelliteOwners.set(res?.data || []),
        error: () => this.satelliteOwners.set([])
      });
  }

  onOwnerUserSelect(userId: any) {
    if (userId) {
      const emp = this.satelliteEmployees().find((e: any) => e.id == userId);
      if (emp) this.ownerForm.name = emp.name;
    }
  }

  saveOwner() {
    const sat = this.editingSatellite();
    if (!sat || !this.ownerForm.name) return;
    this.http.post(`${this.apiUrl}/api/v1/satellites/${sat.id}/owners`, this.ownerForm)
      .subscribe({
        next: () => {
          this.showOwnerForm.set(false);
          this.ownerForm = { name: '', role: 'owner', ownershipPercent: 0, userId: null };
          this.loadSatelliteOwners(sat.id);
        },
        error: (err) => console.error('Failed to add owner:', err)
      });
  }

  deleteOwner(ownerId: number) {
    const sat = this.editingSatellite();
    if (!sat) return;
    this.http.delete(`${this.apiUrl}/api/v1/satellites/${sat.id}/owners/${ownerId}`)
      .subscribe({
        next: () => this.loadSatelliteOwners(sat.id),
        error: (err) => console.error('Failed to delete owner:', err)
      });
  }

  closeModal() {
    this.showModal.set(false);
    this.editingSatellite.set(null);
    this.resetForm();
  }

  resetForm() {
    this.form = {
      name: '', code: '', dbaName: '', status: 'active',
      legalBusinessName: '', einTaxId: '', address: '', city: '', state: '', zipCode: '',
      contactName: '', contactEmail: '', contactPhone: '',
      dotNumber: '', mcNumber: '',
      jib: '', pdvNumber: '', courtRegistration: '', activityCode: '', registrationNumber: '',
      organizationId: null,
      bankName: '', routingNumber: '', accountNumber: '', iban: '', swiftBic: '',
      paymentTerms: '', commissionRate: null, revenueSharePercent: null
    };
  }

  save() {
    const formData = { ...this.form, organizationId: this.selectedOrgId() || this.form.organizationId };
    
    if (this.modalMode() === 'create') {
      this.http.post(`${this.apiUrl}/api/v1/satellites`, formData)
        .subscribe({
          next: () => {
            this.closeModal();
            this.loadSatellites();
          },
          error: (err) => console.error('Create failed:', err)
        });
    } else {
      const id = this.editingSatellite()?.id;
      this.http.put(`${this.apiUrl}/api/v1/satellites/${id}`, formData)
        .subscribe({
          next: () => {
            this.closeModal();
            this.loadSatellites();
          },
          error: (err) => console.error('Update failed:', err)
        });
    }
  }

  async deleteSatellite(id: number) {
    const ok = await this.confirm.show({ message: 'Are you sure you want to delete this satellite?', type: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    
    this.http.delete(`${this.apiUrl}/api/v1/satellites/${id}`)
      .subscribe({
        next: () => this.loadSatellites(),
        error: (err) => console.error('Delete failed:', err)
      });
  }

  onSearch() {
    this.currentPage.set(1);
    this.loadSatellites();
  }

  onStatusFilter() {
    this.currentPage.set(1);
    this.loadSatellites();
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
      this.loadSatellites();
    }
  }

  previousPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
      this.loadSatellites();
    }
  }

  /**
   * Handle address selection from autocomplete
   */
  onAddressSelected(address: AddressResult) {
    this.form.address = address.street;
    this.form.city = address.city;
    this.form.state = address.state;
    this.form.zipCode = address.zipCode;
  }
}
 
