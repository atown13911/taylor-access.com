import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
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
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './satellites.component.html',
  styleUrls: ['./satellites.component.scss']
})
export class SatellitesComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private confirm = inject(ConfirmService);

  satellites = signal<Satellite[]>([]);
  loading = signal(true);
  totalPages = signal(0);
  currentPage = signal(1);
  
  // Filters
  searchTerm = signal('');
  statusFilter = signal('all');
  
  // Create/Edit modal
  showModal = signal(false);
  modalMode = signal<'create' | 'edit'>('create');
  editingSatellite = signal<Satellite | null>(null);
  
  // Form
  form = signal({
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
    mcNumber: ''
  });

  ngOnInit() {
    this.loadSatellites();
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
    this.showModal.set(true);
  }

  openEditModal(satellite: Satellite) {
    this.modalMode.set('edit');
    this.editingSatellite.set(satellite);
    this.form.set({
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
      mcNumber: (satellite as any).mcNumber || ''
    });
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingSatellite.set(null);
    this.resetForm();
  }

  resetForm() {
    this.form.set({
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
      mcNumber: ''
    });
  }

  save() {
    const formData = this.form();
    
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
}
