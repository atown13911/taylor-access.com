import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ConfirmService } from '../../../core/services/confirm.service';
import { ToastService } from '../../../core/services/toast.service';

type Tab = 'pending' | 'history' | 'balances' | 'calendar';

interface TimeOffRequest {
  id: number;
  employeeId: number;
  employeeName?: string;
  employee?: { id: number; name: string; email?: string };
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: string;
  approvedByName?: string;
  approvedBy?: { name: string };
  approvedAt?: string;
  denialReason?: string;
  createdAt: string;
}

interface TimeOffBalance {
  id: number;
  employeeId: number;
  employee?: { id: number; name: string };
  year: number;
  ptoTotal: number;
  ptoUsed: number;
  ptoRemaining: number;
  sickTotal: number;
  sickUsed: number;
  sickRemaining: number;
  personalTotal: number;
  personalUsed: number;
  personalRemaining: number;
}

interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  requests: TimeOffRequest[];
}

@Component({
  selector: 'app-time-off',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './time-off.component.html',
  styleUrls: ['./time-off.component.scss']
})
export class TimeOffComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private confirmSvc = inject(ConfirmService);
  private toast = inject(ToastService);

  activeTab = signal<Tab>('calendar');
  loading = signal(true);

  pendingRequests = signal<TimeOffRequest[]>([]);
  allRequests = signal<TimeOffRequest[]>([]);
  balances = signal<TimeOffBalance[]>([]);
  employees = signal<any[]>([]);

  // Calendar tab state
  selectedEmployee = signal<any | null>(null);
  employeeSearch = signal('');
  calendarMonth = signal(new Date().getMonth());
  calendarYear = signal(new Date().getFullYear());
  selectedEmployeeRequests = signal<TimeOffRequest[]>([]);
  selectedEmployeeBalance = signal<TimeOffBalance | null>(null);

  filteredEmployees = computed(() => {
    const search = this.employeeSearch().toLowerCase().trim();
    let emps = this.employees();
    if (search) {
      emps = emps.filter(e =>
        (e.name || '').toLowerCase().includes(search) ||
        (e.email || '').toLowerCase().includes(search) ||
        (e.department || '').toLowerCase().includes(search)
      );
    }
    return emps;
  });

  calendarDays = computed(() => {
    const month = this.calendarMonth();
    const year = this.calendarYear();
    const requests = this.selectedEmployeeRequests();
    return this.buildCalendar(year, month, requests);
  });

  calendarMonthLabel = computed(() => {
    const date = new Date(this.calendarYear(), this.calendarMonth(), 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  upcomingRequests = computed(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return this.selectedEmployeeRequests()
      .filter(r => new Date(r.endDate) >= now && (r.status === 'approved' || r.status === 'pending'))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 5);
  });

  // Request modal
  showRequestModal = signal(false);
  saving = signal(false);
  requestForm = signal({
    employeeId: null as number | null,
    type: 'pto',
    startDate: '',
    endDate: '',
    days: 1,
    reason: ''
  });

  // Deny modal
  showDenyModal = signal(false);
  denyTargetId = signal<number | null>(null);
  denyReason = signal('');

  // Computed stats
  pendingCount = computed(() => this.pendingRequests().length);
  approvedThisMonth = computed(() => {
    const now = new Date();
    return this.allRequests().filter(r =>
      r.status === 'approved' &&
      new Date(r.createdAt).getMonth() === now.getMonth() &&
      new Date(r.createdAt).getFullYear() === now.getFullYear()
    ).length;
  });
  totalDaysUsed = computed(() => {
    return this.balances().reduce((sum, b) => sum + b.ptoUsed + b.sickUsed + b.personalUsed, 0);
  });

  readonly typeOptions = [
    { value: 'pto', label: 'PTO', icon: 'bx-sun' },
    { value: 'vacation', label: 'Vacation', icon: 'bx-map-alt' },
    { value: 'sick', label: 'Sick Leave', icon: 'bx-plus-medical' },
    { value: 'personal', label: 'Personal Day', icon: 'bx-user' },
    { value: 'unpaid', label: 'Unpaid Leave', icon: 'bx-wallet' },
    { value: 'bereavement', label: 'Bereavement', icon: 'bx-heart' },
    { value: 'jury_duty', label: 'Jury Duty', icon: 'bx-building' }
  ];

  readonly historyFilter = signal('all');

  filteredHistory = computed(() => {
    const filter = this.historyFilter();
    if (filter === 'all') return this.allRequests();
    return this.allRequests().filter(r => r.status === filter);
  });

  ngOnInit() {
    this.loadData();
  }

  switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'balances') this.loadBalances();
    if (tab === 'history') this.loadAllRequests();
    if (tab === 'calendar' && !this.selectedEmployee()) {
      // Auto-select first employee if available
      const emps = this.employees();
      if (emps.length > 0) this.selectEmployee(emps[0]);
    }
  }

  async loadData() {
    this.loading.set(true);
    try {
      await Promise.all([
        this.loadPending(),
        this.loadEmployees(),
        this.loadBalances(),
        this.loadAllRequests()
      ]);
    } finally {
      this.loading.set(false);
    }
  }

  async loadPending() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/time-off/requests?status=pending`).toPromise();
      const requests = (res?.data || []).map((r: any) => ({
        ...r,
        employeeName: r.employee?.name || `Employee #${r.employeeId}`,
        approvedByName: r.approvedBy?.name
      }));
      this.pendingRequests.set(requests);
    } catch { this.pendingRequests.set([]); }
  }

  async loadAllRequests() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/time-off/requests?limit=200`).toPromise();
      const requests = (res?.data || []).map((r: any) => ({
        ...r,
        employeeName: r.employee?.name || `Employee #${r.employeeId}`,
        approvedByName: r.approvedBy?.name
      }));
      this.allRequests.set(requests);
    } catch { this.allRequests.set([]); }
  }

  async loadBalances() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/time-off/balances`).toPromise();
      this.balances.set(res?.data || []);
    } catch { this.balances.set([]); }
  }

  async loadEmployees() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/users?limit=5000&status=active`).toPromise();
      this.employees.set(res?.data || []);
    } catch { this.employees.set([]); }
  }

  // ==================== CALENDAR TAB ====================

  selectEmployee(emp: any): void {
    this.selectedEmployee.set(emp);
    // Filter requests for this employee
    const empRequests = this.allRequests().filter(r => r.employeeId === emp.id);
    this.selectedEmployeeRequests.set(empRequests);
    // Find balance for this employee
    const balance = this.balances().find(b => b.employeeId === emp.id) || null;
    this.selectedEmployeeBalance.set(balance);
  }

  prevMonth(): void {
    let m = this.calendarMonth();
    let y = this.calendarYear();
    if (m === 0) { m = 11; y--; } else { m--; }
    this.calendarMonth.set(m);
    this.calendarYear.set(y);
  }

  nextMonth(): void {
    let m = this.calendarMonth();
    let y = this.calendarYear();
    if (m === 11) { m = 0; y++; } else { m++; }
    this.calendarMonth.set(m);
    this.calendarYear.set(y);
  }

  goToday(): void {
    this.calendarMonth.set(new Date().getMonth());
    this.calendarYear.set(new Date().getFullYear());
  }

  buildCalendar(year: number, month: number, requests: TimeOffRequest[]): CalendarDay[] {
    const days: CalendarDay[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fill leading days from previous month
    const startDow = firstDay.getDay(); // 0=Sun
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push(this.makeCalDay(d, false, today, requests));
    }

    // Current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push(this.makeCalDay(date, true, today, requests));
    }

    // Trailing days to fill 6 rows (42 cells)
    while (days.length < 42) {
      const d = new Date(year, month + 1, days.length - lastDay.getDate() - startDow + 1);
      days.push(this.makeCalDay(d, false, today, requests));
    }

    return days;
  }

  private makeCalDay(date: Date, isCurrentMonth: boolean, today: Date, requests: TimeOffRequest[]): CalendarDay {
    const dateStr = this.toDateStr(date);
    const matchingRequests = requests.filter(r => {
      const start = this.toDateStr(new Date(r.startDate));
      const end = this.toDateStr(new Date(r.endDate));
      return dateStr >= start && dateStr <= end;
    });
    return {
      date,
      day: date.getDate(),
      isCurrentMonth,
      isToday: date.getTime() === today.getTime(),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      requests: matchingRequests
    };
  }

  private toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  getRequestTypeColor(type: string): string {
    switch (type) {
      case 'pto': case 'vacation': return '#00ff88';
      case 'sick': return '#ff2a6d';
      case 'personal': return '#818cf8';
      case 'bereavement': return '#ec4899';
      case 'jury_duty': return '#fbbf24';
      case 'unpaid': return '#999';
      default: return '#00d4ff';
    }
  }

  openRequestForEmployee(): void {
    const emp = this.selectedEmployee();
    if (!emp) return;
    this.requestForm.set({
      employeeId: emp.id,
      type: 'pto',
      startDate: '',
      endDate: '',
      days: 1,
      reason: ''
    });
    this.showRequestModal.set(true);
  }

  // ==================== REQUEST MODAL ====================

  openRequestModal(): void {
    this.requestForm.set({
      employeeId: null,
      type: 'pto',
      startDate: '',
      endDate: '',
      days: 1,
      reason: ''
    });
    this.showRequestModal.set(true);
  }

  closeRequestModal(): void {
    this.showRequestModal.set(false);
  }

  updateFormField(field: string, value: any): void {
    this.requestForm.update(f => ({ ...f, [field]: value }));
    // Auto-calculate days when dates change
    if (field === 'startDate' || field === 'endDate') {
      this.calculateDays();
    }
  }

  calculateDays(): void {
    const form = this.requestForm();
    if (form.startDate && form.endDate) {
      const start = new Date(form.startDate);
      const end = new Date(form.endDate);
      if (end >= start) {
        let count = 0;
        const current = new Date(start);
        while (current <= end) {
          const dow = current.getDay();
          if (dow !== 0 && dow !== 6) count++; // Skip weekends
          current.setDate(current.getDate() + 1);
        }
        this.requestForm.update(f => ({ ...f, days: count || 1 }));
      }
    }
  }

  async submitRequest() {
    const form = this.requestForm();
    if (!form.employeeId) { this.toast.warning('Please select an employee'); return; }
    if (!form.startDate || !form.endDate) { this.toast.warning('Please select start and end dates'); return; }
    if (new Date(form.endDate) < new Date(form.startDate)) { this.toast.warning('End date must be after start date'); return; }

    this.saving.set(true);
    try {
      await this.http.post(`${this.apiUrl}/api/v1/time-off/requests`, {
        employeeId: form.employeeId,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        days: form.days,
        reason: form.reason || null,
        status: 'pending'
      }).toPromise();

      this.toast.champagne('Time off request submitted successfully');
      this.closeRequestModal();
      this.loadPending();
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'Failed to submit request');
    } finally {
      this.saving.set(false);
    }
  }

  // ==================== APPROVE / DENY ====================

  async approve(id: number) {
    try {
      await this.http.post(`${this.apiUrl}/api/v1/time-off/requests/${id}/approve`, {}).toPromise();
      this.toast.champagne('Request approved');
      this.loadPending();
      this.loadBalances();
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'Failed to approve');
    }
  }

  openDenyModal(id: number): void {
    this.denyTargetId.set(id);
    this.denyReason.set('');
    this.showDenyModal.set(true);
  }

  closeDenyModal(): void {
    this.showDenyModal.set(false);
    this.denyTargetId.set(null);
  }

  async submitDeny() {
    const id = this.denyTargetId();
    if (!id) return;

    try {
      await this.http.post(`${this.apiUrl}/api/v1/time-off/requests/${id}/deny`, {
        reason: this.denyReason() || null
      }).toPromise();
      this.toast.success('Request denied');
      this.closeDenyModal();
      this.loadPending();
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'Failed to deny');
    }
  }

  async cancelRequest(request: TimeOffRequest) {
    const ok = await this.confirmSvc.show({
      message: `Cancel time off request for ${request.employeeName}?`,
      type: 'danger',
      confirmText: 'Cancel Request'
    });
    if (!ok) return;

    try {
      await this.http.post(`${this.apiUrl}/api/v1/time-off/requests/${request.id}/cancel`, {}).toPromise();
      this.toast.success('Request cancelled');
      this.loadPending();
      this.loadAllRequests();
      this.loadBalances();
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'Failed to cancel');
    }
  }

  // ==================== HELPERS ====================

  getTypeLabel(type: string): string {
    return this.typeOptions.find(t => t.value === type)?.label || type;
  }

  getTypeIcon(type: string): string {
    return this.typeOptions.find(t => t.value === type)?.icon || 'bx-calendar';
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getStatusClass(status: string): string {
    return status;
  }

  getBalancePercent(used: number, total: number): number {
    if (total <= 0) return 0;
    return Math.min((used / total) * 100, 100);
  }
}
