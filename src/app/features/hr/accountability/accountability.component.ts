import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  ACCOUNTABILITY_ROLES,
  AccountabilityEntry,
  AccountabilityRole,
  AccountabilityWritePayload,
  AccountabilityService,
  SCOPE_DOMAINS,
  SEAT_STATUSES,
  SeatStatus,
} from '../../../core/services/accountability.service';

interface RosterEmployee {
  id: number;
  name: string;
  alias?: string | null;
  email?: string | null;
  personalEmail?: string | null;
  phone?: string | null;
  workPhone?: string | null;
  cellPhone?: string | null;
  jobTitle?: string | null;
  role?: string | null;
  status?: string | null;
  avatarUrl?: string | null;
  employeeNumber?: string | null;
  hireDate?: string | null;
  city?: string | null;
  state?: string | null;
  position?: { title?: string | null } | null;
  department?: { name?: string | null } | null;
  organization?: { name?: string | null } | null;
  satellite?: { name?: string | null; code?: string | null } | null;
  agency?: { name?: string | null; code?: string | null } | null;
  terminal?: { name?: string | null; code?: string | null } | null;
}

interface OrgNode {
  row: AccountabilityEntry;
  children: OrgNode[];
}

interface ScopeGroup {
  domain: string;
  seats: AccountabilityEntry[];
}

@Component({
  selector: 'app-accountability',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './accountability.component.html',
  styleUrls: ['./accountability.component.scss'],
})
export class AccountabilityComponent implements OnInit {
  private api = inject(AccountabilityService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private orgContext = inject(OrganizationContextService);
  private auth = inject(AuthService);

  readonly roles = ACCOUNTABILITY_ROLES;
  readonly statuses = SEAT_STATUSES;
  scopes = this.api.scopes;
  domainNames = computed(() => {
    const names = this.scopes().map((scope) => scope.name);
    return names.length ? names : [...SCOPE_DOMAINS];
  });

  loading = signal(false);
  saving = signal(false);
  searchQuery = signal('');
  statusFilter = signal<string>('');
  domainFilter = signal('');
  viewMode = signal<'list' | 'chart' | 'scope'>('list');
  showForm = signal(false);
  detailRow = signal<AccountabilityEntry | null>(null);
  editingId = signal<number | null>(null);
  employees = signal<RosterEmployee[]>([]);
  employeeQuery = signal('');
  showEmployeeList = signal(false);
  selectedEmployeeId = signal<number | null>(null);
  showAddScope = signal(false);
  newScopeName = '';
  savingScope = signal(false);

  form: AccountabilityWritePayload = this.blankForm();

  entries = this.api.entries;

  selectedEmployee = computed(() => {
    const id = this.selectedEmployeeId();
    if (id == null) return null;
    return this.employees().find((emp) => emp.id === id) ?? null;
  });

  detailEmployee = computed(() => {
    const row = this.detailRow();
    return row ? this.rosterFor(row) : null;
  });

  detailReports = computed(() => {
    const row = this.detailRow();
    if (!row) return [];
    return this.entries().filter((item) => item.reportsToId === row.id);
  });

  reportsToOptions = computed(() => {
    const editing = this.editingId();
    return this.entries()
      .filter((row) => row.id !== editing)
      .slice()
      .sort((a, b) => a.jobPosition.localeCompare(b.jobPosition));
  });

  counts = computed(() => {
    const rows = this.entries();
    return {
      all: rows.length,
      vacant: rows.filter((r) => r.seatStatus === 'Vacant').length,
      interim: rows.filter((r) => r.seatStatus === 'Interim').length,
      transitioning: rows.filter((r) => r.seatStatus === 'Transitioning').length,
      myReports: this.directReportIds().size,
    };
  });

  filtered = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    const domain = this.domainFilter();
    const mine = this.directReportIds();
    return this.entries().filter((e) => {
      if (status === 'my-reports' && !mine.has(e.id)) return false;
      if (status && status !== 'my-reports' && (e.seatStatus || 'Active') !== status) return false;
      if (domain && !(e.scopeTags || []).includes(domain)) return false;
      if (!q) return true;
      const emp = this.rosterFor(e);
      const reportsTo = this.reportsToLabel(e).toLowerCase();
      return (
        e.jobPosition.toLowerCase().includes(q) ||
        (e.individual || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        (e.accountabilityRole || '').toLowerCase().includes(q) ||
        (e.seatStatus || '').toLowerCase().includes(q) ||
        (e.scopeTags || []).some((tag) => tag.toLowerCase().includes(q)) ||
        (e.keyResults || []).some((kpi) => kpi.toLowerCase().includes(q)) ||
        reportsTo.includes(q) ||
        (emp?.email || '').toLowerCase().includes(q) ||
        this.employeeDepartment(emp).toLowerCase().includes(q) ||
        this.employeeOrg(emp).toLowerCase().includes(q)
      );
    });
  });

