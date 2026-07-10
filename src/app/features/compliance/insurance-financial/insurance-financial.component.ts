import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventTrackingService } from '../../../core/services/event-tracking.service';
import { ConfirmService } from '../../../core/services/confirm.service';

type PageTab = 'insurance' | 'charging' | 'financial';

interface ChargingRow {
  driverName: string;
  policyType: string;
  providerName: string;
  policyNumber: string;
  expenseBasis: string;
  billingFrequency: string;
  policyCost: number;
  chargeAmount: number;
  perIncidentDeductible: number;
  enrollmentStatus: string;
  policyStatus: string;
}

interface EnrollmentMatrixColumn {
  policyId: string;
  policyType: string;
  label: string;
  expenseBasis: string;
}

interface EnrollmentMatrixRow {
  driverId: number;
  driverName: string;
  cells: Record<string, 'enrolled' | 'not_enrolled'>;
}

interface InsuranceRow {
  id: string;
  policyType: string;
  providerName: string;
  policyNumber: string;
  coverageAmount: number;
  premiumCost?: number;
  expenseBasis?: string;
  perIncidentDeductible?: number;
  billingFrequency?: string;
  effectiveDate: string;
  expiryDate: string;
  status: string;
  notes: string;
  fileName: string;
  hasFile: boolean;
}


@Component({
  selector: 'app-insurance-financial',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './insurance-financial.component.html',
  styleUrls: ['./insurance-financial.component.scss']
})
export class InsuranceFinancialComponent implements OnInit {
  private api = inject(VanTacApiService);
  private toast = inject(ToastService);
  private tracking = inject(EventTrackingService);
  private confirm = inject(ConfirmService);

  pageTab = signal<PageTab>('insurance');

  // Charging table state
  chargingEnrollmentsByPolicy = signal<Record<string, any[]>>({});
  chargingDrivers = signal<any[]>([]);
  loadingCharging = signal(false);
  chargingSearch = '';
  matrixSearch = '';

  // Insurance state
  policies = signal<InsuranceRow[]>([]);
  loadingPolicies = signal(false);
  showPolicyModal = signal(false);
  editingPolicy = signal<InsuranceRow | null>(null);
  savingPolicy = signal(false);
  policyFile: File | null = null;
  policyForm = {
    policyType: 'general_liability',
    providerName: '',
    policyNumber: '',
    coverageAmount: 0,
    premiumCost: 0,
    expenseBasis: 'whole_policy',
    perIncidentDeductible: 0,
    billingFrequency: 'monthly',
    effectiveDate: '',
    expiryDate: '',
    notes: '',
    remind3Months: false,
    remind30Days: true,
    remind15Days: true,
    remindDayOf: true,
    remindDailyPastDue: true
  };

  readonly expenseBasisOptions = [
    { value: 'whole_policy', label: 'One Whole Policy' },
    { value: 'per_driver', label: 'Per Driver' }
  ];

