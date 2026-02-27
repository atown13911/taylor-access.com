import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventTrackingService } from '../../../core/services/event-tracking.service';
import { ConfirmService } from '../../../core/services/confirm.service';

type PageTab = 'insurance' | 'financial';

interface InsuranceRow {
  id: string;
  policyType: string;
  providerName: string;
  policyNumber: string;
  coverageAmount: number;
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
      },
      error: () => { this.policies.set([]); this.loadingPolicies.set(false); }
    });
  }

  getPolicyTypeLabel(type: string): string {
    return this.policyTypes.find(t => t.value === type)?.label || type;
  }

  openAddPolicy(): void {
    this.editingPolicy.set(null);
    this.policyForm = { policyType: 'general_liability', providerName: '', policyNumber: '', coverageAmount: 0, effectiveDate: '', expiryDate: '', notes: '', remind3Months: false, remind30Days: true, remind15Days: true, remindDayOf: true, remindDailyPastDue: true };
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

  formatCurrency(val: number): string {
    if (!val) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
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
        const methods = (res?.data || []).map((p: any) => p.paymentMethod);
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
