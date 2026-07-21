import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';

type OfficeTab = 'computers' | 'phones' | 'access';
type AssignFilter = '' | 'assigned' | 'unassigned';

@Component({
  selector: 'app-office-assets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './office-assets.component.html',
  styleUrls: ['./office-assets.component.scss']
})
export class OfficeAssetsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private orgContext = inject(OrganizationContextService);
  private apiUrl = environment.apiUrl;

  activeTab = signal<OfficeTab>('computers');
  loading = signal(false);
  saving = signal(false);
  employees = signal<any[]>([]);
  searchTerm = signal('');
  assignFilter = signal<AssignFilter>('');

  showEditModal = signal(false);
  editingEmployee = signal<any | null>(null);
  editForm = {
    laptop: '',
    issuedPhone: '',
    accessBadge: '',
    headset: '',
    monitor: '',
    keysFob: '',
    equipmentNotes: ''
  };

  filteredRows = computed(() => {
    const tab = this.activeTab();
    const search = this.searchTerm().trim().toLowerCase();
    const filter = this.assignFilter();
    let rows = this.employees().filter((e: any) => String(e?.status || '').toLowerCase() !== 'terminated');

    rows = rows.filter((e: any) => {
      const value = this.primaryAssetValue(e, tab);
      if (filter === 'assigned') return !!value;
      if (filter === 'unassigned') return !value;
      return true;
    });

    if (search) {
      rows = rows.filter((e: any) => {
        const blob = [
          e?.name, e?.alias, e?.email, e?.jobTitle, e?.department?.name,
          e?.laptop, e?.issuedPhone, e?.accessBadge, e?.headset, e?.monitor, e?.keysFob, e?.equipmentNotes
        ].map((v: any) => String(v || '').toLowerCase()).join(' ');
        return blob.includes(search);
      });
    }

    return rows.sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')));
  });

  stats = computed(() => {
    const list = this.employees().filter((e: any) => String(e?.status || '').toLowerCase() !== 'terminated');
    const withLaptop = list.filter((e: any) => !!String(e?.laptop || '').trim()).length;
    const withPhone = list.filter((e: any) => !!String(e?.issuedPhone || '').trim()).length;
    const withBadge = list.filter((e: any) => !!String(e?.accessBadge || '').trim()).length;
    return [
      { label: 'Employees', value: list.length, icon: 'bx-group' },
      { label: 'Computers Issued', value: withLaptop, icon: 'bx-laptop' },
      { label: 'Phones Issued', value: withPhone, icon: 'bx-mobile-alt' },
      { label: 'Badges Issued', value: withBadge, icon: 'bx-id-card' }
    ];
  });

  ngOnInit(): void {
    this.loadEmployees();
  }

  selectTab(tab: OfficeTab): void {
    this.activeTab.set(tab);
    this.assignFilter.set('');
  }

  primaryAssetValue(employee: any, tab: OfficeTab = this.activeTab()): string {
    if (tab === 'phones') return String(employee?.issuedPhone || '').trim();
    if (tab === 'access') return String(employee?.accessBadge || employee?.keysFob || '').trim();
    return String(employee?.laptop || '').trim();
  }

  primaryAssetLabel(): string {
    const tab = this.activeTab();
    if (tab === 'phones') return 'Issued Phone';
    if (tab === 'access') return 'Access Badge';
    return 'Laptop / Computer';
  }

  async loadEmployees(): Promise<void> {
    this.loading.set(true);
    try {
      const limit = 250;
      const firstUrl = this.orgContext.addOrgParam(`${this.apiUrl}/api/v1/employee-roster?limit=${limit}&status=active`);
      const firstResponse: any = await this.http.get(firstUrl).toPromise();
      const firstData = Array.isArray(firstResponse?.data) ? firstResponse.data : [];
      const totalPages = Math.max(1, Number(firstResponse?.meta?.pages || 1));
      const allRows = [...firstData];

      for (let page = 2; page <= totalPages; page++) {
        const pageUrl = this.orgContext.addOrgParam(`${this.apiUrl}/api/v1/employee-roster?limit=${limit}&status=active&page=${page}`);
        const pageResponse: any = await this.http.get(pageUrl).toPromise();
        if (Array.isArray(pageResponse?.data) && pageResponse.data.length) {
          allRows.push(...pageResponse.data);
        }
      }

      this.employees.set(allRows);
    } catch (err) {
      console.error('Failed to load office assets roster:', err);
      this.employees.set([]);
      this.toast.error('Failed to load office assets');
    } finally {
      this.loading.set(false);
    }
  }

  openEdit(employee: any): void {
    this.editingEmployee.set(employee);
    this.editForm = {
      laptop: employee?.laptop || '',
      issuedPhone: employee?.issuedPhone || '',
      accessBadge: employee?.accessBadge || '',
      headset: employee?.headset || '',
      monitor: employee?.monitor || '',
      keysFob: employee?.keysFob || '',
      equipmentNotes: employee?.equipmentNotes || ''
    };
    this.showEditModal.set(true);
  }

  closeEdit(): void {
    this.showEditModal.set(false);
    this.editingEmployee.set(null);
  }

  async saveEdit(): Promise<void> {
    const employee = this.editingEmployee();
    if (!employee?.id) return;

    this.saving.set(true);
    try {
      await this.http.put(`${this.apiUrl}/api/v1/users/${employee.id}`, {
        laptop: this.editForm.laptop,
        issuedPhone: this.editForm.issuedPhone,
        accessBadge: this.editForm.accessBadge,
        headset: this.editForm.headset,
        monitor: this.editForm.monitor,
        keysFob: this.editForm.keysFob,
        equipmentNotes: this.editForm.equipmentNotes
      }).toPromise();

      this.employees.update((list) =>
        list.map((row) =>
          row.id === employee.id
            ? {
                ...row,
                laptop: this.editForm.laptop,
                issuedPhone: this.editForm.issuedPhone,
                accessBadge: this.editForm.accessBadge,
                headset: this.editForm.headset,
                monitor: this.editForm.monitor,
                keysFob: this.editForm.keysFob,
                equipmentNotes: this.editForm.equipmentNotes
              }
            : row
        )
      );
      this.toast.success(`Updated equipment for ${employee.name}`);
      this.closeEdit();
    } catch (err) {
      console.error('Failed to save office asset assignment:', err);
      this.toast.error('Failed to save equipment assignment');
    } finally {
      this.saving.set(false);
    }
  }
}
