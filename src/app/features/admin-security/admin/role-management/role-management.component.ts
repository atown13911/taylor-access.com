import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AdminService, Role, Permission } from '../../../../core/services/admin.service';
import { VanTacApiService } from '../../../../core/services/vantac-api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { environment } from '../../../../../environments/environment';
import { getNavSections, NavSection, NavItemDefinition } from '../../../../core/constants/nav-items';

interface RoleWithCount extends Role {
  userCount?: number;
}

interface PermissionWithDesc {
  key: string;
  value: string;
  description?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './role-management.component.html',
  styleUrls: ['./role-management.component.scss']
})
export class RoleManagementComponent implements OnInit {
  private adminService = inject(AdminService);
  private authService = inject(AuthService);
  private api = inject(VanTacApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  showForceLogoutConfirm = signal(false);

  roles = signal<RoleWithCount[]>([]);
  filteredRoles = signal<RoleWithCount[]>([]);
  organizations = signal<any[]>([]);
  permissions = signal<{ [category: string]: PermissionWithDesc[] }>({});
  permissionCategories = signal<string[]>([]);
  users = signal<User[]>([]);
  
  selectedOrgId = signal<number | null>(null); // null = "All Organizations" default
  showSystemRoles = signal(true);
  
  // Check if current user has elevated access (for org filter visibility)
  currentUserIsProductOwner = computed(() => {
    const role = this.authService.currentUser()?.role?.toLowerCase();
    return role === 'product_owner' || role === 'superadmin';
  });

  // Product owner or superadmin can edit roles (superadmin only below their level)
  canEditRoles = computed(() => {
    const role = this.authService.currentUser()?.role?.toLowerCase();
    return role === 'product_owner' || role === 'superadmin';
  });

  // Check if current user can edit the specific selected role's permissions/nav
  canEditSelectedRole = computed(() => {
    const currentRole = this.authService.currentUser()?.role?.toLowerCase();
    const selected = this.selectedRoleForEdit();
    if (!selected) return false;
    if (currentRole === 'product_owner') {
      return selected.name !== 'product_owner';
    }
    if (currentRole === 'superadmin') {
      return selected.name !== 'product_owner' && selected.name !== 'superadmin';
    }
    return false;
  });

  // Product owner or superadmin can create/delete roles
  isProductOwnerUser = computed(() => {
    const role = this.authService.currentUser()?.role?.toLowerCase();
    return role === 'product_owner' || role === 'superadmin';
  });

  // Check if current user can assign users to a given role
  canAssignUsersToRole(role: Role | RoleWithCount | null): boolean {
    if (!role) return false;
    const currentRole = this.authService.currentUser()?.role?.toLowerCase();
    if (currentRole === 'product_owner') return true;
    if (currentRole === 'superadmin') {
      return role.name !== 'product_owner' && role.name !== 'superadmin';
    }
    return false;
  }
  
  loading = signal(true);
  saving = signal(false);
  saveError = signal<string | null>(null);
  
  showCreateModal = signal(false);
  selectedRole = signal<Role | null>(null);
  selectedRoleForEdit = signal<RoleWithCount | null>(null);
  deleteConfirmRole = signal<Role | null>(null);
  
  // User assignment modal
  showUserModal = signal(false);
  userModalRole = signal<Role | null>(null);
  roleUsers = signal<User[]>([]);
  availableUsers = signal<User[]>([]);
  userSearchQuery = signal('');
  loadingUsers = signal(false);
  
  formData = {
    name: '',
    description: '',
    permissions: [] as string[]
  };

  // Tab selection for permissions panel
  activePermissionTab = signal<'permissions' | 'navigation'>('permissions');

  // Navigation visibility
  navSections: NavSection[] = getNavSections();
  navSearchTerm = signal('');
  navCollapsedSections = signal<Set<string>>(new Set());

  filteredNavSections = computed(() => {
    const search = this.navSearchTerm().toLowerCase().trim();
    if (!search) return this.navSections;

    return this.navSections
      .map(section => ({
        ...section,
        items: section.items.filter(item =>
          item.label.toLowerCase().includes(search) ||
          item.route.toLowerCase().includes(search)
        )
      }))
      .filter(section => section.items.length > 0);
  });

  // Filtered available users based on search
  filteredAvailableUsers = computed(() => {
    const query = this.userSearchQuery().toLowerCase();
    return this.availableUsers().filter(u => 
      u.name.toLowerCase().includes(query) || 
      u.email.toLowerCase().includes(query)
    );
  });

  ngOnInit() {
    this.loadOrganizations();
    this.loadRoles();
    this.loadPermissions();
    this.loadUsers();
  }

  async loadOrganizations() {
    try {
      const response: any = await this.api.getOrganizations().toPromise();
      this.organizations.set(response?.data || []);
      
      // Default to "All Organizations" (null) instead of auto-selecting first org
      // User can manually select specific org if needed
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  }

  filterRoles() {
    let filtered = [...this.roles()];
    
    const orgId = this.selectedOrgId();
    const showSystem = this.showSystemRoles();
    
    if (orgId && !showSystem) {
      // Show only org-specific roles
      filtered = filtered.filter(r => (r as any).organizationId === orgId);
    } else if (!showSystem && !orgId) {
      // Show only system roles
      filtered = filtered.filter(r => !(r as any).organizationId);
    } else if (orgId && showSystem) {
      // Show system roles + org-specific roles
      filtered = filtered.filter(r => 
        !(r as any).organizationId || (r as any).organizationId === orgId
      );
    }
    // else: show all roles (product owner with no filter)
    
    this.filteredRoles.set(filtered);
  }

  onOrgFilterChange() {
    this.filterRoles();
  }

  toggleSystemRoles() {
    this.showSystemRoles.update(v => !v);
    this.filterRoles();
  }

  selectRoleForEdit(role: RoleWithCount) {
    this.selectedRoleForEdit.set(role);
  }

  loadRoles() {
    this.loading.set(true);
    this.adminService.getRolesWithCounts().subscribe({
      next: (response) => {
        this.roles.set(this.sortRolesWithProductOwnerFirst(response.data));
        this.filteredRoles.set(this.roles()); // Initialize filtered roles
        this.filterRoles(); // Apply filters
        this.loading.set(false);
      },
      error: () => {
        this.adminService.getRoles().subscribe({
          next: (response) => {
            this.roles.set(this.sortRolesWithProductOwnerFirst(response.data));
            this.filteredRoles.set(this.roles());
            this.filterRoles();
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
          }
        });
      }
    });
  }

  // Sort roles with product_owner always first
  private sortRolesWithProductOwnerFirst(roles: RoleWithCount[]): RoleWithCount[] {
    return [...roles].sort((a, b) => {
      // 1. Product Owner always first
      if (a.name === 'product_owner') return -1;
      if (b.name === 'product_owner') return 1;
      
      // 2. Superadmin always second
      if (a.name === 'superadmin') return -1;
      if (b.name === 'superadmin') return 1;
      
      // 3. System roles before custom roles
      if (a.isSystem && !b.isSystem) return -1;
      if (!a.isSystem && b.isSystem) return 1;
      
      // 4. Alphabetically within same category
      return a.name.localeCompare(b.name);
    });
  }

  // Check if role is the protected product owner
  isProductOwner(role: Role | RoleWithCount | null): boolean {
    return role?.name === 'product_owner';
  }
  
  // Check if role is superadmin
  isSuperAdmin(role: Role | RoleWithCount | null): boolean {
    return role?.name === 'superadmin';
  }

  loadPermissions() {
    this.adminService.getPermissions().subscribe({
      next: (response) => {
        this.permissions.set(response.permissions);
        this.permissionCategories.set(Object.keys(response.permissions));
      }
    });
  }

  loadUsers() {
    this.api.getUsers({ limit: 500 }).subscribe({
      next: (response) => {
        this.users.set(response.data || []);
      },
      error: () => {
        this.users.set([]);
      }
    });
  }


  getPermissionsByCategory(category: string): PermissionWithDesc[] {
    return this.permissions()[category] || [];
  }

  getAllPermissions(role: Role): string[] {
    try {
      const perms = typeof role.permissions === 'string' 
        ? JSON.parse(role.permissions) 
        : role.permissions;
      return Array.isArray(perms) ? perms : [];
    } catch {
      return [];
    }
  }

  getPermissionCount(role: Role): number {
    return this.getAllPermissions(role).length;
  }

  getDisplayPermissions(role: Role): string[] {
    return this.getAllPermissions(role).slice(0, 5);
  }

  formatPermission(perm: string): string {
    return perm.split(':').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  }

  getPermissionShortName(perm: string): string {
    // Get just the action part (e.g., "orders:view" -> "View")
    const parts = perm.split(':');
    if (parts.length > 1) {
      return parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    }
    return perm;
  }

  roleHasPermission(role: Role, permission: string): boolean {
    const perms = this.getAllPermissions(role);
    // Check for admin:full which grants all permissions
    if (perms.includes('admin:full')) return true;
    return perms.includes(permission);
  }

  toggleRolePermission(role: Role, permission: string) {
    if (role.isSystem && !this.canEditRoles()) return;
    
    const currentPerms = this.getAllPermissions(role);
    let newPerms: string[];
    
    if (currentPerms.includes(permission)) {
      newPerms = currentPerms.filter(p => p !== permission);
    } else {
      newPerms = [...currentPerms, permission];
    }
    
    this.saveRolePermissions(role as RoleWithCount, newPerms);
  }

  getCategorySelectedCountForRole(category: string, role: Role): number {
    const categoryPerms = this.getPermissionsByCategory(category);
    const rolePerms = this.getAllPermissions(role);
    return categoryPerms.filter(perm => rolePerms.includes(perm.value)).length;
  }

  isCategoryFullySelectedForRole(category: string, role: Role): boolean {
    const categoryPerms = this.getPermissionsByCategory(category);
    const rolePerms = this.getAllPermissions(role);
    return categoryPerms.every(perm => rolePerms.includes(perm.value));
  }

  toggleCategoryForRole(category: string) {
    const role = this.selectedRoleForEdit();
    if (!role || (role.isSystem && !this.canEditRoles())) return;
    
    const categoryPerms = this.getPermissionsByCategory(category);
    const currentPerms = this.getAllPermissions(role);
    const allSelected = this.isCategoryFullySelectedForRole(category, role);
    
    let newPerms: string[];
    if (allSelected) {
      // Remove all category permissions
      const categoryValues = categoryPerms.map(p => p.value);
      newPerms = currentPerms.filter(p => !categoryValues.includes(p));
    } else {
      // Add all category permissions
      newPerms = [...currentPerms];
      categoryPerms.forEach(perm => {
        if (!newPerms.includes(perm.value)) {
          newPerms.push(perm.value);
        }
      });
    }
    
    this.saveRolePermissions(role, newPerms);
  }

  selectAllPermissions() {
    const role = this.selectedRoleForEdit();
    if (!role || (role.isSystem && !this.canEditRoles())) return;
    
    const allPerms: string[] = [];
    this.permissionCategories().forEach(cat => {
      this.getPermissionsByCategory(cat).forEach(perm => {
        allPerms.push(perm.value);
      });
    });
    
    // Preserve existing nav permissions
    const existingNavPerms = this.getAllPermissions(role).filter(p => p.startsWith('nav:'));
    allPerms.push(...existingNavPerms);
    
    this.saveRolePermissions(role, allPerms);
  }

  clearAllPermissions() {
    const role = this.selectedRoleForEdit();
    if (!role || (role.isSystem && !this.canEditRoles())) return;
    
    // Preserve existing nav permissions
    const navPerms = this.getAllPermissions(role).filter(p => p.startsWith('nav:'));
    
    this.saveRolePermissions(role, navPerms);
  }

  // ============ NAVIGATION VISIBILITY ============

  getNavPermKey(item: NavItemDefinition): string {
    return `nav:${item.route}`;
  }

  roleHasNavPermission(role: Role, item: NavItemDefinition): boolean {
    const perms = this.getAllPermissions(role);
    return perms.includes(this.getNavPermKey(item));
  }

  getNavSectionSelectedCount(section: NavSection, role: Role): number {
    const perms = this.getAllPermissions(role);
    return section.items.filter(item => perms.includes(this.getNavPermKey(item))).length;
  }

  isNavSectionFullySelected(section: NavSection, role: Role): boolean {
    return this.getNavSectionSelectedCount(section, role) === section.items.length;
  }

  getTotalNavSelectedCount(role: Role): number {
    const perms = this.getAllPermissions(role);
    return perms.filter(p => p.startsWith('nav:')).length;
  }

  getTotalNavItemCount(): number {
    return this.navSections.reduce((sum, s) => sum + s.items.length, 0);
  }

  private ensureNavConfigured(perms: string[]) {
    if (!perms.includes('nav:configured')) {
      perms.push('nav:configured');
    }
  }

  toggleNavPermission(role: Role, item: NavItemDefinition) {
    const navKey = this.getNavPermKey(item);
    const currentPerms = this.getAllPermissions(role);
    let newPerms: string[];

    if (currentPerms.includes(navKey)) {
      newPerms = currentPerms.filter(p => p !== navKey);
    } else {
      newPerms = [...currentPerms, navKey];
    }

    this.ensureNavConfigured(newPerms);
    this.saveRolePermissions(role, newPerms);
  }

  toggleNavSection(section: NavSection) {
    const role = this.selectedRoleForEdit();
    if (!role) return;

    const currentPerms = this.getAllPermissions(role);
    const allSelected = this.isNavSectionFullySelected(section, role);
    let newPerms: string[];

    if (allSelected) {
      const sectionKeys = section.items.map(item => this.getNavPermKey(item));
      newPerms = currentPerms.filter(p => !sectionKeys.includes(p));
    } else {
      newPerms = [...currentPerms];
      section.items.forEach(item => {
        const key = this.getNavPermKey(item);
        if (!newPerms.includes(key)) {
          newPerms.push(key);
        }
      });
    }

    this.ensureNavConfigured(newPerms);
    this.saveRolePermissions(role, newPerms);
  }

  selectAllNavPermissions() {
    const role = this.selectedRoleForEdit();
    if (!role) { return; }

    const currentPerms = this.getAllPermissions(role);
    const nonNavPerms = currentPerms.filter(p => !p.startsWith('nav:'));
    const allNavKeys = this.navSections.flatMap(s => s.items.map(item => this.getNavPermKey(item)));
    const newPerms = [...new Set([...nonNavPerms, ...allNavKeys])];

    this.ensureNavConfigured(newPerms);
    this.saveRolePermissions(role as RoleWithCount, newPerms);
  }

  clearAllNavPermissions() {
    const role = this.selectedRoleForEdit();
    if (!role) { return; }

    const currentPerms = this.getAllPermissions(role);
    const newPerms = currentPerms.filter(p => !p.startsWith('nav:'));

    this.ensureNavConfigured(newPerms);
    this.saveRolePermissions(role as RoleWithCount, newPerms);
  }

  /** Shared save method with error feedback */
  private saveRolePermissions(role: RoleWithCount, newPerms: string[]) {
    this.saving.set(true);
    this.saveError.set(null);
    this.adminService.updateRole(role.id, role.description || '', newPerms).subscribe({
      next: () => {
        const updatedRole = { ...role, permissions: JSON.stringify(newPerms) } as unknown as RoleWithCount;
        this.roles.update(roles => roles.map(r => r.id === role.id ? updatedRole : r));
        this.filteredRoles.update(roles => roles.map(r => r.id === role.id ? updatedRole : r));
        if (this.selectedRoleForEdit()?.id === role.id) {
          this.selectedRoleForEdit.set(updatedRole);
        }
        this.saving.set(false);
        this.saveError.set(null);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message || err?.message || 'Failed to save permissions';
        this.saveError.set(msg);
        setTimeout(() => this.saveError.set(null), 5000);
      }
    });
  }

  toggleNavSectionCollapse(sectionName: string) {
    this.navCollapsedSections.update(set => {
      const next = new Set(set);
      if (next.has(sectionName)) {
        next.delete(sectionName);
      } else {
        next.add(sectionName);
      }
      return next;
    });
  }

  isNavSectionCollapsed(sectionName: string): boolean {
    return this.navCollapsedSections().has(sectionName);
  }

  createNewRole() {
    if (!this.formData.name) return;
    
    this.saving.set(true);
    this.adminService.createRole(this.formData.name, this.formData.description, []).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.loadRoles();
      },
      error: () => {
        this.saving.set(false);
      }
    });
  }

  // Group permissions by category for display
  getPermissionsByRoleGrouped(role: Role): { category: string; perms: string[] }[] {
    const allPerms = this.getAllPermissions(role);
    const grouped: { [key: string]: string[] } = {};
    
    allPerms.forEach(perm => {
      const category = perm.split(':')[0];
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(perm);
    });
    
    return Object.entries(grouped).map(([category, perms]) => ({ category, perms }));
  }

  openCreateModal() {
    this.showCreateModal.set(true);
    this.formData = { name: '', description: '', permissions: [] };
  }

  editRole(role: Role) {
    this.selectedRole.set(role);
    this.formData = {
      name: role.name,
      description: role.description || '',
      permissions: [...this.getAllPermissions(role)]
    };
  }

  togglePermission(permission: string) {
    const index = this.formData.permissions.indexOf(permission);
    if (index > -1) {
      this.formData.permissions.splice(index, 1);
    } else {
      this.formData.permissions.push(permission);
    }
  }

  selectAllInCategory(category: string) {
    const categoryPerms = this.getPermissionsByCategory(category);
    const allSelected = this.isCategoryFullySelected(category);
    
    if (allSelected) {
      categoryPerms.forEach(perm => {
        const index = this.formData.permissions.indexOf(perm.value);
        if (index > -1) {
          this.formData.permissions.splice(index, 1);
        }
      });
    } else {
      categoryPerms.forEach(perm => {
        if (!this.formData.permissions.includes(perm.value)) {
          this.formData.permissions.push(perm.value);
        }
      });
    }
  }

  isCategoryFullySelected(category: string): boolean {
    const categoryPerms = this.getPermissionsByCategory(category);
    return categoryPerms.every(perm => this.formData.permissions.includes(perm.value));
  }

  getCategorySelectedCount(category: string): number {
    const categoryPerms = this.getPermissionsByCategory(category);
    return categoryPerms.filter(perm => this.formData.permissions.includes(perm.value)).length;
  }

  closeModal() {
    this.showCreateModal.set(false);
    this.selectedRole.set(null);
    this.formData = { name: '', description: '', permissions: [] };
  }

  // Inline role name/description update methods
  updateRoleName(event: Event) {
    const role = this.selectedRoleForEdit();
    if (!role || (role.isSystem && !this.canEditRoles())) return;
    
    const input = event.target as HTMLInputElement;
    const newName = input.value.trim();
    if (!newName || newName === role.name) return;
    
    this.adminService.updateRole(role.id, role.description || '', this.getAllPermissions(role)).subscribe({
      next: () => {
        this.roles.update(roles => roles.map(r => r.id === role.id ? { ...r, name: newName } : r));
        this.filteredRoles.update(roles => roles.map(r => r.id === role.id ? { ...r, name: newName } : r));
        this.selectedRoleForEdit.update(r => r ? { ...r, name: newName } : null);
      }
    });
  }

  updateRoleDescription(event: Event) {
    const role = this.selectedRoleForEdit();
    if (!role) return;
    
    const input = event.target as HTMLInputElement;
    const newDescription = input.value.trim();
    if (newDescription === (role.description || '')) return;
    
    this.adminService.updateRole(role.id, newDescription, this.getAllPermissions(role)).subscribe({
      next: () => {
        this.roles.update(roles => roles.map(r => r.id === role.id ? { ...r, description: newDescription } : r));
        this.filteredRoles.update(roles => roles.map(r => r.id === role.id ? { ...r, description: newDescription } : r));
        this.selectedRoleForEdit.update(r => r ? { ...r, description: newDescription } : null);
      }
    });
  }

  saveRole() {
    this.saving.set(true);
    
    const role = this.selectedRole();
    const operation = role
      ? this.adminService.updateRole(role.id, this.formData.description, this.formData.permissions)
      : this.adminService.createRole(this.formData.name, this.formData.description, this.formData.permissions);

    operation.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.loadRoles();
      },
      error: () => {
        this.saving.set(false);
      }
    });
  }

  cloneRole(role: Role) {
    this.formData = {
      name: `${role.name}_copy`,
      description: `Copy of ${role.description || role.name}`,
      permissions: [...this.getAllPermissions(role)]
    };
    this.showCreateModal.set(true);
  }

  confirmDelete(role: Role) {
    this.deleteConfirmRole.set(role);
  }

  deleteRole() {
    const role = this.deleteConfirmRole();
    if (!role) return;

    this.saving.set(true);
    this.adminService.deleteRole(role.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteConfirmRole.set(null);
        this.loadRoles();
      },
      error: () => {
        this.saving.set(false);
      }
    });
  }

  // ============ USER ASSIGNMENT ============

  openUserModal(role: Role) {
    this.userModalRole.set(role);
    this.showUserModal.set(true);
    this.userSearchQuery.set('');
    this.loadRoleUsers(role);
  }

  closeUserModal() {
    this.showUserModal.set(false);
    this.userModalRole.set(null);
    this.roleUsers.set([]);
    this.availableUsers.set([]);
  }

  loadRoleUsers(role: Role) {
    this.loadingUsers.set(true);
    
    // Get users with this role
    const roleUsers = this.users().filter(u => 
      u.role?.toLowerCase() === role.name.toLowerCase()
    );
    this.roleUsers.set(roleUsers);
    
    // Available users are those not in this role
    const available = this.users().filter(u => 
      u.role?.toLowerCase() !== role.name.toLowerCase()
    );
    this.availableUsers.set(available);
    
    this.loadingUsers.set(false);
  }

  assignUserToRole(user: User) {
    const role = this.userModalRole();
    if (!role) return;

    this.saving.set(true);
    
    // Update user's role
    this.api.updateUser(user.id, { role: role.name }).subscribe({
      next: () => {
        this.roleUsers.update(users => [...users, { ...user, role: role.name }]);
        this.availableUsers.update(users => users.filter(u => u.id !== user.id));
        this.users.update(users => users.map(u => u.id === user.id ? { ...u, role: role.name } : u));
        this.saving.set(false);
        this.loadRoles();
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.error || err?.error?.message || err?.message || 'Failed to assign user';
        this.saveError.set(msg);
        setTimeout(() => this.saveError.set(null), 5000);
      }
    });
  }

  removeUserFromRole(user: User) {
    const role = this.userModalRole();
    if (!role) return;

    this.saving.set(true);
    
    // Reset user to default 'user' role
    this.api.updateUser(user.id, { role: 'user' }).subscribe({
      next: () => {
        this.availableUsers.update(users => [...users, { ...user, role: 'user' }]);
        this.roleUsers.update(users => users.filter(u => u.id !== user.id));
        this.users.update(users => users.map(u => u.id === user.id ? { ...u, role: 'user' } : u));
        this.saving.set(false);
        this.loadRoles();
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.error || err?.error?.message || err?.message || 'Failed to remove user from role';
        this.saveError.set(msg);
        setTimeout(() => this.saveError.set(null), 5000);
      }
    });
  }

  forceLogoutAll() {
    this.showForceLogoutConfirm.set(true);
  }

  confirmForceLogout() {
    this.showForceLogoutConfirm.set(false);
    this.saving.set(true);
    this.http.post<any>(`${environment.apiUrl}/api/v1/session/force-logout`, {}).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.champagne('All user sessions invalidated. Users will be logged out on their next action.', 'Sessions Reset');
      },
      error: (err) => {
        this.saving.set(false);
        const status = err?.status || 'unknown';
        const msg = err?.error?.message || err?.message || 'Unknown error';
        this.toast.error(`Force logout failed (${status}): ${msg}`, 'Error');
      }
    });
  }
}
