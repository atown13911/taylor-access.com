import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-tags-permits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tags-permits.component.html',
  styleUrls: ['./tags-permits.component.scss']
})
export class TagsPermitsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private apiUrl = environment.apiUrl;

  activeTab = signal<'permits' | 'irp'>('permits');
  permits = signal<any[]>([]);
  drivers = signal<any[]>([]);
  searchTerm = signal('');
  typeFilter = signal('');
  statusFilter = signal('');
  loading = signal(false);
  saving = signal(false);
  showAddModal = signal(false);
  editingPermit = signal<any>(null);

  permitForm: any = { permitNumber: '', permitType: 'overweight', state: '', issueDate: '', expiryDate: '', cost: null, assignedDriverId: null, assignedTruckNumber: '', notes: '' };

  filteredPermits = computed(() => {
    let list = this.permits();
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

  activePermits = computed(() => this.permits().filter(p => this.getPermitStatus(p) === 'active').length);
  expiringPermits = computed(() => this.permits().filter(p => this.getPermitStatus(p) === 'expiring').length);
  expiredPermits = computed(() => this.permits().filter(p => this.getPermitStatus(p) === 'expired').length);

  ngOnInit() {
    this.loadData();
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
  }

  getPermitStatus(p: any): string {
    if (p.status === 'expired') return 'expired';
    if (!p.expiryDate) return p.status || 'active';
    const days = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring';
    return 'active';
  }

  editPermit(p: any) {
    this.editingPermit.set(p);
    this.permitForm = {
      permitNumber: p.permitNumber, permitType: p.permitType, state: p.state || '',
      issueDate: p.issueDate ? new Date(p.issueDate).toISOString().split('T')[0] : '',
      expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString().split('T')[0] : '',
      cost: p.cost, assignedDriverId: p.assignedDriverId, assignedTruckNumber: p.assignedTruckNumber || '', notes: p.notes || ''
    };
    this.showAddModal.set(true);
  }

  closeModal() {
    this.showAddModal.set(false);
    this.editingPermit.set(null);
    this.permitForm = { permitNumber: '', permitType: 'overweight', state: '', issueDate: '', expiryDate: '', cost: null, assignedDriverId: null, assignedTruckNumber: '', notes: '' };
  }

  savePermit() {
    if (!this.permitForm.permitNumber.trim()) { this.toast.error('Permit number is required', 'Error'); return; }
    this.saving.set(true);
    const editing = this.editingPermit();
    const body = { ...this.permitForm };
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
        this.toast.champagne(editing ? 'Permit updated' : 'Permit created', 'Success');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error || 'Failed to save permit', 'Error');
      }
    });
  }

  deletePermit(p: any) {
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
}
