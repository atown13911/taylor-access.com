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
            <span class="payroll-stat-val">{{ employees().length }}</span>
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

  periodOptions = (() => {
    const options = [{ value: 'current', label: 'Current Pay Period' }];
    const now = new Date();
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (i * 14));
      const start = new Date(d);
      const end = new Date(start); end.setDate(end.getDate() + 13);
      const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      options.push({ value: i.toString(), label: `${fmt(start)} – ${fmt(end)}` });
    }
    return options;
  })();

  filteredEmployees = computed(() => {
    const search = this.searchTerm().toLowerCase();
    let list = this.employees();
    if (search) {
      list = list.filter(e => (e.name || '').toLowerCase().includes(search) || (e.email || '').toLowerCase().includes(search));
    }
    return list;
  });

  totalPayroll = computed(() => this.employees().reduce((sum, e) => sum + (e.grossPay || 0), 0));
  processedCount = computed(() => this.employees().filter(e => e.payrollStatus === 'processed' || e.payrollStatus === 'paid').length);
  pendingCount = computed(() => this.employees().filter(e => !e.payrollStatus || e.payrollStatus === 'pending').length);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.http.get<any>(`${this.apiUrl}/api/v1/users?limit=500&status=active`).subscribe({
      next: (res) => {
        const users = (res?.data || []).map((u: any) => ({
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
}
