import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

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
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of motivReports">
                <td>{{ row.name }}</td>
                <td>{{ row.section }}</td>
                <td>{{ row.filters }}</td>
                <td>{{ row.output }}</td>
              </tr>
            </tbody>
          </table>
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
  `]
})
export class ReportsComponent {
  selectedReportTile = signal<'none' | 'motiv'>('none');

  readonly motivReports = [
    {
      name: 'Driver Activity Report',
      section: 'MOTIV > Activity',
      filters: 'All active/inactive/specific driver, year, week',
      output: 'PDF (detailed table)'
    },
    {
      name: 'Safety Events Report (Detailed)',
      section: 'MOTIV > Safety Cam',
      filters: 'All active/inactive/specific driver, year, week',
      output: 'PDF (event-by-event table)'
    },
    {
      name: 'Safety Events Report (Summary)',
      section: 'MOTIV > Safety Cam',
      filters: 'All active/inactive/specific driver, year, week',
      output: 'PDF (totals and grouped rollups)'
    },
    {
      name: 'Fuel Statement Report',
      section: 'MOTIV > Fuel',
      filters: 'Current fuel filters + active-driver matching',
      output: 'PDF (statement-style with totals)'
    }
  ];

  selectReportTile(tile: 'motiv'): void {
    this.selectedReportTile.set(this.selectedReportTile() === tile ? 'none' : tile);
  }
}
