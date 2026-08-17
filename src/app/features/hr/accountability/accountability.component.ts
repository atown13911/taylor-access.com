import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import {
  AccountabilityEntry,
  AccountabilityWritePayload,
  AccountabilityService,
} from '../../../core/services/accountability.service';

interface RosterEmployee {
  id: number;
  name: string;
  email?: string | null;
  jobTitle?: string | null;
  position?: { title?: string | null } | null;
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

  loading = signal(false);
  saving = signal(false);
  searchQuery = signal('');
  showForm = signal(false);
  editingId = signal<number | null>(null);
  employees = signal<RosterEmployee[]>([]);
  employeeQuery = signal('');
  showEmployeeList = signal(false);
  selectedEmployeeId = signal<number | null>(null);

  form: AccountabilityWritePayload = this.blankForm();

  entries = this.api.entries;

  filtered = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    let rows = this.entries();
    if (q) {
      rows = rows.filter(
        (e) =>
          e.jobPosition.toLowerCase().includes(q) ||
          (e.individual || '').toLowerCase().includes(q) ||
          (e.notes || '').toLowerCase().includes(q)
      );
    }
    return rows;
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

  reload(): void {
    this.loading.set(true);
    this.api.load().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load accountability chart');
      },
    });
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
    };
    this.syncEmployeePicker(row.individual || '');
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
    if (title && !(this.form.jobPosition || '').trim()) {
      this.form.jobPosition = title;
    }
    this.showEmployeeList.set(false);
  }

  employeeTitle(emp: RosterEmployee | null | undefined): string {
    if (!emp) return '';
    return String(emp.position?.title || emp.jobTitle || '').trim();
  }

  save(): void {
    const jobPosition = (this.form.jobPosition || '').trim();
    if (!jobPosition) {
      this.toast.error('Job position is required');
      return;
    }

    const typedName = (this.form.individual || this.employeeQuery() || '').trim();
    const matched = this.findEmployeeByName(typedName);
    const individual = matched?.name?.trim() || typedName || null;

    const payload: AccountabilityWritePayload = {
      jobPosition,
      individual,
      notes: (this.form.notes || '').trim() || null,
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
      `Remove "${row.jobPosition}" from the accountability chart?`,
      'Remove Position'
    );
    if (!ok) return;

    this.api.delete(row.id).subscribe({
      next: () => this.toast.success('Position removed'),
      error: () => this.toast.error('Failed to remove position'),
    });
  }

  private blankForm(): AccountabilityWritePayload {
    return { jobPosition: '', individual: '', notes: '' };
  }

  private resetEmployeePicker(): void {
    this.employeeQuery.set('');
    this.selectedEmployeeId.set(null);
    this.showEmployeeList.set(false);
  }

  private syncEmployeePicker(name: string): void {
    const match = this.findEmployeeByName(name);
    this.employeeQuery.set(match?.name || name);
    this.selectedEmployeeId.set(match?.id ?? null);
    this.showEmployeeList.set(false);
  }

  private findEmployeeByName(name: string): RosterEmployee | undefined {
    const needle = name.trim().toLowerCase();
    if (!needle) return undefined;
    return this.employees().find((emp) => (emp.name || '').trim().toLowerCase() === needle);
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
