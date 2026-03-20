import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

type MotivTab = 'api' | 'drivers' | 'vehicles';

@Component({
  selector: 'app-motiv',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="motiv-page">
      <div class="page-header">
        <h1><i class="bx bxs-truck"></i> MOTIV</h1>
        <p>Integration workspace for API, drivers, and vehicles.</p>
      </div>

      <div class="tabs">
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'api'"
          (click)="setTab('api')">
          1. API
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'drivers'"
          (click)="setTab('drivers')">
          2. Drivers
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'vehicles'"
          (click)="setTab('vehicles')">
          3. Vehicles
        </button>
      </div>

      <section class="tab-panel" *ngIf="activeTab() === 'api'">
        <h2>API</h2>
        <p>Server-side MOTIV configuration and connectivity setup.</p>
        <div class="api-status">
          <div class="status-pill" [class]="apiStatusClass()">
            <span class="dot"></span>
            <span>{{ apiStatusLabel() }}</span>
          </div>
          <button class="refresh-btn" (click)="refreshApiStatus()" [disabled]="loading()">
            {{ loading() ? 'Checking...' : 'Refresh Status' }}
          </button>
          <p class="error" *ngIf="error()">{{ error() }}</p>
          <div *ngIf="apiConfig() as cfg" class="status-grid">
            <div class="status-item">
              <span class="label">Header</span>
              <span class="value">{{ cfg.headerName }}</span>
            </div>
            <div class="status-item">
              <span class="label">API Key</span>
              <span class="value" [class.ok]="cfg.hasApiKey" [class.bad]="!cfg.hasApiKey">
                {{ cfg.hasApiKey ? 'Configured' : 'Missing' }}
              </span>
            </div>
            <div class="status-item">
              <span class="label">Base URL</span>
              <span class="value" [class.ok]="cfg.hasBaseUrl" [class.bad]="!cfg.hasBaseUrl">
                {{ cfg.hasBaseUrl ? 'Configured' : 'Missing' }}
              </span>
            </div>
          </div>

          <div class="available-api-table-wrap">
            <h3>Available APIs</h3>
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>API</th>
                  <th>Route</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of availableApis()">
                  <td>{{ row.name }}</td>
                  <td><code>{{ row.route }}</code></td>
                  <td>
                    <span class="status-chip"
                          [class.connected]="row.status === 'connected'"
                          [class.not-connected]="row.status === 'not-connected'"
                          [class.checking]="row.status === 'checking'">
                      {{ row.status === 'connected' ? 'Connected' : (row.status === 'not-connected' ? 'Not Connected' : 'Checking...') }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="tab-panel" *ngIf="activeTab() === 'drivers'">
        <h2>Drivers</h2>
        <p>MOTIV drivers pulled through the secure backend proxy.</p>
        <div class="api-status">
          <button class="refresh-btn" (click)="loadDrivers()" [disabled]="loadingDrivers()">
            {{ loadingDrivers() ? 'Loading...' : 'Refresh Drivers' }}
          </button>
          <p class="error" *ngIf="driversError()">{{ driversError() }}</p>
          <p class="count">Rows: {{ motivDrivers().length }}</p>
          <pre class="json-preview" *ngIf="driversRaw()">{{ driversRaw() | json }}</pre>
        </div>
      </section>

      <section class="tab-panel" *ngIf="activeTab() === 'vehicles'">
        <h2>Vehicles</h2>
        <p>MOTIV vehicles pulled through the secure backend proxy.</p>
        <div class="api-status">
          <button class="refresh-btn" (click)="loadVehicles()" [disabled]="loadingVehicles()">
            {{ loadingVehicles() ? 'Loading...' : 'Refresh Vehicles' }}
          </button>
          <p class="error" *ngIf="vehiclesError()">{{ vehiclesError() }}</p>
          <p class="count">Rows: {{ motivVehicles().length }}</p>
          <pre class="json-preview" *ngIf="vehiclesRaw()">{{ vehiclesRaw() | json }}</pre>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .motiv-page { padding: 20px; color: #e2e8f0; }
    .page-header { margin-bottom: 16px; }
    .page-header h1 { margin: 0 0 6px; display: flex; gap: 8px; align-items: center; }
    .page-header p { margin: 0; color: #94a3b8; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab-btn {
      border: 1px solid #334155;
      background: #0f172a;
      color: #cbd5e1;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
    }
    .tab-btn.active {
      border-color: #06b6d4;
      color: #06b6d4;
      background: rgba(6, 182, 212, 0.08);
    }
    .tab-panel {
      border: 1px solid #1e293b;
      background: #0b1220;
      border-radius: 12px;
      padding: 16px;
    }
    .tab-panel h2 { margin: 0 0 8px; }
    .tab-panel p { margin: 0; color: #94a3b8; }
    .api-status { margin-top: 12px; }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid #334155;
      border-radius: 999px;
      padding: 6px 10px;
      margin-bottom: 10px;
      font-size: 12px;
      font-weight: 600;
      color: #cbd5e1;
      background: #0f172a;
    }
    .status-pill .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #94a3b8;
    }
    .status-pill.ok {
      color: #22c55e;
      border-color: rgba(34, 197, 94, 0.45);
      background: rgba(34, 197, 94, 0.08);
    }
    .status-pill.ok .dot { background: #22c55e; }
    .status-pill.warn {
      color: #f59e0b;
      border-color: rgba(245, 158, 11, 0.45);
      background: rgba(245, 158, 11, 0.08);
    }
    .status-pill.warn .dot { background: #f59e0b; }
    .status-pill.bad {
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.45);
      background: rgba(239, 68, 68, 0.08);
    }
    .status-pill.bad .dot { background: #ef4444; }
    .refresh-btn {
      border: 1px solid #334155;
      background: #0f172a;
      color: #cbd5e1;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 10px;
    }
    .refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .status-grid { display: grid; gap: 8px; max-width: 360px; }
    .status-item {
      display: flex;
      justify-content: space-between;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px 10px;
      background: #0f172a;
    }
    .label { color: #94a3b8; }
    .value { color: #e2e8f0; }
    .ok { color: #22c55e; }
    .bad { color: #ef4444; }
    .error { margin-top: 0; margin-bottom: 10px; color: #ef4444; }
    .count { margin: 0 0 10px; color: #93c5fd; }
    .json-preview {
      margin: 0;
      border: 1px solid #1e293b;
      border-radius: 8px;
      background: #020617;
      padding: 10px;
      max-height: 360px;
      overflow: auto;
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.4;
    }
    .available-api-table-wrap { margin-top: 14px; }
    .available-api-table-wrap h3 { margin: 0 0 8px; font-size: 14px; color: #cbd5e1; }
    .available-api-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #1e293b;
      border-radius: 8px;
      overflow: hidden;
      background: #0f172a;
    }
    .available-api-table th,
    .available-api-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #1e293b;
      text-align: left;
      font-size: 12px;
      color: #cbd5e1;
    }
    .available-api-table tr:last-child td { border-bottom: none; }
    .available-api-table th { color: #94a3b8; background: #111827; }
    .status-chip {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid #334155;
      color: #cbd5e1;
    }
    .status-chip.connected {
      color: #22c55e;
      border-color: rgba(34, 197, 94, 0.5);
      background: rgba(34, 197, 94, 0.12);
    }
    .status-chip.not-connected {
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.5);
      background: rgba(239, 68, 68, 0.12);
    }
    .status-chip.checking {
      color: #f59e0b;
      border-color: rgba(245, 158, 11, 0.5);
      background: rgba(245, 158, 11, 0.12);
    }
  `]
})
export class MotivComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  activeTab = signal<MotivTab>('api');
  loading = signal(false);
  apiConfig = signal<{ headerName: string; hasApiKey: boolean; hasBaseUrl: boolean } | null>(null);
  error = signal('');
  loadingDrivers = signal(false);
  loadingVehicles = signal(false);
  driversError = signal('');
  vehiclesError = signal('');
  motivDrivers = signal<any[]>([]);
  motivVehicles = signal<any[]>([]);
  driversRaw = signal<any>(null);
  vehiclesRaw = signal<any>(null);
  availableApis = signal<Array<{ name: string; route: string; status: 'checking' | 'connected' | 'not-connected' }>>([
    { name: 'MOTIV Config', route: '/api/v1/motiv/config', status: 'checking' },
    { name: 'MOTIV Drivers', route: '/api/v1/motiv/drivers', status: 'checking' },
    { name: 'MOTIV Vehicles', route: '/api/v1/motiv/vehicles', status: 'checking' }
  ]);

  apiStatusLabel = computed(() => {
    if (this.loading()) return 'Checking API status...';
    if (this.error()) return 'API status: Error';
    const cfg = this.apiConfig();
    if (!cfg) return 'API status: Unknown';
    if (cfg.hasApiKey && cfg.hasBaseUrl) return 'API status: Connected';
    return 'API status: Needs configuration';
  });

  apiStatusClass = computed(() => {
    if (this.loading()) return 'warn';
    if (this.error()) return 'bad';
    const cfg = this.apiConfig();
    if (cfg?.hasApiKey && cfg?.hasBaseUrl) return 'ok';
    return 'warn';
  });

  ngOnInit(): void {
    this.loadApiConfig();
    this.checkAvailableApis();
  }

  setTab(tab: MotivTab): void {
    this.activeTab.set(tab);
    if (tab === 'drivers' && this.motivDrivers().length === 0 && !this.loadingDrivers()) {
      this.loadDrivers();
    }
    if (tab === 'vehicles' && this.motivVehicles().length === 0 && !this.loadingVehicles()) {
      this.loadVehicles();
    }
  }

  loadApiConfig(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<{ headerName: string; hasApiKey: boolean; hasBaseUrl: boolean }>(
      `${this.apiUrl}/api/v1/motiv/config`
    ).subscribe({
      next: (config) => {
        this.apiConfig.set(config);
        this.loading.set(false);
        this.setApiStatus('/api/v1/motiv/config', config.hasApiKey && config.hasBaseUrl ? 'connected' : 'not-connected');
      },
      error: () => {
        this.error.set('Unable to load MOTIV API configuration status.');
        this.loading.set(false);
        this.setApiStatus('/api/v1/motiv/config', 'not-connected');
      }
    });
  }

  refreshApiStatus(): void {
    this.loadApiConfig();
    this.checkAvailableApis();
  }

  checkAvailableApis(): void {
    this.availableApis.set([
      { name: 'MOTIV Config', route: '/api/v1/motiv/config', status: 'checking' },
      { name: 'MOTIV Drivers', route: '/api/v1/motiv/drivers', status: 'checking' },
      { name: 'MOTIV Vehicles', route: '/api/v1/motiv/vehicles', status: 'checking' }
    ]);

    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/drivers`).subscribe({
      next: () => this.setApiStatus('/api/v1/motiv/drivers', 'connected'),
      error: () => this.setApiStatus('/api/v1/motiv/drivers', 'not-connected')
    });

    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/vehicles`).subscribe({
      next: () => this.setApiStatus('/api/v1/motiv/vehicles', 'connected'),
      error: () => this.setApiStatus('/api/v1/motiv/vehicles', 'not-connected')
    });
  }

  loadDrivers(): void {
    this.loadingDrivers.set(true);
    this.driversError.set('');
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/drivers`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.driversRaw.set(payload);
        this.motivDrivers.set(this.extractRows(payload));
        this.loadingDrivers.set(false);
      },
      error: (err) => {
        this.driversError.set(err?.error?.error || 'Unable to load MOTIV drivers.');
        this.loadingDrivers.set(false);
      }
    });
  }

  loadVehicles(): void {
    this.loadingVehicles.set(true);
    this.vehiclesError.set('');
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/vehicles`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.vehiclesRaw.set(payload);
        this.motivVehicles.set(this.extractRows(payload));
        this.loadingVehicles.set(false);
      },
      error: (err) => {
        this.vehiclesError.set(err?.error?.error || 'Unable to load MOTIV vehicles.');
        this.loadingVehicles.set(false);
      }
    });
  }

  private extractRows(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  private setApiStatus(route: string, status: 'connected' | 'not-connected'): void {
    this.availableApis.update(rows =>
      rows.map(row => row.route === route ? { ...row, status } : row)
    );
  }
}
