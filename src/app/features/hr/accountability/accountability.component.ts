import {
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { OrgChart } from 'd3-org-chart';
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
  departmentId?: number | null;
  department?: { id?: number | null; name?: string | null } | null;
  organization?: { name?: string | null } | null;
  satellite?: { name?: string | null; code?: string | null } | null;
  agency?: { name?: string | null; code?: string | null } | null;
  terminal?: { name?: string | null; code?: string | null } | null;
}

interface OrgChartNode {
  id: number;
  parentId: number | null;
  position: string;
  name: string;
  role: string;
  status: string;
  domains: string[];
  avatar: string;
  initials: string;
  isRoot?: boolean;
  kind?: 'seat' | 'org' | 'division' | 'department' | 'person';
  employeeId?: number | null;
}

interface DepartmentRow {
  id: number;
  name: string;
  code?: string | null;
  status?: string | null;
  organizationName?: string | null;
  divisionId?: number | null;
  divisionName?: string | null;
  managerName?: string | null;
  employeeCount?: number;
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
export class AccountabilityComponent implements OnInit, OnDestroy {
  private api = inject(AccountabilityService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private orgContext = inject(OrganizationContextService);
  private auth = inject(AuthService);
  private zone = inject(NgZone);
  private orgChartHost = viewChild<ElementRef<HTMLDivElement>>('orgChartHost');
  private orgChart: OrgChart<OrgChartNode> | null = null;

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
  chartTab = signal<'employee' | 'departments'>('employee');
  chartFullscreen = signal(false);
  departments = signal<DepartmentRow[]>([]);
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

  orgChartData = computed<OrgChartNode[]>(() => {
    const rows = this.filtered();
    const ids = new Set(rows.map((r) => r.id));
    const nodes = rows.map((row) => {
      const emp = this.rosterFor(row);
      const vacant = row.seatStatus === 'Vacant' && !row.individual;
      return {
        id: row.id,
        parentId: row.reportsToId && ids.has(row.reportsToId) ? row.reportsToId : null,
        position: row.jobPosition,
        name: vacant ? 'Vacant' : row.individual || emp?.name || 'Unassigned',
        role: row.accountabilityRole || 'Accountable',
        status: row.seatStatus || 'Active',
        domains: (row.scopeTags || []).slice(0, 2),
        avatar: emp?.avatarUrl || '',
        initials: this.initials(row.individual || emp?.name || row.jobPosition),
        kind: 'seat' as const,
        employeeId: row.employeeId ?? emp?.id ?? null,
      } satisfies OrgChartNode;
    });
    const roots = nodes.filter((node) => node.parentId == null);
    if (roots.length <= 1) return nodes;
    return [
      {
        id: 0,
        parentId: null,
        position: 'Accountability',
        name: 'Operating chart',
        role: '',
        status: 'Active',
        domains: [],
        avatar: '',
        initials: 'AC',
        isRoot: true,
      },
      ...nodes.map((node) => (node.parentId == null ? { ...node, parentId: 0 } : node)),
    ];
  });

  departmentChartData = computed<OrgChartNode[]>(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const domain = this.domainFilter();
    const depts = this.departments();
    const people = this.employees().filter((emp) => {
      if (domain) {
        const seat = this.entries().find((row) => row.employeeId === emp.id);
        if (seat && !(seat.scopeTags || []).includes(domain)) return false;
      }
      return true;
    });

    const DIV = 2_000_000;
    const DEPT = 3_000_000;
    const EMP = 4_000_000;
    const UNASSIGNED = -1;
    const nodes: OrgChartNode[] = [{
      id: 0,
      parentId: null,
      position: 'Departments',
      name: depts.length ? `${depts.length} departments` : 'Operating structure',
      role: '',
      status: 'Active',
      domains: [],
      avatar: '',
      initials: 'DP',
      isRoot: true,
      kind: 'org',
    }];

    const divisions = new Map<number, string>();
    for (const dept of depts) {
      if (dept.divisionId && dept.divisionName) divisions.set(dept.divisionId, dept.divisionName);
    }
    for (const [id, name] of divisions) {
      nodes.push({
        id: DIV + id,
        parentId: 0,
        position: name,
        name: 'Division',
        role: 'Division',
        status: 'Active',
        domains: [],
        avatar: '',
        initials: this.initials(name),
        kind: 'division',
      });
    }

    const knownDeptIds = new Set(depts.map((dept) => dept.id));
    for (const dept of depts) {
      const rosterCount = people.filter((emp) => this.employeeDepartmentId(emp) === dept.id).length;
      nodes.push({
        id: DEPT + dept.id,
        parentId: dept.divisionId && divisions.has(dept.divisionId) ? DIV + dept.divisionId : 0,
        position: dept.name,
        name: dept.managerName || 'No manager assigned',
        role: `${rosterCount || dept.employeeCount || 0} people`,
        status: dept.status || 'Active',
        domains: dept.code ? [dept.code] : [],
        avatar: '',
        initials: this.initials(dept.name),
        kind: 'department',
      });
    }

    const assigned = new Set<number>();
    for (const emp of people) {
      const deptId = this.employeeDepartmentId(emp);
      if (!deptId || !knownDeptIds.has(deptId)) continue;
      assigned.add(emp.id);
      nodes.push(this.personNode(EMP + emp.id, DEPT + deptId, emp));
    }

    const unassigned = people.filter((emp) => !assigned.has(emp.id));
    if (unassigned.length) {
      nodes.push({
        id: UNASSIGNED,
        parentId: 0,
        position: 'Unassigned',
        name: `${unassigned.length} people without a department`,
        role: 'Unassigned',
        status: 'Vacant',
        domains: [],
        avatar: '',
        initials: 'NA',
        kind: 'department',
      });
      for (const emp of unassigned) {
        nodes.push(this.personNode(EMP + emp.id, UNASSIGNED, emp));
      }
    }

    if (!query) return nodes;
    return this.filterChartTree(nodes, query);
  });

