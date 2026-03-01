import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-driver-database',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './driver-database.component.html',
  styleUrls: ['./driver-database.component.scss']
})
export class DriverDatabaseComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private api = inject(VanTacApiService);
  private toast = inject(ToastService);

  compUploadOpen = signal(false);
  compUploadItem = signal<any>(null);
  compSaving = signal(false);
  compFile: File | null = null;
  compForm = { documentName: '', documentNumber: '', issueDate: '', expiryDate: '', notes: '' };

  private readonly catMap: Record<string, string> = {
    cdl: 'cdl_endorsements', medical: 'medical', mvr: 'mvr', drug: 'drug_tests',
    dqf: 'dqf', employment: 'employment', training: 'training',
    insurance: 'insurance', vehicle: 'vehicle', permits: 'permits',
    ifta: 'ifta', safety: 'safety', violations: 'violations'
  };
  private readonly subMap: Record<string, string> = {
    cdl: 'cdl_license', medical: 'medical_card', mvr: 'annual_mvr', drug: 'pre_employment',
    dqf: 'application', employment: 'offer_letter', training: 'entry_level_driver',
    insurance: 'certificate_of_insurance', vehicle: 'registration', permits: 'oversize',
    ifta: 'ifta_license', safety: 'safe_driver', violations: 'moving_violation'
  };

  loading = signal(false);
  drivers = signal<any[]>([]);
  selectedDriver = signal<any | null>(null);
  driverDocs = signal<any[]>([]);
  allDocs = signal<any[]>([]);
  showDetailsModal = signal(false);
  
  // Filters
  searchTerm = '';
  statusFilter = 'all';
  complianceFilter = 'all';
  activeStatusTab = signal<'active' | 'inactive' | 'archived'>('active');

  filteredDrivers = computed(() => {
    let list = this.drivers();
    const tab = this.activeStatusTab();
    if (tab === 'active') list = list.filter((d: any) => d.status === 'active' || d.status === 'available' || d.status === 'dispatched');
    else if (tab === 'inactive') list = list.filter((d: any) => d.status === 'inactive' || d.status === 'on-leave' || d.status === 'suspended');
    else if (tab === 'archived') list = list.filter((d: any) => d.status === 'archived' || d.status === 'terminated');

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

  tabCounts = computed(() => {
    const all = this.drivers();
    return {
      active: all.filter((d: any) => d.status === 'active' || d.status === 'available' || d.status === 'dispatched').length,
      inactive: all.filter((d: any) => d.status === 'inactive' || d.status === 'on-leave' || d.status === 'suspended').length,
      archived: all.filter((d: any) => d.status === 'archived' || d.status === 'terminated').length
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
  
  ngOnInit() {
    this.loadAllDocs();
    this.loadDrivers().then(() => {
      // Check for driverId query param to auto-open profile
      this.route.queryParams.subscribe(params => {
        const driverId = params['driverId'];
        if (driverId) {
          const driver = this.drivers().find((d: any) => d.id?.toString() === driverId.toString());
          if (driver) {
            this.viewDriverDetails(driver);
          } else {
            // Driver not in list, fetch directly
            this.http.get(`${environment.apiUrl}/api/v1/drivers/${driverId}`).subscribe({
              next: (res: any) => {
                const d = res?.data || res;
                if (d) this.viewDriverDetails(d);
              }
            });
          }
        }
      });
    });
  }
  
  async loadDrivers() {
    this.loading.set(true);
    try {
      const response: any = await this.http.get(`${environment.apiUrl}/api/v1/drivers?limit=1000`).toPromise();
      this.drivers.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load drivers:', err);
      this.drivers.set([]);
    } finally {
      this.loading.set(false);
    }
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
      const response: any = await this.http.get(`${environment.apiUrl}/api/v1/trailers?pageSize=1000`).toPromise();
      const allTrailers = response?.data || [];
      const assigned = allTrailers.filter((t: any) =>
        t.driverAssignments?.some((a: any) => a.driverId === driver.id && a.status === 'active')
      );
      this.driverTrailers.set(assigned);
    } catch {
      this.driverTrailers.set([]);
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
    { key: 'dqf', label: 'Driver Qualification File' }, { key: 'employment', label: 'Employment Verification' },
    { key: 'training', label: 'Training' }, { key: 'insurance', label: 'Insurance' },
    { key: 'vehicle', label: 'Vehicle Docs' }, { key: 'permits', label: 'Permits' },
    { key: 'ifta', label: 'IFTA' }, { key: 'safety', label: 'Safety Awards' },
    { key: 'violations', label: 'Violations' }
  ];

  selectDriver(driver: any) {
    if (this.selectedDriver()?.id === driver.id) {
      this.selectedDriver.set(null);
      this.driverDocs.set([]);
    } else {
      this.selectedDriver.set(driver);
      this.loadDriverDocs(driver.id);
    }
  }

  loadAllDocs(): void {
    this.api.getDriverDocuments().subscribe({
      next: (res: any) => this.allDocs.set(res?.data || []),
      error: () => this.allDocs.set([])
    });
  }

  loadDriverDocs(driverId: any): void {
    const filtered = this.allDocs().filter(d => d.driverId?.toString() === driverId?.toString());
    this.driverDocs.set(filtered);
    if (filtered.length === 0) {
      this.api.getDriverDocuments(driverId).subscribe({
        next: (res: any) => this.driverDocs.set(res?.data || []),
        error: () => this.driverDocs.set([])
      });
    }
  }

  getCompDoc(driver: any, key: string): any {
    const sub = this.subMap[key];
    const cat = this.catMap[key];
    const docs = this.driverDocs();
    if (docs.length === 0) return null;

    // Try exact subcategory match first
    let doc = docs.find(d => d.subCategory === sub);
    if (doc) return doc;

    // Try by category
    if (cat) {
      doc = docs.find(d => d.category === cat);
      if (doc) return doc;
    }

    // Try by label match in document name
    const labels: Record<string, string[]> = {
      cdl: ['cdl', 'license', 'cdl_license'],
      medical: ['medical', 'dot physical', 'medical_card'],
      mvr: ['mvr', 'motor vehicle', 'annual_mvr'],
      drug: ['drug', 'alcohol', 'drug_test', 'pre_employment'],
      dqf: ['dqf', 'qualification', 'application'],
      employment: ['employment', 'verification', 'offer_letter', 'w4', 'i9'],
      training: ['training', 'entry_level'],
      insurance: ['insurance', 'certificate_of_insurance'],
      vehicle: ['vehicle', 'registration', 'inspection'],
      permits: ['permit', 'twic', 'oversize'],
      ifta: ['ifta', 'irp'],
      safety: ['safety', 'award'],
      violations: ['violation', 'accident']
    };

    const terms = labels[key] || [key];
    return docs.find(d => {
      const name = ((d.documentName || '') + ' ' + (d.documentType || '') + ' ' + (d.subCategory || '') + ' ' + (d.category || '')).toLowerCase();
      return terms.some(t => name.includes(t));
    }) || null;
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
    this.http.put(`${environment.apiUrl}/api/v1/drivers/${driver.id}`, { ...driver, status: 'suspended' }).subscribe({
      next: () => { driver.status = 'suspended'; this.drivers.set([...this.drivers()]); },
      error: () => {}
    });
  }

  reactivateDriver(driver: any) {
    this.http.put(`${environment.apiUrl}/api/v1/drivers/${driver.id}`, { ...driver, status: 'active' }).subscribe({
      next: () => { driver.status = 'active'; this.drivers.set([...this.drivers()]); },
      error: () => {}
    });
  }

  getComplianceClass(driver: any, item: string): string {
    const status = this.getItemStatus(driver, item);
    if (status === 'compliant') return 'dot dot-green';
    if (status === 'expiring') return 'dot dot-yellow';
    if (status === 'expired') return 'dot dot-red';

    // Check uploaded docs for any driver
    const doc = this.getDocForDriver(driver.id, item);
    if (doc) {
      if (doc.status === 'expired') return 'dot dot-red';
      if (doc.status === 'expiring') return 'dot dot-yellow';
      return 'dot dot-green';
    }

    return 'dot dot-gray';
  }

  private getDocForDriver(driverId: any, key: string): any {
    const sub = this.subMap[key];
    const cat = this.catMap[key];
    const docs = this.allDocs().filter(d => d.driverId?.toString() === driverId?.toString());
    if (docs.length === 0) return null;

    let doc = docs.find(d => d.subCategory === sub);
    if (doc) return doc;
    if (cat) { doc = docs.find(d => d.category === cat); if (doc) return doc; }

    const labels: Record<string, string[]> = {
      cdl: ['cdl', 'license'], medical: ['medical', 'dot physical'],
      mvr: ['mvr', 'motor vehicle'], drug: ['drug', 'alcohol'],
      dqf: ['dqf', 'qualification'], employment: ['employment', 'verification'],
      training: ['training'], insurance: ['insurance'],
      vehicle: ['vehicle', 'registration'], permits: ['permit', 'twic'],
      ifta: ['ifta', 'irp'], safety: ['safety', 'award'], violations: ['violation', 'accident']
    };
    const terms = labels[key] || [key];
    return docs.find(d => {
      const name = ((d.documentName || '') + ' ' + (d.subCategory || '') + ' ' + (d.category || '')).toLowerCase();
      return terms.some(t => name.includes(t));
    }) || null;
  }

  getComplianceTooltip(driver: any, item: string): string {
    const labels: any = {
      cdl: 'CDL / License', medical: 'Medical Certificate', mvr: 'Motor Vehicle Record',
      drug: 'Drug & Alcohol Test', dqf: 'Driver Qualification File', employment: 'Employment Verification',
      training: 'Training', insurance: 'Insurance', vehicle: 'Vehicle Docs',
      permits: 'Permits', ifta: 'IFTA', safety: 'Safety Awards', violations: 'Violations'
    };
    const status = this.getItemStatus(driver, item);
    const statusLabel = status === 'compliant' ? 'Compliant' : status === 'expiring' ? 'Expiring Soon' : status === 'expired' ? 'Expired' : 'Not on File';
    return `${labels[item] || item}: ${statusLabel}`;
  }

  getItemStatus(driver: any, item: string): 'compliant' | 'expiring' | 'expired' | 'none' {
    switch (item) {
      case 'cdl':
        if (!driver.licenseExpiration) return 'none';
        return this.getExpirationStatus(driver.licenseExpiration);
      case 'medical':
        if (!driver.medicalCardExpiration) return 'none';
        return this.getExpirationStatus(driver.medicalCardExpiration);
      case 'mvr':
        if (driver.mvrOnFile) return 'compliant';
        return 'none';
      case 'drug':
        if (driver.drugTestDate) {
          const days = this.getDaysUntilExpiration(driver.drugTestDate);
          if (days < -365) return 'expired';
          return 'compliant';
        }
        return 'none';
      case 'dqf':
        if (driver.dqfComplete) return 'compliant';
        if (driver.dqfOnFile) return 'expiring';
        return 'none';
      case 'employment':
        if (driver.employmentVerified || driver.hireDate) return 'compliant';
        return 'none';
      case 'training':
        if (driver.trainingComplete || driver.orientationDate) return 'compliant';
        return 'none';
      case 'insurance':
        if (driver.insuranceExpiration) return this.getExpirationStatus(driver.insuranceExpiration);
        return 'none';
      case 'vehicle':
        if (driver.vehicleInspectionDate) {
          const days = this.getDaysUntilExpiration(driver.vehicleInspectionDate);
          if (days < -90) return 'expired';
          if (days < -60) return 'expiring';
          return 'compliant';
        }
        return 'none';
      case 'permits':
        if (driver.permitsOnFile) return 'compliant';
        return 'none';
      case 'ifta':
        if (driver.iftaCompliant) return 'compliant';
        return 'none';
      case 'safety':
        if (driver.safetyAwards) return 'compliant';
        return 'none';
      case 'violations':
        if (driver.violations && driver.violations > 0) return 'expired';
        if (driver.violationsChecked) return 'compliant';
        return 'none';
      default:
        return 'none';
    }
  }

  getOverallStatus(driver: any): string {
    const items = ['cdl', 'medical', 'mvr', 'drug', 'dqf', 'employment', 'training', 'insurance', 'vehicle', 'permits', 'ifta', 'safety', 'violations'];
    let hasExpired = false;
    let hasExpiring = false;
    let compliantCount = 0;

    for (const item of items) {
      const status = this.getItemStatus(driver, item);
      if (status === 'expired') hasExpired = true;
      if (status === 'expiring') hasExpiring = true;
      if (status === 'compliant') compliantCount++;
    }

    if (hasExpired) return 'critical';
    if (hasExpiring) return 'warning';
    if (compliantCount >= 5) return 'good';
    return 'pending';
  }

  openCompUpload(item: any): void {
    this.compUploadItem.set(item);
    this.compFile = null;
    this.compForm = { documentName: item.label, documentNumber: '', issueDate: '', expiryDate: '', notes: '' };
    this.compUploadOpen.set(true);
  }

  submitCompUpload(): void {
    const driver = this.selectedDriver();
    const item = this.compUploadItem();
    if (!driver || !item) return;
    if (!this.compForm.documentName.trim()) { this.toast.error('Document name required', 'Required'); return; }

    this.compSaving.set(true);
    const fd = new FormData();
    fd.append('driverId', driver.id);
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
      },
      error: () => {
        this.toast.error('Upload failed', 'Error');
        this.compSaving.set(false);
      }
    });
  }
}
