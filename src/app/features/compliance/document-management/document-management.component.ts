import { Component, signal, computed, inject, OnInit } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventTrackingService } from '../../../core/services/event-tracking.service';
import { ConfirmService } from '../../../core/services/confirm.service';

interface DocCategory {
  key: string;
  label: string;
  icon: string;
  subcategories: { value: string; label: string }[];
}

@Component({
  selector: 'app-document-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-management.component.html',
  styleUrls: ['./document-management.component.scss']
})
export class DocumentManagementComponent implements OnInit {
  private api = inject(VanTacApiService);
  private toast = inject(ToastService);
  private tracking = inject(EventTrackingService);
  private confirm = inject(ConfirmService);

  activeTab = signal('required');
  documents = signal<any[]>([]);
  drivers = signal<any[]>([]);
  selectedDriverId = signal<string>('');
  loading = signal(false);
  showUploadModal = signal(false);
  editingDoc = signal<any>(null);
  detailDriver = signal<any>(null);
  subDocPopup = signal<{ driver: any; sub: any } | null>(null);
  subDocList = signal<any[]>([]);

  driverSearch = signal('');
  statusFilter = signal('');
  yearFilter = signal('');

  readonly availableYears = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  filteredRosterDrivers = computed(() => {
    let list = this.rosterDrivers();
    const search = this.driverSearch().toLowerCase();
    if (search) {
      list = list.filter((d: any) =>
        (d.name || '').toLowerCase().includes(search) ||
        (d.phone || '').includes(search) ||
        (d.email || '').toLowerCase().includes(search)
      );
    }
    const status = this.statusFilter();
    if (status) {
      list = list.filter((d: any) => this.getDriverOverallStatus(d.id) === status);
    }
    const year = this.yearFilter();
    if (year) {
      const tab = this.activeTab();
      list = list.filter((d: any) => {
        const docs = this.documents().filter(doc =>
          doc.driverId?.toString() === d.id?.toString() && doc.category === tab
        );
        return docs.some(doc => {
          const date = doc.issueDate || doc.createdAt || '';
          return date && new Date(date).getFullYear().toString() === year;
        });
      });
    }
    return list;
  });

  complianceItems = [
    { key: 'cdl', label: 'CDL / License' }, { key: 'medical', label: 'Medical Certificate' },
    { key: 'mvr', label: 'Motor Vehicle Record' }, { key: 'drug', label: 'Drug & Alcohol Test' },
    { key: 'dqf', label: 'Driver Qualification File' }, { key: 'employment', label: 'Employment Verification' },
    { key: 'training', label: 'Training' }, { key: 'insurance', label: 'Insurance' },
    { key: 'vehicle', label: 'Vehicle Docs' }, { key: 'permits', label: 'Permits' },
  ];
  saving = signal(false);
  docFile: File | null = null;

  summary = signal<any>({ totalDocuments: 0, expiring: 0, expired: 0, data: [] });

