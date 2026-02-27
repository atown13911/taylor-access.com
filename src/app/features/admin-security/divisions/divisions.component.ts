import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-divisions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './divisions.component.html',
  styleUrls: ['./divisions.component.scss']
})
export class DivisionsComponent implements OnInit {
  private api = inject(VanTacApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  isElevated = computed(() => {
    const role = this.auth.currentUser()?.role?.toLowerCase();
    return role === 'product_owner' || role === 'superadmin';
  });

  loading = signal(true);
  divisions = signal<any[]>([]);
  fleets = signal<any[]>([]);
  organizations = signal<any[]>([]);
  employees = signal<any[]>([]);

  selectedOrgId = signal<number | null>(null);
  selectedFleetId = signal<number | null>(null);
  selectedType = signal<string>('');
  searchTerm = signal('');

  filteredDivisions = computed(() => {
    let results = this.divisions();
    const orgId = this.selectedOrgId();
    const fleetId = this.selectedFleetId();
    const divType = this.selectedType();
    const search = this.searchTerm().toLowerCase().trim();
    if (orgId) results = results.filter(d => d.organizationId === orgId);
    if (fleetId) results = results.filter(d => d.fleetId === fleetId);
    if (divType) results = results.filter(d => d.divisionType === divType);
    if (search) results = results.filter(d =>
      (d.name || '').toLowerCase().includes(search) ||
      (d.fleetName || '').toLowerCase().includes(search) ||
      (d.managerName || '').toLowerCase().includes(search) ||
      (d.location || '').toLowerCase().includes(search)
    );
    return results;
  });

  filteredFleets = computed(() => {
    const orgId = this.selectedOrgId();
    if (!orgId) return this.fleets();
    return this.fleets().filter(f => f.organizationId === orgId);
  });

  // Modal
  showModal = signal(false);
  editing = signal<any>(null);
  saving = signal(false);
  form = signal({
    name: '',
    divisionType: 'operational' as string,
    fleetId: null as number | null,
    organizationId: null as number | null,
    description: '',
    status: 'active',
    managerName: '',
    location: ''
  });

  ngOnInit(): void {
    this.loadAll();
  }

  async loadAll() {
    this.loading.set(true);
    try {
      await Promise.all([this.loadDivisions(), this.loadFleets(), this.loadOrganizations(), this.loadEmployees()]);
    } finally {
      this.loading.set(false);
    }
  }

  async loadDivisions() {
    this.api.getDivisions().subscribe({
      next: (res: any) => this.divisions.set(res?.data || []),
      error: () => this.divisions.set([])
    });
  }

  async loadFleets() {
    this.api.getFleets().subscribe({
      next: (res: any) => this.fleets.set(res?.data || []),
      error: () => this.fleets.set([])
    });
  }

  async loadOrganizations() {
    this.api.getOrganizations().subscribe({
      next: (res: any) => this.organizations.set(res?.data || []),
      error: () => this.organizations.set([])
    });
  }

  async loadEmployees() {
    this.api.getUsers({ limit: 500 }).subscribe({
      next: (res: any) => this.employees.set(res?.data || []),
      error: () => this.employees.set([])
    });
  }

  onOrgChange(): void {
    this.selectedFleetId.set(null);
  }

  // CRUD
  openAdd(): void {
    this.editing.set(null);
    this.form.set({
      name: '',
      divisionType: 'operational',
      fleetId: null,
      organizationId: this.selectedOrgId() || this.organizations()[0]?.id || null,
      description: '',
      status: 'active',
      managerName: '',
      location: ''
    });
    this.showModal.set(true);
  }

  openEdit(div: any): void {
    this.editing.set(div);
    this.form.set({
      name: div.name,
      divisionType: div.divisionType || 'operational',
      fleetId: div.fleetId || null,
      organizationId: div.organizationId || null,
      description: div.description || '',
      status: div.status || 'active',
      managerName: div.managerName || '',
      location: div.location || ''
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editing.set(null);
  }

  updateField(field: string, value: any): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  save(): void {
    const f = this.form();
    if (!f.name.trim()) { this.toast.warning('Name is required'); return; }
    if (f.divisionType === 'fleet' && !f.fleetId) { this.toast.warning('Fleet is required for fleet divisions'); return; }

    this.saving.set(true);
    const obs = this.editing()
      ? this.api.updateDivision(this.editing().id, f)
      : this.api.createDivision(f);

    obs.subscribe({
      next: () => {
        this.toast.success(this.editing() ? 'Division updated' : 'Division created');
        this.saving.set(false);
        this.closeModal();
        this.loadDivisions();
      },
      error: (err: any) => {
        this.toast.error(err?.error?.error || 'Failed to save');
        this.saving.set(false);
      }
    });
  }

  async deleteDivision(div: any) {
    const ok = await this.confirm.show({ message: `Delete division "${div.name}"? Drivers will be unassigned.`, type: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    this.api.deleteDivision(div.id).subscribe({
      next: () => { this.toast.success('Division deleted'); this.loadDivisions(); },
      error: () => this.toast.error('Failed to delete')
    });
  }

  getOrgName(orgId: number): string {
    return this.organizations().find(o => o.id === orgId)?.name || '—';
  }
}