  scopeGroups = computed(() => {
    const rows = this.filtered();
    const selected = this.domainFilter();
    const known = selected ? [selected] : [...this.domainNames()];
    const extras = new Set<string>();
    if (!selected) {
      for (const row of this.entries()) {
        for (const tag of row.scopeTags || []) {
          if (!known.includes(tag)) extras.add(tag);
        }
      }
    }

    const groups: ScopeGroup[] = [...known, ...extras].map((domain) => ({
      domain,
      seats: rows
        .filter((row) => (row.scopeTags || []).includes(domain))
        .slice()
        .sort((a, b) => {
          const roleRank = (role?: string | null) =>
            role === 'Accountable' ? 0 : role === 'Responsible' ? 1 : 2;
          return roleRank(a.accountabilityRole) - roleRank(b.accountabilityRole)
            || a.jobPosition.localeCompare(b.jobPosition);
        }),
    }));

    if (!selected) {
      groups.push({
        domain: 'Unassigned',
        seats: rows.filter((row) => !(row.scopeTags || []).length),
      });
    }

    return groups;
  });

  orgRoots = computed(() => {
    const rows = this.filtered();
    const ids = new Set(rows.map((r) => r.id));
    const byParent = new Map<number, AccountabilityEntry[]>();
    for (const row of rows) {
      const parent = row.reportsToId && ids.has(row.reportsToId) ? row.reportsToId : 0;
      const list = byParent.get(parent) || [];
      list.push(row);
      byParent.set(parent, list);
    }
    const build = (parentId: number): OrgNode[] =>
      (byParent.get(parentId) || []).map((row) => ({ row, children: build(row.id) }));
    return build(0);
  });

  filteredEmployees = computed(() => {
    const q = this.employeeQuery().trim().toLowerCase();
    const rows = this.employees();
    if (!q) return rows.slice(0, 80);
    return rows
      .filter((emp) => {
        const title = this.employeeTitle(emp).toLowerCase();
        return (
          (emp.name || '').toLowerCase().includes(q) ||
          (emp.email || '').toLowerCase().includes(q) ||
          (emp.alias || '').toLowerCase().includes(q) ||
          title.includes(q)
        );
      })
      .slice(0, 80);
  });

  ngOnInit(): void {
    this.reload();
    this.loadEmployees();
  }