  readonly categories: DocCategory[] = [
    { key: 'required', label: 'Required', icon: 'bx-check-shield', subcategories: [
      { value: 'cdl_license', label: 'CDL / License' },
      { value: 'medical_card', label: 'Medical Certificate' },
      { value: 'annual_mvr', label: 'Motor Vehicle Record' },
      { value: 'pre_employment', label: 'Drug & Alcohol Test' },
      { value: 'application', label: 'Driver Qualification File' },
      { value: 'offer_letter', label: 'Employment Verification' },
      { value: 'entry_level_driver', label: 'Training' },
      { value: 'certificate_of_insurance', label: 'Insurance' },
      { value: 'registration', label: 'Vehicle Docs' },
      { value: 'oversize', label: 'Permits' },
      { value: 'ifta_license', label: 'IFTA' },
      { value: 'safe_driver', label: 'Safety Awards' },
      { value: 'moving_violation', label: 'Violations' },
    ]},
    { key: 'cdl_endorsements', label: 'CDL & Endorsements', icon: 'bx-id-card', subcategories: [
      { value: 'cdl_license', label: 'CDL License' },
      { value: 'hazmat', label: 'Hazmat Endorsement' },
      { value: 'tanker', label: 'Tanker Endorsement' },
      { value: 'doubles_triples', label: 'Doubles/Triples' },
      { value: 'passenger', label: 'Passenger Endorsement' },
      { value: 'school_bus', label: 'School Bus Endorsement' },
      { value: 'other_endorsement', label: 'Other Endorsement' }
    ]},
    { key: 'medical', label: 'Medical Certs', icon: 'bx-plus-medical', subcategories: [
      { value: 'medical_card', label: 'Medical Card (DOT Physical)' },
      { value: 'medical_waiver', label: 'Medical Waiver' },
      { value: 'vision_waiver', label: 'Vision Waiver' },
      { value: 'diabetes_exemption', label: 'Diabetes Exemption' }
    ]},
    { key: 'mvr', label: 'MVR', icon: 'bx-car', subcategories: [
      { value: 'annual_mvr', label: 'Annual MVR' },
      { value: 'pre_employment_mvr', label: 'Pre-Employment MVR' },
      { value: 'violations_list', label: 'Violations List' }
    ]},
    { key: 'drug_tests', label: 'Drug Tests', icon: 'bx-test-tube', subcategories: [
      { value: 'pre_employment', label: 'Pre-Employment' },
      { value: 'random', label: 'Random' },
      { value: 'post_accident', label: 'Post-Accident' },
      { value: 'reasonable_suspicion', label: 'Reasonable Suspicion' },
      { value: 'return_to_duty', label: 'Return to Duty' },
      { value: 'follow_up', label: 'Follow-Up' },
      { value: 'clearinghouse', label: 'FMCSA Clearinghouse' }
    ]},
    { key: 'dqf', label: 'DQF', icon: 'bx-folder-open', subcategories: [
      { value: 'application', label: 'Employment Application' },
      { value: 'road_test', label: 'Road Test Certificate' },
      { value: 'annual_review', label: 'Annual Review' },
      { value: 'previous_employer', label: 'Previous Employer Inquiry' },
      { value: 'annual_cert_violations', label: 'Annual Certification of Violations' }
    ]},
    { key: 'employment', label: 'Employment', icon: 'bx-briefcase', subcategories: [
      { value: 'offer_letter', label: 'Offer Letter' },
      { value: 'w4', label: 'W-4' },
      { value: 'i9', label: 'I-9' },
      { value: 'direct_deposit', label: 'Direct Deposit Form' },
      { value: 'handbook_ack', label: 'Handbook Acknowledgment' },
      { value: 'nda', label: 'NDA / Non-Compete' },
      { value: 'termination', label: 'Termination Letter' }
    ]},
    { key: 'training', label: 'Training', icon: 'bx-book-open', subcategories: [
      { value: 'entry_level_driver', label: 'Entry-Level Driver Training' },
      { value: 'hazmat_training', label: 'Hazmat Training' },
      { value: 'defensive_driving', label: 'Defensive Driving' },
      { value: 'smith_system', label: 'Smith System' },
      { value: 'load_securement', label: 'Load Securement' },
      { value: 'other_training', label: 'Other Training' }
    ]},
    { key: 'insurance', label: 'Insurance', icon: 'bx-shield-alt-2', subcategories: [
      { value: 'certificate_of_insurance', label: 'Certificate of Insurance' },
      { value: 'occ_accident', label: 'Occupational Accident Policy' },
      { value: 'workers_comp', label: 'Workers Comp Card' }
    ]},
    { key: 'vehicle', label: 'Vehicle Docs', icon: 'bx-car', subcategories: [
      { value: 'registration', label: 'Vehicle Registration' },
      { value: 'title', label: 'Vehicle Title' },
      { value: 'lease_agreement', label: 'Lease Agreement' },
      { value: 'annual_inspection', label: 'Annual Inspection' },
      { value: 'dvir', label: 'DVIR' }
    ]},
    { key: 'permits', label: 'Permits', icon: 'bx-badge-check', subcategories: [
      { value: 'oversize', label: 'Oversize/Overweight' },
      { value: 'trip_permit', label: 'Trip Permit' },
      { value: 'fuel_permit', label: 'Fuel Permit' },
      { value: 'twic', label: 'TWIC Card' },
      { value: 'port_access', label: 'Port Access' }
    ]},
    { key: 'ifta', label: 'IFTA', icon: 'bx-receipt', subcategories: [
      { value: 'ifta_license', label: 'IFTA License' },
      { value: 'quarterly_report', label: 'Quarterly Report' },
      { value: 'irp_cab_card', label: 'IRP Cab Card' }
    ]},
    { key: 'safety', label: 'Safety Awards', icon: 'bx-trophy', subcategories: [
      { value: 'safe_driver', label: 'Safe Driver Award' },
      { value: 'million_miles', label: 'Million Mile Award' },
      { value: 'other_award', label: 'Other Award' }
    ]},
    { key: 'violations', label: 'Violations', icon: 'bx-error', subcategories: [
      { value: 'moving_violation', label: 'Moving Violation' },
      { value: 'inspection_violation', label: 'Inspection Violation' },
      { value: 'dot_warning', label: 'DOT Warning' },
      { value: 'csa_alert', label: 'CSA Alert' },
      { value: 'accident_report', label: 'Accident Report' }
    ]},
    { key: 'pm', label: 'PM', icon: 'bx-wrench', subcategories: [
      { value: 'oil_change', label: 'Oil Change' },
      { value: 'tire_rotation', label: 'Tire Rotation / Replacement' },
      { value: 'brake_inspection', label: 'Brake Inspection / Service' },
      { value: 'filter_replacement', label: 'Filter Replacement' },
      { value: 'coolant_flush', label: 'Coolant Flush' },
      { value: 'transmission_service', label: 'Transmission Service' },
      { value: 'wheel_alignment', label: 'Wheel Alignment' },
      { value: 'ac_service', label: 'A/C Service' },
      { value: 'battery_check', label: 'Battery Check / Replace' },
      { value: 'dot_annual_inspection', label: 'DOT Annual Inspection' },
      { value: 'pm_a_service', label: 'PM-A Service' },
      { value: 'pm_b_service', label: 'PM-B Service' },
      { value: 'pm_c_service', label: 'PM-C Service' },
      { value: 'other_pm', label: 'Other PM' }
    ]}
  ];

