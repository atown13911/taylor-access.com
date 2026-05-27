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
  key: 'activity' | 'safety-detailed' | 'safety-summary' | 'fuel';
};

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
                    (click)="generateMotivReport(row)">
                    <i class="bx" [ngClass]="generatingReportKey() === row.key ? 'bx-loader-alt bx-spin' : 'bx-play-circle'"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="error" *ngIf="reportError()">{{ reportError() }}</p>
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
  `]
})
export class ReportsComponent {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  selectedReportTile = signal<'none' | 'motiv'>('none');
  generatingReportKey = signal<MotivReportRow['key'] | ''>('');
  reportError = signal('');

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

  selectReportTile(tile: 'motiv'): void {
    this.selectedReportTile.set(this.selectedReportTile() === tile ? 'none' : tile);
  }

  async generateMotivReport(row: MotivReportRow): Promise<void> {
    if (this.generatingReportKey()) return;
    this.reportError.set('');
    this.generatingReportKey.set(row.key);
    try {
      if (row.key === 'activity') {
        await this.generateActivityReport();
      } else if (row.key === 'safety-detailed') {
        await this.generateSafetyDetailedReport();
      } else if (row.key === 'safety-summary') {
        await this.generateSafetySummaryReport();
      } else {
        await this.generateFuelStatementReport();
      }
    } catch {
      this.reportError.set('Unable to generate selected report. Please try again.');
    } finally {
      this.generatingReportKey.set('');
    }
  }

  private async generateActivityReport(): Promise<void> {
    const rows = await this.fetchRows('/api/v1/motiv/activity-logs?limit=5000');
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

  private async generateSafetyDetailedReport(): Promise<void> {
    const rows = await this.fetchRows('/api/v1/motiv/safety-events?days=30&limit=5000');
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

  private async generateSafetySummaryReport(): Promise<void> {
    const rows = await this.fetchRows('/api/v1/motiv/safety-events?days=30&limit=5000');
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

  private async generateFuelStatementReport(): Promise<void> {
    const rows = await this.fetchRows('/api/v1/motiv/fuel-purchases');
    if (!rows.length) throw new Error('No rows');
    const mapped = rows.map((r: any) => {
      const date = this.firstText(r?.transaction_time, r?.date, r?.created_at, r?.timestamp, r?.event_time) || '';
      const amount = Number(r?.amount ?? r?.total_amount ?? r?.price ?? r?.charge_amount ?? 0);
      return {
        date: this.formatDateTime(date),
        merchant: this.firstText(r?.merchant_name, r?.merchant, r?.location_name) || 'N/A',
        driver: this.firstText(r?.driver_name, r?.driver_id, r?.driver?.name) || 'N/A',
        vehicle: this.firstText(r?.vehicle_number, r?.vehicle_id, r?.vehicle?.number) || 'N/A',
        amount: Number.isFinite(amount) ? amount : 0,
        status: this.firstText(r?.status, r?.transaction_status) || 'N/A'
      };
    }).sort((a, b) => this.asTime(b.date) - this.asTime(a.date));
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
