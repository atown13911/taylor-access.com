import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { ConfirmService } from '../../../core/services/confirm.service';

type OfficeTab = 'inventory' | 'computers' | 'phones' | 'access';
type AssignFilter = '' | 'assigned' | 'unassigned';
type InventoryType = 'computer' | 'phone' | 'monitor' | 'headset' | 'badge' | 'keys';

interface InventoryItem {
  id: number;
  organizationId: number;
  assetType: InventoryType | string;
  assetTag: string;
  label?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  status: string;
  assignedUserId?: number | null;
  assignedUserName?: string | null;
  notes?: string | null;
  displayName?: string;
}

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
  private confirm = inject(ConfirmService);
  private apiUrl = environment.apiUrl;

  activeTab = signal<OfficeTab>('computers');
  loading = signal(false);
  inventoryLoading = signal(false);
  saving = signal(false);
  employees = signal<any[]>([]);
  inventory = signal<InventoryItem[]>([]);
  searchTerm = signal('');
  assignFilter = signal<AssignFilter>('');
  inventoryTypeFilter = signal<'' | InventoryType>('');

  showEditModal = signal(false);
  editingEmployee = signal<any | null>(null);
  editForm = {
    computerId: null as number | null,
    phoneId: null as number | null,
    monitorId: null as number | null,
    headsetId: null as number | null,
    badgeId: null as number | null,
    keysId: null as number | null,
    equipmentNotes: ''
  };

  showInventoryModal = signal(false);
  editingInventory = signal<InventoryItem | null>(null);
  inventoryForm = {
    assetType: 'computer' as InventoryType,
    assetTag: '',
    label: '',
    make: '',
    model: '',
    serialNumber: '',
    notes: '',
    status: 'available'
  };

  readonly inventoryTypes: { value: InventoryType; label: string }[] = [
    { value: 'computer', label: 'Computer' },
    { value: 'phone', label: 'Phone' },
    { value: 'monitor', label: 'Monitor' },
    { value: 'headset', label: 'Headset' },
    { value: 'badge', label: 'Access Badge' },
    { value: 'keys', label: 'Keys / Fob' }
  ];

  filteredRows = computed(() => {
    const tab = this.activeTab();
    if (tab === 'inventory') return [];
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

  filteredInventory = computed(() => {
    const type = this.inventoryTypeFilter();
    const search = this.searchTerm().trim().toLowerCase();
    let rows = [...this.inventory()];
    if (type) rows = rows.filter((i) => i.assetType === type);
    if (search) {
      rows = rows.filter((i) => {
        const blob = [
          i.assetTag, i.label, i.make, i.model, i.serialNumber, i.displayName, i.assignedUserName, i.notes, i.status
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        return blob.includes(search);
      });
    }
    return rows;
  });

  stats = computed(() => {
    const list = this.employees().filter((e: any) => String(e?.status || '').toLowerCase() !== 'terminated');
    const inv = this.inventory().filter((i) => i.status !== 'retired');
    const computers = inv.filter((i) => i.assetType === 'computer');
    const phones = inv.filter((i) => i.assetType === 'phone');
    const badges = inv.filter((i) => i.assetType === 'badge');
    const issuedComputers = computers.filter((i) => i.status === 'assigned' || !!i.assignedUserId).length;
    const issuedPhones = phones.filter((i) => i.status === 'assigned' || !!i.assignedUserId).length;
    const issuedBadges = badges.filter((i) => i.status === 'assigned' || !!i.assignedUserId).length;
    const available = inv.filter((i) => i.status === 'available' && !i.assignedUserId).length;
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

    return [
      {
        key: 'inventory' as const,
        label: 'Inventory',
        value: inv.length,
        icon: 'bx-package',
        tone: 'cyan',
        badge: 'Stock',
        meter: 100,
        chip: `${available} available`,
        soft: `${inv.length - available} assigned`
      },
      {
        key: 'computers' as const,
        label: 'Computers Issued',
        value: issuedComputers,
        icon: 'bx-laptop',
        tone: issuedComputers ? 'green' : 'orange',
        badge: computers.length ? 'Fleet' : 'Open',
        meter: pct(issuedComputers, computers.length || 1),
        chip: `${computers.length} in stock`,
        soft: `${Math.max(0, computers.length - issuedComputers)} free`
      },
      {
        key: 'phones' as const,
        label: 'Phones Issued',
        value: issuedPhones,
        icon: 'bx-mobile-alt',
        tone: issuedPhones ? 'violet' : 'orange',
        badge: phones.length ? 'Fleet' : 'Open',
        meter: pct(issuedPhones, phones.length || 1),
        chip: `${phones.length} in stock`,
        soft: `${Math.max(0, phones.length - issuedPhones)} free`
      },
      {
        key: 'access' as const,
        label: 'Badges Issued',
        value: issuedBadges,
        icon: 'bx-id-card',
        tone: issuedBadges ? 'green' : 'slate',
        badge: badges.length ? 'Fleet' : 'Open',
        meter: pct(issuedBadges, badges.length || 1),
        chip: `${badges.length} in stock`,
        soft: `${list.length} employees`
      }
    ];
  });

  onStatClick(key: 'inventory' | 'computers' | 'phones' | 'access'): void {
    this.selectTab(key);
    if (key === 'inventory') {
      this.assignFilter.set('');
      return;
    }
    this.assignFilter.set('assigned');
  }

  ngOnInit(): void {
    void this.refreshAll();
  }

  async refreshAll(): Promise<void> {
    await Promise.all([this.loadEmployees(), this.loadInventory()]);
  }

  selectTab(tab: OfficeTab): void {
    this.activeTab.set(tab);
    this.assignFilter.set('');
    if (tab !== 'inventory') this.inventoryTypeFilter.set('');
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

  typeLabel(type: string): string {
    return this.inventoryTypes.find((t) => t.value === type)?.label || type;
  }

  optionsFor(type: InventoryType, selectedId: number | null): InventoryItem[] {
    const employeeId = this.editingEmployee()?.id;
    return this.inventory()
      .filter((i) => i.assetType === type)
      .filter((i) => {
        if (selectedId && i.id === selectedId) return true;
        if (i.status === 'retired') return false;
        if (!i.assignedUserId) return true;
        return employeeId != null && Number(i.assignedUserId) === Number(employeeId);
      })
      .sort((a, b) => String(a.displayName || a.assetTag).localeCompare(String(b.displayName || b.assetTag)));
  }

  findAssignedId(userId: number, type: InventoryType): number | null {
    const match = this.inventory().find(
      (i) => i.assetType === type && Number(i.assignedUserId) === Number(userId)
    );
    return match?.id ?? null;
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

  async loadInventory(): Promise<void> {
    this.inventoryLoading.set(true);
    try {
      const url = this.orgContext.addOrgParam(`${this.apiUrl}/api/v1/office-inventory?limit=2000`);
      const res: any = await this.http.get(url).toPromise();
      this.inventory.set(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load office inventory:', err);
      this.inventory.set([]);
    } finally {
      this.inventoryLoading.set(false);
    }
  }

  openEdit(employee: any): void {
    this.editingEmployee.set(employee);
    this.editForm = {
      computerId: this.findAssignedId(employee.id, 'computer'),
      phoneId: this.findAssignedId(employee.id, 'phone'),
      monitorId: this.findAssignedId(employee.id, 'monitor'),
      headsetId: this.findAssignedId(employee.id, 'headset'),
      badgeId: this.findAssignedId(employee.id, 'badge'),
      keysId: this.findAssignedId(employee.id, 'keys'),
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
      const res: any = await this.http.post(`${this.apiUrl}/api/v1/office-inventory/assign`, {
        userId: employee.id,
        computerId: this.editForm.computerId || null,
        phoneId: this.editForm.phoneId || null,
        monitorId: this.editForm.monitorId || null,
        headsetId: this.editForm.headsetId || null,
        badgeId: this.editForm.badgeId || null,
        keysId: this.editForm.keysId || null,
        equipmentNotes: this.editForm.equipmentNotes
      }).toPromise();

      const data = res?.data || {};
      this.employees.update((list) =>
        list.map((row) =>
          row.id === employee.id
            ? {
                ...row,
                laptop: data.laptop ?? null,
                issuedPhone: data.issuedPhone ?? null,
                accessBadge: data.accessBadge ?? null,
                headset: data.headset ?? null,
                monitor: data.monitor ?? null,
                keysFob: data.keysFob ?? null,
                equipmentNotes: data.equipmentNotes ?? null
              }
            : row
        )
      );
      await this.loadInventory();
      this.toast.success(`Updated equipment for ${employee.name}`);
      this.closeEdit();
    } catch (err: any) {
      console.error('Failed to save office asset assignment:', err);
      this.toast.error(err?.error?.error || 'Failed to save equipment assignment');
    } finally {
      this.saving.set(false);
    }
  }

  openInventoryModal(item?: InventoryItem): void {
    this.editingInventory.set(item || null);
    this.inventoryForm = {
      assetType: (item?.assetType as InventoryType) || 'computer',
      assetTag: item?.assetTag || '',
      label: item?.label || '',
      make: item?.make || '',
      model: item?.model || '',
      serialNumber: item?.serialNumber || '',
      notes: item?.notes || '',
      status: item?.status || 'available'
    };
    this.showInventoryModal.set(true);
  }

  closeInventoryModal(): void {
    this.showInventoryModal.set(false);
    this.editingInventory.set(null);
  }

  async saveInventory(): Promise<void> {
    if (!this.inventoryForm.assetTag.trim()) {
      this.toast.error('Asset tag is required');
      return;
    }

    this.saving.set(true);
    try {
      const payload = {
        assetType: this.inventoryForm.assetType,
        assetTag: this.inventoryForm.assetTag.trim(),
        label: this.inventoryForm.label.trim(),
        make: this.inventoryForm.make.trim(),
        model: this.inventoryForm.model.trim(),
        serialNumber: this.inventoryForm.serialNumber.trim(),
        notes: this.inventoryForm.notes.trim(),
        status: this.inventoryForm.status
      };
      const existing = this.editingInventory();
      if (existing?.id) {
        await this.http.put(`${this.apiUrl}/api/v1/office-inventory/${existing.id}`, payload).toPromise();
        this.toast.success('Inventory item updated');
      } else {
        await this.http.post(`${this.apiUrl}/api/v1/office-inventory`, payload).toPromise();
        this.toast.success('Inventory item added');
      }
      this.closeInventoryModal();
      await this.loadInventory();
    } catch (err: any) {
      console.error('Failed to save inventory item:', err);
      this.toast.error(err?.error?.error || 'Failed to save inventory item');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteInventory(item: InventoryItem): Promise<void> {
    const ok = await this.confirm.show({
      message: `Remove ${item.displayName || item.assetTag} from inventory?`,
      type: 'danger',
      confirmText: 'Delete'
    });
    if (!ok) return;

    try {
      await this.http.delete(`${this.apiUrl}/api/v1/office-inventory/${item.id}`).toPromise();
      this.toast.success('Inventory item deleted');
      await this.loadInventory();
    } catch (err: any) {
      this.toast.error(err?.error?.error || 'Failed to delete inventory item');
    }
  }
}