  uploadForm = {
    driverId: '',
    category: 'cdl_endorsements',
    subCategory: '',
    documentName: '',
    documentNumber: '',
    issueDate: '',
    expiryDate: '',
    notes: '',
    remindExpiry: true
  };

  filteredDocs = computed(() => {
    const tab = this.activeTab();
    const driverId = this.selectedDriverId();
    const cat = this.currentCategory();
    let docs: any[];

    if (tab === 'required' && cat) {
      const requiredSubs = cat.subcategories.map(s => s.value);
      docs = this.documents().filter(d => requiredSubs.includes(d.subCategory));
    } else {
      docs = this.documents().filter(d => d.category === tab);
    }

    if (driverId) docs = docs.filter(d => d.driverId?.toString() === driverId);
    return docs;
  });

  currentCategory = computed(() => this.categories.find(c => c.key === this.activeTab()));

  rosterDrivers = computed(() => {
    const driverId = this.selectedDriverId();
    if (driverId) return this.drivers().filter(d => d.id?.toString() === driverId);
    return this.drivers();
  });

  getDriverSubDoc(driverId: any, subCategory: string): any {
    const tab = this.activeTab();
    if (tab === 'required') {
      return this.documents().find(d =>
        d.driverId?.toString() === driverId?.toString() &&
        d.subCategory === subCategory
      ) || null;
    }
    return this.documents().find(d =>
      d.driverId?.toString() === driverId?.toString() &&
      d.category === tab &&
      d.subCategory === subCategory
    ) || null;
  }

  getDriverOverallStatus(driverId: any): string {
    const tab = this.activeTab();
    const cat = this.currentCategory();
    if (!cat) return 'missing';

    const subs = cat.subcategories;
    let matched = 0;
    let hasExpired = false;
    let hasExpiring = false;

    for (const sub of subs) {
      const doc = this.getDriverSubDoc(driverId, sub.value);
      if (doc) {
        matched++;
        if (doc.status === 'expired') hasExpired = true;
        if (doc.status === 'expiring') hasExpiring = true;
      }
    }

    if (matched === 0) return 'missing';
    if (hasExpired) return 'expired';
    if (hasExpiring) return 'expiring';
    if (matched >= subs.length) return 'compliant';
    return 'partial';
  }

  getDriverOverallLabel(driverId: any): string {
    const status = this.getDriverOverallStatus(driverId);
    switch (status) {
      case 'compliant': return 'Complete';
      case 'partial': return 'Partial';
      case 'expiring': return 'Expiring';
      case 'expired': return 'Expired';
      default: return 'Missing';
    }
  }

