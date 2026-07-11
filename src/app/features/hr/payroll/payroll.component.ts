import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
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
          <p class="payroll-sub">Workforce payroll overview</p>
        </div>
        <div class="payroll-actions">
          <select class="payroll-filter" [ngModel]="periodFilter()" (ngModelChange)="onPeriodFilterChange($event)">
            @for (p of periodOptions; track p.value) {
              <option [value]="p.value">{{ p.label }}</option>
            }
          </select>
          <button class="payroll-btn" (click)="loadData()"><i class="bx bx-refresh"></i> Refresh</button>
        </div>
      </div>

      <div class="payroll-info-grid">
          <article class="payroll-info-card payroll-info-card--workforce">
            <header class="payroll-info-card-head">
              <div>
                <span class="payroll-info-eyebrow">Workforce</span>
                <h2>Active headcount</h2>
                <p class="payroll-info-sub">{{ periodLabel() }} · {{ selectedOrganization() }}</p>
              </div>
              <div class="payroll-info-hero-metric">
                <strong class="payroll-info-value">{{ tabScopedEmployees().length }}</strong>
                <span class="payroll-info-caption">employees in scope</span>
              </div>
            </header>

            <div class="payroll-info-kpi-strip">
              <div class="payroll-info-kpi">
                <span>Organizations</span>
                <strong>{{ organizationTabs().length - 1 }}</strong>
              </div>
              <div class="payroll-info-kpi">
                <span>Positions</span>
                <strong>{{ positionTabs().length - 1 }}</strong>
              </div>
              <div class="payroll-info-kpi">
                <span>With payroll</span>
                <strong>{{ employeesWithPayCount() }}</strong>
              </div>
            </div>

            <div class="payroll-info-metric-table-wrap">
              <div class="payroll-info-metric-table-head">
                <span>Organization</span>
                <span>Headcount</span>
                <span>Share</span>
              </div>
              @for (row of orgBreakdownRows(); track row.name) {
                <div class="payroll-info-metric-table-row">
                  <span class="payroll-info-metric-label">{{ row.name }}</span>
                  <span class="payroll-info-metric-value">{{ row.count }}</span>
                  <span class="payroll-info-metric-pct">{{ row.sharePct | number:'1.0-0' }}%</span>
                  <div class="payroll-info-bar-track payroll-info-bar-track--inline">
                    <div class="payroll-info-bar-fill tone-cyan" [style.width.%]="row.widthPct"></div>
                  </div>
                </div>
              } @empty {
                <div class="payroll-info-empty">No organization data</div>
              }
            </div>
          </article>

          <article class="payroll-info-card payroll-info-card--payroll">
            <header class="payroll-info-card-head">
              <div>
                <span class="payroll-info-eyebrow">Payroll Volume</span>
                <h2>Compensation summary</h2>
                <p class="payroll-info-sub">{{ periodLabel() }} snapshot</p>
              </div>
              <div class="payroll-info-hero-metric">
                <strong class="payroll-info-value payroll-mono">\${{ totalPayroll() | number:'1.2-2' }}</strong>
                <span class="payroll-info-caption">total gross pay</span>
              </div>
            </header>

            <div class="payroll-info-kpi-strip payroll-info-kpi-strip--4">
              <div class="payroll-info-kpi">
                <span>Net pay</span>
                <strong class="payroll-mono">\${{ totalNetPay() | number:'1.0-0' }}</strong>
              </div>
              <div class="payroll-info-kpi">
                <span>Invoiced</span>
                <strong class="payroll-mono">\${{ totalInvoiced() | number:'1.0-0' }}</strong>
              </div>
              <div class="payroll-info-kpi">
                <span>Hours</span>
                <strong>{{ totalHours() | number:'1.0-0' }}</strong>
              </div>
              <div class="payroll-info-kpi">
                <span>Deductions</span>
                <strong class="payroll-mono">\${{ totalDeductions() | number:'1.0-0' }}</strong>
              </div>
            </div>

            <div class="payroll-info-split">
              <div class="payroll-info-split-block">
                <span class="payroll-info-split-label">Avg gross / employee</span>
                <strong class="payroll-mono">\${{ averageGrossPay() | number:'1.2-2' }}</strong>
                <div class="payroll-info-bar-track">
                  <div class="payroll-info-bar-fill tone-blue" [style.width.%]="payrollCapturePct()"></div>
                </div>
                <small>{{ payrollCapturePct() | number:'1.0-0' }}% of employees have recorded gross pay</small>
              </div>
              <div class="payroll-info-split-block">
                <span class="payroll-info-split-label">Pay type mix</span>
                @for (row of payTypeBreakdownRows(); track row.label) {
                  <div class="payroll-info-mini-line">
                    <span>{{ row.label }}</span>
                    <strong>{{ row.count }}</strong>
                  </div>
                } @empty {
                  <small>No pay type data</small>
                }
              </div>
            </div>
          </article>

          <article class="payroll-info-card payroll-info-card--processed">
            <header class="payroll-info-card-head">
              <div>
                <span class="payroll-info-eyebrow">Processed</span>
                <h2>Payroll completion</h2>
                <p class="payroll-info-sub">Processed and paid records</p>
              </div>
              <div class="payroll-info-hero-metric">
                <strong class="payroll-info-value">{{ processedCount() + paidCount() }}</strong>
                <span class="payroll-info-caption">closed records</span>
              </div>
            </header>

            <div class="payroll-info-status-panel">
              <div class="payroll-info-donut" [style.background]="statusRingStyle()">
                <div class="payroll-info-donut-core">
                  <strong>{{ processedPct() | number:'1.0-0' }}%</strong>
                  <small>Complete</small>
                </div>
              </div>
              <div class="payroll-info-status-stats">
                <div class="payroll-info-status-line">
                  <span><span class="dot tone-green"></span> Processed</span>
                  <strong>{{ processedCount() }}</strong>
                </div>
                <div class="payroll-info-status-line">
                  <span><span class="dot tone-blue"></span> Paid</span>
                  <strong>{{ paidCount() }}</strong>
                </div>
                <div class="payroll-info-status-line">
                  <span><span class="dot tone-amber"></span> Pending</span>
                  <strong>{{ pendingCount() }}</strong>
                </div>
                <div class="payroll-info-status-line highlight">
                  <span>Gross completed</span>
                  <strong class="payroll-mono">\${{ completedPayrollAmount() | number:'1.0-0' }}</strong>
                </div>
              </div>
            </div>

            <p class="payroll-info-footnote">
              @if (processedPct() >= 100) {
                All in-scope employees are processed or paid for this period.
              } @else {
                {{ pendingCount() }} employee{{ pendingCount() === 1 ? '' : 's' }} still need payroll action.
              }
            </p>
          </article>

          <article class="payroll-info-card payroll-info-card--pending">
            <header class="payroll-info-card-head">
              <div>
                <span class="payroll-info-eyebrow">Pending</span>
                <h2>Action queue</h2>
                <p class="payroll-info-sub">Outstanding payroll workload</p>
              </div>
              <div class="payroll-info-hero-metric">
                <strong class="payroll-info-value">{{ pendingCount() }}</strong>
                <span class="payroll-info-caption">awaiting processing</span>
              </div>
            </header>

            <div class="payroll-info-kpi-strip">
              <div class="payroll-info-kpi">
                <span>Pending gross</span>
                <strong class="payroll-mono">\${{ pendingPayrollAmount() | number:'1.0-0' }}</strong>
              </div>
              <div class="payroll-info-kpi">
                <span>Pending hours</span>
                <strong>{{ pendingHours() | number:'1.0-0' }}</strong>
              </div>
              <div class="payroll-info-kpi">
                <span>Queue share</span>
                <strong>{{ pendingPct() | number:'1.0-0' }}%</strong>
              </div>
            </div>

            <div class="payroll-info-metric-table-wrap">
              <div class="payroll-info-metric-table-head">
                <span>Top pending roles</span>
                <span>Count</span>
                <span>Gross</span>
              </div>
              @for (row of topPendingPositionRows(); track row.position) {
                <div class="payroll-info-metric-table-row">
                  <span class="payroll-info-metric-label">{{ row.position }}</span>
                  <span class="payroll-info-metric-value">{{ row.pending }}</span>
                  <span class="payroll-info-metric-pct payroll-mono">\${{ row.gross | number:'1.0-0' }}</span>
                  <div class="payroll-info-bar-track payroll-info-bar-track--inline">
                    <div class="payroll-info-bar-fill tone-amber" [style.width.%]="row.widthPct"></div>
                  </div>
                </div>
              } @empty {
                <div class="payroll-info-empty">No pending payroll by role</div>
              }
            </div>
          </article>

          <article class="payroll-info-card payroll-info-card--positions payroll-info-card--wide">
            <header class="payroll-info-card-head">
              <div>
                <span class="payroll-info-eyebrow">Position Mix</span>
                <h2>Where payroll sits by role</h2>
              </div>
            </header>

            <div class="payroll-info-position-panel">
              <aside class="payroll-info-org-sidebar" aria-label="Organization filters">
                <span class="payroll-info-org-label">Organization</span>
                <div class="payroll-info-org-scroll">
                  @for (item of organizationTabs(); track item) {
                    <button
                      type="button"
                      class="payroll-info-org-btn"
                      [class.active]="selectedOrganization() === item"
                      (click)="setOrganization(item)"
                    >
                      {{ item }}
                    </button>
                  }
                </div>
              </aside>

              <div class="payroll-info-position-list">
                @for (row of positionInfographicRows(); track row.position) {
                  <button
                    type="button"
                    class="payroll-info-position-row"
                    [class.active]="selectedPositionTab() === row.position"
                    (click)="setPositionTab(row.position)"
                  >
                    <div class="payroll-info-position-top">
                      <span>{{ row.position === 'All positions' ? 'All Positions' : row.position }}</span>
                      <div class="payroll-info-position-meta">
                        <span>{{ row.count }}</span>
                        <strong class="payroll-mono">\${{ row.gross | number:'1.0-0' }}</strong>
                      </div>
                    </div>
                    <div class="payroll-info-bar-track">
                      <div class="payroll-info-bar-fill tone-cyan" [style.width.%]="row.countWidthPct"></div>
                    </div>
                    <div class="payroll-info-position-sub">
                      <span>{{ row.processed }} done</span>
                      <span>{{ row.pending }} pending</span>
                    </div>
                  </button>
                } @empty {
                  <div class="payroll-info-empty">No positions for this organization</div>
                }
              </div>
            </div>
          </article>
        </div>

      <div class="payroll-layout">
        <div class="payroll-table-stack payroll-table-stack--employees">
        <div class="payroll-employee-toolbar">
          <div class="payroll-search">
            <div class="payroll-search-input-wrap">
              <i class="bx bx-search"></i>
              <input
                type="text"
                placeholder="Search filtered table..."
                [ngModel]="searchTerm()"
                (ngModelChange)="onSearchTermChange($event)"
              >
            </div>
            <select
              class="payroll-search-field"
              [ngModel]="selectedStructureFilterField()"
              (ngModelChange)="setStructureFilterField($event)"
              aria-label="Payroll table filter field"
            >
              @for (item of structureFilterFieldOptions; track item.value) {
                <option [value]="item.value">{{ item.label }}</option>
              }
            </select>
            <select
              class="payroll-search-field"
              [ngModel]="selectedStructureFilterValue()"
              (ngModelChange)="onStructureFilterValueChange($event)"
              [disabled]="selectedStructureFilterField() === 'all'"
              aria-label="Payroll table filter value"
            >
              @for (item of structureFilterValueOptions(); track item) {
                <option [value]="item">{{ item }}</option>
              }
            </select>
          </div>
        </div>
        <div class="payroll-table-wrap">
          <table class="payroll-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Pay Type</th>
              <th>Pay Frequency</th>
              <th>Pay Rate</th>
              <th>Invoiced</th>
              <th>Hours</th>
              <th>Gross Pay</th>
              <th>Deductions</th>
              <th>Net Pay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @for (emp of paginatedEmployees(); track emp.id) {
              <tr>
                <td class="payroll-emp-cell">
                  <div class="payroll-avatar">{{ (emp.name || 'E').charAt(0) }}</div>
                  <div class="payroll-emp-info">
                    <strong>{{ emp.name }}</strong>
                    <span class="payroll-email">{{ emp.email }}</span>
                    <span class="payroll-meta">{{ getOrganizationLabel(emp) || 'No org' }} • {{ getDivisionLabel(emp) || 'No division' }}</span>
                  </div>
                </td>
                <td><span class="payroll-type-badge">{{ emp.payType || 'salary' }}</span></td>
                <td><span class="payroll-frequency-badge">{{ getPayFrequencyLabel(emp) }}</span></td>
                <td class="payroll-mono">\${{ emp.payRate || 0 | number:'1.2-2' }}</td>
                <td class="payroll-mono payroll-invoiced">\${{ emp.invoicedAmount || 0 | number:'1.2-2' }}</td>
                <td>{{ emp.hours || 0 }}</td>
                <td class="payroll-mono">\${{ emp.grossPay || 0 | number:'1.2-2' }}</td>
                <td class="payroll-mono payroll-deduction">-\${{ emp.deductions || 0 | number:'1.2-2' }}</td>
                <td class="payroll-mono payroll-net">\${{ emp.netPay || 0 | number:'1.2-2' }}</td>
                <td>
                  <span class="payroll-status" [class]="emp.payrollStatus || 'pending'">{{ emp.payrollStatus || 'pending' }}</span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="10" class="payroll-empty">
                  No payroll data for this period
                </td>
              </tr>
            }
          </tbody>
        </table>
        </div>

        @if (filteredEmployees().length > 0) {
          <div class="payroll-table-pagination">
            <span class="payroll-page-meta">
              Showing {{ employeePageStart() }}–{{ employeePageEnd() }} of {{ filteredEmployees().length }} employees
            </span>
            <div class="payroll-page-controls">
              <select
                class="payroll-page-size"
                [ngModel]="employeePageSize()"
                (ngModelChange)="setEmployeePageSize($event)"
                aria-label="Rows per page"
              >
                @for (size of employeePageSizeOptions; track size) {
                  <option [value]="size">{{ size }} / page</option>
                }
              </select>
              <button
                type="button"
                class="payroll-page-btn"
                [disabled]="employeePage() <= 1"
                (click)="goToEmployeePage(employeePage() - 1)"
                aria-label="Previous page"
              >
                <i class="bx bx-chevron-left"></i>
              </button>
              <span class="payroll-page-counter">Page {{ employeePage() }} of {{ employeeTotalPages() }}</span>
              <button
                type="button"
                class="payroll-page-btn"
                [disabled]="employeePage() >= employeeTotalPages()"
                (click)="goToEmployeePage(employeePage() + 1)"
                aria-label="Next page"
              >
                <i class="bx bx-chevron-right"></i>
              </button>
            </div>
          </div>
        }
        </div>
      </div>

      @if (actionMessage()) {
        <div class="payroll-feedback">{{ actionMessage() }}</div>
      }
    </div>

    @if (detailsModalOpen()) {
      <div class="payroll-modal-backdrop" (click)="closePayrollDetails()"></div>
      <div class="payroll-modal" role="dialog" aria-modal="true" aria-label="Payroll details">
        <div class="payroll-modal-header">
          <h3>Payroll Details</h3>
          <button type="button" class="payroll-modal-close" (click)="closePayrollDetails()">
            <i class="bx bx-x"></i>
          </button>
        </div>
        <p class="payroll-modal-sub">
          {{ selectedEmployeeDetails()?.name || 'Employee' }} · {{ selectedEmployeeDetails()?.email || 'No email' }}
        </p>

        <div class="payroll-modal-grid">
          <label class="payroll-modal-field">
            <span>Pay frequency</span>
            <select
              [ngModel]="payrollDetailsForm().payFrequency"
              (ngModelChange)="updatePayrollFormField('payFrequency', $event)"
            >
              @for (item of payFrequencyOptions; track item.value) {
                <option [value]="item.value">{{ item.label }}</option>
              }
            </select>
          </label>

          <label class="payroll-modal-field">
            <span>Compensation model</span>
            <select
              [ngModel]="payrollDetailsForm().compensationModel"
              (ngModelChange)="updatePayrollFormField('compensationModel', $event)"
            >
              @for (item of compensationModelOptions; track item.value) {
                <option [value]="item.value">{{ item.label }}</option>
              }
            </select>
          </label>
        </div>

        <label class="payroll-modal-field">
          <span>Contract / commission notes</span>
          <input
            type="text"
            [ngModel]="payrollDetailsForm().contractNotes"
            (ngModelChange)="updatePayrollFormField('contractNotes', $event)"
            placeholder="Optional details or notes"
          >
        </label>

        <div class="payroll-modal-actions">
          <button type="button" class="payroll-btn" (click)="closePayrollDetails()">Cancel</button>
          <button type="button" class="payroll-btn payroll-btn-primary" [disabled]="savingDetails()" (click)="savePayrollDetails()">
            @if (savingDetails()) {
              Saving...
            } @else {
              Save details
            }
          </button>
        </div>
      </div>
    }

    @if (invoiceModalOpen()) {
      <div class="payroll-modal-backdrop" (click)="closeCreateInvoiceModal()"></div>
      <div class="payroll-modal" role="dialog" aria-modal="true" aria-label="Create invoice">
        <div class="payroll-modal-header">
          <h3>Create Invoice</h3>
          <button type="button" class="payroll-modal-close" (click)="closeCreateInvoiceModal()">
            <i class="bx bx-x"></i>
          </button>
        </div>
        <p class="payroll-modal-sub">
          {{ selectedInvoiceEmployee()?.name || 'Employee' }} · {{ selectedInvoiceEmployee()?.email || 'No email' }}
        </p>

        <div class="payroll-modal-grid">
          <label class="payroll-modal-field">
            <span>Week To Invoice</span>
            <select
              [ngModel]="invoiceForm().weekFilter"
              (ngModelChange)="updateInvoiceFormField('weekFilter', $event)"
            >
              @for (item of invoiceWeekOptions(); track item.value) {
                <option [value]="item.value">{{ item.label }}</option>
              }
            </select>
          </label>

          <label class="payroll-modal-field">
            <span>Due Date</span>
            <input
              type="date"
              [ngModel]="invoiceForm().dueDate"
              (ngModelChange)="updateInvoiceFormField('dueDate', $event)"
            >
          </label>
        </div>

        <label class="payroll-modal-field">
          <span>Reference</span>
          <input
            type="text"
            [ngModel]="invoiceForm().reference"
            (ngModelChange)="updateInvoiceFormField('reference', $event)"
            placeholder="PO, ticket, or internal reference"
          >
        </label>

        <label class="payroll-modal-field">
          <span>Invoice Notes</span>
          <input
            type="text"
            [ngModel]="invoiceForm().notes"
            (ngModelChange)="updateInvoiceFormField('notes', $event)"
            placeholder="Optional notes for this invoice"
          >
        </label>

        <div class="payroll-modal-actions">
          <button type="button" class="payroll-btn" (click)="closeCreateInvoiceModal()">Cancel</button>
          <button type="button" class="payroll-btn payroll-btn-primary" [disabled]="creatingInvoiceForUserId() !== null" (click)="submitCreateInvoice()">
            @if (creatingInvoiceForUserId() !== null) {
              Creating...
            } @else {
              Create invoice
            }
          </button>
        </div>
      </div>
    }
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
    .payroll-info-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      margin-bottom: 1.35rem;
    }
    .payroll-info-card {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-height: auto;
      padding: 1rem 1.05rem 1rem;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      background:
        radial-gradient(circle at top right, rgba(255, 255, 255, 0.04), transparent 42%),
        rgba(0, 0, 0, 0.24);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.24),
        0 0 48px rgba(56, 189, 248, 0.08);
      &--wide { grid-column: 1 / -1; min-height: auto; }
      &--workforce {
        border-color: rgba(56, 189, 248, 0.22);
        box-shadow: 0 0 48px rgba(56, 189, 248, 0.12);
      }
      &--payroll {
        border-color: rgba(96, 165, 250, 0.22);
        box-shadow: 0 0 48px rgba(96, 165, 250, 0.12);
      }
      &--processed {
        border-color: rgba(74, 222, 128, 0.22);
        box-shadow: 0 0 48px rgba(74, 222, 128, 0.12);
      }
      &--pending {
        border-color: rgba(250, 204, 21, 0.22);
        box-shadow: 0 0 48px rgba(250, 204, 21, 0.12);
      }
      &--positions {
        border-color: rgba(0, 212, 255, 0.22);
        box-shadow: 0 0 48px rgba(0, 212, 255, 0.12);
      }
    }
    .payroll-info-card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      h2 {
        margin: 0.15rem 0 0;
        font-size: 0.98rem;
        font-weight: 600;
        color: var(--text-primary);
      }
    }
    .payroll-info-eyebrow {
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
    }
    .payroll-info-sub {
      margin: 0.2rem 0 0;
      font-size: 0.72rem;
      color: rgba(148, 163, 184, 0.95);
    }
    .payroll-info-hero-metric {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.1rem;
      text-align: right;
    }
    .payroll-info-caption {
      font-size: 0.68rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .payroll-info-value {
      font-size: 1.45rem;
      font-weight: 700;
      color: var(--text-primary);
      white-space: nowrap;
      line-height: 1.1;
    }
    .payroll-info-kpi-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.55rem;
      &--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    .payroll-info-kpi {
      display: grid;
      gap: 0.15rem;
      padding: 0.55rem 0.65rem;
      border-radius: 10px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      span {
        font-size: 0.66rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      strong {
        font-size: 0.88rem;
        color: var(--text-primary);
        font-weight: 700;
      }
    }
    .payroll-info-metric-table-wrap {
      display: grid;
      gap: 0.35rem;
    }
    .payroll-info-metric-table-head,
    .payroll-info-metric-table-row {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) 56px 48px;
      gap: 0.45rem;
      align-items: center;
      font-size: 0.74rem;
    }
    .payroll-info-metric-table-head {
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.64rem;
      padding: 0 0.1rem;
    }
    .payroll-info-metric-table-row {
      padding: 0.35rem 0.1rem 0.45rem;
      border-top: 1px solid rgba(255,255,255,0.05);
      grid-template-rows: auto auto;
    }
    .payroll-info-metric-label {
      color: var(--text-primary);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .payroll-info-metric-value,
    .payroll-info-metric-pct {
      text-align: right;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .payroll-info-bar-track--inline {
      grid-column: 1 / -1;
      height: 6px;
    }
    .payroll-info-split {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.65rem;
    }
    .payroll-info-split-block {
      display: grid;
      gap: 0.35rem;
      padding: 0.65rem 0.7rem;
      border-radius: 10px;
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.06);
      small {
        font-size: 0.68rem;
        color: var(--text-secondary);
        line-height: 1.35;
      }
    }
    .payroll-info-split-label {
      font-size: 0.68rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .payroll-info-mini-line {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.74rem;
      color: var(--text-secondary);
      strong { color: var(--text-primary); }
    }
    .payroll-info-status-panel {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 0.85rem;
      align-items: center;
    }
    .payroll-info-status-stats {
      display: grid;
      gap: 0.45rem;
    }
    .payroll-info-status-line {
      display: flex;
      justify-content: space-between;
      gap: 0.65rem;
      font-size: 0.76rem;
      color: var(--text-secondary);
      strong { color: var(--text-primary); font-size: 0.82rem; }
      &.highlight {
        margin-top: 0.15rem;
        padding-top: 0.45rem;
        border-top: 1px solid rgba(255,255,255,0.08);
        strong { color: #93c5fd; }
      }
      .dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 0.35rem;
      }
    }
    .dot.tone-blue { background: #60a5fa; }
    .payroll-info-footnote {
      margin: 0;
      padding: 0.55rem 0.65rem;
      border-radius: 8px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      font-size: 0.72rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }
    .payroll-info-ring,
    .payroll-info-donut {
      width: 92px;
      height: 92px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .payroll-info-ring-core,
    .payroll-info-donut-core {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(8, 12, 20, 0.96);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      strong, span {
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1;
      }
      small {
        margin-top: 0.15rem;
        font-size: 0.62rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    }
    .payroll-info-donut-wrap {
      display: flex;
      align-items: center;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }
    .payroll-info-legend {
      display: grid;
      gap: 0.45rem;
      font-size: 0.78rem;
      color: var(--text-secondary);
      .dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 0.35rem;
      }
    }
    .payroll-info-mini-list,
    .payroll-info-flow-list {
      display: grid;
      gap: 0.55rem;
    }
    .payroll-info-mini-row,
    .payroll-info-flow-head,
    .payroll-info-position-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.65rem;
      font-size: 0.78rem;
      color: var(--text-secondary);
    }
    .payroll-info-mini-row {
      display: grid;
      grid-template-columns: minmax(90px, 1fr) minmax(80px, 1.4fr) auto;
      align-items: center;
      strong { color: var(--text-primary); font-size: 0.78rem; }
    }
    .payroll-info-bar-track {
      height: 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
    }
    .payroll-info-bar-fill {
      height: 100%;
      border-radius: inherit;
      &.tone-cyan { background: linear-gradient(90deg, rgba(0,212,255,0.55), #00d4ff); }
      &.tone-blue { background: linear-gradient(90deg, rgba(96,165,250,0.55), #60a5fa); }
      &.tone-green { background: linear-gradient(90deg, rgba(74,222,128,0.55), #4ade80); }
      &.tone-amber { background: linear-gradient(90deg, rgba(251,191,36,0.55), #fbbf24); }
    }
    .dot.tone-green { background: #4ade80; }
    .dot.tone-amber { background: #fbbf24; }
    .payroll-info-hero-bar {
      display: grid;
      gap: 0.45rem;
      span { font-size: 0.74rem; color: var(--text-secondary); }
    }
    .payroll-info-stat-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      div {
        display: grid;
        gap: 0.2rem;
        span { font-size: 0.72rem; color: var(--text-secondary); }
        strong { font-size: 0.92rem; color: var(--text-primary); }
      }
    }
    .payroll-info-flow-step { display: grid; gap: 0.35rem; }
    .payroll-info-position-panel {
      display: grid;
      grid-template-columns: minmax(148px, 190px) minmax(0, 1fr);
      gap: 0.85rem;
      align-items: stretch;
      height: 360px;
      min-height: 0;
    }
    .payroll-info-org-sidebar {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      min-height: 0;
      overflow: hidden;
      padding-right: 0.85rem;
      border-right: 1px solid rgba(255,255,255,0.08);
    }
    .payroll-info-org-scroll {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      min-height: 0;
      flex: 1;
      overflow-y: auto;
      padding-right: 0.15rem;
    }
    .payroll-info-org-label {
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 0.15rem;
    }
    .payroll-info-org-btn {
      width: 100%;
      text-align: left;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      color: var(--text-secondary);
      border-radius: 8px;
      padding: 0.45rem 0.6rem;
      font-size: 0.72rem;
      line-height: 1.25;
      cursor: pointer;
      transition: all 0.2s;
      &:hover {
        border-color: rgba(0,212,255,0.25);
        color: var(--text-primary);
      }
      &.active {
        border-color: var(--cyan);
        color: var(--text-primary);
        background: rgba(0,212,255,0.12);
      }
    }
    .payroll-info-position-list {
      display: grid;
      gap: 0.4rem;
      align-content: start;
      min-height: 0;
      height: 100%;
      overflow-y: auto;
      padding-right: 0.15rem;
    }
    .payroll-info-position-row {
      width: 100%;
      text-align: left;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      background: rgba(255,255,255,0.02);
      padding: 0.5rem 0.65rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: grid;
      gap: 0.28rem;
      color: inherit;
      &:hover {
        border-color: rgba(0,212,255,0.25);
        background: rgba(0,212,255,0.04);
      }
      &.active {
        border-color: rgba(0,212,255,0.45);
        background: rgba(0,212,255,0.1);
      }
    }
    .payroll-info-position-top span {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .payroll-info-position-meta {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.68rem;
      color: var(--text-secondary);
      flex-shrink: 0;
      strong { color: #93c5fd; font-size: 0.68rem; }
    }
    .payroll-info-position-sub {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.66rem;
      color: var(--text-secondary);
    }
    .payroll-info-empty {
      padding: 1rem 0;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    .payroll-search {
      display: flex; align-items: center; gap: 0.6rem;
      width: 100%;
    }
    .payroll-employee-toolbar {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(0,212,255,0.02);
    }
    .payroll-search-field {
      min-width: 150px; padding: 0.6rem 0.75rem; background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: var(--text-primary);
      font-size: 0.82rem; outline: none;
      &:focus { border-color: rgba(0,212,255,0.3); }
      option { background: #0a0a0f; }
    }
    .payroll-search-input-wrap {
      position: relative; flex: 1; display: flex; align-items: center;
      i { position: absolute; left: 12px; color: var(--text-secondary); font-size: 1rem; }
      input { width: 100%; padding: 0.6rem 1rem 0.6rem 2.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; color: var(--text-primary); font-size: 0.85rem;
        &:focus { outline: none; border-color: rgba(0,212,255,0.3); }
        &::placeholder { color: var(--text-secondary); }
      }
    }
    .payroll-table-stack {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      overflow: hidden;
    }
    .payroll-layout {
      display: flex;
      flex-direction: column;
      gap: 1.35rem;
    }
    .payroll-table-stack--employees {
      display: flex;
      flex-direction: column;
    }
    .payroll-table-wrap {
      background: transparent;
      border: none;
      border-radius: 0;
      overflow: hidden;
    }
    .payroll-table {
      width: 100%; border-collapse: collapse;
      th, td { padding: 12px 16px; text-align: left; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
      th { color: var(--cyan); font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; background: rgba(0,212,255,0.03); }
      td { color: var(--text-primary); }
      tbody tr:hover { background: rgba(0,212,255,0.03); }
      tbody tr:last-child td { border-bottom: none; }
    }
    .payroll-table-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
      padding: 0.85rem 1rem;
      border-top: 1px solid rgba(255,255,255,0.06);
      background: rgba(0,212,255,0.02);
    }
    .payroll-page-meta {
      font-size: 0.78rem;
      color: var(--text-secondary);
    }
    .payroll-page-controls {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      flex-wrap: wrap;
    }
    .payroll-page-size {
      min-width: 108px;
      padding: 0.45rem 0.65rem;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 0.78rem;
      outline: none;
      option { background: #0a0a0f; }
    }
    .payroll-page-counter {
      min-width: 108px;
      text-align: center;
      font-size: 0.78rem;
      color: var(--text-secondary);
    }
    .payroll-page-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04);
      color: var(--text-primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      i { font-size: 1.1rem; }
      &:hover:not(:disabled) {
        border-color: rgba(0,212,255,0.35);
        color: var(--cyan);
        background: rgba(0,212,255,0.1);
      }
      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }
    .payroll-emp-cell { display: flex; align-items: center; gap: 10px; }
    .payroll-avatar {
      width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--cyan, #00d4ff), #0080ff);
      display: flex; align-items: center; justify-content: center; color: #0a0a14; font-weight: 700; font-size: 0.9rem; flex-shrink: 0;
    }
    .payroll-emp-info { display: flex; flex-direction: column;
      strong { font-size: 0.88rem; }
      .payroll-email { font-size: 0.72rem; color: var(--text-secondary); }
      .payroll-meta { font-size: 0.68rem; color: rgba(148, 163, 184, 0.95); }
    }
    .payroll-mono { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.85rem; }
    .payroll-deduction { color: #ff4444; }
    .payroll-net { color: #00ff88; font-weight: 600; }
    .payroll-invoiced { color: #93c5fd; font-weight: 600; }
    .payroll-type-badge {
      padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; text-transform: capitalize;
      background: rgba(0,212,255,0.08); color: var(--cyan); border: 1px solid rgba(0,212,255,0.15);
    }
    .payroll-frequency-badge {
      padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; text-transform: capitalize;
      background: rgba(148, 163, 184, 0.14); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3);
    }
    .payroll-status {
      padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; text-transform: capitalize;
      &.pending { background: rgba(251,191,36,0.1); color: #fbbf24; }
      &.processed { background: rgba(0,255,136,0.1); color: #00ff88; }
      &.paid { background: rgba(0,170,255,0.1); color: #00aaff; }
    }
    .payroll-empty { text-align: center; padding: 40px; color: var(--text-secondary); }
    .payroll-row-actions { display: inline-flex; gap: 0.4rem; align-items: center; }
    .payroll-icon-btn {
      width: 30px; height: 30px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.04); color: var(--text-primary); display: inline-flex;
      align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
      i { font-size: 1rem; }
      &:hover { border-color: rgba(0,212,255,0.4); color: var(--cyan); background: rgba(0,212,255,0.12); }
      &:disabled { opacity: 0.45; cursor: not-allowed; }
    }
    .payroll-feedback {
      margin-top: 0.8rem; font-size: 0.82rem; color: #8be9fd;
      background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.22);
      border-radius: 8px; padding: 0.55rem 0.75rem;
    }
    .payroll-modal-backdrop {
      position: fixed; inset: 0; background: rgba(2, 6, 23, 0.7); z-index: 500;
    }
    .payroll-modal {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(560px, calc(100vw - 2rem)); background: #0c111b; border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.12); z-index: 501; padding: 1rem 1rem 0.9rem;
      box-shadow: 0 20px 55px rgba(0,0,0,0.55);
    }
    .payroll-modal-header {
      display: flex; align-items: center; justify-content: space-between;
      h3 { margin: 0; font-size: 1.05rem; color: var(--text-primary); }
    }
    .payroll-modal-close {
      border: 1px solid rgba(255,255,255,0.14); background: transparent; color: var(--text-secondary);
      width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center;
      justify-content: center; cursor: pointer; transition: all 0.2s;
      &:hover { color: var(--text-primary); border-color: rgba(0,212,255,0.35); }
    }
    .payroll-modal-sub { margin: 0.3rem 0 0.9rem; color: var(--text-secondary); font-size: 0.82rem; }
    .payroll-modal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
    .payroll-modal-field {
      display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.75rem;
      span { color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
      input, select {
        width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.03);
        color: var(--text-primary); font-size: 0.86rem; outline: none;
        &:focus { border-color: rgba(0,212,255,0.4); }
      }
      select option { background: #0a0a0f; }
    }
    .payroll-modal-actions {
      display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.35rem;
    }
    .payroll-btn-primary {
      border-color: rgba(0,212,255,0.42);
      background: rgba(0,212,255,0.18);
      color: #dff8ff;
    }
    @media (max-width: 768px) {
      .payroll-info-grid { grid-template-columns: 1fr; }
      .payroll-info-kpi-strip--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .payroll-info-split { grid-template-columns: 1fr; }
      .payroll-info-status-panel { grid-template-columns: 1fr; justify-items: center; }
      .payroll-info-position-panel {
        grid-template-columns: 1fr;
        height: 420px;
      }
      .payroll-info-org-sidebar {
        flex-direction: column;
        padding-right: 0;
        padding-bottom: 0;
        border-right: none;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        max-height: 148px;
      }
      .payroll-info-org-btn {
        width: 100%;
        flex: 0 0 auto;
      }
    }
  `]
})
export class PayrollComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = environment.apiUrl;

  employees = signal<any[]>([]);
  organizationNameById = signal<Record<number, string>>({});
  divisionNameById = signal<Record<number, string>>({});
  departmentNameById = signal<Record<number, string>>({});
  positionNameById = signal<Record<number, string>>({});
  terminalNameById = signal<Record<number, string>>({});
  satelliteNameById = signal<Record<number, string>>({});
  agencyNameById = signal<Record<number, string>>({});
  searchTerm = signal('');
  selectedStructureFilterField = signal<StructureFilterField>('all');
  selectedStructureFilterValue = signal('All');
  periodFilter = signal('current');
  selectedOrganization = signal('All organizations');
  selectedPositionTab = signal('All positions');
  employeePage = signal(1);
  employeePageSize = signal(25);
  readonly employeePageSizeOptions = [10, 25, 50, 100];
  detailsModalOpen = signal(false);
  selectedEmployeeDetails = signal<any | null>(null);
  invoiceModalOpen = signal(false);
  selectedInvoiceEmployee = signal<any | null>(null);
  savingDetails = signal(false);
  creatingInvoiceForUserId = signal<number | null>(null);
  actionMessage = signal('');
  payrollDetailsForm = signal<PayrollDetailsForm>({
    payFrequency: 'weekly',
    compensationModel: 'contract',
    contractNotes: ''
  });
  readonly payFrequencyOptions = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Biweekly' },
    { value: 'semimonthly', label: 'Semi-monthly' },
    { value: 'monthly', label: 'Monthly' }
  ];
  readonly compensationModelOptions = [
    { value: 'contract', label: 'Contract' },
    { value: 'commission', label: 'Commission' }
  ];
  invoiceForm = signal<InvoiceCreateForm>({
    weekFilter: 'current',
    dueDate: '',
    reference: '',
    notes: ''
  });
  structureFilterFieldOptions: Array<{ value: StructureFilterField; label: string }> = [
    { value: 'all', label: 'All structures' },
    { value: 'division', label: 'Division' },
    { value: 'department', label: 'Department' },
    { value: 'position', label: 'Position' },
    { value: 'jobTitle', label: 'Job Title' },
    { value: 'terminal', label: 'Terminal' },
    { value: 'satellite', label: 'Satellite' },
    { value: 'agency', label: 'Agency' }
  ];

  periodOptions = (() => {
    const options = [
      { value: 'current', label: 'Current Week' },
      { value: 'all', label: 'All' }
    ];
    const getIsoWeekNumber = (date: Date): number => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const diffInDays = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;
      return Math.ceil(diffInDays / 7);
    };
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (i * 7));
      const start = new Date(d);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const weekNumber = getIsoWeekNumber(start);
      options.push({ value: i.toString(), label: `${fmt(start)} – ${fmt(end)} (W${weekNumber})` });
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

  positionTabs = computed(() => {
    const names = new Set<string>();
    for (const emp of this.organizationScopedEmployees()) {
      const position = this.getPositionLabel(emp);
      if (position) names.add(position);
    }
    return ['All positions', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  });

  positionMetricsByName = computed(() => {
    const metrics: Record<string, { count: number; gross: number; processed: number; pending: number }> = {};
    for (const position of this.positionTabs()) {
      const rows = position === 'All positions'
        ? this.organizationScopedEmployees()
        : this.organizationScopedEmployees().filter((e) => this.getPositionLabel(e) === position);
      metrics[position] = {
        count: rows.length,
        gross: rows.reduce((sum, emp) => sum + (Number(emp.grossPay) || 0), 0),
        processed: rows.filter((e) => e.payrollStatus === 'processed' || e.payrollStatus === 'paid').length,
        pending: rows.filter((e) => !e.payrollStatus || e.payrollStatus === 'pending').length
      };
    }
    return metrics;
  });

  positionScopedEmployees = computed(() => {
    const selectedPosition = this.selectedPositionTab();
    if (selectedPosition === 'All positions') return this.organizationScopedEmployees();
    return this.organizationScopedEmployees().filter((e) => this.getPositionLabel(e) === selectedPosition);
  });

  invoiceWeekOptions = computed(() => this.periodOptions.filter((p) => p.value !== 'all'));

  structureFilterValueOptions = computed(() => {
    const field = this.selectedStructureFilterField();
    if (field === 'all') return ['All'];
    const names = new Set<string>();
    for (const emp of this.positionScopedEmployees()) {
      const value = this.getSearchFieldText(emp, field);
      if (value) names.add(value);
    }
    return ['All', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  });

  scopedEmployees = computed(() => {
    const field = this.selectedStructureFilterField();
    const value = this.selectedStructureFilterValue();
    if (field === 'all' || value === 'All') return this.positionScopedEmployees();
    return this.positionScopedEmployees().filter((e) => this.getSearchFieldText(e, field) === value);
  });

  tabScopedEmployees = computed(() => this.scopedEmployees());

  filteredEmployees = computed(() => {
    const search = this.searchTerm().toLowerCase();
    let list = this.tabScopedEmployees();
    if (search) {
      list = list.filter((e) => this.getAllSearchableText(e).includes(search));
    }
    return list;
  });

  employeeTotalPages = computed(() => {
    const total = this.filteredEmployees().length;
    const pageSize = this.employeePageSize();
    return Math.max(1, Math.ceil(total / pageSize));
  });

  paginatedEmployees = computed(() => {
    const list = this.filteredEmployees();
    const page = Math.min(this.employeePage(), this.employeeTotalPages());
    const pageSize = this.employeePageSize();
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  });

  employeePageStart = computed(() => {
    if (this.filteredEmployees().length === 0) return 0;
    return (Math.min(this.employeePage(), this.employeeTotalPages()) - 1) * this.employeePageSize() + 1;
  });

  employeePageEnd = computed(() => {
    const total = this.filteredEmployees().length;
    if (total === 0) return 0;
    return Math.min(this.employeePageStart() + this.employeePageSize() - 1, total);
  });

  totalPayroll = computed(() => this.tabScopedEmployees().reduce((sum, e) => sum + (Number(e.grossPay) || 0), 0));
  totalNetPay = computed(() => this.tabScopedEmployees().reduce((sum, e) => sum + (Number(e.netPay) || 0), 0));
  totalInvoiced = computed(() => this.tabScopedEmployees().reduce((sum, e) => sum + (Number(e.invoicedAmount) || 0), 0));
  totalHours = computed(() => this.tabScopedEmployees().reduce((sum, e) => sum + (Number(e.hours) || 0), 0));
  totalDeductions = computed(() => this.tabScopedEmployees().reduce((sum, e) => sum + (Number(e.deductions) || 0), 0));
  employeesWithPayCount = computed(() => this.tabScopedEmployees().filter((e) => (Number(e.grossPay) || 0) > 0).length);
  processedCount = computed(() => this.tabScopedEmployees().filter(e => e.payrollStatus === 'processed').length);
  paidCount = computed(() => this.tabScopedEmployees().filter(e => e.payrollStatus === 'paid').length);
  pendingCount = computed(() => this.tabScopedEmployees().filter(e => !e.payrollStatus || e.payrollStatus === 'pending').length);

  periodLabel = computed(() => {
    const match = this.periodOptions.find((p) => p.value === this.periodFilter());
    return match?.label ?? 'Current period';
  });

  statusTotal = computed(() => this.tabScopedEmployees().length);
  processedPct = computed(() => {
    const total = this.statusTotal();
    if (total <= 0) return 0;
    return ((this.processedCount() + this.paidCount()) / total) * 100;
  });
  pendingPct = computed(() => {
    const total = this.statusTotal();
    return total > 0 ? (this.pendingCount() / total) * 100 : 0;
  });
  statusRingStyle = computed(() => {
    const processed = this.processedPct();
    return `conic-gradient(#00ff88 0 ${processed}%, #fbbf24 ${processed}% 100%)`;
  });
  averageGrossPay = computed(() => {
    const count = this.tabScopedEmployees().length;
    return count > 0 ? this.totalPayroll() / count : 0;
  });
  payrollCapturePct = computed(() => {
    const total = this.tabScopedEmployees().length;
    return total > 0 ? (this.employeesWithPayCount() / total) * 100 : 0;
  });
  pendingPayrollAmount = computed(() =>
    this.tabScopedEmployees()
      .filter((e) => !e.payrollStatus || e.payrollStatus === 'pending')
      .reduce((sum, e) => sum + (Number(e.grossPay) || 0), 0)
  );
  pendingHours = computed(() =>
    this.tabScopedEmployees()
      .filter((e) => !e.payrollStatus || e.payrollStatus === 'pending')
      .reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
  );
  completedPayrollAmount = computed(() =>
    this.tabScopedEmployees()
      .filter((e) => e.payrollStatus === 'processed' || e.payrollStatus === 'paid')
      .reduce((sum, e) => sum + (Number(e.grossPay) || 0), 0)
  );
  payTypeBreakdownRows = computed(() => {
    const counts = new Map<string, number>();
    for (const emp of this.tabScopedEmployees()) {
      const label = (emp.payType || 'salary').toString();
      const normalized = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, count]) => ({ label, count }));
  });
  orgBreakdownRows = computed(() => {
    const employees = this.tabScopedEmployees();
    const total = Math.max(employees.length, 1);
    const counts = new Map<string, number>();
    for (const emp of employees) {
      const org = this.getOrganizationLabel(emp) || 'Unknown';
      counts.set(org, (counts.get(org) || 0) + 1);
    }
    const max = Math.max(1, ...Array.from(counts.values()));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({
        name,
        count,
        sharePct: (count / total) * 100,
        widthPct: (count / max) * 100
      }));
  });
  topPendingPositionRows = computed(() => {
    const rows = this.positionTabs()
      .filter((position) => position !== 'All positions')
      .map((position) => {
        const metric = this.positionMetric(position);
        return {
          position,
          pending: metric.pending,
          gross: this.tabScopedEmployees()
            .filter((e) => this.getPositionLabel(e) === position && (!e.payrollStatus || e.payrollStatus === 'pending'))
            .reduce((sum, e) => sum + (Number(e.grossPay) || 0), 0)
        };
      })
      .filter((row) => row.pending > 0)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 4);
    const max = Math.max(1, ...rows.map((row) => row.pending));
    return rows.map((row) => ({ ...row, widthPct: (row.pending / max) * 100 }));
  });
  positionInfographicRows = computed(() => {
    const positions = this.positionTabs();
    const maxCount = Math.max(1, ...positions.map((position) => this.positionMetric(position).count));
    return positions.map((position) => {
      const metric = this.positionMetric(position);
      return {
        position,
        count: metric.count,
        gross: metric.gross,
        processed: metric.processed,
        pending: metric.pending,
        countWidthPct: (metric.count / maxCount) * 100
      };
    });
  });

  ngOnInit() {
    this.loadData();
    void this.loadStructureLookups();
  }

  onPeriodFilterChange(value: string): void {
    if (this.periodFilter() === value) return;
    this.periodFilter.set(value);
    this.resetEmployeePage();
    this.loadData();
  }

  setOrganization(org: string): void {
    if (this.selectedOrganization() === org) return;
    this.selectedOrganization.set(org);
    this.selectedPositionTab.set('All positions');
    this.selectedStructureFilterValue.set('All');
    this.resetEmployeePage();
  }

  setPositionTab(position: string): void {
    if (this.selectedPositionTab() === position) return;
    this.selectedPositionTab.set(position);
    this.selectedStructureFilterValue.set('All');
    this.resetEmployeePage();
  }

  positionMetric(position: string): { count: number; gross: number; processed: number; pending: number } {
    return this.positionMetricsByName()[position] ?? { count: 0, gross: 0, processed: 0, pending: 0 };
  }

  setStructureFilterField(field: StructureFilterField): void {
    if (this.selectedStructureFilterField() === field) return;
    this.selectedStructureFilterField.set(field);
    this.selectedStructureFilterValue.set('All');
    this.resetEmployeePage();
  }

  onStructureFilterValueChange(value: string): void {
    this.selectedStructureFilterValue.set(value);
    this.resetEmployeePage();
  }

  onSearchTermChange(value: string): void {
    this.searchTerm.set(value);
    this.resetEmployeePage();
  }

  setEmployeePageSize(value: string | number): void {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return;
    this.employeePageSize.set(size);
    this.resetEmployeePage();
  }

  goToEmployeePage(page: number): void {
    const next = Math.min(Math.max(page, 1), this.employeeTotalPages());
    if (next === this.employeePage()) return;
    this.employeePage.set(next);
  }

  private resetEmployeePage(): void {
    this.employeePage.set(1);
  }

  loadData() {
    void this.loadStructureLookups();
    this.http.get<any>(`${this.apiUrl}/api/v1/users?limit=500&status=active`).subscribe({
      next: (res) => {
        const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        const users = rows.map((u: any) => {
          const prefs = this.parsePreferences(u?.preferences ?? u?.Preferences);
          const rawPayroll = prefs?.['payroll'] ?? prefs?.['Payroll'];
          const payroll = rawPayroll && typeof rawPayroll === 'object' ? rawPayroll as Record<string, unknown> : {};
          const payrollStatus = this.pickFirstText(
            u?.payrollStatus,
            u?.PayrollStatus,
            payroll['payrollStatus'],
            payroll['status'],
            payroll['invoiceStatus']
          ) || 'pending';
          const payType = this.normalizePayType(
            this.pickFirstText(
              u?.payType,
              u?.PayType,
              u?.pay_type,
              payroll['payType'],
              payroll['PayType'],
              payroll['type'],
              prefs?.['payType'],
              prefs?.['PayType'],
              prefs?.['compensationType']
            )
          );
          const payFrequency = this.pickFirstText(
            u?.payFrequency,
            u?.PayFrequency,
            payroll['payFrequency'],
            payroll['frequency']
          );
          const grossPay = this.resolveGrossPay(payType, payFrequency, u, payroll);
          const invoicedAmount = this.resolveInvoicedAmount(payType, payFrequency, u, payroll);
          return {
            ...u,
            payType,
            payFrequency,
            payRate: this.toNumberOrDefault(u.payRate, payroll['payRate'], 0),
            invoicedAmount,
            hours: this.toNumberOrDefault(payroll['standardHoursPerWeek'], 0),
            grossPay,
            deductions: this.toNumberOrDefault(payroll['defaultDeductions'], 0),
            netPay: 0,
            payrollStatus,
            invoiceNumber: this.pickFirstText(
              u?.invoiceNumber,
              u?.invoiceNo,
              u?.invoice_id,
              payroll['invoiceNumber'],
              payroll['invoiceNo']
            ),
            invoiceDate: this.pickFirstText(
              u?.invoiceDate,
              u?.invoicedAt,
              payroll['invoiceDate'],
              payroll['invoicedAt']
            )
          };
        });
        this.employees.set(users);
      },
      error: () => this.employees.set([])
    });
  }

  openPayrollDetails(emp: any): void {
    if (!emp || typeof emp !== 'object') return;
    const prefs = this.parsePreferences(emp?.preferences ?? emp?.Preferences);
    const payroll = prefs?.['payroll'] && typeof prefs['payroll'] === 'object'
      ? prefs['payroll'] as Record<string, unknown>
      : {};
    const payFrequency = this.normalizePayFrequency(
      this.pickFirstText(payroll['payFrequency'], payroll['frequency'], emp?.payFrequency)
    );
    const compensationModel = this.normalizeCompensationModel(
      this.pickFirstText(payroll['compensationModel'], payroll['contractType'], payroll['payPlan'], emp?.compensationModel)
    );
    this.selectedEmployeeDetails.set(emp);
    this.payrollDetailsForm.set({
      payFrequency,
      compensationModel,
      contractNotes: this.pickFirstText(payroll['contractNotes'], payroll['compensationNotes'], emp?.contractNotes)
    });
    this.detailsModalOpen.set(true);
  }

  closePayrollDetails(): void {
    this.detailsModalOpen.set(false);
    this.selectedEmployeeDetails.set(null);
    this.savingDetails.set(false);
  }

  openCreateInvoiceModal(emp: any): void {
    if (!emp?.id) return;
    const today = new Date();
    const due = new Date(today);
    due.setDate(due.getDate() + 7);
    this.selectedInvoiceEmployee.set(emp);
    this.invoiceForm.set({
      weekFilter: this.periodFilter() === 'all' ? 'current' : this.periodFilter(),
      dueDate: due.toISOString().slice(0, 10),
      reference: '',
      notes: ''
    });
    this.invoiceModalOpen.set(true);
  }

  closeCreateInvoiceModal(): void {
    this.invoiceModalOpen.set(false);
    this.selectedInvoiceEmployee.set(null);
  }

  updateInvoiceFormField<K extends keyof InvoiceCreateForm>(field: K, value: InvoiceCreateForm[K]): void {
    this.invoiceForm.update((current) => ({ ...current, [field]: value }));
  }

  async submitCreateInvoice(): Promise<void> {
    const employee = this.selectedInvoiceEmployee();
    if (!employee?.id) return;
    const form = this.invoiceForm();
    await this.createInvoice(employee, {
      weekFilter: form.weekFilter,
      dueDate: form.dueDate,
      reference: form.reference,
      notes: form.notes
    });
    this.closeCreateInvoiceModal();
  }

  updatePayrollFormField<K extends keyof PayrollDetailsForm>(field: K, value: PayrollDetailsForm[K]): void {
    this.payrollDetailsForm.update((current) => ({ ...current, [field]: value }));
  }

  async savePayrollDetails(): Promise<void> {
    const employee = this.selectedEmployeeDetails();
    if (!employee?.id) return;
    this.savingDetails.set(true);
    this.actionMessage.set('');
    try {
      const existingPrefs = this.parsePreferences(employee?.preferences ?? employee?.Preferences);
      const existingPayroll =
        existingPrefs?.['payroll'] && typeof existingPrefs['payroll'] === 'object'
          ? existingPrefs['payroll'] as Record<string, unknown>
          : {};
      const form = this.payrollDetailsForm();
      const mergedPreferences = {
        ...existingPrefs,
        payroll: {
          ...existingPayroll,
          payFrequency: form.payFrequency,
          compensationModel: form.compensationModel,
          contractNotes: form.contractNotes
        }
      };

      await firstValueFrom(
        this.http.put(`${this.apiUrl}/api/v1/users/${employee.id}`, {
          preferences: JSON.stringify(mergedPreferences)
        })
      );

      this.detailsModalOpen.set(false);
      this.actionMessage.set(`Updated payroll details for ${employee.name || 'employee'}.`);
      this.loadData();
    } catch {
      this.actionMessage.set('Failed to save payroll details.');
    } finally {
      this.savingDetails.set(false);
    }
  }

  async createInvoice(emp: any, options?: InvoiceCreateOptions): Promise<void> {
    if (!emp?.id || this.isInvoicedRow(emp)) return;
    this.creatingInvoiceForUserId.set(Number(emp.id));
    this.actionMessage.set('');
    try {
      const now = new Date();
      const weekFilter = options?.weekFilter || this.periodFilter();
      const invoiceNo = `INV-${emp.id}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const existingPrefs = this.parsePreferences(emp?.preferences ?? emp?.Preferences);
      const existingPayroll =
        existingPrefs?.['payroll'] && typeof existingPrefs['payroll'] === 'object'
          ? existingPrefs['payroll'] as Record<string, unknown>
          : {};
      const nextPayroll = { ...existingPayroll };
      const payType = String(emp?.payType ?? '').trim().toLowerCase();
      let lastInvoiceNumber = invoiceNo;
      let lastInvoiceDateIso = now.toISOString();
      if (payType === 'salary') {
        const annualPay = this.toNumberOrDefault(emp?.payRate, existingPayroll['annualSalary'], 0);
        const frequency = this.normalizePayFrequency(
          this.pickFirstText(emp?.payFrequency, existingPayroll['payFrequency'], existingPayroll['frequency'])
        );
        const periodsPerYear = this.getPayPeriodsPerYear(frequency);
        const periodAmount = periodsPerYear > 0 ? annualPay / periodsPerYear : 0;
        const expectedPeriods = this.getExpectedPaidPeriods(
          frequency,
          this.getReferenceDateForPeriodFilter(weekFilter),
          weekFilter
        );
        const currentYear = new Date().getUTCFullYear();
        const trackedYear = Number(existingPayroll['salaryInvoiceYear']);
        const activeYear = Number.isFinite(trackedYear) && trackedYear > 0 ? trackedYear : currentYear;

        let periodsInvoiced = this.toNumberOrDefault(existingPayroll['salaryPeriodsInvoicedYtd'], 0);
        let remainingBalance = this.toNumberOrDefault(existingPayroll['salaryRemainingBalance'], annualPay);

        if (activeYear !== currentYear) {
          periodsInvoiced = 0;
          remainingBalance = annualPay;
        }

        const targetPeriods = periodsInvoiced < expectedPeriods
          ? expectedPeriods
          : Math.min(periodsPerYear, periodsInvoiced + 1);

        const existingHistory = this.getPayrollInvoiceHistory(existingPayroll);
        const historyEntries: PayrollInvoiceEntry[] = [...existingHistory];
        for (let periodIndex = periodsInvoiced + 1; periodIndex <= targetPeriods; periodIndex++) {
          const generatedInvoiceNumber = `INV-${emp.id}-${currentYear}-${String(periodIndex).padStart(2, '0')}`;
          const generatedDateIso = this.getSalaryPeriodInvoiceDate(currentYear, frequency, periodIndex);
          const isLastGenerated = periodIndex === targetPeriods;
          historyEntries.push({
            invoiceNumber: generatedInvoiceNumber,
            invoiceDate: generatedDateIso,
            amount: Number(periodAmount.toFixed(2)),
            periodIndex,
            source: periodIndex < targetPeriods ? 'backfill' : 'manual',
            weekFilter,
            dueDate: isLastGenerated ? (options?.dueDate || '') : '',
            reference: isLastGenerated ? (options?.reference || '') : '',
            notes: isLastGenerated ? (options?.notes || '') : ''
          });
          lastInvoiceNumber = generatedInvoiceNumber;
          lastInvoiceDateIso = generatedDateIso;
        }

        periodsInvoiced = targetPeriods;
        remainingBalance = Math.max(0, annualPay - (periodsInvoiced * periodAmount));

        nextPayroll['annualSalary'] = annualPay;
        nextPayroll['salaryInvoiceYear'] = currentYear;
        nextPayroll['salaryPeriodsInvoicedYtd'] = periodsInvoiced;
        nextPayroll['salaryRemainingBalance'] = Number(remainingBalance.toFixed(2));
        nextPayroll['invoiceHistory'] = historyEntries.slice(-200);
      } else {
        const existingHistory = this.getPayrollInvoiceHistory(existingPayroll);
        const amount = this.toNumberOrDefault(emp?.grossPay, 0);
        nextPayroll['invoiceHistory'] = [
          ...existingHistory,
          {
            invoiceNumber: lastInvoiceNumber,
            invoiceDate: lastInvoiceDateIso,
            amount: Number(amount.toFixed(2)),
            source: 'manual',
            weekFilter,
            dueDate: options?.dueDate || '',
            reference: options?.reference || '',
            notes: options?.notes || ''
          }
        ].slice(-200);
      }
      const mergedPreferences = {
        ...existingPrefs,
        payroll: {
          ...nextPayroll,
          invoiceNumber: lastInvoiceNumber,
          invoiceDate: lastInvoiceDateIso
        }
      };
      await firstValueFrom(
        this.http.put(`${this.apiUrl}/api/v1/users/${emp.id}`, {
          preferences: JSON.stringify(mergedPreferences)
        })
      );
      this.actionMessage.set(`Invoice ${lastInvoiceNumber} created for ${emp.name || 'employee'}.`);
      this.loadData();
    } catch {
      this.actionMessage.set(`Failed to create invoice for ${emp?.name || 'employee'}.`);
    } finally {
      this.creatingInvoiceForUserId.set(null);
    }
  }

  openEmployeeProfile(emp: any): void {
    const employeeId = Number(emp?.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return;
    void this.router.navigate(['/hr/roster'], {
      queryParams: { editEmployeeId: employeeId }
    });
  }

  private pickFirstText(...values: unknown[]): string {
    for (const value of values) {
      const text = String(value ?? '').trim();
      if (text) return text;
    }
    return '';
  }

  isInvoicedRow(emp: any): boolean {
    const status = String(emp?.payrollStatus ?? '').trim().toLowerCase();
    return status === 'processed' || status === 'paid';
  }

  private hasInvoiceData(emp: any): boolean {
    if (!emp || typeof emp !== 'object') return false;
    const invoicedAmount = this.toNumberOrDefault(emp?.invoicedAmount, 0);
    if (invoicedAmount > 0) return true;

    const invoiceNo = String(emp?.invoiceNumber ?? emp?.invoiceNo ?? emp?.invoice_id ?? '').trim();
    if (invoiceNo) return true;

    const invoiceDate = String(emp?.invoiceDate ?? emp?.invoicedAt ?? '').trim();
    if (invoiceDate) return true;

    const prefs = this.parsePreferences(emp?.preferences ?? emp?.Preferences);
    const rawPayroll = prefs?.['payroll'] ?? prefs?.['Payroll'];
    const payroll = rawPayroll && typeof rawPayroll === 'object' ? rawPayroll as Record<string, unknown> : {};
    const history = this.getPayrollInvoiceHistory(payroll);
    return history.length > 0;
  }

  private normalizePayType(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return 'Salary';
    return normalized
      .replace(/[_-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private normalizePayFrequency(value: string): PayrollDetailsForm['payFrequency'] {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'bi-weekly') return 'biweekly';
    if (normalized === 'semi-monthly') return 'semimonthly';
    if (normalized === 'weekly' || normalized === 'biweekly' || normalized === 'semimonthly' || normalized === 'monthly') {
      return normalized;
    }
    return 'weekly';
  }

  private normalizeCompensationModel(value: string): PayrollDetailsForm['compensationModel'] {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'commission') return 'commission';
    return 'contract';
  }

  private resolveGrossPay(
    payType: string,
    payFrequency: string,
    user: any,
    payroll: Record<string, unknown>
  ): number {
    const normalizedPayType = String(payType ?? '').trim().toLowerCase();
    if (normalizedPayType !== 'salary') {
      return this.toNumberOrDefault(user?.grossPay, payroll['grossPay'], 0);
    }

    const annualPay = this.toNumberOrDefault(user?.payRate, payroll['payRate'], payroll['annualSalary'], 0);
    if (annualPay <= 0) return 0;

    const frequency = this.normalizePayFrequency(payFrequency);
    const periodsPerYear = this.getPayPeriodsPerYear(frequency);
    if (periodsPerYear <= 0) return Number(annualPay.toFixed(2));
    const periodAmount = annualPay / periodsPerYear;
    return Number(periodAmount.toFixed(2));
  }

  private resolveInvoicedAmount(
    payType: string,
    payFrequency: string,
    user: any,
    payroll: Record<string, unknown>
  ): number {
    const history = this.getPayrollInvoiceHistory(payroll);
    if (history.length > 0) {
      const latest = history[history.length - 1];
      return Number(this.toNumberOrDefault(latest?.amount, 0).toFixed(2));
    }

    const normalizedPayType = String(payType ?? '').trim().toLowerCase();
    if (normalizedPayType !== 'salary') {
      return Number(this.toNumberOrDefault(user?.grossPay, payroll['grossPay'], 0).toFixed(2));
    }

    const annualPay = this.toNumberOrDefault(user?.payRate, payroll['payRate'], payroll['annualSalary'], 0);
    if (annualPay <= 0) return 0;
    const periodsPerYear = this.getPayPeriodsPerYear(this.normalizePayFrequency(payFrequency));
    if (periodsPerYear <= 0) return 0;

    const periodsInvoiced = this.toNumberOrDefault(payroll['salaryPeriodsInvoicedYtd'], 0);
    const periodAmount = annualPay / periodsPerYear;
    return Number(Math.max(0, periodsInvoiced * periodAmount).toFixed(2));
  }

  private getPayPeriodsPerYear(frequency: PayrollDetailsForm['payFrequency']): number {
    switch (frequency) {
      case 'weekly':
        return 52;
      case 'biweekly':
        return 26;
      case 'semimonthly':
        return 24;
      case 'monthly':
        return 12;
      default:
        return 52;
    }
  }

  private getReferenceDateForPeriodFilter(filter: string): Date {
    const now = new Date();
    if (filter === 'current') return now;
    const weeksBack = Number(filter);
    if (!Number.isFinite(weeksBack) || weeksBack <= 0) return now;
    const ref = new Date(now);
    ref.setDate(ref.getDate() - (weeksBack * 7));
    return ref;
  }

  private getIsoWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const diffInDays = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;
    return Math.ceil(diffInDays / 7);
  }

  private getExpectedPaidPeriods(
    frequency: PayrollDetailsForm['payFrequency'],
    referenceDate: Date,
    filter?: string
  ): number {
    if ((filter ?? '').toLowerCase() === 'all') return 0;
    switch (frequency) {
      case 'weekly': {
        return Math.min(52, Math.max(0, this.getIsoWeekNumber(referenceDate)));
      }
      case 'biweekly': {
        const week = Math.min(52, Math.max(0, this.getIsoWeekNumber(referenceDate)));
        return Math.min(26, Math.floor((week + 1) / 2));
      }
      case 'semimonthly': {
        const monthIndex = referenceDate.getUTCMonth();
        const half = referenceDate.getUTCDate() > 15 ? 2 : 1;
        return Math.min(24, (monthIndex * 2) + half);
      }
      case 'monthly': {
        return Math.min(12, referenceDate.getUTCMonth() + 1);
      }
      default:
        return 0;
    }
  }

  private getPayrollInvoiceHistory(payroll: Record<string, unknown>): PayrollInvoiceEntry[] {
    const raw = payroll['invoiceHistory'];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        invoiceNumber: String(item['invoiceNumber'] ?? '').trim(),
        invoiceDate: String(item['invoiceDate'] ?? '').trim(),
        amount: this.toNumberOrDefault(item['amount'], 0),
        periodIndex: this.toNumberOrDefault(item['periodIndex'], 0),
        source: String(item['source'] ?? '').trim() || 'manual',
        weekFilter: String(item['weekFilter'] ?? '').trim(),
        dueDate: String(item['dueDate'] ?? '').trim(),
        reference: String(item['reference'] ?? '').trim(),
        notes: String(item['notes'] ?? '').trim()
      }))
      .filter((item) => item.invoiceNumber && item.invoiceDate);
  }

  private getSalaryPeriodInvoiceDate(
    year: number,
    frequency: PayrollDetailsForm['payFrequency'],
    periodIndex: number
  ): string {
    const safePeriod = Math.max(1, periodIndex);
    const date = new Date(Date.UTC(year, 0, 1));

    switch (frequency) {
      case 'weekly':
        date.setUTCDate(date.getUTCDate() + ((safePeriod - 1) * 7));
        break;
      case 'biweekly':
        date.setUTCDate(date.getUTCDate() + ((safePeriod - 1) * 14));
        break;
      case 'semimonthly': {
        const monthIndex = Math.floor((safePeriod - 1) / 2);
        const half = ((safePeriod - 1) % 2) + 1;
        date.setUTCMonth(monthIndex, half === 1 ? 15 : 1);
        if (half === 2) {
          const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
          date.setUTCDate(lastDay);
        }
        break;
      }
      case 'monthly':
        date.setUTCMonth(safePeriod - 1, 1);
        date.setUTCDate(new Date(Date.UTC(year, safePeriod, 0)).getUTCDate());
        break;
      default:
        break;
    }

    return date.toISOString();
  }

  getPayFrequencyLabel(emp: any): string {
    const raw = String(emp?.payFrequency ?? '').trim().toLowerCase();
    if (!raw) return '--';
    if (raw === 'bi-weekly') return 'Biweekly';
    if (raw === 'semi-monthly') return 'Semi-monthly';
    if (raw === 'weekly') return 'Weekly';
    if (raw === 'biweekly') return 'Biweekly';
    if (raw === 'semimonthly') return 'Semi-monthly';
    if (raw === 'monthly') return 'Monthly';
    return raw
      .replace(/[_-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private parsePreferences(raw: unknown): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, any>;
    if (typeof raw !== 'string') return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private toNumberOrDefault(...values: unknown[]): number {
    let fallback = 0;
    if (values.length > 1) {
      const last = Number(values[values.length - 1]);
      if (Number.isFinite(last)) fallback = last;
    }
    for (let i = 0; i < values.length - 1; i++) {
      const parsed = Number(values[i]);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (values.length === 1) {
      const parsed = Number(values[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  private async loadStructureLookups(): Promise<void> {
    const requests = [
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/v1/organizations?limit=500`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/v1/divisions?limit=500`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/v1/departments?pageSize=500`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/v1/positions?pageSize=500`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/v1/terminals?pageSize=500`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/v1/satellites?pageSize=500`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/v1/agencies?pageSize=500`))
    ];
    const [orgs, divisions, departments, positions, terminals, satellites, agencies] = await Promise.allSettled(requests);

    if (orgs.status === 'fulfilled') {
      this.organizationNameById.set(this.buildIdNameMap(orgs.value?.data, ['id', 'Id'], ['name', 'Name']));
    }
    if (divisions.status === 'fulfilled') {
      this.divisionNameById.set(this.buildIdNameMap(divisions.value?.data, ['id', 'Id'], ['name', 'Name']));
    }
    if (departments.status === 'fulfilled') {
      this.departmentNameById.set(this.buildIdNameMap(departments.value?.data, ['id', 'Id'], ['name', 'Name']));
    }
    if (positions.status === 'fulfilled') {
      this.positionNameById.set(this.buildIdNameMap(positions.value?.data, ['id', 'Id'], ['title', 'Title', 'name', 'Name']));
    }
    if (terminals.status === 'fulfilled') {
      this.terminalNameById.set(this.buildIdNameMap(terminals.value?.data, ['id', 'Id'], ['name', 'Name']));
    }
    if (satellites.status === 'fulfilled') {
      this.satelliteNameById.set(this.buildIdNameMap(satellites.value?.data, ['id', 'Id'], ['name', 'Name']));
    }
    if (agencies.status === 'fulfilled') {
      this.agencyNameById.set(this.buildIdNameMap(agencies.value?.data, ['id', 'Id'], ['name', 'Name']));
    }
  }

  getOrganizationLabel(emp: any): string | null {
    if (!emp || typeof emp !== 'object') return null;
    const byName = String(
      emp.organizationName
      ?? emp.organization
      ?? this.organizationNameById()[Number(emp.organizationId) || 0]
      ?? ''
    ).trim();
    if (byName) return byName;
    const byId = Number(emp.organizationId);
    if (Number.isFinite(byId) && byId > 0) return `Organization ${byId}`;
    return null;
  }

  getDivisionLabel(emp: any): string | null {
    if (!emp || typeof emp !== 'object') return null;
    const byName = this.firstNonEmpty(
      emp.divisionName,
      emp.division,
      this.divisionNameById()[Number(emp.divisionId) || 0]
    );
    if (byName) return byName;
    const byId = Number(emp.divisionId);
    if (Number.isFinite(byId) && byId > 0) return `Division ${byId}`;
    return null;
  }

  private getPositionLabel(emp: any): string | null {
    if (!emp || typeof emp !== 'object') return null;
    const byName = this.firstNonEmpty(
      emp.positionTitle,
      emp.position,
      this.positionNameById()[Number(emp.positionId) || 0]
    );
    if (byName) return byName;
    const byId = Number(emp.positionId);
    if (Number.isFinite(byId) && byId > 0) return `Position ${byId}`;
    return null;
  }

  private getSearchFieldText(emp: any, field: StructureFilterField): string {
    const divisionId = Number(emp?.divisionId) || 0;
    const departmentId = Number(emp?.departmentId) || 0;
    const positionId = Number(emp?.positionId) || 0;
    const terminalId = Number(emp?.terminalId) || 0;
    const satelliteId = Number(emp?.satelliteId) || 0;
    const agencyId = Number(emp?.agencyId) || 0;

    switch (field) {
      case 'division':
        return this.firstNonEmpty(
          emp?.divisionName,
          emp?.division,
          this.divisionNameById()[divisionId],
          this.withId('Division', emp?.divisionId)
        );
      case 'department':
        return this.firstNonEmpty(
          emp?.departmentName,
          emp?.department,
          this.departmentNameById()[departmentId],
          this.withId('Department', emp?.departmentId)
        );
      case 'position':
        return this.firstNonEmpty(
          emp?.positionTitle,
          emp?.position,
          this.positionNameById()[positionId],
          this.withId('Position', emp?.positionId)
        );
      case 'jobTitle':
        return this.firstNonEmpty(emp?.jobTitle);
      case 'terminal':
        return this.firstNonEmpty(
          emp?.terminalName,
          emp?.terminal,
          this.terminalNameById()[terminalId],
          this.withId('Terminal', emp?.terminalId)
        );
      case 'satellite':
        return this.firstNonEmpty(
          emp?.satelliteName,
          emp?.satellite,
          this.satelliteNameById()[satelliteId],
          this.withId('Satellite', emp?.satelliteId)
        );
      case 'agency':
        return this.firstNonEmpty(
          emp?.agencyName,
          emp?.agency,
          this.agencyNameById()[agencyId],
          this.withId('Agency', emp?.agencyId)
        );
      case 'all':
      default:
        return '';
    }
  }

  private getAllSearchableText(emp: any): string {
    return this.joinSearchValues(
      emp?.name,
      emp?.email,
      emp?.payType,
      emp?.payrollStatus,
      this.getOrganizationLabel(emp),
      emp?.divisionName,
      emp?.division,
      this.withId('division', emp?.divisionId),
      emp?.departmentName,
      emp?.department,
      this.withId('department', emp?.departmentId),
      emp?.positionTitle,
      emp?.position,
      this.withId('position', emp?.positionId),
      emp?.jobTitle,
      emp?.terminalName,
      emp?.terminal,
      this.withId('terminal', emp?.terminalId),
      emp?.satelliteName,
      emp?.satellite,
      this.withId('satellite', emp?.satelliteId),
      emp?.agencyName,
      emp?.agency,
      this.withId('agency', emp?.agencyId)
    );
  }

  private withId(prefix: string, value: unknown): string {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) return '';
    return `${prefix} ${id}`;
  }

  private firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
      const text = String(value ?? '').trim();
      if (text) return text;
    }
    return '';
  }

  private joinSearchValues(...values: unknown[]): string {
    return values
      .map((v) => String(v ?? '').trim().toLowerCase())
      .filter(Boolean)
      .join(' ');
  }

  private buildIdNameMap(
    payload: unknown,
    idKeys: string[],
    nameKeys: string[]
  ): Record<number, string> {
    if (!Array.isArray(payload)) return {};
    const map: Record<number, string> = {};
    for (const item of payload) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      let id = 0;
      for (const key of idKeys) {
        const n = Number(row[key]);
        if (Number.isFinite(n) && n > 0) {
          id = n;
          break;
        }
      }
      if (!id) continue;
      for (const key of nameKeys) {
        const name = String(row[key] ?? '').trim();
        if (name) {
          map[id] = name;
          break;
        }
      }
    }
    return map;
  }
}

type StructureFilterField =
  | 'division'
  | 'department'
  | 'position'
  | 'jobTitle'
  | 'terminal'
  | 'satellite'
  | 'agency'
  | 'all';

type PayrollDetailsForm = {
  payFrequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  compensationModel: 'contract' | 'commission';
  contractNotes: string;
};

type PayrollInvoiceEntry = {
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  periodIndex?: number;
  source?: string;
  weekFilter?: string;
  dueDate?: string;
  reference?: string;
  notes?: string;
};

type InvoiceCreateForm = {
  weekFilter: string;
  dueDate: string;
  reference: string;
  notes: string;
};

type InvoiceCreateOptions = {
  weekFilter: string;
  dueDate?: string;
  reference?: string;
  notes?: string;
};
