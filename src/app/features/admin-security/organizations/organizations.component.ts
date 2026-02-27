import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';
import { ConfirmService } from '../../../core/services/confirm.service';

interface Organization {
  id: string;
  name: string;
  description?: string;
  status: string;
  type?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  timezone?: string;
  currency?: string;
  userCount?: number;
  createdAt: string;
}

@Component({
  selector: 'app-organizations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './organizations.component.html',
  styleUrls: ['./organizations.component.scss']
})
export class OrganizationsComponent implements OnInit {
  private api = inject(VanTacApiService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  organizations = signal<Organization[]>([]);
  filteredOrgs = signal<Organization[]>([]);
  loading = signal(false);
  showAddModal = signal(false);
  showUsersModal = signal(false);
  showSettingsModal = signal(false);
  showDatabasePanel = signal(false);
  showOrgChartModal = signal(false);
  selectedOrg = signal<Organization | null>(null);
  orgUsers = signal<any[]>([]);
  orgChartData = signal<any>(null);
  loadingOrgChart = signal(false);
  editingOrg = signal<Organization | null>(null);
  saving = signal(false);
  formError = signal('');
  showAdvancedInfo = signal(false);
  databaseStats = signal<any>(null);
  loadingDbStats = signal(false);

  searchTerm = '';
  statusFilter = '';
  
  // Country-specific timezone options
  timezoneOptions = signal<{value: string, label: string}[]>([]);
  
  // Form labels translated by country
  formLabels = signal({
    address: 'Address',
    city: 'City',
    state: 'State',
    postalCode: 'Postal Code',
    country: 'Country',
    timezone: 'Timezone'
  });
  
  // Label translations by country
  private countryLabels: Record<string, any> = {
    'USA': {
      address: 'Address',
      city: 'City',
      state: 'State',
      postalCode: 'ZIP Code',
      country: 'Country',
      timezone: 'Timezone'
    },
    'Bosnia': {
      address: 'Adresa (Address)',
      city: 'Grad (City)',
      state: 'Kanton/Entitet (Canton/Entity)',
      postalCode: 'Poštanski broj (Postal Code)',
      country: 'Država (Country)',
      timezone: 'Vremenska zona (Timezone)'
    },
    'Germany': {
      address: 'Adresse (Address)',
      city: 'Stadt (City)',
      state: 'Bundesland (State)',
      postalCode: 'Postleitzahl (Postal Code)',
      country: 'Land (Country)',
      timezone: 'Zeitzone (Timezone)'
    },
    'France': {
      address: 'Adresse (Address)',
      city: 'Ville (City)',
      state: 'Région (Region)',
      postalCode: 'Code postal (Postal Code)',
      country: 'Pays (Country)',
      timezone: 'Fuseau horaire (Timezone)'
    },
    'Spain': {
      address: 'Dirección (Address)',
      city: 'Ciudad (City)',
      state: 'Provincia (Province)',
      postalCode: 'Código postal (Postal Code)',
      country: 'País (Country)',
      timezone: 'Zona horaria (Timezone)'
    },
    'Italy': {
      address: 'Indirizzo (Address)',
      city: 'Città (City)',
      state: 'Regione (Region)',
      postalCode: 'Codice postale (Postal Code)',
      country: 'Paese (Country)',
      timezone: 'Fuso orario (Timezone)'
    },
    'Croatia': {
      address: 'Adresa (Address)',
      city: 'Grad (City)',
      state: 'Županija (County)',
      postalCode: 'Poštanski broj (Postal Code)',
      country: 'Država (Country)',
      timezone: 'Vremenska zona (Timezone)'
    },
    'Serbia': {
      address: 'Adresa (Address)',
      city: 'Grad (City)',
      state: 'Oblast (District)',
      postalCode: 'Poštanski broj (Postal Code)',
      country: 'Država (Country)',
      timezone: 'Vremenska zona (Timezone)'
    },
    'Mexico': {
      address: 'Dirección (Address)',
      city: 'Ciudad (City)',
      state: 'Estado (State)',
      postalCode: 'Código postal (Postal Code)',
      country: 'País (Country)',
      timezone: 'Zona horaria (Timezone)'
    }
  };
  
  // Timezone mapping by country
  private countryTimezones: Record<string, {value: string, label: string}[]> = {
    'USA': [
      { value: 'America/New_York', label: 'Eastern Time (ET)' },
      { value: 'America/Chicago', label: 'Central Time (CT)' },
      { value: 'America/Denver', label: 'Mountain Time (MT)' },
      { value: 'America/Phoenix', label: 'Arizona Time (AZ)' },
      { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
      { value: 'America/Anchorage', label: 'Alaska Time (AK)' },
      { value: 'Pacific/Honolulu', label: 'Hawaii Time (HI)' }
    ],
    'Canada': [
      { value: 'America/St_Johns', label: 'Newfoundland Time (NT)' },
      { value: 'America/Halifax', label: 'Atlantic Time (AT)' },
      { value: 'America/Toronto', label: 'Eastern Time (ET)' },
      { value: 'America/Winnipeg', label: 'Central Time (CT)' },
      { value: 'America/Edmonton', label: 'Mountain Time (MT)' },
      { value: 'America/Vancouver', label: 'Pacific Time (PT)' }
    ],
    'Mexico': [
      { value: 'America/Mexico_City', label: 'Central Mexico (CST)' },
      { value: 'America/Cancun', label: 'Eastern Mexico (EST)' },
      { value: 'America/Chihuahua', label: 'Mountain Mexico (MST)' },
      { value: 'America/Tijuana', label: 'Pacific Mexico (PST)' }
    ],
    'UK': [
      { value: 'Europe/London', label: 'Greenwich Mean Time (GMT/BST)' }
    ],
    'Bosnia': [
      { value: 'Europe/Sarajevo', label: 'Central European Time (CET)' }
    ],
    'Germany': [
      { value: 'Europe/Berlin', label: 'Central European Time (CET)' }
    ],
    'France': [
      { value: 'Europe/Paris', label: 'Central European Time (CET)' }
    ],
    'Spain': [
      { value: 'Europe/Madrid', label: 'Central European Time (CET)' }
    ],
    'Italy': [
      { value: 'Europe/Rome', label: 'Central European Time (CET)' }
    ],
    'Poland': [
      { value: 'Europe/Warsaw', label: 'Central European Time (CET)' }
    ],
    'Netherlands': [
      { value: 'Europe/Amsterdam', label: 'Central European Time (CET)' }
    ],
    'Belgium': [
      { value: 'Europe/Brussels', label: 'Central European Time (CET)' }
    ],
    'Switzerland': [
      { value: 'Europe/Zurich', label: 'Central European Time (CET)' }
    ],
    'Austria': [
      { value: 'Europe/Vienna', label: 'Central European Time (CET)' }
    ],
    'Croatia': [
      { value: 'Europe/Zagreb', label: 'Central European Time (CET)' }
    ],
    'Serbia': [
      { value: 'Europe/Belgrade', label: 'Central European Time (CET)' }
    ],
    'Romania': [
      { value: 'Europe/Bucharest', label: 'Eastern European Time (EET)' }
    ],
    'Greece': [
      { value: 'Europe/Athens', label: 'Eastern European Time (EET)' }
    ],
    'Turkey': [
      { value: 'Europe/Istanbul', label: 'Turkey Time (TRT)' }
    ],
    'Russia': [
      { value: 'Europe/Moscow', label: 'Moscow Time (MSK)' }
    ],
    'Other': [
      { value: 'UTC', label: 'UTC (Coordinated Universal Time)' }
    ]
  };

  formData = {
    name: '',
    description: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'USA',
    timezone: 'America/New_York',
    status: 'active'
  };

  // Structure counts per org
  orgDivisionCounts = signal<Record<number, number>>({});
  orgDepartmentCounts = signal<Record<number, number>>({});
  orgPositionCounts = signal<Record<number, number>>({});

  ngOnInit(): void {
    this.loadOrganizations();
    this.updateTimezoneOptions(this.formData.country);
  }

  getOrgDivCount(orgId: any): number { return this.orgDivisionCounts()[+orgId] || 0; }
  getOrgDeptCount(orgId: any): number { return this.orgDepartmentCounts()[+orgId] || 0; }
  getOrgPosCount(orgId: any): number { return this.orgPositionCounts()[+orgId] || 0; }
  
  onCountryChange(country: string) {
    this.updateTimezoneOptions(country);
    this.updateFormLabels(country);
    // Set default timezone for selected country
    const options = this.timezoneOptions();
    if (options.length > 0) {
      this.formData.timezone = options[0].value;
    }
  }
  
  private updateTimezoneOptions(country: string) {
    const timezones = this.countryTimezones[country] || this.countryTimezones['Other'];
    this.timezoneOptions.set(timezones);
  }
  
  private updateFormLabels(country: string) {
    const labels = this.countryLabels[country] || this.countryLabels['USA'];
    this.formLabels.set(labels);
  }

  async loadOrganizations() {
    this.loading.set(true);
    try {
      const response: any = await this.api.getOrganizations().toPromise();
      let orgs = response?.data || response || [];
      
      this.organizations.set(orgs);
      
      // Build structure counts from the response (backend now includes them)
      const divCounts: Record<number, number> = {};
      const deptCounts: Record<number, number> = {};
      const posCounts: Record<number, number> = {};
      for (const org of orgs) {
        divCounts[org.id] = org.divisionCount || 0;
        deptCounts[org.id] = org.departmentCount || 0;
        posCounts[org.id] = org.positionCount || 0;
      }
      this.orgDivisionCounts.set(divCounts);
      this.orgDepartmentCounts.set(deptCounts);
      this.orgPositionCounts.set(posCounts);
      
      this.applyFilters();
    } catch (err) {
      console.error('Failed to load organizations:', err);
    } finally {
      this.loading.set(false);
    }
  }

  applyFilters() {
    let filtered = [...this.organizations()];

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(o =>
        o.name?.toLowerCase().includes(term) ||
        o.email?.toLowerCase().includes(term)
      );
    }

    if (this.statusFilter) {
      filtered = filtered.filter(o => o.status === this.statusFilter);
    }

    this.filteredOrgs.set(filtered);
  }

  editOrg(org: Organization) {
    this.editingOrg.set(org);
    const country = org.country || 'USA';
    const timezone = org.timezone || 'America/New_York';
    
    this.formData = {
      name: org.name,
      description: org.description || '',
      email: org.email || '',
      phone: org.phone || '',
      address: org.address || '',
      city: org.city || '',
      state: org.state || '',
      postalCode: org.postalCode || '',
      country: country,
      timezone: timezone,
      status: org.status
    };
    
    this.updateTimezoneOptions(country);
    this.updateFormLabels(country);
    
    this.showAddModal.set(true);
  }

  async viewUsers(org: Organization) {
    this.selectedOrg.set(org);
    this.showUsersModal.set(true);
    try {
      const response: any = await this.api.getOrganizationUsers(org.id).toPromise();
      this.orgUsers.set(response?.data || response || []);
    } catch {
      this.orgUsers.set([]);
    }
  }

  closeUsersModal() {
    this.showUsersModal.set(false);
    this.selectedOrg.set(null);
    this.orgUsers.set([]);
  }
  
  async viewOrgChart(org: Organization) {
    this.selectedOrg.set(org);
    this.showOrgChartModal.set(true);
    this.loadingOrgChart.set(true);
    
    try {
      // Load departments
      const deptsResponse: any = await this.http.get(`${environment.apiUrl}/api/v1/departments?organizationId=${org.id}`).toPromise();
      const departments = deptsResponse?.data || [];
      
      // Load users
      const usersResponse: any = await this.api.getOrganizationUsers(org.id).toPromise();
      const users = usersResponse?.data || [];
      
      // Build org chart structure
      this.orgChartData.set({
        organization: org,
        departments: departments.map((dept: any) => ({
          ...dept,
          users: users.filter((u: any) => u.departmentId === dept.id)
        })),
        unassignedUsers: users.filter((u: any) => !u.departmentId)
      });
    } catch (err) {
      console.error('Failed to load org chart:', err);
    } finally {
      this.loadingOrgChart.set(false);
    }
  }
  
  closeOrgChartModal() {
    this.showOrgChartModal.set(false);
    this.selectedOrg.set(null);
    this.orgChartData.set(null);
  }

  openSettings(org: Organization) {
    this.selectedOrg.set(org);
    this.showSettingsModal.set(true);
  }

  closeSettingsModal() {
    this.showSettingsModal.set(false);
    this.selectedOrg.set(null);
  }

  // Delete confirmation with name typing
  showDeleteModal = signal(false);
  deleteTarget = signal<Organization | null>(null);
  deleteConfirmName = signal('');
  deleting = signal(false);

  deleteNameMatches(): boolean {
    const target = this.deleteTarget();
    if (!target) return false;
    return this.deleteConfirmName().trim().toLowerCase() === target.name.trim().toLowerCase();
  }

  openDeleteModal(org: Organization): void {
    this.deleteTarget.set(org);
    this.deleteConfirmName.set('');
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.deleteTarget.set(null);
    this.deleteConfirmName.set('');
  }

  async confirmDelete() {
    if (!this.deleteNameMatches()) return;
    const org = this.deleteTarget();
    if (!org) return;

    this.deleting.set(true);
    try {
      await this.api.deleteOrganization(org.id).toPromise();
      this.organizations.update(list => list.filter(o => o.id !== org.id));
      this.applyFilters();
      this.closeDeleteModal();
      this.toast.success(`Organization "${org.name}" deleted`);
    } catch (err) {
      console.error('Failed to delete organization:', err);
      this.toast.error('Failed to delete organization');
    } finally {
      this.deleting.set(false);
    }
  }

  closeModal() {
    this.showAddModal.set(false);
    this.editingOrg.set(null);
    this.formError.set('');
    this.formData = {
      name: '', description: '', email: '', phone: '', address: '',
      city: '', state: '', postalCode: '', country: 'USA',
      timezone: 'America/New_York', status: 'active'
    };
  }

  async saveOrg() {
    // Validate required fields
    const errors: string[] = [];
    
    if (!this.formData.name?.trim()) {
      errors.push('Organization Name is required');
    }
    
    if (errors.length > 0) {
      this.formError.set('Please fill in required fields: ' + errors.join(', '));
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    try {
      if (this.editingOrg()) {
        await this.api.updateOrganization(this.editingOrg()!.id, this.formData).toPromise();
      } else {
        await this.api.createOrganization(this.formData).toPromise();
      }
      this.closeModal();
      this.loadOrganizations();
    } catch (err: any) {
      console.error('Save organization error:', err);
      this.formError.set(err.error?.error || err.error?.message || err.message || 'Failed to save organization. Please check all fields.');
    } finally {
      this.saving.set(false);
    }
  }

  // Database Admin Tools
  async loadDatabaseStats() {
    this.loadingDbStats.set(true);
    try {
      const response: any = await this.api.checkOrganizationData().toPromise();
      this.databaseStats.set(response);
    } catch (err) {
      console.error('Failed to load database stats:', err);
    } finally {
      this.loadingDbStats.set(false);
    }
  }

  async fixOrganizationData() {
    const ok = await this.confirm.show({ message: 'This will automatically fix OrganizationId mismatches across all tables. Continue?', type: 'champagne' });
    if (!ok) return;
    
    this.loadingDbStats.set(true);
    try {
      const response: any = await this.api.fixOrganizationData().toPromise();
      alert(`Fixed:\n${JSON.stringify(response.fixed, null, 2)}`);
      this.loadDatabaseStats();
      this.loadOrganizations(); // Reload to show updated counts
    } catch (err: any) {
      console.error('Failed to fix data:', err);
      alert('Failed to fix organization data: ' + (err.error?.message || err.message));
    } finally {
      this.loadingDbStats.set(false);
    }
  }

  toggleDatabasePanel() {
    this.showDatabasePanel.update(v => !v);
    if (this.showDatabasePanel()) {
      this.loadDatabaseStats();
    }
  }

  toggleAdvancedInfo() {
    this.showAdvancedInfo.update(v => !v);
  }

  editUserFromOrg(user: any) {
    // Navigate to users page with query param to auto-select this user
    this.router.navigate(['/users'], { 
      queryParams: { userId: user.id },
      state: { user: user }
    });
    this.toast.success(`Opening editor for ${user.name}`, 'Redirecting');
  }
}