  openSubDocs(driver: any, sub: any): void {
    this.subDocPopup.set({ driver, sub });
    const tab = this.activeTab();
    const docs = this.documents().filter(d => {
      if (d.driverId?.toString() !== driver.id?.toString()) return false;
      if (d.subCategory !== sub.value) return false;
      if (tab !== 'required') return d.category === tab;
      return true;
    });
    this.subDocList.set(docs);
  }

  closeSubDocPopup(): void {
    this.subDocPopup.set(null);
    this.subDocList.set([]);
  }

  viewSubDoc(doc: any): void {
    if (doc.id) {
      this.api.downloadDriverDocumentFile(doc.id).subscribe({
        next: (blob: Blob) => window.open(URL.createObjectURL(blob), '_blank'),
        error: () => {}
      });
    }
  }

  isExpiringSoon(dateStr: string): boolean {
    if (!dateStr) return false;
    const exp = new Date(dateStr);
    const days = Math.floor((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days > 0 && days <= 90;
  }

  isExpired(dateStr: string): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  selectDriverDetail(driver: any): void {
    this.api.getDriver(driver.id).subscribe({
      next: (res: any) => this.detailDriver.set(res?.data || driver),
      error: () => this.detailDriver.set(driver)
    });
  }

  getComplianceDotClass(driver: any, key: string): string {
    const docs = this.documents().filter(d => d.driverId?.toString() === driver.id?.toString());
    const catMap: Record<string, string> = {
      cdl: 'cdl_endorsements', medical: 'medical', mvr: 'mvr', drug: 'drug_tests',
      dqf: 'dqf', employment: 'employment', training: 'training',
      insurance: 'insurance', vehicle: 'vehicle', permits: 'permits'
    };
    const cat = catMap[key];
    const matched = docs.filter(d => d.category === cat);
    if (matched.length === 0) return 'dot dot-gray';
    if (matched.some(d => d.status === 'expired')) return 'dot dot-red';
    if (matched.some(d => d.status === 'expiring')) return 'dot dot-yellow';
    return 'dot dot-green';
  }

  openUploadForDriver(driver: any): void {
    this.selectedDriverId.set(driver.id?.toString());
    this.editingDoc.set(null);
    this.docFile = null;
    this.uploadForm = {
      driverId: driver.id?.toString(),
      category: this.activeTab(),
      subCategory: '',
      documentName: '',
      documentNumber: '',
      issueDate: '',
      expiryDate: '',
      notes: '',
      remindExpiry: true
    };
    this.showUploadModal.set(true);
  }

  openSubDetail(driver: any, sub: any): void {
    this.selectedDriverId.set(driver.id?.toString());
    this.uploadForm.driverId = driver.id?.toString();
    this.uploadForm.category = this.activeTab();
    this.uploadForm.subCategory = sub.value;

    const existing = this.getDriverSubDoc(driver.id, sub.value);
    if (existing) {
      this.editDocument(existing);
    } else {
      this.uploadForm.documentName = sub.label;
      this.docFile = null;
      this.editingDoc.set(null);
      this.showUploadModal.set(true);
    }
  }

  tabDocCount(category: string): number {
    const driverId = this.selectedDriverId();
    let docs = this.documents().filter(d => d.category === category);
    if (driverId) docs = docs.filter(d => d.driverId?.toString() === driverId);
    return docs.length;
  }

  ngOnInit(): void {
    this.loadDrivers();
    this.loadDocuments();
    this.loadSummary();
  }

  loadDrivers(): void {
    this.api.getDrivers({ limit: 500 }).subscribe({
      next: (res: any) => this.drivers.set(res?.data || []),
      error: () => this.drivers.set([])
    });
  }

  loadDocuments(): void {
    this.loading.set(true);
    this.api.getDriverDocuments().subscribe({
      next: (res: any) => { this.documents.set(res?.data || []); this.loading.set(false); },
      error: () => { this.documents.set([]); this.loading.set(false); }
    });
  }

  loadSummary(): void {
    this.api.getDriverDocumentSummary().subscribe({
      next: (res: any) => this.summary.set(res || { totalDocuments: 0, expiring: 0, expired: 0, data: [] }),
      error: () => {}
    });
  }

  onDriverFilterChange(): void { /* filteredDocs is computed, auto-updates */ }

  openUploadModal(): void {
    this.editingDoc.set(null);
    this.docFile = null;
    this.uploadForm = {
      driverId: this.selectedDriverId() || '',
      category: this.activeTab(),
      subCategory: '',
      documentName: '',
      documentNumber: '',
      issueDate: '',
      expiryDate: '',
      notes: '',
      remindExpiry: true
    };
    this.showUploadModal.set(true);
  }

  editDocument(doc: any): void {
    this.editingDoc.set(doc);
    this.docFile = null;
    this.uploadForm = {
      driverId: doc.driverId?.toString() || '',
      category: doc.category,
      subCategory: doc.subCategory || '',
      documentName: doc.documentName,
      documentNumber: doc.documentNumber || '',
      issueDate: doc.issueDate ? new Date(doc.issueDate).toISOString().split('T')[0] : '',
      expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString().split('T')[0] : '',
      notes: doc.notes || '',
      remindExpiry: doc.remindExpiry ?? true
    };
    this.showUploadModal.set(true);
  }

  closeUploadModal(): void {
    this.showUploadModal.set(false);
    this.editingDoc.set(null);
    this.docFile = null;
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.docFile = input.files[0];
  }

  saveDocument(): void {
    if (!this.uploadForm.driverId) { this.toast.error('Select a driver', 'Required'); return; }
    if (!this.uploadForm.documentName.trim()) { this.toast.error('Document name is required', 'Required'); return; }
    this.saving.set(true);

    const fd = new FormData();
    fd.append('driverId', this.uploadForm.driverId);
    fd.append('category', this.uploadForm.category);
    fd.append('subCategory', this.uploadForm.subCategory);
    fd.append('documentName', this.uploadForm.documentName);
    fd.append('documentNumber', this.uploadForm.documentNumber);
    if (this.uploadForm.issueDate) fd.append('issueDate', this.uploadForm.issueDate);
    if (this.uploadForm.expiryDate) fd.append('expiryDate', this.uploadForm.expiryDate);
    fd.append('notes', this.uploadForm.notes);
    fd.append('remindExpiry', this.uploadForm.remindExpiry.toString());
    if (this.docFile) fd.append('file', this.docFile);

    const obs = this.editingDoc()
      ? this.api.updateDriverDocument(this.editingDoc().id.toString(), fd)
      : this.api.createDriverDocument(fd);

    obs.subscribe({
      next: () => {
        this.toast.success(this.editingDoc() ? 'Document updated' : 'Document uploaded', 'Success');
        if (this.editingDoc()) {
          this.tracking.trackUpdate('DriverDocument', this.editingDoc().id, this.uploadForm.documentName);
        } else {
          this.tracking.trackUpload(this.uploadForm.category, this.uploadForm.documentName, this.docFile?.size);
        }
        this.saving.set(false);
        this.closeUploadModal();
        this.loadDocuments();
        this.loadSummary();
      },
      error: (err) => {
        this.toast.error(err?.error?.error || 'Failed to save document', 'Error');
        this.saving.set(false);
      }
    });
  }

  async deleteDocument(doc: any) {
    const ok = await this.confirm.show({ message: `Delete "${doc.documentName}"?`, type: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    this.api.deleteDriverDocument(doc.id.toString()).subscribe({
      next: () => { this.toast.success('Document deleted', 'Deleted'); this.tracking.trackDelete('DriverDocument', doc.id, doc.documentName); this.loadDocuments(); this.loadSummary(); },
      error: () => this.toast.error('Failed to delete', 'Error')
    });
  }

  viewDoc(doc: any): void {
    this.api.viewDriverDocumentFile(doc.id.toString()).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.toast.error('Failed to load document', 'Error')
    });
  }

  downloadDoc(doc: any): void {
    this.api.downloadDriverDocumentFile(doc.id.toString()).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = doc.fileName || 'document';
        a.click();
      },
      error: () => this.toast.error('Failed to download', 'Error')
    });
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getSubCategoryLabel(cat: string, sub: string): string {
    const category = this.categories.find(c => c.key === cat);
    return category?.subcategories.find(s => s.value === sub)?.label || sub || '—';
  }
}
