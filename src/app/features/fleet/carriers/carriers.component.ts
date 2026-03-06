import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';

interface Carrier {
  id: number;
  name: string;
  mcNumber: string;
  dotNumber: string;
  scacCode: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  insuranceProvider: string;
  insuranceExpiry: string;
  insuranceAmount: number;
  paymentTerms: string;
  rating: number;
  safetyRating: string;
  csaScore: number;
  status: string;
  totalLoads: number;
  onTimeRate: number;
  avgRate: number;
  notes: string;
}

@Component({
  selector: 'app-carriers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './carriers.component.html',
  styleUrls: ['./carriers.component.scss']
})
export class CarriersComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private apiUrl = environment.apiUrl;

  loading = signal(false);
  carriers = signal<Carrier[]>([]);
  searchTerm = signal('');
  statusFilter = signal('all');
  showAddModal = signal(false);
  showDetailModal = signal(false);
  selectedCarrier = signal<Carrier | null>(null);
  editingCarrier = signal<Carrier | null>(null);
  saving = signal(false);

  fmcsaLookupDot = '';
  fmcsaLoading = signal(false);
  fmcsaApiKey = signal(localStorage.getItem('fmcsa_api_key') || '');
  showFmcsaSettings = signal(false);

  carrierForm: Partial<Carrier> = {};

  filteredCarriers = computed(() => {
    let list = this.carriers();
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    if (search) list = list.filter(c =>
      c.name?.toLowerCase().includes(search) ||
      c.mcNumber?.toLowerCase().includes(search) ||
      c.dotNumber?.toLowerCase().includes(search) ||
      c.city?.toLowerCase().includes(search)
    );
    if (status !== 'all') list = list.filter(c => c.status === status);
    return list;
  });

  stats = computed(() => {
    const all = this.carriers();
    return {
      total: all.length,
      active: all.filter(c => c.status === 'active').length,
      suspended: all.filter(c => c.status === 'suspended').length,
      avgOnTime: all.length > 0 ? all.reduce((s, c) => s + (c.onTimeRate || 0), 0) / all.length : 0
    };
  });

  ngOnInit() { this.loadCarriers(); }

  loadCarriers() {
    this.loading.set(true);
    this.http.get<any>(`${this.apiUrl}/api/v1/carriers`).subscribe({
      next: (res) => { this.carriers.set(res?.data || []); this.loading.set(false); },
      error: () => { this.carriers.set([]); this.loading.set(false); this.toast.error('Failed to load carriers', 'Error'); }
    });
  }

  openAddModal() {
    this.editingCarrier.set(null);
    this.carrierForm = { status: 'pending', paymentTerms: 'net_30', rating: 0 };
    this.showAddModal.set(true);
  }

  editCarrier(carrier: Carrier) {
    this.editingCarrier.set(carrier);
    this.carrierForm = { ...carrier };
    this.showAddModal.set(true);
  }

  closeModal() { this.showAddModal.set(false); this.editingCarrier.set(null); }

  saveCarrier() {
    if (!this.carrierForm.name || !this.carrierForm.mcNumber) {
      this.toast.error('Carrier name and MC# are required', 'Validation');
      return;
    }
    this.saving.set(true);
    const editing = this.editingCarrier();

    if (editing) {
      this.http.put(`${this.apiUrl}/api/v1/carriers/${editing.id}`, this.carrierForm).subscribe({
        next: () => { this.toast.champagne('Carrier updated', 'Updated'); this.saving.set(false); this.closeModal(); this.loadCarriers(); },
        error: (err) => { this.toast.error(err?.error?.error || 'Failed to update', 'Error'); this.saving.set(false); }
      });
    } else {
      this.http.post(`${this.apiUrl}/api/v1/carriers`, this.carrierForm).subscribe({
        next: () => { this.toast.champagne('Carrier added', 'Added'); this.saving.set(false); this.closeModal(); this.loadCarriers(); },
        error: (err) => { this.toast.error(err?.error?.error || 'Failed to create', 'Error'); this.saving.set(false); }
      });
    }
  }

  viewCarrier(carrier: Carrier) { this.selectedCarrier.set(carrier); this.showDetailModal.set(true); }
  closeDetail() { this.showDetailModal.set(false); this.selectedCarrier.set(null); }

  deleteCarrier(carrier: Carrier) {
    if (!confirm(`Delete carrier ${carrier.name}?`)) return;
    this.http.delete(`${this.apiUrl}/api/v1/carriers/${carrier.id}`).subscribe({
      next: () => { this.toast.champagne('Carrier deleted', 'Deleted'); this.loadCarriers(); },
      error: () => this.toast.error('Failed to delete', 'Error')
    });
  }

  getStars(n: number): number[] { return Array(5).fill(0).map((_, i) => i < n ? 1 : 0); }
  getPayLabel(v: string): string { return ({ quick_pay: 'Quick Pay', net_15: 'Net 15', net_30: 'Net 30', net_45: 'Net 45' } as any)[v] || v; }
  getSafetyClass(r: string): string { return ({ satisfactory: 'safety-good', conditional: 'safety-warn', unsatisfactory: 'safety-bad', none: 'safety-none' } as any)[r] || 'safety-none'; }

  saveFmcsaKey() {
    localStorage.setItem('fmcsa_api_key', this.fmcsaApiKey());
    this.toast.champagne('FMCSA API key saved', 'Saved');
    this.showFmcsaSettings.set(false);
  }

  async lookupFmcsa(dotNumber?: string) {
    const dot = dotNumber || this.fmcsaLookupDot;
    if (!dot) { this.toast.error('Enter a DOT number', 'Validation'); return; }
    const key = this.fmcsaApiKey();
    if (!key) { this.toast.error('Set your FMCSA API key first', 'No API Key'); this.showFmcsaSettings.set(true); return; }

    this.fmcsaLoading.set(true);
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/market-data/fmcsa/${dot}?webKey=${key}`).toPromise();
      if (response?.content?.carrier) {
        const c = response.content.carrier;
        this.carrierForm = {
          ...this.carrierForm,
          name: c.legalName || c.dbaName || this.carrierForm.name,
          dotNumber: c.dotNumber?.toString() || dot,
          mcNumber: c.mcNumber ? `MC-${c.mcNumber}` : this.carrierForm.mcNumber,
          address: c.phyStreet || '', city: c.phyCity || '', state: c.phyState || '', zipCode: c.phyZipcode || '',
          phone: c.telephone || '',
          status: c.allowedToOperate === 'Y' ? 'active' : 'suspended',
          safetyRating: this.mapFmcsaSafetyRating(c.safetyRating),
          notes: `FMCSA: ${c.carrierOperation || ''} | Power Units: ${c.totalPowerUnits || 0} | Drivers: ${c.totalDrivers || 0}`
        };
        this.toast.champagne(`Found: ${c.legalName || c.dbaName}`, 'FMCSA Lookup');
      } else {
        this.toast.error('No carrier found for that DOT number', 'Not Found');
      }
    } catch {
      this.toast.error('FMCSA lookup failed', 'Error');
    } finally {
      this.fmcsaLoading.set(false);
    }
  }

  private mapFmcsaSafetyRating(rating: string): string {
    if (!rating) return 'none';
    const r = rating.toLowerCase();
    if (r.includes('satisfactory') && !r.includes('un')) return 'satisfactory';
    if (r.includes('conditional')) return 'conditional';
    if (r.includes('unsatisfactory')) return 'unsatisfactory';
    return 'none';
  }
}
