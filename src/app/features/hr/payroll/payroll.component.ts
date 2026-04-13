import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="payroll-page">
      <div class="payroll-header">
        <div>
          <h1><i class="bx bx-dollar-circle"></i> Payroll</h1>
          <p class="payroll-sub">Employee payroll management</p>
        </div>
        <div class="payroll-actions">
          <select class="payroll-filter" [ngModel]="periodFilter()" (ngModelChange)="periodFilter.set($event)">
            @for (p of periodOptions; track p.value) {
              <option [value]="p.value">{{ p.label }}</option>
            }
          </select>
          <button class="payroll-btn" (click)="loadData()"><i class="bx bx-refresh"></i> Refresh</button>
        </div>
      </div>

      <!-- Stats -->
      <div class="payroll-stats">
        <div class="payroll-stat">
          <i class="bx bx-group"></i>
          <div class="payroll-stat-info">
            <span class="payroll-stat-val">{{ scopedEmployees().length }}</span>
            <span class="payroll-stat-lbl">Employees</span>
          </div>
        </div>
        <div class="payroll-stat">
          <i class="bx bx-dollar"></i>
          <div class="payroll-stat-info">
            <span class="payroll-stat-val">\${{ totalPayroll() | number:'1.2-2' }}</span>
            <span class="payroll-stat-lbl">Total Payroll</span>
          </div>
        </div>
        <div class="payroll-stat">
          <i class="bx bx-check-circle"></i>
          <div class="payroll-stat-info">
            <span class="payroll-stat-val">{{ processedCount() }}</span>
            <span class="payroll-stat-lbl">Processed</span>
          </div>
        </div>
        <div class="payroll-stat">
          <i class="bx bx-time-five"></i>
          <div class="payroll-stat-info">
            <span class="payroll-stat-val">{{ pendingCount() }}</span>
            <span class="payroll-stat-lbl">Pending</span>
          </div>
        </div>
      </div>

      <div class="payroll-org-tabs">
        @for (item of organizationTabs(); track item) {
          <button
            class="payroll-org-tab"
            [class.active]="selectedOrganization() === item"
            (click)="setOrganization(item)"
          >
            {{ item }}
          </button>
        }
      </div>

      <!-- Structure Tabs -->
      <div class="payroll-structure-types">
        @for (type of structureTypes; track type.value) {
          <button
            class="payroll-structure-type-tab"
            [class.active]="selectedStructureType() === type.value"
            (click)="setStructureType(type.value)"
          >
            {{ type.label }}
          </button>
        }
      </div>

      <div class="payroll-org-tabs">
        @for (item of structureTabs(); track item) {
          <button
            class="payroll-org-tab"
            [class.active]="selectedStructureTab() === item"
            (click)="selectedStructureTab.set(item)"
          >
            {{ item }}
          </button>
        }
      </div>

      <!-- Search -->
      <div class="payroll-search">
        <i class="bx bx-search"></i>
        <input type="text" placeholder="Search employees..." [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)">
      </div>

      <!-- Payroll Table -->
      <div class="payroll-table-wrap">
        <table class="payroll-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Pay Type</th>
              <th>Pay Rate</th>
              <th>Hours</th>
              <th>Gross Pay</th>
              <th>Deductions</th>
              <th>Net Pay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @for (emp of filteredEmployees(); track emp.id) {
              <tr>
                <td class="payroll-emp-cell">
                  <div class="payroll-avatar">{{ (emp.name || 'E').charAt(0) }}</div>
                  <div class="payroll-emp-info">
                    <strong>{{ emp.name }}</strong>
                    <span>{{ emp.email }}</span>
                  </div>
                </td>
                <td><span class="payroll-type-badge">{{ emp.payType || 'salary' }}</span></td>
                <td class="payroll-mono">\${{ emp.payRate || 0 | number:'1.2-2' }}</td>
                <td>{{ emp.hours || 0 }}</td>
                <td class="payroll-mono">\${{ emp.grossPay || 0 | number:'1.2-2' }}</td>
                <td class="payroll-mono payroll-deduction">-\${{ emp.deductions || 0 | number:'1.2-2' }}</td>
                <td class="payroll-mono payroll-net">\${{ emp.netPay || 0 | number:'1.2-2' }}</td>
                <td>
                  <span class="payroll-status" [class]="emp.payrollStatus || 'pending'">{{ emp.payrollStatus || 'pending' }}</span>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="payroll-empty">No payroll data for this period</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .payroll-page { padding: 1.5rem; }
    .payroll-header {
      display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;
      h1 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; margin: 0;
        i { color: var(--cyan); }
      }
      .payroll-sub { color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem; }
    }
    .payroll-actions { display: flex; gap: 0.75rem; align-items: center; }
    .payroll-filter {
      padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px; color: var(--text-primary); font-size: 0.85rem; outline: none;
      &:focus { border-color: var(--cyan); }
      option { background: #0a0a0f; }
    }
    .payroll-btn {
      display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem;
      border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
      color: var(--text-primary); font-size: 0.85rem; cursor: pointer; transition: all 0.2s;
      &:hover { border-color: var(--cyan); background: rgba(0,212,255,0.08); }
    }
    .payroll-stats {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 1.5rem;
    }
    .payroll-stat {
      display: flex; align-items: center; gap: 14px; padding: 18px 20px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(0,212,255,0.1); border-radius: 12px;
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      i { font-size: 1.5rem; color: var(--cyan); }
    }
    .payroll-stat-info { display: flex; flex-direction: column; }
    .payroll-stat-val { font-size: 1.3rem; font-weight: 700; color: var(--text-primary); }
    .payroll-stat-lbl { font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
    .payroll-search {
      position: relative; margin-bottom: 1rem; display: flex; align-items: center;
      i { position: absolute; left: 12px; color: var(--text-secondary); font-size: 1rem; }
      input { width: 100%; padding: 0.6rem 1rem 0.6rem 2.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; color: var(--text-primary); font-size: 0.85rem;
        &:focus { outline: none; border-color: rgba(0,212,255,0.3); }
        &::placeholder { color: var(--text-secondary); }
      }
    }
    .payroll-structure-types {
      display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 0.9rem;
    }
    .payroll-structure-type-tab {
      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07);
      color: var(--text-secondary); border-radius: 8px; padding: 0.35rem 0.7rem;
      font-size: 0.74rem; cursor: pointer; transition: all 0.2s;
      &:hover { border-color: rgba(0,212,255,0.25); color: var(--text-primary); }
      &.active { border-color: var(--cyan); color: var(--text-primary); background: rgba(0,212,255,0.08); }
    }
    .payroll-org-tabs {
      display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 0.55rem;
    }
    .payroll-org-tab {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
      color: var(--text-secondary); border-radius: 999px; padding: 0.4rem 0.85rem;
      font-size: 0.78rem; cursor: pointer; transition: all 0.2s;
      &:hover { border-color: rgba(0,212,255,0.25); color: var(--text-primary); }
      &.active { border-color: var(--cyan); color: var(--text-primary); background: rgba(0,212,255,0.12); }
    }
    .payroll-table-wrap {
      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden;
    }
    .payroll-table {
      width: 100%; border-collapse: collapse;
      th, td { padding: 12px 16px; text-align: left; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
      th { color: var(--cyan); font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; background: rgba(0,212,255,0.03); }
      td { color: var(--text-primary); }
      tbody tr:hover { background: rgba(0,212,255,0.03); }
      tbody tr:last-child td { border-bottom: none; }
    }
    .payroll-emp-cell { display: flex; align-items: center; gap: 10px; }
    .payroll-avatar {
      width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--cyan, #00d4ff), #0080ff);
      display: flex; align-items: center; justify-content: center; color: #0a0a14; font-weight: 700; font-size: 0.9rem; flex-shrink: 0;
    }
    .payroll-emp-info { display: flex; flex-direction: column;
      strong { font-size: 0.88rem; }
      span { font-size: 0.72rem; color: var(--text-secondary); }
    }
    .payroll-mono { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.85rem; }
    .payroll-deduction { color: #ff4444; }
    .payroll-net { color: #00ff88; font-weight: 600; }
    .payroll-type-badge {
      padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; text-transform: capitalize;
      background: rgba(0,212,255,0.08); color: var(--cyan); border: 1px solid rgba(0,212,255,0.15);
    }
    .payroll-status {
      padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; text-transform: capitalize;
      &.pending { background: rgba(251,191,36,0.1); color: #fbbf24; }
      &.processed { background: rgba(0,255,136,0.1); color: #00ff88; }
      &.paid { background: rgba(0,170,255,0.1); color: #00aaff; }
    }
    .payroll-empty { text-align: center; padding: 40px; color: var(--text-secondary); }
    @media (max-width: 768px) { .payroll-stats { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class PayrollComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  employees = signal<any[]>([]);
  searchTerm = signal('');
  periodFilter = signal('current');
  selectedOrganization = signal('All organizations');
  selectedStructureType = signal<StructureType>('divisions');
  selectedStructureTab = signal('All');

  structureTypes: Array<{ value: StructureType; label: string }> = [
    { value: 'divisions', label: 'Divisions' },
    { value: 'departments', label: 'Departments' },
    { value: 'positions', label: 'Job Positions' },
    { value: 'jobTitles', label: 'Job Titles' },
    { value: 'terminals', label: 'Terminals' },
    { value: 'satellites', label: 'Satellites' },
    { value: 'agencies', label: 'Agencies' }
  ];

  periodOptions = (() => {
    const options = [{ value: 'current', label: 'Current Week' }];
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (i * 7));
      const start = new Date(d);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      options.push({ value: i.toString(), label: `${fmt(start)} – ${fmt(end)}` });
    }
    return options;
  })();

  organizationTabs = computed(() => {
    const names = new Set<string>();
    for (const emp of this.employees()) {
      const org = this.getOrganizationLabel(emp);
      if (org) names.add(org);
    }
    return ['All organizations', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  });

  organizationScopedEmployees = computed(() => {
    const selectedOrg = this.selectedOrganization();
    if (selectedOrg === 'All organizations') return this.employees();
    return this.employees().filter((e) => this.getOrganizationLabel(e) === selectedOrg);
  });

  structureTabs = computed(() => {
    const names = new Set<string>();
    const type = this.selectedStructureType();
    for (const emp of this.organizationScopedEmployees()) {
      const label = this.getStructureLabel(emp, type);
      if (label) names.add(label);
    }
    return ['All', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  });

  scopedEmployees = computed(() => {
    const selected = this.selectedStructureTab();
    if (selected === 'All') return this.organizationScopedEmployees();
    const type = this.selectedStructureType();
    return this.organizationScopedEmployees().filter((e) => {
      const label = this.getStructureLabel(e, type);
      return !!label && label === selected;
    });
  });

  filteredEmployees = computed(() => {
    const search = this.searchTerm().toLowerCase();
    let list = this.scopedEmployees();
    if (search) {
      list = list.filter(e => (e.name || '').toLowerCase().includes(search) || (e.email || '').toLowerCase().includes(search));
    }
    return list;
  });

  totalPayroll = computed(() => this.scopedEmployees().reduce((sum, e) => sum + (e.grossPay || 0), 0));
  processedCount = computed(() => this.scopedEmployees().filter(e => e.payrollStatus === 'processed' || e.payrollStatus === 'paid').length);
  pendingCount = computed(() => this.scopedEmployees().filter(e => !e.payrollStatus || e.payrollStatus === 'pending').length);

  ngOnInit() {
    this.loadData();
  }

  setStructureType(type: StructureType): void {
    if (this.selectedStructureType() === type) return;
    this.selectedStructureType.set(type);
    this.selectedStructureTab.set('All');
  }

  setOrganization(org: string): void {
    if (this.selectedOrganization() === org) return;
    this.selectedOrganization.set(org);
    this.selectedStructureTab.set('All');
  }

  loadData() {
    this.http.get<any>(`${this.apiUrl}/api/v1/users?limit=500&status=active`).subscribe({
      next: (res) => {
        const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        const users = rows.map((u: any) => ({
          ...u,
          payType: u.payType || 'salary',
          payRate: u.payRate || 0,
          hours: 0,
          grossPay: 0,
          deductions: 0,
          netPay: 0,
          payrollStatus: 'pending'
        }));
        this.employees.set(users);
      },
      error: () => this.employees.set([])
    });
  }

  private getStructureLabel(emp: any, type: StructureType): string | null {
    if (!emp || typeof emp !== 'object') return null;

    const pickText = (...values: unknown[]): string | null => {
      for (const value of values) {
        const text = String(value ?? '').trim();
        if (text) return text;
      }
      return null;
    };

    const pickIdLabel = (prefix: string, ...values: unknown[]): string | null => {
      for (const value of values) {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) return `${prefix} ${num}`;
      }
      return null;
    };

    switch (type) {
      case 'divisions':
        return pickText(emp.divisionName, emp.division) ?? pickIdLabel('Division', emp.divisionId);
      case 'departments':
        return pickText(emp.departmentName, emp.department) ?? pickIdLabel('Department', emp.departmentId);
      case 'positions':
        return pickText(emp.positionTitle, emp.position) ?? pickIdLabel('Position', emp.positionId);
      case 'jobTitles':
        return pickText(emp.jobTitle) ?? null;
      case 'terminals':
        return pickText(emp.terminalName, emp.terminal) ?? pickIdLabel('Terminal', emp.terminalId);
      case 'satellites':
        return pickText(emp.satelliteName, emp.satellite) ?? pickIdLabel('Satellite', emp.satelliteId);
      case 'agencies':
        return pickText(emp.agencyName, emp.agency) ?? pickIdLabel('Agency', emp.agencyId);
      default:
        return null;
    }
  }

  private getOrganizationLabel(emp: any): string | null {
    if (!emp || typeof emp !== 'object') return null;
    const byName = String(emp.organizationName ?? emp.organization ?? '').trim();
    if (byName) return byName;
    const byId = Number(emp.organizationId);
    if (Number.isFinite(byId) && byId > 0) return `Organization ${byId}`;
    return null;
  }
}

type StructureType =
  | 'divisions'
  | 'departments'
  | 'positions'
  | 'jobTitles'
  | 'terminals'
  | 'satellites'
  | 'agencies';
