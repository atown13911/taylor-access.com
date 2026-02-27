import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './departments.component.html',
  styleUrls: ['./departments.component.scss']
})
export class DepartmentsComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private baseUrl = environment.apiUrl;
  
  // Check if current user has unrestricted access
  isProductOwner = computed(() => {
    const role = this.authService.currentUser()?.role?.toLowerCase();
    return role === 'product_owner' || role === 'superadmin';
  });

  departments = signal<any[]>([]);
  filteredDepartments = signal<any[]>([]);
  organizations = signal<any[]>([]);
  users = signal<any[]>([]);
  selectedDept = signal<any | null>(null);
  deptEmployees = signal<any[]>([]);
  loadingEmployees = signal(false);
  loading = signal(true);
  showAddModal = signal(false);
  editingDept = signal<any | null>(null);
  saving = signal(false);
  formError = signal('');
  
  selectedOrgId = signal<number | null>(null);

  divisions = signal<any[]>([]);
  
  // Assign employee
  showAssignModal = signal(false);
  assignEmployeeId = signal<number | null>(null);
  assignSearch = signal('');

  availableEmployees = computed(() => {
    const dept = this.selectedDept();
    const deptEmpIds = this.deptEmployees().map(e => e.id);
    let available = this.users().filter(u => !deptEmpIds.includes(u.id) && u.status === 'active');
    // Filter to same organization as the department
    if (dept?.organizationId) {
      available = available.filter(u => Number(u.organizationId) === Number(dept.organizationId));
    }
    return available;
  });

  filteredAvailableEmployees = computed(() => {
    const search = this.assignSearch().toLowerCase().trim();
    if (!search) return this.availableEmployees();
    return this.availableEmployees().filter(u =>
      (u.name || '').toLowerCase().includes(search) ||
      (u.email || '').toLowerCase().includes(search) ||
      (u.role || '').toLowerCase().includes(search) ||
      (u.jobTitle || '').toLowerCase().includes(search)
    );
  });

  formData = {
    name: '',
    description: '',
    code: '',
    managerUserId: null as number | null,
    organizationId: 1,
    divisionId: null as number | null
  };

  // Computed values
  activeEmployeeCount = computed(() => {
    return this.deptEmployees().filter(e => e.status === 'active').length;
  });

  ngOnInit() {
    this.loadOrganizations();
    this.loadDepartments();
    this.loadUsers();
    this.loadDivisions();
  }

  async loadDivisions() {
    try {
      const response: any = await this.http.get(`${this.baseUrl}/api/v1/divisions?limit=500`).toPromise();
      this.divisions.set(response?.data || []);
    } catch { this.divisions.set([]); }
  }

  filteredFormDivisions(): any[] {
    const orgId = this.formData.organizationId;
    if (!orgId) return this.divisions();
    return this.divisions().filter((d: any) => d.organizationId === orgId);
  }

  async loadOrganizations() {
    try {
      const response: any = await this.http.get(`${this.baseUrl}/api/v1/organizations`).toPromise();
      this.organizations.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  }

  async loadDepartments() {
    this.loading.set(true);
    try {
      const orgId = this.selectedOrgId();
      const elevated = this.isProductOwner();
      let url = `${this.baseUrl}/api/v1/departments?pageSize=500`;
      
      if (orgId) {
        url += `&organizationId=${orgId}`;
      }
      // Elevated users need adminReport to see all orgs
      if (elevated) {
        url += `&adminReport=true&includeAll=true`;
      }
      
      const response: any = await this.http.get(url).toPromise();
      this.departments.set(response?.data || []);
      this.filteredDepartments.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load departments:', err);
      this.toast.error('Failed to load departments', 'Error');
    } finally {
      this.loading.set(false);
    }
  }

  filterDepartmentsByOrg() {
    const orgId = this.selectedOrgId();
    if (orgId) {
      const filtered = this.departments().filter(d => Number(d.organizationId) === Number(orgId));
      this.filteredDepartments.set(filtered);
    } else {
      this.filteredDepartments.set(this.departments());
    }
  }

  async onOrgChange() {
    this.closeDashboard();
    await this.loadDepartments();
  }

  refreshData() {
    this.loadDepartments();
    this.loadUsers();
    this.closeDashboard();
  }

  async loadUsers() {
    try {
      const response: any = await this.http.get(`${this.baseUrl}/api/v1/users`).toPromise();
      this.users.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }

  openAddModal() {
    this.editingDept.set(null);
    this.formData = {
      name: '',
      description: '',
      code: '',
      managerUserId: null,
      organizationId: this.selectedOrgId() || 1,
      divisionId: null
    };
    this.formError.set('');
    this.showAddModal.set(true);
  }

  editDepartment(dept: any) {
    this.editingDept.set(dept);
    this.formData = {
      name: dept.name,
      description: dept.description || '',
      code: dept.code || '',
      managerUserId: dept.managerId,
      organizationId: dept.organizationId,
      divisionId: dept.divisionId || null
    };
    this.formError.set('');
    this.showAddModal.set(true);
  }

  closeModal() {
    this.showAddModal.set(false);
    this.editingDept.set(null);
    this.formError.set('');
  }

  async saveDepartment() {
    if (!this.formData.name?.trim()) {
      this.formError.set('Department name is required');
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    try {
      if (this.editingDept()) {
        await this.http.put(`${this.baseUrl}/api/v1/departments/${this.editingDept()!.id}`, this.formData).toPromise();
        this.toast.success('Department updated', 'Success');
      } else {
        await this.http.post(`${this.baseUrl}/api/v1/departments`, this.formData).toPromise();
        this.toast.success('Department created', 'Success');
      }
      this.closeModal();
      this.loadDepartments();
    } catch (err: any) {
      this.formError.set(err.error?.error || err.error?.message || 'Failed to save department');
    } finally {
      this.saving.set(false);
    }
  }

  selectDepartment(dept: any) {
    this.selectedDept.set(dept);
    this.loadDepartmentEmployees(dept.id);
  }

  closeDashboard() {
    this.selectedDept.set(null);
    this.deptEmployees.set([]);
  }

  async loadDepartmentEmployees(deptId: number) {
    this.loadingEmployees.set(true);
    try {
      const response: any = await this.http.get(`${this.baseUrl}/api/v1/departments/${deptId}/employees`).toPromise();
      this.deptEmployees.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      this.loadingEmployees.set(false);
    }
  }

  async deleteDepartment(dept: any) {
    const ok = await this.confirm.show({ message: `Delete department "${dept.name}"? This will unassign all employees.`, type: 'danger', confirmText: 'Delete' });
    if (!ok) return;

    try {
      await this.http.delete(`${this.baseUrl}/api/v1/departments/${dept.id}`).toPromise();
      this.departments.update(list => list.filter(d => d.id !== dept.id));
      this.filteredDepartments.update(list => list.filter(d => d.id !== dept.id));
      if (this.selectedDept()?.id === dept.id) {
        this.closeDashboard();
      }
      this.toast.success('Department deleted', 'Success');
    } catch (err: any) {
      this.toast.error(err.error?.error || 'Failed to delete department', 'Error');
    }
  }

  openAssignModal() {
    this.assignEmployeeId.set(null);
    this.assignSearch.set('');
    this.showAssignModal.set(true);
  }

  async assignEmployee() {
    const empId = this.assignEmployeeId();
    if (empId) this.assignEmployeeById(empId);
  }

  async assignEmployeeById(empId: number) {
    const dept = this.selectedDept();
    if (!dept) return;

    try {
      await this.http.put(`${this.baseUrl}/api/v1/users/${empId}`, { departmentId: dept.id }).toPromise();
      this.loadDepartmentEmployees(dept.id);
      this.loadUsers(); // Refresh available list
      const emp = this.users().find(u => u.id === empId);
      this.toast.success(`${emp?.name || 'Employee'} assigned to ${dept.name}`, 'Assigned');
    } catch (err) {
      console.error('Failed to assign employee:', err);
      this.toast.error('Failed to assign employee', 'Error');
    }
  }

  async unassignEmployee(empId: number) {
    const dept = this.selectedDept();
    if (!dept) return;

    try {
      await this.http.put(`${this.baseUrl}/api/v1/users/${empId}`, { departmentId: 0 }).toPromise();
      this.loadDepartmentEmployees(dept.id);
      this.toast.success('Employee removed from department', 'Success');
    } catch (err) {
      console.error('Failed to unassign employee:', err);
      this.toast.error('Failed to remove employee', 'Error');
    }
  }
}
