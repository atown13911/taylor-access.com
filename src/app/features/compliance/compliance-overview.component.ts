import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-compliance-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="compliance-container">
      <div class="page-header">
        <div class="header-text">
          <h1><i class='bx bx-shield-alt-2'></i> DOT & Compliance Management</h1>
          <p class="subtitle">Federal Motor Carrier Safety Administration (FMCSA) compliance tracking</p>
        </div>
      </div>

      <div class="info-banner">
        <h3><i class='bx bx-info-circle'></i> Compliance Requirements Overview</h3>
        <p>This section helps you track and manage all DOT/FMCSA regulatory requirements for commercial motor carriers.</p>
      </div>

      <div class="requirements-grid">
        <!-- 1. Registrations -->
        <a routerLink="/compliance/registrations" class="requirement-card">
          <h4><i class='bx bx-id-card'></i> Registrations & Authority</h4>
          <p><strong>USDOT Number, MC Authority, UCR, IRP</strong></p>
          <p>Track federal registrations and operating authority. Biennial USDOT renewal, annual UCR fees, IRP cab cards.</p>
          <span class="status-badge pending">Setup Required</span>
        </a>

        <!-- 2. Insurance -->
        <a routerLink="/compliance/insurance" class="requirement-card">
          <h4><i class='bx bx-dollar-circle'></i> Insurance & Financial Responsibility</h4>
          <p><strong>Liability, Cargo, MCS-90</strong></p>
          <p>Minimum $750K liability (general freight), $1M-$5M (hazmat). File MCS-90 endorsement with FMCSA.</p>
          <span class="status-badge pending">Setup Required</span>
        </a>

        <!-- 3. Driver Files -->
        <a routerLink="/compliance/driver-files" class="requirement-card">
          <h4><i class='bx bx-folder-open'></i> Driver Qualification Files</h4>
          <p><strong>DQF, MVR, Medical Cert, Road Test</strong></p>
          <p>Application, 3-year MVR, violations list, medical certificate, road test/equivalent, annual reviews.</p>
          <span class="status-badge pending">Setup Required</span>
        </a>

        <!-- 4. Drug Testing -->
        <a routerLink="/compliance/drug-testing" class="requirement-card">
          <h4><i class='bx bx-test-tube'></i> Drug & Alcohol Testing</h4>
          <p><strong>Consortium, Clearinghouse, Random Testing</strong></p>
          <p>DOT-approved consortium enrollment, FMCSA Clearinghouse registration, pre-employment, random, post-accident testing.</p>
          <span class="status-badge pending">Setup Required</span>
        </a>

        <!-- 5. HOS -->
        <a routerLink="/compliance/hos" class="requirement-card">
          <h4><i class='bx bx-time'></i> Hours of Service (HOS)</h4>
          <p><strong>ELD, Logs, Supporting Documents</strong></p>
          <p>Electronic Logging Device (ELD) mandatory. Record duty status, retain logs/supporting docs for 6 months.</p>
          <span class="status-badge pending">Setup Required</span>
        </a>

        <!-- 6. Vehicle Inspections -->
        <a routerLink="/compliance/vehicle-inspections" class="requirement-card">
          <h4><i class='bx bx-check-shield'></i> Vehicle Inspections</h4>
          <p><strong>DVIR, Annual Inspections, Maintenance</strong></p>
          <p>Daily pre/post-trip (DVIR), annual inspections, defect correction, equipment requirements (fire extinguisher, triangles).</p>
          <span class="status-badge pending">Setup Required</span>
        </a>

        <!-- 7. IFTA -->
        <a routerLink="/compliance/ifta" class="requirement-card">
          <h4><i class='bx bx-receipt'></i> IFTA/IRP Reporting</h4>
          <p><strong>Fuel Tax, Quarterly Reports, Mileage Tracking</strong></p>
          <p>International Fuel Tax Agreement reporting. Track fuel purchases and miles by state. Quarterly filings required.</p>
          <span class="status-badge pending">Setup Required</span>
        </a>
      </div>

      <div class="coming-soon">
        <i class='bx bx-construction'></i>
        <h3>Compliance Management System</h3>
        <p>Full DOT compliance tracking system coming soon. Click any card above to access specific compliance areas.</p>
        <small>Features will include: Document upload, expiration tracking, automated reminders, compliance reports, and audit trails.</small>
      </div>
    </div>
  `,
  styles: [`@import './compliance-base.scss';`]
})
export class ComplianceOverviewComponent {}
