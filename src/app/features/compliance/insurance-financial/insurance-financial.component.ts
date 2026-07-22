import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventTrackingService } from '../../../core/services/event-tracking.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

type PageTab = 'insurance' | 'charging' | 'financial';
type InsuranceSubTab = 'current' | 'elapsed';
type ChargingSubTab = 'summary' | 'breakdown';

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
  sortOrder: number;
}

interface EnrollmentMatrixColumn {
  policyId: string;
  policyType: string;
  label: string;
  expenseBasis: string;
  expenseType: 'driver_expense' | 'company_expense';
}

interface EnrollmentMatrixRow {
  driverId: number;
  driverName: string;
  cells: Record<string, MatrixCellCharge | null>;
}

interface MatrixCellCharge {
  amount: number;
  billingFrequency: string;
}

interface ChargingFleetSummary {
  /** Unique trucks (team drivers sharing a truck count once). */
  activeDrivers: number;
  /** Individual active fleet drivers before truck deduplication. */
  activeDriverHeadcount: number;
  driverChargesAnnual: number;
  companyCostAnnual: number;
  totalFleetCostAnnual: number;
  driverChargesMonthly: number;
  companyCostMonthly: number;
  totalFleetCostMonthly: number;
  driverChargesWeekly: number;
  companyCostWeekly: number;
  totalFleetCostWeekly: number;
  driverChargesDaily: number;
  companyCostDaily: number;
  totalFleetCostDaily: number;
}

interface FleetCalculationLine {
  policyLabel: string;
  providerName: string;
  category: 'driver' | 'company';
  formula: string;
  annualAmount: number;
  periodAmount: number;
}

interface FleetCostBreakdownData {
  /** Unique trucks used as the billing multiplier for per-truck policies. */
  activeDriverCount: number;
  activeDriverHeadcount: number;
  lines: FleetCalculationLine[];
  driverChargesAnnual: number;
  companyCostAnnual: number;
}

interface StoredChargingSnapshot {
  periodType: string;
  periodKey: string;
  activeTruckCount: number;
  activeDriverHeadcount: number;
  driverChargesAnnual: number;
  companyCostAnnual: number;
  driverChargesPeriod: number;
  companyCostPeriod: number;
  totalPeriod: number;
  summaryLines: FleetCalculationLine[];
  matrix?: {
    columns: EnrollmentMatrixColumn[];
    rows: EnrollmentMatrixRow[];
    totals: {
      columnTotals: Record<string, number>;
      rowTotals: Record<number, number>;
      grandTotal: number;
    };
  };
  reportMeta?: Record<string, unknown>;
  computedAt?: string;
  updatedAt?: string;
}

interface SummaryPeriodOption {
  value: string;
  label: string;
}

type MatrixPeriodTab = 'daily' | 'weekly' | 'monthly' | 'yearly';

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

/** Policy types billed at the company level regardless of expenseBasis field. */
const COMPANY_EXPENSE_POLICY_TYPES = new Set([
  'cargo',
  'trailer_interchange',
]);

interface PolicyBundleRule {
  parentType: string;
  childTypes: Set<string>;
  label: string;
}

const POLICY_BUNDLE_RULES: PolicyBundleRule[] = [
  {
    parentType: 'cargo',
    childTypes: new Set(['trailer_interchange']),
    label: 'Included in Cargo'
  },
  {
    parentType: 'auto_liability',
    childTypes: new Set(['general_liability']),
    label: 'Included in Auto Liability'
  },
  {
    parentType: 'physical_damage',
    childTypes: new Set(['non_trucking']),
    label: 'Included in Physical Damage'
  }
];

interface PolicyTypeGroup {
  type: string;
  current: InsuranceRow;
  history: InsuranceRow[];
  includedCoverages: InsuranceRow[];
}

interface AccountingVendorInvoice {
  id: string;
  vendorInvoiceNumber?: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  monthApplicable?: string;
  amount: number;
  category?: string;
  status?: string;
  fileName?: string;
  fileUrl?: string;
}

type FleetDriverOverrideState = 'included' | 'excluded';

interface FleetDriverSettingsRow {
  driverId: number;
  driverName: string;
  truckNumber: string;
  status: string;
  statusLabel: string;
  hireDate: string;
  terminationDate: string;
  autoEligible: boolean;
  included: boolean;
  hasOverride: boolean;
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
  private auth = inject(AuthService);
  private accountingHttp = new HttpClient(inject(HttpBackend));
  private readonly accountingTokenKey = 'ta_accounting_api_token';

  pageTab = signal<PageTab>('insurance');
  insuranceSubTab = signal<InsuranceSubTab>('current');
  chargingSubTab = signal<ChargingSubTab>('summary');

  // Charging table state
  chargingEnrollmentsByPolicy = signal<Record<string, any[]>>({});
  chargingDrivers = signal<any[]>([]);
  loadingCharging = signal(false);
  chargingSearch = '';
  matrixSearch = '';
  matrixDriverTab = signal<'active' | 'inactive'>('active');
  summaryPeriodTab = signal<MatrixPeriodTab>('monthly');
  summarySpecificPeriod = signal<string>('');

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
  showChargingReport = signal(false);
  chargingReportDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  showAccountingInvoiceModal = signal(false);
  loadingAccountingInvoices = signal(false);
  accountingInvoices = signal<AccountingVendorInvoice[]>([]);
  showFleetDriverSettingsModal = signal(false);
  fleetDriverSettingsSearch = signal('');
  loadingFleetDriverOverrides = signal(false);
  fleetDriverOverrides = signal<Record<string, Record<string, FleetDriverOverrideState>>>({});
  private readonly fleetDriverOverridesStorageKey = 'insurance_fleet_driver_overrides_v1';
  private readonly fleetDriverOverridesMigratedKey = 'insurance_fleet_driver_overrides_migrated_v1';
  persistedChargingSnapshot = signal<StoredChargingSnapshot | null>(null);
  loadingChargingSnapshot = signal(false);
  private chargingSnapshotSaveTimer: ReturnType<typeof setTimeout> | null = null;
  expandedTypes = signal<Set<string>>(new Set());

  private readonly chargingSnapshotSaveEffect = effect(() => {
    if (this.pageTab() !== 'charging') return;
    if (this.loadingCharging() || this.loadingFleetDriverOverrides() || this.loadingPolicies()) return;
    this.summaryPeriodTab();
    this.summarySpecificPeriod();
    this.fleetCostBreakdownData();
    this.enrollmentMatrixRows();
    this.scheduleChargingSnapshotSave();
  });

  toggleTypeExpand(type: string): void {
    this.expandedTypes.update(s => {
      const n = new Set(s);
      n.has(type) ? n.delete(type) : n.add(type);
      return n;
    });
  }

  /** Groups policies by type, picks the most current as the primary row. */
  groupedByType = computed((): PolicyTypeGroup[] => {
    const all = this.policies();
    const bundledChildIds = new Set(
      all.filter((p) => this.isBundledChildPolicy(p, all)).map((p) => String(p.id))
    );

    const map = new Map<string, InsuranceRow[]>();
    for (const p of all) {
      if (bundledChildIds.has(String(p.id))) continue;
      const arr = map.get(p.policyType) ?? [];
      arr.push(p);
      map.set(p.policyType, arr);
    }

    const statusOrder: Record<string, number> = { active: 0, expiring: 1, expired: 2 };

    return Array.from(map.entries()).map(([type, rows]) => {
      const sorted = [...rows].sort((a, b) => {
        const sA = statusOrder[a.status] ?? 3;
        const sB = statusOrder[b.status] ?? 3;
        if (sA !== sB) return sA - sB;
        return new Date(b.effectiveDate || 0).getTime() - new Date(a.effectiveDate || 0).getTime();
      });
      const current = sorted[0];
      const includedCoverages = this.getBundledChildCoverages(type, current, all);
      return { type, current, history: sorted.slice(1), includedCoverages };
    }).sort((a, b) => {
      const aStatus = statusOrder[a.current.status] ?? 3;
      const bStatus = statusOrder[b.current.status] ?? 3;
      if (aStatus !== bStatus) return aStatus - bStatus;
      return (a.current.policyType || '').localeCompare(b.current.policyType || '');
    });
  });

  currentPolicyGroups = computed((): PolicyTypeGroup[] =>
    this.groupedByType()
      .filter((group) => group.current.status === 'active' || group.current.status === 'expiring')
      .map((group) => ({
        ...group,
        history: group.history.filter((p) => p.status === 'active' || p.status === 'expiring')
      }))
  );

  elapsedPolicies = computed(() =>
    this.policies()
      .filter((p) => p.status === 'expired')
      .sort((a, b) =>
        new Date(b.expiryDate || b.effectiveDate || 0).getTime() -
        new Date(a.expiryDate || a.effectiveDate || 0).getTime()
      )
  );

  setInsuranceSubTab(tab: InsuranceSubTab): void {
    this.insuranceSubTab.set(tab);
    this.expandedTypes.set(new Set());
  }

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

  /** Active + expiring policies only — used by the insurance report. */
  reportPolicies = computed(() =>
    this.policies().filter((p) => p.status === 'active' || p.status === 'expiring')
  );

  reportStats = computed(() => {
    const all = this.reportPolicies();
    return {
      total: all.length,
      active: all.filter((p) => p.status === 'active').length,
      expiring: all.filter((p) => p.status === 'expiring').length,
      totalCoverage: all.reduce((sum, p) => sum + (p.coverageAmount || 0), 0)
    };
  });