  readonly billingFrequencyOptions = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'semi_annual', label: 'Semi-Annual' },
    { value: 'annual', label: 'Annual' }
  ];

  readonly policyTypes = [
    { value: 'general_liability', label: 'General Liability' },
    { value: 'auto_liability', label: 'Auto Liability' },
    { value: 'cargo', label: 'Cargo' },
    { value: 'workers_comp', label: 'Workers Compensation' },
    { value: 'mcs90', label: 'MCS-90 Endorsement' },
    { value: 'umbrella', label: 'Umbrella' },
    { value: 'physical_damage', label: 'Physical Damage' },
    { value: 'bobtail', label: 'Bobtail' },
    { value: 'non_trucking', label: 'Non-Trucking Liability' },
    { value: 'occupational_accident', label: 'Occupational Accident' },
    { value: 'supplemental', label: 'Supplemental' },
    { value: 'trailer_interchange', label: 'Trailer Interchange' }
  ];

  // Financial state -- enabled payment methods for the org
  enabledMethods = signal<Set<string>>(new Set());
  loadingPayments = signal(false);

  readonly paymentMethods = [
    { value: 'direct_deposit', label: 'Direct Deposit', group: 'bank' },
    { value: 'comdata', label: 'Comdata', group: 'card' },
    { value: 'efs', label: 'EFS', group: 'card' },
    { value: 'wex', label: 'WEX / Fleet One', group: 'card' },
    { value: 'tchek', label: 'T-Chek', group: 'card' },
    { value: 'rts', label: 'RTS', group: 'card' },
    { value: 'stripe', label: 'Stripe', group: 'card' },
    { value: 'paper_check', label: 'Paper Check', group: 'check' }
  ];

  // Report state
  showReport = signal(false);
  reportDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Collapsed-by-type view
  expandedTypes = signal<Set<string>>(new Set());

  toggleTypeExpand(type: string): void {
    this.expandedTypes.update(s => {
      const n = new Set(s);
      n.has(type) ? n.delete(type) : n.add(type);
      return n;
    });
  }

  /** Groups policies by type, picks the most current as the primary row. */
  groupedByType = computed(() => {
    const map = new Map<string, InsuranceRow[]>();
    for (const p of this.policies()) {
      const arr = map.get(p.policyType) ?? [];
      arr.push(p);
      map.set(p.policyType, arr);
    }

    const statusOrder: Record<string, number> = { active: 0, expiring: 1, expired: 2 };

    return Array.from(map.entries()).map(([type, rows]) => {
      // Sort: active first, then by effectiveDate desc
      const sorted = [...rows].sort((a, b) => {
        const sA = statusOrder[a.status] ?? 3;
        const sB = statusOrder[b.status] ?? 3;
        if (sA !== sB) return sA - sB;
        return new Date(b.effectiveDate || 0).getTime() - new Date(a.effectiveDate || 0).getTime();
      });
      return { type, current: sorted[0], history: sorted.slice(1) };
    }).sort((a, b) => {
      // Sort groups: active types first
      const aStatus = statusOrder[a.current.status] ?? 3;
      const bStatus = statusOrder[b.current.status] ?? 3;
      if (aStatus !== bStatus) return aStatus - bStatus;
      return (a.current.policyType || '').localeCompare(b.current.policyType || '');
    });
  });

  // Year grouping
  selectedYear = signal<number | null>(null);

  availableYears = computed(() => {
    const years = new Set<number>();
    for (const p of this.policies()) {
      const startYear = p.effectiveDate ? new Date(p.effectiveDate).getFullYear() : new Date().getFullYear();
      const endYear = p.expiryDate ? new Date(p.expiryDate).getFullYear() : startYear;
      for (let y = startYear; y <= endYear; y++) {
        years.add(y);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  });

  filteredPoliciesByYear = computed(() => {
    const year = this.selectedYear();
    if (!year) return this.policies();
    return this.policies().filter(p => {
      const startYear = p.effectiveDate ? new Date(p.effectiveDate).getFullYear() : new Date().getFullYear();
      const endYear = p.expiryDate ? new Date(p.expiryDate).getFullYear() : startYear;
      return year >= startYear && year <= endYear;
    });
  });

  policiesByYearGrouped = computed(() => {
    const groups = new Map<number, any[]>();
    for (const p of this.policies()) {
      const startYear = p.effectiveDate ? new Date(p.effectiveDate).getFullYear() : new Date().getFullYear();
      const endYear = p.expiryDate ? new Date(p.expiryDate).getFullYear() : startYear;
      // Add policy to every year it spans
      for (let y = startYear; y <= endYear; y++) {
        if (!groups.has(y)) groups.set(y, []);
        groups.get(y)!.push(p);
      }
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b - a);
  });

  totalCoverage = computed(() => {
    return this.policies().reduce((sum, p) => sum + (p.coverageAmount || 0), 0);
  });

  coverageSummary = computed(() => {
    const byType = new Map<string, { type: string; count: number; totalCoverage: number; hasExpired: boolean; hasExpiring: boolean }>();
    for (const p of this.policies()) {
      const existing = byType.get(p.policyType) || { type: p.policyType, count: 0, totalCoverage: 0, hasExpired: false, hasExpiring: false };
      existing.count++;
      existing.totalCoverage += p.coverageAmount || 0;
      if (p.status === 'expired') existing.hasExpired = true;
      if (p.status === 'expiring') existing.hasExpiring = true;
      byType.set(p.policyType, existing);
    }
    return Array.from(byType.values());
  });

  openReport(): void {
    this.reportDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    this.showReport.set(true);
  }

  closeReport(): void {
    this.showReport.set(false);
  }

  exportReportCSV(): void {
    const rows: string[] = [];
    rows.push('Type,Provider,Policy #,Coverage,Effective,Expiry,Status');
    for (const p of this.policies()) {
      rows.push([
        this.getPolicyTypeLabel(p.policyType),
        `"${p.providerName}"`,
        p.policyNumber || '',
        p.coverageAmount || '',
        p.effectiveDate ? new Date(p.effectiveDate).toLocaleDateString() : '',
        p.expiryDate ? new Date(p.expiryDate).toLocaleDateString() : '',
        p.status
      ].join(','));
    }
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `insurance-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.toast.success('CSV exported', 'Download');
  }

  printReport(): void {
    const reportEl = document.getElementById('insurance-report');
    if (!reportEl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Insurance Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
        h2 { margin-bottom: 5px; } h4 { margin-top: 20px; margin-bottom: 8px; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; font-weight: 600; }
        .report-summary { display: flex; gap: 20px; margin: 15px 0; }
        .report-stat { text-align: center; }
        .rs-value { display: block; font-size: 24px; font-weight: 700; }
        .rs-label { font-size: 11px; color: #888; text-transform: uppercase; }
        .expired-row { background: #fff0f0; } .expiring-row { background: #fffbf0; }
      </style></head><body>${reportEl.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  insuranceStats = computed(() => {
    const all = this.policies();
    return {
      total: all.length,
      active: all.filter(p => p.status === 'active').length,
      expiring: all.filter(p => p.status === 'expiring').length,
      expired: all.filter(p => p.status === 'expired').length
    };
  });

  chargingRows = computed((): ChargingRow[] => {
    const map = this.chargingEnrollmentsByPolicy();
    const rows: ChargingRow[] = [];

    for (const group of this.groupedByType()) {
      const policy = group.current;
      if (policy.status !== 'active' && policy.status !== 'expiring') continue;

      const meta = policy as any;
      const basis = meta.expenseBasis || 'whole_policy';
      const policyCost = this.getPolicyCost(policy);
      const deductible = Number(meta.perIncidentDeductible ?? 0);
      const frequency = meta.billingFrequency || '';
      const enrollments = map[String(policy.id)] || [];

      if (basis === 'per_driver') {
        const activeEnrollments = enrollments.filter((e: any) => e.status === 'active');
        if (!activeEnrollments.length) {
          rows.push({
            driverName: '—',
            policyType: policy.policyType,
            providerName: policy.providerName,
            policyNumber: policy.policyNumber || '',
            expenseBasis: basis,
            billingFrequency: frequency,
            policyCost,
            chargeAmount: 0,
            perIncidentDeductible: deductible,
            enrollmentStatus: 'none',
            policyStatus: policy.status
          });
          continue;
        }

        for (const enrollment of activeEnrollments) {
          rows.push({
            driverName: enrollment.driverName || 'Unknown Driver',
            policyType: policy.policyType,
            providerName: policy.providerName,
            policyNumber: policy.policyNumber || '',
            expenseBasis: basis,
            billingFrequency: enrollment.deductionFrequency || frequency,
            policyCost,
            chargeAmount: Number(enrollment.deductionAmount ?? 0) || policyCost,
            perIncidentDeductible: deductible,
            enrollmentStatus: enrollment.status || 'active',
            policyStatus: policy.status
          });
        }
        continue;
      }

      rows.push({
        driverName: 'Company (Whole Policy)',
        policyType: policy.policyType,
        providerName: policy.providerName,
        policyNumber: policy.policyNumber || '',
        expenseBasis: basis,
        billingFrequency: frequency,
        policyCost,
        chargeAmount: policyCost,
        perIncidentDeductible: deductible,
        enrollmentStatus: 'n/a',
        policyStatus: policy.status
      });
    }

    const term = this.chargingSearch.trim().toLowerCase();
    const filtered = term
      ? rows.filter((row) =>
          row.driverName.toLowerCase().includes(term) ||
          this.getPolicyTypeLabel(row.policyType).toLowerCase().includes(term) ||
          row.providerName.toLowerCase().includes(term) ||
          row.policyNumber.toLowerCase().includes(term)
        )
      : rows;

    return filtered.sort((a, b) => {
      const driverCmp = a.driverName.localeCompare(b.driverName);
      if (driverCmp !== 0) return driverCmp;
      return this.getPolicyTypeLabel(a.policyType).localeCompare(this.getPolicyTypeLabel(b.policyType));
    });
  });

  chargingStats = computed(() => {
    const rows = this.chargingRows();
    const driverNames = new Set(rows.map((r) => r.driverName).filter((n) => n !== '—' && !n.startsWith('Company')));
    return {
      chargeLines: rows.length,
      drivers: driverNames.size,
      totalCharges: rows.reduce((sum, row) => sum + (row.chargeAmount || 0), 0)
    };
  });

  enrollmentMatrixColumns = computed((): EnrollmentMatrixColumn[] => {
    return this.groupedByType()
      .map((group) => group.current)
      .filter((policy) => policy.status === 'active' || policy.status === 'expiring')
      .map((policy) => ({
        policyId: String(policy.id),
        policyType: policy.policyType,
        label: this.getPolicyTypeLabel(policy.policyType),
        expenseBasis: (policy as any).expenseBasis || 'whole_policy'
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  enrollmentMatrixRows = computed((): EnrollmentMatrixRow[] => {
    const columns = this.enrollmentMatrixColumns();
    if (!columns.length) return [];

    const enrollmentsByPolicy = this.chargingEnrollmentsByPolicy();
    const enrolledDriverIdsByPolicy = new Map<string, Set<number>>();

    for (const column of columns) {
      const enrolled = new Set<number>();
      for (const enrollment of enrollmentsByPolicy[column.policyId] || []) {
        if (enrollment.status !== 'active') continue;
        const driverId = Number(enrollment.driverId);
        if (driverId > 0) enrolled.add(driverId);
      }
      enrolledDriverIdsByPolicy.set(column.policyId, enrolled);
    }

    const term = this.matrixSearch.trim().toLowerCase();
    return this.chargingDrivers()
      .filter((driver) => {
        if (!term) return true;
        const name = String(driver.name || '').toLowerCase();
        const email = String(driver.email || '').toLowerCase();
        return name.includes(term) || email.includes(term);
      })
      .map((driver) => {
        const driverId = Number(driver.id);
        const cells: Record<string, 'enrolled' | 'not_enrolled'> = {};
        for (const column of columns) {
          if (column.expenseBasis === 'per_driver') {
            cells[column.policyId] = enrolledDriverIdsByPolicy.get(column.policyId)?.has(driverId)
              ? 'enrolled'
              : 'not_enrolled';
          } else {
            cells[column.policyId] = 'enrolled';
          }
        }
        return {
          driverId,
          driverName: driver.name || 'Unknown Driver',
          cells
        };
      })
      .sort((a, b) => a.driverName.localeCompare(b.driverName));
  });

  enrollmentMatrixStats = computed(() => {
    const rows = this.enrollmentMatrixRows();
    const perDriverColumns = this.enrollmentMatrixColumns().filter((c) => c.expenseBasis === 'per_driver');
    let enrolled = 0;
    let missing = 0;
    for (const row of rows) {
      for (const column of perDriverColumns) {
        if (row.cells[column.policyId] === 'enrolled') enrolled++;
        else missing++;
      }
    }
    return { drivers: rows.length, policies: perDriverColumns.length, enrolled, missing };
  });

  setPageTab(tab: PageTab): void {
    this.pageTab.set(tab);
    if (tab === 'charging') {
      this.loadChargingData();
    }
  }

  loadChargingData(): void {
    if (this.loadingPolicies()) return;
    this.loadingCharging.set(true);

    const chargeablePolicies = this.groupedByType()
      .map((group) => group.current)
      .filter((policy) => policy.status === 'active' || policy.status === 'expiring');

    const enrollmentPromise = !chargeablePolicies.length
      ? Promise.resolve([] as { policyId: string; rows: any[] }[])
      : Promise.all(
          chargeablePolicies.map((policy) =>
            this.api.getInsuranceEnrollments(policy.id).toPromise()
              .then((res: any) => ({ policyId: String(policy.id), rows: res?.data || [] }))
              .catch(() => ({ policyId: String(policy.id), rows: [] }))
          )
        );

    const driversPromise = this.api.getDrivers({ status: 'active', limit: 1000 }).toPromise()
      .then((res: any) => res?.data || [])
      .catch(() => [] as any[]);

    Promise.all([enrollmentPromise, driversPromise]).then(([results, drivers]) => {
      const map: Record<string, any[]> = {};
      for (const result of results) map[result.policyId] = result.rows;
      this.chargingEnrollmentsByPolicy.set(map);
      this.chargingDrivers.set(drivers);
      this.loadingCharging.set(false);
    });
  }

  ngOnInit(): void {
    this.loadPolicies();
    this.loadPayments();
  }

  // ========== INSURANCE ==========

  async loadPolicies() {
    this.loadingPolicies.set(true);
    this.api.getInsurancePolicies().subscribe({
      next: (res: any) => {
        this.policies.set(res?.data || []);
        this.loadingPolicies.set(false);
        if (this.pageTab() === 'charging') this.loadChargingData();
      },
      error: () => {
        this.policies.set([]);
        this.loadingPolicies.set(false);
        if (this.pageTab() === 'charging') this.loadChargingData();
      }
    });
  }

  getPolicyTypeLabel(type: string): string {
    return this.policyTypes.find(t => t.value === type)?.label || type;
  }

  openAddPolicy(): void {
    this.editingPolicy.set(null);
    this.policyForm = {
      policyType: 'general_liability',
      providerName: '',
      policyNumber: '',
      coverageAmount: 0,
      premiumCost: 0,
      expenseBasis: 'whole_policy',
      perIncidentDeductible: 0,
      billingFrequency: 'monthly',
      effectiveDate: '',
      expiryDate: '',
      notes: '',
      remind3Months: false,
      remind30Days: true,
      remind15Days: true,
      remindDayOf: true,
      remindDailyPastDue: true
    };
    this.policyFile = null;
    this.showPolicyModal.set(true);
  }

  editPolicy(policy: InsuranceRow): void {
    this.editingPolicy.set(policy);
    const p = policy as any;
    this.policyForm = {
      policyType: policy.policyType,
      providerName: policy.providerName,
      policyNumber: policy.policyNumber || '',
      coverageAmount: policy.coverageAmount || 0,
      premiumCost: p.premiumCost || 0,
      expenseBasis: p.expenseBasis || 'whole_policy',
      perIncidentDeductible: p.perIncidentDeductible || 0,
      billingFrequency: p.billingFrequency || 'monthly',
      effectiveDate: policy.effectiveDate ? new Date(policy.effectiveDate).toISOString().split('T')[0] : '',
      expiryDate: policy.expiryDate ? new Date(policy.expiryDate).toISOString().split('T')[0] : '',
      notes: policy.notes || '',
      remind3Months: p.remind3Months ?? false,
      remind30Days: p.remind30Days ?? true,
      remind15Days: p.remind15Days ?? true,
      remindDayOf: p.remindDayOf ?? true,
      remindDailyPastDue: p.remindDailyPastDue ?? true
    };
    this.policyFile = null;
    this.showPolicyModal.set(true);
  }

  closePolicyModal(): void {
    this.showPolicyModal.set(false);
    this.editingPolicy.set(null);
    this.policyFile = null;
  }

  onPolicyFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.policyFile = input.files[0];
    }
  }

  savePolicy(): void {
    if (!this.policyForm.providerName.trim()) {
      this.toast.error('Provider name is required', 'Validation');
      return;
    }
    this.savingPolicy.set(true);

    const fd = new FormData();
    fd.append('policyType', this.policyForm.policyType);
    fd.append('providerName', this.policyForm.providerName);
    fd.append('policyNumber', this.policyForm.policyNumber);
    if (this.policyForm.coverageAmount) fd.append('coverageAmount', this.policyForm.coverageAmount.toString());
    fd.append('premiumCost', String(this.policyForm.premiumCost ?? 0));
    fd.append('expenseBasis', this.policyForm.expenseBasis || 'whole_policy');
    fd.append('perIncidentDeductible', String(this.policyForm.perIncidentDeductible ?? 0));
    fd.append('billingFrequency', this.policyForm.billingFrequency || 'monthly');
    if (this.policyForm.effectiveDate) fd.append('effectiveDate', this.policyForm.effectiveDate);
    if (this.policyForm.expiryDate) fd.append('expiryDate', this.policyForm.expiryDate);
    fd.append('notes', this.policyForm.notes);
    fd.append('remind3Months', this.policyForm.remind3Months.toString());
    fd.append('remind30Days', this.policyForm.remind30Days.toString());
    fd.append('remind15Days', this.policyForm.remind15Days.toString());
    fd.append('remindDayOf', this.policyForm.remindDayOf.toString());
    fd.append('remindDailyPastDue', this.policyForm.remindDailyPastDue.toString());
    if (this.policyFile) fd.append('file', this.policyFile);

    const obs = this.editingPolicy()
      ? this.api.updateInsurancePolicy(this.editingPolicy()!.id, fd)
      : this.api.createInsurancePolicy(fd);

    obs.subscribe({
      next: () => {
        this.toast.success(this.editingPolicy() ? 'Policy updated' : 'Policy created', 'Success');
        this.savingPolicy.set(false);
        this.closePolicyModal();
        this.loadPolicies();
        this.refreshChargingIfNeeded();
      },
      error: (err) => {
        this.toast.error(err?.error?.error || 'Failed to save policy', 'Error');
        this.savingPolicy.set(false);
      }
    });
  }

  async deletePolicy(policy: InsuranceRow) {
    const ok = await this.confirm.show({ message: `Delete ${this.getPolicyTypeLabel(policy.policyType)} policy from ${policy.providerName}?`, type: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    this.api.deleteInsurancePolicy(policy.id).subscribe({
      next: () => { this.toast.success('Policy deleted', 'Deleted'); this.loadPolicies(); },
      error: () => this.toast.error('Failed to delete policy', 'Error')
    });
  }

  previewPolicyDoc(policy: InsuranceRow): void {
    this.viewPolicyDoc(policy);
  }

  viewPolicyDoc(policy: InsuranceRow): void {
    this.api.viewInsurancePolicyDoc(policy.id).subscribe({
      next: (blob) => { window.open(URL.createObjectURL(blob), '_blank'); },
      error: () => this.toast.error('Failed to load document', 'Error')
    });
  }

  downloadPolicyDoc(policy: InsuranceRow): void {
    this.api.downloadInsurancePolicyDoc(policy.id).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = policy.fileName || 'document';
        a.click();
      },
      error: () => this.toast.error('Failed to download document', 'Error')
    });
  }

  getExpenseBasisLabel(basis: string): string {
    return this.expenseBasisOptions.find(o => o.value === basis)?.label || basis || '—';
  }

  getBillingFrequencyLabel(frequency: string): string {
    return this.billingFrequencyOptions.find(o => o.value === frequency)?.label || frequency || '—';
  }

  getPolicyCost(policy: InsuranceRow | any): number {
    return Number(policy?.premiumCost ?? 0);
  }

  formatCurrency(val: number, fractionDigits = 0): string {
    if (!val && val !== 0) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }).format(val);
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ========== BILLING & COST SETUP ==========

  showBillingModal = signal(false);
  billingPolicy = signal<InsuranceRow | null>(null);
  savingBilling = signal(false);
  billingForm = {
    premiumCost: 0,
    expenseBasis: 'whole_policy',
    perIncidentDeductible: 0,
    billingFrequency: 'monthly',
    paymentMethod: '',
    dueDayOfMonth: 1,
    nextPaymentDate: '',
    autoRenew: 'yes',
    billingNotes: ''
  };

  openBillingSetup(policy: InsuranceRow): void {
    this.billingPolicy.set(policy);
    this.billingForm = {
      premiumCost: (policy as any).premiumCost || 0,
      expenseBasis: (policy as any).expenseBasis || 'whole_policy',
      perIncidentDeductible: (policy as any).perIncidentDeductible || 0,
      billingFrequency: (policy as any).billingFrequency || 'monthly',
      paymentMethod: (policy as any).paymentMethod || '',
      dueDayOfMonth: (policy as any).dueDayOfMonth || 1,
      nextPaymentDate: (policy as any).nextPaymentDate ? new Date((policy as any).nextPaymentDate).toISOString().split('T')[0] : '',
      autoRenew: (policy as any).autoRenew || 'yes',
      billingNotes: (policy as any).billingNotes || ''
    };
    this.showBillingModal.set(true);
  }

  closeBillingModal(): void {
    this.showBillingModal.set(false);
    this.billingPolicy.set(null);
  }

  saveBilling(): void {
    this.savingBilling.set(true);
    const policyId = this.billingPolicy()!.id;

    this.api.updateInsurancePolicyBilling(policyId, {
      premiumCost: this.billingForm.premiumCost || null,
      expenseBasis: this.billingForm.expenseBasis,
      perIncidentDeductible: this.billingForm.perIncidentDeductible || null,
      billingFrequency: this.billingForm.billingFrequency,
      paymentMethod: this.billingForm.paymentMethod,
      dueDayOfMonth: this.billingForm.dueDayOfMonth || null,
      nextPaymentDate: this.billingForm.nextPaymentDate || null,
      autoRenew: this.billingForm.autoRenew,
      billingNotes: this.billingForm.billingNotes
    }).subscribe({
      next: () => {
        this.toast.success('Billing settings saved', 'Success');
        this.savingBilling.set(false);
        this.closeBillingModal();
        this.loadPolicies();
        this.refreshChargingIfNeeded();
      },
      error: (err) => {
        this.toast.error(err?.error?.error || 'Failed to save billing', 'Error');
        this.savingBilling.set(false);
      }
    });
  }

  // ========== POLICY PROFILE / ENROLLMENTS ==========

  showPolicyProfile = signal(false);
  profilePolicy = signal<InsuranceRow | null>(null);
  enrollments = signal<any[]>([]);
  availableDrivers = signal<any[]>([]);
  showEnrollmentModal = signal(false);
  editingEnrollment = signal<any>(null);
  savingEnrollment = signal(false);
  enrollmentForm = {
    driverId: '',
    coverageLevel: 'standard',
    deductionAmount: 0,
    deductionFrequency: 'monthly',
    paymentTerms: '',
    beneficiary: '',
    effectiveDate: '',
    status: 'active'
  };

  unenrolledDrivers = computed(() => {
    const enrolledIds = new Set(this.enrollments().map((e: any) => e.driverId?.toString()));
    return this.availableDrivers().filter((d: any) => !enrolledIds.has(d.id?.toString()));
  });

  openPolicyProfile(policy: InsuranceRow): void {
    this.profilePolicy.set(policy);
    this.showPolicyProfile.set(true);
    this.loadEnrollments(policy.id);
    this.loadAvailableDrivers();
  }

  closePolicyProfile(): void {
    this.showPolicyProfile.set(false);
    this.profilePolicy.set(null);
    this.enrollments.set([]);
  }

  loadEnrollments(policyId: string): void {
    this.api.getInsuranceEnrollments(policyId).subscribe({
      next: (res: any) => this.enrollments.set(res?.data || []),
      error: () => this.enrollments.set([])
    });
  }

  loadAvailableDrivers(): void {
    this.api.getDrivers({ limit: 500 }).subscribe({
      next: (res: any) => this.availableDrivers.set(res?.data || []),
      error: () => this.availableDrivers.set([])
    });
  }

  openEnrollmentModal(): void {
    this.editingEnrollment.set(null);
    this.enrollmentForm = {
      driverId: '', coverageLevel: 'standard', deductionAmount: 0,
      deductionFrequency: 'monthly', paymentTerms: '', beneficiary: '',
      effectiveDate: '', status: 'active'
    };
    this.showEnrollmentModal.set(true);
  }

  editEnrollment(enrollment: any): void {
    this.editingEnrollment.set(enrollment);
    this.enrollmentForm = {
      driverId: enrollment.driverId?.toString() || '',
      coverageLevel: enrollment.coverageLevel || 'standard',
      deductionAmount: enrollment.deductionAmount || 0,
      deductionFrequency: enrollment.deductionFrequency || 'monthly',
      paymentTerms: enrollment.paymentTerms || '',
      beneficiary: enrollment.beneficiary || '',
      effectiveDate: enrollment.effectiveDate ? new Date(enrollment.effectiveDate).toISOString().split('T')[0] : '',
      status: enrollment.status || 'active'
    };
    this.showEnrollmentModal.set(true);
  }

  closeEnrollmentModal(): void {
    this.showEnrollmentModal.set(false);
    this.editingEnrollment.set(null);
  }

  private refreshChargingIfNeeded(): void {
    if (this.pageTab() === 'charging') this.loadChargingData();
  }

  saveEnrollment(): void {
    if (!this.editingEnrollment() && !this.enrollmentForm.driverId) {
      this.toast.error('Please select a driver', 'Validation');
      return;
    }
    this.savingEnrollment.set(true);
    const policyId = this.profilePolicy()!.id;
    const payload: any = {
      ...this.enrollmentForm,
      driverId: +this.enrollmentForm.driverId,
      effectiveDate: this.enrollmentForm.effectiveDate || null
    };

    const obs = this.editingEnrollment()
      ? this.api.updateInsuranceEnrollment(policyId, this.editingEnrollment().id, payload)
      : this.api.createInsuranceEnrollment(policyId, payload);

    obs.subscribe({
      next: () => {
        this.toast.success(this.editingEnrollment() ? 'Enrollment updated' : 'Driver enrolled', 'Success');
        this.savingEnrollment.set(false);
        this.closeEnrollmentModal();
        this.loadEnrollments(policyId);
        this.refreshChargingIfNeeded();
      },
      error: (err) => {
        this.toast.error(err?.error?.error || 'Failed to save enrollment', 'Error');
        this.savingEnrollment.set(false);
      }
    });
  }

  quickEnroll(driver: any): void {
    const policyId = this.profilePolicy()!.id;
    this.api.createInsuranceEnrollment(policyId, {
      driverId: driver.id,
      coverageLevel: 'standard',
      deductionFrequency: 'monthly',
      status: 'active'
    }).subscribe({
      next: () => {
        this.toast.success(`${driver.name} enrolled`, 'Enrolled');
        this.loadEnrollments(policyId);
        this.refreshChargingIfNeeded();
      },
      error: (err) => this.toast.error(err?.error?.error || 'Failed to enroll driver', 'Error')
    });
  }

  async deleteEnrollment(enrollment: any) {
    const ok = await this.confirm.show({ message: `Remove ${enrollment.driverName} from this policy?`, type: 'danger', confirmText: 'Remove' });
    if (!ok) return;
    this.api.deleteInsuranceEnrollment(this.profilePolicy()!.id, enrollment.id).subscribe({
      next: () => {
        this.toast.success('Driver removed from policy', 'Removed');
        this.loadEnrollments(this.profilePolicy()!.id);
        this.refreshChargingIfNeeded();
      },
      error: () => this.toast.error('Failed to remove enrollment', 'Error')
    });
  }

  // ========== FINANCIAL ==========

  loadPayments(): void {
    this.loadingPayments.set(true);
    // Load enabled methods from API (stored as DriverPayment records with no driver)
    this.api.getDriverPayments().subscribe({
      next: (res: any) => {
        const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        const methods = rows.map((p: any) => p.paymentMethod);
        this.enabledMethods.set(new Set(methods));
        this.loadingPayments.set(false);
      },
      error: () => { this.enabledMethods.set(new Set()); this.loadingPayments.set(false); }
    });
  }

  isMethodEnabled(method: string): boolean {
    return this.enabledMethods().has(method);
  }

  toggleMethod(method: string): void {
    if (this.isMethodEnabled(method)) {
      // Disable -- delete the org-level record
      this.api.getDriverPayments().subscribe({
        next: (res: any) => {
          const record = (res?.data || []).find((p: any) => p.paymentMethod === method && !p.driverId);
          if (record) {
            this.api.deleteDriverPayment(record.id).subscribe({
              next: () => {
                this.enabledMethods.update(s => { const n = new Set(s); n.delete(method); return n; });
                this.toast.success(`${this.getMethodLabel(method)} disabled`, 'Disabled');
              }
            });
          } else {
            this.enabledMethods.update(s => { const n = new Set(s); n.delete(method); return n; });
          }
        }
      });
    } else {
      // Enable -- create an org-level record
      this.api.createDriverPayment({ paymentMethod: method, status: 'active' }).subscribe({
        next: () => {
          this.enabledMethods.update(s => { const n = new Set(s); n.add(method); return n; });
          this.toast.success(`${this.getMethodLabel(method)} enabled`, 'Enabled');
        },
        error: (err) => this.toast.error(err?.error?.error || 'Failed to enable method', 'Error')
      });
    }
  }

  getMethodLabel(method: string): string {
    return this.paymentMethods.find(m => m.value === method)?.label || method;
  }

  getMethodGroup(method: string): string {
    return this.paymentMethods.find(m => m.value === method)?.group || 'bank';
  }
}
