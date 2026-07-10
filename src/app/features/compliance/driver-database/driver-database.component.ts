import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-driver-database',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-database.component.html',
  styleUrls: ['./driver-database.component.scss']
})
export class DriverDatabaseComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private api = inject(VanTacApiService);
  private toast = inject(ToastService);
  private trailerApiUrl = `${environment.apiUrl}/api/v1/assets-proxy`;

  compUploadOpen = signal(false);
  compUploadItem = signal<any>(null);
  compSaving = signal(false);
  compFile: File | null = null;
  compForm = { documentName: '', documentNumber: '', issueDate: '', expiryDate: '', notes: '' };

  private readonly catMap: Record<string, string> = {
    cdl: 'cdl_endorsements', medical: 'medical', mvr: 'mvr', drug: 'drug_tests',
    dqf: 'dqf', employment: 'employment', training: 'training',
    insurance: 'insurance', vehicle: 'vehicle', permits: 'permits',
    ifta: 'ifta', irp: 'ifta', safety: 'safety', violations: 'violations',
    i9: 'i9', w9: 'w9', directDeposit: 'direct_deposit', deduction: 'deduction',
    contract: 'contracts'
  };
  private readonly subMap: Record<string, string> = {
    cdl: 'cdl_license', medical: 'medical_card', mvr: 'annual_mvr', drug: 'pre_employment',
    dqf: 'application', employment: 'offer_letter', training: 'entry_level_driver',
    insurance: 'certificate_of_insurance', vehicle: 'registration', permits: 'oversize',
    ifta: 'ifta_license', irp: 'irp_cab_card', safety: 'safe_driver', violations: 'moving_violation',
    i9: 'i9_form', w9: 'w9_form', directDeposit: 'direct_deposit_form', deduction: 'deduction_form',
    contract: 'driver_contract'
  };

  loading = signal(false);
  importingArchived = signal(false);
  drivers = signal<any[]>([]);
  selectedDriver = signal<any | null>(null);
  driverDocs = signal<any[]>([]);
  allDocs = signal<any[]>([]);
  totalDocumentCount = signal(0);
  loadingOnboardingApplicants = signal(false);
  showDetailsModal = signal(false);
  
  private onboardingApplicantsLoaded = false;
  private readonly complianceMatrixKeys = [
    'cdl', 'medical', 'mvr', 'drug', 'dqf', 'employment', 'training', 'insurance',
    'vehicle', 'permits', 'ifta', 'irp', 'safety', 'violations', 'contract',
    'i9', 'w9', 'directDeposit', 'deduction'
  ];
  private readonly complianceStatsKeys = [
    'cdl', 'medical', 'mvr', 'drug', 'dqf', 'employment', 'training',
    'insurance', 'vehicle', 'permits', 'ifta', 'safety', 'violations'
  ];
  // Filters
  searchTerm = '';
  statusFilter = 'all';
  complianceFilter = 'all';
  activeStatusTab = signal<'current' | 'onboarding' | 'closeout' | 'archived'>('current');

  filteredDrivers = computed(() => {
    let list = this.drivers();
    const tab = this.activeStatusTab();
    if (tab === 'current') list = list.filter((d: any) => this.isCurrentStatus(d.status));
    else if (tab === 'onboarding') list = list.filter((d: any) => this.isApplicantRow(d) && this.isOnboardingStatus(d.status));
    else if (tab === 'closeout') list = list.filter((d: any) => this.isCloseoutStatus(d.status));
    else if (tab === 'archived') list = list.filter((d: any) => this.isArchivedStatus(d.status));

    if (this.searchTerm) {
      const s = this.searchTerm.toLowerCase();
      list = list.filter((d: any) =>
        (d.name || '').toLowerCase().includes(s) ||
        (d.email || '').toLowerCase().includes(s) ||
        (d.phone || '').toLowerCase().includes(s) ||
        (d.licenseNumber || '').toLowerCase().includes(s)
      );
    }
    return list;
  });

  complianceStats = computed(() => {
    const drivers = this.filteredDrivers();
    const requiredItems = this.complianceStatsKeys;
    const totalSlots = drivers.length * requiredItems.length;

    let uploaded = 0, expiring = 0, expired = 0;

    for (const driver of drivers) {
      for (const item of requiredItems) {
        const status = driver._statusCache?.[item] ?? this.computeItemStatus(driver, item);
        if (status !== 'none') {
          uploaded++;
          if (status === 'expired') expired++;
          else if (status === 'expiring') expiring++;
        }
      }
    }

    const missing = totalSlots - uploaded;
    const compliant = uploaded - expiring - expired;

    return { compliant, expiring, expired, missing, uploaded, totalSlots, driverCount: drivers.length };
  });

  tabCounts = computed(() => {
    const all = this.drivers();
    return {
      current: all.filter((d: any) => this.isCurrentStatus(d.status)).length,
      onboarding: all.filter((d: any) => this.isApplicantRow(d) && this.isOnboardingStatus(d.status)).length,
      closeout: all.filter((d: any) => this.isCloseoutStatus(d.status)).length,
      archived: all.filter((d: any) => this.isArchivedStatus(d.status)).length
    };
  });
  
  // Detail tabs
  activeTab = signal<'overview' | 'compliance' | 'documents' | 'history' | 'equipment' | 'financial'>('overview');

  // Equipment data
  driverTrailers = signal<any[]>([]);

  // Financial data
  driverPayment = signal<any>(null);
  driverEnrollments = signal<any[]>([]);

  totalMonthlyDeductions = computed(() => {
    return this.driverEnrollments()
      .filter((e: any) => e.status === 'active' && e.deductionAmount)
      .reduce((sum: number, e: any) => {
        const amount = e.deductionAmount || 0;
        switch (e.deductionFrequency) {
          case 'weekly': return sum + (amount * 4.33);
          case 'biweekly': return sum + (amount * 2.17);
          case 'per_load': return sum + amount; // estimate as 1x/month
          default: return sum + amount; // monthly
        }
      }, 0);
  });
  
  docsReady = signal(false);

  ngOnInit() {
    // Load both in parallel, then attach docs to rows.
    this.refreshComplianceData();
    // Check for driverId query param to auto-open profile
    this.route.queryParams.subscribe(params => {
      const driverId = params['driverId'];
      if (driverId) {
        const driver = this.drivers().find((d: any) => d.id?.toString() === driverId.toString());
        if (driver) {
          this.viewDriverDetails(driver);
        } else {
          this.http.get(`${environment.apiUrl}/api/v1/drivers/${driverId}`).subscribe({
            next: (res: any) => { const d = res?.data || res; if (d) this.viewDriverDetails(d); }
          });
        }
      }
    });
  }

  refreshComplianceData(): void {
    this.loading.set(true);
    this.docsReady.set(false);
    this.onboardingApplicantsLoaded = false;
    this.loadComplianceBoard()
      .then(async () => {
        this.rebuildComplianceCaches();
        if (this.activeStatusTab() === 'onboarding') {
          await this.loadOnboardingApplicantsLazy();
        }
      })
      .finally(() => {
        this.loading.set(false);
        this.docsReady.set(true);
      });
  }

  setStatusTab(tab: 'current' | 'onboarding' | 'closeout' | 'archived'): void {
    this.activeStatusTab.set(tab);
    if (tab === 'onboarding') {
      void this.loadOnboardingApplicantsLazy();
    }
  }

  private async loadOnboardingApplicantsLazy(): Promise<void> {
    if (this.onboardingApplicantsLoaded || this.loadingOnboardingApplicants()) return;
    this.loadingOnboardingApplicants.set(true);
    try {
      await this.mergeOnboardingApplicants();
      this.onboardingApplicantsLoaded = true;
      this.rebuildComplianceCaches();
    } finally {
      this.loadingOnboardingApplicants.set(false);
    }
  }

  private async loadComplianceBoard(): Promise<void> {
    try {
      const res: any = await this.http
        .get(`${environment.apiUrl}/api/v1/drivers/compliance-board?limit=10000`)
        .toPromise();
      const payload = res?.data ?? res;
      const boardDrivers = Array.isArray(payload?.drivers) ? payload.drivers : [];

      this.totalDocumentCount.set(Number(res?.stats?.totalDocuments ?? 0));
      const normalizedDrivers = boardDrivers.map((driver: any) => ({
        ...driver,
        _docs: Array.isArray(driver?._docs) ? driver._docs : []
      }));
      this.drivers.set(this.deduplicateDrivers(normalizedDrivers));
      this.syncAllDocsFromDrivers(this.drivers());
    } catch (err) {
      console.error('Failed to load compliance board:', err);
      await this.loadComplianceBoardFallback();
    }
  }

  private async loadComplianceBoardFallback(): Promise<void> {
    await Promise.all([
      this.loadDrivers(),
      this.loadAllDocsAsync()
    ]);
    this.attachDocsToDrivers();
    this.syncAllDocsFromDrivers(this.drivers());
    this.rebuildComplianceCaches();
  }

  private async mergeOnboardingApplicants(): Promise<void> {
    const hiredApplicants = await this.loadHiredApplicants();
    if (!hiredApplicants.length) return;
    const linkedApplicants = this.linkOnboardingApplicants(this.drivers(), hiredApplicants);
    this.drivers.set(this.deduplicateDrivers([...this.drivers(), ...linkedApplicants]));
    this.attachDocsToDrivers();
    this.syncAllDocsFromDrivers(this.drivers());
  }

  private syncAllDocsFromDrivers(drivers: any[]): void {
    const map = new Map<number, any>();
    for (const driver of drivers) {
      for (const doc of driver?._docs || []) {
        if (doc?.id != null) map.set(doc.id, doc);
      }
    }
    this.allDocs.set(Array.from(map.values()));
    this.totalDocumentCount.set(this.allDocs().length);
  }

  private rebuildComplianceCaches(): void {
    this.drivers.update((rows) => rows.map((driver) => this.enrichDriverWithComplianceCache(driver)));
  }

  private enrichDriverWithComplianceCache(driver: any): any {
    const statusCache: Record<string, 'compliant' | 'expiring' | 'expired' | 'none'> = {};
    for (const key of this.complianceMatrixKeys) {
      statusCache[key] = this.computeItemStatus(driver, key);
    }

    const overallStatus = this.computeOverallStatusFromCache(statusCache);
    return {
      ...driver,
      _statusCache: statusCache,
      _overallStatus: overallStatus,
      _overallLabel: overallStatus === 'non-compliant' ? 'non' : overallStatus,
      _displayStatus: overallStatus === 'non-compliant'
        ? 'inactive'
        : (this.isActiveStatus(driver?.status) ? 'active' : 'inactive'),
      _otherStatus: this.computeOtherStatusFromCache(statusCache)
    };
  }

  private computeOverallStatusFromCache(
    statusCache: Record<string, 'compliant' | 'expiring' | 'expired' | 'none'>
  ): string {
    const redExceptionItems = new Set(['training', 'permits', 'irp']);
    let hasBlockingRed = false;
    let hasExpiring = false;
    let compliantCount = 0;

    for (const item of this.complianceMatrixKeys) {
      const status = statusCache[item] ?? 'none';
      const isRed = status === 'expired' || status === 'none';
      if (isRed && !redExceptionItems.has(item)) hasBlockingRed = true;
      if (status === 'expiring') hasExpiring = true;
      if (status === 'compliant') compliantCount++;
    }

    if (hasBlockingRed) return 'non-compliant';
    if (hasExpiring) return 'warning';
    if (compliantCount >= 5) return 'good';
    return 'pending';
  }

  private computeOtherStatusFromCache(
    statusCache: Record<string, 'compliant' | 'expiring' | 'expired' | 'none'>
  ): 'compliant' | 'expiring' | 'expired' | 'none' {
    const items = ['i9', 'w9', 'directDeposit', 'deduction'];
    let hasExpiring = false;
    let hasExpired = false;
    let hasMissing = false;

    for (const item of items) {
      const status = statusCache[item] ?? 'none';
      if (status === 'expired') hasExpired = true;
      else if (status === 'expiring') hasExpiring = true;
      else if (status === 'none') hasMissing = true;
    }

    if (hasExpired) return 'expired';
    if (hasExpiring) return 'expiring';
    if (hasMissing) return 'none';
    return 'compliant';
  }
  
  async loadDrivers() {
    this.loading.set(true);
    try {
      const [driversRes, applicantsRes] = await Promise.allSettled([
        this.fetchAllDrivers(),
        this.loadHiredApplicants()
      ]);

      const rawDrivers = driversRes.status === 'fulfilled'
        ? driversRes.value
        : [];
      const hiredApplicants = applicantsRes.status === 'fulfilled'
        ? applicantsRes.value
        : [];
      const linkedOnboardingApplicants = this.linkOnboardingApplicants(rawDrivers, hiredApplicants);

      this.drivers.set(this.deduplicateDrivers([...rawDrivers, ...linkedOnboardingApplicants]));
    } catch (err) {
      console.error('Failed to load drivers:', err);
      this.drivers.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchAllDrivers(): Promise<any[]> {
    const limit = 2000;
    let page = 1;
    let totalPages = 1;
    const all: any[] = [];

    while (page <= totalPages) {
      const res: any = await this.http
        .get(`${environment.apiUrl}/api/v1/drivers?limit=${limit}&page=${page}`)
        .toPromise();
      const batch = Array.isArray(res?.data) ? res.data : [];
      all.push(...batch);
      totalPages = Number(res?.totalPages || 1);
      if (!batch.length) break;
      page += 1;
    }

    return all;
  }

  private async loadHiredApplicants(): Promise<any[]> {
    try {
      const [recordsResponse, positionsResponse] = await Promise.all([
        this.http.get(`${environment.apiUrl}/api/v1/applicants/records?includeCv=false`).toPromise(),
        this.http.get(`${environment.apiUrl}/api/v1/applicants/positions`).toPromise()
      ]);

      const rows = Array.isArray((recordsResponse as any)?.data) ? (recordsResponse as any).data : [];
      const positions = Array.isArray((positionsResponse as any)?.data) ? (positionsResponse as any).data : [];
      const fleetActivePositionKeys = new Set<string>(
        positions
          .filter((p: any) => String(p?.group ?? '').trim().toLowerCase() === 'fleet' && p?.isActive !== false)
          .map((p: any) => String(p?.name ?? '').trim().toLowerCase())
          .filter((value: string) => !!value)
      );

      return rows
        .filter((row: any) =>
          this.isApplicantHired(row?.status ?? row?.Status ?? row?.applicationStatus ?? row?.ApplicationStatus) &&
          !this.isApplicantHistorical(row) &&
          this.isFleetHiringApplicant(row, fleetActivePositionKeys)
        )
        .map((row: any) => this.mapApplicantToComplianceDriver(row));
    } catch {
      return [];
    }
  }

  private isFleetHiringApplicant(row: any, fleetActivePositionKeys: Set<string>): boolean {
    const positionKey = String(
      row?.position ??
      row?.Position ??
      row?.positionName ??
      row?.jobTitle ??
      row?.role ??
      row?.appliedFor ??
      ''
    ).trim().toLowerCase();

    if (fleetActivePositionKeys.size > 0) {
      return !!positionKey && fleetActivePositionKeys.has(positionKey);
    }

    // Fallback to legacy heuristics if positions endpoint is unavailable.
    return this.isDriverApplicant(row);
  }

  private isApplicantHired(status: unknown): boolean {
    const normalized = String(status ?? '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
    return normalized === 'hired' || normalized.startsWith('hired ');
  }

  private isApplicantHistorical(row: any): boolean {
    const historicalFlag = row?.isHistorical ?? row?.IsHistorical ?? row?.is_historical ?? row?.historical;
    if (historicalFlag === true) return true;
    if (historicalFlag === false || historicalFlag == null) return false;
    const text = String(historicalFlag).trim().toLowerCase();
    return text === 'true' || text === '1' || text === 'yes';
  }

  private isDriverApplicant(row: any): boolean {
    const position = String(
      row?.position ??
      row?.Position ??
      row?.positionName ??
      row?.jobTitle ??
      row?.role ??
      row?.appliedFor ??
      ''
    ).trim().toLowerCase();

    // Many hired records arrive without a populated position; keep them visible in onboarding.
    if (!position) return true;

    const nonDriverIndicators = [
      'dispatcher',
      'recruiter',
      'accounting',
      'payroll',
      'hr',
      'human resources',
      'admin',
      'office',
      'safety manager'
    ];
    if (nonDriverIndicators.some((token) => position.includes(token))) return false;

    // For hired onboarding visibility, treat unknown/misc position text as eligible.
    // We only exclude explicit non-driver role titles above.
    return true;
  }

  private mapApplicantToComplianceDriver(applicant: any): any {
    const id = String(applicant?.id ?? applicant?.Id ?? '').trim();
    const firstName = String(applicant?.firstName ?? applicant?.FirstName ?? applicant?.first_name ?? '').trim();
    const lastName = String(applicant?.lastName ?? applicant?.LastName ?? applicant?.last_name ?? '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const name = fullName
      || String(applicant?.name ?? applicant?.Name ?? applicant?.applicantName ?? applicant?.fullName ?? applicant?.FullName ?? 'Applicant').trim();

    return {
      id: id ? `applicant-${id}` : `applicant-${Math.random().toString(36).slice(2, 10)}`,
      _source: 'applicant',
      name,
      email: String(applicant?.email ?? applicant?.Email ?? '').trim(),
      phone: String(applicant?.phone ?? applicant?.Phone ?? applicant?.phoneNumber ?? applicant?.PhoneNumber ?? '').trim(),
      licenseNumber: String(applicant?.licenseNumber ?? applicant?.LicenseNumber ?? applicant?.cdlNumber ?? applicant?.CdlNumber ?? '').trim(),
      licenseExpiry: String(applicant?.licenseExpiry ?? applicant?.LicenseExpiry ?? applicant?.cdlExpiry ?? applicant?.CdlExpiry ?? '').trim(),
      status: 'onboarding',
      createdAt: applicant?.createdAt ?? applicant?.CreatedAt ?? applicant?.appliedDate ?? applicant?.AppliedDate ?? applicant?.appliedAt ?? null,
      updatedAt: applicant?.updatedAt ?? applicant?.UpdatedAt ?? applicant?.modifiedAt ?? applicant?.ModifiedAt ?? null
    };
  }

  importDrayTacArchived(): void {
    if (this.importingArchived()) return;
    this.importingArchived.set(true);
    this.http.post<any>(`${environment.apiUrl}/api/v1/drivers/import-draytac-archived`, {
      limit: 5000,
      forceArchive: true
    }).subscribe({
      next: (res: any) => {
        const created = res?.created ?? 0;
        const updated = res?.updated ?? 0;
        const fetched = res?.fetched ?? 0;
        this.toast.success(`Imported ${fetched} DrayTac drivers to archived (${created} new, ${updated} updated).`, 'Import Complete');
        this.activeStatusTab.set('archived');
        this.refreshComplianceData();
        this.importingArchived.set(false);
      },
      error: (err: any) => {
        const msg = err?.error?.error || err?.error?.message || 'Failed to import archived drivers from DrayTac.';
        this.toast.error(msg, 'Import Failed');
        this.importingArchived.set(false);
      }
    });
  }
  
  getComplianceStatus(driver: any): 'compliant' | 'warning' | 'non-compliant' {
    // TODO: Implement actual compliance checking logic
    // Check: CDL expiration, medical cert, DQF completeness, drug test status
    return 'compliant';
  }
  
  getComplianceScore(driver: any): number {
    // TODO: Calculate actual compliance score (0-100)
    return 85;
  }
  
  viewDriverDetails(driver: any) {
    this.selectedDriver.set(driver);
    this.showDetailsModal.set(true);
    this.activeTab.set('overview');
  }
  
  closeDriverDetails() {
    this.selectedDriver.set(null);
    this.showDetailsModal.set(false);
  }
  
  setActiveTab(tab: 'overview' | 'compliance' | 'documents' | 'history' | 'equipment' | 'financial') {
    this.activeTab.set(tab);
  }

  async loadDriverEquipment() {
    const driver = this.selectedDriver();
    if (!driver) return;
    try {
      const proxied: any = await this.http.get(`${environment.apiUrl}/api/v1/assets-proxy/trailers?limit=1000`).toPromise();
      const allTrailers = proxied?.data || [];
      const assigned = allTrailers.filter((t: any) => {
        const ownerName = String(t?.ownerName || '').trim().toLowerCase();
        const driverName = String(driver?.name || '').trim().toLowerCase();
        const hasDriverAssignment = Array.isArray(t?.driverAssignments)
          && t.driverAssignments.some((a: any) => `${a?.driverId ?? ''}` === `${driver?.id ?? ''}` && String(a?.status || '').toLowerCase() === 'active');
        return (!!driverName && ownerName === driverName) || hasDriverAssignment;
      });
      this.driverTrailers.set(assigned);
      return;
    } catch (err: any) {
      const status = Number(err?.status || 0);
      // If proxy exists but upstream failed, avoid browser-side direct fallback
      // that triggers CORS errors and noisy console logs.
      if (status !== 404 && status !== 401 && status !== 403) {
        this.driverTrailers.set([]);
        return;
      }
      // Proxy unavailable or upstream auth mismatch (401/403): continue with legacy fallback.
    }
    try {
      const response: any = await this.http.get(`${this.trailerApiUrl}/equipment?equipmentType=trailer&limit=1000`).toPromise();
      const allTrailers = response?.data || [];
      const assigned = allTrailers.filter((t: any) => {
        const ownerName = String(t?.ownerName || '').trim().toLowerCase();
        const driverName = String(driver?.name || '').trim().toLowerCase();
        return !!driverName && ownerName === driverName;
      });
      this.driverTrailers.set(assigned);
    } catch (err: any) {
      if (![400, 404].includes(Number(err?.status || 0))) {
        this.driverTrailers.set([]);
        return;
      }
      try {
        const response: any = await this.http.get(`${this.trailerApiUrl}/trailers?limit=1000`).toPromise();
        const allTrailers = response?.data || [];
        const assigned = allTrailers.filter((t: any) =>
          t.driverAssignments?.some((a: any) => a.driverId === driver.id && a.status === 'active')
        );
        this.driverTrailers.set(assigned);
      } catch {
        this.driverTrailers.set([]);
      }
    }
  }

  loadDriverFinancial(): void {
    const driver = this.selectedDriver();
    if (!driver) return;
    
    // Load payment method for this driver
    this.api.getDriverPayments({ driverId: driver.id }).subscribe({
      next: (res: any) => {
        const payments = res?.data || [];
        this.driverPayment.set(payments.length > 0 ? payments[0] : null);
      },
      error: () => this.driverPayment.set(null)
    });

    // Load insurance enrollments for this driver
    this.api.getInsurancePolicies().subscribe({
      next: (res: any) => {
        const policies = res?.data || [];
        const allEnrollments: any[] = [];
        let loaded = 0;
        if (policies.length === 0) {
          this.driverEnrollments.set([]);
          return;
        }
        for (const policy of policies) {
          this.api.getInsuranceEnrollments(policy.id.toString()).subscribe({
            next: (eRes: any) => {
              const enrollments = (eRes?.data || [])
                .filter((e: any) => e.driverId?.toString() === driver.id?.toString())
                .map((e: any) => ({
                  ...e,
                  policyType: this.getPolicyTypeLabel(policy.policyType),
                  providerName: policy.providerName
                }));
              allEnrollments.push(...enrollments);
              loaded++;
              if (loaded === policies.length) {
                this.driverEnrollments.set(allEnrollments);
              }
            },
            error: () => {
              loaded++;
              if (loaded === policies.length) {
                this.driverEnrollments.set(allEnrollments);
              }
            }
          });
        }
      },
      error: () => this.driverEnrollments.set([])
    });
  }

  // ========== PAYMENT EDITOR ==========
  showPaymentEditor = signal(false);
  savingPaymentEdit = signal(false);
  paymentEditForm = {
    paymentMethod: '', bankName: '', routingNumber: '', accountNumber: '',
    accountType: 'checking', cardType: '', cardLastFour: '', cardHolderName: '',
    mailingAddress: ''
  };

  openPaymentEditor(): void {
    const p = this.driverPayment();
    if (p) {
      this.paymentEditForm = {
        paymentMethod: p.paymentMethod || '',
        bankName: p.bankName || '', routingNumber: p.routingNumber || '',
        accountNumber: p.accountNumber || '', accountType: p.accountType || 'checking',
        cardType: p.cardType || '', cardLastFour: p.cardLastFour || '',
        cardHolderName: p.cardHolderName || '', mailingAddress: p.mailingAddress || ''
      };
    } else {
      this.paymentEditForm = {
        paymentMethod: 'direct_deposit', bankName: '', routingNumber: '',
        accountNumber: '', accountType: 'checking', cardType: '',
        cardLastFour: '', cardHolderName: '', mailingAddress: ''
      };
    }
    this.showPaymentEditor.set(true);
  }

  closePaymentEditor(): void { this.showPaymentEditor.set(false); }

  onPaymentMethodEditChange(): void {
    const m = this.paymentEditForm.paymentMethod;
    if (m && m !== 'direct_deposit' && m !== 'paper_check') {
      this.paymentEditForm.cardType = m;
    }
  }

  savePaymentEdit(): void {
    this.savingPaymentEdit.set(true);
    const driver = this.selectedDriver();
    const existing = this.driverPayment();
    const payload = { ...this.paymentEditForm, driverId: driver?.id, status: 'active' };

    const obs = existing
      ? this.api.updateDriverPayment(existing.id.toString(), payload)
      : this.api.createDriverPayment(payload);

    obs.subscribe({
      next: () => {
        this.savingPaymentEdit.set(false);
        this.closePaymentEditor();
        this.loadDriverFinancial();
      },
      error: () => this.savingPaymentEdit.set(false)
    });
  }

  // ========== ENROLLMENT EDITOR ==========
  showEnrollmentEditor = signal(false);

  openEnrollmentEditor(): void { this.showEnrollmentEditor.set(true); }
  closeEnrollmentEditor(): void { this.showEnrollmentEditor.set(false); }

  saveEnrollmentEdit(enrollment: any): void {
    // Find the policy ID from enrollment data
    this.api.getInsurancePolicies().subscribe({
      next: (res: any) => {
        const policies = res?.data || [];
        // Find matching policy by type
        for (const policy of policies) {
          this.api.getInsuranceEnrollments(policy.id.toString()).subscribe({
            next: (eRes: any) => {
              const match = (eRes?.data || []).find((e: any) => e.id === enrollment.id);
              if (match) {
                this.api.updateInsuranceEnrollment(policy.id.toString(), enrollment.id.toString(), {
                  coverageLevel: enrollment.coverageLevel,
                  deductionAmount: enrollment.deductionAmount,
                  deductionFrequency: enrollment.deductionFrequency,
                  status: enrollment.status
                }).subscribe({
                  next: () => this.loadDriverFinancial()
                });
              }
            }
          });
        }
      }
    });
  }

  getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      direct_deposit: 'Direct Deposit', comdata: 'Comdata', efs: 'EFS',
      wex: 'WEX / Fleet One', tchek: 'T-Chek', rts: 'RTS',
      stripe: 'Stripe', paper_check: 'Paper Check'
    };
    return labels[method] || method;
  }

  getPolicyTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      general_liability: 'General Liability', auto_liability: 'Auto Liability',
      cargo: 'Cargo', workers_comp: 'Workers Comp', mcs90: 'MCS-90',
      umbrella: 'Umbrella', physical_damage: 'Physical Damage',
      bobtail: 'Bobtail', non_trucking: 'Non-Trucking Liability',
      occupational_accident: 'Occupational Accident', supplemental: 'Supplemental',
      trailer_interchange: 'Trailer Interchange'
    };
    return labels[type] || type;
  }
  
  getDaysUntilExpiration(date: string): number {
    if (!date) return 999;
    const exp = new Date(date);
    const now = new Date();
    const diff = exp.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
  
  getExpirationStatus(date: string): 'compliant' | 'expiring' | 'expired' {
    const days = this.getDaysUntilExpiration(date);
    if (days < 0) return 'expired';
    if (days < 30) return 'expiring';
    return 'compliant';
  }

  formatDate(dateString: string): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  isExpiringSoon(dateString: string): boolean {
    if (!dateString) return false;
    const days = this.getDaysUntilExpiration(dateString);
    return days > 0 && days <= 90;
  }

  isExpired(dateString: string): boolean {
    if (!dateString) return false;
    return this.getDaysUntilExpiration(dateString) < 0;
  }

  complianceItems = [
    { key: 'cdl', label: 'CDL / License' }, { key: 'medical', label: 'Medical Certificate' },
    { key: 'mvr', label: 'Motor Vehicle Record' }, { key: 'drug', label: 'Drug & Alcohol Test' },
    { key: 'dqf', label: 'Employment Application' }, { key: 'employment', label: 'Employment Verification' },
    { key: 'training', label: 'Training' }, { key: 'insurance', label: 'Insurance' },
    { key: 'vehicle', label: 'Vehicle Docs' }, { key: 'permits', label: 'Permits' },
    { key: 'ifta', label: 'IFTA' }, { key: 'irp', label: 'IRP' },
    { key: 'safety', label: 'Safety' },
    { key: 'violations', label: 'Violations' }, { key: 'contract', label: 'Contract' },
    { key: 'i9', label: 'I-9' }, { key: 'w9', label: 'W-9' },
    { key: 'directDeposit', label: 'Direct Deposit' }, { key: 'deduction', label: 'Deduction' }
  ];
  private readonly onboardingPaperworkKeys = [
    'cdl',
    'medical',
    'mvr',
    'drug',
    'dqf',
    'employment',
    'contract',
    'i9',
    'w9',
    'directDeposit',
    'deduction'
  ];

  selectDriver(driver: any) {
    if (this.selectedDriver()?.id === driver.id) {
      this.selectedDriver.set(null);
      this.driverDocs.set([]);
    } else {
      this.selectedDriver.set(driver);
      this.driverDocs.set(Array.isArray(driver?._docs) ? [...driver._docs] : []);
      this.loadDriverDocs(driver.id);
      if (this.isApiDriverId(driver.id)) {
        this.loadDriverDetails(driver.id);
      }
    }
  }

  loadAllDocs(): void {
    this.http.get<any>(`${environment.apiUrl}/api/v1/driver-documents?limit=10000`).subscribe({
      next: (res: any) => this.allDocs.set(res?.data || []),
      error: () => this.allDocs.set([])
    });
  }

  loadAllDocsAsync(): Promise<void> {
    return this.http.get<any>(`${environment.apiUrl}/api/v1/driver-documents?limit=10000`)
      .toPromise()
      .then((res: any) => { this.allDocs.set(res?.data || []); })
      .catch(() => { this.allDocs.set([]); });
  }

  loadDriverDocs(driverId: any): void {
    const selected = this.selectedDriver();
    const aliasIds = new Set<string>(
      (`${selected?.id ?? ''}` === `${driverId ?? ''}`
        ? (selected?._aliasDriverIds || [selected?.id])
        : [driverId]
      )
      .map((id: any) => String(id ?? '').trim())
      .filter((id: string) => !!id)
    );
    if (!aliasIds.size) aliasIds.add(String(driverId ?? '').trim());

    const filtered = this.allDocs().filter(d => aliasIds.has(String(d.driverId ?? '').trim()));
    this.driverDocs.set(filtered);
    const apiAliasIds = Array.from(aliasIds).filter((id: string) => this.isApiDriverId(id));
    if (!apiAliasIds.length) {
      this.updateDriverDocsInState(driverId, filtered);
      return;
    }

    Promise.all(apiAliasIds.map((id: string) =>
      this.api.getDriverDocuments(id).toPromise().then((res: any) => res?.data || []).catch(() => [])
    )).then((docLists: any[]) => {
      const docs = this.mergeDocs(...docLists, filtered);
      this.updateDriverDocsInState(driverId, docs);
      if (`${this.selectedDriver()?.id ?? ''}` === `${driverId ?? ''}`) {
        this.driverDocs.set(docs);
      }
    }).catch(() => {
      if (`${this.selectedDriver()?.id ?? ''}` === `${driverId ?? ''}`) {
        this.driverDocs.set(filtered);
      }
    });
  }

  private loadDriverDetails(driverId: any): void {
    this.http.get<any>(`${environment.apiUrl}/api/v1/drivers/${driverId}`).subscribe({
      next: (res: any) => {
        const full = res?.data || res;
        if (!full) return;
        const merged = { ...(this.selectedDriver() || {}), ...full };
        if (`${merged?.id ?? ''}` === `${this.selectedDriver()?.id ?? ''}`) {
          this.selectedDriver.set(merged);
        }
        this.drivers.update((rows: any[]) => rows.map((d: any) => (`${d?.id ?? ''}` === `${merged?.id ?? ''}` ? { ...d, ...full } : d)));
      },
      error: () => {
        // Keep current selected row when detail fetch fails.
      }
    });
  }

  private updateDriverDocsInState(driverId: any, docs: any[]): void {
    const id = `${driverId ?? ''}`;
    this.drivers.update((rows: any[]) =>
      rows.map((d: any) => (`${d?.id ?? ''}` === id ? { ...d, _docs: docs } : d))
    );
  }

  private mergeDocs(...docSets: any[][]): any[] {
    const map = new Map<string, any>();
    for (const set of docSets) {
      for (const doc of set || []) {
        const key = String(doc?.id ?? `${doc?.driverId ?? ''}|${doc?.category ?? ''}|${doc?.subCategory ?? ''}|${doc?.documentName ?? ''}`).trim();
        if (!key) continue;
        const prev = map.get(key);
        if (!prev) {
          map.set(key, doc);
          continue;
        }
        const prevTs = new Date(prev?.updatedAt || prev?.createdAt || 0).getTime();
        const nextTs = new Date(doc?.updatedAt || doc?.createdAt || 0).getTime();
        if (nextTs >= prevTs) map.set(key, doc);
      }
    }
    return Array.from(map.values());
  }

  getCompDoc(driver: any, key: string): any {
    const rowDocs = Array.isArray(driver?._docs) ? driver._docs : [];
    const docs = this.driverDocs().length > 0 ? this.driverDocs() : rowDocs;
    if (docs.length === 0) return null;
    return this.findDocInList(docs, key);
  }

  viewCompDoc(item: any): void {
    const doc = this.getCompDoc(this.selectedDriver(), item.key);
    if (doc?.id) {
      this.api.downloadDriverDocumentFile(doc.id).subscribe({
        next: (blob: Blob) => window.open(URL.createObjectURL(blob), '_blank'),
        error: () => this.toast.error('Failed to load document', 'Error')
      });
    }
  }

  suspendDriver(driver: any) {
    this.http.put(`${environment.apiUrl}/api/v1/drivers/${driver.id}`, { status: 'suspended' }).subscribe({
      next: () => { driver.status = 'suspended'; this.drivers.set([...this.drivers()]); },
      error: () => {}
    });
  }

  reactivateDriver(driver: any) {
    this.http.put(`${environment.apiUrl}/api/v1/drivers/${driver.id}`, { status: 'active' }).subscribe({
      next: () => { driver.status = 'active'; this.drivers.set([...this.drivers()]); },
      error: () => {}
    });
  }

  archiveDriver(driver: any) {
    this.http.put(`${environment.apiUrl}/api/v1/drivers/${driver.id}`, { status: 'archived' }).subscribe({
      next: () => { driver.status = 'archived'; this.drivers.set([...this.drivers()]); },
      error: () => {}
    });
  }

  canSuspendDriver(driver: any): boolean {
    return !this.isApplicantRow(driver) && this.isActiveStatus(driver?.status);
  }

  canArchiveDriver(driver: any): boolean {
    return !this.isApplicantRow(driver) &&
      this.activeStatusTab() === 'closeout' &&
      this.isCloseoutStatus(driver?.status) &&
      !this.isArchivedStatus(driver?.status);
  }

  canReactivateDriver(driver: any): boolean {
    return !this.isApplicantRow(driver) &&
      this.isCloseoutStatus(driver?.status) &&
      !this.isArchivedStatus(driver?.status);
  }

  canUploadOnboardingPaperwork(driver: any): boolean {
    return this.isOnboardingStatus(driver?.status);
  }

  canActivateOnboardingDriver(driver: any): boolean {
    if (!this.canUploadOnboardingPaperwork(driver)) return false;
    if (!this.resolveApiDriverId(driver)) return false;
    return this.getMissingOnboardingPaperworkItems(driver).length === 0;
  }

  getOnboardingChecklistTooltip(driver: any): string {
    const missing = this.getMissingOnboardingPaperworkItems(driver);
    if (!missing.length) return 'All onboarding paperwork uploaded. Ready to move to active.';
    const labels = missing.map((item: any) => item.label);
    return `Missing (${missing.length}): ${labels.join(', ')}`;
  }

  showOnboardingChecklist(driver: any): void {
    const missing = this.getMissingOnboardingPaperworkItems(driver).map((item: any) => item.label);
    if (!missing.length) {
      this.toast.success('All required onboarding paperwork is uploaded.', 'Checklist complete');
      return;
    }
    this.toast.error(`Missing paperwork: ${missing.join(', ')}`, 'Checklist');
  }

  openOnboardingUpload(driver: any): void {
    const nextItem = this.getMissingOnboardingPaperworkItems(driver)[0] ?? this.complianceItems[0];
    if (!nextItem) {
      this.toast.error('No compliance item available for upload.', 'Unavailable');
      return;
    }

    this.ensureSelectedDriverForCompliance(driver);
    this.openCompUpload(nextItem);
  }

  activateOnboardingDriver(driver: any): void {
    if (!this.canActivateOnboardingDriver(driver)) {
      const missing = this.getMissingOnboardingPaperworkItems(driver).map((item: any) => item.label);
      if (missing.length > 0) {
        this.toast.error(`Missing paperwork: ${missing.join(', ')}`, 'Cannot activate');
      } else {
        this.toast.error('Driver record is not ready for activation.', 'Cannot activate');
      }
      return;
    }

    const apiDriverId = this.resolveApiDriverId(driver);
    if (!apiDriverId) {
      this.toast.error('Missing numeric Driver ID for activation.', 'Cannot activate');
      return;
    }

    this.http.put(`${environment.apiUrl}/api/v1/drivers/${apiDriverId}`, { status: 'active' }).subscribe({
      next: () => {
        this.toast.success(`${driver?.name || 'Driver'} moved to active.`, 'Driver activated');
        this.drivers.update((rows: any[]) =>
          rows.map((row: any) => {
            const sameRow = `${row?.id ?? ''}` === `${driver?.id ?? ''}`;
            const linkedAlias = Array.isArray(row?._aliasDriverIds)
              && row._aliasDriverIds.some((id: any) => `${id ?? ''}` === `${apiDriverId}`);
            if (!sameRow && !linkedAlias) return row;
            return { ...row, status: 'active' };
          })
        );
        if (`${this.selectedDriver()?.id ?? ''}` === `${driver?.id ?? ''}`) {
          this.selectedDriver.set({ ...(this.selectedDriver() || {}), status: 'active' });
        }
      },
      error: () => {
        this.toast.error('Failed to activate driver.', 'Activation failed');
      }
    });
  }

  isApplicantRow(driver: any): boolean {
    if (!driver) return false;
    if (String(driver?._source ?? '').trim().toLowerCase() === 'applicant') return true;
    return String(driver?.id ?? '').trim().startsWith('applicant-');
  }

  private normalizeStatus(status: any): string {
    const normalized = String(status ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/_/g, '-');
    return normalized || 'active';
  }

  private isArchivedStatus(status: any): boolean {
    return this.normalizeStatus(status) === 'archived';
  }

  private isOnboardingStatus(status: any): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'onboarding' ||
      normalized === 'hired' ||
      normalized === 'new-hire' ||
      normalized === 'newhire' ||
      normalized === 'pending' ||
      normalized === 'invited' ||
      normalized === 'application' ||
      normalized === 'applicant' ||
      normalized === 'orientation' ||
      normalized === 'recruiting' ||
      normalized === 'pre-hire' ||
      normalized === 'prehire' ||
      normalized === 'background-check' ||
      normalized === 'training';
  }

  private isCloseoutStatus(status: any): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'inactive' ||
      normalized === 'on-leave' ||
      normalized === 'off-duty' ||
      normalized === 'sleeper' ||
      normalized === 'vacation' ||
      normalized === 'suspended' ||
      normalized === 'terminated' ||
      normalized === 'deactivated' ||
      normalized === 'disabled';
  }

  private isCurrentStatus(status: any): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'active' ||
      normalized === 'available' ||
      normalized === 'online' ||
      normalized === 'dispatched' ||
      normalized === 'en-route' ||
      normalized === 'at-location';
  }

  private isActiveStatus(status: any): boolean {
    return this.isCurrentStatus(status);
  }

  private isInactiveStatus(status: any): boolean {
    return this.isCloseoutStatus(status);
  }

  getComplianceClass(driver: any, item: string): string {
    const status = this.getItemStatus(driver, item);
    if (status === 'compliant') return 'dot dot-green';
    if (status === 'expiring')  return 'dot dot-yellow';
    if (status === 'expired')   return 'dot dot-red';
    // Missing/not-on-file documents should be visually critical in this grid.
    return 'dot dot-red';
  }

  getOtherStatus(driver: any): 'compliant' | 'expiring' | 'expired' | 'none' {
    if (driver?._otherStatus) return driver._otherStatus;
    const items = ['i9', 'w9', 'directDeposit', 'deduction'];
    let hasExpiring = false;
    let hasExpired = false;
    let hasMissing = false;

    for (const item of items) {
      const status = this.getItemStatus(driver, item);
      if (status === 'expired') hasExpired = true;
      else if (status === 'expiring') hasExpiring = true;
      else if (status === 'none') hasMissing = true;
    }

    if (hasExpired) return 'expired';
    if (hasExpiring) return 'expiring';
    if (hasMissing) return 'none';
    return 'compliant';
  }

  getOtherComplianceClass(driver: any): string {
    const status = this.getOtherStatus(driver);
    if (status === 'compliant') return 'dot dot-green';
    if (status === 'expiring') return 'dot dot-yellow';
    return 'dot dot-red';
  }

  getOtherComplianceTooltip(driver: any): string {
    const labels: Record<string, string> = {
      compliant: 'Compliant',
      expiring: 'Expiring Soon',
      expired: 'Expired',
      none: 'Not on File'
    };
    return `Other (I-9, W-9, Direct Deposit, Deduction): ${labels[this.getOtherStatus(driver)]}`;
  }

  attachDocsToDrivers(): void {
    const drivers = this.drivers();
    const allDocs = this.allDocs();

    const docsByDriver = new Map<string, any[]>();
    for (const doc of allDocs) {
      const key = doc.driverId?.toString();
      if (!key) continue;
      if (!docsByDriver.has(key)) docsByDriver.set(key, []);
      docsByDriver.get(key)!.push(doc);
    }

    for (const driver of drivers) {
      const docsForDriver: any[] = [];
      for (const id of this.getDriverIdKeys(driver)) {
        const bucket = docsByDriver.get(id);
        if (bucket?.length) docsForDriver.push(...bucket);
      }
      driver._docs = this.mergeDocs(docsForDriver, Array.isArray(driver._docs) ? driver._docs : []);
    }

    this.drivers.set([...drivers]);
    this.rebuildComplianceCaches();
  }

  private findDocInList(docs: any[], key: string): any {
    if (!docs || docs.length === 0) return null;

    const sub = this.subMap[key];
    const cat = this.catMap[key];

    // 1. Primary subCategory match
    if (sub) {
      const doc = docs.find((d: any) => d.subCategory === sub);
      if (doc) return doc;
    }

    // 2. Any doc in the right category — return the most recent one
    if (cat) {
      const catDocs = docs.filter((d: any) => d.category === cat);
      if (catDocs.length > 0) {
        // Prefer active/non-expired, then most recently created
        return catDocs.sort((a: any, b: any) => {
          const aExp = a.status === 'expired' ? 1 : 0;
          const bExp = b.status === 'expired' ? 1 : 0;
          if (aExp !== bExp) return aExp - bExp;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        })[0];
      }
    }

    // 3. Fuzzy keyword search across document name / subCategory / category
    const terms = this.docSearchTerms[key] || [key];
    return docs.find((d: any) => {
      const haystack = ((d.documentName || '') + ' ' + (d.subCategory || '') + ' ' + (d.category || '')).toLowerCase();
      return terms.some((t: string) => haystack.includes(t));
    }) || null;
  }

  private readonly docSearchTerms: Record<string, string[]> = {
    cdl: ['cdl', 'license', 'cdl_license', 'cdl_endorsements'],
    medical: ['medical', 'dot physical', 'medical_card', 'med cert', 'medical certificate'],
    mvr: ['mvr', 'motor vehicle', 'annual_mvr', 'driving record'],
    drug: ['drug', 'alcohol', 'drug_test', 'pre_employment', 'drug_tests', 'substance'],
    dqf: ['dqf', 'qualification', 'driver qualification', 'application'],
    employment: ['employment', 'verification', 'offer_letter', 'hire', 'employment_verification'],
    training: ['training', 'entry_level', 'orientation', 'entry_level_driver'],
    insurance: ['insurance', 'certificate_of_insurance', 'liability', 'policy'],
    vehicle: ['vehicle', 'registration', 'inspection', 'truck'],
    permits: ['permit', 'twic', 'oversize', 'hazmat'],
    ifta: ['ifta', 'irp', 'fuel tax'],
    safety: ['safety', 'award', 'safe_driver'],
    violations: ['violation', 'accident', 'incident', 'moving_violation'],
    irp: ['irp', 'cab card', 'irp_cab_card', 'cab_card', 'registration plate', 'apportioned'],
    i9: ['i-9', 'i9', 'i9_form', 'eligibility'],
    w9: ['w-9', 'w9', 'w9_form', 'tax'],
    directDeposit: ['direct deposit', 'direct_deposit', 'direct_deposit_form', 'bank'],
    deduction: ['deduction', 'deduction_form', 'payroll deduction'],
    contract: ['contract', 'driver_contract', 'contracts', 'agreement', 'lease agreement', 'owner operator']
  };

  getComplianceTooltip(driver: any, item: string): string {
    const labels: any = {
      cdl: 'CDL / License', medical: 'Medical Certificate', mvr: 'Motor Vehicle Record',
      drug: 'Drug & Alcohol Test', dqf: 'Employment Application', employment: 'Employment Verification',
      training: 'Training', insurance: 'Insurance', vehicle: 'Vehicle Docs',
      permits: 'Permits', ifta: 'IFTA', safety: 'Safety', violations: 'Violations',
      contract: 'Contract', irp: 'IRP / Cab Card',
      i9: 'I-9', w9: 'W-9', directDeposit: 'Direct Deposit', deduction: 'Deduction'
    };
    const status = this.getItemStatus(driver, item);
    const statusLabel = status === 'compliant' ? 'Compliant' : status === 'expiring' ? 'Expiring Soon' : status === 'expired' ? 'Expired' : 'Not on File';
    return `${labels[item] || item}: ${statusLabel}`;
  }

  getItemStatus(driver: any, item: string): 'compliant' | 'expiring' | 'expired' | 'none' {
    const cached = driver?._statusCache?.[item];
    if (cached) return cached;
    return this.computeItemStatus(driver, item);
  }

  private computeItemStatus(driver: any, item: string): 'compliant' | 'expiring' | 'expired' | 'none' {
    // 1. Check driver record fields (fast path for CDL/Medical/etc.)
    switch (item) {
      case 'cdl': {
        const exp = driver.licenseExpiry || driver.licenseExpiration;
        if (exp) return this.getExpirationStatus(exp);
        if (driver.licenseNumber) return 'compliant';
        break;
      }
      case 'medical': {
        const exp = driver.medicalCardExpiry || driver.medicalCardExpiration;
        if (exp) return this.getExpirationStatus(exp);
        break;
      }
      case 'employment':
        if (driver.hireDate || driver.employmentVerified) return 'compliant';
        break;
      case 'permits': {
        const twicExp = driver.twiccExpiry;
        if (twicExp) return this.getExpirationStatus(twicExp);
        if (driver.twiccCardNumber) return 'compliant';
        break;
      }
      case 'insurance': {
        const exp = driver.insuranceExpiry || driver.insuranceExpiration;
        if (exp) return this.getExpirationStatus(exp);
        break;
      }
    }

    // 2. Fall back to checking uploaded documents
    const docs: any[] = driver._docs || [];
    const doc = this.findDocInList(docs, item);
    if (!doc) return 'none';

    if (doc.status === 'expired') return 'expired';
    if (doc.status === 'expiring') return 'expiring';
    if (doc.expiryDate) return this.getExpirationStatus(doc.expiryDate);
    return 'compliant';
  }

  getOverallStatus(driver: any): string {
    if (driver?._overallStatus) return driver._overallStatus;
    const items = ['cdl', 'medical', 'mvr', 'drug', 'dqf', 'employment', 'training', 'insurance', 'vehicle', 'permits', 'ifta', 'irp', 'safety', 'violations', 'i9', 'w9', 'directDeposit', 'deduction'];
    const redExceptionItems = new Set(['training', 'permits', 'irp']);
    let hasBlockingRed = false;
    let hasExpiring = false;
    let compliantCount = 0;

    for (const item of items) {
      const status = this.getItemStatus(driver, item);
      const isRed = status === 'expired' || status === 'none';
      if (isRed && !redExceptionItems.has(item)) hasBlockingRed = true;
      if (status === 'expiring') hasExpiring = true;
      if (status === 'compliant') compliantCount++;
    }

    if (hasBlockingRed) return 'non-compliant';
    if (hasExpiring) return 'warning';
    if (compliantCount >= 5) return 'good';
    return 'pending';
  }

  getOverallLabel(driver: any): string {
    if (driver?._overallLabel) return driver._overallLabel;
    const status = this.getOverallStatus(driver);
    if (status === 'non-compliant') return 'non';
    return status;
  }

  getDisplayStatus(driver: any): string {
    if (driver?._displayStatus) return driver._displayStatus;
    // Compliance override for matrix status badge display.
    if (this.getOverallStatus(driver) === 'non-compliant') {
      return 'inactive';
    }
    return this.isActiveStatus(driver?.status) ? 'active' : 'inactive';
  }

  private getMissingOnboardingPaperworkItems(driver: any): any[] {
    return this.onboardingPaperworkKeys
      .filter((key: string) => this.getItemStatus(driver, key) === 'none')
      .map((key: string) => this.complianceItems.find((item: any) => item.key === key))
      .filter((item: any) => !!item);
  }

  private ensureSelectedDriverForCompliance(driver: any): void {
    this.selectedDriver.set(driver);
    this.loadDriverDocs(driver.id);
    if (this.isApiDriverId(driver.id)) {
      this.loadDriverDetails(driver.id);
    }
  }

  editCompDoc(item: any): void {
    const doc = this.getCompDoc(this.selectedDriver(), item.key);
    if (!doc) return;
    this.compUploadItem.set(item);
    this.compFile = null;
    this.compForm = {
      documentName: doc.documentName || item.label,
      documentNumber: doc.documentNumber || '',
      issueDate: doc.issueDate ? new Date(doc.issueDate).toISOString().split('T')[0] : '',
      expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString().split('T')[0] : '',
      notes: doc.notes || ''
    };
    (this as any)._editingDocId = doc.id;
    this.compUploadOpen.set(true);
  }

  openCompUpload(item: any): void {
    this.compUploadItem.set(item);
    this.compFile = null;
    (this as any)._editingDocId = null;
    this.compForm = { documentName: item.label, documentNumber: '', issueDate: '', expiryDate: '', notes: '' };
    this.compUploadOpen.set(true);
  }

  getEditingDocId(): number | null {
    return (this as any)._editingDocId ?? null;
  }

  deleteCompDoc(): void {
    const id = (this as any)._editingDocId;
    if (!id) return;
    if (!confirm('Delete this document? This cannot be undone.')) return;
    this.compSaving.set(true);
    this.api.deleteDriverDocument(id).subscribe({
      next: () => {
        this.toast.success('Document deleted', 'Deleted');
        this.compSaving.set(false);
        this.compUploadOpen.set(false);
        (this as any)._editingDocId = null;
        const driver = this.selectedDriver();
        if (driver) {
          this.refreshComplianceData();
        }
      },
      error: () => {
        this.toast.error('Failed to delete document', 'Error');
        this.compSaving.set(false);
      }
    });
  }

  submitCompUpload(): void {
    const driver = this.selectedDriver();
    const item = this.compUploadItem();
    if (!driver || !item) return;
    if (!this.compForm.documentName.trim()) { this.toast.error('Document name required', 'Required'); return; }

    this.compSaving.set(true);
    const editId = (this as any)._editingDocId;

    if (editId) {
      this.api.updateDriverDocument(editId, {
        documentName: this.compForm.documentName,
        documentNumber: this.compForm.documentNumber,
        issueDate: this.compForm.issueDate || null,
        expiryDate: this.compForm.expiryDate || null,
        notes: this.compForm.notes
      }).subscribe({
        next: () => {
          this.toast.success(`${item.label} updated`, 'Updated');
          this.compSaving.set(false);
          this.compUploadOpen.set(false);
          (this as any)._editingDocId = null;
          this.refreshComplianceData();
        },
        error: () => { this.toast.error('Update failed', 'Error'); this.compSaving.set(false); }
      });
    } else {
      const apiDriverId = this.resolveApiDriverId(driver);
      if (apiDriverId) {
        this.createComplianceDocumentUpload(driver, item, apiDriverId);
        return;
      }

      // If we cannot resolve a numeric driver id, attempt to create/link one.
      // Some onboarding records arrive with non-standard status labels.
      this.createDriverFromOnboardingProfile(driver, item);
    }
  }

  private createComplianceDocumentUpload(driver: any, item: any, apiDriverId: string): void {
    const fd = new FormData();
    fd.append('driverId', apiDriverId);
    fd.append('category', this.catMap[item.key] || item.key);
    fd.append('subCategory', this.subMap[item.key] || item.key);
    fd.append('documentName', this.compForm.documentName);
    fd.append('documentNumber', this.compForm.documentNumber);
    if (this.compForm.issueDate) fd.append('issueDate', this.compForm.issueDate);
    if (this.compForm.expiryDate) fd.append('expiryDate', this.compForm.expiryDate);
    fd.append('notes', this.compForm.notes);
    if (this.compFile) fd.append('file', this.compFile);

    this.api.createDriverDocument(fd).subscribe({
      next: () => {
        this.toast.success(`${item.label} uploaded`, 'Success');
        this.compSaving.set(false);
        this.compUploadOpen.set(false);
        this.refreshComplianceData();
      },
      error: () => { this.toast.error('Upload failed', 'Error'); this.compSaving.set(false); }
    });
  }

  private createDriverFromOnboardingProfile(driver: any, item: any): void {
    const name = String(driver?.name ?? '').trim();
    if (!name) {
      this.toast.error('Onboarding profile must include full name before document upload.', 'Driver record required');
      this.compSaving.set(false);
      return;
    }

    const existingDriverId = this.findBestMatchingDriverId(driver, this.drivers());
    if (existingDriverId) {
      this.linkDriverAliasId(driver, existingDriverId);
      this.createComplianceDocumentUpload(driver, item, existingDriverId);
      return;
    }

    const payload = this.buildOnboardingDriverPayload(driver);

    this.api.createDriver(payload).subscribe({
      next: (res: any) => {
        const created = res?.data || res;
        const createdId = String(created?.id ?? '').trim();
        if (!this.isApiDriverId(createdId)) {
          this.toast.error('Driver created but ID mapping failed. Refresh and try upload again.', 'Driver link failed');
          this.compSaving.set(false);
          return;
        }

        this.linkDriverAliasId(driver, createdId);
        this.toast.success('Driver record linked. Continuing upload...', 'Driver record created');
        this.createComplianceDocumentUpload(driver, item, createdId);
      },
      error: (err: any) => {
        const msg = err?.error?.error || 'Failed to create linked driver record.';
        this.toast.error(msg, 'Driver record required');
        this.compSaving.set(false);
      }
    });
  }

  private linkOnboardingApplicants(rawDrivers: any[], onboardingRows: any[]): any[] {
    if (!Array.isArray(onboardingRows) || onboardingRows.length === 0) return onboardingRows || [];

    return onboardingRows.map((row) => {
      const existingApiId = this.resolveApiDriverId(row);
      if (existingApiId) return row;

      const matchedId = this.findBestMatchingDriverId(row, rawDrivers);
      if (matchedId) return this.withLinkedDriverId(row, matchedId);

      return row;
    });
  }

  private getDriverIdKeys(driver: any): string[] {
    const ids = new Set<string>(
      [
        String(driver?.id ?? '').trim(),
        String(driver?._linkedDriverId ?? '').trim(),
        ...(Array.isArray(driver?._aliasDriverIds)
          ? driver._aliasDriverIds.map((value: any) => String(value ?? '').trim())
          : [])
      ].filter((value: string) => !!value)
    );
    return Array.from(ids);
  }

  private async ensureOnboardingDriversHaveNumericIds(rawDrivers: any[], onboardingRows: any[]): Promise<any[]> {
    return this.linkOnboardingApplicants(rawDrivers, onboardingRows);
  }

  private async createOnboardingDriverRecordAsync(row: any): Promise<string | null> {
    const name = String(row?.name ?? '').trim();
    const phone = String(row?.phone ?? '').trim();
    if (!name || !phone) return null;

    try {
      const payload = this.buildOnboardingDriverPayload(row);
      const res: any = await this.api.createDriver(payload).toPromise();
      const created = res?.data || res;
      const createdId = String(created?.id ?? '').trim();
      return this.isApiDriverId(createdId) ? createdId : null;
    } catch {
      return null;
    }
  }

  private buildOnboardingDriverPayload(driver: any): any {
    return {
      name: String(driver?.name ?? '').trim(),
      phone: String(driver?.phone ?? '').trim(),
      email: String(driver?.email ?? '').trim() || null,
      licenseNumber: String(driver?.licenseNumber ?? '').trim() || null,
      licenseState: String(driver?.licenseState ?? '').trim() || null,
      licenseExpiry: driver?.licenseExpiry || driver?.licenseExpiration || null,
      status: 'onboarding',
      driverType: driver?.driverType || null,
      notes: 'Auto-created from onboarding compliance flow'
    };
  }

  private withLinkedDriverId(row: any, apiDriverId: string): any {
    const idSet = new Set<string>(
      [
        String(row?.id ?? '').trim(),
        ...(Array.isArray(row?._aliasDriverIds) ? row._aliasDriverIds.map((id: any) => String(id ?? '').trim()) : []),
        apiDriverId
      ].filter((id: string) => !!id)
    );
    return {
      ...row,
      _aliasDriverIds: Array.from(idSet),
      _linkedDriverId: apiDriverId
    };
  }

  private findBestMatchingDriverId(target: any, candidates: any[]): string | null {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const targetEmail = String(target?.email ?? '').trim().toLowerCase();
    const targetPhone = String(target?.phone ?? '').replace(/\D+/g, '');
    const targetName = String(target?.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

    const match = candidates.find((candidate: any) => {
      const candidateId = String(candidate?.id ?? '').trim();
      if (!this.isApiDriverId(candidateId)) return false;

      const candidateEmail = String(candidate?.email ?? '').trim().toLowerCase();
      const candidatePhone = String(candidate?.phone ?? '').replace(/\D+/g, '');
      const candidateName = String(candidate?.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

      if (targetEmail && candidateEmail && targetEmail === candidateEmail) return true;
      if (targetPhone && candidatePhone && targetPhone === candidatePhone) return true;
      if (targetName && candidateName && targetName === candidateName) return true;
      return false;
    });

    if (!match) return null;
    const candidateId = String(match?.id ?? '').trim();
    return this.isApiDriverId(candidateId) ? candidateId : null;
  }

  private linkDriverAliasId(driver: any, apiDriverId: string): void {
    const baseIds = new Set<string>(
      [
        String(driver?.id ?? '').trim(),
        ...(Array.isArray(driver?._aliasDriverIds) ? driver._aliasDriverIds.map((id: any) => String(id ?? '').trim()) : []),
        apiDriverId
      ].filter((id: string) => !!id)
    );

    const patch = {
      _aliasDriverIds: Array.from(baseIds),
      _linkedDriverId: apiDriverId
    };

    this.drivers.update((rows: any[]) =>
      rows.map((row: any) => (`${row?.id ?? ''}` === `${driver?.id ?? ''}` ? { ...row, ...patch } : row))
    );

    if (`${this.selectedDriver()?.id ?? ''}` === `${driver?.id ?? ''}`) {
      this.selectedDriver.set({ ...(this.selectedDriver() || {}), ...patch });
    }
  }

  private deduplicateDrivers(drivers: any[]): any[] {
    const identityMap = new Map<string, any>();
    const unique: any[] = [];

    for (const driver of drivers || []) {
      const currentId = String(driver?.id ?? '').trim();
      const keys = this.buildDriverIdentityKeys(driver);
      if (keys.length === 0) {
        const row = { ...driver, _aliasDriverIds: currentId ? [currentId] : [] };
        unique.push(row);
        continue;
      }

      let winner = keys.map(k => identityMap.get(k)).find(Boolean) || null;
      if (!winner) {
        winner = { ...driver, _aliasDriverIds: currentId ? [currentId] : [] };
        unique.push(winner);
      } else {
        const winnerIds = new Set<string>((winner?._aliasDriverIds || []).map((id: any) => String(id ?? '').trim()).filter((id: string) => !!id));
        if (String(winner?.id ?? '').trim()) winnerIds.add(String(winner.id).trim());
        if (currentId) winnerIds.add(currentId);

        // Keep the most recently updated record for duplicate identities.
        const currentTs = this.getRecordTimestamp(driver);
        const winnerTs = this.getRecordTimestamp(winner);
        if (currentTs > winnerTs) {
          const idx = unique.indexOf(winner);
          const replacement = { ...driver, _aliasDriverIds: Array.from(winnerIds) };
          if (idx >= 0) unique[idx] = replacement;
          winner = replacement;
        } else {
          winner._aliasDriverIds = Array.from(winnerIds);
        }
      }

      for (const key of keys) identityMap.set(key, winner);
    }

    return unique;
  }

  private buildDriverIdentityKeys(driver: any): string[] {
    const keys: string[] = [];
    const email = String(driver?.email ?? '').trim().toLowerCase();
    const phoneDigits = String(driver?.phone ?? '').replace(/\D+/g, '');
    const name = String(driver?.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const phoneLast7 = phoneDigits.length >= 7 ? phoneDigits.slice(-7) : '';

    if (email) keys.push(`email:${email}`);
    if (phoneDigits) keys.push(`phone:${phoneDigits}`);
    if (phoneLast7) keys.push(`phone-last7:${phoneLast7}`);
    if (name && phoneDigits) keys.push(`name-phone:${name}|${phoneDigits}`);
    if (name && phoneLast7) keys.push(`name-phone-last7:${name}|${phoneLast7}`);
    if (name && email) keys.push(`name-email:${name}|${email}`);
    // Do not merge by name-only. It can collapse distinct records and hide newly hired drivers.

    const aliasIds = new Set<string>(
      [
        String(driver?.id ?? '').trim(),
        String(driver?._linkedDriverId ?? '').trim(),
        ...(Array.isArray(driver?._aliasDriverIds)
          ? driver._aliasDriverIds.map((value: any) => String(value ?? '').trim())
          : [])
      ].filter((value: string) => !!value)
    );

    for (const aliasId of aliasIds) {
      keys.push(`id:${aliasId}`);
      // Ensure applicant rows linked to numeric driver IDs collapse into one person.
      if (this.isApiDriverId(aliasId)) {
        keys.push(`api-id:${aliasId}`);
      }
    }

    return keys;
  }

  private getRecordTimestamp(driver: any): number {
    const updated = driver?.updatedAt ? new Date(driver.updatedAt).getTime() : 0;
    const created = driver?.createdAt ? new Date(driver.createdAt).getTime() : 0;
    return Math.max(updated || 0, created || 0);
  }

  private isApiDriverId(id: unknown): boolean {
    const value = String(id ?? '').trim();
    return /^[0-9]+$/.test(value);
  }

  private resolveApiDriverId(driver: any): string | null {
    const candidates = [
      driver?.id,
      ...(Array.isArray(driver?._aliasDriverIds) ? driver._aliasDriverIds : [])
    ]
      .map((id: any) => String(id ?? '').trim())
      .filter((id: string) => !!id);

    const match = candidates.find((id: string) => this.isApiDriverId(id));
    return match || null;
  }
}
