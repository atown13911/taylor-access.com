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

interface Terminal {
  id: number;
  name: string;
  code?: string;
  type: string;
  status: string;
  address: string;
  city: string;
  state: string;
  phone?: string;
  manager?: { name: string };
  satellite?: { name: string };
  agency?: { name: string };
  dockDoors?: number;
}

@Component({
  selector: 'app-terminals',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AddressAutocompleteComponent],
  templateUrl: './terminals.component.html',
  styleUrls: ['./terminals.component.scss']
})
export class TerminalsComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  t = inject(TranslationService);

  terminals = signal<Terminal[]>([]);
  organizations = signal<any[]>([]);
  loading = signal(true);
  showModal = signal(false);
  modalMode = signal<'create' | 'edit'>('create');
  editingTerminal = signal<Terminal | null>(null);
  
  // State options
  states = US_STATES;
  
  // Computed stats
  activeCount = computed(() => this.terminals().filter(t => t.status === 'active').length);
  totalDockDoors = computed(() => this.terminals().reduce((sum, t) => sum + (t.dockDoors || 0), 0));
  
  // Form data (regular object for ngModel binding)
  form = {
    name: '',
    code: '',
    type: 'warehouse',
    status: 'active',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    organizationId: null as number | null
  };
  
  ngOnInit() {
    this.loadTerminals();
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

  loadTerminals() {
    this.loading.set(true);
    this.http.get<any>(`${this.apiUrl}/api/v1/terminals?pageSize=100`)
      .subscribe({
        next: (response) => {
          this.terminals.set(response.data || []);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Failed to load terminals:', err);
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
    this.editingTerminal.set(null);
  }
  
  resetForm() {
    this.form = {
      name: '',
      code: '',
      type: 'warehouse',
      status: 'active',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      organizationId: null
    };
  }
  
  onAddressSelected(address: AddressResult) {
    this.form.address = address.street;
    this.form.city = address.city;
    this.form.state = address.state;
    this.form.zipCode = address.zipCode;
  }
  
  save() {
    const formData = this.form;
    
    if (this.modalMode() === 'create') {
      this.http.post(`${this.apiUrl}/api/v1/terminals`, formData)
        .subscribe({
          next: () => {
            this.closeModal();
            this.loadTerminals();
          },
          error: (err) => console.error('Create failed:', err)
        });
    }
  }
}
