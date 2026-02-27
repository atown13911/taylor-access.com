import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-positions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './positions.component.html',
  styleUrls: ['./positions.component.scss']
})
export class PositionsComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private baseUrl = environment.apiUrl;
  
  // Check if current user has elevated access (product_owner or superadmin)
  isProductOwner = computed(() => {
    const role = this.authService.currentUser()?.role?.toLowerCase();
    return role === 'product_owner' || role === 'superadmin';
  });

  positions = signal<any[]>([]);
  filteredPositions = signal<any[]>([]);
  departments = signal<any[]>([]); // All departments (for modal dropdown)
  filteredDepartments = signal<any[]>([]); // Filtered departments (for main filter)
  organizations = signal<any[]>([]);
  loading = signal(true);
  showAddModal = signal(false);
  editingPosition = signal<any | null>(null);
  saving = signal(false);
  formError = signal('');
  showAccessControl = signal(false);
  
  selectedOrgId = signal<number | null>(0);
  selectedDeptId = signal<number | null>(0);

  formData = {
    title: '',
    description: '',
    code: '',
    organizationId: 0,
    divisionId: 0,
    departmentId: 0
  };

  divisions = signal<any[]>([]);
  formDivisions = signal<any[]>([]);
  formFilteredDepts = signal<any[]>([]);

  async loadDivisions() {
    try {
      const res: any = await this.http.get(`${this.baseUrl}/api/v1/divisions?limit=500`).toPromise();
      this.divisions.set(res?.data || []);
    } catch { this.divisions.set([]); }
  }

  onFormOrgChange(orgId: number) {
    this.formData.divisionId = 0;
    this.formData.departmentId = 0;
    if (orgId && orgId > 0) {
      this.formDivisions.set(this.divisions().filter(d => Number(d.organizationId) === Number(orgId)));
      this.formFilteredDepts.set(this.departments().filter(d => Number(d.organizationId) === Number(orgId)));
    } else {
      this.formDivisions.set([]);
      this.formFilteredDepts.set([]);
    }
  }

  async ngOnInit() {
    await this.loadOrganizations();
    await this.loadDepartments();
    await this.loadDivisions();
    await this.loadPositions();
    
    // Auto-show all positions on load
    this.filterDepartmentsByOrg();
    this.filteredPositions.set(this.positions());
  }

  async loadOrganizations() {
    try {
      const response: any = await this.http.get(`${this.baseUrl}/api/v1/organizations`).toPromise();
      this.organizations.set(response?.data || []);
      
      // Auto-select first org
      if (this.organizations().length > 0) {
        this.selectedOrgId.set(this.organizations()[0].id);
        this.filterDepartmentsByOrg();
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  }

  filterDepartmentsByOrg() {
    const orgId = this.selectedOrgId();
    if (orgId && orgId > 0) {
      const filtered = this.departments().filter(d => Number(d.organizationId) === Number(orgId));
      this.filteredDepartments.set(filtered);
    } else {
      // "All Organizations" or no selection -- show all departments
      this.filteredDepartments.set(this.departments());
    }
  }

  filterPositionsByDept() {
    const deptId = this.selectedDeptId();
    if (deptId === 0 || deptId === null) {
      // All Departments -- show all positions (optionally filtered by org)
      const orgId = this.selectedOrgId();
      if (orgId && orgId > 0) {
        const orgDeptIds = this.filteredDepartments().map(d => d.id);
        this.filteredPositions.set(this.positions().filter(p => orgDeptIds.includes(p.departmentId)));
      } else {
        this.filteredPositions.set(this.positions());
      }
    } else {
      this.filteredPositions.set(this.positions().filter(p => Number(p.departmentId) === Number(deptId)));
    }
  }

  async onOrgChange() {
    const orgId = this.selectedOrgId();

    // Reset to "All Departments"
    this.selectedDeptId.set(0);

    // Reload departments for the selected organization
    if (orgId === 0 || !orgId) {
      this.filteredDepartments.set(this.departments());
    } else {
      await this.loadDepartmentsForOrg(orgId);
    }

    // Auto-filter positions AFTER departments are loaded
    this.filterPositionsByDept();
  }

  onDeptChange() {
    this.filterPositionsByDept();
  }

  async loadDepartmentsForOrg(orgId: number) {
    try {
      let url = `${this.baseUrl}/api/v1/departments?organizationId=${orgId}&pageSize=500`;
      if (this.isProductOwner()) {
        url += '&adminReport=true&includeAll=true';
      }
      const response: any = await this.http.get(url).toPromise();
      this.filteredDepartments.set(response?.data || []);
    } catch {
      this.filteredDepartments.set([]);
    }
  }

  async loadPositions() {
    this.loading.set(true);
    try {
      // Elevated users get all positions across orgs
      const params = this.isProductOwner() ? '?adminReport=true&includeAll=true&pageSize=500' : '?pageSize=500';
      const response: any = await this.http.get(`${this.baseUrl}/api/v1/positions${params}`).toPromise();
      this.positions.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load positions:', err);
      this.toast.error('Failed to load positions', 'Error');
    } finally {
      this.loading.set(false);
    }
  }

  async loadDepartments() {
    try {
      let url = `${this.baseUrl}/api/v1/departments?pageSize=500`;
      if (this.isProductOwner()) {
        url += '&adminReport=true&includeAll=true';
      }
      const response: any = await this.http.get(url).toPromise();
      this.departments.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load departments:', err);
      this.departments.set([]);
    }
  }

  async openAddModal() {
    this.editingPosition.set(null);

    const orgId = this.selectedOrgId() || 0;
    const deptId = this.selectedDeptId();
    const firstFiltered = this.filteredDepartments()[0]?.id || 0;

    this.formData = {
      title: '',
      description: '',
      code: '',
      organizationId: orgId,
      divisionId: 0,
      departmentId: (deptId && deptId > 0) ? deptId : firstFiltered
    };
    this.onFormOrgChange(orgId);
    this.formError.set('');
    this.showAddModal.set(true);
  }

  editPosition(position: any) {
    this.editingPosition.set(position);
    const dept = this.departments().find(d => d.id === position.departmentId);
    const orgId = dept?.organizationId || position.organizationId || 0;
    this.formData = {
      title: position.title,
      description: position.description || '',
      code: position.code || '',
      organizationId: orgId,
      divisionId: position.divisionId || 0,
      departmentId: position.departmentId
    };
    this.onFormOrgChange(orgId);
    this.formError.set('');
    this.showAddModal.set(true);
  }

  closeModal() {
    this.showAddModal.set(false);
    this.editingPosition.set(null);
    this.formError.set('');

    // Restore filtered departments
    const orgId = this.selectedOrgId();
    if (orgId && orgId !== 0) {
      this.loadDepartmentsForOrg(orgId);
    } else if (orgId === 0) {
      // All Organizations - use full list
      this.filteredDepartments.set(this.departments());
    }
  }

  async savePosition() {
    if (!this.formData.title?.trim()) {
      this.formError.set('Position title is required');
      return;
    }

    if (!this.formData.departmentId) {
      this.formError.set('Department is required');
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    try {
      if (this.editingPosition()) {
        await this.http.put(`${this.baseUrl}/api/v1/positions/${this.editingPosition()!.id}`, this.formData).toPromise();
        this.toast.success('Position updated', 'Success');
      } else {
        await this.http.post(`${this.baseUrl}/api/v1/positions`, this.formData).toPromise();
        this.toast.success('Position created', 'Success');
      }
      this.closeModal();
      await this.loadPositions();
      
      // Re-filter positions by currently selected department
      console.log('[Positions] Position saved, re-filtering by dept:', this.selectedDeptId());
      this.filterPositionsByDept();
    } catch (err: any) {
      this.formError.set(err.error?.error || err.error?.message || 'Failed to save position');
    } finally {
      this.saving.set(false);
    }
  }

  async deletePosition(position: any) {
    const ok = await this.confirm.show({ message: `Delete position "${position.title}"?`, type: 'danger', confirmText: 'Delete' });
    if (!ok) return;

    try {
      await this.http.delete(`${this.baseUrl}/api/v1/positions/${position.id}`).toPromise();
      this.positions.update(list => list.filter(p => p.id !== position.id));
      this.filterPositionsByDept();
      this.toast.success('Position deleted', 'Success');
    } catch (err: any) {
      this.toast.error(err.error?.error || 'Failed to delete position', 'Error');
    }
  }
  
  async refreshData() {
    console.log('[Positions] Manual refresh triggered');
    const orgId = this.selectedOrgId();
    const deptId = this.selectedDeptId();
    
    // Reload departments for current organization
    if (orgId) {
      await this.loadDepartmentsForOrg(orgId);
    }
    
    // Reload all positions
    await this.loadPositions();
    
    // Re-filter by current department
    if (deptId) {
      this.filterPositionsByDept();
    }
    
    this.toast.success('Data refreshed', 'Success');
  }
}