  reportCoverageSummary = computed(() => {
    const byType = new Map<string, { type: string; count: number; totalCoverage: number; hasExpired: boolean; hasExpiring: boolean }>();
    for (const p of this.reportPolicies()) {
      const existing = byType.get(p.policyType) || { type: p.policyType, count: 0, totalCoverage: 0, hasExpired: false, hasExpiring: false };
      existing.count++;
      existing.totalCoverage += p.coverageAmount || 0;
      if (p.status === 'expiring') existing.hasExpiring = true;
      byType.set(p.policyType, existing);
    }
    return Array.from(byType.values());
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
    for (const p of this.reportPolicies()) {
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

  openChargingReport(): void {
    this.chargingReportDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    this.showChargingReport.set(true);
  }

  closeChargingReport(): void {
    this.showChargingReport.set(false);
  }

  getAccountingInvoiceButtonTitle(): string {
    return `View Taylor Accounting insurance invoices for month applicable ${this.getSummarySpecificPeriodLabel()}`;
  }

  getAccountingInvoiceModalTitle(): string {
    return `Taylor Accounting Insurance Invoices — Month Applicable ${this.getSummarySpecificPeriodLabel()}`;
  }

  formatMonthApplicable(value?: string | null): string {
    if (!value) return '—';
    const normalized = String(value).trim().split('T')[0].substring(0, 7);
    const [year, month] = normalized.split('-');
    const monthIndex = Number(month) - 1;
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (!year || monthIndex < 0 || monthIndex > 11) return normalized || '—';
    return `${monthNames[monthIndex]} ${year}`;
  }

  async openAccountingInvoicesModal(): Promise<void> {
    this.showAccountingInvoiceModal.set(true);
    await this.loadAccountingInvoicesForPeriod();
  }

  closeAccountingInvoicesModal(): void {
    this.showAccountingInvoiceModal.set(false);
  }

  openTaylorAccountingInsuranceInvoices(): void {
    const base = String(environment.taylorAccountingUrl || 'https://taylor-accounting.net').replace(/\/$/, '');
    window.open(`${base}/finance/vendor-invoicing`, '_blank', 'noopener,noreferrer');
  }

  async viewAccountingInvoiceFile(invoice: AccountingVendorInvoice): Promise<void> {
    if (!invoice.fileUrl) {
      this.toast.info('This invoice has no attached file in Taylor Accounting.', 'No File');
      return;
    }

    try {
      const token = await this.getAccountingApiToken();
      if (!token) {
        this.toast.error('Unable to authenticate with Taylor Accounting.', 'Access Denied');
        return;
      }

      const url = this.resolveAccountingInvoiceFileUrl(invoice.fileUrl);
      const blob = await firstValueFrom(
        this.accountingHttp.get(url, {
          responseType: 'blob',
          headers: { Authorization: `Bearer ${token}` }
        })
      );
      window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    } catch {
      this.toast.error('Failed to open invoice file from Taylor Accounting.', 'Error');
    }
  }

  private async loadAccountingInvoicesForPeriod(): Promise<void> {
    this.loadingAccountingInvoices.set(true);
    this.accountingInvoices.set([]);

    const cacheKey = this.getAccountingInvoiceCacheKey();
    try {
      const cached: any = await firstValueFrom(
        this.api.getInsuranceAccountingInvoiceCache(cacheKey)
      );
      const cachedRows = Array.isArray(cached?.data) ? cached.data as AccountingVendorInvoice[] : [];
      if (cachedRows.length) {
        this.accountingInvoices.set(cachedRows);
        this.loadingAccountingInvoices.set(false);
        return;
      }
    } catch {
      // Fall through to live Taylor Accounting fetch.
    }

    try {
      const token = await this.getAccountingApiToken();
      if (!token) {
        this.toast.error('Unable to authenticate with Taylor Accounting.', 'Access Denied');
        return;
      }

      const apiBase = this.getAccountingApiBaseUrl();
      const response = await firstValueFrom(
        this.accountingHttp.get<any>(`${apiBase}/api/v1/vendorinvoices`, {
          params: {
            category: 'insurance',
            includeAll: 'true',
            pageSize: '500'
          },
          headers: { Authorization: `Bearer ${token}` }
        })
      );

      const rows = Array.isArray(response?.data) ? response.data : [];
      const filtered = rows
        .filter((invoice: AccountingVendorInvoice) => this.invoiceMatchesSelectedPeriod(invoice))
        .sort((a: AccountingVendorInvoice, b: AccountingVendorInvoice) =>
          String(b.monthApplicable || b.invoiceDate || '').localeCompare(String(a.monthApplicable || a.invoiceDate || ''))
        );

      this.accountingInvoices.set(filtered);

      void firstValueFrom(this.api.upsertInsuranceAccountingInvoiceCache({
        monthApplicable: cacheKey,
        invoices: filtered,
        fetchedAt: new Date().toISOString()
      })).catch(() => undefined);

      if (!filtered.length) {
        this.toast.info(`No insurance vendor invoices with month applicable ${this.getSummarySpecificPeriodLabel()} were found.`, 'No Invoices');
      }
    } catch {
      this.toast.error('Failed to load insurance invoices from Taylor Accounting.', 'Error');
    } finally {
      this.loadingAccountingInvoices.set(false);
    }
  }

  private invoiceMatchesSelectedPeriod(invoice: AccountingVendorInvoice): boolean {
    const monthApplicable = this.normalizeMonthApplicable(invoice.monthApplicable);
    if (monthApplicable) {
      return this.monthApplicableMatchesSelectedPeriod(monthApplicable);
    }

    const { start, end } = this.getSummaryPeriodDateRange();
    const date = this.parseSummaryDateKey(String(invoice.invoiceDate || '').trim().split('T')[0]);
    if (!date) return false;
    return date >= start && date <= end;
  }

  private normalizeMonthApplicable(value: unknown): string {
    const raw = String(value ?? '').trim().split('T')[0];
    if (!raw) return '';
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.substring(0, 7);
    return '';
  }

  private monthApplicableMatchesSelectedPeriod(monthApplicable: string): boolean {
    const tab = this.summaryPeriodTab();

    if (tab === 'monthly') {
      const selected = String(this.summarySpecificPeriod() || '').trim().substring(0, 7);
      return !!selected && monthApplicable === selected;
    }

    if (tab === 'yearly') {
      const year = String(this.summarySpecificPeriod() || '').trim();
      return !!year && monthApplicable.startsWith(`${year}-`);
    }

    const applicableDate = this.parseSummaryDateKey(`${monthApplicable}-01`);
    if (!applicableDate) return false;

    const { start, end } = this.getSummaryPeriodDateRange();
    const monthStart = new Date(applicableDate.getFullYear(), applicableDate.getMonth(), 1);
    const monthEnd = new Date(applicableDate.getFullYear(), applicableDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return monthStart <= end && monthEnd >= start;
  }

  private getAccountingApiBaseUrl(): string {
    return String(
      environment.taylorAccountingApiUrl || 'https://ttac-gateway-production.up.railway.app'
    ).replace(/\/$/, '');
  }

  private resolveAccountingInvoiceFileUrl(fileUrl: string): string {
    if (fileUrl.startsWith('http') || fileUrl.startsWith('blob:')) return fileUrl;
    return `${this.getAccountingApiBaseUrl()}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
  }

  private async getAccountingApiToken(): Promise<string | null> {
    const cached = sessionStorage.getItem(this.accountingTokenKey);
    if (cached) return cached;

    const accessToken = this.auth.getToken();
    if (!accessToken) return null;

    try {
      const response = await firstValueFrom(
        this.accountingHttp.post<any>(`${this.getAccountingApiBaseUrl()}/api/v1/auth/sso-login`, {
          token: accessToken
        })
      );
      const token = String(response?.token || '').trim();
      if (!token) return null;
      sessionStorage.setItem(this.accountingTokenKey, token);
      return token;
    } catch {
      sessionStorage.removeItem(this.accountingTokenKey);
      return null;
    }
  }

  getChargingReportPeriodLabel(): string {
    const period = this.getSummaryPeriodColumnLabel();
    const specific = this.getSummarySpecificPeriodLabel();
    return `Period: ${specific} (${period.replace('Per ', '')})`;
  }

  getChargingReportTotalLabel(): string {
    return `Total Charges (${this.getSummaryPeriodColumnLabel()})`;
  }

  getChargingReportCostTypeLabel(category: FleetCalculationLine['category']): string {
    return category === 'company' ? 'Company Cost' : 'Driver Charges';
  }

  getChargingEnrollmentStatusLabel(status: string): string {
    switch (status) {
      case 'none': return 'Not Enrolled';
      case 'company': return 'Company Expense';
      case 'n/a': return 'Whole Policy';
      case 'active': return 'Enrolled';
      default: return status || '—';
    }
  }

  exportChargingReportCSV(): void {
    const periodLabel = this.getSummaryPeriodColumnLabel();
    const rows: string[] = [];
    rows.push(`Insurance Charging Report - ${this.getChargingReportPeriodLabel()}`);
    rows.push(`Generated,${this.chargingReportDate}`);
    rows.push('');
    rows.push('Summary Metric,Value');
    rows.push(`Charge Lines,${this.chargingStats().chargeLines}`);
    rows.push(`${this.getChargingFleetCountLabel()},${this.chargingStats().drivers}`);
    rows.push(`${this.getChargingReportTotalLabel()},${this.chargingStats().totalCharges}`);
    rows.push('');
    rows.push(`Policy,Provider,Cost Type,Calculation,${periodLabel}`);

    for (const line of this.chargingFleetCalculationLines()) {
      rows.push([
        `"${line.policyLabel}"`,
        `"${line.providerName}"`,
        `"${this.getChargingReportCostTypeLabel(line.category)}"`,
        `"${line.formula.replace(/"/g, '""')}"`,
        line.periodAmount
      ].join(','));
    }

