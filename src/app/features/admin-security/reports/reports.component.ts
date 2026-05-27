import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { jsPDF } from 'jspdf';
import { environment } from '../../../../environments/environment';

type MotivReportRow = {
  name: string;
  section: string;
  filters: string;
  output: string;
  key: 'activity' | 'safety-detailed' | 'safety-summary' | 'fuel' | 'applicants-summary';
};
type ReportScope = 'all' | 'active' | 'inactive' | 'specific';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="reports-page">
      <div class="page-header">
        <h1><i class="bx bx-bar-chart-alt-2"></i> Reports</h1>
        <p>Central reporting section for admin-level exports, summaries, and analytics.</p>
      </div>

      <div class="reports-grid">
        <section class="report-card">
          <h3><i class="bx bx-shield-quarter"></i> Compliance Reports</h3>
          <p>DOT, insurance, and driver compliance rollups.</p>
          <ul>
            <li>Driver compliance summary</li>
            <li>DOT document status</li>
            <li>Insurance expiration overview</li>
          </ul>
        </section>

        <section class="report-card">
          <h3><i class="bx bx-group"></i> HR Reports</h3>
          <p>Employee and recruiting reporting snapshots.</p>
          <ul>
            <li>Roster activity trends</li>
            <li>Applicant conversion overview</li>
            <li>Time clock productivity summary</li>
          </ul>
        </section>

        <section class="report-card">
          <h3><i class="bx bxs-truck"></i> Fleet & MOTIV Reports</h3>
          <p>Driver, fuel, and safety-event reporting controls.</p>
          <ul>
            <li>Driver activity exports</li>
            <li>Fuel purchase statement outputs</li>
            <li>Dash cam safety event rollups</li>
          </ul>
        </section>

        <section
          class="report-card report-card-action"
          [class.active]="selectedReportTile() === 'motiv'"
          (click)="selectReportTile('motiv')">
          <h3><i class="bx bx-camera-movie"></i> MOTIV Reports</h3>
          <p>Open all available MOTIV report outputs and export options.</p>
          <ul>
            <li>Fuel reports</li>
            <li>Safety cam reports</li>
            <li>Activity reports</li>
          </ul>
          <button class="report-btn" type="button">
            {{ selectedReportTile() === 'motiv' ? 'Showing Reports' : 'View MOTIV Reports' }}
          </button>
        </section>

        <section
          class="report-card report-card-action"
          [class.active]="selectedReportTile() === 'applicants'"
          (click)="selectReportTile('applicants')">
          <h3><i class="bx bx-user-plus"></i> Applicants Reports</h3>
          <p>Applicant pipeline and recruiting summary reports.</p>
          <ul>
            <li>Applicants roster summary</li>
            <li>Status distribution report</li>
            <li>Position/source breakdown</li>
          </ul>
          <button class="report-btn" type="button">
            {{ selectedReportTile() === 'applicants' ? 'Showing Reports' : 'View Applicants Reports' }}
          </button>
        </section>
      </div>

      <div class="motiv-reports-panel" *ngIf="selectedReportTile() === 'motiv'">
        <div class="panel-header">
          <h2><i class="bx bx-table"></i> Available MOTIV Reports</h2>
          <p>Current report options available from the MOTIV area.</p>
        </div>
        <div class="table-wrap">
          <table class="reports-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Section</th>
                <th>Scope / Filters</th>
                <th>Output</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of motivReports">
                <td>{{ row.name }}</td>
                <td>{{ row.section }}</td>
                <td>{{ row.filters }}</td>
                <td>{{ row.output }}</td>
                <td>
                  <button
                    class="action-icon-btn"
                    type="button"
                    [attr.aria-label]="'Generate ' + row.name"
                    [title]="'Generate ' + row.name"
                    [disabled]="generatingReportKey() === row.key"
                    (click)="openCriteriaModal(row)">
                    <i class="bx" [ngClass]="generatingReportKey() === row.key ? 'bx-loader-alt bx-spin' : 'bx-play-circle'"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="error" *ngIf="reportError()">{{ reportError() }}</p>
      </div>

      <div class="motiv-reports-panel" *ngIf="selectedReportTile() === 'applicants'">
        <div class="panel-header">
          <h2><i class="bx bx-table"></i> Available Applicants Reports</h2>
          <p>Current report options available from Applicants.</p>
        </div>
        <div class="table-wrap">
          <table class="reports-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Section</th>
                <th>Scope / Filters</th>
                <th>Output</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of applicantsReports">
                <td>{{ row.name }}</td>
                <td>{{ row.section }}</td>
                <td>{{ row.filters }}</td>
                <td>{{ row.output }}</td>
                <td>
                  <button
                    class="action-icon-btn"
                    type="button"
                    [attr.aria-label]="'Generate ' + row.name"
                    [title]="'Generate ' + row.name"
                    [disabled]="generatingReportKey() === row.key"
                    (click)="openCriteriaModal(row)">
                    <i class="bx" [ngClass]="generatingReportKey() === row.key ? 'bx-loader-alt bx-spin' : 'bx-play-circle'"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="error" *ngIf="reportError()">{{ reportError() }}</p>
      </div>

      <div class="criteria-modal-backdrop" *ngIf="criteriaModalOpen()" (click)="closeCriteriaModal()">
        <div class="criteria-modal" (click)="$event.stopPropagation()">
          <h3>Generate {{ selectedCriteriaReport()?.name || 'Report' }}</h3>
          <p>Select criteria for this report.</p>
          <div class="criteria-grid" *ngIf="selectedCriteriaReport() as report">
            <label *ngIf="supportsScope(report.key)">
              Scope
              <select class="criteria-input" [value]="criteriaScope()" (change)="setCriteriaScope($any($event.target).value)">
                <option value="all">All Drivers</option>
                <option value="active">All Active Drivers</option>
                <option value="inactive">All Inactive Drivers</option>
                <option value="specific">Specific Driver</option>
              </select>
            </label>
            <label *ngIf="supportsScope(report.key) && criteriaScope() === 'specific'">
              Driver
              <select class="criteria-input" [value]="criteriaSpecificDriver()" (change)="criteriaSpecificDriver.set($any($event.target).value)">
                <option value="">Select driver</option>
                <option *ngFor="let d of criteriaDriverOptions()" [value]="d">{{ d }}</option>
              </select>
            </label>
            <label *ngIf="supportsDays(report.key)">
              Days
              <select class="criteria-input" [value]="criteriaDays()" (change)="setCriteriaDays(+$any($event.target).value)">
                <option [value]="7">Last 7 days</option>
                <option [value]="14">Last 14 days</option>
                <option [value]="30">Last 30 days</option>
                <option [value]="90">Last 90 days</option>
              </select>
            </label>
            <label *ngIf="supportsYearWeek(report.key)">
              Year
              <select class="criteria-input" [value]="criteriaYear()" (change)="setCriteriaYear($any($event.target).value)">
                <option value="all">All Years</option>
                <option *ngFor="let y of criteriaYearOptions()" [value]="y.toString()">{{ y }}</option>
              </select>
            </label>
            <label *ngIf="supportsYearWeek(report.key)">
              Week
              <select class="criteria-input" [value]="criteriaWeek()" (change)="criteriaWeek.set($any($event.target).value)">
                <option value="all">All Weeks</option>
                <option *ngFor="let w of criteriaWeekOptions()" [value]="w.key">{{ w.label }}</option>
              </select>
            </label>
          </div>
          <p class="error" *ngIf="criteriaError()">{{ criteriaError() }}</p>
          <div class="criteria-actions">
            <button class="report-btn" type="button" (click)="closeCriteriaModal()">Cancel</button>
            <button class="report-btn" type="button" (click)="generateFromCriteria()" [disabled]="criteriaLoading() || !selectedCriteriaReport()">
              {{ criteriaLoading() ? 'Preparing...' : 'Generate' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .reports-page {
      padding: 4px 0 0;
      color: var(--text-primary);
    }
    .page-header {
      margin-bottom: 16px;
    }
    .page-header h1 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 24px;
      color: #dbeafe;
    }
    .page-header p {
      margin: 6px 0 0;
      color: #93c5fd;
      font-size: 13px;
    }
    .reports-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
    }
    .report-card {
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.5);
      padding: 12px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .report-card h3 {
      margin: 0 0 8px;
      font-size: 15px;
      color: #dbeafe;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .report-card p {
      margin: 0 0 8px;
      color: #93c5fd;
      font-size: 12px;
    }
    .report-card ul {
      margin: 0;
      padding-left: 16px;
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.45;
    }
    .report-card-action {
      cursor: pointer;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    }
    .report-card-action:hover {
      border-color: rgba(56, 189, 248, 0.5);
      transform: translateY(-1px);
    }
    .report-card-action.active {
      border-color: rgba(56, 189, 248, 0.8);
      box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.45), 0 10px 24px rgba(2, 132, 199, 0.25);
    }
    .report-btn {
      margin-top: 10px;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid rgba(56, 189, 248, 0.6);
      background: rgba(2, 132, 199, 0.15);
      color: #e0f2fe;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .motiv-reports-panel {
      margin-top: 14px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.52);
      padding: 12px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .panel-header h2 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 17px;
      color: #dbeafe;
    }
    .panel-header p {
      margin: 6px 0 10px;
      color: #93c5fd;
      font-size: 12px;
    }
    .table-wrap {
      overflow-x: auto;
    }
    .reports-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
      color: #dbeafe;
      font-size: 12px;
    }
    .reports-table th,
    .reports-table td {
      border-bottom: 1px solid rgba(148, 163, 184, 0.22);
      text-align: left;
      padding: 8px 10px;
      vertical-align: top;
    }
    .reports-table th {
      color: #bfdbfe;
      font-weight: 700;
      background: rgba(15, 23, 42, 0.62);
    }
    .action-icon-btn {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid rgba(56, 189, 248, 0.55);
      background: rgba(2, 132, 199, 0.16);
      color: #e0f2fe;
      cursor: pointer;
      transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
    }
    .action-icon-btn:hover {
      background: rgba(2, 132, 199, 0.28);
      border-color: rgba(56, 189, 248, 0.75);
      transform: translateY(-1px);
    }
    .action-icon-btn i {
      font-size: 16px;
    }
    .action-icon-btn:disabled {
      opacity: 0.7;
      cursor: default;
      transform: none;
    }
    .error {
      margin: 10px 0 0;
      color: #fca5a5;
      font-size: 12px;
    }
    .criteria-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1500;
      padding: 16px;
    }
    .criteria-modal {
      width: min(680px, 100%);
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: #0f172a;
      box-shadow: 0 16px 44px rgba(2, 6, 23, 0.55);
      padding: 14px;
    }
    .criteria-modal h3 {
      margin: 0;
      color: #dbeafe;
      font-size: 16px;
    }
    .criteria-modal p {
      margin: 6px 0 10px;
      color: #93c5fd;
      font-size: 12px;
    }
    .criteria-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .criteria-grid label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: #cbd5e1;
      font-size: 12px;
    }
    .criteria-input {
      height: 34px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(15, 23, 42, 0.8);
      color: #e2e8f0;
      padding: 0 10px;
      font-size: 12px;
    }
    .criteria-actions {
      margin-top: 12px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `]
})
export class ReportsComponent {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  selectedReportTile = signal<'none' | 'motiv' | 'applicants'>('none');
  generatingReportKey = signal<MotivReportRow['key'] | ''>('');
  reportError = signal('');
  criteriaModalOpen = signal(false);
  criteriaLoading = signal(false);
  criteriaError = signal('');
  selectedCriteriaReport = signal<MotivReportRow | null>(null);
  criteriaRows = signal<any[]>([]);
  criteriaScope = signal<ReportScope>('all');
  criteriaSpecificDriver = signal('');
  criteriaYear = signal<string>('all');
  criteriaWeek = signal<string>('all');
  criteriaDays = signal<number>(30);
  criteriaDriverOptions = signal<string[]>([]);
  criteriaYearOptions = signal<number[]>([]);
  criteriaWeekOptions = signal<Array<{ key: string; label: string }>>([]);
  private driverStatusCache: { active: Set<string>; inactive: Set<string> } | null = null;

  readonly motivReports: MotivReportRow[] = [
    {
      name: 'Driver Activity Report',
      section: 'MOTIV > Activity',
      filters: 'All active/inactive/specific driver, year, week',
      output: 'PDF (detailed table)',
      key: 'activity'
    },
    {
      name: 'Safety Events Report (Detailed)',
      section: 'MOTIV > Safety Cam',
      filters: 'All active/inactive/specific driver, year, week',
      output: 'PDF (event-by-event table)',
      key: 'safety-detailed'
    },
    {
      name: 'Safety Events Report (Summary)',
      section: 'MOTIV > Safety Cam',
      filters: 'All active/inactive/specific driver, year, week',
      output: 'PDF (totals and grouped rollups)',
      key: 'safety-summary'
    },
    {
      name: 'Fuel Statement Report',
      section: 'MOTIV > Fuel',
      filters: 'Current fuel filters + active-driver matching',
      output: 'PDF (statement-style with totals)',
      key: 'fuel'
    }
  ];

  readonly applicantsReports: MotivReportRow[] = [
    {
      name: 'Applicants Summary Report',
      section: 'Applicants > Records',
      filters: 'Year/week (optional)',
      output: 'PDF (applicant table + status summary)',
      key: 'applicants-summary'
    }
  ];

  selectReportTile(tile: 'motiv' | 'applicants'): void {
    this.selectedReportTile.set(this.selectedReportTile() === tile ? 'none' : tile);
  }

  supportsScope(key: MotivReportRow['key']): boolean {
    return key === 'activity' || key === 'safety-detailed' || key === 'safety-summary';
  }

  supportsYearWeek(key: MotivReportRow['key']): boolean {
    return key === 'activity' || key === 'safety-detailed' || key === 'safety-summary' || key === 'fuel' || key === 'applicants-summary';
  }

  supportsDays(key: MotivReportRow['key']): boolean {
    return key === 'safety-detailed' || key === 'safety-summary';
  }

  async openCriteriaModal(row: MotivReportRow): Promise<void> {
    if (this.generatingReportKey()) return;
    this.criteriaError.set('');
    this.reportError.set('');
    this.selectedCriteriaReport.set(row);
    this.criteriaScope.set('all');
    this.criteriaSpecificDriver.set('');
    this.criteriaYear.set('all');
    this.criteriaWeek.set('all');
    if (!this.supportsDays(row.key)) {
      this.criteriaDays.set(30);
    }
    this.criteriaModalOpen.set(true);
    await this.loadCriteriaRows();
  }

  closeCriteriaModal(): void {
    if (this.criteriaLoading()) return;
    this.criteriaModalOpen.set(false);
    this.criteriaError.set('');
  }

  setCriteriaScope(value: ReportScope): void {
    const normalized: ReportScope = value === 'active' || value === 'inactive' || value === 'specific' ? value : 'all';
    this.criteriaScope.set(normalized);
    if (normalized !== 'specific') this.criteriaSpecificDriver.set('');
    this.criteriaError.set('');
  }

  setCriteriaYear(value: string): void {
    this.criteriaYear.set(value || 'all');
    this.criteriaWeek.set('all');
    this.refreshCriteriaWeekOptions();
    this.criteriaError.set('');
  }

  async setCriteriaDays(value: number): Promise<void> {
    const normalized = Math.max(1, Math.min(365, Number(value || 30)));
    this.criteriaDays.set(normalized);
    await this.loadCriteriaRows();
  }

  async generateFromCriteria(): Promise<void> {
    const report = this.selectedCriteriaReport();
    if (!report || this.generatingReportKey()) return;
    this.criteriaError.set('');
    this.reportError.set('');
    this.criteriaLoading.set(true);
    this.generatingReportKey.set(report.key);
    try {
      const filteredRows = await this.applyCriteriaFilters(this.criteriaRows(), report.key);
      if (!filteredRows.length) {
        this.criteriaError.set('No rows found for the selected criteria.');
        return;
      }
      if (report.key === 'activity') {
        await this.generateActivityReport(filteredRows);
      } else if (report.key === 'safety-detailed') {
        await this.generateSafetyDetailedReport(filteredRows);
      } else if (report.key === 'safety-summary') {
        await this.generateSafetySummaryReport(filteredRows);
      } else if (report.key === 'applicants-summary') {
        await this.generateApplicantsSummaryReport(filteredRows);
      } else {
        await this.generateFuelStatementReport(filteredRows);
      }
      this.criteriaModalOpen.set(false);
    } catch {
      this.criteriaError.set('Unable to generate selected report with these criteria.');
    } finally {
      this.criteriaLoading.set(false);
      this.generatingReportKey.set('');
    }
  }

  private async loadCriteriaRows(): Promise<void> {
    const report = this.selectedCriteriaReport();
    if (!report) return;
    this.criteriaLoading.set(true);
    this.criteriaError.set('');
    try {
      const path = this.getRowsPath(report.key);
      const rows = await this.fetchRows(path);
      this.criteriaRows.set(rows);
      this.criteriaDriverOptions.set(this.collectDriverOptions(rows, report.key));
      this.criteriaYearOptions.set(this.collectYearOptions(rows, report.key));
      this.refreshCriteriaWeekOptions();
    } catch {
      this.criteriaRows.set([]);
      this.criteriaDriverOptions.set([]);
      this.criteriaYearOptions.set([]);
      this.criteriaWeekOptions.set([]);
      this.criteriaError.set('Unable to load data for criteria selection.');
    } finally {
      this.criteriaLoading.set(false);
    }
  }

  private getRowsPath(key: MotivReportRow['key']): string {
    if (key === 'activity') return '/api/v1/motiv/activity-logs?limit=5000';
    if (key === 'fuel') return '/api/v1/motiv/fuel-purchases';
    if (key === 'applicants-summary') return '/api/v1/applicants/records';
    const days = Math.max(1, Math.min(365, Number(this.criteriaDays() || 30)));
    return `/api/v1/motiv/safety-events?days=${days}&limit=5000`;
  }

  private refreshCriteriaWeekOptions(): void {
    const report = this.selectedCriteriaReport();
    if (!report || !this.supportsYearWeek(report.key)) {
      this.criteriaWeekOptions.set([]);
      return;
    }
    const yearFilter = this.criteriaYear();
    const weekMap = new Map<string, string>();
    for (const row of this.criteriaRows()) {
      const ts = this.extractTimestamp(row, report.key);
      if (!ts) continue;
      const iso = this.getIsoWeekInfo(new Date(ts));
      if (yearFilter !== 'all' && String(iso.year) !== yearFilter) continue;
      weekMap.set(iso.key, `W${iso.week} (${iso.year})`);
    }
    this.criteriaWeekOptions.set(
      Array.from(weekMap.entries()).map(([key, label]) => ({ key, label })).sort((a, b) => b.key.localeCompare(a.key))
    );
  }

  private collectDriverOptions(rows: any[], key: MotivReportRow['key']): string[] {
    const names = new Set<string>();
    for (const row of rows) {
      const name = this.extractDriverName(row, key).trim();
      if (!name || name.toLowerCase() === 'n/a') continue;
      names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }

  private collectYearOptions(rows: any[], key: MotivReportRow['key']): number[] {
    const years = new Set<number>();
    for (const row of rows) {
      const ts = this.extractTimestamp(row, key);
      if (!ts) continue;
      years.add(this.getIsoWeekInfo(new Date(ts)).year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }

  private async applyCriteriaFilters(rows: any[], key: MotivReportRow['key']): Promise<any[]> {
    let filtered = [...rows];

    if (this.supportsYearWeek(key)) {
      const yearFilter = this.criteriaYear();
      const weekFilter = this.criteriaWeek();
      filtered = filtered.filter((row) => {
        const ts = this.extractTimestamp(row, key);
        if (!ts) return false;
        const iso = this.getIsoWeekInfo(new Date(ts));
        const yearOk = yearFilter === 'all' || String(iso.year) === yearFilter;
        const weekOk = weekFilter === 'all' || iso.key === weekFilter;
        return yearOk && weekOk;
      });
    }

    if (this.supportsScope(key)) {
      const scope = this.criteriaScope();
      if (scope === 'specific') {
        const target = String(this.criteriaSpecificDriver() || '').trim().toLowerCase();
        if (!target) {
          this.criteriaError.set('Choose a specific driver.');
          return [];
        }
        filtered = filtered.filter((row) => this.extractDriverName(row, key).trim().toLowerCase() === target);
      } else if (scope === 'active' || scope === 'inactive') {
        const set = await this.getDriverStatusSet(scope);
        filtered = filtered.filter((row) => set.has(this.extractDriverName(row, key).trim().toLowerCase()));
      }
    }

    return filtered;
  }

  private async getDriverStatusSet(scope: 'active' | 'inactive'): Promise<Set<string>> {
    if (!this.driverStatusCache) {
      const rows = await this.fetchRows('/api/v1/drivers?limit=2000&page=1');
      const active = new Set<string>();
      const inactive = new Set<string>();
      for (const row of rows) {
        const status = String(row?.status ?? row?.Status ?? '').trim().toLowerCase();
        const name = String(row?.name ?? row?.Name ?? row?.full_name ?? row?.FullName ?? '').trim().toLowerCase();
        if (!name) continue;
        if (this.isActiveLikeStatus(status)) active.add(name);
        else inactive.add(name);
      }
      this.driverStatusCache = { active, inactive };
    }
    return scope === 'active' ? this.driverStatusCache.active : this.driverStatusCache.inactive;
  }

  private extractTimestamp(row: any, key: MotivReportRow['key']): number {
    if (key === 'activity') {
      return this.asTime(row?.timestamp ?? row?.created_at ?? row?.createdAt);
    }
    if (key === 'fuel') {
      return this.asTime(row?.transaction_time ?? row?.date ?? row?.created_at ?? row?.timestamp ?? row?.event_time);
    }
    if (key === 'applicants-summary') {
      return this.asTime(row?.appliedDate ?? row?.applied_date ?? row?.CreatedAt ?? row?.createdAt);
    }
    const event = row?.driver_performance_event ?? row?.event ?? row ?? {};
    return this.asTime(
      event?.event_time ??
      event?.event_at ??
      event?.occurred_at ??
      event?.created_at ??
      event?.timestamp ??
      event?.start_time ??
      event?.startTime
    );
  }

  private extractDriverName(row: any, key: MotivReportRow['key']): string {
    if (key === 'activity') {
      return String(row?.driverName ?? row?.driver_name ?? 'General');
    }
    if (key === 'fuel') {
      return this.firstText(row?.driver_name, row?.driver_id, row?.driver?.name) || 'N/A';
    }
    if (key === 'applicants-summary') {
      return this.firstText(row?.fullName, row?.full_name, row?.name) || 'N/A';
    }
    const event = row?.driver_performance_event ?? row?.event ?? row ?? {};
    const driver = event?.driver ?? row?.driver ?? {};
    return this.firstText(
      `${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim(),
      driver?.name,
      event?.driver_name,
      event?.driver_id
    ) || 'N/A';
  }

  private isActiveLikeStatus(status: string): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'active'
      || normalized === 'enabled'
      || normalized === 'available'
      || normalized === 'online'
      || normalized === 'true';
  }

  private getIsoWeekInfo(dateInput: Date): { year: number; week: number; key: string } {
    const dt = new Date(Date.UTC(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate()));
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    const year = dt.getUTCFullYear();
    return { year, week, key: `${year}-W${String(week).padStart(2, '0')}` };
  }

  private async generateActivityReport(rowsInput?: any[]): Promise<void> {
    const rows = rowsInput ?? await this.fetchRows('/api/v1/motiv/activity-logs?limit=5000');
    if (!rows.length) throw new Error('No rows');
    const sorted = rows.sort((a: any, b: any) => this.asTime(b?.timestamp) - this.asTime(a?.timestamp));
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const columns = [
      { label: 'Time', width: 120 },
      { label: 'Driver', width: 120 },
      { label: 'Type', width: 60 },
      { label: 'Event', width: 420 }
    ];
    this.drawTableReport(doc, 'MOTIV Activity Report', `Rows: ${sorted.length.toLocaleString()}`, columns, sorted.map((r: any) => [
      this.formatDateTime(r?.timestamp),
      String(r?.driverName ?? r?.driver_name ?? 'General'),
      String(r?.kind ?? 'info').toUpperCase(),
      `${String(r?.title ?? r?.event ?? 'Activity')}${r?.details ? ` - ${JSON.stringify(r.details)}` : ''}`.slice(0, 450)
    ]));
    await this.openPdf('motiv-activity-report', doc);
  }

  private async generateSafetyDetailedReport(rowsInput?: any[]): Promise<void> {
    const rows = rowsInput ?? await this.fetchRows(`/api/v1/motiv/safety-events?days=${this.criteriaDays()}&limit=5000`);
    if (!rows.length) throw new Error('No rows');
    const mapped = rows.map((raw: any) => {
      const event = raw?.driver_performance_event ?? raw?.event ?? raw ?? {};
      const driver = event?.driver ?? raw?.driver ?? {};
      const vehicle = event?.vehicle ?? raw?.vehicle ?? {};
      const video = event?.downloadable_videos ?? event?.media?.downloadable_videos ?? raw?.downloadable_videos ?? {};
      const eventAt = this.firstText(event?.event_time, event?.event_at, event?.occurred_at, event?.created_at, event?.timestamp, event?.start_time, event?.startTime);
      const videoUrl = this.firstText(
        video?.dual_facing_enhanced_ai_url,
        video?.dual_facing_plain_url,
        video?.front_facing_plain_url,
        video?.driver_facing_plain_url,
        event?.video_url,
        raw?.video_url
      );
      return {
        at: this.formatDateTime(eventAt),
        type: this.firstText(event?.event_type, event?.type, event?.primary_behavior?.[0], event?.behaviors?.[0], event?.coachable_behaviors?.[0]) || 'N/A',
        severity: this.firstText(event?.severity, event?.priority, event?.risk_level, event?.intensity) || 'N/A',
        driver: this.firstText(`${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim(), driver?.name, event?.driver_name, event?.driver_id) || 'N/A',
        vehicle: this.firstText(vehicle?.number, vehicle?.unit_number, vehicle?.fleet_number, event?.vehicle_number, event?.vehicle_id) || 'N/A',
        status: this.firstText(event?.coaching_status, event?.status, event?.state) || 'N/A',
        media: videoUrl ? 'Video' : 'N/A'
      };
    });
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const columns = [
      { label: 'Date', width: 110 },
      { label: 'Event', width: 140 },
      { label: 'Severity', width: 65 },
      { label: 'Driver', width: 120 },
      { label: 'Vehicle', width: 70 },
      { label: 'Status', width: 100 },
      { label: 'Media', width: 55 }
    ];
    this.drawTableReport(doc, 'MOTIV Safety Events Report (Detailed)', `Rows: ${mapped.length.toLocaleString()}`, columns, mapped.map((r) => [
      r.at, r.type, r.severity, r.driver, r.vehicle, r.status, r.media
    ]));
    await this.openPdf('motiv-safety-detailed-report', doc);
  }

  private async generateSafetySummaryReport(rowsInput?: any[]): Promise<void> {
    const rows = rowsInput ?? await this.fetchRows(`/api/v1/motiv/safety-events?days=${this.criteriaDays()}&limit=5000`);
    if (!rows.length) throw new Error('No rows');
    const byType = new Map<string, number>();
    const byStatus = new Map<string, number>();
    const byDriver = new Map<string, number>();
    let withVideo = 0;
    for (const raw of rows) {
      const event = raw?.driver_performance_event ?? raw?.event ?? raw ?? {};
      const driver = event?.driver ?? raw?.driver ?? {};
      const video = event?.downloadable_videos ?? event?.media?.downloadable_videos ?? raw?.downloadable_videos ?? {};
      const eventType = this.firstText(event?.event_type, event?.type, event?.primary_behavior?.[0], event?.behaviors?.[0], event?.coachable_behaviors?.[0]) || 'N/A';
      const status = this.firstText(event?.coaching_status, event?.status, event?.state) || 'N/A';
      const driverName = this.firstText(`${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim(), driver?.name, event?.driver_name, event?.driver_id) || 'N/A';
      const videoUrl = this.firstText(
        video?.dual_facing_enhanced_ai_url,
        video?.dual_facing_plain_url,
        video?.front_facing_plain_url,
        video?.driver_facing_plain_url,
        event?.video_url,
        raw?.video_url
      );
      byType.set(eventType, (byType.get(eventType) ?? 0) + 1);
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
      byDriver.set(driverName, (byDriver.get(driverName) ?? 0) + 1);
      if (videoUrl) withVideo += 1;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    let y = 42;
    const left = 28;
    const line = (text: string, bold = false, spacing = 14): void => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(10);
      doc.text(text, left, y);
      y += spacing;
    };
    const divider = (): void => {
      doc.setDrawColor(165, 165, 165);
      doc.line(left, y, 580, y);
      y += 12;
    };
    line('MOTIV Safety Events Report (Summary)', true, 18);
    line(`Generated: ${new Date().toLocaleString()}`);
    line(`Total events: ${rows.length.toLocaleString()}`);
    line(`Events with video: ${withVideo.toLocaleString()}`);
    divider();
    line('Events by Type', true);
    Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => line(`${k}: ${v.toLocaleString()}`));
    divider();
    line('Events by Status', true);
    Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => line(`${k}: ${v.toLocaleString()}`));
    divider();
    line('Top Drivers', true);
    Array.from(byDriver.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => line(`${k}: ${v.toLocaleString()}`));
    await this.openPdf('motiv-safety-summary-report', doc);
  }

  private async generateFuelStatementReport(rowsInput?: any[]): Promise<void> {
    const rows = rowsInput ?? await this.fetchRows('/api/v1/motiv/fuel-purchases');
    if (!rows.length) throw new Error('No rows');
    const mapped = rows.map((r: any) => {
      const dateRaw = this.firstText(r?.transaction_time, r?.date, r?.created_at, r?.timestamp, r?.event_time) || '';
      const amount = Number(r?.amount ?? r?.total_amount ?? r?.price ?? r?.charge_amount ?? 0);
      return {
        sortAt: this.asTime(dateRaw),
        date: this.formatDateTime(dateRaw),
        merchant: this.firstText(r?.merchant_name, r?.merchant, r?.location_name) || 'N/A',
        driver: this.firstText(r?.driver_name, r?.driver_id, r?.driver?.name) || 'N/A',
        vehicle: this.firstText(r?.vehicle_number, r?.vehicle_id, r?.vehicle?.number) || 'N/A',
        amount: Number.isFinite(amount) ? amount : 0,
        status: this.firstText(r?.status, r?.transaction_status) || 'N/A'
      };
    }).sort((a, b) => b.sortAt - a.sortAt);
    const total = mapped.reduce((sum, r) => sum + r.amount, 0);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const columns = [
      { label: 'Date', width: 115 },
      { label: 'Merchant', width: 210 },
      { label: 'Driver', width: 130 },
      { label: 'Vehicle', width: 80 },
      { label: 'Amount', width: 80 },
      { label: 'Status', width: 110 }
    ];
    this.drawTableReport(
      doc,
      'MOTIV Fuel Statement Report',
      `Transactions: ${mapped.length.toLocaleString()} | Total: ${this.formatCurrency(total)}`,
      columns,
      mapped.map((r) => [r.date, r.merchant, r.driver, r.vehicle, this.formatCurrency(r.amount), r.status])
    );
    await this.openPdf('motiv-fuel-statement-report', doc);
  }

  private async generateApplicantsSummaryReport(rowsInput?: any[]): Promise<void> {
    const rows = rowsInput ?? await this.fetchRows('/api/v1/applicants/records');
    if (!rows.length) throw new Error('No rows');

    const positionGroupMap = await this.getApplicantPositionGroupMap();

    const mapped = rows.map((r: any) => {
      const appliedDate = this.asTime(r?.appliedDate ?? r?.applied_date ?? r?.createdAt ?? r?.CreatedAt);
      const position = this.toPdfSafeText(this.firstText(r?.position) || 'N/A');
      return {
        sortAt: appliedDate,
        name: this.toPdfSafeText(this.firstText(r?.fullName, r?.full_name, r?.name) || 'N/A'),
        position,
        source: this.toPdfSafeText(this.firstText(r?.source) || 'N/A'),
        status: this.toPdfSafeText(this.firstText(r?.status) || 'N/A'),
        appliedAt: this.formatDateTime(appliedDate),
        hasCv: !!r?.hasCv || !!r?.cvDataUrl || !!r?.CvDataUrl,
        section: this.resolveApplicantSection(position, positionGroupMap)
      };
    });

    const statusSummary = new Map<string, number>();
    const sourceGroups = new Map<string, typeof mapped>();
    for (const row of mapped) {
      const key = row.status.toLowerCase();
      statusSummary.set(key, (statusSummary.get(key) ?? 0) + 1);
      const sourceKey = row.source || 'N/A';
      const list = sourceGroups.get(sourceKey) ?? [];
      list.push(row);
      sourceGroups.set(sourceKey, list);
    }
    const statusText = Array.from(statusSummary.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const left = 24;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottom = pageHeight - 24;
    let y = 34;

    const groupsOrdered = Array.from(sourceGroups.entries())
      .map(([source, rowsForSource]) => ({
        source,
        rows: rowsForSource.sort((a, b) => b.sortAt - a.sortAt)
      }))
      .sort((a, b) => b.rows.length - a.rows.length || a.source.localeCompare(b.source));

    const sourceSummaryRows = groupsOrdered.map((g) => ({
      source: g.source,
      count: g.rows.length,
      pct: mapped.length > 0 ? (g.rows.length / mapped.length) * 100 : 0
    }));
    const withCvCount = mapped.filter((x) => x.hasCv).length;
    const topSource = sourceSummaryRows[0];
    const buildSourceGroups = (rowsForSection: typeof mapped) =>
      Array.from(
        rowsForSection.reduce((acc, row) => {
          const key = row.source || 'N/A';
          if (!acc.has(key)) acc.set(key, [] as typeof mapped);
          acc.get(key)!.push(row);
          return acc;
        }, new Map<string, typeof mapped>())
      )
        .map(([source, rows]) => ({ source, rows: rows.sort((a, b) => b.sortAt - a.sortAt) }))
        .sort((a, b) => b.rows.length - a.rows.length || a.source.localeCompare(b.source));

    const officeRows = mapped.filter((r) => r.section === 'Office');
    const fleetRows = mapped.filter((r) => r.section === 'Fleet');
    const sectionGroups = [
      { section: 'Office', rows: officeRows, sources: buildSourceGroups(officeRows) },
      { section: 'Fleet', rows: fleetRows, sources: buildSourceGroups(fleetRows) }
    ].filter((x) => x.rows.length > 0);

    const drawHeader = (): void => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Applicants Summary Report', left, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
      y += 12;
      doc.text(
        `Rows: ${mapped.length.toLocaleString()}${statusText ? ` | ${statusText}` : ''} | Sources: ${groupsOrdered.length}`,
        left,
        y
      );
      y += 16;
    };

    const drawSourceSummary = (): void => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Per Source Summary', left, y);
      y += 12;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      for (const summary of sourceSummaryRows) {
        const text = `${summary.source}: ${summary.count.toLocaleString()} (${summary.pct.toFixed(1)}%)`;
        if (y + 12 > bottom) {
          doc.addPage();
          y = 24;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text('Per Source Summary (cont.)', left, y);
          y += 12;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
        }
        doc.text(text, left + 2, y);
        y += 10;
      }
      y += 8;
    };

    const drawDashTiles = (): void => {
      const gap = 10;
      const tileWidth = (pageWidth - (left * 2) - (gap * 3)) / 4;
      const tileHeight = 48;
      const tileTop = y;
      const tileData = [
        { label: 'Total Applicants', value: mapped.length.toLocaleString() },
        { label: 'Unique Sources', value: groupsOrdered.length.toLocaleString() },
        { label: 'With CV', value: `${withCvCount.toLocaleString()} (${mapped.length ? ((withCvCount / mapped.length) * 100).toFixed(1) : '0.0'}%)` },
        { label: 'Top Source', value: topSource ? `${topSource.source} (${topSource.count})` : 'N/A' }
      ];

      for (let i = 0; i < tileData.length; i += 1) {
        const x = left + i * (tileWidth + gap);
        doc.setFillColor(245, 248, 252);
        doc.setDrawColor(180, 190, 205);
        doc.roundedRect(x, tileTop, tileWidth, tileHeight, 4, 4, 'FD');
        doc.setTextColor(70, 85, 110);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(tileData[i].label, x + 8, tileTop + 14);
        doc.setTextColor(24, 39, 68);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        const valueLines = doc.splitTextToSize(String(tileData[i].value), tileWidth - 16);
        doc.text(valueLines[0] ?? '', x + 8, tileTop + 30);
      }
      doc.setTextColor(0, 0, 0);
      y += tileHeight + 14;
    };

    const columns = [
      { label: 'Applicant', width: 210 },
      { label: 'Position', width: 220 },
      { label: 'Status', width: 120 },
      { label: 'Applied Date', width: 150 },
      { label: 'CV', width: 50 }
    ];

    const drawTableHeader = (): void => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      let x = left;
      for (const col of columns) {
        doc.text(col.label, x, y);
        x += col.width;
      }
      y += 11;
      doc.setDrawColor(165, 165, 165);
      doc.line(left, y - 7, pageWidth - left, y - 7);
      doc.setFont('helvetica', 'normal');
    };

    const ensureSpace = (lineCount: number): void => {
      const needed = Math.max(1, lineCount) * 10 + 10;
      if (y + needed > bottom) {
        doc.addPage();
        y = 24;
        drawTableHeader();
      }
    };

    const drawRow = (values: string[]): void => {
      const wrapped = columns.map((col, idx) => {
        const content = String(values[idx] ?? '');
        const lines = doc.splitTextToSize(content, Math.max(8, col.width - 4));
        return (lines.length ? lines : ['']) as string[];
      });
      const lineCount = wrapped.reduce((max, arr) => Math.max(max, arr.length), 1);
      ensureSpace(lineCount);
      for (let line = 0; line < lineCount; line += 1) {
        let x = left;
        for (let i = 0; i < columns.length; i += 1) {
          doc.text(wrapped[i][line] ?? '', x, y);
          x += columns[i].width;
        }
        y += 10;
      }
      y += 2;
    };

    const drawSourceHeading = (source: string, count: number): void => {
      ensureSpace(2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`Source: ${source} (${count.toLocaleString()})`, left, y);
      y += 12;
      doc.setFont('helvetica', 'normal');
    };

    const drawSectionHeading = (sectionName: string, count: number): void => {
      if (y + 18 > bottom) {
        doc.addPage();
        y = 24;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${sectionName} Section (${count.toLocaleString()})`, left, y);
      y += 10;
      doc.setDrawColor(120, 130, 145);
      doc.line(left, y, pageWidth - left, y);
      y += 8;
      doc.setFont('helvetica', 'normal');
    };

    drawHeader();
    drawDashTiles();
    drawSourceSummary();
    for (const section of sectionGroups) {
      drawSectionHeading(section.section, section.rows.length);
      for (const group of section.sources) {
        drawSourceHeading(group.source, group.rows.length);
        drawTableHeader();
        for (const row of group.rows) {
          drawRow([row.name, row.position, row.status, row.appliedAt, row.hasCv ? 'Yes' : 'No']);
        }
        y += 6;
      }
    }
    await this.openPdf('applicants-summary-report', doc);
  }

  private drawTableReport(
    doc: jsPDF,
    title: string,
    subtitle: string,
    columns: Array<{ label: string; width: number }>,
    rows: string[][]
  ): void {
    const left = 24;
    const pageWidth = doc.internal.pageSize.getWidth();
    const bottom = doc.internal.pageSize.getHeight() - 24;
    let y = 34;
    const drawHeader = (): void => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(title, left, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
      y += 12;
      doc.text(subtitle, left, y);
      y += 16;
    };
    const drawTableHeader = (): void => {
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      let x = left;
      for (const col of columns) {
        doc.text(col.label, x, y);
        x += col.width;
      }
      y += 11;
      doc.setDrawColor(165, 165, 165);
      doc.line(left, y - 7, pageWidth - left, y - 7);
      doc.setFont('courier', 'normal');
    };
    const ensureSpace = (lineCount: number): void => {
      const needed = Math.max(1, lineCount) * 10 + 8;
      if (y + needed > bottom) {
        doc.addPage();
        y = 24;
        drawTableHeader();
      }
    };
    const drawRow = (values: string[]): void => {
      const wrapped = columns.map((col, idx) => {
        const content = String(values[idx] ?? '');
        const lines = doc.splitTextToSize(content, Math.max(8, col.width - 4));
        return (lines.length ? lines : ['']) as string[];
      });
      const lineCount = wrapped.reduce((max, arr) => Math.max(max, arr.length), 1);
      ensureSpace(lineCount);
      for (let line = 0; line < lineCount; line += 1) {
        let x = left;
        for (let i = 0; i < columns.length; i += 1) {
          doc.text(wrapped[i][line] ?? '', x, y);
          x += columns[i].width;
        }
        y += 10;
      }
      y += 2;
    };
    drawHeader();
    drawTableHeader();
    rows.forEach((r) => drawRow(r));
  }

  private async fetchRows(path: string): Promise<any[]> {
    const res = await firstValueFrom(this.http.get<any>(`${this.apiUrl}${path}`));
    const payload = res?.data ?? res;
    return this.extractRows(payload);
  }

  private extractRows(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.rows)) return payload.rows;
    if (Array.isArray(payload?.activity_logs)) return payload.activity_logs;
    if (Array.isArray(payload?.driver_performance_events)) return payload.driver_performance_events;
    if (Array.isArray(payload?.events)) return payload.events;
    if (Array.isArray(payload?.fuel_purchases)) return payload.fuel_purchases;
    if (Array.isArray(payload?.transactions)) return payload.transactions;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  private firstText(...values: any[]): string {
    for (const value of values) {
      if (Array.isArray(value)) {
        const nested = this.firstText(...value);
        if (nested) return nested;
        continue;
      }
      const text = String(value ?? '').trim();
      if (!text) continue;
      const normalized = text.toLowerCase();
      if (normalized === 'n/a' || normalized === 'null' || normalized === 'undefined') continue;
      return text;
    }
    return '';
  }

  private asTime(value: any): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = new Date(value ?? '').getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private formatDateTime(value: any): string {
    const t = this.asTime(value);
    if (!t) return 'N/A';
    return new Date(t).toLocaleString();
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(Number.isFinite(value) ? value : 0);
  }

  private toPdfSafeText(value: string): string {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async getApplicantPositionGroupMap(): Promise<Map<string, 'office' | 'fleet'>> {
    try {
      const rows = await this.fetchRows('/api/v1/applicants/positions');
      const map = new Map<string, 'office' | 'fleet'>();
      for (const row of rows) {
        const name = this.firstText(row?.name, row?.Name).toLowerCase();
        if (!name) continue;
        const groupText = this.firstText(row?.group, row?.Group).toLowerCase();
        const group = groupText === 'office' ? 'office' : 'fleet';
        map.set(name, group);
      }
      return map;
    } catch {
      return new Map<string, 'office' | 'fleet'>();
    }
  }

  private resolveApplicantSection(
    position: string,
    positionGroupMap: Map<string, 'office' | 'fleet'>
  ): 'Office' | 'Fleet' {
    const key = this.toPdfSafeText(position).toLowerCase();
    const mapped = key ? positionGroupMap.get(key) : undefined;
    if (mapped === 'office') return 'Office';
    if (mapped === 'fleet') return 'Fleet';
    return this.isFleetLikePosition(key) ? 'Fleet' : 'Office';
  }

  private isFleetLikePosition(value: string): boolean {
    const text = (value || '').toLowerCase();
    if (!text) return false;
    return text.includes('driver')
      || text.includes('fleet')
      || text.includes('truck')
      || text.includes('dispatch')
      || text.includes('broker')
      || text.includes('carrier')
      || text.includes('logistics')
      || text.includes('safety')
      || text.includes('compliance');
  }

  private async openPdf(baseName: string, doc: jsPDF): Promise<void> {
    const filename = `${baseName}-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
}
