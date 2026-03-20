import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { timeout } from 'rxjs/operators';

type MotivTab = 'api' | 'drivers' | 'vehicles' | 'users' | 'fuel';
type MotivDriverTableRow = {
  name: string;
  email: string;
  phone: string;
  status: string;
  location: string;
  vehicle: string;
  lastUpdate: string;
};
type MotivFuelRow = {
  transactionId: string;
  date: string;
  status: string;
  amount: string;
  currency: string;
  merchant: string;
  city: string;
  state: string;
  driverId: string;
  vehicleId: string;
  category: string;
};
type ApiHealthStatus = 'checking' | 'connected' | 'not-connected';
type ApiHealthRow = {
  name: string;
  route: string;
  status: ApiHealthStatus;
};
type Phase2Row = {
  category: 'write' | 'parameterized' | 'webhooks';
  name: string;
  method: 'GET' | 'OPTIONS';
  path: string;
  status: ApiHealthStatus;
  notes: string;
};

@Component({
  selector: 'app-motiv',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="motiv-page">
      <div class="page-header">
        <h1><i class="bx bxs-truck"></i> MOTIV</h1>
        <p>Integration workspace for API, drivers, vehicles, users, and fuel purchases.</p>
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
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'users'"
          (click)="setTab('users')">
          4. Users
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'fuel'"
          (click)="setTab('fuel')">
          5. Fuel
        </button>
      </div>

      <section class="tab-panel" *ngIf="activeTab() === 'api'">
        <h2>API</h2>
        <p>Server-side MOTIV configuration and connectivity setup.</p>
        <div class="api-status">
          <div class="strict-mode-row">
            <label class="strict-mode-label">
              <input
                type="checkbox"
                [checked]="strictMode405()"
                (change)="setStrictMode405($any($event.target).checked)" />
              Strict mode (treat HTTP 405 as Not Connected)
            </label>
          </div>
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

          <div class="available-api-table-wrap">
            <h3>Phase 2 Capability Checks</h3>
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>API</th>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of phase2Apis()">
                  <td>{{ row.category }}</td>
                  <td>{{ row.name }}</td>
                  <td><code>{{ row.method }}</code></td>
                  <td><code>{{ row.path }}</code></td>
                  <td>
                    <span class="status-chip"
                          [class.connected]="row.status === 'connected'"
                          [class.not-connected]="row.status === 'not-connected'"
                          [class.checking]="row.status === 'checking'">
                      {{ row.status === 'connected' ? 'Connected' : (row.status === 'not-connected' ? 'Not Connected' : 'Checking...') }}
                    </span>
                  </td>
                  <td>{{ row.notes }}</td>
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
          <div class="driver-actions">
            <button class="refresh-btn" (click)="loadDrivers()" [disabled]="loadingDrivers()">
              {{ loadingDrivers() ? 'Loading...' : 'Refresh Drivers' }}
            </button>
            <button class="refresh-btn" (click)="saveDriversToDb()" [disabled]="savingDrivers() || loadingDrivers()">
              {{ savingDrivers() ? 'Saving...' : 'Save to Access DB' }}
            </button>
          </div>
          <p class="error" *ngIf="driversError()">{{ driversError() }}</p>
          <p class="ok-note" *ngIf="saveDriversMessage()">{{ saveDriversMessage() }}</p>
          <p class="error" *ngIf="saveDriversError()">{{ saveDriversError() }}</p>
          <p class="count">Rows: {{ motivDrivers().length }}</p>
          <div class="available-api-table-wrap" *ngIf="driverTableRows().length > 0">
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Vehicle</th>
                  <th>Last Update</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of driverTableRows()">
                  <td>{{ row.name }}</td>
                  <td>{{ row.email }}</td>
                  <td>{{ row.phone }}</td>
                  <td>{{ row.status }}</td>
                  <td>{{ row.location }}</td>
                  <td>{{ row.vehicle }}</td>
                  <td>{{ row.lastUpdate }}</td>
                </tr>
              </tbody>
            </table>
          </div>
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
        </div>
      </section>

      <section class="tab-panel" *ngIf="activeTab() === 'users'">
        <h2>Users</h2>
        <p>MOTIV users pulled through the secure backend proxy.</p>
        <div class="api-status">
          <button class="refresh-btn" (click)="loadUsers()" [disabled]="loadingUsers()">
            {{ loadingUsers() ? 'Loading...' : 'Refresh Users' }}
          </button>
          <p class="error" *ngIf="usersError()">{{ usersError() }}</p>
          <p class="count">Rows: {{ motivUsers().length }}</p>
        </div>
      </section>

      <section class="tab-panel" *ngIf="activeTab() === 'fuel'">
        <h2>Fuel Purchases</h2>
        <p>MOTIV fuel card purchases pulled through the secure backend proxy.</p>
        <div class="api-status">
          <div class="driver-actions">
            <button class="refresh-btn" (click)="loadFuelPurchases()" [disabled]="loadingFuel()">
              {{ loadingFuel() ? 'Loading...' : 'Refresh Fuel Purchases' }}
            </button>
            <button class="refresh-btn" (click)="saveFuelPurchasesToDb()" [disabled]="savingFuel() || loadingFuel()">
              {{ savingFuel() ? 'Saving...' : 'Save to Access DB' }}
            </button>
          </div>
          <p class="error" *ngIf="fuelError()">{{ fuelError() }}</p>
          <p class="ok-note" *ngIf="saveFuelMessage()">{{ saveFuelMessage() }}</p>
          <p class="error" *ngIf="saveFuelError()">{{ saveFuelError() }}</p>

          <div class="driver-actions">
            <input
              class="filter-input"
              type="text"
              placeholder="Filter merchant"
              [value]="fuelMerchantFilter()"
              (input)="setFuelMerchantFilter($any($event.target).value)" />
            <input
              class="filter-input"
              type="text"
              placeholder="Filter status"
              [value]="fuelStatusFilter()"
              (input)="setFuelStatusFilter($any($event.target).value)" />
          </div>

          <p class="count">Rows: {{ filteredFuelRows().length }} / {{ fuelRows().length }}</p>
          <div class="available-api-table-wrap" *ngIf="filteredFuelRows().length > 0">
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Merchant</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of filteredFuelRows()">
                  <td>{{ row.transactionId }}</td>
                  <td>{{ row.date }}</td>
                  <td>{{ row.status }}</td>
                  <td>{{ row.amount }} {{ row.currency }}</td>
                  <td>{{ row.merchant }}</td>
                  <td>{{ row.city }}</td>
                  <td>{{ row.state }}</td>
                  <td>{{ row.driverId }}</td>
                  <td>{{ row.vehicleId }}</td>
                  <td>{{ row.category }}</td>
                </tr>
              </tbody>
            </table>
          </div>
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
    .driver-actions { display: flex; gap: 8px; margin-bottom: 8px; }
    .strict-mode-row { margin-bottom: 10px; }
    .strict-mode-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #cbd5e1;
      user-select: none;
    }
    .filter-input {
      border: 1px solid #334155;
      background: #0f172a;
      color: #cbd5e1;
      padding: 8px 10px;
      border-radius: 8px;
      min-width: 220px;
    }
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
    .ok-note { margin-top: 0; margin-bottom: 10px; color: #22c55e; }
    .count { margin: 0 0 10px; color: #93c5fd; }
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
  private strictModeStorageKey = 'motiv.strictMode405';

  activeTab = signal<MotivTab>('api');
  loading = signal(false);
  apiConfig = signal<{ headerName: string; hasApiKey: boolean; hasBaseUrl: boolean } | null>(null);
  error = signal('');
  loadingDrivers = signal(false);
  loadingVehicles = signal(false);
  loadingUsers = signal(false);
  savingDrivers = signal(false);
  loadingFuel = signal(false);
  savingFuel = signal(false);
  driversError = signal('');
  vehiclesError = signal('');
  usersError = signal('');
  fuelError = signal('');
  saveDriversMessage = signal('');
  saveDriversError = signal('');
  saveFuelMessage = signal('');
  saveFuelError = signal('');
  motivDrivers = signal<any[]>([]);
  motivVehicles = signal<any[]>([]);
  motivUsers = signal<any[]>([]);
  motivFuelPurchases = signal<any[]>([]);
  fuelMerchantFilter = signal('');
  fuelStatusFilter = signal('');
  strictMode405 = signal(false);
  availableApis = signal<ApiHealthRow[]>(this.createApiRows());
  phase2Apis = signal<Phase2Row[]>(this.createPhase2Rows());

  apiStatusLabel = computed(() => {
    if (this.loading()) return 'Checking API status...';
    if (this.error()) return 'API status: Error';
    const cfg = this.apiConfig();
    if (!cfg) return 'API status: Unknown';
    if (!(cfg.hasApiKey && cfg.hasBaseUrl)) return 'API status: Needs configuration';
    if (this.availableApis().some(x => x.status === 'connected')) {
      return 'API status: Connected';
    }
    return 'API status: Needs configuration';
  });

  apiStatusClass = computed(() => {
    if (this.loading()) return 'warn';
    if (this.error()) return 'bad';
    const cfg = this.apiConfig();
    if (cfg?.hasApiKey && cfg?.hasBaseUrl) return 'ok';
    return 'warn';
  });

  driverTableRows = computed<MotivDriverTableRow[]>(() =>
    this.motivDrivers().map((raw) => this.mapDriverRow(raw))
  );
  fuelRows = computed<MotivFuelRow[]>(() =>
    this.motivFuelPurchases().map((raw) => this.mapFuelRow(raw))
  );
  filteredFuelRows = computed<MotivFuelRow[]>(() => {
    const merchant = this.fuelMerchantFilter().trim().toLowerCase();
    const status = this.fuelStatusFilter().trim().toLowerCase();
    return this.fuelRows().filter(row => {
      const merchantOk = !merchant || row.merchant.toLowerCase().includes(merchant);
      const statusOk = !status || row.status.toLowerCase().includes(status);
      return merchantOk && statusOk;
    });
  });

  ngOnInit(): void {
    this.loadStrictMode();
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
    if (tab === 'users' && this.motivUsers().length === 0 && !this.loadingUsers()) {
      this.loadUsers();
    }
    if (tab === 'fuel' && this.motivFuelPurchases().length === 0 && !this.loadingFuel()) {
      this.loadFuelPurchases();
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

  setStrictMode405(enabled: boolean): void {
    this.strictMode405.set(!!enabled);
    try {
      localStorage.setItem(this.strictModeStorageKey, enabled ? '1' : '0');
    } catch {
      // Ignore storage issues; state still applies for this session.
    }
    this.checkAvailableApis();
  }

  checkAvailableApis(): void {
    const rows = this.createApiRows();
    this.availableApis.set(rows);
    this.checkPhase2Apis();

    rows
      .filter(row => row.route !== '/api/v1/motiv/config')
      .forEach(row => {
        this.http.get<any>(`${this.apiUrl}${row.route}`).pipe(timeout(15000)).subscribe({
          next: (res) => {
            if (row.route.startsWith('/api/v1/motiv/probe')) {
              this.setApiStatus(row.route, this.mapProbeResultToStatus(res));
              return;
            }
            this.setApiStatus(row.route, 'connected');
          },
          error: () => this.setApiStatus(row.route, 'not-connected')
        });
      });
  }

  private checkPhase2Apis(): void {
    const rows = this.createPhase2Rows();
    this.phase2Apis.set(rows);

    rows.forEach(row => {
      if (row.method === 'GET') {
        this.http.get<any>(`${this.apiUrl}/api/v1/motiv/probe?path=${encodeURIComponent(row.path)}`).pipe(timeout(15000)).subscribe({
          next: (res) => this.setPhase2Status(row.path, row.method, this.mapProbeResultToStatus(res)),
          error: () => this.setPhase2Status(row.path, row.method, 'not-connected')
        });
      } else {
        this.http.post<any>(`${this.apiUrl}/api/v1/motiv/probe-method`, {
          path: row.path,
          method: row.method
        }).pipe(timeout(15000)).subscribe({
          next: (res) => this.setPhase2Status(row.path, row.method, this.mapProbeResultToStatus(res)),
          error: () => this.setPhase2Status(row.path, row.method, 'not-connected')
        });
      }
    });
  }

  loadDrivers(): void {
    this.loadingDrivers.set(true);
    this.driversError.set('');
    this.saveDriversMessage.set('');
    this.saveDriversError.set('');
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/drivers`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivDrivers.set(this.extractRows(payload));
        this.loadingDrivers.set(false);
      },
      error: (err) => {
        this.driversError.set(err?.error?.error || 'Unable to load MOTIV drivers.');
        this.loadingDrivers.set(false);
      }
    });
  }

  saveDriversToDb(): void {
    this.savingDrivers.set(true);
    this.saveDriversMessage.set('');
    this.saveDriversError.set('');
    this.http.post<any>(`${this.apiUrl}/api/v1/motiv/drivers/sync`, {}).subscribe({
      next: (res) => {
        this.savingDrivers.set(false);
        this.saveDriversMessage.set(
          `Saved to Access DB - fetched: ${res?.fetched ?? 0}, created: ${res?.created ?? 0}, updated: ${res?.updated ?? 0}, skipped: ${res?.skipped ?? 0}.`
        );
      },
      error: (err) => {
        this.savingDrivers.set(false);
        this.saveDriversError.set(err?.error?.error || 'Unable to save MOTIV drivers to Access DB.');
      }
    });
  }

  loadVehicles(): void {
    this.loadingVehicles.set(true);
    this.vehiclesError.set('');
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/vehicles`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivVehicles.set(this.extractRows(payload));
        this.loadingVehicles.set(false);
      },
      error: (err) => {
        this.vehiclesError.set(err?.error?.error || 'Unable to load MOTIV vehicles.');
        this.loadingVehicles.set(false);
      }
    });
  }

  loadUsers(): void {
    this.loadingUsers.set(true);
    this.usersError.set('');
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/users`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivUsers.set(this.extractRows(payload));
        this.loadingUsers.set(false);
      },
      error: (err) => {
        this.usersError.set(err?.error?.error || 'Unable to load MOTIV users.');
        this.loadingUsers.set(false);
      }
    });
  }

  setFuelMerchantFilter(value: string): void {
    this.fuelMerchantFilter.set(value ?? '');
  }

  setFuelStatusFilter(value: string): void {
    this.fuelStatusFilter.set(value ?? '');
  }

  loadFuelPurchases(): void {
    this.loadingFuel.set(true);
    this.fuelError.set('');
    this.saveFuelMessage.set('');
    this.saveFuelError.set('');
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/fuel-purchases`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivFuelPurchases.set(this.extractRows(payload));
        this.loadingFuel.set(false);
      },
      error: (err) => {
        this.fuelError.set(err?.error?.error || 'Unable to load MOTIV fuel purchases.');
        this.loadingFuel.set(false);
      }
    });
  }

  saveFuelPurchasesToDb(): void {
    this.savingFuel.set(true);
    this.saveFuelMessage.set('');
    this.saveFuelError.set('');
    this.http.post<any>(`${this.apiUrl}/api/v1/motiv/fuel-purchases/sync`, {}).subscribe({
      next: (res) => {
        this.savingFuel.set(false);
        this.saveFuelMessage.set(
          `Saved fuel purchases - fetched: ${res?.fetched ?? 0}, created: ${res?.created ?? 0}, updated: ${res?.updated ?? 0}, skipped: ${res?.skipped ?? 0}.`
        );
      },
      error: (err) => {
        this.savingFuel.set(false);
        this.saveFuelError.set(err?.error?.error || 'Unable to save MOTIV fuel purchases.');
      }
    });
  }

  private extractRows(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.users)) return payload.users;
    if (Array.isArray(payload?.fuel_purchases)) return payload.fuel_purchases;
    if (Array.isArray(payload?.transactions)) return payload.transactions;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  private mapDriverRow(raw: any): MotivDriverTableRow {
    const user = raw?.user ?? raw ?? {};
    const location = raw?.current_location ?? raw?.location ?? {};
    const vehicle = raw?.current_vehicle ?? raw?.vehicle ?? {};
    const firstName = user?.first_name ?? user?.firstName ?? '';
    const lastName = user?.last_name ?? user?.lastName ?? '';
    const fallbackName = user?.name ?? user?.full_name ?? user?.username ?? 'N/A';
    const name = `${firstName} ${lastName}`.trim() || fallbackName;
    const email = user?.email ?? 'N/A';
    const phone = user?.phone ?? user?.phone_number ?? 'N/A';
    const status = user?.status ?? 'N/A';
    const lat = location?.lat ?? location?.latitude;
    const lon = location?.lon ?? location?.longitude;
    const locationText = lat != null && lon != null ? `${lat}, ${lon}` : (location?.description ?? 'N/A');
    const vehicleTextParts = [
      vehicle?.number,
      vehicle?.year,
      vehicle?.make,
      vehicle?.model
    ].filter((v: any) => !!v);
    const vehicleText = vehicleTextParts.length ? vehicleTextParts.join(' ') : (vehicle?.vin ?? 'N/A');
    const lastUpdate = location?.located_at ?? location?.locatedAt ?? 'N/A';

    return {
      name,
      email,
      phone,
      status,
      location: locationText,
      vehicle: vehicleText,
      lastUpdate
    };
  }

  private mapFuelRow(raw: any): MotivFuelRow {
    const merchant = raw?.merchant_info ?? {};
    const amount = raw?.total_amount ?? raw?.authorized_amount ?? 0;
    const date = raw?.transaction_time ?? raw?.posted_at ?? raw?.created_at ?? 'N/A';
    return {
      transactionId: String(raw?.id ?? raw?.transaction_id ?? 'N/A'),
      date,
      status: String(raw?.transaction_status ?? raw?.status ?? 'N/A'),
      amount: Number.isFinite(Number(amount)) ? Number(amount).toFixed(2) : '0.00',
      currency: String(raw?.currency ?? 'USD'),
      merchant: String(merchant?.name ?? raw?.merchant_name ?? 'N/A'),
      city: String(merchant?.city ?? raw?.city ?? 'N/A'),
      state: String(merchant?.state ?? raw?.state ?? 'N/A'),
      driverId: String(raw?.driver_id ?? 'N/A'),
      vehicleId: String(raw?.vehicle_id ?? 'N/A'),
      category: String(raw?.transaction_type ?? raw?.type ?? 'N/A')
    };
  }

  private setApiStatus(route: string, status: 'connected' | 'not-connected'): void {
    this.availableApis.update(rows =>
      rows.map(row => row.route === route ? { ...row, status } : row)
    );
  }

  private setPhase2Status(path: string, method: 'GET' | 'OPTIONS', status: 'connected' | 'not-connected'): void {
    this.phase2Apis.update(rows =>
      rows.map(row => row.path === path && row.method === method ? { ...row, status } : row)
    );
  }

  private loadStrictMode(): void {
    try {
      const raw = localStorage.getItem(this.strictModeStorageKey);
      this.strictMode405.set(raw === '1');
    } catch {
      this.strictMode405.set(false);
    }
  }

  private mapProbeResultToStatus(res: any): 'connected' | 'not-connected' {
    const status = Number(res?.status ?? 0);
    if (this.strictMode405() && status === 405) {
      return 'not-connected';
    }
    return !!res?.connected ? 'connected' : 'not-connected';
  }

  private createApiRows(): ApiHealthRow[] {
    return [
      { name: 'MOTIV Config', route: '/api/v1/motiv/config', status: 'checking' },
      { name: 'MOTIV Driver Locations', route: '/api/v1/motiv/drivers', status: 'checking' },
      { name: 'MOTIV Vehicles', route: '/api/v1/motiv/vehicles', status: 'checking' },
      { name: 'MOTIV Groups', route: '/api/v1/motiv/probe?path=/v1/groups', status: 'checking' },
      { name: 'MOTIV Users', route: '/api/v1/motiv/users', status: 'checking' },
      { name: 'MOTIV Users Lookup by External ID', route: '/api/v1/motiv/probe?path=/v1/users/lookup_by_external_id', status: 'checking' },
      { name: 'MOTIV Vehicles Lookup by External ID', route: '/api/v1/motiv/probe?path=/v1/vehicles/lookup_by_external_id', status: 'checking' },
      { name: 'MOTIV Vehicle Locations', route: '/api/v1/motiv/probe?path=/v1/vehicle_locations', status: 'checking' },
      { name: 'MOTIV Vehicle Locations (v2)', route: '/api/v1/motiv/probe?path=/v2/vehicle_locations', status: 'checking' },
      { name: 'MOTIV Vehicle Locations (v3)', route: '/api/v1/motiv/probe?path=/v3/vehicle_locations', status: 'checking' },
      { name: 'MOTIV Assets', route: '/api/v1/motiv/probe?path=/v1/assets', status: 'checking' },
      { name: 'MOTIV Fault Codes', route: '/api/v1/motiv/probe?path=/v1/fault_codes', status: 'checking' },
      { name: 'MOTIV Messages', route: '/api/v1/motiv/probe?path=/v1/messages', status: 'checking' },
      { name: 'MOTIV Dispatches', route: '/api/v1/motiv/probe?path=/v1/dispatches', status: 'checking' },
      { name: 'MOTIV Camera Connections', route: '/api/v1/motiv/probe?path=/v1/camera_connections', status: 'checking' },
      { name: 'MOTIV Scorecard Summary', route: '/api/v1/motiv/probe?path=/v1/scorecard_summary', status: 'checking' },
      { name: 'MOTIV Driver Performance Events', route: '/api/v1/motiv/probe?path=/v1/driver_performance_events', status: 'checking' },
      { name: 'MOTIV HOS Available Time', route: '/api/v1/motiv/probe?path=/v1/available_time', status: 'checking' },
      { name: 'MOTIV HOS Violations', route: '/api/v1/motiv/probe?path=/v1/hos_violations', status: 'checking' },
      { name: 'MOTIV Hours of Service', route: '/api/v1/motiv/probe?path=/v1/hours_of_service', status: 'checking' },
      { name: 'MOTIV Time Tracking Worked Time', route: '/api/v1/motiv/probe?path=/v1/time_tracking/worked_time', status: 'checking' },
      { name: 'MOTIV Timecard Entries', route: '/api/v1/motiv/probe?path=/v1/time_tracking/timecard_entries', status: 'checking' },
      { name: 'MOTIV Card Transactions (v2)', route: '/api/v1/motiv/probe?path=/motive_card/v2/transactions', status: 'checking' },
      { name: 'MOTIV Fuel Purchases', route: '/api/v1/motiv/probe?path=/v1/fuel_purchases', status: 'checking' },
      { name: 'MOTIV Inspection Reports (v1)', route: '/api/v1/motiv/probe?path=/v1/inspection_reports', status: 'checking' },
      { name: 'MOTIV Inspection Reports (v2)', route: '/api/v1/motiv/probe?path=/v2/inspection_reports', status: 'checking' },
      { name: 'MOTIV IFTA Summary', route: '/api/v1/motiv/probe?path=/v1/ifta/summary', status: 'checking' },
      { name: 'MOTIV IFTA Trips', route: '/api/v1/motiv/probe?path=/v1/ifta/trips', status: 'checking' },
      { name: 'MOTIV Freight Visibility', route: '/api/v1/motiv/probe?path=/v1/freight_visibility/vehicle_locations', status: 'checking' },
      { name: 'MOTIV Companies', route: '/api/v1/motiv/probe?path=/v1/companies', status: 'checking' },
      { name: 'MOTIV Freight Visibility Companies', route: '/api/v1/motiv/probe?path=/v1/freight_visibility/companies', status: 'checking' }
    ];
  }

  private createPhase2Rows(): Phase2Row[] {
    return [
      {
        category: 'write',
        name: 'Create User',
        method: 'OPTIONS',
        path: '/v1/users',
        status: 'checking',
        notes: 'Non-destructive OPTIONS probe for write capability.'
      },
      {
        category: 'write',
        name: 'Update User',
        method: 'OPTIONS',
        path: '/v1/users/1',
        status: 'checking',
        notes: 'Requires valid user id for real operation.'
      },
      {
        category: 'write',
        name: 'Locate Asset',
        method: 'OPTIONS',
        path: '/assets/1/locate',
        status: 'checking',
        notes: 'Write endpoint; id-specific path used for capability probe.'
      },
      {
        category: 'write',
        name: 'Update Timecard Entries',
        method: 'OPTIONS',
        path: '/v1/time_tracking/timecard_entries',
        status: 'checking',
        notes: 'Time tracking write support check.'
      },
      {
        category: 'parameterized',
        name: 'Vehicle Location by ID and Date',
        method: 'GET',
        path: '/v1/vehicle_locations/1?date=2026-03-01',
        status: 'checking',
        notes: 'Parameterized endpoint; sample id/date used.'
      },
      {
        category: 'parameterized',
        name: 'Users Lookup by External ID',
        method: 'GET',
        path: '/v1/users/lookup_by_external_id?external_id=test',
        status: 'checking',
        notes: 'Expected 400/404 if sample external id not found.'
      },
      {
        category: 'parameterized',
        name: 'Vehicles Lookup by External ID',
        method: 'GET',
        path: '/v1/vehicles/lookup_by_external_id?external_id=test',
        status: 'checking',
        notes: 'Expected 400/404 if sample external id not found.'
      },
      {
        category: 'webhooks',
        name: 'List Webhooks',
        method: 'GET',
        path: '/v1/webhooks',
        status: 'checking',
        notes: 'Webhook listing availability check.'
      },
      {
        category: 'webhooks',
        name: 'Webhook Events',
        method: 'GET',
        path: '/v1/webhook_events',
        status: 'checking',
        notes: 'Event feed endpoint availability check.'
      }
    ];
  }
}