  activeOrgChartData = computed(() =>
    this.chartTab() === 'departments' ? this.departmentChartData() : this.orgChartData()
  );

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

  constructor() {
    effect(() => {
      const mode = this.viewMode();
      const tab = this.chartTab();
      const data = this.activeOrgChartData();
      const host = this.orgChartHost()?.nativeElement ?? null;
      untracked(() => this.syncOrgChart(mode, tab, host, data));
    });
  }

  ngOnInit(): void {
    this.reload();
    this.loadEmployees();
    this.loadDepartments();
  }

  ngOnDestroy(): void {
    this.setChartFullscreen(false);
    this.destroyOrgChart();
  }

  setView(mode: 'list' | 'chart' | 'scope'): void {
    if (mode !== 'chart') this.setChartFullscreen(false);
    this.viewMode.set(mode);
  }

  toggleChartFullscreen(): void {
    this.setChartFullscreen(!this.chartFullscreen());
  }

  setChartFullscreen(on: boolean): void {
    this.chartFullscreen.set(on);
    this.scheduleOrgChartResize();
  }

  setChartTab(tab: 'employee' | 'departments'): void {
    if (this.chartTab() === tab) return;
    this.chartTab.set(tab);
    this.destroyOrgChart();
  }

  fitOrgChart(): void {
    this.orgChart?.fit();
  }

  expandOrgChart(): void {
    this.orgChart?.expandAll().fit();
  }

  collapseOrgChart(): void {
    this.orgChart?.collapseAll().fit();
  }

  exportOrgChart(): void {
    this.orgChart?.exportImg({ full: true, backgroundColor: '#121225' });
  }

