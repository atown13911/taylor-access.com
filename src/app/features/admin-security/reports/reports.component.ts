import { Component } from '@angular/core';
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
  `]
})
export class ReportsComponent {}
