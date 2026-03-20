import { Component, OnInit, inject, signal } from '@angular/core';
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
          <button class="refresh-btn" (click)="loadApiConfig()" [disabled]="loading()">
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

  ngOnInit(): void {
    this.loadApiConfig();
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
      },
      error: () => {
        this.error.set('Unable to load MOTIV API configuration status.');
        this.loading.set(false);
      }
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
}