  @HostListener('document:click')
  closeEmployeeList(): void {
    this.showEmployeeList.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.detailRow()) {
      this.closeDetails();
      return;
    }
    if (this.chartFullscreen()) this.setChartFullscreen(false);
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

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.viewMode() === 'chart') this.resizeOrgChart();
  }

  private employeeDepartmentId(emp: RosterEmployee): number | null {
    const fromField = Number(emp.departmentId);
    if (Number.isFinite(fromField) && fromField > 0) return fromField;
    const fromNested = Number(emp.department?.id);
    if (Number.isFinite(fromNested) && fromNested > 0) return fromNested;
    return null;
  }

  private personNode(id: number, parentId: number, emp: RosterEmployee): OrgChartNode {
    return {
      id,
      parentId,
      position: this.employeeTitle(emp) || emp.role || 'Employee',
      name: emp.name,
      role: this.employeeDepartment(emp) || 'Roster',
      status: emp.status || 'Active',
      domains: [],
      avatar: emp.avatarUrl || '',
      initials: this.initials(emp.name),
      kind: 'person',
      employeeId: emp.id,
    };
  }

  private filterChartTree(nodes: OrgChartNode[], query: string): OrgChartNode[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const children = new Map<number, number[]>();
    for (const node of nodes) {
      if (node.parentId == null) continue;
      const list = children.get(node.parentId) || [];
      list.push(node.id);
      children.set(node.parentId, list);
    }

    const matches = (node: OrgChartNode) =>
      node.position.toLowerCase().includes(query)
      || node.name.toLowerCase().includes(query)
      || node.role.toLowerCase().includes(query)
      || node.domains.some((tag) => tag.toLowerCase().includes(query));

    const keep = new Set<number>();
    const addAncestors = (id: number) => {
      let current: OrgChartNode | undefined = byId.get(id);
      while (current) {
        keep.add(current.id);
        current = current.parentId == null ? undefined : byId.get(current.parentId);
      }
    };
    const addDescendants = (id: number) => {
      keep.add(id);
      for (const childId of children.get(id) || []) addDescendants(childId);
    };

    for (const node of nodes) {
      if (!matches(node)) continue;
      addAncestors(node.id);
      if (node.kind === 'org' || node.kind === 'division' || node.kind === 'department') {
        addDescendants(node.id);
      }
    }

    return nodes.filter((node) => keep.has(node.id));
  }

  private async loadDepartments(): Promise<void> {
    try {
      const url = this.orgContext.addOrgParam(
        `${environment.apiUrl}/api/v1/departments?pageSize=500&adminReport=true&includeAll=true`
      );
      const response: any = await this.http.get(url).toPromise();
      const rows = Array.isArray(response?.data) ? response.data : [];
      this.departments.set(
        rows
          .filter((row: any) => row?.id && (row.name || '').trim())
          .map((row: any) => ({
            id: Number(row.id),
            name: String(row.name || '').trim(),
            code: row.code || null,
            status: row.status || 'active',
            organizationName: row.organizationName || null,
            divisionId: row.divisionId ? Number(row.divisionId) : null,
            divisionName: row.divisionName || null,
            managerName: row.managerName || null,
            employeeCount: Number(row.employeeCount || 0),
          }))
          .sort((a: DepartmentRow, b: DepartmentRow) => a.name.localeCompare(b.name))
      );
    } catch {
      this.departments.set([]);
    }
  }

  private syncOrgChart(
    mode: 'list' | 'chart' | 'scope',
    tab: 'employee' | 'departments',
    host: HTMLDivElement | null,
    data: OrgChartNode[]
  ): void {
    if (mode !== 'chart' || !host || !data.length) {
      if (mode !== 'chart') this.destroyOrgChart();
      return;
    }

    const width = Math.max(host.clientWidth, 320);
    const height = Math.max(host.clientHeight, 520);

    if (!this.orgChart) {
      this.orgChart = new OrgChart<OrgChartNode>()
        .container(host)
        .nodeWidth(() => 268)
        .nodeHeight((d: any) => {
          const node = d?.data || d;
          if (node?.isRoot || node?.kind === 'org' || node?.kind === 'division') return 86;
          return 122;
        })
        .childrenMargin(() => 48)
        .siblingsMargin(() => 18)
        .compactMarginPair(() => 36)
        .compactMarginBetween(() => 14)
        .compact(true)
        .scaleExtent([0.55, 2.4])
        .layout('top')
        .initialExpandLevel(tab === 'departments' ? 1 : 8)
        .duration(350)
        .defaultFont('Inter, Segoe UI, sans-serif')
        .imageName('accountability-org-chart')
        .nodeContent((node: any) => this.orgNodeHtml(node?.data as OrgChartNode))
        .buttonContent(({ node }) => {
          const count = node?.data?._directSubordinatesPaging ?? node?.data?._directSubordinates ?? '';
          return `<div style="width:28px;height:28px;border-radius:999px;background:#1a1a2e;border:1px solid #4fc3f7;color:#7dd3fc;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${count}</div>`;
        })
        .linkUpdate(function (this: any) {
          this.setAttribute('stroke', '#3d3d5c');
          this.setAttribute('stroke-width', '1.5');
        })
        .onNodeClick((node: any) => {
          const dataNode = node?.data as OrgChartNode | undefined;
          if (!dataNode || dataNode.isRoot || dataNode.kind === 'org' || dataNode.kind === 'division' || dataNode.kind === 'department') {
            return;
          }
          this.zone.run(() => {
            const bySeat = this.entries().find((item) => item.id === dataNode.id && dataNode.kind !== 'person');
            const byEmployee = dataNode.employeeId
              ? this.entries().find((item) => item.employeeId === dataNode.employeeId)
              : undefined;
            const row = bySeat || byEmployee;
            if (row) this.openDetails(row);
          });
        });
    }

    const compact = tab === 'departments' || data.length > 8;
    this.orgChart
      .compact(compact)
      .svgWidth(width)
      .svgHeight(height)
      .data(data)
      .render();

    if (tab === 'employee' && data.length <= 20) {
      this.orgChart.expandAll();
    }
    this.orgChart.fit();
  }

  private scheduleOrgChartResize(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.resizeOrgChart());
    });
  }

  private resizeOrgChart(): void {
    const host = this.orgChartHost()?.nativeElement;
    if (!this.orgChart || !host) return;
    this.orgChart
      .svgWidth(Math.max(host.clientWidth, 320))
      .svgHeight(Math.max(host.clientHeight, 320))
      .render()
      .fit();
  }

  private destroyOrgChart(): void {
    this.orgChart = null;
    const host = this.orgChartHost()?.nativeElement;
    if (host) host.innerHTML = '';
  }

  private orgNodeHtml(node: OrgChartNode | undefined): string {
    if (!node) return '';
    const position = this.escapeHtml(node.position || '');
    const name = this.escapeHtml(node.name || '');
    if (node.isRoot) {
      return `
        <div style="width:100%;height:100%;padding:12px 14px;box-sizing:border-box;background:#16162a;border:1px solid #4fc3f7;border-radius:12px;display:flex;flex-direction:column;justify-content:center;gap:4px;">
          <div style="color:#fff;font-weight:700;font-size:14px;">${position}</div>
          <div style="color:#8e8ea8;font-size:12px;">${name}</div>
        </div>`;
    }
    const role = this.escapeHtml(node.role || '');
    const status = this.escapeHtml(node.status || '');
    const statusColor = node.status === 'Vacant' ? '#fca5a5'
      : node.status === 'Interim' ? '#fcd34d'
      : node.status === 'Transitioning' ? '#93c5fd'
      : '#86efac';
    const statusBg = node.status === 'Vacant' ? 'rgba(239,68,68,.14)'
      : node.status === 'Interim' ? 'rgba(245,158,11,.14)'
      : node.status === 'Transitioning' ? 'rgba(59,130,246,.14)'
      : 'rgba(34,197,94,.12)';
    const chips = (node.domains || [])
      .map((tag) => `<span style="display:inline-block;max-width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#121225;border:1px solid #2d2d46;color:#b8b8d0;border-radius:999px;padding:2px 7px;font-size:10px;">${this.escapeHtml(tag)}</span>`)
      .join('');
    const avatar = node.avatar
      ? `<img src="${this.escapeHtml(node.avatar)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
      : `<div style="width:36px;height:36px;border-radius:50%;background:rgba(79,195,247,.18);color:#4fc3f7;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${this.escapeHtml(node.initials || '')}</div>`;
    return `
      <div style="width:100%;height:100%;padding:10px 12px;box-sizing:border-box;background:#1a1a2e;border:1px solid #2d2d46;border-radius:12px;display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${avatar}
          <div style="min-width:0;flex:1;">
            <div style="color:#fff;font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${position}</div>
            <div style="color:#e8e8f0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
          </div>
          <span style="flex-shrink:0;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:700;color:${statusColor};background:${statusBg};">${status}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span style="color:#8e8ea8;font-size:11px;">${role}</span>
          <div style="display:flex;gap:4px;min-width:0;">${chips}</div>
        </div>
      </div>`;
  }

  private escapeHtml(value: string): string {
    return String(value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch
    ));
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
