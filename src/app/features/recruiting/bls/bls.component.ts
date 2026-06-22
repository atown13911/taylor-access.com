import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { environment } from '../../../../environments/environment';

interface BlsSettings {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  defaultSeriesIds: string;
  startYear: string;
  endYear: string;
}

interface ConnectedApiRow {
  name: string;
  baseUrl: string;
  auth: string;
  configured: boolean;
  status: 'ok' | 'warning' | 'idle' | 'error';
  statusLabel: string;
  lastChecked: string;
}

@Component({
  selector: 'app-bls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bls-page">
      <header class="page-header">
        <div>
          <h1><i class='bx bx-line-chart'></i> BLS Labor Data</h1>
          <p>Bureau of Labor Statistics integration for recruiting and compensation market context.</p>
        </div>
        <a class="docs-link" href="https://www.bls.gov/developers/" target="_blank" rel="noopener noreferrer">
          <i class='bx bx-book-open'></i> BLS API Docs
        </a>
      </header>

      <section class="card">
        <div class="card-head">
          <h2>Connection Settings</h2>
          <label class="toggle">
            <input type="checkbox" [(ngModel)]="form.enabled" />
            <span>Enabled</span>
          </label>
        </div>

        <div class="form-grid">
          <label class="field full">
            <span>API Base URL</span>
            <input type="text" [(ngModel)]="form.apiBaseUrl" placeholder="https://api.bls.gov/publicAPI/v2/timeseries/data/" />
          </label>
          <label class="field">
            <span>API Key (optional)</span>
            <input type="password" [(ngModel)]="form.apiKey" placeholder="BLS registration key" />
          </label>
          <label class="field">
            <span>Default Series IDs (comma-separated)</span>
            <input type="text" [(ngModel)]="form.defaultSeriesIds" placeholder="OEUN0000000533032, CEU4348400001" />
          </label>
          <label class="field">
            <span>Start Year</span>
            <input type="text" [(ngModel)]="form.startYear" placeholder="2020" />
          </label>
          <label class="field">
            <span>End Year</span>
            <input type="text" [(ngModel)]="form.endYear" placeholder="2026" />
          </label>
        </div>

        <div class="actions">
          <button class="btn secondary" (click)="reload()" [disabled]="loading()">
            <i class='bx bx-refresh'></i> Reload
          </button>
          <button class="btn primary" (click)="save()" [disabled]="loading()">
            <i class='bx bx-save'></i> Save
          </button>
          <button class="btn accent" (click)="testConnection()" [disabled]="loading() || !form.enabled">
            <i class='bx bx-plug'></i> Test Connection
          </button>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Series Query</h2>
        </div>
        <div class="form-grid">
          <label class="field full">
            <span>Series IDs</span>
            <input type="text" [(ngModel)]="seriesIdsCsv" placeholder="OEUN0000000533032, CEU4348400001" />
          </label>
          <label class="field">
            <span>Start Year</span>
            <input type="text" [(ngModel)]="queryStartYear" placeholder="2020" />
          </label>
          <label class="field">
            <span>End Year</span>
            <input type="text" [(ngModel)]="queryEndYear" placeholder="2026" />
          </label>
        </div>
        <div class="actions">
          <button class="btn primary" (click)="querySeries()" [disabled]="loading() || !form.enabled">
            <i class='bx bx-search-alt-2'></i> Query Series
          </button>
        </div>
        @if (queryResult()) {
          <div class="op-result">
            <pre>{{ queryResult() }}</pre>
          </div>
        }
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Connected APIs</h2>
        </div>
        <div class="api-table-wrap">
          <table class="api-table">
            <thead>
              <tr>
                <th>API</th>
                <th>Base URL</th>
                <th>Auth</th>
                <th>Configured</th>
                <th>Status</th>
                <th>Last Checked</th>
              </tr>
            </thead>
            <tbody>
              @for (row of connectedApiRows(); track row.name) {
                <tr>
                  <td>{{ row.name }}</td>
                  <td class="mono">{{ row.baseUrl }}</td>
                  <td>{{ row.auth }}</td>
                  <td>
                    <span class="cfg-badge" [class.on]="row.configured" [class.off]="!row.configured">
                      {{ row.configured ? 'Yes' : 'No' }}
                    </span>
                  </td>
                  <td>
                    <span class="status-chip" [class.ok]="row.status === 'ok'" [class.warn]="row.status === 'warning'" [class.idle]="row.status === 'idle'" [class.err]="row.status === 'error'">
                      {{ row.statusLabel }}
                    </span>
                  </td>
                  <td>{{ row.lastChecked }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      @if (statusMessage()) {
        <section class="status" [class.error]="statusType() === 'error'" [class.success]="statusType() === 'success'">
          {{ statusMessage() }}
        </section>
      }
    </div>
  `,
  styles: [`
    .bls-page { padding: 20px; display: grid; gap: 16px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .page-header h1 { margin: 0; color: #7dd3fc; display: flex; align-items: center; gap: 8px; }
    .page-header p { margin: 6px 0 0; color: #9fb3c8; }
    .docs-link { color: #7dd3fc; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .card { background: rgba(11, 16, 30, 0.84); border: 1px solid #243447; border-radius: 12px; padding: 16px; display: grid; gap: 14px; }
    .card-head { display: flex; justify-content: space-between; align-items: center; }
    .card-head h2 { margin: 0; color: #e2e8f0; font-size: 1.05rem; }
    .toggle { display: inline-flex; align-items: center; gap: 8px; color: #cbd5e1; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .field { display: grid; gap: 6px; }
    .field.full { grid-column: 1 / -1; }
    .field span { color: #9fb3c8; font-size: 0.86rem; }
    .field input {
      width: 100%;
      background: rgba(2, 6, 23, 0.65);
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn { border: 1px solid transparent; border-radius: 8px; padding: 9px 14px; color: #f8fafc; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn.primary { background: #0369a1; border-color: #0ea5e9; }
    .btn.secondary { background: #1e293b; border-color: #334155; }
    .btn.accent { background: #14532d; border-color: #22c55e; }
    .status { border: 1px solid #334155; border-radius: 10px; padding: 10px 12px; color: #cbd5e1; background: rgba(15, 23, 42, 0.7); }
    .status.success { border-color: #166534; color: #86efac; background: rgba(20, 83, 45, 0.2); }
    .status.error { border-color: #7f1d1d; color: #fecaca; background: rgba(127, 29, 29, 0.2); }
    .api-table-wrap { overflow-x: auto; }
    .api-table { width: 100%; border-collapse: collapse; min-width: 860px; }
    .api-table th, .api-table td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #243447; color: #dbe7f3; font-size: 0.9rem; }
    .api-table th { color: #9fb3c8; font-weight: 600; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.82rem; color: #93c5fd; }
    .cfg-badge { display: inline-flex; border-radius: 999px; padding: 3px 10px; font-size: 0.75rem; border: 1px solid transparent; }
    .cfg-badge.on { background: rgba(22, 101, 52, 0.22); border-color: #166534; color: #86efac; }
    .cfg-badge.off { background: rgba(51, 65, 85, 0.32); border-color: #334155; color: #94a3b8; }
    .status-chip { display: inline-flex; border-radius: 999px; padding: 3px 10px; font-size: 0.75rem; border: 1px solid transparent; }
    .status-chip.ok { background: rgba(20, 83, 45, 0.2); border-color: #166534; color: #86efac; }
    .status-chip.warn { background: rgba(120, 53, 15, 0.2); border-color: #92400e; color: #fcd34d; }
    .status-chip.idle { background: rgba(51, 65, 85, 0.28); border-color: #334155; color: #cbd5e1; }
    .status-chip.err { background: rgba(127, 29, 29, 0.2); border-color: #7f1d1d; color: #fecaca; }
    .op-result { border: 1px solid #243447; border-radius: 8px; background: rgba(2, 6, 23, 0.6); padding: 10px; }
    .op-result pre { margin: 0; white-space: pre-wrap; color: #cbd5e1; font-size: 0.82rem; }
  `]
})
export class BlsComponent implements OnInit {
  private settings = inject(UserSettingsService);
  private http = inject(HttpClient);
  private readonly storageKey = 'integrations.bls.v1';
  private readonly apiUrl = environment.apiUrl;

  loading = signal(false);
  statusMessage = signal('');
  statusType = signal<'idle' | 'success' | 'error'>('idle');
  queryResult = signal('');
  lastTestStatus = signal<'idle' | 'success' | 'error'>('idle');
  lastTestAt = signal<string>('');

  form: BlsSettings = this.defaultForm();
  seriesIdsCsv = '';
  queryStartYear = '';
  queryEndYear = '';

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    let shouldAutoTest = false;
    this.loading.set(true);
    this.statusMessage.set('');
    try {
      const saved = await firstValueFrom(this.settings.get(this.storageKey));
      this.form = this.mergeDefaults(saved);
      this.seriesIdsCsv = this.form.defaultSeriesIds;
      this.queryStartYear = this.form.startYear;
      this.queryEndYear = this.form.endYear;
      if (!this.form.enabled && this.hasRunnableConfig(this.form)) {
        this.form.enabled = true;
      }
      shouldAutoTest = this.form.enabled && this.hasRunnableConfig(this.form);
      this.statusType.set('success');
      this.statusMessage.set('BLS settings loaded.');
    } catch {
      this.form = this.defaultForm();
      this.seriesIdsCsv = this.form.defaultSeriesIds;
      this.queryStartYear = this.form.startYear;
      this.queryEndYear = this.form.endYear;
      this.statusType.set('error');
      this.statusMessage.set('Unable to load saved BLS settings.');
    } finally {
      this.loading.set(false);
    }
    if (shouldAutoTest) {
      await this.testConnection();
    }
  }

  async save(): Promise<void> {
    let shouldAutoTest = false;
    this.loading.set(true);
    this.statusMessage.set('');
    try {
      this.form.defaultSeriesIds = this.seriesIdsCsv;
      this.form.startYear = this.queryStartYear;
      this.form.endYear = this.queryEndYear;
      if (!this.form.enabled && this.hasRunnableConfig(this.form)) {
        this.form.enabled = true;
      }
      await firstValueFrom(this.settings.set(this.storageKey, this.form));
      shouldAutoTest = this.form.enabled && this.hasRunnableConfig(this.form);
      this.statusType.set('success');
      this.statusMessage.set('BLS settings saved.');
    } catch {
      this.statusType.set('error');
      this.statusMessage.set('Failed to save BLS settings.');
    } finally {
      this.loading.set(false);
    }
    if (shouldAutoTest) {
      await this.testConnection();
    }
  }

  async testConnection(): Promise<void> {
    if (!this.form.enabled) {
      this.form.enabled = true;
    }
    this.loading.set(true);
    this.statusMessage.set('');
    try {
      const firstSeries = this.parseSeriesIds(this.seriesIdsCsv)[0] || 'OEUN0000000533032';
      const res = await firstValueFrom(
        this.http.post<any>(`${this.apiUrl}/api/v1/integrations/bls/test`, {
          apiBaseUrl: this.form.apiBaseUrl,
          apiKey: this.form.apiKey,
          seriesId: firstSeries
        })
      );

      if (res?.ok) {
        this.lastTestStatus.set('success');
        this.lastTestAt.set(this.nowLabel());
        this.statusType.set('success');
        this.statusMessage.set('BLS connection test succeeded.');
      } else {
        this.lastTestStatus.set('error');
        this.lastTestAt.set(this.nowLabel());
        this.statusType.set('error');
        this.statusMessage.set(`BLS test failed${res?.message ? `: ${res.message}` : '.'}`);
      }
      this.queryResult.set(JSON.stringify(res, null, 2));
    } catch (err: any) {
      const details = String(err?.error?.message || err?.message || 'Request failed');
      this.lastTestStatus.set('error');
      this.lastTestAt.set(this.nowLabel());
      this.statusType.set('error');
      this.statusMessage.set(`Connection test failed: ${details}`);
      this.queryResult.set(JSON.stringify({ ok: false, message: details }, null, 2));
    } finally {
      this.loading.set(false);
    }
  }

  async querySeries(): Promise<void> {
    const seriesIds = this.parseSeriesIds(this.seriesIdsCsv);
    if (!seriesIds.length) {
      this.statusType.set('error');
      this.statusMessage.set('Provide at least one BLS series ID.');
      return;
    }

    this.loading.set(true);
    this.statusMessage.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<any>(`${this.apiUrl}/api/v1/integrations/bls/series`, {
          apiBaseUrl: this.form.apiBaseUrl,
          apiKey: this.form.apiKey,
          seriesIds,
          startYear: this.queryStartYear,
          endYear: this.queryEndYear
        })
      );
      this.queryResult.set(JSON.stringify(res, null, 2));
      this.statusType.set(res?.ok ? 'success' : 'error');
      this.statusMessage.set(res?.ok ? 'BLS series query completed.' : `BLS query failed${res?.message ? `: ${res.message}` : '.'}`);
    } catch (err: any) {
      const details = String(err?.error?.message || err?.message || 'Request failed');
      this.statusType.set('error');
      this.statusMessage.set(`BLS query failed: ${details}`);
      this.queryResult.set(JSON.stringify({ ok: false, message: details }, null, 2));
    } finally {
      this.loading.set(false);
    }
  }

  connectedApiRows(): ConnectedApiRow[] {
    const hasSeries = this.parseSeriesIds(this.form.defaultSeriesIds).length > 0;
    const hasConfig = !!String(this.form.apiBaseUrl || '').trim() && hasSeries;
    const status = this.lastTestStatus();
    const statusLabel =
      status === 'success' ? 'Connected'
      : status === 'error' ? 'Failed test'
      : this.form.enabled ? 'Not tested' : 'Disabled';
    const chipStatus: ConnectedApiRow['status'] =
      status === 'success' ? 'ok'
      : status === 'error' ? 'error'
      : this.form.enabled ? 'warning' : 'idle';
    const checked = this.lastTestAt() || '—';

    return [
      {
        name: 'BLS Public Data API',
        baseUrl: this.form.apiBaseUrl || 'https://api.bls.gov/publicAPI/v2/timeseries/data/',
        auth: this.form.apiKey ? 'registrationkey' : 'Public (no key)',
        configured: hasConfig,
        status: chipStatus,
        statusLabel,
        lastChecked: checked
      },
      {
        name: 'BLS Proxy (TaylorAccess.API)',
        baseUrl: `${this.apiUrl}/api/v1/integrations/bls/series`,
        auth: 'Taylor Access JWT',
        configured: true,
        status: status === 'error' ? 'warning' : 'ok',
        statusLabel: status === 'error' ? 'Reachable, upstream failed' : 'Ready',
        lastChecked: checked
      },
      {
        name: 'User Settings API',
        baseUrl: `${this.apiUrl}/api/v1/user-settings`,
        auth: 'Taylor Access JWT',
        configured: true,
        status: 'ok',
        statusLabel: 'Ready',
        lastChecked: '—'
      }
    ];
  }

  private parseSeriesIds(value: string): string[] {
    return String(value || '')
      .split(',')
      .map(v => v.trim())
      .filter(v => !!v);
  }

  private nowLabel(): string {
    return new Date().toLocaleString();
  }

  private hasRunnableConfig(form: BlsSettings): boolean {
    const baseUrlOk = !!String(form.apiBaseUrl || '').trim();
    const seriesOk = this.parseSeriesIds(this.seriesIdsCsv || form.defaultSeriesIds).length > 0;
    return baseUrlOk && seriesOk;
  }

  private defaultForm(): BlsSettings {
    const year = new Date().getFullYear();
    return {
      enabled: true,
      apiBaseUrl: 'https://api.bls.gov/publicAPI/v2/timeseries/data/',
      apiKey: '',
      defaultSeriesIds: 'OEUN0000000533032',
      startYear: String(year - 1),
      endYear: String(year)
    };
  }

  private mergeDefaults(raw: any): BlsSettings {
    const defaults = this.defaultForm();
    const hasSavedObject = !!(raw && typeof raw === 'object');
    const hasSavedConfig = hasSavedObject && (
      !!String(raw.apiBaseUrl ?? '').trim() ||
      !!String(raw.apiKey ?? '').trim() ||
      !!String(raw.defaultSeriesIds ?? '').trim()
    );
    return {
      ...defaults,
      ...(hasSavedObject ? raw : {}),
      enabled: Boolean(raw?.enabled ?? (hasSavedConfig ? true : defaults.enabled))
    };
  }
}

