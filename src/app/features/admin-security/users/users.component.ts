import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { AdminService, Role } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
// import { PhoneInputComponent } from '../../../shared/components/phone-input.component'; // Replaced with simple text input
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { environment } from '../../../../environments/environment';

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  role?: string;
  roleId?: string;
  organizationId?: string;
  organizationIds?: number[]; // Multi-organization assignments
  organizationName?: string;
  lastLoginAt?: string;
  createdAt: string;
  twoFactorEnabled?: boolean;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  private api = inject(VanTacApiService);
  private http = inject(HttpClient);
  private adminService = inject(AdminService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private orgContext = inject(OrganizationContextService);
  private confirm = inject(ConfirmService);
  
  // Check if current user has elevated access
  isProductOwner = computed(() => {
    const role = this.authService.currentUser()?.role?.toLowerCase();
    return role === 'product_owner' || role === 'superadmin';
  });

  users = signal<User[]>([]);
  filteredUsers = signal<User[]>([]);
  roles = signal<Role[]>([]);
  organizations = signal<any[]>([]);
  departments = signal<any[]>([]);
  satellites = signal<any[]>([]);
  agencies = signal<any[]>([]);
  terminals = signal<any[]>([]);
  loading = signal(false);
  showAddModal = signal(false);
  editingUser = signal<User | null>(null);
  saving = signal(false);
  formError = signal('');
  
  // Password set modal
  showPasswordModal = signal(false);
  passwordResetUser = signal<User | null>(null);
  newPassword = signal('');
  passwordError = signal('');
  
  // Entity selection modals
  showSatelliteModal = signal(false);
  showAgencyModal = signal(false);
  showTerminalModal = signal(false);

  // Multi-organization access
  orgAccessMode = signal<'single' | 'multiple'>('single');
  selectedOrgIds = signal<number[]>([]);
  selectedOrgCount = computed(() => this.selectedOrgIds().length);
  allOrgsSelected = computed(() => 
    this.selectedOrgIds().length === this.organizations().length && this.organizations().length > 0
  );

  Math = Math;
  activeTab = signal<'live' | 'inactive' | 'archived' | 'database' | 'logs'>('live');
  
  // Audit logs
  auditLogs = signal<any[]>([]);
  auditLoading = signal(false);
  loginHistory = signal<any[]>([]);
  selectedUserActivity = signal<any[] | null>(null);
  selectedActivityUser = signal<string>('');
  activityLoading = signal(false);
  logSearch = signal('');
  logActionFilter = signal<string>('');
  logUserFilter = signal<string>('');
  logPage = signal(1);
  logsPerPage = 25;
  searchTerm = '';
  statusFilter = '';
  roleFilter = '';
  orgFilter = '';

  liveUsers = computed(() => this.users().filter(u => u.status === 'active' || u.status === 'pending'));
  inactiveUsers = computed(() => this.users().filter(u => u.status === 'inactive'));
  archivedUsers = computed(() => this.users().filter(u => u.status === 'archived'));

  formData = {
    name: '',
    email: '',
    personalEmail: '',
    phone: '',
    roleId: '',
    organizationId: '',
    departmentId: null as number | null,
    satelliteId: null as number | null,
    agencyId: null as number | null,
    terminalId: null as number | null,
    jobTitle: '',
    zoomEmail: '',
    password: '',
    status: 'active'
  };

  // Multiple phone numbers with country code and type
  phoneEntries: { id: number; type: string; countryCode: string; number: string }[] = [
    { id: 0, type: 'cell', countryCode: '+1', number: '' }
  ];

  readonly phoneTypes = ['cell', 'work', 'home', 'fax', 'other'];
  readonly countryCodes = [
    { code: '+1', label: 'US/CA +1' },
    { code: '+44', label: 'UK +44' },
    { code: '+387', label: 'BA +387' },
    { code: '+49', label: 'DE +49' },
    { code: '+33', label: 'FR +33' },
    { code: '+52', label: 'MX +52' },
    { code: '+91', label: 'IN +91' },
    { code: '+86', label: 'CN +86' },
    { code: '+61', label: 'AU +61' },
    { code: '+55', label: 'BR +55' },
    { code: '+7', label: 'RU +7' },
    { code: '+81', label: 'JP +81' },
    { code: '+82', label: 'KR +82' },
    { code: '+234', label: 'NG +234' },
    { code: '+27', label: 'ZA +27' },
    { code: '+971', label: 'AE +971' }
  ];

  addPhoneEntry(): void {
    this.phoneEntries = [...this.phoneEntries, { id: ++this.phoneIdCounter, type: 'work', countryCode: '+1', number: '' }];
  }

  removePhoneEntry(index: number): void {
    this.phoneEntries = this.phoneEntries.filter((_, i) => i !== index);
  }

  updatePhoneEntry(index: number, field: string, value: string): void {
    this.phoneEntries = this.phoneEntries.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry
    );
  }

  /** Combine phone entries into a formatted string for storage */
  getPhoneString(): string {
    return this.phoneEntries
      .filter(p => p.number.trim())
      .map(p => `${p.type}: ${p.countryCode} ${p.number}`)
      .join(' | ');
  }

  private phoneIdCounter = 0;

  /** Parse stored phone string back into entries */
  parsePhoneEntries(phone: string): { id: number; type: string; countryCode: string; number: string }[] {
    if (!phone) return [{ id: ++this.phoneIdCounter, type: 'cell', countryCode: '+1', number: '' }];
    const parts = phone.split(' | ');
    const entries = parts.map(part => {
      const colonIdx = part.indexOf(':');
      if (colonIdx < 0) return { id: ++this.phoneIdCounter, type: 'cell', countryCode: '+1', number: part.trim() };
      const type = part.substring(0, colonIdx).trim().toLowerCase();
      const rest = part.substring(colonIdx + 1).trim();
      const ccMatch = rest.match(/^(\+\d{1,4})\s*(.*)/);
      if (ccMatch) return { id: ++this.phoneIdCounter, type, countryCode: ccMatch[1], number: ccMatch[2] };
      return { id: ++this.phoneIdCounter, type, countryCode: '+1', number: rest };
    });
    return entries.length > 0 ? entries : [{ id: ++this.phoneIdCounter, type: 'cell', countryCode: '+1', number: '' }];
  }

  activeCount = computed(() => this.users().filter(u => u.status === 'active').length);
  inactiveCount = computed(() => this.users().filter(u => u.status === 'inactive').length);
  pendingCount = computed(() => this.users().filter(u => u.status === 'pending').length);
  twoFactorCount = computed(() => this.users().filter(u => u.twoFactorEnabled).length);

  ngOnInit(): void {
    this.loadUsers();
    this.loadRoles();
    this.loadOrganizations();
    this.loadDepartments();
    this.loadSatellites();
    this.loadAgencies();
    this.loadTerminals();
  }

  // Multi-organization access methods
  setOrgAccessMode(mode: 'single' | 'multiple'): void {
    this.orgAccessMode.set(mode);
    
    if (mode === 'single') {
      // Clear multiple selections, keep only primary
      if (this.formData.organizationId) {
        this.selectedOrgIds.set([parseInt(this.formData.organizationId)]);
      } else {
        this.selectedOrgIds.set([]);
      }
    } else {
      // Initialize with current organization
      if (this.formData.organizationId) {
        this.selectedOrgIds.set([parseInt(this.formData.organizationId)]);
      }
    }
  }

  isOrgSelected(orgId: number): boolean {
    return this.selectedOrgIds().includes(orgId);
  }

  // Departments filtered by selected org(s)
  filteredModalDepartments = computed(() => {
    const ids = this.selectedOrgIds();
    if (!ids.length) return this.departments();
    return this.departments().filter(d => ids.includes(Number(d.organizationId)));
  });

  toggleOrganization(orgId: number, event: any): void {
    const checked = event.target.checked;
    
    if (checked) {
      this.selectedOrgIds.update(ids => [...ids, orgId]);
      if (!this.formData.organizationId) {
        this.formData.organizationId = orgId.toString();
      }
    } else {
      this.selectedOrgIds.update(ids => ids.filter(id => id !== orgId));
      if (this.formData.organizationId === orgId.toString()) {
        const remaining = this.selectedOrgIds().filter(id => id !== orgId);
        this.formData.organizationId = remaining.length > 0 ? remaining[0].toString() : '';
      }
    }

    // Reload departments for all selected orgs
    this.reloadDepartmentsForSelectedOrgs();

    // Clear department if it no longer belongs to a selected org
    if (this.formData.departmentId) {
      const valid = this.filteredModalDepartments().some(d => d.id === this.formData.departmentId);
      if (!valid) this.formData.departmentId = null;
    }
  }

  async reloadDepartmentsForSelectedOrgs() {
    const ids = this.selectedOrgIds();
    if (ids.length === 0) {
      this.loadDepartments();
      return;
    }
    // Load departments for all selected orgs
    try {
      const promises = ids.map(id =>
        this.http.get<any>(`${environment.apiUrl}/api/v1/departments?organizationId=${id}`).toPromise()
      );
      const results = await Promise.all(promises);
      const allDepts = results.flatMap(r => r?.data || []);
      this.departments.set(allDepts);
    } catch {
      this.departments.set([]);
    }
  }

  toggleAllOrganizations(event: any): void {
    const checked = event.target.checked;
    
    if (checked) {
      const allIds = this.organizations().map(o => o.id);
      this.selectedOrgIds.set(allIds);
      if (!this.formData.organizationId && allIds.length > 0) {
        this.formData.organizationId = allIds[0].toString();
      }
    } else {
      this.selectedOrgIds.set([]);
      this.formData.organizationId = '';
    }
    this.reloadDepartmentsForSelectedOrgs();
  }

  setPrimaryOrganization(orgId: number): void {
    this.formData.organizationId = orgId.toString();
    this.toast.success(`Set ${this.organizations().find(o => o.id === orgId)?.name} as primary`, 'Primary Organization');
  }
  
  onOrganizationChange(orgId: string): void {
    // Update selectedOrgIds for single-org mode so filteredModalDepartments works
    if (orgId) {
      this.selectedOrgIds.set([parseInt(orgId)]);
      this.loadDepartments(orgId);
      this.loadSatellites(orgId);
      this.loadAgencies(orgId);
      this.loadTerminals(orgId);

      this.formData.departmentId = null;
      this.formData.satelliteId = null;
      this.formData.agencyId = null;
      this.formData.terminalId = null;
    } else {
      this.selectedOrgIds.set([]);
      this.loadDepartments();
      this.loadSatellites();
      this.loadAgencies();
      this.loadTerminals();
    }
  }

  async loadUsers() {
    this.loading.set(true);
    try {
      // Use organization context to filter users
      const url = this.orgContext.addOrgParam(`${environment.apiUrl}/api/v1/users`);
      const separator = url.includes('?') ? '&' : '?';
      const response: any = await this.http.get(`${url}${separator}pageSize=5000`).toPromise();
      const userData = response?.data || response || [];
      this.users.set(userData);
      this.applyFilters();
    } catch (err: any) {
      console.error('Failed to load users:', err);
      this.toast.error('Failed to load users. Please try again.', 'Error');
    } finally {
      this.loading.set(false);
    }
  }

  async loadRoles() {
    try {
      const response = await this.adminService.getRoles().toPromise();
      let rolesList = response?.data || [];
      
      // SECURITY: Filter out product_owner and superadmin roles for non-product-owners
      if (!this.isProductOwner()) {
        rolesList = rolesList.filter((r: any) => 
          r.name !== 'product_owner' && r.name !== 'superadmin'
        );
      }
      
      this.roles.set(rolesList);
    } catch (err) {
      console.error('Failed to load roles:', err);
    }
  }

  async loadOrganizations() {
    try {
      const response: any = await this.api.getOrganizations().toPromise();
      this.organizations.set(response?.data || response || []);
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  }

  async loadDepartments(organizationId?: string) {
    try {
      const url = organizationId 
        ? `${environment.apiUrl}/api/v1/departments?organizationId=${organizationId}`
        : `${environment.apiUrl}/api/v1/departments`;
      const response: any = await this.http.get(url).toPromise();
      this.departments.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load departments:', err);
      this.departments.set([]);
    }
  }

  async loadSatellites(organizationId?: string) {
    try {
      const params = organizationId 
        ? `pageSize=100&organizationId=${organizationId}`
        : `pageSize=100`;
      const response: any = await this.http.get(`${environment.apiUrl}/api/v1/satellites?${params}`).toPromise();
      this.satellites.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load satellites:', err);
      this.satellites.set([]);
    }
  }

  async loadAgencies(organizationId?: string) {
    try {
      const params = organizationId 
        ? `pageSize=100&organizationId=${organizationId}`
        : `pageSize=100`;
      const response: any = await this.http.get(`${environment.apiUrl}/api/v1/agencies?${params}`).toPromise();
      this.agencies.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load agencies:', err);
      this.agencies.set([]);
    }
  }

  async loadTerminals(organizationId?: string) {
    try {
      const params = organizationId 
        ? `pageSize=100&organizationId=${organizationId}`
        : `pageSize=100`;
      const response: any = await this.http.get(`${environment.apiUrl}/api/v1/terminals?${params}`).toPromise();
      this.terminals.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load terminals:', err);
      this.terminals.set([]);
    }
  }

  switchTab(tab: 'live' | 'inactive' | 'archived' | 'database' | 'logs') {
    this.activeTab.set(tab);
    if (tab === 'logs') {
      this.loadAuditLogs();
    } else {
      this.applyFilters();
    }
  }

  applyFilters() {
    let filtered: User[];
    switch (this.activeTab()) {
      case 'inactive': filtered = [...this.inactiveUsers()]; break;
      case 'archived': filtered = [...this.archivedUsers()]; break;
      case 'database': filtered = [...this.users()]; break;
      default: filtered = [...this.liveUsers()]; break;
    }

    if (this.orgFilter) {
      // Compare as strings since dropdown value is string
      filtered = filtered.filter(u => String(u.organizationId) === String(this.orgFilter));
    }

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(u =>
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
      );
    }

    if (this.statusFilter) {
      filtered = filtered.filter(u => u.status === this.statusFilter);
    }

    if (this.roleFilter) {
      // Get the role name from the selected roleId
      const selectedRole = this.roles().find(r => String(r.id) === String(this.roleFilter));
      const roleName = selectedRole?.name;
      
      if (roleName) {
        // Filter by role name (case-insensitive)
        filtered = filtered.filter(u => u.role?.toLowerCase() === roleName.toLowerCase());
      }
    }

    this.filteredUsers.set(filtered);
  }

  refreshData() {
    this.loadUsers();
    this.loadRoles();
  }

  isOnline(user: any): boolean {
    if (!user.lastLoginAt) return false;
    const diff = Date.now() - new Date(user.lastLoginAt).getTime();
    return diff < 15 * 60 * 1000;
  }

  isRecent(user: any): boolean {
    if (!user.lastLoginAt) return false;
    const diff = Date.now() - new Date(user.lastLoginAt).getTime();
    return diff >= 15 * 60 * 1000 && diff < 24 * 60 * 60 * 1000;
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  editUser(user: User) {
    this.editingUser.set(user);
    
    // Find roleId from role name (API returns role name, not roleId)
    // Try exact match first, then try matching by lowercase
    const allRoles = this.roles();
    let matchingRole = allRoles.find(r => r.name === user.role);
    if (!matchingRole) matchingRole = allRoles.find(r => r.name?.toLowerCase() === user.role?.toLowerCase());
    // Fallback: try matching role id directly
    if (!matchingRole && user.roleId) matchingRole = allRoles.find(r => String(r.id) === String(user.roleId));
    
    // Check if user has multiple organization assignments
    const userOrgIds = (user as any).organizationIds || [];
    const hasMultipleOrgs = Array.isArray(userOrgIds) && userOrgIds.length > 1;
    
    // Set organization access mode based on user's current setup
    if (hasMultipleOrgs) {
      this.orgAccessMode.set('multiple');
      this.selectedOrgIds.set([...userOrgIds]);
    } else {
      this.orgAccessMode.set('single');
      this.selectedOrgIds.set(user.organizationId ? [parseInt(user.organizationId as any)] : []);
    }
    
    this.phoneEntries = this.parsePhoneEntries(user.phone || '');
    
    // Match role by name (case-insensitive) -- API returns role name, form uses roleId
    const roleId = matchingRole?.id || user.roleId || '';
    
    this.formData = {
      name: user.name,
      email: user.email,
      personalEmail: (user as any).personalEmail || '',
      phone: user.phone || '',
      roleId: roleId ? String(roleId) : '',
      organizationId: user.organizationId ? String(user.organizationId) : '',
      departmentId: (user as any).departmentId || null,
      satelliteId: (user as any).satelliteId || null,
      agencyId: (user as any).agencyId || null,
      terminalId: (user as any).terminalId || null,
      jobTitle: (user as any).jobTitle || '',
      zoomEmail: (user as any).zoomEmail || '',
      password: '',
      status: user.status
    };
    
    // Reload departments/entities for selected orgs so dropdowns populate
    if (hasMultipleOrgs) {
      this.reloadDepartmentsForSelectedOrgs();
    } else if (user.organizationId) {
      const orgId = String(user.organizationId);
      this.loadDepartments(orgId);
      this.loadSatellites(orgId);
      this.loadAgencies(orgId);
      this.loadTerminals(orgId);
    }
    
    this.showAddModal.set(true);
  }

  openSetPasswordModal(user: User) {
    this.passwordResetUser.set(user);
    this.newPassword.set('');
    this.passwordError.set('');
    this.showPasswordModal.set(true);
  }
  
  closePasswordModal() {
    this.showPasswordModal.set(false);
    this.passwordResetUser.set(null);
    this.newPassword.set('');
    this.passwordError.set('');
  }
  
  async setPassword() {
    const password = this.newPassword();
    if (!password || password.length < 8) {
      this.passwordError.set('Password must be at least 8 characters');
      return;
    }
    
    const user = this.passwordResetUser();
    if (!user) return;
    
    try {
      // Call backend to set password directly
      await this.http.put(`${environment.apiUrl}/api/v1/users/${user.id}/set-password`, { password }).toPromise();
      this.toast.success(`Password updated for ${user.name}`, 'Success');
      this.closePasswordModal();
    } catch (err: any) {
      this.passwordError.set(err.error?.message || 'Failed to set password');
    }
  }
  
  async resetPassword(user: User) {
    const ok = await this.confirm.show({ message: `Send password reset email to ${user.email}?`, type: 'champagne' });
    if (!ok) return;
    try {
      await this.api.requestPasswordReset(user.email).toPromise();
      this.toast.success('Password reset email sent successfully', 'Email Sent');
    } catch (err) {
      console.error('Failed to send reset email:', err);
      this.toast.error('Failed to send password reset email', 'Error');
    }
  }
  
  // Entity selection modals
  selectSatellite(satelliteId: number | null) {
    this.formData.satelliteId = satelliteId;
    if (satelliteId) {
      this.formData.agencyId = null; // Clear agency
      this.formData.terminalId = null; // Clear terminal
    }
    this.showSatelliteModal.set(false);
  }
  
  selectAgency(agencyId: number | null) {
    this.formData.agencyId = agencyId;
    if (agencyId) {
      this.formData.satelliteId = null; // Clear satellite
      this.formData.terminalId = null; // Clear terminal
    }
    this.showAgencyModal.set(false);
  }
  
  selectTerminal(terminalId: number | null) {
    this.formData.terminalId = terminalId;
    if (terminalId) {
      this.formData.satelliteId = null; // Clear satellite
      this.formData.agencyId = null; // Clear agency
    }
    this.showTerminalModal.set(false);
  }
  
  getSelectedSatelliteName(): string {
    return this.satellites().find(s => s.id === this.formData.satelliteId)?.name || 'Corporate (No Satellite)';
  }
  
  getSelectedAgencyName(): string {
    return this.agencies().find(a => a.id === this.formData.agencyId)?.name || 'No Agency';
  }
  
  getSelectedTerminalName(): string {
    return this.terminals().find(t => t.id === this.formData.terminalId)?.name || 'No Terminal';
  }

  async toggleStatus(user: User) {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      await this.api.updateUser(user.id, { status: newStatus }).toPromise();
      this.users.update(list =>
        list.map(u => u.id === user.id ? { ...u, status: newStatus } : u)
      );
      this.applyFilters();
      if (newStatus === 'inactive') {
        this.toast.champagne(`${user.name} has been deactivated`);
      } else {
        this.toast.success(`${user.name} has been activated`);
      }
    } catch (err) {
      console.error('Failed to update user status:', err);
      this.toast.error('Failed to update user status');
    }
  }

  async deleteUser(user: User) {
    const ok = await this.confirm.show({
      message: `Permanently delete "${user.name}"? This action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete'
    });
    if (!ok) return;
    try {
      await this.api.deleteUser(user.id).toPromise();
      this.users.update(list => list.filter(u => u.id !== user.id));
      this.applyFilters();
      this.toast.success(`${user.name} has been deleted`);
    } catch (err) {
      console.error('Failed to delete user:', err);
      this.toast.error('Failed to delete user');
    }
  }

  async archiveUser(user: User) {
    const ok = await this.confirm.show({ message: `Archive user "${user.name}"? They will be moved to the Archived tab.`, type: 'info', confirmText: 'Archive' });
    if (!ok) return;
    try {
      await this.api.updateUser(user.id, { status: 'archived' }).toPromise();
      this.users.update(list => list.map(u => u.id === user.id ? { ...u, status: 'archived' } : u));
      this.applyFilters();
      this.toast.success(`User "${user.name}" archived`, 'Archived');
    } catch (err) {
      console.error('Failed to archive user:', err);
      this.toast.error('Failed to archive user', 'Error');
    }
  }

  async restoreUser(user: User) {
    try {
      await this.api.updateUser(user.id, { status: 'active' }).toPromise();
      this.users.update(list => list.map(u => u.id === user.id ? { ...u, status: 'active' } : u));
      this.applyFilters();
      this.toast.success(`User "${user.name}" restored`, 'Restored');
    } catch (err) {
      console.error('Failed to restore user:', err);
      this.toast.error('Failed to restore user', 'Error');
    }
  }

  closeModal() {
    this.showAddModal.set(false);
    this.editingUser.set(null);
    this.formError.set('');
    this.formData = { name: '', email: '', personalEmail: '', phone: '', roleId: '', organizationId: '', departmentId: null, satelliteId: null, agencyId: null, terminalId: null, jobTitle: '', zoomEmail: '', password: '', status: 'active' };
    this.phoneEntries = [{ id: ++this.phoneIdCounter, type: 'cell', countryCode: '+1', number: '' }];
  }

  async saveUser() {
    if (!this.formData.name || !this.formData.email) {
      this.formError.set('Name and email are required.');
      return;
    }

    // Combine phone entries into single string
    this.formData.phone = this.getPhoneString();

    // Validate phone: count only digits (strip formatting) for entries with numbers
    const filledEntries = this.phoneEntries.filter(p => p.number.trim());
    for (const entry of filledEntries) {
      const digitsOnly = entry.number.replace(/\D/g, '');
      if (digitsOnly.length < 7) {
        this.formError.set(`${entry.type} phone number must have at least 7 digits.`);
        return;
      }
    }

    if (this.formData.phone) {
      const digitsOnly = this.formData.phone.replace(/\D/g, '');

      // Validate phone format (digits, spaces, dashes, parens, plus, pipe, colon)
      const phonePattern = /^[\d\s\-\(\)\+\|:,a-z]+$/i;
      if (!phonePattern.test(this.formData.phone)) {
        this.formError.set('Phone number contains invalid characters.');
        return;
      }
    }

    if (!this.editingUser() && (!this.formData.password || this.formData.password.length < 8)) {
      this.formError.set('Password must be at least 8 characters.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    try {
      // Fix: Convert both to string for comparison (roleId might be number or string)
      const selectedRole = this.roles().find(r => String(r.id) === String(this.formData.roleId));
      const roleName = selectedRole?.name?.toLowerCase() || 'user';

      if (this.editingUser()) {
        const updateData: any = { 
          name: this.formData.name,
          phone: this.formData.phone,
          role: roleName,
          status: this.formData.status,
          organizationId: this.formData.organizationId ? parseInt(this.formData.organizationId) : null,
          organizationIds: this.selectedOrgIds().length > 0 ? this.selectedOrgIds() : null, // Multi-org assignment
          departmentId: this.formData.departmentId,
          satelliteId: this.formData.satelliteId,
          agencyId: this.formData.agencyId,
          terminalId: this.formData.terminalId,
          jobTitle: this.formData.jobTitle,
          zoomEmail: this.formData.zoomEmail
        };
        await this.api.updateUser(this.editingUser()!.id, updateData).toPromise();
        this.toast.success('User updated successfully', 'Success');
      } else {
        const createData: any = {
          name: this.formData.name,
          email: this.formData.email,
          phone: this.formData.phone,
          password: this.formData.password,
          role: roleName,
          organizationId: this.formData.organizationId ? parseInt(this.formData.organizationId) : null,
          departmentId: this.formData.departmentId,
          satelliteId: this.formData.satelliteId,
          agencyId: this.formData.agencyId,
          terminalId: this.formData.terminalId,
          jobTitle: this.formData.jobTitle,
          zoomEmail: this.formData.zoomEmail
        };
        console.log('Creating user with data:', createData);
        const response = await this.api.createUser(createData).toPromise();
        console.log('Create response:', response);
        this.toast.success('User created successfully', 'Success');
      }
      this.closeModal();
      this.loadUsers();
    } catch (err: any) {
      this.formError.set(err.error?.error || err.error?.message || 'Failed to save user.');
    } finally {
      this.saving.set(false);
    }
  }

  // ============ AUDIT LOGS ============

  loadAuditLogs() {
    if (this.auditLogs().length > 0) return;
    this.auditLoading.set(true);
    this.http.get<any>(`${environment.apiUrl}/api/v1/audit?entityType=User&limit=200`).subscribe({
      next: (res) => {
        this.auditLogs.set(res.data || []);
        this.auditLoading.set(false);
      },
      error: () => { this.auditLoading.set(false); }
    });
    this.http.get<any>(`${environment.apiUrl}/api/v1/audit/logins?limit=50`).subscribe({
      next: (res) => { this.loginHistory.set(res.data || []); }
    });
  }

  loadUserActivity(userId: string, userName: string) {
    this.selectedActivityUser.set(userName);
    this.activityLoading.set(true);
    this.http.get<any>(`${environment.apiUrl}/api/v1/audit/user/${userId}?limit=50`).subscribe({
      next: (res) => {
        this.selectedUserActivity.set(res.data || []);
        this.activityLoading.set(false);
      },
      error: () => {
        this.selectedUserActivity.set([]);
        this.activityLoading.set(false);
      }
    });
  }

  closeActivityPanel() {
    this.selectedUserActivity.set(null);
    this.selectedActivityUser.set('');
  }

  filteredAuditLogs(): any[] {
    const search = this.logSearch().toLowerCase();
    const actionFilter = this.logActionFilter().toLowerCase();
    const userFilter = this.logUserFilter().toLowerCase();
    let logs = this.auditLogs();

    if (search) {
      logs = logs.filter((l: any) =>
        (l.userName || '').toLowerCase().includes(search) ||
        (l.description || '').toLowerCase().includes(search) ||
        (l.entityName || '').toLowerCase().includes(search)
      );
    }
    if (actionFilter) {
      logs = logs.filter((l: any) => (l.action || '').toLowerCase().includes(actionFilter));
    }
    if (userFilter) {
      logs = logs.filter((l: any) => (l.userName || '').toLowerCase().includes(userFilter));
    }
    return logs;
  }

  paginatedLogs(): any[] {
    const all = this.filteredAuditLogs();
    const start = (this.logPage() - 1) * this.logsPerPage;
    return all.slice(start, start + this.logsPerPage);
  }

  totalLogPages(): number {
    return Math.max(1, Math.ceil(this.filteredAuditLogs().length / this.logsPerPage));
  }

  setLogPage(page: number) {
    if (page < 1 || page > this.totalLogPages()) return;
    this.logPage.set(page);
  }

  resetLogFilters() {
    this.logSearch.set('');
    this.logActionFilter.set('');
    this.logUserFilter.set('');
    this.logPage.set(1);
  }

  uniqueLogActions(): string[] {
    const actions = new Set(this.auditLogs().map((l: any) => l.action).filter(Boolean));
    return Array.from(actions).sort();
  }

  uniqueLogUsers(): string[] {
    const users = new Set(this.auditLogs().map((l: any) => l.userName).filter(Boolean));
    return Array.from(users).sort();
  }

  getActionColor(action: string): string {
    const a = (action || '').toLowerCase();
    if (a.includes('create') || a.includes('register')) return '#22c55e';
    if (a.includes('delete') || a.includes('deactivat') || a.includes('archive')) return '#ef4444';
    if (a.includes('login')) return '#a855f7';
    if (a.includes('update') || a.includes('assign') || a.includes('role')) return '#2d8cff';
    return '#888';
  }

  formatLogDate(date: string): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
           d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}