  @HostListener('document:click')
  closeEmployeeList(): void {
    this.showEmployeeList.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.detailRow()) this.closeDetails();
  }

  openDetails(row: AccountabilityEntry, event?: Event): void {
    event?.stopPropagation();
    this.detailRow.set(row);
  }

  closeDetails(): void {
    this.detailRow.set(null);
  }

  editFromDetails(): void {
    const row = this.detailRow();
    if (!row) return;
    this.closeDetails();
    this.openEdit(row);
  }

  reload(): void {
    this.loading.set(true);
    this.api.load().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load accountability chart');
      },
    });
    this.api.loadScopes().subscribe({
      error: () => this.toast.error('Failed to load scopes'),
    });
  }

  addScope(assignToForm = false): void {
    const name = this.newScopeName.trim();
    if (name.length < 2) {
      this.toast.error('Enter a scope name');
      return;
    }
    if (this.domainNames().some((item) => item.toLowerCase() === name.toLowerCase())) {
      this.toast.error('That scope already exists');
      return;
    }
    this.savingScope.set(true);
    this.api.createScope(name).subscribe({
      next: (scope) => {
        this.savingScope.set(false);
        this.newScopeName = '';
        this.showAddScope.set(false);
        if (assignToForm) this.toggleDomain(scope.name);
        this.toast.success('Scope added');
      },
      error: (err) => {
        this.savingScope.set(false);
        this.toast.error(err?.error?.error || 'Failed to add scope');
      },
    });
  }

  async removeScope(name: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    const scope = this.scopes().find((item) => item.name === name);
    if (!scope || scope.isSystem || scope.id < 0) {
      this.toast.error('Built-in scopes cannot be removed');
      return;
    }
    const ok = await this.confirm.danger(`Remove scope "${name}"? Seats keep the tag until you edit them.`, 'Remove Scope');
    if (!ok) return;
    this.api.deleteScope(scope.id).subscribe({
      next: () => {
        if (this.domainFilter() === name) this.domainFilter.set('');
        this.toast.success('Scope removed');
      },
      error: (err) => this.toast.error(err?.error?.error || 'Failed to remove scope'),
    });
  }

  canRemoveScope(name: string): boolean {
    const scope = this.scopes().find((item) => item.name === name);
    return !!scope && !scope.isSystem && scope.id > 0;
  }

  openNew(): void {
    this.editingId.set(null);
    this.form = this.blankForm();
    this.resetEmployeePicker();
    this.showForm.set(true);
  }

  openEdit(row: AccountabilityEntry): void {
    this.editingId.set(row.id);
    this.form = {
      jobPosition: row.jobPosition,
      individual: row.individual || '',
      notes: row.notes || '',
      employeeId: row.employeeId ?? null,
      reportsToId: row.reportsToId ?? null,
      accountabilityRole: (row.accountabilityRole as AccountabilityRole) || 'Accountable',
      seatStatus: (row.seatStatus as SeatStatus) || 'Active',
      effectiveStart: this.toDateInput(row.effectiveStart),
      effectiveEnd: this.toDateInput(row.effectiveEnd),
      scopeTags: [...(row.scopeTags || [])],
      keyResults: [...(row.keyResults || [])],
    };
    if (!this.form.keyResults?.length) this.form.keyResults = [''];
    this.syncEmployeePicker(row);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
    this.resetEmployeePicker();
  }

  onEmployeeQuery(value: string): void {
    this.employeeQuery.set(value);
    this.form.individual = value;
    this.form.employeeId = null;
    this.selectedEmployeeId.set(null);
    this.showEmployeeList.set(true);
  }

  pickEmployee(emp: RosterEmployee, event?: Event): void {
    event?.stopPropagation();
    const name = (emp.name || '').trim();
    const title = this.employeeTitle(emp);
    this.selectedEmployeeId.set(emp.id);
    this.employeeQuery.set(name);
    this.form.individual = name;
    this.form.employeeId = emp.id;
    if (title) this.form.jobPosition = title;
    this.showEmployeeList.set(false);
  }

  toggleDomain(tag: string): void {
    const current = this.form.scopeTags || [];
    this.form.scopeTags = current.includes(tag)
      ? current.filter((item) => item !== tag)
      : [...current, tag];
  }

  hasDomain(tag: string): boolean {
    return (this.form.scopeTags || []).includes(tag);
  }

  addKpi(): void {
    const current = this.form.keyResults || [];
    if (current.length >= 5) return;
    this.form.keyResults = [...current, ''];
  }

  removeKpi(index: number): void {
    const current = [...(this.form.keyResults || [])];
    current.splice(index, 1);
    this.form.keyResults = current.length ? current : [''];
  }

  updateKpi(index: number, value: string): void {
    if (!this.form.keyResults) this.form.keyResults = [''];
    this.form.keyResults[index] = value;
  }

  trackByIndex(index: number): number {
    return index;
  }

  employeeTitle(emp: RosterEmployee | null | undefined): string {
    if (!emp) return '';
    return String(emp.position?.title || emp.jobTitle || '').trim();
  }

  employeePhone(emp: RosterEmployee | null | undefined): string {
    if (!emp) return '';
    return String(emp.cellPhone || emp.workPhone || emp.phone || '').trim();
  }

  employeeDepartment(emp: RosterEmployee | null | undefined): string {
    return String(emp?.department?.name || '').trim();
  }

  employeeOrg(emp: RosterEmployee | null | undefined): string {
    return String(emp?.organization?.name || '').trim();
  }

  employeeEntity(emp: RosterEmployee | null | undefined): string {
    if (!emp) return '';
    if (emp.satellite?.name) {
      return emp.satellite.code ? `${emp.satellite.name} (${emp.satellite.code})` : emp.satellite.name;
    }
    if (emp.agency?.name) {
      return emp.agency.code ? `${emp.agency.name} (${emp.agency.code})` : emp.agency.name;
    }
    if (emp.terminal?.name) {
      return emp.terminal.code ? `${emp.terminal.name} (${emp.terminal.code})` : emp.terminal.name;
    }
    return '';
  }

  employeeLocation(emp: RosterEmployee | null | undefined): string {
    if (!emp) return '';
    return [emp.city, emp.state].filter(Boolean).join(', ');
  }

  initials(name: string | null | undefined): string {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  rosterFor(row: AccountabilityEntry): RosterEmployee | null {
    if (row.employeeId) {
      const byId = this.employees().find((emp) => emp.id === row.employeeId);
      if (byId) return byId;
    }
    return this.findEmployeeByName(row.individual || '') ?? null;
  }

  reportsToLabel(row: AccountabilityEntry): string {
    if (!row.reportsToId) return '';
    const parent = this.entries().find((item) => item.id === row.reportsToId);
    if (!parent) return '';
    return parent.individual ? `${parent.jobPosition} · ${parent.individual}` : parent.jobPosition;
  }

  roleHint(role: string | null | undefined): string {
    return this.roles.find((item) => item.value === role)?.hint || '';
  }

  dateRange(row: AccountabilityEntry): string {
    const start = this.toDateInput(row.effectiveStart);
    const end = this.toDateInput(row.effectiveEnd);
    if (!start && !end) return '';
    if (start && end) return `${start} → ${end}`;
    if (start) return `From ${start}`;
    return `Until ${end}`;
  }

  updatedLabel(row: AccountabilityEntry): string {
    if (!row.updatedAt) return '';
    const when = new Date(row.updatedAt);
    const stamp = Number.isNaN(when.getTime()) ? row.updatedAt : when.toLocaleDateString();
    return row.updatedBy ? `${stamp} · ${row.updatedBy}` : stamp;
  }

  save(): void {
    const jobPosition = (this.form.jobPosition || '').trim();
    if (!jobPosition) {
      this.toast.error('Job position is required');
      return;
    }

    const typedName = (this.form.individual || this.employeeQuery() || '').trim();
    const matched =
      this.employees().find((emp) => emp.id === this.selectedEmployeeId()) ||
      this.findEmployeeByName(typedName);
    const individual = matched?.name?.trim() || typedName || null;
    const reportsToId = this.form.reportsToId ? Number(this.form.reportsToId) : null;
    if (reportsToId && reportsToId === this.editingId()) {
      this.toast.error('A seat cannot report to itself');
      return;
    }

    const payload: AccountabilityWritePayload = {
      jobPosition,
      individual,
      notes: (this.form.notes || '').trim() || null,
      employeeId: matched?.id ?? null,
      reportsToId,
      accountabilityRole: this.form.accountabilityRole || 'Accountable',
      seatStatus: this.form.seatStatus || 'Active',
      effectiveStart: this.form.effectiveStart || null,
      effectiveEnd: this.form.effectiveEnd || null,
      scopeTags: this.form.scopeTags || [],
      keyResults: (this.form.keyResults || []).map((item) => item.trim()).filter(Boolean),
    };

    this.saving.set(true);
    const id = this.editingId();
    const req$ = id == null ? this.api.create(payload) : this.api.update(id, payload);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.editingId.set(null);
        this.resetEmployeePicker();
        this.toast.success(id == null ? 'Position added' : 'Position updated');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error || 'Save failed');
      },
    });
  }

  async remove(row: AccountabilityEntry): Promise<void> {
    const ok = await this.confirm.danger(
      `Remove "${row.jobPosition}" from the accountability chart? Direct reports will be unlinked.`,
      'Remove Position'
    );
    if (!ok) return;

    this.api.delete(row.id).subscribe({
      next: () => {
        if (this.detailRow()?.id === row.id) this.closeDetails();
        this.toast.success('Position removed');
      },
      error: () => this.toast.error('Failed to remove position'),
    });
  }

  private blankForm(): AccountabilityWritePayload {
    return {
      jobPosition: '',
      individual: '',
      notes: '',
      employeeId: null,
      reportsToId: null,
      accountabilityRole: 'Accountable',
      seatStatus: 'Active',
      effectiveStart: '',
      effectiveEnd: '',
      scopeTags: [],
      keyResults: [''],
    };
  }

  private resetEmployeePicker(): void {
    this.employeeQuery.set('');
    this.selectedEmployeeId.set(null);
    this.showEmployeeList.set(false);
  }

  private syncEmployeePicker(row: AccountabilityEntry): void {
    const match =
      (row.employeeId ? this.employees().find((emp) => emp.id === row.employeeId) : undefined) ||
      this.findEmployeeByName(row.individual || '');
    this.employeeQuery.set(match?.name || row.individual || '');
    this.selectedEmployeeId.set(match?.id ?? row.employeeId ?? null);
    this.form.employeeId = match?.id ?? row.employeeId ?? null;
    this.showEmployeeList.set(false);
  }

  private findEmployeeByName(name: string): RosterEmployee | undefined {
    const needle = name.trim().toLowerCase();
    if (!needle) return undefined;
    return this.employees().find((emp) => (emp.name || '').trim().toLowerCase() === needle);
  }

  private toDateInput(value?: string | null): string {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  private directReportIds(): Set<number> {
    const userId = Number(this.auth.currentUser()?.id);
    if (!userId) return new Set();
    const mySeats = this.entries().filter((row) => row.employeeId === userId).map((row) => row.id);
    return new Set(
      this.entries()
        .filter((row) => row.reportsToId != null && mySeats.includes(row.reportsToId))
        .map((row) => row.id)
    );
  }

  private async loadEmployees(): Promise<void> {
    try {
      const limit = 250;
      const firstUrl = this.orgContext.addOrgParam(
        `${environment.apiUrl}/api/v1/employee-roster?limit=${limit}&status=active`
      );
      const firstResponse: any = await this.http.get(firstUrl).toPromise();
      const firstData = Array.isArray(firstResponse?.data) ? firstResponse.data : [];
      const totalPages = Math.max(1, Number(firstResponse?.meta?.pages || 1));
      const allRows: RosterEmployee[] = [...firstData];

      for (let page = 2; page <= totalPages; page++) {
        const pageUrl = this.orgContext.addOrgParam(
          `${environment.apiUrl}/api/v1/employee-roster?limit=${limit}&status=active&page=${page}`
        );
        const pageResponse: any = await this.http.get(pageUrl).toPromise();
        if (Array.isArray(pageResponse?.data) && pageResponse.data.length) {
          allRows.push(...pageResponse.data);
        }
      }

      this.employees.set(
        allRows
          .filter((emp) => emp?.id && (emp.name || '').trim())
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      );
    } catch {
      this.employees.set([]);
    }
  }
}