    const display = this.chargingFleetSummaryDisplay();
    rows.push('');
    rows.push(`Driver Charges Subtotal,,,Sum of per-driver policy charges,${display.driverCharges}`);
    rows.push(`Company Cost Subtotal,,,Sum of whole-policy company charges,${display.companyCost}`);
    rows.push(`Total Fleet Cost,,,"${this.formatCurrency(display.driverCharges, 2)} driver charges + ${this.formatCurrency(display.companyCost, 2)} company cost",${display.totalFleetCost}`);

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `insurance-charging-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.toast.success('CSV exported', 'Download');
  }

  printChargingReport(): void {
    const reportEl = document.getElementById('charging-report');
    if (!reportEl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Insurance Charging Report</title>
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
    const activeDrivers = this.chargingDrivers().filter((driver) =>
      this.isMatrixActiveDriver(this.normalizeDriverStatus(driver.status))
    );

    let sortOrder = 0;

    for (const group of this.groupedByType()) {
      const policy = group.current;
      if (policy.status !== 'active' && policy.status !== 'expiring') continue;

      sortOrder += 100;
      this.appendChargingRowsForPolicy(policy, rows, map, activeDrivers, sortOrder);

      for (const included of group.includedCoverages) {
        if (included.status !== 'active' && included.status !== 'expiring') continue;
        if (!this.shouldShowBundledChildInCharging(included)) continue;
        sortOrder += 1;
        this.appendChargingRowsForPolicy(included, rows, map, activeDrivers, sortOrder);
      }
    }

    const term = this.chargingSearch.trim().toLowerCase();
    const filtered = term
      ? rows.filter((row) =>
          this.getChargingPolicyTypeLabel(row.policyType).toLowerCase().includes(term) ||
          row.providerName.toLowerCase().includes(term) ||
          row.policyNumber.toLowerCase().includes(term)
        )
      : rows;

    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  });

  chargingStats = computed(() => {
    this.summaryPeriodTab();
    this.summarySpecificPeriod();
    const breakdown = this.fleetCostBreakdownData();
    const display = this.chargingFleetSummaryDisplay();
    return {
      chargeLines: breakdown.lines.length,
      drivers: breakdown.activeDriverCount,
      driverHeadcount: breakdown.activeDriverHeadcount,
      totalCharges: display.totalFleetCost
    };
  });

  fleetCostBreakdownData = computed((): FleetCostBreakdownData => {
    this.summaryPeriodTab();
    this.summarySpecificPeriod();
    this.chargingEnrollmentsByPolicy();
    this.chargingDrivers();
    this.fleetDriverOverrides();
    this.policies();
    this.persistedChargingSnapshot();

    const { periodType, periodKey } = this.getFleetOverridePeriodParts();
    const persisted = this.persistedChargingSnapshot();
    const usePersisted = (this.loadingCharging() || this.loadingFleetDriverOverrides() || this.loadingChargingSnapshot())
      && persisted
      && persisted.periodType === periodType
      && persisted.periodKey === periodKey;

    if (usePersisted && persisted) {
      return this.breakdownFromSnapshot(persisted);
    }

    return this.buildFleetCostBreakdown();
  });

  fleetDriverSettingsRows = computed((): FleetDriverSettingsRow[] => {
    this.summaryPeriodTab();
    this.summarySpecificPeriod();
    this.chargingDrivers();
    this.fleetDriverOverrides();
    this.fleetDriverSettingsSearch();
    const { start, end } = this.getSummaryPeriodDateRange();
    const term = this.fleetDriverSettingsSearch().trim().toLowerCase();

    return this.chargingDrivers()
      .map((driver) => {
        const driverId = Number(driver.id);
        const status = this.normalizeDriverStatus(driver.status);
        const autoEligible = this.isDriverAutoEligibleForPeriod(driver, start, end);
        const included = this.isDriverIncludedForPeriod(driver, start, end);
        const truckNumber = this.formatDriverTruckNumber(driver);
        const driverName = String(driver.name || 'Unknown Driver').trim();

        return {
          driverId,
          driverName,
          truckNumber,
          status,
          statusLabel: this.formatDriverStatusLabel(status),
          hireDate: this.formatDriverEmploymentDate(driver.hireDate || driver.HireDate),
          terminationDate: this.formatDriverEmploymentDate(driver.terminationDate || driver.TerminationDate),
          autoEligible,
          included,
          hasOverride: this.getFleetDriverOverride(driverId) !== null
        };
      })
      .filter((row) => {
        if (!term) return true;
        return row.driverName.toLowerCase().includes(term) ||
          row.truckNumber.toLowerCase().includes(term) ||
          row.statusLabel.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        if (a.included !== b.included) return a.included ? -1 : 1;
        return a.driverName.localeCompare(b.driverName);
      });
  });

  fleetDriverSettingsCounts = computed(() => {
    this.summaryPeriodTab();
    this.summarySpecificPeriod();
    this.chargingDrivers();
    this.fleetDriverOverrides();
    const { start, end } = this.getSummaryPeriodDateRange();
    const includedDrivers = this.getFleetEligibleDriversDuringPeriod(start, end);
    return {
      drivers: includedDrivers.length,
      trucks: this.countUniqueTruckBillingUnits(includedDrivers),
      overrides: Object.keys(this.getFleetDriverOverridesForCurrentPeriod()).length
    };
  });

  chargingFleetCalculationLines = computed(() => this.fleetCostBreakdownData().lines);

  chargingFleetDriverCalculationLines = computed(() =>
    this.chargingFleetCalculationLines().filter((line) => line.category === 'driver')
  );

  chargingFleetCompanyCalculationLines = computed(() =>
    this.chargingFleetCalculationLines().filter((line) => line.category === 'company')
  );

  fleetSummaryDetailRowSpan = computed(() => {
    const driverRows = this.chargingFleetDriverCalculationLines().length || 1;
    const companyRows = this.chargingFleetCompanyCalculationLines().length || 1;
    return driverRows + companyRows + 3;
  });

  chargingFleetSummary = computed((): ChargingFleetSummary => {
    const breakdown = this.fleetCostBreakdownData();
    const driverChargesAnnual = breakdown.driverChargesAnnual;
    const companyCostAnnual = breakdown.companyCostAnnual;
    const totalFleetCostAnnual = driverChargesAnnual + companyCostAnnual;

    return {
      activeDrivers: breakdown.activeDriverCount,
      activeDriverHeadcount: breakdown.activeDriverHeadcount,
      driverChargesAnnual,
      companyCostAnnual,
      totalFleetCostAnnual,
      driverChargesMonthly: driverChargesAnnual / 12,
      companyCostMonthly: companyCostAnnual / 12,
      totalFleetCostMonthly: totalFleetCostAnnual / 12,
      driverChargesWeekly: driverChargesAnnual / 52,
      companyCostWeekly: companyCostAnnual / 52,
      totalFleetCostWeekly: totalFleetCostAnnual / 52,
      driverChargesDaily: driverChargesAnnual / 365,
      companyCostDaily: companyCostAnnual / 365,
      totalFleetCostDaily: totalFleetCostAnnual / 365
    };
  });

  chargingFleetSummaryDisplay = computed(() => {
    this.summaryPeriodTab();
    const lines = this.chargingFleetCalculationLines();
    const driverCharges = this.roundMoney(
      lines.filter((line) => line.category === 'driver').reduce((sum, line) => sum + line.periodAmount, 0)
    );
    const companyCost = this.roundMoney(
      lines.filter((line) => line.category === 'company').reduce((sum, line) => sum + line.periodAmount, 0)
    );
    return {
      driverCharges,
      companyCost,
      totalFleetCost: this.roundMoney(driverCharges + companyCost)
    };
  });

  summarySpecificPeriodOptions = computed((): SummaryPeriodOption[] =>
    this.buildSummarySpecificPeriodOptions(this.summaryPeriodTab())
  );

  enrollmentMatrixColumns = computed((): EnrollmentMatrixColumn[] => {
    const persistedMatrix = this.getPersistedMatrixForCurrentPeriod();
    if (persistedMatrix?.columns?.length) {
      return persistedMatrix.columns;
    }

    const columns: EnrollmentMatrixColumn[] = [];

    for (const group of this.groupedByType()) {
      const current = group.current;
      if (current.status !== 'active' && current.status !== 'expiring') continue;

      columns.push(this.buildEnrollmentMatrixColumn(current));

      for (const included of group.includedCoverages) {
        if (included.status !== 'active' && included.status !== 'expiring') continue;
        if (!this.shouldShowBundledChildInCharging(included)) continue;
        columns.push(this.buildEnrollmentMatrixColumn(included));
      }
    }

    return columns;
  });

  enrollmentMatrixRows = computed((): EnrollmentMatrixRow[] => {
    this.summaryPeriodTab();
    this.summarySpecificPeriod();
    const persistedMatrix = this.getPersistedMatrixForCurrentPeriod();
    if (persistedMatrix?.rows?.length) {
      return persistedMatrix.rows;
    }

    const columns = this.enrollmentMatrixColumns();
    if (!columns.length) return [];

    const enrollmentsByPolicy = this.chargingEnrollmentsByPolicy();
    const tab = this.matrixDriverTab();
    const term = this.matrixSearch.trim().toLowerCase();
    const { start, end } = this.getSummaryPeriodDateRange();

    return this.chargingDrivers()
      .filter((driver) => {
        const status = this.normalizeDriverStatus(driver.status);
        const isActive = this.isMatrixActiveDriver(status);
        const isInactive = this.isMatrixInactiveDriver(status);
        if (tab === 'active' && !isActive) return false;
        if (tab === 'inactive' && !isInactive) return false;
        if (!this.wasDriverEmployedDuringPeriod(driver, start, end)) return false;
        if (!term) return true;
        const name = String(driver.name || '').toLowerCase();
        const email = String(driver.email || '').toLowerCase();
        return name.includes(term) || email.includes(term);
      })
      .map((driver) => {
        const driverId = Number(driver.id);
        const driverStatus = this.normalizeDriverStatus(driver.status);
        const cells: Record<string, MatrixCellCharge | null> = {};

        for (const column of columns) {
          const policy = this.findPolicyById(column.policyId);
          cells[column.policyId] = policy
            ? this.getMatrixDriverCharge(driverId, driverStatus, column, policy, enrollmentsByPolicy)
            : null;
        }

        return {
          driverId,
          driverName: driver.name || 'Unknown Driver',
          cells
        };
      })
      .sort((a, b) => a.driverName.localeCompare(b.driverName));
  });

  enrollmentMatrixTotals = computed(() => {
    this.summaryPeriodTab();
    const persistedMatrix = this.getPersistedMatrixForCurrentPeriod();
    if (persistedMatrix?.totals) {
      return persistedMatrix.totals;
    }

    const rows = this.enrollmentMatrixRows();
    const columns = this.enrollmentMatrixColumns();
    const columnTotals: Record<string, number> = {};
    const rowTotals: Record<number, number> = {};

    for (const col of columns) {
      columnTotals[col.policyId] = 0;
    }

    let grandTotal = 0;
    for (const row of rows) {
      let rowSum = 0;
      for (const col of columns) {
        const amount = this.getMatrixCellPeriodAmount(col, row.cells[col.policyId]);
        rowSum += amount;
        columnTotals[col.policyId] += amount;
      }
      rowTotals[row.driverId] = this.roundMoney(rowSum);
      grandTotal += rowSum;
    }

    for (const col of columns) {
      columnTotals[col.policyId] = this.roundMoney(columnTotals[col.policyId]);
    }

    return { columnTotals, rowTotals, grandTotal: this.roundMoney(grandTotal) };
  });

  matrixDriverCounts = computed(() => {
    this.summaryPeriodTab();
    this.summarySpecificPeriod();
    const { start, end } = this.getSummaryPeriodDateRange();
    const all = this.chargingDrivers();
    let active = 0;
    let inactive = 0;
    for (const driver of all) {
      if (!this.wasDriverEmployedDuringPeriod(driver, start, end)) continue;
      const status = this.normalizeDriverStatus(driver.status);
      if (this.isMatrixInactiveDriver(status)) inactive++;
      else if (this.isMatrixActiveDriver(status)) active++;
    }
    return { active, inactive };
  });

  enrollmentMatrixStats = computed(() => {
    const rows = this.enrollmentMatrixRows();
    const perDriverColumns = this.enrollmentMatrixColumns().filter((c) => c.expenseType === 'driver_expense');
    let enrolled = 0;
    let missing = 0;
    for (const row of rows) {
      for (const column of perDriverColumns) {
        if ((row.cells[column.policyId]?.amount || 0) > 0) enrolled++;
        else missing++;
      }
    }
    return { drivers: rows.length, policies: perDriverColumns.length, enrolled, missing };
  });

  matrixDashStats = computed(() => {
    const counts = this.matrixDriverCounts();
    const columns = this.enrollmentMatrixColumns();
    const perDriverColumns = columns.filter((c) => c.expenseType === 'driver_expense');
    const matrixStats = this.enrollmentMatrixStats();
    const enrollmentSlots = matrixStats.enrolled + matrixStats.missing;

    return {
      totalDrivers: counts.active + counts.inactive,
      active: counts.active,
      inactive: counts.inactive,
      policies: columns.length,
      perDriverPolicies: perDriverColumns.length,
      enrolled: matrixStats.enrolled,
      gaps: matrixStats.missing,
      coveragePct: enrollmentSlots > 0
        ? Math.round((matrixStats.enrolled / enrollmentSlots) * 100)
        : (perDriverColumns.length > 0 ? 0 : 100),
    };
  });

  setPageTab(tab: PageTab): void {
    this.pageTab.set(tab);
    if (tab === 'charging') {
      void Promise.all([
        this.loadFleetDriverOverridesForCurrentPeriod(),
        this.loadChargingSnapshotFromApi()
      ]);
      this.loadChargingData();
    }
  }

  setChargingSubTab(tab: ChargingSubTab): void {
    this.chargingSubTab.set(tab);
  }

  loadChargingData(): void {
    if (this.loadingPolicies()) return;
    this.loadingCharging.set(true);

    const chargeablePolicies = this.getChargeablePolicies();

    const enrollmentPromise = !chargeablePolicies.length
      ? Promise.resolve([] as { policyId: string; rows: any[] }[])
      : Promise.all(
          chargeablePolicies.map((policy) =>
            this.api.getInsuranceEnrollments(policy.id).toPromise()
              .then((res: any) => ({ policyId: String(policy.id), rows: res?.data || [] }))
              .catch(() => ({ policyId: String(policy.id), rows: [] }))
          )
        );

    const driversPromise = this.loadDriversForMatrix();

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
    this.summarySpecificPeriod.set(
      this.buildSummarySpecificPeriodOptions(this.summaryPeriodTab())[0]?.value || ''
    );
    void this.initializeFleetDriverOverrides();
  }

  openFleetDriverSettingsModal(): void {
    this.fleetDriverSettingsSearch.set('');
    this.showFleetDriverSettingsModal.set(true);
  }

  setFleetDriverSettingsSearch(value: string): void {
    this.fleetDriverSettingsSearch.set(value);
  }

  closeFleetDriverSettingsModal(): void {
    this.showFleetDriverSettingsModal.set(false);
  }

  setFleetDriverIncluded(driverId: number, included: boolean): void {
    const driver = this.chargingDrivers().find((row) => Number(row.id) === driverId);
    if (!driver) return;

    const { start, end } = this.getSummaryPeriodDateRange();
    const autoEligible = this.isDriverAutoEligibleForPeriod(driver, start, end);
    const periodKey = this.getFleetOverridePeriodKey();
    const driverKey = String(driverId);
    const previousOverrides = { ...this.fleetDriverOverrides() };
    const nextPeriodOverrides = { ...this.getFleetDriverOverridesForCurrentPeriod() };

    if (included === autoEligible) {
      delete nextPeriodOverrides[driverKey];
    } else {
      nextPeriodOverrides[driverKey] = included ? 'included' : 'excluded';
    }

    const nextOverrides = {
      ...previousOverrides,
      [periodKey]: nextPeriodOverrides
    };

    if (!Object.keys(nextPeriodOverrides).length) {
      delete nextOverrides[periodKey];
    }

    this.fleetDriverOverrides.set(nextOverrides);

    const { periodType, periodKey: periodValue } = this.getFleetOverridePeriodParts();
    const inclusionState: FleetDriverOverrideState | null =
      included === autoEligible ? null : (included ? 'included' : 'excluded');

    void firstValueFrom(
      this.api.upsertInsuranceFleetDriverOverride(driverId, {
        periodType,
        periodKey: periodValue,
        inclusionState
      })
    ).catch(() => {
      this.fleetDriverOverrides.set(previousOverrides);
      this.toast.error('Could not save fleet driver setting.', 'Save Failed');
    });
  }

  resetFleetDriverOverridesForPeriod(): void {
    const periodKey = this.getFleetOverridePeriodKey();
    const { periodType, periodKey: periodValue } = this.getFleetOverridePeriodParts();
    const previousOverrides = { ...this.fleetDriverOverrides() };
    const nextOverrides = { ...previousOverrides };
    delete nextOverrides[periodKey];
    this.fleetDriverOverrides.set(nextOverrides);

    void firstValueFrom(
      this.api.deleteInsuranceFleetDriverOverridesForPeriod(periodType, periodValue)
    ).then(() => {
      this.toast.success('Fleet driver selections reset to automatic rules.', 'Reset');
    }).catch(() => {
      this.fleetDriverOverrides.set(previousOverrides);
      this.toast.error('Could not reset fleet driver settings.', 'Reset Failed');
    });
  }

  getFleetDriverSettingsModalTitle(): string {
    return `Fleet Drivers — ${this.getSummarySpecificPeriodLabel()}`;
  }

  private async initializeFleetDriverOverrides(): Promise<void> {
    await this.migrateLocalFleetDriverOverridesIfNeeded();
    await Promise.all([
      this.loadFleetDriverOverridesForCurrentPeriod(),
      this.loadChargingSnapshotFromApi()
    ]);
  }

  private async migrateLocalFleetDriverOverridesIfNeeded(): Promise<void> {
    if (localStorage.getItem(this.fleetDriverOverridesMigratedKey) === '1') return;

    let stored: Record<string, Record<string, FleetDriverOverrideState>> = {};
    try {
      const raw = localStorage.getItem(this.fleetDriverOverridesStorageKey);
      if (!raw) {
        localStorage.setItem(this.fleetDriverOverridesMigratedKey, '1');
        return;
      }
      stored = JSON.parse(raw);
    } catch {
      localStorage.setItem(this.fleetDriverOverridesMigratedKey, '1');
      return;
    }

    const items: Array<{ periodType: string; periodKey: string; driverId: number; inclusionState: string }> = [];
    for (const [combinedPeriodKey, driverMap] of Object.entries(stored || {})) {
      const separatorIndex = combinedPeriodKey.indexOf(':');
      if (separatorIndex <= 0) continue;
      const periodType = combinedPeriodKey.slice(0, separatorIndex);
      const periodKey = combinedPeriodKey.slice(separatorIndex + 1);
      if (!periodKey) continue;

      for (const [driverId, state] of Object.entries(driverMap || {})) {
        if (state === 'included' || state === 'excluded') {
          items.push({
            periodType,
            periodKey,
            driverId: Number(driverId),
            inclusionState: state
          });
        }
      }
    }

    if (!items.length) {
      localStorage.removeItem(this.fleetDriverOverridesStorageKey);
      localStorage.setItem(this.fleetDriverOverridesMigratedKey, '1');
      return;
    }

    try {
      await firstValueFrom(this.api.bulkMigrateInsuranceFleetDriverOverrides(items));
      localStorage.removeItem(this.fleetDriverOverridesStorageKey);
      localStorage.setItem(this.fleetDriverOverridesMigratedKey, '1');
    } catch {
      // Keep local values until migration succeeds.
    }
  }

  private async loadFleetDriverOverridesForCurrentPeriod(): Promise<void> {
    const { periodType, periodKey } = this.getFleetOverridePeriodParts();
    if (!periodKey) {
      this.applyFleetDriverOverridesForPeriod({});
      return;
    }

    this.loadingFleetDriverOverrides.set(true);
    try {
      const res: any = await firstValueFrom(
        this.api.getInsuranceFleetDriverOverrides(periodType, periodKey)
      );
      const data = res?.data || {};
      const normalized: Record<string, FleetDriverOverrideState> = {};
      for (const [driverId, state] of Object.entries(data)) {
        if (state === 'included' || state === 'excluded') {
          normalized[driverId] = state;
        }
      }
      this.applyFleetDriverOverridesForPeriod(normalized);
    } catch {
      this.applyFleetDriverOverridesForPeriod({});
    } finally {
      this.loadingFleetDriverOverrides.set(false);
    }
  }

  private applyFleetDriverOverridesForPeriod(overrides: Record<string, FleetDriverOverrideState>): void {
    const periodKey = this.getFleetOverridePeriodKey();
    const next = { ...this.fleetDriverOverrides() };
    if (Object.keys(overrides).length) {
      next[periodKey] = overrides;
    } else {
      delete next[periodKey];
    }
    this.fleetDriverOverrides.set(next);
  }

  private getFleetOverridePeriodParts(): { periodType: MatrixPeriodTab; periodKey: string } {
    return {
      periodType: this.summaryPeriodTab(),
      periodKey: this.summarySpecificPeriod()
    };
  }

  private getFleetOverridePeriodKey(): string {
    return `${this.summaryPeriodTab()}:${this.summarySpecificPeriod()}`;
  }

  private breakdownFromSnapshot(snapshot: StoredChargingSnapshot): FleetCostBreakdownData {
    return {
      activeDriverCount: snapshot.activeTruckCount,
      activeDriverHeadcount: snapshot.activeDriverHeadcount,
      lines: snapshot.summaryLines || [],
      driverChargesAnnual: snapshot.driverChargesAnnual,
      companyCostAnnual: snapshot.companyCostAnnual
    };
  }

  private getPersistedMatrixForCurrentPeriod(): StoredChargingSnapshot['matrix'] | null {
    this.persistedChargingSnapshot();
    this.loadingCharging();
    this.loadingFleetDriverOverrides();
    this.loadingChargingSnapshot();

    if (!this.loadingCharging() && !this.loadingFleetDriverOverrides() && !this.loadingChargingSnapshot()) {
      return null;
    }

    const { periodType, periodKey } = this.getFleetOverridePeriodParts();
    const persisted = this.persistedChargingSnapshot();
    if (!persisted || persisted.periodType !== periodType || persisted.periodKey !== periodKey) {
      return null;
    }

    return persisted.matrix || null;
  }

  private mapApiChargingSnapshot(data: any): StoredChargingSnapshot {
    return {
      periodType: String(data.periodType || ''),
      periodKey: String(data.periodKey || ''),
      activeTruckCount: Number(data.activeTruckCount || 0),
      activeDriverHeadcount: Number(data.activeDriverHeadcount || 0),
      driverChargesAnnual: Number(data.driverChargesAnnual || 0),
      companyCostAnnual: Number(data.companyCostAnnual || 0),
      driverChargesPeriod: Number(data.driverChargesPeriod || 0),
      companyCostPeriod: Number(data.companyCostPeriod || 0),
      totalPeriod: Number(data.totalPeriod || 0),
      summaryLines: Array.isArray(data.summaryLines) ? data.summaryLines : [],
      matrix: data.matrix || undefined,
      reportMeta: data.reportMeta || undefined,
      computedAt: data.computedAt,
      updatedAt: data.updatedAt
    };
  }

  private async loadChargingSnapshotFromApi(): Promise<void> {
    const { periodType, periodKey } = this.getFleetOverridePeriodParts();
    if (!periodKey) {
      this.persistedChargingSnapshot.set(null);
      return;
    }

    this.loadingChargingSnapshot.set(true);
    try {
      const res: any = await firstValueFrom(
        this.api.getInsuranceChargingSnapshot(periodType, periodKey)
      );
      this.persistedChargingSnapshot.set(res?.data ? this.mapApiChargingSnapshot(res.data) : null);
    } catch {
      this.persistedChargingSnapshot.set(null);
    } finally {
      this.loadingChargingSnapshot.set(false);
    }
  }

  private scheduleChargingSnapshotSave(): void {
    if (this.chargingSnapshotSaveTimer) {
      clearTimeout(this.chargingSnapshotSaveTimer);
    }
    this.chargingSnapshotSaveTimer = setTimeout(() => void this.saveChargingSnapshotToApi(), 800);
  }

  private async saveChargingSnapshotToApi(): Promise<void> {
    if (this.pageTab() !== 'charging') return;
    const { periodType, periodKey } = this.getFleetOverridePeriodParts();
    if (!periodKey || this.loadingCharging() || this.loadingFleetDriverOverrides()) return;

    const breakdown = this.buildFleetCostBreakdown();
    const driverChargesPeriod = this.roundMoney(
      breakdown.lines.filter((line) => line.category === 'driver').reduce((sum, line) => sum + line.periodAmount, 0)
    );
    const companyCostPeriod = this.roundMoney(
      breakdown.lines.filter((line) => line.category === 'company').reduce((sum, line) => sum + line.periodAmount, 0)
    );
    const totalPeriod = this.roundMoney(driverChargesPeriod + companyCostPeriod);

    const matrix = {
      columns: this.enrollmentMatrixColumns(),
      rows: this.enrollmentMatrixRows(),
      totals: this.enrollmentMatrixTotals()
    };

    try {
      await firstValueFrom(this.api.upsertInsuranceChargingSnapshot({
        periodType,
        periodKey,
        activeTruckCount: breakdown.activeDriverCount,
        activeDriverHeadcount: breakdown.activeDriverHeadcount,
        driverChargesAnnual: breakdown.driverChargesAnnual,
        companyCostAnnual: breakdown.companyCostAnnual,
        driverChargesPeriod,
        companyCostPeriod,
        totalPeriod,
        summaryLines: breakdown.lines,
        matrix,
        reportMeta: {
          periodLabel: this.getSummarySpecificPeriodLabel(),
          chargeLines: breakdown.lines.length,
          generatedAt: new Date().toISOString()
        },
        computedAt: new Date().toISOString()
      }));
    } catch {
      // Keep UI responsive if snapshot save fails.
    }
  }

  private getAccountingInvoiceCacheKey(): string {
    const tab = this.summaryPeriodTab();
    const value = String(this.summarySpecificPeriod() || '').trim();
    if (tab === 'monthly') return value.substring(0, 7);
    if (tab === 'yearly') return value;
    return `${tab}:${value}`;
  }

  private getFleetDriverOverridesForCurrentPeriod(): Record<string, FleetDriverOverrideState> {
    return this.fleetDriverOverrides()[this.getFleetOverridePeriodKey()] || {};
  }

  private getFleetDriverOverride(driverId: number): FleetDriverOverrideState | null {
    return this.getFleetDriverOverridesForCurrentPeriod()[String(driverId)] || null;
  }

  private isDriverAutoEligibleForPeriod(driver: any, start: Date, end: Date): boolean {
    const status = this.normalizeDriverStatus(driver?.status);
    if (this.isMatrixOnboardingDriver(status)) return false;
    return this.wasDriverEmployedDuringPeriod(driver, start, end);
  }

  private isDriverIncludedForPeriod(driver: any, start: Date, end: Date): boolean {
    const override = this.getFleetDriverOverride(Number(driver.id));
    if (override === 'included') return true;
    if (override === 'excluded') return false;
    return this.isDriverAutoEligibleForPeriod(driver, start, end);
  }

  private formatDriverTruckNumber(driver: any): string {
    const value = String(driver?.truckNumber ?? driver?.TruckNumber ?? driver?.truckTag ?? '').trim();
    return value || '—';
  }

  private formatDriverEmploymentDate(value: unknown): string {
    const raw = String(value ?? '').trim().split('T')[0];
    return raw || '—';
  }

  private formatDriverStatusLabel(status: string): string {
    switch (status) {
      case 'available':
      case 'dispatched':
      case 'en-route':
      case 'at-location':
      case 'online':
        return 'Active';
      case 'archived':
        return 'Archived';
      case 'inactive':
      case 'terminated':
      case 'off-duty':
        return 'Inactive';
      case 'onboarding':
      case 'pending':
        return 'Onboarding';
      default:
        return status.replace(/-/g, ' ').replace(/_/g, ' ') || '—';
    }
  }

  setMatrixDriverTab(tab: 'active' | 'inactive'): void {
    this.matrixDriverTab.set(tab);
  }

  setSummaryPeriodTab(tab: MatrixPeriodTab): void {
    this.summaryPeriodTab.set(tab);
    if (tab === 'daily') {
      this.summarySpecificPeriod.set(this.formatSummaryDateKey(new Date()));
    } else {
      this.summarySpecificPeriod.set(this.buildSummarySpecificPeriodOptions(tab)[0]?.value || '');
    }
    void Promise.all([
      this.loadFleetDriverOverridesForCurrentPeriod(),
      this.loadChargingSnapshotFromApi()
    ]);
  }

  setSummarySpecificPeriod(value: string): void {
    this.summarySpecificPeriod.set(value || this.formatSummaryDateKey(new Date()));
    void Promise.all([
      this.loadFleetDriverOverridesForCurrentPeriod(),
      this.loadChargingSnapshotFromApi()
    ]);
  }

  getSummaryMaxDate(): string {
    return this.formatSummaryDateKey(new Date());
  }

  getSummaryPeriodColumnLabel(tab: MatrixPeriodTab = this.summaryPeriodTab()): string {
    switch (tab) {
      case 'daily': return 'Per Day';
      case 'weekly': return 'Per Week';
      case 'yearly': return 'Per Year';
      default: return 'Per Month';
    }
  }

  getFleetCalculationPeriodLabel(): string {
    return this.getSummaryPeriodColumnLabel().replace('Per ', 'per ').toLowerCase();
  }

  private buildFleetCostBreakdown(): FleetCostBreakdownData {
    const { start, end } = this.getSummaryPeriodDateRange();
    const eligibleDrivers = this.getFleetEligibleDriversDuringPeriod(start, end);
    const activeDriverHeadcount = eligibleDrivers.length;
    const activeDriverCount = this.countUniqueTruckBillingUnits(eligibleDrivers);
    const enrollmentsByPolicy = this.chargingEnrollmentsByPolicy();
    const periodLabel = this.getFleetCalculationPeriodLabel();
    const periodTab = this.summaryPeriodTab();
    const lines: FleetCalculationLine[] = [];
    let driverChargesAnnual = 0;
    let companyCostAnnual = 0;

    for (const policy of this.getChargeablePolicies()) {
      const policyFrequency = this.resolveBillingFrequency(policy);
      const policyCost = this.getPolicyCost(policy);
      const policyLabel = this.getChargingPolicyTypeLabel(policy.policyType);
      const basis = this.resolveExpenseBasis(policy);
      const isCompanyCost = basis !== 'per_driver' || this.isCompanyExpensePolicy(policy.policyType);
      const frequencyLabel = this.getBillingFrequencyLabel(policyFrequency).toLowerCase();

      if (isCompanyCost) {
        const annualAmount = this.convertMatrixChargeToPeriod(policyCost, policyFrequency, 'yearly');
        const periodAmount = this.convertMatrixChargeToPeriod(policyCost, policyFrequency, periodTab);
        companyCostAnnual += annualAmount;
        lines.push({
          policyLabel,
          providerName: policy.providerName,
          category: 'company',
          formula: `Whole policy — ${this.formatCurrency(policyCost, 2)} ${frequencyLabel} (${this.formatCurrency(annualAmount, 2)} annual)`,
          annualAmount,
          periodAmount
        });
        continue;
      }

      const enrollments = (enrollmentsByPolicy[String(policy.id)] || []).filter((e) => e.status === 'active');
      if (!enrollments.length) {
        const perDriverAnnual = this.convertMatrixChargeToPeriod(policyCost, policyFrequency, 'yearly');
        const perDriverPeriod = this.convertMatrixChargeToPeriod(policyCost, policyFrequency, periodTab);
        const truckCount = Math.max(activeDriverCount, 0);
        const annualAmount = this.roundMoney(perDriverAnnual * truckCount);
        const periodAmount = this.roundMoney(perDriverPeriod * truckCount);
        driverChargesAnnual += annualAmount;
        const truckLabel = truckCount === 1 ? 'truck' : 'trucks';
        lines.push({
          policyLabel,
          providerName: policy.providerName,
          category: 'driver',
          formula: `${truckCount} fleet ${truckLabel} × ${this.formatCurrency(perDriverPeriod, 2)} ${periodLabel} each`,
          annualAmount,
          periodAmount
        });
        continue;
      }

      let enrolledCount = 0;
      let annualAmount = 0;
      let periodAmount = 0;
      let samplePeriodCharge = 0;
      const billedTruckKeys = new Set<string>();
      for (const enrollment of enrollments) {
        const driver = this.chargingDrivers().find((d) => Number(d.id) === Number(enrollment.driverId));
        if (driver && !this.wasDriverEmployedDuringPeriod(driver, start, end)) continue;
        if (driver && !this.isMatrixActiveDriver(this.normalizeDriverStatus(driver.status))) continue;

        if (driver) {
          const billingDriverId = this.getTruckBillingDriverIdForPolicy(
            driver,
            String(policy.id),
            enrollmentsByPolicy,
            policy,
            start,
            end
          );
          if (billingDriverId !== Number(enrollment.driverId)) continue;
        }

        const truckKey = driver
          ? this.getDriverTruckBillingKey(driver)
          : `driver:${enrollment.driverId}`;
        if (billedTruckKeys.has(truckKey)) continue;
        billedTruckKeys.add(truckKey);

        enrolledCount++;
        const amount = Number(enrollment.deductionAmount ?? 0) || policyCost;
        const frequency = String(enrollment.deductionFrequency || policyFrequency).trim().toLowerCase() || policyFrequency;
        const enrolledAnnual = this.convertMatrixChargeToPeriod(amount, frequency, 'yearly');
        const enrolledPeriod = this.convertMatrixChargeToPeriod(amount, frequency, periodTab);
        annualAmount += enrolledAnnual;
        periodAmount += enrolledPeriod;
        if (!samplePeriodCharge) samplePeriodCharge = enrolledPeriod;
      }

      driverChargesAnnual += annualAmount;
      periodAmount = this.roundMoney(periodAmount);
      annualAmount = this.roundMoney(annualAmount);
      const truckLabel = enrolledCount === 1 ? 'truck' : 'trucks';
      const uniformRate = enrolledCount > 0 && Math.abs(periodAmount - this.roundMoney(samplePeriodCharge * enrolledCount)) < 0.01;
      const formula = uniformRate && enrolledCount > 0
        ? `${enrolledCount} enrolled ${truckLabel} × ${this.formatCurrency(samplePeriodCharge, 2)} ${periodLabel} each`
        : `${enrolledCount} enrolled ${truckLabel} — sum of per-truck enrollment charges (${this.formatCurrency(annualAmount, 2)} annual)`;

      lines.push({
        policyLabel,
        providerName: policy.providerName,
        category: 'driver',
        formula,
        annualAmount,
        periodAmount: uniformRate && enrolledCount > 0
          ? this.roundMoney(samplePeriodCharge * enrolledCount)
          : periodAmount
      });
    }

    return {
      activeDriverCount,
      activeDriverHeadcount,
      lines,
      driverChargesAnnual,
      companyCostAnnual
    };
  }

  getFleetBillingSummaryLabel(): string {
    const summary = this.chargingFleetSummary();
    const trucks = summary.activeDrivers;
    const drivers = summary.activeDriverHeadcount;
    const truckLabel = trucks === 1 ? 'truck' : 'trucks';
    const period = this.getSummarySpecificPeriodLabel();
    const overrideNote = this.fleetDriverSettingsCounts().overrides
      ? ' · manual driver adjustments'
      : '';
    if (drivers > trucks) {
      return `${trucks} ${truckLabel} (${drivers} drivers) on fleet — ${period}${overrideNote}`;
    }
    return `${trucks} ${truckLabel} on fleet — ${period}${overrideNote}`;
  }

  getChargingFleetCountLabel(): string {
    const summary = this.chargingFleetSummary();
    if (summary.activeDriverHeadcount > summary.activeDrivers) {
      return `Trucks on Fleet (${summary.activeDriverHeadcount} drivers)`;
    }
    return 'Trucks on Fleet';
  }

  getSummarySpecificPeriodFilterLabel(tab: MatrixPeriodTab = this.summaryPeriodTab()): string {
    switch (tab) {
      case 'daily': return 'Day';
      case 'weekly': return 'Week';
      case 'yearly': return 'Year';
      default: return 'Month';
    }
  }

  getSummarySpecificPeriodLabel(): string {
    const value = this.summarySpecificPeriod();
    if (this.summaryPeriodTab() === 'daily') {
      return this.formatSummaryDayLabel(value);
    }
    if (this.summaryPeriodTab() === 'weekly') {
      const date = this.parseSummaryDateKey(value);
      return date ? this.formatSummaryWeekLabel(date) : value || '—';
    }
    return this.summarySpecificPeriodOptions().find((option) => option.value === value)?.label || value || '—';
  }

  private formatSummaryDayLabel(value: string): string {
    const date = this.parseSummaryDateKey(value);
    if (!date) return value || '—';
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  private parseSummaryDateKey(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private buildSummarySpecificPeriodOptions(tab: MatrixPeriodTab): SummaryPeriodOption[] {
    const now = new Date();
    switch (tab) {
      case 'daily':
        return [];
      case 'weekly':
        return this.buildSummaryWeekOptions(now);
      case 'yearly':
        return this.buildSummaryYearOptions(now);
      default:
        return this.buildSummaryMonthOptions(now);
    }
  }

  private buildSummaryWeekOptions(now: Date): SummaryPeriodOption[] {
    const options: SummaryPeriodOption[] = [];
    const currentWeekStart = this.startOfSummaryWeek(now);
    for (let i = 0; i < 26; i++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() - i * 7);
      options.push({
        value: this.formatSummaryDateKey(weekStart),
        label: this.formatSummaryWeekLabel(weekStart)
      });
    }
    return options;
  }

  private formatSummaryWeekLabel(date: Date): string {
    const { week, year } = this.getSummaryWeekInfo(date);
    return `Week ${week}, ${year}`;
  }

  private getSummaryWeekInfo(date: Date): { week: number; year: number } {
    const weekStart = this.startOfSummaryWeek(date);
    let year = weekStart.getFullYear();
    let yearStart = this.startOfSummaryWeek(new Date(year, 0, 1));
    let week = 1 + Math.floor((weekStart.getTime() - yearStart.getTime()) / (7 * 86400000));

    if (week < 1) {
      year -= 1;
      yearStart = this.startOfSummaryWeek(new Date(year, 0, 1));
      week = 1 + Math.floor((weekStart.getTime() - yearStart.getTime()) / (7 * 86400000));
    }

    return { week, year };
  }

  private buildSummaryMonthOptions(now: Date): SummaryPeriodOption[] {
    const options: SummaryPeriodOption[] = [];
    for (let i = 0; i < 24; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      });
    }
    return options;
  }

  private buildSummaryYearOptions(now: Date): SummaryPeriodOption[] {
    const options: SummaryPeriodOption[] = [];
    for (let i = 0; i < 6; i++) {
      const year = now.getFullYear() - i;
      options.push({ value: String(year), label: String(year) });
    }
    return options;
  }

  private startOfSummaryWeek(date: Date): Date {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private formatSummaryDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getSummaryPeriodDateRange(): { start: Date; end: Date } {
    const tab = this.summaryPeriodTab();
    const value = this.summarySpecificPeriod();
    const now = new Date();

    switch (tab) {
      case 'daily': {
        const date = this.parseSummaryDateKey(value) || now;
        return { start: this.startOfSummaryDay(date), end: this.endOfSummaryDay(date) };
      }
      case 'weekly': {
        const weekStart = this.parseSummaryDateKey(value) || this.startOfSummaryWeek(now);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return { start: this.startOfSummaryDay(weekStart), end: this.endOfSummaryDay(weekEnd) };
      }
      case 'yearly': {
        const year = Number(value) || now.getFullYear();
        return {
          start: this.startOfSummaryDay(new Date(year, 0, 1)),
          end: this.endOfSummaryDay(new Date(year, 11, 31))
        };
      }
      default: {
        const match = /^(\d{4})-(\d{2})$/.exec(String(value || '').trim());
        const year = match ? Number(match[1]) : now.getFullYear();
        const month = match ? Number(match[2]) - 1 : now.getMonth();
        return {
          start: this.startOfSummaryDay(new Date(year, month, 1)),
          end: this.endOfSummaryDay(new Date(year, month + 1, 0))
        };
      }
    }
  }

  private getFleetEligibleDriversDuringPeriod(start: Date, end: Date): any[] {
    return this.chargingDrivers().filter((driver) =>
      this.isDriverIncludedForPeriod(driver, start, end)
    );
  }

  private wasDriverBillableOnFleetDuringPeriod(driver: any, start: Date, end: Date): boolean {
    return this.isDriverIncludedForPeriod(driver, start, end);
  }

  private isSelectedPeriodCurrentMonth(start: Date, end: Date): boolean {
    const now = new Date();
    const currentStart = this.startOfSummaryDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const currentEnd = this.endOfSummaryDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return start.getTime() === currentStart.getTime() && end.getTime() === currentEnd.getTime();
  }

  private normalizeTruckNumberForBilling(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return raw.replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
  }

  private getDriverTruckBillingKey(driver: any): string {
    const truck = this.normalizeTruckNumberForBilling(
      driver?.truckNumber ?? driver?.TruckNumber ?? driver?.truckTag ?? driver?.TruckTag ?? ''
    );
    if (truck) return `truck:${truck}`;
    const driverId = Number(driver?.id);
    return Number.isFinite(driverId) && driverId > 0 ? `driver:${driverId}` : `driver:unknown`;
  }

  private countUniqueTruckBillingUnits(drivers: any[]): number {
    const keys = new Set<string>();
    for (const driver of drivers) {
      keys.add(this.getDriverTruckBillingKey(driver));
    }
    return keys.size;
  }

  private getTruckBillingDriverIdForPolicy(
    driver: any,
    policyId: string,
    enrollmentsByPolicy: Record<string, any[]>,
    policy: InsuranceRow,
    start: Date,
    end: Date
  ): number | null {
    const key = this.getDriverTruckBillingKey(driver);
    const peers = this.getFleetEligibleDriversDuringPeriod(start, end)
      .filter((peer) => this.getDriverTruckBillingKey(peer) === key);
    if (!peers.length) return null;

    const activeEnrollments = (enrollmentsByPolicy[policyId] || []).filter((e) => e.status === 'active');
    if (activeEnrollments.length) {
      const enrolledPeers = peers.filter((peer) =>
        activeEnrollments.some((enrollment) => Number(enrollment.driverId) === Number(peer.id))
      );
      if (!enrolledPeers.length) return null;
      return Math.min(...enrolledPeers.map((peer) => Number(peer.id)));
    }

    return Math.min(...peers.map((peer) => Number(peer.id)));
  }

  private wasDriverEmployedDuringPeriod(driver: any, start: Date, end: Date): boolean {
    const status = this.normalizeDriverStatus(driver?.status);

    if (driver?.isDeleted || driver?.IsDeleted) return false;
    if (this.isMatrixOnboardingDriver(status)) return false;

    const hireDate = this.parseDriverEmploymentDate(driver?.hireDate || driver?.HireDate);
    if (hireDate && hireDate > end) return false;

    if (this.isSelectedPeriodCurrentMonth(start, end)) {
      return this.isMatrixActiveDriver(status);
    }

    if (this.isMatrixActiveDriver(status)) {
      return true;
    }

    const terminationDate = this.parseDriverEmploymentDate(driver?.terminationDate || driver?.TerminationDate);
    if (!terminationDate) return false;
    if (terminationDate < start) return false;
    return (hireDate ?? terminationDate) <= end;
  }

  private parseDriverEmploymentDate(value: unknown): Date | null {
    if (!value) return null;
    const dateOnly = String(value).trim().split('T')[0];
    return this.parseSummaryDateKey(dateOnly);
  }

  private startOfSummaryDay(date: Date): Date {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    return day;
  }

  private endOfSummaryDay(date: Date): Date {
    const day = new Date(date);
    day.setHours(23, 59, 59, 999);
    return day;
  }

  getMatrixPeriodLabel(tab: MatrixPeriodTab = this.summaryPeriodTab()): string {
    switch (tab) {
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'yearly': return 'Yearly';
      default: return 'Monthly';
    }
  }

  private async loadDriversForMatrix(): Promise<any[]> {
    const limit = 5000;
    try {
      const res: any = await this.api.getDrivers({ limit, page: 1 }).toPromise();
      const firstPage = res?.data || [];
      const total = Number(res?.total ?? firstPage.length);
      if (firstPage.length >= total || firstPage.length < limit) return firstPage;

      const all = [...firstPage];
      const totalPages = Math.ceil(total / limit);
      for (let page = 2; page <= totalPages; page++) {
        const next: any = await this.api.getDrivers({ limit, page }).toPromise();
        all.push(...(next?.data || []));
      }
      return all;
    } catch {
      return [];
    }
  }

  private normalizeDriverStatus(status: unknown): string {
    const normalized = String(status ?? 'active')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/_/g, '-');
    return normalized || 'active';
  }

  private isMatrixArchivedDriver(status: string): boolean {
    return status === 'archived' || status === 'deleted';
  }

  private isMatrixInactiveDriver(status: string): boolean {
    return status === 'inactive' ||
      status === 'off-duty' ||
      status === 'terminated' ||
      status === 'deactivated' ||
      status === 'disabled' ||
      status === 'suspended' ||
      status === 'vacation' ||
      status === 'sleeper';
  }

  private isMatrixOnboardingDriver(status: string): boolean {
    return status === 'onboarding' ||
      status === 'pending' ||
      status === 'invited' ||
      status === 'application' ||
      status === 'applicant' ||
      status === 'orientation' ||
      status === 'recruiting' ||
      status === 'pre-hire' ||
      status === 'prehire' ||
      status === 'background-check' ||
      status === 'training' ||
      status === 'closeout';
  }

  private isMatrixFleetEligibleStatus(status: string): boolean {
    return status === 'active' ||
      status === 'available' ||
      status === 'online' ||
      status === 'dispatched' ||
      status === 'en-route' ||
      status === 'at-location';
  }

  private isMatrixActiveDriver(status: string): boolean {
    if (this.isMatrixArchivedDriver(status) || this.isMatrixInactiveDriver(status)) return false;
    if (this.isMatrixOnboardingDriver(status)) return false;
    return this.isMatrixFleetEligibleStatus(status);
  }

  private buildEnrollmentMatrixColumn(policy: InsuranceRow): EnrollmentMatrixColumn {
    const expenseBasis = this.resolveExpenseBasis(policy);
    return {
      policyId: String(policy.id),
      policyType: policy.policyType,
      label: this.getChargingPolicyTypeLabel(policy.policyType),
      expenseBasis,
      expenseType: expenseBasis === 'per_driver' ? 'driver_expense' : 'company_expense'
    };
  }

  private findPolicyById(policyId: string): InsuranceRow | null {
    for (const group of this.groupedByType()) {
      if (String(group.current.id) === policyId) return group.current;
      for (const included of group.includedCoverages) {
        if (String(included.id) === policyId) return included;
      }
    }
    return null;
  }

  private getMatrixDriverCharge(
    driverId: number,
    driverStatus: string,
    column: EnrollmentMatrixColumn,
    policy: InsuranceRow,
    enrollmentsByPolicy: Record<string, any[]>
  ): MatrixCellCharge | null {
    const policyCost = this.getPolicyCost(policy);
    const policyFrequency = this.resolveBillingFrequency(policy);
    const { start, end } = this.getSummaryPeriodDateRange();
    const driver = this.chargingDrivers().find((d) => Number(d.id) === driverId);
    if (!driver) return null;

    const billingDriverId = this.getTruckBillingDriverIdForPolicy(
      driver,
      column.policyId,
      enrollmentsByPolicy,
      policy,
      start,
      end
    );
    if (billingDriverId !== driverId) return null;

    const truckCount = this.countUniqueTruckBillingUnits(this.getFleetEligibleDriversDuringPeriod(start, end));
    const billableDuringPeriod = this.wasDriverBillableOnFleetDuringPeriod(driver, start, end);

    if (column.expenseType === 'company_expense') {
      if (!billableDuringPeriod || policyCost <= 0) return null;
      if (truckCount <= 0) return null;
      return {
        amount: policyCost / truckCount,
        billingFrequency: policyFrequency
      };
    }

    const enrollments = enrollmentsByPolicy[column.policyId] || [];
    const activeEnrollments = enrollments.filter((e) => e.status === 'active');

    if (!activeEnrollments.length) {
      if (!billableDuringPeriod) return null;
      return { amount: policyCost, billingFrequency: policyFrequency };
    }

    const enrollment = activeEnrollments.find((e) => Number(e.driverId) === driverId);
    if (!enrollment) return null;

    const amount = Number(enrollment.deductionAmount ?? 0) || policyCost;
    const billingFrequency = String(enrollment.deductionFrequency || policyFrequency).trim().toLowerCase() || policyFrequency;
    return { amount, billingFrequency };
  }

  private convertMatrixChargeToPeriod(amount: number, billingFrequency: string, target: MatrixPeriodTab): number {
    const monthly = this.toMonthlyChargeAmount(amount, billingFrequency);
    let raw: number;
    switch (target) {
      case 'daily':
        raw = (monthly * 12) / 365;
        break;
      case 'weekly':
        raw = (monthly * 12) / 52;
        break;
      case 'yearly':
        raw = monthly * 12;
        break;
      default:
        raw = monthly;
    }
    return this.roundMoney(raw);
  }

  private roundMoney(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  private toMonthlyChargeAmount(amount: number, billingFrequency: string): number {
    switch (String(billingFrequency || 'monthly').trim().toLowerCase()) {
      case 'quarterly':
        return amount / 3;
      case 'semi_annual':
        return amount / 6;
      case 'annual':
        return amount / 12;
      default:
        return amount;
    }
  }

  getMatrixColumnExpenseLabel(column: EnrollmentMatrixColumn): string {
    return this.getMatrixExpenseLabel(column.expenseType);
  }

  getMatrixCellDisplayAmount(column: EnrollmentMatrixColumn, cell: MatrixCellCharge | null | undefined): string {
    const amount = this.getMatrixCellPeriodAmount(column, cell);
    if (amount <= 0) return '—';
    return this.formatCurrency(amount, 2);
  }

  getMatrixCellPeriodAmount(column: EnrollmentMatrixColumn, cell: MatrixCellCharge | null | undefined): number {
    if (!cell || cell.amount <= 0) return 0;
    return this.convertMatrixChargeToPeriod(cell.amount, cell.billingFrequency, this.summaryPeriodTab());
  }

  getMatrixRowTotal(row: EnrollmentMatrixRow): number {
    return this.enrollmentMatrixTotals().rowTotals[row.driverId] ?? 0;
  }

  getMatrixColumnTotal(column: EnrollmentMatrixColumn): number {
    return this.enrollmentMatrixTotals().columnTotals[column.policyId] ?? 0;
  }

  isCompanyExpensePolicy(policyType: string): boolean {
    return COMPANY_EXPENSE_POLICY_TYPES.has(String(policyType || '').trim().toLowerCase());
  }

  isBundledChildPolicy(policy: InsuranceRow | any, policies: InsuranceRow[] = this.policies()): boolean {
    const rule = this.getBundleRuleForChild(String(policy?.policyType || '').trim().toLowerCase());
    if (!rule) return false;

    if (policy?.status === 'expired') return false;

    const parentPolicies = policies.filter(
      (p) => p.policyType === rule.parentType && p.status !== 'expired'
    );
    if (!parentPolicies.length) return false;

    for (const parent of parentPolicies) {
      if (!this.policyPeriodsOverlap(policy, parent)) continue;
      if (this.policiesBelongToSameBundle(parent, policy, rule)) return true;
    }

    return false;
  }

  getBundledChildCoverages(
    parentType: string,
    parentPolicy: InsuranceRow,
    policies: InsuranceRow[] = this.policies()
  ): InsuranceRow[] {
    const rule = this.getBundleRuleForParent(parentType);
    if (!rule || parentPolicy.status === 'expired') return [];

    return policies
      .filter((p) =>
        (p.status === 'active' || p.status === 'expiring') &&
        rule.childTypes.has(String(p.policyType || '').trim().toLowerCase()) &&
        this.isBundledChildPolicy(p, policies) &&
        this.policyPeriodsOverlap(p, parentPolicy) &&
        this.policiesBelongToSameBundle(parentPolicy, p, rule)
      )
      .sort((a, b) =>
        new Date(b.effectiveDate || 0).getTime() - new Date(a.effectiveDate || 0).getTime()
      );
  }

  getBundledCoverageLabel(parentType: string): string {
    return this.getBundleRuleForParent(parentType)?.label ?? 'Included Coverage';
  }

  getBundledCostLabel(parentType: string): string {
    if (parentType === 'cargo') return 'In cargo policy';
    if (parentType === 'auto_liability') return 'In auto policy';
    if (parentType === 'physical_damage') return 'In physical damage policy';
    return 'Included';
  }

  private getBundleRuleForChild(childType: string): PolicyBundleRule | undefined {
    return POLICY_BUNDLE_RULES.find((rule) => rule.childTypes.has(childType));
  }

  private getBundleRuleForParent(parentType: string): PolicyBundleRule | undefined {
    return POLICY_BUNDLE_RULES.find((rule) => rule.parentType === parentType);
  }

  private policiesBelongToSameBundle(
    parent: InsuranceRow | any,
    child: InsuranceRow | any,
    rule: PolicyBundleRule
  ): boolean {
    const childNotes = String(child?.notes || '').toLowerCase();
    if (rule.parentType === 'cargo') {
      if (/covered in.*cargo|included in.*cargo|part of.*cargo/.test(childNotes)) return true;
      const parentNotes = String(parent?.notes || '').toLowerCase();
      if (/trailer interchange/.test(parentNotes)) return true;
      const zeroCost = child?.premiumCost != null && Number(child.premiumCost) === 0;
      if (zeroCost) return true;
      return false;
    }

    if (rule.parentType === 'auto_liability') {
      if (/covered in.*auto|included in.*auto|part of.*auto/.test(childNotes)) return true;
      const parentNumber = this.normalizePolicyNumber(parent?.policyNumber);
      const childNumber = this.normalizePolicyNumber(child?.policyNumber);
      if (parentNumber && childNumber && parentNumber === childNumber) return true;
    }

    if (rule.parentType === 'physical_damage') {
      if (/covered in.*physical|included in.*physical|part of.*physical/.test(childNotes)) return true;
      const parentNotes = String(parent?.notes || '').toLowerCase();
      if (/non[- ]?trucking/.test(parentNotes)) return true;
      const zeroCost = child?.premiumCost == null || Number(child.premiumCost) === 0;
      if (zeroCost && this.policyPeriodsOverlap(parent, child)) return true;
    }

    return false;
  }

  private normalizePolicyNumber(value: unknown): string {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  private getChargeablePolicies(): InsuranceRow[] {
    const policies: InsuranceRow[] = [];

    for (const group of this.groupedByType()) {
      const current = group.current;
      if (current.status !== 'active' && current.status !== 'expiring') continue;

      policies.push(current);
      for (const included of group.includedCoverages) {
        if (included.status !== 'active' && included.status !== 'expiring') continue;
        if (!this.shouldShowBundledChildInCharging(included)) continue;
        policies.push(included);
      }
    }

    return policies;
  }

  private shouldShowBundledChildInCharging(policy: InsuranceRow): boolean {
    return this.getPolicyCost(policy) > 0;
  }

  private appendChargingRowsForPolicy(
    policy: InsuranceRow,
    rows: ChargingRow[],
    enrollmentsByPolicy: Record<string, any[]>,
    activeDrivers: any[],
    sortOrder: number
  ): void {
    const meta = policy as any;
    const basis = this.resolveExpenseBasis(policy);
    const policyCost = this.getPolicyCost(policy);
    const deductible = Number(meta.perIncidentDeductible ?? 0);
    const frequency = this.resolveBillingFrequency(policy);
    const enrollments = enrollmentsByPolicy[String(policy.id)] || [];
    const isCompanyExpense = this.isCompanyExpensePolicy(policy.policyType);

    if (basis === 'per_driver') {
      const activeEnrollments = enrollments.filter((e: any) => e.status === 'active');

      if (!activeEnrollments.length) {
        const truckCount = this.countUniqueTruckBillingUnits(activeDrivers);
        rows.push({
          driverName: truckCount > 0
            ? `All Active Trucks (${truckCount})`
            : 'All Active Trucks',
          policyType: policy.policyType,
          providerName: policy.providerName,
          policyNumber: policy.policyNumber || '',
          expenseBasis: basis,
          billingFrequency: frequency,
          policyCost,
          chargeAmount: policyCost,
          perIncidentDeductible: deductible,
          enrollmentStatus: 'active',
          policyStatus: policy.status,
          sortOrder
        });
        return;
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
          policyStatus: policy.status,
          sortOrder
        });
      }
      return;
    }

    rows.push({
      driverName: isCompanyExpense ? 'Company Expense' : 'Company (Whole Policy)',
      policyType: policy.policyType,
      providerName: policy.providerName,
      policyNumber: policy.policyNumber || '',
      expenseBasis: basis,
      billingFrequency: frequency,
      policyCost,
      chargeAmount: policyCost,
      perIncidentDeductible: deductible,
      enrollmentStatus: isCompanyExpense ? 'company' : 'n/a',
      policyStatus: policy.status,
      sortOrder
    });
  }

  private policyPeriodsOverlap(a: InsuranceRow | any, b: InsuranceRow | any): boolean {
    const aStart = new Date(a?.effectiveDate || 0).getTime();
    const aEnd = new Date(a?.expiryDate || a?.effectiveDate || 0).getTime();
    const bStart = new Date(b?.effectiveDate || 0).getTime();
    const bEnd = new Date(b?.expiryDate || b?.effectiveDate || 0).getTime();
    return aStart <= bEnd && aEnd >= bStart;
  }

  resolveExpenseBasis(policy: InsuranceRow | any): string {
    if (this.isCompanyExpensePolicy(policy?.policyType)) return 'whole_policy';
    const basis = String(policy?.expenseBasis || 'whole_policy').trim().toLowerCase();
    return basis === 'per_driver' ? 'per_driver' : 'whole_policy';
  }

  resolveBillingFrequency(policy: InsuranceRow | any): string {
    const frequency = String(policy?.billingFrequency || 'monthly').trim().toLowerCase();
    return this.billingFrequencyOptions.some(o => o.value === frequency) ? frequency : 'monthly';
  }

  getPolicyExpenseBasisLabel(policy: InsuranceRow | any): string {
    return this.getExpenseBasisLabel(this.resolveExpenseBasis(policy));
  }

  getPolicyBillingFrequencyLabel(policy: InsuranceRow | any): string {
    return this.getBillingFrequencyLabel(this.resolveBillingFrequency(policy));
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

  getMatrixExpenseLabel(cell: 'driver_expense' | 'company_expense' | undefined): string {
    return cell === 'driver_expense' ? 'Driver Expense' : 'Company Expense';
  }

  getChargingPolicyTypeLabel(type: string): string {
    if (String(type || '').trim().toLowerCase() === 'physical_damage') {
      return 'Physical Damage/ NTL';
    }
    return this.getPolicyTypeLabel(type);
  }

  openAddPolicy(): void {
    this.editingPolicy.set(null);
    this.policyForm = {
      policyType: 'general_liability',
      providerName: '',
      policyNumber: '',
      coverageAmount: 0,
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
    if (!this.editingPolicy()) {
      fd.append('premiumCost', '0');
      fd.append('expenseBasis', 'whole_policy');
      fd.append('perIncidentDeductible', '0');
      fd.append('billingFrequency', 'monthly');
    }
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
