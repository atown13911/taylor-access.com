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
import { ToastService } from '../../../core/services/toast.service';

interface Agency {
  id: number;
  name: string;
  code?: string;
  division?: string;
  status: string;
  city?: string;
  state?: string;
  contactPhone?: string;
  manager?: { name: string };
  employeeCount?: number;
  monthlyBudget?: number;
}

@Component({
  selector: 'app-agencies',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AddressAutocompleteComponent],
  templateUrl: './agencies.component.html',
  styleUrls: ['./agencies.component.scss']
})
export class AgenciesComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  t = inject(TranslationService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  agencies = signal<Agency[]>([]);
  organizations = signal<any[]>([]);
  departments = signal<any[]>([]);
  loading = signal(true);
  showModal = signal(false);
  modalMode = signal<'create' | 'edit'>('create');
  editingAgency = signal<Agency | null>(null);
  
  // Filters
  searchTerm = signal('');
  statusFilter = signal('all');
  orgFilter = signal('all');
  
  // State options
  states = US_STATES;
  
  // Computed stats
  activeCount = computed(() => this.agencies().filter(a => a.status === 'active').length);
  filteredAgencies = computed(() => {
    let filtered = this.agencies();
    
    if (this.statusFilter() !== 'all') {
      filtered = filtered.filter(a => a.status === this.statusFilter());
    }
    
    if (this.orgFilter() !== 'all') {
      filtered = filtered.filter((a: any) => String(a.organizationId) === this.orgFilter());
    }
    
    if (this.searchTerm()) {
      const term = this.searchTerm().toLowerCase();
      filtered = filtered.filter(a => 
        a.name.toLowerCase().includes(term) ||
        (a.code && a.code.toLowerCase().includes(term)) ||
        (a.city && a.city.toLowerCase().includes(term))
      );
    }
    
    return filtered;
  });
  
  // Form data (regular object for ngModel binding)
  form = {
    name: '',
    code: '',
    division: '',
    contactName: '',
    phone: '',
    email: '',
    status: 'active',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    organizationId: null as number | null
  };
  
  ngOnInit() {
    this.loadOrganizations();
    this.loadAgencies();
    this.loadDivisions();
  }
  
  async loadOrganizations() {
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/organizations`).toPromise();
      this.organizations.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  }
  
  async loadDivisions() {
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/divisions?limit=500`).toPromise();
      this.departments.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load divisions:', err);
    }
  }

  loadAgencies() {
    this.loading.set(true);
    this.http.get<any>(`${this.apiUrl}/api/v1/agencies?pageSize=100`)
      .subscribe({
        next: (response) => {
          const agencies = (response.data || []).map((a: any) => {
            if (!a.organizationName && a.organizationId) {
              const org = this.organizations().find(o => o.id === a.organizationId);
              if (org) a.organizationName = org.name;
            }
            return a;
          });
          this.agencies.set(agencies);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Failed to load agencies:', err);
          this.loading.set(false);
        }
      });
  }
  
  openCreateModal() {
    this.modalMode.set('create');
    this.resetForm();
    this.showModal.set(true);
  }
  
  closeModal() {
    this.showModal.set(false);
    this.editingAgency.set(null);
    this.resetForm();
  }
  
  resetForm() {
    this.form = {
      name: '',
      code: '',
      division: '',
      contactName: '',
      phone: '',
      email: '',
      status: 'active',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      organizationId: null
    };
  }
  
  editAgency(agency: Agency) {
    this.modalMode.set('edit');
    this.editingAgency.set(agency);
    this.form = {
      name: agency.name,
      code: agency.code || '',
      division: agency.division || '',
      status: agency.status,
      address: (agency as any).address || '',
      city: agency.city || '',
      state: agency.state || '',
      zipCode: (agency as any).zipCode || '',
      country: (agency as any).country || '',
      contactName: (agency as any).contactName || '',
      phone: (agency as any).contactPhone || (agency as any).phone || '',
      email: (agency as any).contactEmail || (agency as any).email || '',
      organizationId: (agency as any).organizationId || null
    };
    this.showModal.set(true);
  }
  
  save() {
    const payload: any = {
      name: this.form.name,
      code: this.form.code,
      division: this.form.division,
      status: this.form.status,
      address: this.form.address,
      city: this.form.city,
      state: this.form.state,
      zipCode: this.form.zipCode,
      country: this.form.country,
      contactName: this.form.contactName,
      contactPhone: this.form.phone,
      contactEmail: this.form.email,
      organizationId: this.form.organizationId
    };
    
    if (this.modalMode() === 'create') {
      this.http.post(`${this.apiUrl}/api/v1/agencies`, payload)
        .subscribe({
          next: () => {
            this.toast.champagne(`${this.form.name} created successfully!`);
            this.closeModal();
            this.loadAgencies();
          },
          error: (err) => {
            console.error('Create failed:', err);
            this.toast.error(err?.error?.message || 'Failed to create agency', 'Error');
          }
        });
    } else {
      const id = this.editingAgency()?.id;
      this.http.put(`${this.apiUrl}/api/v1/agencies/${id}`, payload)
        .subscribe({
          next: () => {
            this.toast.champagne(`${this.form.name} updated successfully!`);
            this.closeModal();
            this.loadAgencies();
          },
          error: (err) => {
            console.error('Update failed:', err);
            this.toast.error(err?.error?.message || 'Failed to update agency', 'Error');
          }
        });
    }
  }
  
  getAddressLabels(): { address: string; addressPlaceholder: string; city: string; cityPlaceholder: string; state: string; statePlaceholder: string; zip: string; zipPlaceholder: string } {
    switch (this.form.country) {
      case 'BA':
        return { address: 'Adresa', addressPlaceholder: 'Unesite adresu (npr. Maršala Tita 25)', city: 'Grad', cityPlaceholder: 'npr. Sarajevo', state: 'Kanton / Općina', statePlaceholder: 'npr. Kanton Sarajevo', zip: 'Poštanski broj', zipPlaceholder: 'npr. 71000' };
      case 'GB':
        return { address: 'Address', addressPlaceholder: 'Start typing address...', city: 'City / Town', cityPlaceholder: 'e.g. London', state: 'County', statePlaceholder: 'e.g. Greater London', zip: 'Postcode', zipPlaceholder: 'e.g. SW1A 1AA' };
      case 'CA':
        return { address: 'Address', addressPlaceholder: 'Start typing address...', city: 'City', cityPlaceholder: 'e.g. Toronto', state: 'Province', statePlaceholder: 'Select Province', zip: 'Postal Code', zipPlaceholder: 'e.g. M5V 2T6' };
      case 'MX':
        return { address: 'Dirección', addressPlaceholder: 'Escriba la dirección...', city: 'Ciudad', cityPlaceholder: 'ej. Ciudad de México', state: 'Estado', statePlaceholder: 'ej. CDMX', zip: 'Código Postal', zipPlaceholder: 'ej. 06600' };
      case 'DE':
        return { address: 'Adresse', addressPlaceholder: 'Adresse eingeben...', city: 'Stadt', cityPlaceholder: 'z.B. Berlin', state: 'Bundesland', statePlaceholder: 'z.B. Berlin', zip: 'PLZ', zipPlaceholder: 'z.B. 10115' };
      case 'FR':
        return { address: 'Adresse', addressPlaceholder: 'Saisissez l\'adresse...', city: 'Ville', cityPlaceholder: 'ex. Paris', state: 'Région', statePlaceholder: 'ex. Île-de-France', zip: 'Code Postal', zipPlaceholder: 'ex. 75001' };
      default:
        return { address: 'Address', addressPlaceholder: 'Start typing address (e.g., 1717 McKinney)', city: 'City', cityPlaceholder: 'Auto-filled from address', state: 'State', statePlaceholder: 'Select State', zip: 'ZIP Code', zipPlaceholder: 'Auto-filled from address' };
    }
  }

  getFilteredDivisions(): any[] {
    if (!this.form.organizationId) return [];
    return this.departments().filter(d => String(d.organizationId) === String(this.form.organizationId));
  }

  async deleteAgency(id: number) {
    const ok = await this.confirm.show({ message: 'Are you sure you want to delete this agency?', type: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    
    this.http.delete(`${this.apiUrl}/api/v1/agencies/${id}`)
      .subscribe({
        next: () => this.loadAgencies(),
        error: (err) => console.error('Delete failed:', err)
      });
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
