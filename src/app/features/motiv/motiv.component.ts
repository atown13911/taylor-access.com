import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { timeout } from 'rxjs/operators';
import { jsPDF } from 'jspdf';

type MotivTab = 'api' | 'drivers' | 'activity' | 'vehicles' | 'users' | 'safety' | 'fuel' | 'fuel-cards';
type MotivDriverTableRow = {
  name: string;
  email: string;
  phone: string;
  status: string;
  location: string;
  vehicle: string;
  lastUpdate: string;
};
type MotivVehicleTableRow = {
  id: string;
  number: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  status: string;
  location: string;
  lastUpdate: string;
};
type MotivUserTableRow = {
  name: string;
  email: string;
  phone: string;
  userType: string;
  status: string;
  role: string;
};
type MotivFuelRow = {
  transactionId: string;
  date: string;
  status: string;
  amount: string;
  amountValue: number;
  currency: string;
  merchant: string;
  city: string;
  state: string;
  driverId: string;
  vehicleId: string;
  cardId: string;
  cardLabel: string;
  category: string;
  source: string;
};
type MotivFuelCardRow = {
  id: string;
  label: string;
  last4: string;
  status: string;
  type: string;
  limit: string;
  currency: string;
  purchases: number;
  spend: number;
};
type MotivSafetyEventRow = {
  eventId: string;
  eventAt: string;
  eventType: string;
  severity: string;
  driver: string;
  vehicle: string;
  location: string;
  status: string;
  hasVideo: boolean;
  videoUrl: string;
};
type MotivActivityLogEntry = {
  id?: number;
  timestamp: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  details: string;
  driverName?: string | null;
};
type ActivityReportScope = 'active' | 'inactive' | 'specific';
type FuelWeekOption = {
  key: string;
  label: string;
  year: number;
  week: number;
};
type FuelSortColumn =
  | 'transactionId'
  | 'date'
  | 'week'
  | 'status'
  | 'amount'
  | 'merchant'
  | 'city'
  | 'state'
  | 'driverId'
  | 'vehicleId'
  | 'cardLabel'
  | 'category'
  | 'source';
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
type DriverSyncSummary = {
  mode: 'auto' | 'manual';
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  finishedAt: string;
};
type MotivStatusCache = {
  timestamp: number;
  apiConfig: { headerName: string; hasApiKey: boolean; hasBaseUrl: boolean } | null;
  availableApis: ApiHealthRow[];
  phase2Apis: Phase2Row[];
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
          [class.active]="activeTab() === 'activity'"
          (click)="setTab('activity')">
          3. Activity
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'vehicles'"
          (click)="setTab('vehicles')">
          4. Vehicles
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'users'"
          (click)="setTab('users')">
          5. Users
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'safety'"
          (click)="setTab('safety')">
          6. Safety Cam
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'fuel'"
          (click)="setTab('fuel')">
          7. Fuel
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'fuel-cards'"
          (click)="setTab('fuel-cards')">
          8. Fuel Cards
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
            <button class="refresh-btn" (click)="loadDrivers()" [disabled]="loadingDrivers() || syncingDrivers()">
              {{ loadingDrivers() ? 'Loading...' : (syncingDrivers() ? 'Syncing...' : 'Refresh Drivers') }}
            </button>
            <button class="refresh-btn" (click)="saveDriversToDb()" [disabled]="savingDrivers() || loadingDrivers() || syncingDrivers()">
              {{ savingDrivers() ? 'Saving...' : 'Save to Access DB' }}
            </button>
          </div>
          <div class="sync-status-panel">
            <span class="sync-spinner" *ngIf="syncingDrivers() || savingDrivers()" aria-hidden="true"></span>
            <span class="status-chip"
                  [class.connected]="driverSyncStatusTone() === 'connected'"
                  [class.not-connected]="driverSyncStatusTone() === 'not-connected'"
                  [class.checking]="driverSyncStatusTone() === 'checking'">
              {{ driverSyncStatusLabel() }}
            </span>
            <span class="sync-status-text">{{ driverSyncStatusText() }}</span>
          </div>
          <p class="count" *ngIf="lastDriverSyncSummary() as sync">
            Last sync ({{ sync.mode }}) at {{ sync.finishedAt }} - fetched: {{ sync.fetched }}, created: {{ sync.created }}, updated: {{ sync.updated }}, skipped: {{ sync.skipped }}
          </p>
          <p class="error" *ngIf="driversError()">{{ driversError() }}</p>
          <p class="ok-note" *ngIf="saveDriversMessage()">{{ saveDriversMessage() }}</p>
          <p class="error" *ngIf="saveDriversError()">{{ saveDriversError() }}</p>
          <p class="count" *ngIf="syncingDrivers()">Auto-syncing MOTIV -> Access DB...</p>
          <div class="driver-glass-panel" *ngIf="driverTableRows().length > 0">
            <div class="driver-dashboard-cards">
              <div class="driver-card total">
                <span class="label">Total Drivers</span>
                <span class="value">{{ driverTableRows().length }}</span>
              </div>
              <div class="driver-card active">
                <span class="label">Active</span>
                <span class="value">{{ activeDriversCount() }}</span>
              </div>
              <div class="driver-card inactive">
                <span class="label">Deactivated</span>
                <span class="value">{{ deactivatedDriversCount() }}</span>
              </div>
              <div class="driver-card info">
                <span class="label">With Email</span>
                <span class="value">{{ driversWithEmailCount() }}</span>
              </div>
            </div>
            <div class="driver-actions">
              <input
                class="filter-input"
                type="text"
                placeholder="Search drivers (name, email, phone, status, vehicle)"
                [value]="driverSearchTerm()"
                (input)="setDriverSearchTerm($any($event.target).value)" />
              <select
                class="filter-input filter-select"
                [value]="driverStatusFilter()"
                (change)="setDriverStatusFilter($any($event.target).value)">
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
              </select>
              <select
                class="filter-input filter-select"
                [value]="driverEmailFilter()"
                (change)="setDriverEmailFilter($any($event.target).value)">
                <option value="all">All Email</option>
                <option value="with-email">With Email</option>
                <option value="without-email">Without Email</option>
              </select>
            </div>
            <p class="count">Rows: {{ filteredDriverRows().length }} / {{ driverTableRows().length }} | Loaded from API: {{ loadedDriverRows() }}</p>
          </div>
          <div class="available-api-table-wrap" *ngIf="filteredDriverRows().length > 0">
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>#</th>
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
                <tr *ngFor="let row of pagedDriverRows(); let i = index">
                  <td>{{ driverPageStartIndex() + i }}</td>
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
            <div class="table-pagination">
              <div class="page-meta">
                Showing {{ driverPageStartIndex() }}-{{ driverPageEndIndex() }} of {{ filteredDriverRows().length }}
              </div>
              <div class="page-controls">
                <select
                  class="filter-input filter-select page-size-select"
                  [value]="driverPageSize()"
                  (change)="setDriverPageSize(+$any($event.target).value)">
                  <option [value]="10">10 / page</option>
                  <option [value]="25">25 / page</option>
                  <option [value]="50">50 / page</option>
                  <option [value]="100">100 / page</option>
                </select>
                <button class="refresh-btn" (click)="goToPreviousDriverPage()" [disabled]="driverPage() <= 1">Prev</button>
                <span class="page-counter">Page {{ safeDriverPage() }} / {{ driverTotalPages() }}</span>
                <button class="refresh-btn" (click)="goToNextDriverPage()" [disabled]="safeDriverPage() >= driverTotalPages()">Next</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="tab-panel" *ngIf="activeTab() === 'activity'">
        <h2>Activity</h2>
        <p>Driver list on the left with MOTIV activity log on the right.</p>
        <div class="driver-actions">
          <button class="refresh-btn" (click)="refreshActivityTab()" [disabled]="loadingDrivers() || syncingDrivers()">
            {{ loadingDrivers() || syncingDrivers() ? 'Refreshing...' : 'Refresh Activity' }}
          </button>
          <button class="refresh-btn" (click)="openActivityReportModal()" [disabled]="generatingActivityReport()">
            {{ generatingActivityReport() ? 'Generating...' : 'Activity Report' }}
          </button>
        </div>
        <p class="error" *ngIf="activityReportError()">{{ activityReportError() }}</p>
        <div class="driver-glass-panel" style="margin-bottom: 10px;">
          <div class="driver-dashboard-cards">
            <div class="driver-card total">
              <span class="label">Drivers (Visible)</span>
              <span class="value">{{ activityVisibleDriversCount() }}</span>
            </div>
            <div class="driver-card active">
              <span class="label">Active Drivers</span>
              <span class="value">{{ activityActiveDriversCount() }}</span>
            </div>
            <div class="driver-card inactive">
              <span class="label">Inactive Drivers</span>
              <span class="value">{{ activityInactiveDriversCount() }}</span>
            </div>
            <div class="driver-card info">
              <span class="label">Activity Logs</span>
              <span class="value">{{ activityLogsTotalCount() }}</span>
            </div>
            <div class="driver-card info">
              <span class="label">Driver Activity Rows</span>
              <span class="value">{{ driverActivityRows().length }}</span>
            </div>
            <div class="driver-card info">
              <span class="label">Logs With Location</span>
              <span class="value">{{ activityLogsWithLocationCount() }}</span>
            </div>
          </div>
        </div>
        <div class="api-status">
          <div class="activity-layout">
            <div class="activity-left">
              <h3>Drivers</h3>
              <p class="count">Showing {{ activityDriverRows().length }} of {{ filteredDriverRows().length }} filtered drivers.</p>
              <div class="activity-top-filters">
                <input
                  class="filter-input"
                  type="text"
                  placeholder="Search drivers (name, email, phone, vehicle)"
                  [value]="driverSearchTerm()"
                  (input)="driverSearchTerm.set($any($event.target).value)" />
                <select
                  class="filter-input filter-select"
                  [value]="driverStatusFilter()"
                  (change)="driverStatusFilter.set($any($event.target).value)">
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="deactivated">Deactivated</option>
                </select>
                <select
                  class="filter-input filter-select"
                  [value]="driverEmailFilter()"
                  (change)="driverEmailFilter.set($any($event.target).value)">
                  <option value="all">All Email</option>
                  <option value="with-email">With Email</option>
                  <option value="without-email">Without Email</option>
                </select>
              </div>
              <div class="available-api-table-wrap" *ngIf="activityDriverRows().length > 0">
                <div class="activity-scroll-wrap">
                  <table class="available-api-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Vehicle</th>
                        <th>Last Update</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        *ngFor="let row of activityDriverRows(); let i = index"
                        class="activity-driver-row"
                        [class.selected]="selectedActivityDriverName() === row.name"
                        (click)="selectActivityDriver(row.name)">
                        <td>{{ i + 1 }}</td>
                        <td>{{ row.name }}</td>
                        <td>{{ row.status }}</td>
                        <td>{{ row.vehicle }}</td>
                        <td>{{ row.lastUpdate }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p class="count" *ngIf="activityDriverRows().length === 0">No drivers available yet. Open the Drivers tab and refresh.</p>
              <div class="activity-driver-subpanel">
                <div class="activity-driver-subpanel-head">
                  <h3>Driver Activity</h3>
                  <div class="activity-driver-subpanel-actions">
                    <span class="count" *ngIf="selectedActivityDriverName(); else allDriversLabel">
                      Selected: <strong>{{ selectedActivityDriverName() }}</strong>
                    </span>
                    <ng-template #allDriversLabel>
                      <span class="count">Selected: <strong>All Drivers</strong></span>
                    </ng-template>
                    <button class="refresh-btn" (click)="clearActivityDriverSelection()" [disabled]="!selectedActivityDriverName()">Clear</button>
                  </div>
                </div>
                <div class="activity-driver-filters">
                  <input
                    class="filter-input"
                    type="text"
                    placeholder="Search activity (title, details, driver, type)"
                    [value]="activitySearchTerm()"
                    (input)="activitySearchTerm.set($any($event.target).value)" />
                  <input
                    class="filter-input filter-date"
                    type="date"
                    [value]="activityDateFromFilter()"
                    (change)="activityDateFromFilter.set($any($event.target).value)"
                    title="Filter from date" />
                  <input
                    class="filter-input filter-date"
                    type="date"
                    [value]="activityDateToFilter()"
                    (change)="activityDateToFilter.set($any($event.target).value)"
                    title="Filter to date" />
                  <select
                    class="filter-input filter-select"
                    [value]="activityKindFilter()"
                    (change)="activityKindFilter.set($any($event.target).value)">
                    <option value="all">All Types</option>
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                  <select
                    class="filter-input filter-select"
                    [value]="activityScopeFilter()"
                    (change)="activityScopeFilter.set($any($event.target).value)">
                    <option value="all">All Scope</option>
                    <option value="driver">Driver Events</option>
                    <option value="system">System Events</option>
                  </select>
                  <button class="refresh-btn filter-clear-btn" (click)="clearActivityDateRangeFilter()" [disabled]="!activityDateFromFilter() && !activityDateToFilter()">Clear Dates</button>
                </div>
                <div class="available-api-table-wrap" *ngIf="driverActivityRows().length > 0">
                  <div class="activity-scroll-wrap activity-scroll-wrap-compact">
                    <table class="available-api-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Driver</th>
                          <th>Type</th>
                          <th>Event</th>
                          <th>Previous Location</th>
                          <th>Current Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr *ngFor="let row of driverActivityRows()">
                          <td>{{ formatActivityTimestamp(row.timestamp) }}</td>
                          <td>{{ row.driverName || 'General' }}</td>
                          <td>
                            <span class="status-chip"
                                  [class.connected]="row.kind === 'success'"
                                  [class.not-connected]="row.kind === 'error'"
                                  [class.checking]="row.kind === 'info' || row.kind === 'warning'">
                              {{ row.kind | titlecase }}
                            </span>
                          </td>
                          <td>
                            <strong>{{ row.title }}</strong>
                            <div class="activity-details">{{ formatActivitySummary(row.details) }}</div>
                          </td>
                          <td>{{ extractPreviousLocation(row.details) }}</td>
                          <td>{{ extractCurrentLocation(row.details) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <p class="count" *ngIf="driverActivityRows().length === 0">
                  No activity logs {{ selectedActivityDriverName() ? ('for ' + selectedActivityDriverName()) : 'for drivers' }}.
                </p>
              </div>
            </div>
            <div class="activity-right">
              <h3>Activity Log</h3>
              <div class="driver-glass-panel" style="margin-bottom: 10px;">
                <p class="count">
                  Location diagnostics: {{ locationDiagnostics().withLocation }} / {{ locationDiagnostics().totalDrivers }} drivers with a parsed location.
                </p>
                <p class="count">
                  Drivers with lat/lon: {{ locationDiagnostics().withLatLon }} | Drivers with city/state text: {{ locationDiagnostics().withCityState }}
                </p>
                <p class="count" *ngIf="locationDiagnostics().sampleKeys.length > 0">
                  Sample raw location keys: {{ locationDiagnostics().sampleKeys.join(', ') }}
                </p>
              </div>
              <div class="available-api-table-wrap" *ngIf="activityLogRows().length > 0">
                <div class="activity-scroll-wrap">
                  <table class="available-api-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Driver</th>
                        <th>Type</th>
                        <th>Event</th>
                        <th>Previous Location</th>
                        <th>Current Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let row of activityLogRows()">
                        <td>{{ formatActivityTimestamp(row.timestamp) }}</td>
                        <td>{{ row.driverName || 'General' }}</td>
                        <td>
                          <span class="status-chip"
                                [class.connected]="row.kind === 'success'"
                                [class.not-connected]="row.kind === 'error'"
                                [class.checking]="row.kind === 'info' || row.kind === 'warning'">
                            {{ row.kind | titlecase }}
                          </span>
                        </td>
                        <td>
                          <strong>{{ row.title }}</strong>
                          <div class="activity-details">{{ formatActivitySummary(row.details) }}</div>
                        </td>
                        <td>{{ extractPreviousLocation(row.details) }}</td>
                        <td>{{ extractCurrentLocation(row.details) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p class="count" *ngIf="activityLogRows().length === 0">No activity logs yet.</p>
            </div>
          </div>
        </div>
        <div class="activity-report-modal-backdrop" *ngIf="activityReportModalOpen()" (click)="closeActivityReportModal()">
          <div class="activity-report-modal" (click)="$event.stopPropagation()">
            <h3>Activity Report Options</h3>
            <p>Select which driver scope you want included in the activity report.</p>
            <div class="activity-report-grid">
              <label>
                Scope
                <select
                  class="filter-input filter-select"
                  [value]="activityReportScope()"
                  (change)="setActivityReportScope($any($event.target).value)">
                  <option value="active">All Active Drivers</option>
                  <option value="inactive">All Inactive Drivers</option>
                  <option value="specific">Specific Driver</option>
                </select>
              </label>
              <label>
                Year
                <select
                  class="filter-input filter-select"
                  [value]="activityReportYearFilter()"
                  (change)="setActivityReportYearFilter($any($event.target).value)">
                  <option value="all">All Years</option>
                  <option *ngFor="let y of activityReportAvailableYears()" [value]="y.toString()">{{ y }}</option>
                </select>
              </label>
              <label>
                Week
                <select
                  class="filter-input filter-select"
                  [disabled]="activityReportYearFilter() === 'all'"
                  [value]="activityReportWeekFilter()"
                  (change)="setActivityReportWeekFilter($any($event.target).value)">
                  <option value="all">All Weeks</option>
                  <option *ngFor="let w of activityReportAvailableWeeks()" [value]="w.key">{{ w.label }}</option>
                </select>
              </label>
              <label *ngIf="activityReportScope() === 'specific'">
                Driver
                <select
                  class="filter-input filter-select"
                  [value]="activityReportSpecificDriver()"
                  (change)="activityReportSpecificDriver.set($any($event.target).value)">
                  <option value="">Select Driver</option>
                  <option *ngFor="let name of activityReportDriverOptions()" [value]="name">{{ name }}</option>
                </select>
              </label>
            </div>
            <p class="error" *ngIf="activityReportModalError()">{{ activityReportModalError() }}</p>
            <div class="activity-report-actions">
              <button class="refresh-btn" (click)="closeActivityReportModal()">Cancel</button>
              <button class="refresh-btn" (click)="generateActivityReport()" [disabled]="generatingActivityReport()">
                {{ generatingActivityReport() ? 'Generating...' : 'Generate Report' }}
              </button>
            </div>
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
          <div class="driver-glass-panel" *ngIf="vehicleTableRows().length > 0">
            <div class="driver-dashboard-cards">
              <div class="driver-card total">
                <span class="label">Total Vehicles</span>
                <span class="value">{{ vehicleTableRows().length }}</span>
              </div>
              <div class="driver-card active">
                <span class="label">Active</span>
                <span class="value">{{ activeVehiclesCount() }}</span>
              </div>
              <div class="driver-card inactive">
                <span class="label">Deactivated</span>
                <span class="value">{{ deactivatedVehiclesCount() }}</span>
              </div>
              <div class="driver-card info">
                <span class="label">With VIN</span>
                <span class="value">{{ vehiclesWithVinCount() }}</span>
              </div>
            </div>
            <div class="driver-actions">
              <input
                class="filter-input"
                type="text"
                placeholder="Search vehicles (unit, make, model, year, VIN, status)"
                [value]="vehicleSearchTerm()"
                (input)="setVehicleSearchTerm($any($event.target).value)" />
              <select
                class="filter-input filter-select"
                [value]="vehicleStatusFilter()"
                (change)="setVehicleStatusFilter($any($event.target).value)">
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
                <option value="other">Other</option>
              </select>
              <select
                class="filter-input filter-select"
                [value]="vehicleVinFilter()"
                (change)="setVehicleVinFilter($any($event.target).value)">
                <option value="all">All VIN</option>
                <option value="with-vin">With VIN</option>
                <option value="without-vin">Without VIN</option>
              </select>
            </div>
            <p class="count">Rows: {{ filteredVehicleRows().length }} / {{ vehicleTableRows().length }}</p>
            <p class="count" *ngIf="vehicleLocationSyncMessage()">{{ vehicleLocationSyncMessage() }}</p>
          </div>
          <div class="available-api-table-wrap" *ngIf="filteredVehicleRows().length > 0">
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>ID</th>
                  <th>Unit</th>
                  <th>Make</th>
                  <th>Model</th>
                  <th>Year</th>
                  <th>VIN</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Last Update</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of pagedVehicleRows(); let i = index">
                  <td>{{ vehiclePageStartIndex() + i }}</td>
                  <td>{{ row.id }}</td>
                  <td>{{ row.number }}</td>
                  <td>{{ row.make }}</td>
                  <td>{{ row.model }}</td>
                  <td>{{ row.year }}</td>
                  <td>{{ row.vin }}</td>
                  <td>{{ row.status }}</td>
                  <td>{{ row.location }}</td>
                  <td>{{ row.lastUpdate }}</td>
                </tr>
              </tbody>
            </table>
            <div class="table-pagination">
              <div class="page-meta">
                Showing {{ vehiclePageStartIndex() }}-{{ vehiclePageEndIndex() }} of {{ filteredVehicleRows().length }}
              </div>
              <div class="page-controls">
                <select
                  class="filter-input filter-select page-size-select"
                  [value]="vehiclePageSize()"
                  (change)="setVehiclePageSize(+$any($event.target).value)">
                  <option [value]="10">10 / page</option>
                  <option [value]="25">25 / page</option>
                  <option [value]="50">50 / page</option>
                  <option [value]="100">100 / page</option>
                </select>
                <button class="refresh-btn" (click)="goToPreviousVehiclePage()" [disabled]="vehiclePage() <= 1">Prev</button>
                <span class="page-counter">Page {{ safeVehiclePage() }} / {{ vehicleTotalPages() }}</span>
                <button class="refresh-btn" (click)="goToNextVehiclePage()" [disabled]="safeVehiclePage() >= vehicleTotalPages()">Next</button>
              </div>
            </div>
          </div>
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
          <div class="driver-glass-panel" *ngIf="userTableRows().length > 0">
            <div class="driver-dashboard-cards">
              <div class="driver-card total">
                <span class="label">Total Users</span>
                <span class="value">{{ userTableRows().length }}</span>
              </div>
              <div class="driver-card active">
                <span class="label">Active</span>
                <span class="value">{{ activeUsersCount() }}</span>
              </div>
              <div class="driver-card inactive">
                <span class="label">Deactivated</span>
                <span class="value">{{ deactivatedUsersCount() }}</span>
              </div>
              <div class="driver-card info">
                <span class="label">With Email</span>
                <span class="value">{{ usersWithEmailCount() }}</span>
              </div>
            </div>
            <div class="driver-actions">
              <input
                class="filter-input"
                type="text"
                placeholder="Search users (name, email, phone, type, status, role)"
                [value]="userSearchTerm()"
                (input)="setUserSearchTerm($any($event.target).value)" />
              <select
                class="filter-input filter-select"
                [value]="userStatusFilter()"
                (change)="setUserStatusFilter($any($event.target).value)">
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
              </select>
              <select
                class="filter-input filter-select"
                [value]="userTypeFilter()"
                (change)="setUserTypeFilter($any($event.target).value)">
                <option value="all">All Types</option>
                <option value="driver">Driver</option>
                <option value="admin">Admin</option>
                <option value="other">Other</option>
              </select>
            </div>
            <p class="count">Rows: {{ filteredUserRows().length }} / {{ userTableRows().length }}</p>
          </div>
          <div class="available-api-table-wrap" *ngIf="filteredUserRows().length > 0">
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of pagedUserRows(); let i = index">
                  <td>{{ userPageStartIndex() + i }}</td>
                  <td>{{ row.name }}</td>
                  <td>{{ row.email }}</td>
                  <td>{{ row.phone }}</td>
                  <td>{{ row.userType }}</td>
                  <td>{{ row.status }}</td>
                  <td>{{ row.role }}</td>
                </tr>
              </tbody>
            </table>
            <div class="table-pagination">
              <div class="page-meta">
                Showing {{ userPageStartIndex() }}-{{ userPageEndIndex() }} of {{ filteredUserRows().length }}
              </div>
              <div class="page-controls">
                <select
                  class="filter-input filter-select page-size-select"
                  [value]="userPageSize()"
                  (change)="setUserPageSize(+$any($event.target).value)">
                  <option [value]="10">10 / page</option>
                  <option [value]="25">25 / page</option>
                  <option [value]="50">50 / page</option>
                  <option [value]="100">100 / page</option>
                </select>
                <button class="refresh-btn" (click)="goToPreviousUserPage()" [disabled]="userPage() <= 1">Prev</button>
                <span class="page-counter">Page {{ safeUserPage() }} / {{ userTotalPages() }}</span>
                <button class="refresh-btn" (click)="goToNextUserPage()" [disabled]="safeUserPage() >= userTotalPages()">Next</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="tab-panel" *ngIf="activeTab() === 'safety'">
        <h2>Safety & Dash Cam Events</h2>
        <p>Driver performance safety events from MOTIV, including camera media availability.</p>
        <div class="api-status">
          <div class="driver-actions">
            <button class="refresh-btn" (click)="loadSafetyEvents()" [disabled]="loadingSafety()">
              {{ loadingSafety() ? 'Loading...' : 'Refresh Safety Events' }}
            </button>
            <select
              class="filter-input filter-select"
              [value]="safetyDaysFilter()"
              (change)="setSafetyDaysFilter(+$any($event.target).value)">
              <option [value]="7">Last 7 days</option>
              <option [value]="14">Last 14 days</option>
              <option [value]="30">Last 30 days</option>
              <option [value]="90">Last 90 days</option>
            </select>
            <select
              class="filter-input filter-select"
              [value]="safetyVideoFilter()"
              (change)="setSafetyVideoFilter($any($event.target).value)">
              <option value="all">All Media</option>
              <option value="with-video">With Video</option>
              <option value="without-video">Without Video</option>
            </select>
          </div>
          <p class="error" *ngIf="safetyError()">{{ safetyError() }}</p>
          <div class="driver-glass-panel" *ngIf="safetyRows().length > 0">
            <div class="driver-dashboard-cards">
              <div class="driver-card total">
                <span class="label">Events</span>
                <span class="value">{{ filteredSafetyRows().length }}</span>
              </div>
              <div class="driver-card active">
                <span class="label">With Video</span>
                <span class="value">{{ safetyWithVideoCount() }}</span>
              </div>
              <div class="driver-card inactive">
                <span class="label">Unique Drivers</span>
                <span class="value">{{ safetyUniqueDriversCount() }}</span>
              </div>
              <div class="driver-card info">
                <span class="label">Unique Vehicles</span>
                <span class="value">{{ safetyUniqueVehiclesCount() }}</span>
              </div>
            </div>
            <div class="driver-actions">
              <input
                class="filter-input"
                type="text"
                placeholder="Search events (driver, vehicle, event type, location)"
                [value]="safetySearchTerm()"
                (input)="setSafetySearchTerm($any($event.target).value)" />
              <select
                class="filter-input filter-select"
                [value]="safetyTypeFilter()"
                (change)="setSafetyTypeFilter($any($event.target).value)">
                <option value="all">All Event Types</option>
                <option *ngFor="let t of safetyEventTypeOptions()" [value]="t">{{ t }}</option>
              </select>
            </div>
            <p class="count">Rows: {{ filteredSafetyRows().length }} / {{ safetyRows().length }}</p>
          </div>

          <div class="available-api-table-wrap" *ngIf="filteredSafetyRows().length > 0">
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Severity</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Media</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of filteredSafetyRows()">
                  <td>{{ row.eventAt }}</td>
                  <td>{{ row.eventType }}</td>
                  <td>{{ row.severity }}</td>
                  <td>{{ row.driver }}</td>
                  <td>{{ row.vehicle }}</td>
                  <td>{{ row.location }}</td>
                  <td>{{ row.status }}</td>
                  <td>
                    <a *ngIf="row.videoUrl; else noSafetyVideo" [href]="row.videoUrl" target="_blank" rel="noopener noreferrer">Open</a>
                    <ng-template #noSafetyVideo>{{ row.hasVideo ? 'Available' : 'N/A' }}</ng-template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="count" *ngIf="!loadingSafety() && filteredSafetyRows().length === 0">No safety events found for the selected filters.</p>
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
            <button class="refresh-btn" (click)="backfillFuelPurchases()" [disabled]="savingFuel() || loadingFuel()">
              {{ savingFuel() ? 'Backfilling...' : 'Backfill Fuel History' }}
            </button>
            <button class="refresh-btn" (click)="generateFuelReportPerActiveDriver()" [disabled]="generatingFuelReport() || loadingFuel()">
              {{ generatingFuelReport() ? 'Generating...' : 'Generate Active Driver Report' }}
            </button>
          </div>
          <p class="error" *ngIf="fuelError()">{{ fuelError() }}</p>
          <p class="ok-note" *ngIf="saveFuelMessage()">{{ saveFuelMessage() }}</p>
          <p class="error" *ngIf="saveFuelError()">{{ saveFuelError() }}</p>
          <div class="driver-glass-panel" *ngIf="fuelRows().length > 0">
            <div class="driver-dashboard-cards">
              <div class="driver-card total">
                <span class="label">Total Purchases</span>
                <span class="value">{{ fuelRows().length }}</span>
              </div>
              <div class="driver-card active">
                <span class="label">Total Amount</span>
                <span class="value">{{ fuelTotalAmount() | number:'1.0-2' }}</span>
              </div>
              <div class="driver-card active">
                <span class="label">Fuel Spend</span>
                <span class="value">{{ fuelSpendAmount() | number:'1.0-2' }}</span>
              </div>
              <div class="driver-card inactive">
                <span class="label">Other Charges</span>
                <span class="value">{{ fuelOtherChargesAmount() | number:'1.0-2' }}</span>
              </div>
              <div class="driver-card info">
                <span class="label">Unknown Charges</span>
                <span class="value">{{ fuelUnknownChargesAmount() | number:'1.0-2' }}</span>
              </div>
              <div class="driver-card info">
                <span class="label">Unique Drivers</span>
                <span class="value">{{ fuelUniqueDriversCount() }}</span>
              </div>
              <div class="driver-card inactive">
                <span class="label">Unique Vehicles</span>
                <span class="value">{{ fuelUniqueVehiclesCount() }}</span>
              </div>
              <div class="driver-card info">
                <span class="label">Cards Used</span>
                <span class="value">{{ fuelUniqueCardsCount() }}</span>
              </div>
              <div class="driver-card total">
                <span class="label">{{ fuelWeekFilter() === 'all' ? 'Week Coverage' : 'Selected Week Dates' }}</span>
                <span class="value">
                  {{ fuelWeekFilter() === 'all' ? (fuelDistinctWeeksCount() + ' w / ' + fuelDistinctYearsCount() + ' y') : fuelSelectedWeekDateRange() }}
                </span>
              </div>
            </div>
            <div class="driver-actions">
              <input
                class="filter-input"
                type="text"
                placeholder="Search fuel (merchant, city, state, driver, vehicle, category, source)"
                [value]="fuelSearchTerm()"
                (input)="setFuelSearchTerm($any($event.target).value)" />
              <select
                class="filter-input filter-select"
                [value]="fuelStatusFilter()"
                (change)="setFuelStatusFilter($any($event.target).value)">
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="other">Other</option>
              </select>
              <select
                class="filter-input filter-select"
                [value]="fuelSourceFilter()"
                (change)="setFuelSourceFilter($any($event.target).value)">
                <option value="all">All Sources</option>
                <option value="motive-card">Motive Card</option>
                <option value="other">Other</option>
              </select>
              <select
                class="filter-input filter-select"
                [value]="fuelCardFilter()"
                (change)="setFuelCardFilter($any($event.target).value)">
                <option value="all">All Cards</option>
                <option *ngFor="let card of fuelCardOptions()" [value]="card">{{ card }}</option>
              </select>
              <select
                class="filter-input filter-select"
                [value]="fuelYearFilter()"
                (change)="setFuelYearFilter($any($event.target).value)">
                <option value="all">All Years</option>
                <option *ngFor="let y of fuelAvailableYears()" [value]="y">{{ y }}</option>
              </select>
              <select
                class="filter-input filter-select"
                [value]="fuelWeekFilter()"
                (change)="setFuelWeekFilter($any($event.target).value)">
                <option value="all">All Weeks</option>
                <option *ngFor="let w of fuelAvailableWeeks()" [value]="w.key">{{ w.label }}</option>
              </select>
            </div>
            <p class="count">Rows: {{ filteredFuelRows().length }} / {{ fuelRows().length }}</p>
          </div>
          <div class="available-api-table-wrap" *ngIf="filteredFuelRows().length > 0">
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th class="sortable-th" (click)="setFuelSort('transactionId')">Transaction {{ getFuelSortIndicator('transactionId') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('date')">Date {{ getFuelSortIndicator('date') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('week')">Week # {{ getFuelSortIndicator('week') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('status')">Status {{ getFuelSortIndicator('status') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('amount')">Amount {{ getFuelSortIndicator('amount') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('merchant')">Merchant {{ getFuelSortIndicator('merchant') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('city')">City {{ getFuelSortIndicator('city') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('state')">State {{ getFuelSortIndicator('state') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('driverId')">Driver {{ getFuelSortIndicator('driverId') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('vehicleId')">Vehicle {{ getFuelSortIndicator('vehicleId') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('cardLabel')">Card {{ getFuelSortIndicator('cardLabel') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('category')">Category {{ getFuelSortIndicator('category') }}</th>
                  <th class="sortable-th" (click)="setFuelSort('source')">Source {{ getFuelSortIndicator('source') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of pagedFuelRows(); let i = index">
                  <td>{{ fuelPageStartIndex() + i }}</td>
                  <td>{{ row.transactionId }}</td>
                  <td>{{ row.date }}</td>
                  <td>{{ getFuelWeekLabel(row.date) }}</td>
                  <td>{{ row.status }}</td>
                  <td>{{ row.amount }} {{ row.currency }}</td>
                  <td>{{ row.merchant }}</td>
                  <td>{{ row.city }}</td>
                  <td>{{ row.state }}</td>
                  <td>{{ row.driverId }}</td>
                  <td>{{ row.vehicleId }}</td>
                  <td>{{ row.cardLabel }}</td>
                  <td>{{ row.category }}</td>
                  <td>{{ row.source }}</td>
                </tr>
              </tbody>
            </table>
            <div class="table-pagination">
              <div class="page-meta">
                Showing {{ fuelPageStartIndex() }}-{{ fuelPageEndIndex() }} of {{ filteredFuelRows().length }}
              </div>
              <div class="page-controls">
                <select
                  class="filter-input filter-select page-size-select"
                  [value]="fuelPageSize()"
                  (change)="setFuelPageSize(+$any($event.target).value)">
                  <option [value]="10">10 / page</option>
                  <option [value]="25">25 / page</option>
                  <option [value]="50">50 / page</option>
                  <option [value]="100">100 / page</option>
                </select>
                <button class="refresh-btn" (click)="goToPreviousFuelPage()" [disabled]="fuelPage() <= 1">Prev</button>
                <span class="page-counter">Page {{ safeFuelPage() }} / {{ fuelTotalPages() }}</span>
                <button class="refresh-btn" (click)="goToNextFuelPage()" [disabled]="safeFuelPage() >= fuelTotalPages()">Next</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section class="tab-panel" *ngIf="activeTab() === 'fuel-cards'">
        <h2>Fuel Cards</h2>
        <p>MOTIV fuel cards pulled through the secure backend proxy.</p>
        <div class="api-status">
          <div class="driver-actions">
            <button class="refresh-btn" (click)="loadFuelCards()" [disabled]="loadingFuelCards()">
              {{ loadingFuelCards() ? 'Loading...' : 'Refresh Fuel Cards' }}
            </button>
          </div>
          <p class="error" *ngIf="fuelCardsError()">{{ fuelCardsError() }}</p>
          <div class="driver-glass-panel" *ngIf="fuelCardRows().length > 0">
            <div class="driver-dashboard-cards">
              <div class="driver-card total">
                <span class="label">Cards Issued</span>
                <span class="value">{{ fuelCardRows().length }}</span>
              </div>
              <div class="driver-card active">
                <span class="label">Active Cards</span>
                <span class="value">{{ fuelCardsActiveCount() }}</span>
              </div>
              <div class="driver-card info">
                <span class="label">Cards Used</span>
                <span class="value">{{ fuelCardsUsedCount() }}</span>
              </div>
              <div class="driver-card inactive">
                <span class="label">Card Spend</span>
                <span class="value">{{ fuelCardsTotalSpend() | number:'1.0-2' }}</span>
              </div>
            </div>
            <div class="driver-actions">
              <input
                class="filter-input"
                type="text"
                placeholder="Search cards (name, last4, status, type)"
                [value]="fuelCardSearchTerm()"
                (input)="setFuelCardSearchTerm($any($event.target).value)" />
              <select
                class="filter-input filter-select"
                [value]="fuelCardStatusFilter()"
                (change)="setFuelCardStatusFilter($any($event.target).value)">
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="other">Other</option>
              </select>
              <select
                class="filter-input filter-select"
                [value]="fuelCardYearFilter()"
                (change)="setFuelCardYearFilter($any($event.target).value)">
                <option value="all">All Years</option>
                <option *ngFor="let y of fuelCardAvailableYears()" [value]="y">{{ y }}</option>
              </select>
              <select
                class="filter-input filter-select"
                [value]="fuelCardWeekFilter()"
                (change)="setFuelCardWeekFilter($any($event.target).value)">
                <option value="all">All Weeks</option>
                <option *ngFor="let w of fuelCardAvailableWeeks()" [value]="w.key">{{ w.label }}</option>
              </select>
            </div>
            <p class="count">Rows: {{ filteredFuelCardRows().length }} / {{ fuelCardRows().length }}</p>
          </div>
          <div class="available-api-table-wrap" *ngIf="filteredFuelCardRows().length > 0">
            <table class="available-api-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Card</th>
                  <th>Last4</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Limit</th>
                  <th>Purchases</th>
                  <th>Spend</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of pagedFuelCardRows(); let i = index">
                  <td>{{ fuelCardPageStartIndex() + i }}</td>
                  <td>{{ row.label }}</td>
                  <td>{{ row.last4 }}</td>
                  <td>{{ row.status }}</td>
                  <td>{{ row.type }}</td>
                  <td>{{ row.limit }} {{ row.currency }}</td>
                  <td>{{ row.purchases }}</td>
                  <td>{{ row.spend | number:'1.0-2' }}</td>
                </tr>
              </tbody>
            </table>
            <div class="table-pagination">
              <div class="page-meta">
                Showing {{ fuelCardPageStartIndex() }}-{{ fuelCardPageEndIndex() }} of {{ filteredFuelCardRows().length }}
              </div>
              <div class="page-controls">
                <select
                  class="filter-input filter-select page-size-select"
                  [value]="fuelCardPageSize()"
                  (change)="setFuelCardPageSize(+$any($event.target).value)">
                  <option [value]="10">10 / page</option>
                  <option [value]="25">25 / page</option>
                  <option [value]="50">50 / page</option>
                  <option [value]="100">100 / page</option>
                </select>
                <button class="refresh-btn" (click)="goToPreviousFuelCardPage()" [disabled]="fuelCardPage() <= 1">Prev</button>
                <span class="page-counter">Page {{ safeFuelCardPage() }} / {{ fuelCardTotalPages() }}</span>
                <button class="refresh-btn" (click)="goToNextFuelCardPage()" [disabled]="safeFuelCardPage() >= fuelCardTotalPages()">Next</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .motiv-page {
      padding: 20px;
      color: var(--text-primary);
      border: 1px solid rgba(125, 211, 252, 0.18);
      border-radius: 14px;
      background: linear-gradient(180deg, rgba(7, 16, 32, 0.62), rgba(7, 16, 32, 0.42));
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
    }
    .page-header { margin-bottom: 16px; }
    .page-header h1 { margin: 0 0 6px; display: flex; gap: 8px; align-items: center; }
    .page-header p { margin: 0; color: #94a3b8; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab-btn {
      border: 1px solid rgba(125, 211, 252, 0.2);
      background: rgba(10, 20, 36, 0.58);
      color: var(--text-secondary);
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .tab-btn.active {
      border-color: rgba(0, 212, 255, 0.42);
      color: #9fe9ff;
      background: linear-gradient(135deg, rgba(0, 212, 255, 0.18), rgba(0, 212, 255, 0.07));
      box-shadow: 0 0 16px rgba(0, 212, 255, 0.18);
    }
    .tab-panel {
      border: 1px solid rgba(125, 211, 252, 0.16);
      background: rgba(9, 18, 34, 0.56);
      border-radius: 12px;
      padding: 16px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
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
      border: 1px solid rgba(125, 211, 252, 0.24);
      background: rgba(10, 20, 36, 0.62);
      color: var(--text-primary);
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 10px;
      transition: all 0.16s ease;
    }
    .refresh-btn:hover {
      border-color: rgba(0, 212, 255, 0.42);
      box-shadow: 0 0 14px rgba(0, 212, 255, 0.2);
    }
    .refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .driver-actions { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
    .sync-status-panel {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .sync-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(148, 163, 184, 0.35);
      border-top-color: #06b6d4;
      border-radius: 50%;
      animation: sync-spin 0.8s linear infinite;
    }
    .sync-status-text {
      color: #94a3b8;
      font-size: 12px;
    }
    @keyframes sync-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .driver-glass-panel {
      margin-bottom: 10px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 10px;
    }
    .driver-dashboard-cards {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }
    .driver-card {
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.35);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .driver-card .label {
      color: #94a3b8;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .driver-card .value {
      color: #e2e8f0;
      font-size: 20px;
      font-weight: 700;
      line-height: 1.1;
    }
    .driver-card.active .value { color: #22c55e; }
    .driver-card.inactive .value { color: #ef4444; }
    .driver-card.info .value { color: #60a5fa; }
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
      border: 1px solid rgba(125, 211, 252, 0.24);
      background: rgba(10, 20, 36, 0.58);
      color: var(--text-primary);
      padding: 8px 10px;
      border-radius: 8px;
      min-width: 220px;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    .driver-actions .filter-input {
      flex: 1 1 420px;
      min-width: 320px;
    }
    .driver-actions .filter-select {
      flex: 0 0 180px;
      min-width: 180px;
    }
    .filter-select option {
      color: #0f172a;
      background: #f8fafc;
    }
    .table-pagination {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .page-meta {
      color: #94a3b8;
      font-size: 12px;
    }
    .page-controls {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .page-size-select {
      flex: 0 0 120px !important;
      min-width: 120px !important;
    }
    .page-counter {
      color: #cbd5e1;
      font-size: 12px;
      min-width: 90px;
      text-align: center;
    }
    .table-pagination .refresh-btn {
      margin-bottom: 0;
      padding: 6px 10px;
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
      border: 1px solid rgba(125, 211, 252, 0.18);
      border-radius: 8px;
      overflow: hidden;
      background: rgba(9, 18, 34, 0.6);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .available-api-table th,
    .available-api-table td {
      padding: 8px 10px;
      border-bottom: 1px solid rgba(125, 211, 252, 0.12);
      text-align: left;
      font-size: 12px;
      color: var(--text-primary);
    }
    .available-api-table tr:last-child td { border-bottom: none; }
    .available-api-table th { color: #9ccde0; background: rgba(10, 20, 36, 0.7); }
    .available-api-table th.sortable-th {
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    .available-api-table th.sortable-th:hover {
      color: #d5f2ff;
      background: rgba(0, 212, 255, 0.12);
    }
    .activity-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
      gap: 12px;
      align-items: start;
    }
    .activity-scroll-wrap {
      max-height: 430px;
      overflow: auto;
      border-radius: 8px;
    }
    .activity-scroll-wrap-compact {
      max-height: 260px;
    }
    .activity-left,
    .activity-right {
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 10px;
    }
    .activity-left > .available-api-table-wrap:first-of-type {
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    }
    .activity-left h3,
    .activity-right h3 {
      margin: 0 0 6px;
      font-size: 14px;
      color: #dbeafe;
    }
    .activity-driver-row { cursor: pointer; }
    .activity-driver-row.selected td {
      background: rgba(0, 212, 255, 0.14);
      box-shadow: inset 0 0 0 1px rgba(0, 212, 255, 0.35);
    }
    .activity-driver-subpanel {
      margin-top: 14px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 10px;
      padding: 12px;
      background: rgba(8, 15, 28, 0.38);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }
    .activity-driver-subpanel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .activity-driver-subpanel-head h3 {
      margin: 0;
      font-size: 13px;
      color: #dbeafe;
    }
    .activity-driver-subpanel-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .activity-top-filters {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin: 8px 0 10px;
    }
    .activity-top-filters .filter-input {
      flex: 1 1 220px;
      min-width: 180px;
    }
    .activity-top-filters .filter-select {
      flex: 0 0 160px;
      min-width: 140px;
    }
    .activity-driver-filters {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .activity-driver-filters .filter-input {
      min-width: 220px;
      flex: 1;
    }
    .activity-driver-filters .filter-date {
      min-width: 170px;
      flex: 0 0 auto;
    }
    .activity-driver-filters .filter-select {
      min-width: 150px;
      flex: 0 0 auto;
    }
    .activity-driver-filters .filter-clear-btn {
      margin-bottom: 0;
      flex: 0 0 auto;
    }
    .activity-details {
      margin-top: 4px;
      color: #94a3b8;
      font-size: 12px;
      line-height: 1.35;
    }
    .activity-report-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.68);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1200;
      padding: 16px;
    }
    .activity-report-modal {
      width: min(560px, 100%);
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.96);
      box-shadow: 0 12px 34px rgba(2, 6, 23, 0.55);
      padding: 14px;
    }
    .activity-report-modal h3 {
      margin: 0 0 8px;
      color: #dbeafe;
      font-size: 15px;
    }
    .activity-report-modal p {
      margin: 0 0 10px;
      color: #93c5fd;
      font-size: 12px;
    }
    .activity-report-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    .activity-report-grid label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: #cbd5e1;
      font-size: 12px;
    }
    .activity-report-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
    @media (max-width: 1200px) {
      .activity-layout {
        grid-template-columns: 1fr;
      }
    }
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

    :host-context(.mode-hard) .motiv-page {
      border-color: rgba(168, 85, 247, 0.28);
      box-shadow:
        0 12px 30px rgba(0, 0, 0, 0.35),
        0 0 22px rgba(168, 85, 247, 0.14);
    }

    :host-context(.mode-hard) .tab-btn.active,
    :host-context(.mode-hard) .status-pill.ok {
      box-shadow: 0 0 18px rgba(168, 85, 247, 0.16), 0 0 12px rgba(0, 212, 255, 0.2);
    }
  `]
})
export class MotivComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private strictModeStorageKey = 'motiv.strictMode405';
  private motivStatusCacheKey = 'motiv.statusCache.v1';
  // Manual refresh only: keep cached MOTIV status until user refreshes.
  private motivStatusCacheMaxAgeMs: number | null = null;

  activeTab = signal<MotivTab>('api');
  loading = signal(false);
  apiConfig = signal<{ headerName: string; hasApiKey: boolean; hasBaseUrl: boolean } | null>(null);
  error = signal('');
  loadingDrivers = signal(false);
  loadingVehicles = signal(false);
  loadingUsers = signal(false);
  loadingSafety = signal(false);
  loadingFuelCards = signal(false);
  generatingActivityReport = signal(false);
  savingDrivers = signal(false);
  syncingDrivers = signal(false);
  loadingFuel = signal(false);
  savingFuel = signal(false);
  driversError = signal('');
  vehiclesError = signal('');
  vehicleLocationSyncMessage = signal('');
  usersError = signal('');
  safetyError = signal('');
  fuelError = signal('');
  fuelCardsError = signal('');
  activityReportError = signal('');
  activityReportModalError = signal('');
  saveDriversMessage = signal('');
  saveDriversError = signal('');
  syncStatusMessage = signal('Ready.');
  lastDriverSyncSummary = signal<DriverSyncSummary | null>(null);
  saveFuelMessage = signal('');
  saveFuelError = signal('');
  generatingFuelReport = signal(false);
  motivDrivers = signal<any[]>([]);
  motivVehicles = signal<any[]>([]);
  motivUsers = signal<any[]>([]);
  motivSafetyEvents = signal<any[]>([]);
  motivFuelPurchases = signal<any[]>([]);
  motivFuelCards = signal<any[]>([]);
  motivCardTransactions = signal<any[]>([]);
  persistedActivityFeed = signal<MotivActivityLogEntry[]>([]);
  activityBackfillAttempted = signal(false);
  activityFeed = signal<MotivActivityLogEntry[]>([]);
  selectedActivityDriverName = signal('');
  activitySearchTerm = signal('');
  activityDateFromFilter = signal('');
  activityDateToFilter = signal('');
  activityKindFilter = signal<'all' | 'info' | 'success' | 'warning' | 'error'>('all');
  activityScopeFilter = signal<'all' | 'driver' | 'system'>('all');
  activityReportModalOpen = signal(false);
  activityReportScope = signal<ActivityReportScope>('active');
  activityReportSpecificDriver = signal('');
  activityReportYearFilter = signal<string>('all');
  activityReportWeekFilter = signal<string>('all');
  loadedDriverRows = signal(0);
  driverSearchTerm = signal('');
  driverStatusFilter = signal<'all' | 'active' | 'deactivated'>('active');
  driverEmailFilter = signal<'all' | 'with-email' | 'without-email'>('all');
  driverPage = signal(1);
  driverPageSize = signal(100);
  vehiclePage = signal(1);
  vehiclePageSize = signal(100);
  vehicleSearchTerm = signal('');
  vehicleStatusFilter = signal<'all' | 'active' | 'deactivated' | 'other'>('all');
  vehicleVinFilter = signal<'all' | 'with-vin' | 'without-vin'>('all');
  fuelSearchTerm = signal('');
  fuelStatusFilter = signal<'all' | 'completed' | 'pending' | 'other'>('all');
  fuelSourceFilter = signal<'all' | 'motive-card' | 'other'>('all');
  fuelCardFilter = signal<string>('all');
  fuelYearFilter = signal<string>(String(this.getIsoWeekInfo(new Date()).year));
  fuelWeekFilter = signal<string>(this.getIsoWeekInfo(new Date()).key);
  fuelSortColumn = signal<FuelSortColumn>('date');
  fuelSortDirection = signal<'asc' | 'desc'>('desc');
  fuelPage = signal(1);
  fuelPageSize = signal(100);
  fuelCardSearchTerm = signal('');
  fuelCardStatusFilter = signal<'all' | 'active' | 'inactive' | 'other'>('all');
  fuelCardYearFilter = signal<string>('all');
  fuelCardWeekFilter = signal<string>('all');
  fuelCardPage = signal(1);
  fuelCardPageSize = signal(100);
  userSearchTerm = signal('');
  userStatusFilter = signal<'all' | 'active' | 'deactivated'>('all');
  userTypeFilter = signal<'all' | 'driver' | 'admin' | 'other'>('all');
  userPage = signal(1);
  userPageSize = signal(100);
  safetySearchTerm = signal('');
  safetyTypeFilter = signal<string>('all');
  safetyVideoFilter = signal<'all' | 'with-video' | 'without-video'>('all');
  safetyDaysFilter = signal(30);
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
    this.dedupeDriverRows(this.motivDrivers().map((raw) => this.mapDriverRow(raw)))
  );
  locationDiagnostics = computed(() => {
    const rows = this.motivDrivers();
    let withLocation = 0;
    let withLatLon = 0;
    let withCityState = 0;
    const sampleKeySet = new Set<string>();

    for (const row of rows) {
      const mapped = this.mapDriverRow(row);
      if (mapped.location && mapped.location !== 'N/A') {
        withLocation++;
      }

      const seed = this.extractLocationSeed(row) ?? {};
      const lat = seed?.lat ?? seed?.latitude ?? seed?.Latitude ?? row?.lat ?? row?.latitude ?? row?.Latitude;
      const lon = seed?.lon ?? seed?.lng ?? seed?.longitude ?? seed?.Longitude ?? row?.lon ?? row?.lng ?? row?.longitude ?? row?.Longitude;
      if (lat != null && lon != null) {
        withLatLon++;
      }

      const city = seed?.city ?? seed?.City ?? seed?.address?.city ?? seed?.address?.City ?? row?.city ?? row?.City;
      const state = seed?.state ?? seed?.State ?? seed?.address?.state ?? seed?.address?.State ?? row?.state ?? row?.State;
      if (city || state) {
        withCityState++;
      }

      const keys = this.collectLocationKeys(row);
      for (const key of keys) {
        if (sampleKeySet.size >= 12) break;
        sampleKeySet.add(key);
      }
    }

    return {
      totalDrivers: rows.length,
      withLocation,
      withLatLon,
      withCityState,
      sampleKeys: Array.from(sampleKeySet)
    };
  });
  vehicleTableRows = computed<MotivVehicleTableRow[]>(() =>
    this.motivVehicles().map((raw) => this.mapVehicleRow(raw))
  );
  filteredVehicleRows = computed<MotivVehicleTableRow[]>(() => {
    const term = this.vehicleSearchTerm().trim().toLowerCase();
    const statusFilter = this.vehicleStatusFilter();
    const vinFilter = this.vehicleVinFilter();

    const filtered = this.vehicleTableRows().filter(row => {
      const matchesSearch =
        !term ||
        row.id.toLowerCase().includes(term) ||
        row.number.toLowerCase().includes(term) ||
        row.make.toLowerCase().includes(term) ||
        row.model.toLowerCase().includes(term) ||
        row.year.toLowerCase().includes(term) ||
        row.vin.toLowerCase().includes(term) ||
        row.status.toLowerCase().includes(term) ||
        row.location.toLowerCase().includes(term) ||
        row.lastUpdate.toLowerCase().includes(term);

      const normalizedStatus = row.status.trim().toLowerCase();
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && this.isActiveLikeStatus(normalizedStatus)) ||
        (statusFilter === 'deactivated' && this.isVehicleDeactivatedStatus(normalizedStatus)) ||
        (statusFilter === 'other' && !this.isActiveLikeStatus(normalizedStatus) && !this.isVehicleDeactivatedStatus(normalizedStatus));

      const hasVin = !!row.vin && row.vin.toLowerCase() !== 'n/a';
      const matchesVin =
        vinFilter === 'all' ||
        (vinFilter === 'with-vin' && hasVin) ||
        (vinFilter === 'without-vin' && !hasVin);

      return matchesSearch && matchesStatus && matchesVin;
    });

    return filtered.sort((a, b) => {
      const statusA = a.status.trim().toLowerCase();
      const statusB = b.status.trim().toLowerCase();
      const rankA = this.isActiveLikeStatus(statusA) ? 0 : this.isVehicleDeactivatedStatus(statusA) ? 1 : 2;
      const rankB = this.isActiveLikeStatus(statusB) ? 0 : this.isVehicleDeactivatedStatus(statusB) ? 1 : 2;
      if (rankA !== rankB) return rankA - rankB;
      return a.number.localeCompare(b.number);
    });
  });
  activeVehiclesCount = computed<number>(() =>
    this.vehicleTableRows().filter(x => {
      const status = x.status.trim().toLowerCase();
      return this.isActiveLikeStatus(status);
    }).length
  );
  deactivatedVehiclesCount = computed<number>(() =>
    this.vehicleTableRows().filter(x => this.isVehicleDeactivatedStatus(x.status.trim().toLowerCase())).length
  );
  vehiclesWithVinCount = computed<number>(() =>
    this.vehicleTableRows().filter(x => x.vin && x.vin.toLowerCase() !== 'n/a').length
  );
  userTableRows = computed<MotivUserTableRow[]>(() =>
    this.motivUsers().map((raw) => this.mapUserRow(raw))
  );
  filteredUserRows = computed<MotivUserTableRow[]>(() => {
    const term = this.userSearchTerm().trim().toLowerCase();
    const statusFilter = this.userStatusFilter();
    const typeFilter = this.userTypeFilter();

    const filtered = this.userTableRows().filter(row => {
      const matchesSearch =
        !term ||
        row.name.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term) ||
        row.phone.toLowerCase().includes(term) ||
        row.userType.toLowerCase().includes(term) ||
        row.status.toLowerCase().includes(term) ||
        row.role.toLowerCase().includes(term);

      const normalizedStatus = row.status.toLowerCase();
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && normalizedStatus === 'active') ||
        (statusFilter === 'deactivated' && normalizedStatus === 'deactivated');

      const normalizedType = row.userType.toLowerCase();
      const matchesType =
        typeFilter === 'all' ||
        (typeFilter === 'driver' && normalizedType.includes('driver')) ||
        (typeFilter === 'admin' && (normalizedType.includes('admin') || row.role.toLowerCase().includes('admin'))) ||
        (typeFilter === 'other' && !normalizedType.includes('driver') && !normalizedType.includes('admin'));

      return matchesSearch && matchesStatus && matchesType;
    });

    return filtered.sort((a, b) => {
      const aActive = a.status.toLowerCase() === 'active' ? 0 : 1;
      const bActive = b.status.toLowerCase() === 'active' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.name.localeCompare(b.name);
    });
  });
  activeUsersCount = computed<number>(() =>
    this.userTableRows().filter(x => x.status.toLowerCase() === 'active').length
  );
  deactivatedUsersCount = computed<number>(() =>
    this.userTableRows().filter(x => x.status.toLowerCase() === 'deactivated').length
  );
  usersWithEmailCount = computed<number>(() =>
    this.userTableRows().filter(x => x.email && x.email.toLowerCase() !== 'n/a').length
  );
  safetyRows = computed<MotivSafetyEventRow[]>(() =>
    this.motivSafetyEvents()
      .map((raw) => this.mapSafetyEventRow(raw))
      .sort((a, b) => {
        const at = this.tryParseDate(a.eventAt)?.getTime() ?? 0;
        const bt = this.tryParseDate(b.eventAt)?.getTime() ?? 0;
        return bt - at;
      })
  );
  safetyEventTypeOptions = computed<string[]>(() =>
    Array.from(new Set(
      this.safetyRows()
        .map((row) => row.eventType)
        .filter((value) => !!value && value.toLowerCase() !== 'n/a')
    )).sort((a, b) => a.localeCompare(b))
  );
  filteredSafetyRows = computed<MotivSafetyEventRow[]>(() => {
    const term = this.safetySearchTerm().trim().toLowerCase();
    const type = this.safetyTypeFilter();
    const video = this.safetyVideoFilter();

    return this.safetyRows().filter((row) => {
      const matchesSearch =
        !term
        || row.eventType.toLowerCase().includes(term)
        || row.driver.toLowerCase().includes(term)
        || row.vehicle.toLowerCase().includes(term)
        || row.location.toLowerCase().includes(term)
        || row.status.toLowerCase().includes(term)
        || row.severity.toLowerCase().includes(term)
        || row.eventId.toLowerCase().includes(term);

      const matchesType = type === 'all' || row.eventType === type;
      const matchesVideo =
        video === 'all'
        || (video === 'with-video' && row.hasVideo)
        || (video === 'without-video' && !row.hasVideo);

      return matchesSearch && matchesType && matchesVideo;
    });
  });
  safetyWithVideoCount = computed<number>(() =>
    this.filteredSafetyRows().filter((row) => row.hasVideo).length
  );
  safetyUniqueDriversCount = computed<number>(() =>
    new Set(
      this.filteredSafetyRows()
        .map((row) => row.driver.toLowerCase())
        .filter((value) => !!value && value !== 'n/a')
    ).size
  );
  safetyUniqueVehiclesCount = computed<number>(() =>
    new Set(
      this.filteredSafetyRows()
        .map((row) => row.vehicle.toLowerCase())
        .filter((value) => !!value && value !== 'n/a')
    ).size
  );
  userTotalPages = computed<number>(() =>
    Math.max(1, Math.ceil(this.filteredUserRows().length / this.userPageSize()))
  );
  safeUserPage = computed<number>(() =>
    Math.max(1, Math.min(this.userPage(), this.userTotalPages()))
  );
  pagedUserRows = computed<MotivUserTableRow[]>(() => {
    const page = this.safeUserPage();
    const pageSize = this.userPageSize();
    const start = (page - 1) * pageSize;
    return this.filteredUserRows().slice(start, start + pageSize);
  });
  userPageStartIndex = computed<number>(() => {
    const total = this.filteredUserRows().length;
    if (!total) return 0;
    return (this.safeUserPage() - 1) * this.userPageSize() + 1;
  });
  userPageEndIndex = computed<number>(() => {
    const total = this.filteredUserRows().length;
    if (!total) return 0;
    return Math.min(this.safeUserPage() * this.userPageSize(), total);
  });
  vehicleTotalPages = computed<number>(() =>
    Math.max(1, Math.ceil(this.filteredVehicleRows().length / this.vehiclePageSize()))
  );
  safeVehiclePage = computed<number>(() =>
    Math.max(1, Math.min(this.vehiclePage(), this.vehicleTotalPages()))
  );
  pagedVehicleRows = computed<MotivVehicleTableRow[]>(() => {
    const page = this.safeVehiclePage();
    const pageSize = this.vehiclePageSize();
    const start = (page - 1) * pageSize;
    return this.filteredVehicleRows().slice(start, start + pageSize);
  });
  vehiclePageStartIndex = computed<number>(() => {
    const total = this.filteredVehicleRows().length;
    if (!total) return 0;
    return (this.safeVehiclePage() - 1) * this.vehiclePageSize() + 1;
  });
  vehiclePageEndIndex = computed<number>(() => {
    const total = this.filteredVehicleRows().length;
    if (!total) return 0;
    return Math.min(this.safeVehiclePage() * this.vehiclePageSize(), total);
  });
  filteredDriverRows = computed<MotivDriverTableRow[]>(() => {
    const term = this.driverSearchTerm().trim().toLowerCase();
    const statusFilter = this.driverStatusFilter();
    const emailFilter = this.driverEmailFilter();

    const filtered = this.driverTableRows().filter(row => {
      const matchesSearch =
        !term ||
        row.name.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term) ||
        row.phone.toLowerCase().includes(term) ||
        row.status.toLowerCase().includes(term) ||
        row.location.toLowerCase().includes(term) ||
        row.vehicle.toLowerCase().includes(term) ||
        row.lastUpdate.toLowerCase().includes(term);

      const normalizedStatus = row.status.toLowerCase();
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && this.isActiveLikeStatus(normalizedStatus)) ||
        (statusFilter === 'deactivated' && normalizedStatus === 'deactivated');

      const hasEmail = !!row.email && row.email.toLowerCase() !== 'n/a';
      const matchesEmail =
        emailFilter === 'all' ||
        (emailFilter === 'with-email' && hasEmail) ||
        (emailFilter === 'without-email' && !hasEmail);

      return matchesSearch && matchesStatus && matchesEmail;
    });

    return filtered.sort((a, b) => {
      const statusDelta = this.getDriverStatusRank(a.status) - this.getDriverStatusRank(b.status);
      if (statusDelta !== 0) return statusDelta;
      return a.name.localeCompare(b.name);
    });
  });
  activeDriversCount = computed<number>(() =>
    this.driverTableRows().filter(x => this.isActiveLikeStatus(x.status)).length
  );
  deactivatedDriversCount = computed<number>(() =>
    this.driverTableRows().filter(x => x.status.toLowerCase() === 'deactivated').length
  );
  driversWithEmailCount = computed<number>(() =>
    this.driverTableRows().filter(x => x.email && x.email.toLowerCase() !== 'n/a').length
  );
  driverTotalPages = computed<number>(() =>
    Math.max(1, Math.ceil(this.filteredDriverRows().length / this.driverPageSize()))
  );
  safeDriverPage = computed<number>(() =>
    Math.max(1, Math.min(this.driverPage(), this.driverTotalPages()))
  );
  pagedDriverRows = computed<MotivDriverTableRow[]>(() => {
    const page = this.safeDriverPage();
    const pageSize = this.driverPageSize();
    const start = (page - 1) * pageSize;
    return this.filteredDriverRows().slice(start, start + pageSize);
  });
  driverPageStartIndex = computed<number>(() => {
    const total = this.filteredDriverRows().length;
    if (!total) return 0;
    return (this.safeDriverPage() - 1) * this.driverPageSize() + 1;
  });
  driverPageEndIndex = computed<number>(() => {
    const total = this.filteredDriverRows().length;
    if (!total) return 0;
    return Math.min(this.safeDriverPage() * this.driverPageSize(), total);
  });
  activityDriverRows = computed<MotivDriverTableRow[]>(() =>
    this.filteredDriverRows()
  );
  activityLogRows = computed<MotivActivityLogEntry[]>(() => {
    const combined = [...this.activityFeed(), ...this.persistedActivityFeed()]
      .sort((a, b) => b.timestamp - a.timestamp);

    return combined;
  });
  driverActivityRows = computed<MotivActivityLogEntry[]>(() => {
    const selected = this.selectedActivityDriverName().trim().toLowerCase();
    let rows = !selected
      ? this.activityLogRows()
      : this.activityLogRows().filter((row) => String(row.driverName || '').trim().toLowerCase() === selected);

    const fromDate = this.activityDateFromFilter().trim();
    const toDate = this.activityDateToFilter().trim();
    if (fromDate || toDate) {
      rows = rows.filter((row) => this.isTimestampWithinLocalDateRange(row.timestamp, fromDate, toDate));
    }

    const kind = this.activityKindFilter();
    if (kind !== 'all') {
      rows = rows.filter((row) => row.kind === kind);
    }

    const scope = this.activityScopeFilter();
    if (scope === 'driver') {
      rows = rows.filter((row) => !!String(row.driverName || '').trim());
    } else if (scope === 'system') {
      rows = rows.filter((row) => !String(row.driverName || '').trim());
    }

    const term = this.activitySearchTerm().trim().toLowerCase();
    if (term) {
      rows = rows.filter((row) =>
        row.title.toLowerCase().includes(term) ||
        row.details.toLowerCase().includes(term) ||
        String(row.driverName || '').toLowerCase().includes(term) ||
        row.kind.toLowerCase().includes(term)
      );
    }

    return rows;
  });
  activityVisibleDriversCount = computed<number>(() => this.activityDriverRows().length);
  activityActiveDriversCount = computed<number>(() =>
    this.activityDriverRows().filter((row) => this.isActiveLikeStatus(String(row.status || '').trim().toLowerCase())).length
  );
  activityInactiveDriversCount = computed<number>(() =>
    this.activityDriverRows().filter((row) => !this.isActiveLikeStatus(String(row.status || '').trim().toLowerCase())).length
  );
  activityLogsTotalCount = computed<number>(() => this.activityLogRows().length);
  activityLogsWithLocationCount = computed<number>(() =>
    this.activityLogRows().filter((row) => this.extractCurrentLocation(row.details) !== 'N/A').length
  );
  activityReportDriverOptions = computed<string[]>(() =>
    Array.from(new Set(
      this.driverTableRows()
        .map((row) => String(row.name || '').trim())
        .filter((name) => !!name && name.toLowerCase() !== 'n/a')
    )).sort((a, b) => a.localeCompare(b))
  );
  activityReportAvailableYears = computed<number[]>(() => {
    const years = new Set<number>();
    for (const row of this.activityLogRows()) {
      const dt = new Date(row.timestamp);
      if (Number.isNaN(dt.getTime())) continue;
      years.add(dt.getFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  });
  activityReportAvailableWeeks = computed<FuelWeekOption[]>(() => {
    const yearFilter = this.activityReportYearFilter();
    if (yearFilter === 'all') return [];
    const year = Number(yearFilter);
    if (!Number.isFinite(year) || year <= 0) return [];

    const options: FuelWeekOption[] = [];
    for (let week = 52; week >= 1; week -= 1) {
      options.push({
        key: `${year}-W${String(week).padStart(2, '0')}`,
        label: `Week ${String(week).padStart(2, '0')} (${year})`,
        year,
        week
      });
    }
    return options;
  });
  driverSyncStatusTone = computed<'connected' | 'not-connected' | 'checking'>(() => {
    if (this.syncingDrivers() || this.savingDrivers()) return 'checking';
    if (this.saveDriversError()) return 'not-connected';
    if (this.lastDriverSyncSummary()) return 'connected';
    return 'checking';
  });
  driverSyncStatusLabel = computed(() => {
    if (this.syncingDrivers()) return 'Auto Syncing';
    if (this.savingDrivers()) return 'Manual Syncing';
    if (this.saveDriversError()) return 'Sync Error';
    if (this.lastDriverSyncSummary()) return 'Synced';
    return 'Idle';
  });
  driverSyncStatusText = computed(() => this.syncStatusMessage());
  fuelRows = computed<MotivFuelRow[]>(() =>
    this.motivFuelPurchases().map((raw) => this.mapFuelRow(raw))
  );
  fuelTotalAmount = computed<number>(() =>
    this.filteredFuelRows().reduce((sum, row) => sum + (Number.isFinite(row.amountValue) ? row.amountValue : 0), 0)
  );
  fuelSpendAmount = computed<number>(() =>
    this.filteredFuelRows().reduce((sum, row) =>
      this.classifyFuelCharge(row) === 'fuel'
        ? sum + (Number.isFinite(row.amountValue) ? row.amountValue : 0)
        : sum, 0)
  );
  fuelOtherChargesAmount = computed<number>(() =>
    this.filteredFuelRows().reduce((sum, row) =>
      this.classifyFuelCharge(row) === 'other'
        ? sum + (Number.isFinite(row.amountValue) ? row.amountValue : 0)
        : sum, 0)
  );
  fuelUnknownChargesAmount = computed<number>(() =>
    this.filteredFuelRows().reduce((sum, row) =>
      this.classifyFuelCharge(row) === 'unknown'
        ? sum + (Number.isFinite(row.amountValue) ? row.amountValue : 0)
        : sum, 0)
  );
  fuelUniqueDriversCount = computed<number>(() =>
    new Set(
      this.filteredFuelRows()
        .map(x => x.driverId)
        .filter(x => !!x && x.toLowerCase() !== 'n/a')
    ).size
  );
  fuelUniqueVehiclesCount = computed<number>(() =>
    new Set(
      this.filteredFuelRows()
        .map(x => x.vehicleId)
        .filter(x => !!x && x.toLowerCase() !== 'n/a')
    ).size
  );
  fuelUniqueCardsCount = computed<number>(() =>
    new Set(
      this.filteredFuelRows()
        .map(x => x.cardId)
        .filter(x => !!x && x.toLowerCase() !== 'n/a')
    ).size
  );
  fuelDistinctWeeksCount = computed<number>(() => {
    const weeks = new Set<string>();
    for (const row of this.filteredFuelRows()) {
      const dt = this.tryParseDate(row.date);
      if (!dt) continue;
      weeks.add(this.getIsoWeekInfo(dt).key);
    }
    return weeks.size;
  });
  fuelDistinctYearsCount = computed<number>(() => {
    const years = new Set<number>();
    for (const row of this.filteredFuelRows()) {
      const dt = this.tryParseDate(row.date);
      if (!dt) continue;
      years.add(dt.getUTCFullYear());
    }
    return years.size;
  });
  fuelSelectedWeekDateRange = computed<string>(() => {
    if (this.fuelWeekFilter() === 'all') return '';
    const parsedDates = this.filteredFuelRows()
      .map((row) => this.tryParseDate(row.date))
      .filter((dt): dt is Date => !!dt)
      .sort((a, b) => a.getTime() - b.getTime());

    if (parsedDates.length === 0) return 'No dates';
    const start = parsedDates[0];
    const end = parsedDates[parsedDates.length - 1];
    return `${this.formatShortDate(start)} - ${this.formatShortDate(end)}`;
  });
  fuelCardOptions = computed<string[]>(() => {
    const cards = new Set<string>();
    for (const row of this.fuelRows()) {
      const label = (row.cardLabel || '').trim();
      if (label && label.toLowerCase() !== 'n/a') cards.add(label);
    }
    return Array.from(cards.values()).sort((a, b) => a.localeCompare(b));
  });
  fuelAvailableYears = computed<number[]>(() => {
    const years = new Set<number>();
    for (const row of this.fuelRows()) {
      const dt = this.tryParseDate(row.date);
      if (dt) years.add(dt.getUTCFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  });
  fuelAvailableWeeks = computed<FuelWeekOption[]>(() => {
    const selectedYear = this.fuelYearFilter();
    const years = selectedYear !== 'all'
      ? [Number(selectedYear)]
      : this.fuelAvailableYears();

    const resolvedYears = years.length > 0
      ? years.filter((y) => Number.isFinite(y) && y > 0)
      : [new Date().getUTCFullYear()];

    const options: FuelWeekOption[] = [];
    for (const year of resolvedYears.sort((a, b) => b - a)) {
      for (let week = 52; week >= 1; week--) {
        options.push({
          key: `${year}-W${String(week).padStart(2, '0')}`,
          label: `Week ${String(week).padStart(2, '0')} (${year})`,
          year,
          week
        });
      }
    }
    return options;
  });
  filteredFuelRows = computed<MotivFuelRow[]>(() => {
    const term = this.fuelSearchTerm().trim().toLowerCase();
    const status = this.fuelStatusFilter();
    const source = this.fuelSourceFilter();
    const card = this.fuelCardFilter();
    const year = this.fuelYearFilter();
    const week = this.fuelWeekFilter();
    return this.fuelRows().filter(row => {
      const matchesSearch =
        !term ||
        row.transactionId.toLowerCase().includes(term) ||
        row.merchant.toLowerCase().includes(term) ||
        row.city.toLowerCase().includes(term) ||
        row.state.toLowerCase().includes(term) ||
        row.driverId.toLowerCase().includes(term) ||
        row.vehicleId.toLowerCase().includes(term) ||
        row.cardLabel.toLowerCase().includes(term) ||
        row.cardId.toLowerCase().includes(term) ||
        row.category.toLowerCase().includes(term) ||
        row.source.toLowerCase().includes(term);

      const normalizedStatus = row.status.trim().toLowerCase();
      const matchesStatus =
        status === 'all' ||
        (status === 'completed' && (normalizedStatus === 'completed' || normalizedStatus === 'posted' || normalizedStatus === 'approved')) ||
        (status === 'pending' && (normalizedStatus === 'pending' || normalizedStatus === 'processing' || normalizedStatus === 'queued')) ||
        (status === 'other' && normalizedStatus !== 'completed' && normalizedStatus !== 'posted' && normalizedStatus !== 'approved' && normalizedStatus !== 'pending' && normalizedStatus !== 'processing' && normalizedStatus !== 'queued');

      const normalizedSource = row.source.trim().toLowerCase();
      const matchesSource =
        source === 'all' ||
        (source === 'motive-card' && normalizedSource === 'motive-card') ||
        (source === 'other' && normalizedSource !== 'motive-card');

      const matchesCard = card === 'all' || row.cardLabel === card;

      const dt = this.tryParseDate(row.date);
      const iso = dt ? this.getIsoWeekInfo(dt) : null;
      const matchesYear = year === 'all' || (!!iso && String(iso.year) === year);
      const matchesWeek = week === 'all' || (!!iso && iso.key === week);

      return matchesSearch && matchesStatus && matchesSource && matchesCard && matchesYear && matchesWeek;
    });
  });
  sortedFuelRows = computed<MotivFuelRow[]>(() => {
    const rows = [...this.filteredFuelRows()];
    const column = this.fuelSortColumn();
    const direction = this.fuelSortDirection();
    const modifier = direction === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      let left: string | number = '';
      let right: string | number = '';

      switch (column) {
        case 'amount':
          left = Number.isFinite(a.amountValue) ? a.amountValue : 0;
          right = Number.isFinite(b.amountValue) ? b.amountValue : 0;
          break;
        case 'date': {
          const ad = this.tryParseDate(a.date)?.getTime() ?? 0;
          const bd = this.tryParseDate(b.date)?.getTime() ?? 0;
          left = ad;
          right = bd;
          break;
        }
        case 'week': {
          const aw = this.getFuelWeekSortKey(a.date);
          const bw = this.getFuelWeekSortKey(b.date);
          left = aw;
          right = bw;
          break;
        }
        default:
          left = String(a[column] ?? '').toLowerCase();
          right = String(b[column] ?? '').toLowerCase();
          break;
      }

      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * modifier;
      }
      return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' }) * modifier;
    });

    return rows;
  });
  fuelTotalPages = computed<number>(() =>
    Math.max(1, Math.ceil(this.filteredFuelRows().length / this.fuelPageSize()))
  );
  safeFuelPage = computed<number>(() =>
    Math.max(1, Math.min(this.fuelPage(), this.fuelTotalPages()))
  );
  pagedFuelRows = computed<MotivFuelRow[]>(() => {
    const page = this.safeFuelPage();
    const size = this.fuelPageSize();
    const start = (page - 1) * size;
    return this.sortedFuelRows().slice(start, start + size);
  });
  fuelPageStartIndex = computed<number>(() => {
    const total = this.filteredFuelRows().length;
    if (!total) return 0;
    return (this.safeFuelPage() - 1) * this.fuelPageSize() + 1;
  });
  fuelPageEndIndex = computed<number>(() => {
    const total = this.filteredFuelRows().length;
    if (!total) return 0;
    return Math.min(this.safeFuelPage() * this.fuelPageSize(), total);
  });
  fuelCardSpendIndex = computed<Map<string, { purchases: number; spend: number }>>(() => {
    const index = new Map<string, { purchases: number; spend: number }>();
    const seenTransactionIds = new Set<string>();
    const selectedYear = this.fuelCardYearFilter();
    const selectedWeek = this.fuelCardWeekFilter();
    for (const row of this.fuelRows()) {
      const dt = this.tryParseDate(row.date);
      const iso = dt ? this.getIsoWeekInfo(dt) : null;
      if (selectedYear !== 'all' && (!iso || String(iso.year) !== selectedYear)) continue;
      if (selectedWeek !== 'all' && (!iso || iso.key !== selectedWeek)) continue;

      const amount = Number.isFinite(row.amountValue) ? row.amountValue : 0;
      const txId = String(row.transactionId ?? '').trim().toLowerCase();
      if (txId && txId !== 'n/a') {
        seenTransactionIds.add(txId);
      }
      const keys = [
        this.normalizeFuelCardKey(row.cardId),
        this.normalizeFuelCardKey(row.cardLabel),
        this.normalizeFuelCardKey(this.parseCardLast4(row.cardLabel)),
        this.normalizeFuelCardKey(this.parseCardLast4(row.cardId))
      ].filter((k): k is string => !!k);

      for (const key of keys) {
        const current = index.get(key) ?? { purchases: 0, spend: 0 };
        current.purchases += 1;
        current.spend += amount;
        index.set(key, current);
      }
    }

    for (const raw of this.motivCardTransactions()) {
      const tx = raw?.transaction ?? raw?.fuel_purchase ?? raw ?? {};
      const txDate = this.extractCardTransactionDate(tx, raw);
      const dt = this.tryParseDate(txDate);
      const iso = dt ? this.getIsoWeekInfo(dt) : null;
      if (selectedYear !== 'all' && (!iso || String(iso.year) !== selectedYear)) continue;
      if (selectedWeek !== 'all' && (!iso || iso.key !== selectedWeek)) continue;

      const transactionId = String(
        tx?.id ??
        tx?.transaction_id ??
        tx?.offline_id ??
        tx?.reference_id ??
        raw?.id ??
        raw?.transaction_id ??
        raw?.offline_id ??
        raw?.reference_id ??
        ''
      ).trim().toLowerCase();
      if (transactionId && seenTransactionIds.has(transactionId)) continue;

      const amountNum = Number(
        tx?.total_cost ??
        tx?.total_amount ??
        tx?.authorized_amount ??
        tx?.amount ??
        tx?.net_amount ??
        tx?.gross_amount ??
        tx?.cost ??
        raw?.total_cost ??
        raw?.total_amount ??
        raw?.authorized_amount ??
        raw?.amount ??
        raw?.net_amount ??
        raw?.gross_amount ??
        raw?.cost ??
        0
      );
      const amount = Number.isFinite(amountNum) ? amountNum : 0;
      const cardMeta = this.extractFuelCardMeta(raw, tx);
      const keys = [
        this.normalizeFuelCardKey(cardMeta.cardId),
        this.normalizeFuelCardKey(cardMeta.cardLabel),
        this.normalizeFuelCardKey(this.parseCardLast4(cardMeta.cardLabel)),
        this.normalizeFuelCardKey(this.parseCardLast4(cardMeta.cardId)),
        this.normalizeFuelCardKey(this.parseCardLast4(tx?.card_number ?? tx?.masked_card_number ?? tx?.masked_pan ?? raw?.card_number ?? raw?.masked_card_number ?? raw?.masked_pan))
      ].filter((k): k is string => !!k);

      for (const key of keys) {
        const current = index.get(key) ?? { purchases: 0, spend: 0 };
        current.purchases += 1;
        current.spend += amount;
        index.set(key, current);
      }
    }

    return index;
  });
  fuelCardRows = computed<MotivFuelCardRow[]>(() =>
    this.motivFuelCards().map((raw) => this.mapFuelCardRow(raw))
  );
  fuelCardsActiveCount = computed<number>(() =>
    this.fuelCardRows().filter((row) => this.isFuelCardActiveStatus(row.status)).length
  );
  fuelCardsUsedCount = computed<number>(() =>
    this.fuelCardRows().filter((row) => row.purchases > 0).length
  );
  fuelCardsTotalSpend = computed<number>(() =>
    this.fuelCardRows().reduce((sum, row) => sum + (Number.isFinite(row.spend) ? row.spend : 0), 0)
  );
  fuelCardAvailableYears = computed<number[]>(() => {
    const years = new Set<number>();

    for (const row of this.fuelRows()) {
      const dt = this.tryParseDate(row.date);
      if (dt) years.add(dt.getUTCFullYear());
    }

    for (const raw of this.motivCardTransactions()) {
      const tx = raw?.transaction ?? raw?.fuel_purchase ?? raw ?? {};
      const txDate = this.extractCardTransactionDate(tx, raw);
      const dt = this.tryParseDate(txDate);
      if (dt) years.add(dt.getUTCFullYear());
    }

    return Array.from(years).sort((a, b) => b - a);
  });
  fuelCardAvailableWeeks = computed<FuelWeekOption[]>(() => {
    const selectedYear = this.fuelCardYearFilter();
    const weekMap = new Map<string, FuelWeekOption>();

    for (const row of this.fuelRows()) {
      const dt = this.tryParseDate(row.date);
      if (!dt) continue;
      const info = this.getIsoWeekInfo(dt);
      if (selectedYear !== 'all' && String(info.year) !== selectedYear) continue;
      if (!weekMap.has(info.key)) {
        weekMap.set(info.key, {
          key: info.key,
          label: `Week ${String(info.week).padStart(2, '0')} (${info.year})`,
          year: info.year,
          week: info.week
        });
      }
    }

    for (const raw of this.motivCardTransactions()) {
      const tx = raw?.transaction ?? raw?.fuel_purchase ?? raw ?? {};
      const txDate = this.extractCardTransactionDate(tx, raw);
      const dt = this.tryParseDate(txDate);
      if (!dt) continue;
      const info = this.getIsoWeekInfo(dt);
      if (selectedYear !== 'all' && String(info.year) !== selectedYear) continue;
      if (!weekMap.has(info.key)) {
        weekMap.set(info.key, {
          key: info.key,
          label: `Week ${String(info.week).padStart(2, '0')} (${info.year})`,
          year: info.year,
          week: info.week
        });
      }
    }

    return Array.from(weekMap.values()).sort((a, b) => b.key.localeCompare(a.key));
  });
  filteredFuelCardRows = computed<MotivFuelCardRow[]>(() => {
    const term = this.fuelCardSearchTerm().trim().toLowerCase();
    const status = this.fuelCardStatusFilter();
    const year = this.fuelCardYearFilter();
    const week = this.fuelCardWeekFilter();
    return this.fuelCardRows().filter((row) => {
      const normalizedStatus = row.status.trim().toLowerCase();
      const matchesSearch =
        !term ||
        row.id.toLowerCase().includes(term) ||
        row.label.toLowerCase().includes(term) ||
        row.last4.toLowerCase().includes(term) ||
        row.status.toLowerCase().includes(term) ||
        row.type.toLowerCase().includes(term);

      const matchesStatus =
        status === 'all' ||
        (status === 'active' && this.isFuelCardActiveStatus(normalizedStatus)) ||
        (status === 'inactive' && this.isFuelCardInactiveStatus(normalizedStatus)) ||
        (status === 'other' && !this.isFuelCardActiveStatus(normalizedStatus) && !this.isFuelCardInactiveStatus(normalizedStatus));

      const hasPeriodFilter = year !== 'all' || week !== 'all';
      const matchesPeriod = !hasPeriodFilter || row.purchases > 0;

      return matchesSearch && matchesStatus && matchesPeriod;
    });
  });
  fuelCardTotalPages = computed<number>(() =>
    Math.max(1, Math.ceil(this.filteredFuelCardRows().length / this.fuelCardPageSize()))
  );
  safeFuelCardPage = computed<number>(() =>
    Math.max(1, Math.min(this.fuelCardPage(), this.fuelCardTotalPages()))
  );
  pagedFuelCardRows = computed<MotivFuelCardRow[]>(() => {
    const page = this.safeFuelCardPage();
    const size = this.fuelCardPageSize();
    const start = (page - 1) * size;
    return this.filteredFuelCardRows().slice(start, start + size);
  });
  fuelCardPageStartIndex = computed<number>(() => {
    const total = this.filteredFuelCardRows().length;
    if (!total) return 0;
    return (this.safeFuelCardPage() - 1) * this.fuelCardPageSize() + 1;
  });
  fuelCardPageEndIndex = computed<number>(() => {
    const total = this.filteredFuelCardRows().length;
    if (!total) return 0;
    return Math.min(this.safeFuelCardPage() * this.fuelCardPageSize(), total);
  });

  ngOnInit(): void {
    this.loadStrictMode();
    const restoredFromCache = this.restoreMotivStatusCache();
    if (!restoredFromCache) {
      this.loadApiConfig();
      this.checkAvailableApis();
    } else {
      this.loading.set(false);
      this.error.set('');
      this.refreshCheckingProbeStatusesInBackground();
    }
    this.preloadMotivTabsInBackground();
  }

  private refreshCheckingProbeStatusesInBackground(): void {
    const hasChecking =
      this.availableApis().some((row) => row.status === 'checking') ||
      this.phase2Apis().some((row) => row.status === 'checking');
    if (!hasChecking) return;

    setTimeout(() => {
      this.checkAvailableApis();
    }, 250);
  }

  setTab(tab: MotivTab): void {
    this.activeTab.set(tab);
    if (tab === 'activity') {
      this.loadPersistedActivityLogs();
    }
    if ((tab === 'drivers' || tab === 'activity') && this.motivDrivers().length === 0 && !this.loadingDrivers()) {
      this.loadDrivers();
    }
    if (tab === 'vehicles' && this.motivVehicles().length === 0 && !this.loadingVehicles()) {
      this.loadVehicles();
    }
    if (tab === 'users' && this.motivUsers().length === 0 && !this.loadingUsers()) {
      this.loadUsers();
    }
    if (tab === 'safety' && this.motivSafetyEvents().length === 0 && !this.loadingSafety()) {
      this.loadSafetyEvents();
    }
    if (tab === 'fuel' && this.motivFuelPurchases().length === 0 && !this.loadingFuel()) {
      this.loadFuelPurchases();
    }
    if (tab === 'fuel-cards' && this.motivFuelCards().length === 0 && !this.loadingFuelCards()) {
      this.loadFuelCards();
    }
    // Fuel card spend/purchase rollups are built from fuel purchase transactions.
    if (tab === 'fuel-cards' && this.motivFuelPurchases().length === 0 && !this.loadingFuel()) {
      this.loadFuelPurchases(true);
    }
    if (tab === 'fuel-cards' && this.motivCardTransactions().length === 0) {
      this.loadCardTransactions(true);
    }
  }

  formatActivityTimestamp(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return 'N/A';
    return new Date(value).toLocaleString();
  }

  extractPreviousLocation(details: string): string {
    return this.extractActivityDetailField(details, 'Previous Location') || 'N/A';
  }

  extractCurrentLocation(details: string): string {
    return this.extractActivityDetailField(details, 'Current Location')
      || this.extractActivityDetailField(details, 'Location')
      || 'N/A';
  }

  formatActivitySummary(details: string): string {
    const status = this.extractActivityDetailField(details, 'Status');
    const vehicle = this.extractActivityDetailField(details, 'Vehicle');
    if (status || vehicle) {
      const parts: string[] = [];
      if (status) parts.push(`Status: ${status}`);
      if (vehicle) parts.push(`Vehicle: ${vehicle}`);
      return parts.join(' | ');
    }
    return details || '';
  }

  private extractActivityDetailField(details: string, key: string): string {
    const text = String(details || '').trim();
    if (!text) return '';
    const keyLower = `${key.toLowerCase()}:`;
    const segments = text.split('|').map((segment) => segment.trim());
    for (const segment of segments) {
      const lower = segment.toLowerCase();
      if (lower.startsWith(keyLower)) {
        return segment.slice(key.length + 1).trim();
      }
    }
    return '';
  }

  private toLocalDateKey(timestamp: number): string | null {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    const value = new Date(timestamp);
    if (Number.isNaN(value.getTime())) return null;
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private isTimestampWithinLocalDateRange(timestamp: number, fromDate: string, toDate: string): boolean {
    const key = this.toLocalDateKey(timestamp);
    if (!key) return false;
    if (fromDate && key < fromDate) return false;
    if (toDate && key > toDate) return false;
    return true;
  }

  selectActivityDriver(name: string): void {
    const normalized = String(name || '').trim();
    if (!normalized) return;
    if (this.selectedActivityDriverName() === normalized) {
      this.selectedActivityDriverName.set('');
      return;
    }
    this.selectedActivityDriverName.set(normalized);
  }

  clearActivityDriverSelection(): void {
    this.selectedActivityDriverName.set('');
  }

  clearActivityDateRangeFilter(): void {
    this.activityDateFromFilter.set('');
    this.activityDateToFilter.set('');
  }

  openActivityReportModal(): void {
    this.activityReportError.set('');
    this.activityReportModalError.set('');
    this.activityReportYearFilter.set('all');
    this.activityReportWeekFilter.set('all');
    const selected = String(this.selectedActivityDriverName() || '').trim();
    if (selected) {
      this.activityReportScope.set('specific');
      this.activityReportSpecificDriver.set(selected);
    } else {
      this.activityReportScope.set('active');
      this.activityReportSpecificDriver.set('');
    }
    this.activityReportModalOpen.set(true);
  }

  closeActivityReportModal(): void {
    this.activityReportModalOpen.set(false);
    this.activityReportModalError.set('');
  }

  setActivityReportScope(value: ActivityReportScope): void {
    const normalized: ActivityReportScope =
      value === 'inactive' || value === 'specific'
        ? value
        : 'active';
    this.activityReportScope.set(normalized);
    this.activityReportModalError.set('');
    if (normalized !== 'specific') {
      this.activityReportSpecificDriver.set('');
    }
  }

  setActivityReportYearFilter(value: string): void {
    this.activityReportYearFilter.set(value || 'all');
    this.activityReportWeekFilter.set('all');
    this.activityReportModalError.set('');
  }

  setActivityReportWeekFilter(value: string): void {
    this.activityReportWeekFilter.set(value || 'all');
    this.activityReportModalError.set('');
  }

  async generateActivityReport(): Promise<void> {
    this.activityReportModalError.set('');
    this.activityReportError.set('');
    this.generatingActivityReport.set(true);
    try {
      const reportRows = this.getActivityReportRows();
      if (reportRows.length === 0) {
        this.activityReportModalError.set('No activity records found for that report scope.');
        return;
      }

      const scope = this.activityReportScope();
      const scopeLabel =
        scope === 'active'
          ? 'All Active Drivers'
          : scope === 'inactive'
            ? 'All Inactive Drivers'
            : `Specific Driver: ${this.activityReportSpecificDriver()}`;
      const yearLabel = this.activityReportYearFilter() === 'all' ? 'All Years' : this.activityReportYearFilter();
      const weekLabel = this.activityReportWeekFilter() === 'all' ? 'All Weeks' : this.activityReportWeekFilter();
      const filename = `motiv-activity-report-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'letter'
      });
      const left = 28;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const bottom = pageHeight - 24;
      let y = 34;

      const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('MOTIV Activity Report', left, y);
        y += 14;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Scope: ${scopeLabel}`, left, y);
        y += 12;
        doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
        y += 12;
        doc.text(`Period: ${yearLabel} | ${weekLabel}`, left, y);
        y += 12;
        doc.text(`Rows: ${reportRows.length.toLocaleString()}`, left, y);
        y += 16;
      };

      const columns = [
        { label: 'Time', width: 96 },
        { label: 'Driver', width: 96 },
        { label: 'Type', width: 50 },
        { label: 'Event', width: 248 },
        { label: 'Previous Location', width: 120 },
        { label: 'Current Location', width: 120 }
      ];

      const ensureSpace = (lines: number): void => {
        const needed = Math.max(1, lines) * 10 + 8;
        if (y + needed > bottom) {
          doc.addPage();
          y = 24;
          drawTableHeader();
        }
      };

      const drawTableHeader = () => {
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
      for (const row of reportRows) {
        drawRow([
          this.formatActivityTimestamp(row.timestamp),
          String(row.driverName || 'General'),
          row.kind.toUpperCase(),
          `${row.title} - ${this.formatActivitySummary(row.details)}`,
          this.extractPreviousLocation(row.details),
          this.extractCurrentLocation(row.details)
        ]);
      }

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      if (!popup) {
        await this.saveBlobFile(filename, blob, 'application/pdf', ['.pdf']);
        URL.revokeObjectURL(url);
      } else {
        setTimeout(() => URL.revokeObjectURL(url), 120000);
      }

      this.activityReportModalOpen.set(false);
    } catch {
      this.activityReportError.set('Unable to generate activity report.');
    } finally {
      this.generatingActivityReport.set(false);
    }
  }

  private getActivityReportRows(): MotivActivityLogEntry[] {
    const yearFilter = this.activityReportYearFilter();
    const weekFilter = this.activityReportWeekFilter();
    let rows = this.activityLogRows().filter((row) => {
      const dt = new Date(row.timestamp);
      if (Number.isNaN(dt.getTime())) return false;
      const iso = this.getIsoWeekInfo(dt);
      const yearOk = yearFilter === 'all' || String(iso.year) === yearFilter;
      const weekOk = weekFilter === 'all' || iso.key === weekFilter;
      return yearOk && weekOk;
    });
    const scope = this.activityReportScope();
    const normalizedDriverName = String(this.activityReportSpecificDriver() || '').trim().toLowerCase();

    if (scope === 'specific') {
      if (!normalizedDriverName) {
        this.activityReportModalError.set('Choose a specific driver to generate the report.');
        return [];
      }
      return rows.filter((row) => String(row.driverName || '').trim().toLowerCase() === normalizedDriverName);
    }

    const allowedNames = new Set(
      this.driverTableRows()
        .filter((row) => {
          const status = String(row.status || '').trim().toLowerCase();
          return scope === 'active'
            ? this.isActiveLikeStatus(status)
            : this.isVehicleDeactivatedStatus(status) || status === 'deactivated';
        })
        .map((row) => String(row.name || '').trim().toLowerCase())
        .filter((name) => !!name)
    );

    return rows.filter((row) => {
      const name = String(row.driverName || '').trim().toLowerCase();
      if (!name) return false;
      return allowedNames.has(name);
    });
  }

  private loadPersistedActivityLogs(allowBackfill = true): void {
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/activity-logs?limit=5000`).subscribe({
      next: (res) => {
        const rows = Array.isArray(res?.rows) ? res.rows : [];
        const mappedRows = rows
          .map((row: any) => this.mapPersistedActivityLogRow(row))
          .filter((row: MotivActivityLogEntry | null): row is MotivActivityLogEntry => !!row)
          .sort((a: MotivActivityLogEntry, b: MotivActivityLogEntry) => b.timestamp - a.timestamp);
        this.persistedActivityFeed.set(
          mappedRows
        );

        const rowsWithLocation = mappedRows.filter((row: MotivActivityLogEntry) => this.extractCurrentLocation(row.details) !== 'N/A').length;
        if (allowBackfill && (rows.length < 75 || (rows.length > 0 && rowsWithLocation === 0))) {
          this.triggerActivityBackfill(rows.length > 0);
        }
      },
      error: () => {
        // Keep current in-memory feed if persisted logs are unavailable.
      }
    });
  }

  private triggerActivityBackfill(force = false): void {
    if (this.activityBackfillAttempted() && !force) return;
    this.activityBackfillAttempted.set(true);

    const query = force ? '?days=365&force=true' : '?days=365';
    this.http.post<any>(`${this.apiUrl}/api/v1/motiv/activity-logs/backfill${query}`, {}).subscribe({
      next: (res) => {
        const created = Number(res?.created ?? 0);
        if (created > 0) {
          this.loadPersistedActivityLogs(false);
        }
      },
      error: () => {
        // Non-blocking: table still works with existing persisted/session logs.
      }
    });
  }

  private mapPersistedActivityLogRow(raw: any): MotivActivityLogEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const timestamp = this.toTimestamp(raw.timestamp ?? raw.eventAt ?? raw.createdAt);
    if (!timestamp) return null;

    const rawKind = String(raw.kind || '').trim().toLowerCase();
    const kind: MotivActivityLogEntry['kind'] =
      rawKind === 'success' || rawKind === 'warning' || rawKind === 'error'
        ? rawKind
        : 'info';

    return {
      id: typeof raw.id === 'number' ? raw.id : undefined,
      timestamp,
      kind,
      title: String(raw.title || '').trim() || 'Activity',
      details: String(raw.details || '').trim(),
      driverName: String(raw.driverName || '').trim() || null
    };
  }

  private toTimestamp(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 9999999999 ? value : value * 1000;
    }
    const parsed = this.tryParseDate(String(value || ''));
    return parsed ? parsed.getTime() : 0;
  }

  private appendActivityLog(kind: MotivActivityLogEntry['kind'], title: string, details: string, driverName?: string | null): void {
    const entry: MotivActivityLogEntry = {
      timestamp: Date.now(),
      kind,
      title,
      details,
      driverName: driverName || null
    };
    this.activityFeed.update((rows) => [entry, ...rows].slice(0, 200));
    this.saveActivityLogToDb(entry);
  }

  private saveActivityLogToDb(entry: MotivActivityLogEntry): void {
    this.http.post<any>(`${this.apiUrl}/api/v1/motiv/activity-logs`, {
      kind: entry.kind,
      title: entry.title,
      details: entry.details,
      driverName: entry.driverName || null,
      timestamp: new Date(entry.timestamp).toISOString()
    }).subscribe({
      next: () => {},
      error: () => {
        // Non-blocking: UI still shows in-memory activity.
      }
    });
  }

  private saveDriverSnapshotActivity(rows: MotivDriverTableRow[]): void {
    const payloadRows = rows
      .map((row) => ({
        driverName: String(row.name || '').trim(),
        status: String(row.status || '').trim(),
        vehicle: String(row.vehicle || '').trim(),
        location: String(row.location || '').trim()
      }))
      .filter((row) => !!row.driverName);

    if (payloadRows.length === 0) return;

    this.http.post<any>(`${this.apiUrl}/api/v1/motiv/activity-logs/driver-snapshots`, {
      capturedAt: new Date().toISOString(),
      rows: payloadRows
    }).subscribe({
      next: () => this.loadPersistedActivityLogs(),
      error: () => {
        // Non-blocking: still keep current UI logs.
      }
    });
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

  private preloadMotivTabsInBackground(): void {
    // Warm non-active tabs early so switching tabs is fast.
    setTimeout(() => {
      if (!this.loadingVehicles() && this.motivVehicles().length === 0) this.loadVehicles(true);
      if (!this.loadingUsers() && this.motivUsers().length === 0) this.loadUsers(true);
      if (!this.loadingSafety() && this.motivSafetyEvents().length === 0) this.loadSafetyEvents(true);
      if (!this.loadingFuel() && this.motivFuelPurchases().length === 0) this.loadFuelPurchases(true);
      if (!this.loadingFuelCards() && this.motivFuelCards().length === 0) this.loadFuelCards(true);
      if (this.motivCardTransactions().length === 0) this.loadCardTransactions(true);
    }, 300);
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
      // For capability health, probe endpoint reachability via GET for both rows.
      // OPTIONS handling can vary by upstream proxies and cause false negatives.
      if (row.method === 'GET' || row.method === 'OPTIONS') {
        this.http.get<any>(`${this.apiUrl}/api/v1/motiv/probe?path=${encodeURIComponent(row.path)}`).pipe(timeout(15000)).subscribe({
          next: (res) => this.setPhase2Status(row.path, row.method, this.mapProbeResultToStatus(res, row.method)),
          error: () => this.setPhase2Status(row.path, row.method, 'not-connected')
        });
      } else {
        this.http.post<any>(`${this.apiUrl}/api/v1/motiv/probe-method`, {
          path: row.path,
          method: row.method
        }).pipe(timeout(15000)).subscribe({
          next: (res) => this.setPhase2Status(row.path, row.method, this.mapProbeResultToStatus(res, row.method)),
          error: () => this.setPhase2Status(row.path, row.method, 'not-connected')
        });
      }
    });
  }

  loadDrivers(): void {
    this.loadDriversFromDb(true);
  }

  refreshActivityTab(): void {
    this.loadPersistedActivityLogs();
    this.loadDriversFromDb(false);
  }

  private loadDriversFromDb(runBackgroundSync: boolean): void {
    this.loadingDrivers.set(true);
    this.driversError.set('');
    this.loadedDriverRows.set(0);
    if (runBackgroundSync) {
      this.driverSearchTerm.set('');
      this.driverStatusFilter.set('active');
      this.driverEmailFilter.set('all');
      this.driverPage.set(1);
    }
    if (!runBackgroundSync) {
      this.saveDriversMessage.set('');
    }
    this.saveDriversError.set('');
    this.syncStatusMessage.set('Loading drivers from Access DB...');
    this.http.get<any>(`${this.apiUrl}/api/v1/drivers?limit=2000&page=1`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        const rows = this.extractRows(payload);
        const scopedDriverRows = rows;
        Promise.allSettled([
          this.fetchVehicleLocationRows(),
          this.fetchMotivDriverRows()
        ])
          .then((results) => {
            const locationPayload = results[0].status === 'fulfilled'
              ? results[0].value
              : { rows: [], attempted: [], sourcePath: null as string | null };
            const motivDriverRows = results[1].status === 'fulfilled'
              ? results[1].value
              : [];
            const motivDriverRowsEnriched = this.enrichDriverRowsWithLocations(motivDriverRows, locationPayload.rows);

            let enrichedDriverRows = this.enrichDriverRowsWithLocations(scopedDriverRows, locationPayload.rows);
            enrichedDriverRows = this.mergeDriverRowsWithMotivRows(enrichedDriverRows, motivDriverRowsEnriched, locationPayload.rows);

            const withLocationCount = enrichedDriverRows.reduce((count, row) => {
              const locationText = this.mapDriverRow(row).location;
              return locationText && locationText !== 'N/A' ? count + 1 : count;
            }, 0);
            const motivWithLocationCount = motivDriverRowsEnriched.reduce((count, row) => {
              const locationText = this.mapDriverRow(row).location;
              return locationText && locationText !== 'N/A' ? count + 1 : count;
            }, 0);
            const motivActiveRows = motivDriverRowsEnriched.filter((row: any) =>
              this.isActiveLikeStatus(this.mapDriverRow(row).status)
            );

            if (withLocationCount === 0 && motivWithLocationCount > 0) {
              enrichedDriverRows = motivActiveRows.length > 0 ? motivActiveRows : motivDriverRowsEnriched;
            }

            const mappedRows = enrichedDriverRows.map((row) => this.mapDriverRow(row));
            const latLonOnlyCount = mappedRows.filter((row) => this.isLatLonLocation(row.location)).length;
            const sampleLatLon = mappedRows
              .filter((row) => this.isLatLonLocation(row.location))
              .slice(0, 5)
              .map((row) => row.location);

            // #region agent log
            fetch('http://127.0.0.1:7748/ingest/00b0bc9c-1fd5-453e-89d9-a57d4ff597b8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff188a'},body:JSON.stringify({sessionId:'ff188a',runId:'run-activity-location',hypothesisId:'H4',location:'motiv.component.ts:loadDriversFromDb:withLocationCount',message:'Post-merge driver location coverage',data:{driverRows:scopedDriverRows.length,locationRows:locationPayload.rows.length,motivDriverRows:motivDriverRows.length,enrichedDriverRows:enrichedDriverRows.length,withLocationCount},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            // #region agent log
            fetch('http://127.0.0.1:7748/ingest/00b0bc9c-1fd5-453e-89d9-a57d4ff597b8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff188a'},body:JSON.stringify({sessionId:'ff188a',runId:'run-activity-location',hypothesisId:'H6',location:'motiv.component.ts:loadDriversFromDb:latLonOnly',message:'Lat/lon-only location coverage (reverse geocode candidate)',data:{totalMapped:mappedRows.length,latLonOnlyCount,sampleLatLon},timestamp:Date.now()})}).catch(()=>{});
            // #endregion

            this.motivDrivers.set(enrichedDriverRows);
            this.loadedDriverRows.set(enrichedDriverRows.length);
            this.loadingDrivers.set(false);
            this.syncStatusMessage.set(`Loaded ${enrichedDriverRows.length} driver rows from Drivers DB (${withLocationCount} with location).`);
            this.appendActivityLog(
              'info',
              'Drivers loaded from Access DB',
              `${enrichedDriverRows.length} rows loaded (${withLocationCount} with location)${runBackgroundSync ? ' (background sync queued)' : ''}.`
            );
            this.saveDriverSnapshotActivity(this.driverTableRows());
            if (runBackgroundSync) {
              this.autoSyncDriversToDb();
            }
          })
          .catch(() => {
            this.motivDrivers.set(scopedDriverRows);
            this.loadedDriverRows.set(scopedDriverRows.length);
            this.loadingDrivers.set(false);
            this.syncStatusMessage.set(`Loaded ${scopedDriverRows.length} driver rows from Drivers DB.`);
            this.saveDriverSnapshotActivity(this.driverTableRows());
            if (runBackgroundSync) {
              this.autoSyncDriversToDb();
            }
          });
      },
      error: (err) => {
        this.driversError.set(err?.error?.error || 'Unable to load MOTIV drivers.');
        this.loadingDrivers.set(false);
        this.syncStatusMessage.set('Unable to load drivers from Access DB.');
        this.appendActivityLog('error', 'Driver load failed', this.driversError() || 'Unable to load MOTIV drivers.');
      }
    });
  }

  private autoSyncDriversToDb(): void {
    if (this.syncingDrivers()) return;
    this.syncingDrivers.set(true);
    this.syncStatusMessage.set('Auto-sync in progress: checking MOTIV for new and updated drivers...');
    this.http.post<any>(`${this.apiUrl}/api/v1/motiv/drivers/sync`, {}).pipe(timeout(180000)).subscribe({
      next: (res) => {
        this.syncingDrivers.set(false);
        this.lastDriverSyncSummary.set({
          mode: 'auto',
          fetched: Number(res?.fetched ?? 0),
          created: Number(res?.created ?? 0),
          updated: Number(res?.updated ?? 0),
          skipped: Number(res?.skipped ?? 0),
          finishedAt: new Date().toLocaleTimeString()
        });
        this.saveDriversMessage.set(
          `Auto-sync complete - fetched: ${res?.fetched ?? 0}, created: ${res?.created ?? 0}, updated: ${res?.updated ?? 0}, skipped: ${res?.skipped ?? 0}.`
        );
        this.syncStatusMessage.set(`Auto-sync complete: ${res?.created ?? 0} created, ${res?.updated ?? 0} updated.`);
        this.appendActivityLog(
          'success',
          'Auto-sync complete',
          `Fetched ${res?.fetched ?? 0}, created ${res?.created ?? 0}, updated ${res?.updated ?? 0}, skipped ${res?.skipped ?? 0}.`
        );
        this.loadDriversFromDb(false);
      },
      error: (err) => {
        this.syncingDrivers.set(false);
        this.saveDriversError.set(err?.error?.error || 'Auto-sync failed.');
        this.syncStatusMessage.set('Auto-sync failed.');
        this.appendActivityLog('error', 'Auto-sync failed', this.saveDriversError() || 'Auto-sync failed.');
      }
    });
  }

  saveDriversToDb(): void {
    this.savingDrivers.set(true);
    this.saveDriversMessage.set('');
    this.saveDriversError.set('');
    this.syncStatusMessage.set('Manual sync in progress...');
    this.http.post<any>(`${this.apiUrl}/api/v1/motiv/drivers/sync`, {}).subscribe({
      next: (res) => {
        this.savingDrivers.set(false);
        this.lastDriverSyncSummary.set({
          mode: 'manual',
          fetched: Number(res?.fetched ?? 0),
          created: Number(res?.created ?? 0),
          updated: Number(res?.updated ?? 0),
          skipped: Number(res?.skipped ?? 0),
          finishedAt: new Date().toLocaleTimeString()
        });
        this.saveDriversMessage.set(
          `Saved to Access DB - fetched: ${res?.fetched ?? 0}, created: ${res?.created ?? 0}, updated: ${res?.updated ?? 0}, skipped: ${res?.skipped ?? 0}.`
        );
        this.syncStatusMessage.set(`Manual sync complete: ${res?.created ?? 0} created, ${res?.updated ?? 0} updated.`);
        this.appendActivityLog(
          'success',
          'Manual sync complete',
          `Fetched ${res?.fetched ?? 0}, created ${res?.created ?? 0}, updated ${res?.updated ?? 0}, skipped ${res?.skipped ?? 0}.`
        );
        this.loadDriversFromDb(false);
      },
      error: (err) => {
        this.savingDrivers.set(false);
        this.saveDriversError.set(err?.error?.error || 'Unable to save MOTIV drivers to Access DB.');
        this.syncStatusMessage.set('Manual sync failed.');
        this.appendActivityLog('error', 'Manual sync failed', this.saveDriversError() || 'Unable to save MOTIV drivers.');
      }
    });
  }

  loadVehicles(background = false): void {
    this.loadingVehicles.set(true);
    this.vehiclePage.set(1);
    if (!background) {
      this.vehiclesError.set('');
      this.vehicleLocationSyncMessage.set('Syncing location payloads...');
    }
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/vehicles`).subscribe({
      next: async (res) => {
        const payload = res?.data ?? res;
        const vehicleRows = this.extractRows(payload);
        const locationPayload = await this.fetchVehicleLocationRows();
        const mergedRows = this.mergeVehicleRowsWithLocations(vehicleRows, locationPayload.rows);
        const activeDriverRows = await this.fetchActiveDriverRows();
        const scopedRows = this.filterVehicleRowsByDrivers(mergedRows, activeDriverRows);
        this.motivVehicles.set(scopedRows);
        const withLocationCount = scopedRows.reduce((count, row) => {
          const location = this.mapVehicleRow(row).location;
          return location && location !== 'N/A' ? count + 1 : count;
        }, 0);
        const sourceLabel = locationPayload.sourcePath ? `source: ${locationPayload.sourcePath}` : 'source: none';
        const attemptsLabel = locationPayload.attempted.length > 0 ? `paths tried: ${locationPayload.attempted.length}` : 'paths tried: 0';
        const scopeLabel = `driver scoped: ${scopedRows.length}/${mergedRows.length}`;
        this.vehicleLocationSyncMessage.set(
          `Location sync: ${locationPayload.rows.length} location rows, ${withLocationCount}/${scopedRows.length} vehicles mapped (${sourceLabel}, ${attemptsLabel}, ${scopeLabel}).`
        );
        this.loadingVehicles.set(false);
      },
      error: (err) => {
        if (!background) {
          this.vehiclesError.set(err?.error?.error || 'Unable to load MOTIV vehicles.');
          this.vehicleLocationSyncMessage.set('');
        }
        this.loadingVehicles.set(false);
      }
    });
  }

  private async fetchVehicleLocationRows(): Promise<{ rows: any[]; attempted: string[]; sourcePath: string | null }> {
    try {
      const res: any = await this.http
        .get(`${this.apiUrl}/api/v1/motiv/vehicle-locations`)
        .pipe(timeout(15000))
        .toPromise();
      const payload = res?.data ?? res;
      const rows = this.extractRows(payload);
      const sample = rows[0] ?? null;
      const sampleKeys = sample && typeof sample === 'object' ? Object.keys(sample).slice(0, 20) : [];
      const sampleVehicleKeys = sample?.vehicle && typeof sample.vehicle === 'object' ? Object.keys(sample.vehicle).slice(0, 20) : [];
      const sampleLocationKeys = sample?.current_location && typeof sample.current_location === 'object' ? Object.keys(sample.current_location).slice(0, 20) : [];

      // #region agent log
      fetch('http://127.0.0.1:7748/ingest/00b0bc9c-1fd5-453e-89d9-a57d4ff597b8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff188a'},body:JSON.stringify({sessionId:'ff188a',runId:'run-activity-location',hypothesisId:'H1',location:'motiv.component.ts:fetchVehicleLocationRows:success',message:'Vehicle location payload shape',data:{sourcePath:typeof payload?.sourcePath==='string'?payload.sourcePath:(typeof payload?.path==='string'?payload.path:null),attemptedCount:Array.isArray(payload?.attempted)?payload.attempted.length:0,rows:rows.length,sampleKeys,sampleVehicleKeys,sampleLocationKeys},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      return {
        rows,
        attempted: Array.isArray(payload?.attempted) ? payload.attempted : [],
        sourcePath: typeof payload?.sourcePath === 'string' ? payload.sourcePath : (typeof payload?.path === 'string' ? payload.path : null)
      };
    } catch {
      return { rows: [], attempted: [], sourcePath: null };
    }
  }

  private async fetchMotivDriverRows(): Promise<any[]> {
    try {
      const res: any = await this.http
        .get(`${this.apiUrl}/api/v1/motiv/drivers`)
        .pipe(timeout(15000))
        .toPromise();
      const payload = res?.data ?? res;
      const rows = this.extractRows(payload);
      const sample = rows[0] ?? null;
      const sampleKeys = sample && typeof sample === 'object' ? Object.keys(sample).slice(0, 20) : [];
      const sampleUserKeys = sample?.user && typeof sample.user === 'object' ? Object.keys(sample.user).slice(0, 20) : [];
      const sampleVehicleKeys = sample?.current_vehicle && typeof sample.current_vehicle === 'object' ? Object.keys(sample.current_vehicle).slice(0, 20) : [];
      const sampleLocationKeys = sample?.current_location && typeof sample.current_location === 'object' ? Object.keys(sample.current_location).slice(0, 20) : [];

      // #region agent log
      fetch('http://127.0.0.1:7748/ingest/00b0bc9c-1fd5-453e-89d9-a57d4ff597b8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff188a'},body:JSON.stringify({sessionId:'ff188a',runId:'run-activity-location',hypothesisId:'H2',location:'motiv.component.ts:fetchMotivDriverRows:success',message:'MOTIV drivers payload shape',data:{rows:rows.length,sampleKeys,sampleUserKeys,sampleVehicleKeys,sampleLocationKeys},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      return rows;
    } catch {
      return [];
    }
  }

  private mergeDriverRowsWithMotivRows(driverRows: any[], motivRows: any[], locationRows: any[] = []): any[] {
    if (!Array.isArray(driverRows) || driverRows.length === 0) return [];
    if (!Array.isArray(motivRows) || motivRows.length === 0) return driverRows;

    const byEmail = new Map<string, any>();
    const byName = new Map<string, any>();
    const byVehicleId = new Map<string, any>();
    const byUnit = new Map<string, any>();
    const byVin = new Map<string, any>();
    let matchedLocationCount = 0;
    let candidateWithLocationCount = 0;
    let placeholderLocationOverrides = 0;

    for (const row of locationRows || []) {
      const normalized = row?.vehicle ?? row?.current_vehicle ?? row ?? {};
      const vehicleId = String(
        row?.vehicle_id ??
        row?.vehicleId ??
        normalized?.vehicle_id ??
        normalized?.id ??
        ''
      ).trim();
      const unit = this.normalizeVehicleMatchValue(
        normalized?.number ??
        normalized?.fleet_number ??
        normalized?.fleetNumber ??
        normalized?.unit ??
        normalized?.unit_number ??
        row?.number ??
        row?.unit ??
        row?.unit_number
      );
      const vin = this.normalizeVehicleMatchValue(
        normalized?.vin ??
        normalized?.vehicle_vin ??
        normalized?.vehicleVin ??
        row?.vin ??
        row?.vehicle_vin ??
        row?.vehicleVin
      );

      if (vehicleId && !byVehicleId.has(vehicleId)) byVehicleId.set(vehicleId, row);
      if (unit && !byUnit.has(unit)) byUnit.set(unit, row);
      if (vin && !byVin.has(vin)) byVin.set(vin, row);
    }

    for (const row of motivRows) {
      const vehicleSeed = row?.current_vehicle ?? row?.vehicle ?? {};
      const vehicleId = String(
        row?.vehicle_id ??
        row?.vehicleId ??
        vehicleSeed?.vehicle_id ??
        vehicleSeed?.id ??
        ''
      ).trim();
      const unit = this.normalizeVehicleMatchValue(
        vehicleSeed?.number ??
        vehicleSeed?.fleet_number ??
        vehicleSeed?.fleetNumber ??
        vehicleSeed?.unit ??
        vehicleSeed?.unit_number
      );
      const vin = this.normalizeVehicleMatchValue(
        vehicleSeed?.vin ??
        vehicleSeed?.vehicle_vin ??
        vehicleSeed?.vehicleVin
      );

      const matchedLocation = (vehicleId && byVehicleId.get(vehicleId))
        || (vin && byVin.get(vin))
        || (unit && byUnit.get(unit));
      if (matchedLocation) matchedLocationCount++;

      const candidate = matchedLocation
        ? {
            ...row,
            current_location: row?.current_location ?? matchedLocation?.current_location ?? matchedLocation?.location ?? matchedLocation,
            location: row?.location ?? matchedLocation?.location ?? matchedLocation?.current_location ?? matchedLocation?.vehicle_location ?? matchedLocation,
            vehicle_location: row?.vehicle_location ?? matchedLocation?.vehicle_location ?? matchedLocation?.current_location ?? matchedLocation?.location
          }
        : row;

      const mapped = this.mapDriverRow(candidate);
      const locationText = this.buildLocationDisplayFromRaw(candidate);
      if (locationText && locationText !== 'N/A') candidateWithLocationCount++;
      if (!locationText || locationText === 'N/A') continue;

      const emailKey = String(mapped.email || '').trim().toLowerCase();
      const nameKey = this.normalizePersonName(mapped.name);
      if (emailKey && !byEmail.has(emailKey)) byEmail.set(emailKey, candidate);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, candidate);
    }

    const mergedRows = driverRows.map((driver) => {
      const mappedDriver = this.mapDriverRow(driver);
      const emailKey = String(mappedDriver.email || '').trim().toLowerCase();
      const nameKey = this.normalizePersonName(mappedDriver.name);
      const matched = (emailKey && byEmail.get(emailKey)) || (nameKey && byName.get(nameKey));
      if (!matched) return driver;

      const mergedLocation = this.extractLocationSeed(matched);
      const matchedVehicle = matched?.current_vehicle ?? matched?.vehicle ?? null;
      const matchedLocationText = this.buildLocationDisplayFromRaw(matched);
      const primaryLocation = driver?.location;
      if (typeof primaryLocation === 'string') {
        const normalized = primaryLocation.trim().toLowerCase();
        if ((normalized === 'n/a' || normalized === 'unknown') && matchedLocationText !== 'N/A') {
          placeholderLocationOverrides++;
        }
      }

      return {
        ...driver,
        status: this.mergePreferredValue(
          driver?.status ?? driver?.Status,
          matched?.status ?? matched?.Status ?? matched?.user?.status ?? matched?.user?.Status
        ),
        isActive: this.mergePreferredValue(
          driver?.isActive ?? driver?.IsActive ?? driver?.active ?? driver?.Active,
          matched?.isActive ?? matched?.IsActive ?? matched?.active ?? matched?.Active ?? matched?.user?.isActive ?? matched?.user?.is_active
        ),
        isDeleted: this.mergePreferredValue(
          driver?.isDeleted ?? driver?.IsDeleted,
          matched?.isDeleted ?? matched?.IsDeleted
        ),
        deactivatedAt: this.mergePreferredValue(
          driver?.deactivatedAt ?? driver?.DeactivatedAt,
          matched?.deactivatedAt ?? matched?.DeactivatedAt
        ),
        current_location: this.mergePreferredValue(driver?.current_location, mergedLocation),
        currentLocation: this.mergePreferredValue(driver?.currentLocation, mergedLocation),
        location: this.mergePreferredValue(driver?.location, mergedLocation ?? (matchedLocationText !== 'N/A' ? matchedLocationText : null)),
        city: driver?.city ?? driver?.City ?? mergedLocation?.city ?? mergedLocation?.City ?? mergedLocation?.address?.city ?? null,
        state: driver?.state ?? driver?.State ?? mergedLocation?.state ?? mergedLocation?.State ?? mergedLocation?.address?.state ?? null,
        lat: driver?.lat ?? mergedLocation?.lat ?? mergedLocation?.latitude ?? mergedLocation?.Latitude ?? null,
        lon: driver?.lon ?? driver?.lng ?? mergedLocation?.lon ?? mergedLocation?.lng ?? mergedLocation?.longitude ?? mergedLocation?.Longitude ?? null,
        current_vehicle: driver?.current_vehicle ?? matchedVehicle,
        vehicle: driver?.vehicle ?? matchedVehicle
      };
    });

    // #region agent log
    fetch('http://127.0.0.1:7748/ingest/00b0bc9c-1fd5-453e-89d9-a57d4ff597b8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff188a'},body:JSON.stringify({sessionId:'ff188a',runId:'run-activity-location',hypothesisId:'H3',location:'motiv.component.ts:mergeDriverRowsWithMotivRows:summary',message:'Merge-stage matching and candidate coverage',data:{driverRows:driverRows.length,motivRows:motivRows.length,locationRows:locationRows.length,matchedLocationCount,candidateWithLocationCount,mergeCandidatesByEmail:byEmail.size,mergeCandidatesByName:byName.size,mergedRows:mergedRows.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // #region agent log
    fetch('http://127.0.0.1:7748/ingest/00b0bc9c-1fd5-453e-89d9-a57d4ff597b8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff188a'},body:JSON.stringify({sessionId:'ff188a',runId:'run-activity-location',hypothesisId:'H5',location:'motiv.component.ts:mergeDriverRowsWithMotivRows:placeholderOverride',message:'Placeholder location override opportunities',data:{placeholderLocationOverrides},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return mergedRows;
  }

  private mergeVehicleRowsWithLocations(vehicleRows: any[], locationRows: any[]): any[] {
    if (!Array.isArray(vehicleRows) || vehicleRows.length === 0 || !Array.isArray(locationRows) || locationRows.length === 0) {
      return vehicleRows;
    }

    const byVehicleId = new Map<string, any>();
    const byUnitNumber = new Map<string, any>();

    for (const row of locationRows) {
      const normalized = row?.vehicle ?? row?.current_vehicle ?? row ?? {};
      const vehicleId = String(
        row?.vehicle_id ??
        row?.vehicleId ??
        normalized?.vehicle_id ??
        normalized?.id ??
        ''
      ).trim();
      const unitNumber = String(
        normalized?.number ??
        normalized?.fleet_number ??
        normalized?.fleetNumber ??
        normalized?.unit ??
        normalized?.unit_number ??
        row?.number ??
        row?.unit ??
        row?.unit_number ??
        ''
      ).trim();

      if (vehicleId) byVehicleId.set(vehicleId, row);
      if (unitNumber) byUnitNumber.set(unitNumber, row);
    }

    return vehicleRows.map((row) => {
      const vehicle = row?.vehicle ?? row ?? {};
      const vehicleId = String(vehicle?.id ?? row?.id ?? row?.vehicle_id ?? '').trim();
      const unitNumber = String(
        vehicle?.number ??
        vehicle?.fleet_number ??
        vehicle?.fleetNumber ??
        vehicle?.unit ??
        vehicle?.unit_number ??
        row?.number ??
        ''
      ).trim();

      const locationMatch = (vehicleId && byVehicleId.get(vehicleId)) || (unitNumber && byUnitNumber.get(unitNumber));
      if (!locationMatch) return row;

      const mergedLocation =
        locationMatch?.current_location ??
        locationMatch?.currentLocation ??
        locationMatch?.location ??
        locationMatch?.vehicle_location ??
        locationMatch?.vehicleLocation ??
        null;

      return {
        ...row,
        current_location: row?.current_location ?? mergedLocation,
        location: row?.location ?? mergedLocation,
        vehicle: row?.vehicle
          ? { ...row.vehicle, current_location: row?.vehicle?.current_location ?? mergedLocation }
          : row?.vehicle
      };
    });
  }

  private enrichDriverRowsWithLocations(driverRows: any[], locationRows: any[]): any[] {
    if (!Array.isArray(driverRows) || driverRows.length === 0) return [];
    if (!Array.isArray(locationRows) || locationRows.length === 0) return driverRows;

    const byUnit = new Map<string, any>();
    const byVin = new Map<string, any>();
    const byUserId = new Map<string, any>();
    const byDriverName = new Map<string, any>();

    for (const row of locationRows) {
      const normalized = row?.vehicle ?? row?.current_vehicle ?? row ?? {};
      const user = row?.user ?? row?.current_user ?? row?.driver ?? row ?? {};
      const userName = this.normalizePersonName(
        user?.name ??
        user?.full_name ??
        user?.fullName ??
        `${user?.first_name ?? user?.firstName ?? ''} ${user?.last_name ?? user?.lastName ?? ''}`.trim()
      );
      const userId = String(
        user?.id ??
        user?.user_id ??
        row?.user_id ??
        row?.userId ??
        ''
      ).trim();
      const unitNumber = this.normalizeVehicleMatchValue(
        normalized?.number ??
        normalized?.fleet_number ??
        normalized?.fleetNumber ??
        normalized?.unit ??
        normalized?.unit_number ??
        row?.number ??
        row?.unit ??
        row?.unit_number
      );
      const vin = this.normalizeVehicleMatchValue(
        normalized?.vin ??
        normalized?.vehicle_vin ??
        normalized?.vehicleVin ??
        row?.vin ??
        row?.vehicle_vin ??
        row?.vehicleVin
      );
      if (unitNumber && !byUnit.has(unitNumber)) byUnit.set(unitNumber, row);
      if (vin && !byVin.has(vin)) byVin.set(vin, row);
      if (userId && !byUserId.has(userId)) byUserId.set(userId, row);
      if (userName && !byDriverName.has(userName)) byDriverName.set(userName, row);
    }

    return driverRows.map((driver) => {
      const motivUserId = this.extractMotivUserIdFromNotes(driver?.notes ?? driver?.Notes);
      const driverName = this.normalizePersonName(
        driver?.name ??
        driver?.Name ??
        `${driver?.firstName ?? driver?.FirstName ?? ''} ${driver?.lastName ?? driver?.LastName ?? ''}`.trim()
      );
      const unit = this.normalizeVehicleMatchValue(
        driver?.truckNumber ??
        driver?.TruckNumber ??
        driver?.unit ??
        driver?.Unit ??
        driver?.vehicleNumber ??
        driver?.VehicleNumber
      );
      const vin = this.normalizeVehicleMatchValue(
        driver?.truckVin ??
        driver?.TruckVin ??
        driver?.vin ??
        driver?.Vin ??
        driver?.vehicleVin ??
        driver?.VehicleVin
      );
      const matched =
        (motivUserId && byUserId.get(motivUserId))
        || (vin && byVin.get(vin))
        || (unit && byUnit.get(unit))
        || (driverName && byDriverName.get(driverName));
      if (!matched) return driver;

      const mergedLocation = this.extractLocationSeed(matched);
      const mergedVehicle =
        matched?.vehicle ??
        matched?.current_vehicle ??
        null;

      return {
        ...driver,
        current_location: this.mergePreferredValue(driver?.current_location, mergedLocation),
        currentLocation: this.mergePreferredValue(driver?.currentLocation, mergedLocation),
        location: this.mergePreferredValue(driver?.location, mergedLocation),
        city: driver?.city ?? driver?.City ?? mergedLocation?.city ?? mergedLocation?.City ?? mergedLocation?.address?.city ?? null,
        state: driver?.state ?? driver?.State ?? mergedLocation?.state ?? mergedLocation?.State ?? mergedLocation?.address?.state ?? null,
        lat: driver?.lat ?? mergedLocation?.lat ?? mergedLocation?.latitude ?? mergedLocation?.Latitude ?? null,
        lon: driver?.lon ?? driver?.lng ?? mergedLocation?.lon ?? mergedLocation?.lng ?? mergedLocation?.longitude ?? mergedLocation?.Longitude ?? null,
        lastLocationUpdate:
          driver?.lastLocationUpdate ??
          driver?.LastLocationUpdate ??
          mergedLocation?.located_at ??
          mergedLocation?.locatedAt ??
          driver?.updatedAt ??
          driver?.UpdatedAt ??
          null,
        vehicle: driver?.vehicle ?? mergedVehicle,
        current_vehicle: driver?.current_vehicle ?? mergedVehicle
      };
    });
  }

  private async fetchActiveDriverRows(): Promise<any[]> {
    try {
      const res: any = await this.http
        .get(`${this.apiUrl}/api/v1/drivers?limit=2000&page=1`)
        .pipe(timeout(15000))
        .toPromise();
      const payload = res?.data ?? res;
      const rows = this.extractRows(payload);
      return rows.filter((row: any) => this.isActiveLikeStatus(String(row?.status ?? row?.Status ?? '').trim().toLowerCase()));
    } catch {
      return [];
    }
  }

  private filterVehicleRowsByDrivers(vehicleRows: any[], activeDriverRows: any[]): any[] {
    if (!Array.isArray(activeDriverRows) || activeDriverRows.length === 0) return [];

    const sourceRows = Array.isArray(vehicleRows) ? vehicleRows : [];
    const byUnit = new Map<string, any>();
    const byVin = new Map<string, any>();

    for (const raw of sourceRows) {
      const mapped = this.mapVehicleRow(raw);
      const unit = this.normalizeVehicleMatchValue(mapped.number);
      const vin = this.normalizeVehicleMatchValue(mapped.vin);
      if (unit && !byUnit.has(unit)) byUnit.set(unit, raw);
      if (vin && !byVin.has(vin)) byVin.set(vin, raw);
    }

    return activeDriverRows.map((driver) => {
      const unit = this.normalizeVehicleMatchValue(
        driver?.truckNumber ??
        driver?.TruckNumber ??
        driver?.unit ??
        driver?.Unit ??
        driver?.vehicleNumber ??
        driver?.VehicleNumber
      );
      const vin = this.normalizeVehicleMatchValue(
        driver?.truckVin ??
        driver?.TruckVin ??
        driver?.vin ??
        driver?.Vin ??
        driver?.vehicleVin ??
        driver?.VehicleVin
      );

      const matched = (vin && byVin.get(vin)) || (unit && byUnit.get(unit));
      if (matched) return this.applyDriverStatusToVehicleRow(matched, driver);

      return this.buildDriverFallbackVehicleRow(driver);
    });
  }

  private normalizeVehicleMatchValue(value: any): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private normalizePersonName(value: any): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private extractLocationSeed(row: any): any {
    if (!row || typeof row !== 'object') return null;
    const candidates = [
      row?.current_location,
      row?.currentLocation,
      row?.location,
      row?.vehicle_location,
      row?.vehicleLocation,
      row?.last_known_location,
      row?.lastKnownLocation,
      row?.last_known_position,
      row?.lastKnownPosition,
      row?.latest_location,
      row?.latestLocation,
      row?.position,
      row?.gps,
      row?.point,
      row?.address,
      row?.geo,
      row?.geocode,
      row?.coordinates,
      row?.vehicle?.current_location,
      row?.vehicle?.location,
      row?.current_vehicle?.current_location,
      row?.current_vehicle?.location
    ];

    for (const seeded of candidates) {
      if (!seeded) continue;
      if (typeof seeded === 'object') return seeded;
      if (typeof seeded === 'string') {
        const normalized = seeded.trim().toLowerCase();
        if (normalized && normalized !== 'n/a' && normalized !== 'unknown' && normalized !== 'null') {
          return { description: seeded };
        }
      }
    }

    if (
      row?.city ?? row?.City ??
      row?.state ?? row?.State ??
      row?.address ??
      row?.location_name ??
      row?.place_name ??
      row?.formatted ??
      row?.formatted_address ??
      row?.lat ?? row?.latitude ?? row?.Latitude ??
      row?.lon ?? row?.lng ?? row?.longitude ?? row?.Longitude
    ) {
      return row;
    }
    return null;
  }

  private collectLocationKeys(raw: any): string[] {
    const keys: string[] = [];
    const seed = this.extractLocationSeed(raw);
    if (seed && typeof seed === 'object') {
      for (const key of Object.keys(seed)) {
        keys.push(`loc.${key}`);
      }
      const address = seed?.address;
      if (address && typeof address === 'object') {
        for (const key of Object.keys(address)) {
          keys.push(`loc.address.${key}`);
        }
      }
    }
    if (raw && typeof raw === 'object') {
      for (const key of ['city', 'City', 'state', 'State', 'lat', 'latitude', 'lon', 'lng', 'longitude', 'location_name', 'formatted_address', 'vehicle_location', 'vehicleLocation', 'last_known_position', 'position', 'place_name', 'formatted']) {
        if (raw[key] != null) {
          keys.push(`raw.${key}`);
        }
      }
    }
    return keys;
  }

  private extractMotivUserIdFromNotes(notes: any): string {
    const text = String(notes ?? '');
    if (!text) return '';
    const match = /userId:\s*([A-Za-z0-9\-_]+)/i.exec(text);
    return match?.[1]?.trim() || '';
  }

  private buildDriverFallbackVehicleRow(driver: any): any {
    const fallbackId =
      driver?.vehicleId ??
      driver?.VehicleId ??
      driver?.truckNumber ??
      driver?.TruckNumber ??
      `driver-${driver?.id ?? driver?.Id ?? 'unknown'}`;

    return {
      id: fallbackId,
      number: driver?.truckNumber ?? driver?.TruckNumber ?? driver?.vehicleNumber ?? driver?.VehicleNumber ?? 'N/A',
      make: driver?.truckMake ?? driver?.TruckMake ?? 'N/A',
      model: driver?.truckModel ?? driver?.TruckModel ?? 'N/A',
      year: driver?.truckYear ?? driver?.TruckYear ?? 'N/A',
      vin: driver?.truckVin ?? driver?.TruckVin ?? driver?.vehicleVin ?? driver?.VehicleVin ?? 'N/A',
      status: driver?.status ?? driver?.Status ?? 'active',
      location: 'N/A',
      updated_at: driver?.lastLocationUpdate ?? driver?.LastLocationUpdate ?? driver?.updatedAt ?? driver?.UpdatedAt ?? null
    };
  }

  private applyDriverStatusToVehicleRow(vehicleRow: any, driver: any): any {
    const driverStatus = String(driver?.status ?? driver?.Status ?? '').trim();
    if (!driverStatus) return vehicleRow;

    return {
      ...vehicleRow,
      status: driverStatus,
      state: driverStatus,
      availability_details: vehicleRow?.availability_details
        ? { ...vehicleRow.availability_details, availability_status: driverStatus }
        : vehicleRow?.availability_details,
      vehicle: vehicleRow?.vehicle
        ? {
            ...vehicleRow.vehicle,
            status: driverStatus,
            availability_details: vehicleRow?.vehicle?.availability_details
              ? { ...vehicleRow.vehicle.availability_details, availability_status: driverStatus }
              : vehicleRow?.vehicle?.availability_details
          }
        : vehicleRow?.vehicle
    };
  }

  setVehiclePageSize(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.vehiclePageSize.set(value);
    this.vehiclePage.set(1);
  }

  goToPreviousVehiclePage(): void {
    this.vehiclePage.set(Math.max(1, this.safeVehiclePage() - 1));
  }

  goToNextVehiclePage(): void {
    this.vehiclePage.set(Math.min(this.vehicleTotalPages(), this.safeVehiclePage() + 1));
  }

  setVehicleSearchTerm(value: string): void {
    this.vehicleSearchTerm.set(value ?? '');
    this.vehiclePage.set(1);
  }

  setVehicleStatusFilter(value: 'all' | 'active' | 'deactivated' | 'other'): void {
    this.vehicleStatusFilter.set(value ?? 'all');
    this.vehiclePage.set(1);
  }

  setVehicleVinFilter(value: 'all' | 'with-vin' | 'without-vin'): void {
    this.vehicleVinFilter.set(value ?? 'all');
    this.vehiclePage.set(1);
  }

  loadUsers(background = false): void {
    this.loadingUsers.set(true);
    this.userPage.set(1);
    if (!background) this.usersError.set('');
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/users`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivUsers.set(this.extractRows(payload));
        this.loadingUsers.set(false);
      },
      error: (err) => {
        if (!background) {
          this.usersError.set(err?.error?.error || 'Unable to load MOTIV users.');
        }
        this.loadingUsers.set(false);
      }
    });
  }

  loadSafetyEvents(background = false): void {
    this.loadingSafety.set(true);
    if (!background) this.safetyError.set('');
    const days = Math.max(1, Math.min(365, Number(this.safetyDaysFilter() || 30)));
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/safety-events?days=${days}&limit=5000`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivSafetyEvents.set(this.extractRows(payload));
        this.loadingSafety.set(false);
      },
      error: (err) => {
        if (!background) {
          this.safetyError.set(err?.error?.error || 'Unable to load MOTIV safety events.');
        }
        this.loadingSafety.set(false);
      }
    });
  }

  setDriverSearchTerm(value: string): void {
    this.driverSearchTerm.set(value ?? '');
    this.driverPage.set(1);
  }

  setDriverStatusFilter(value: 'all' | 'active' | 'deactivated'): void {
    this.driverStatusFilter.set(value ?? 'all');
    this.driverPage.set(1);
  }

  setDriverEmailFilter(value: 'all' | 'with-email' | 'without-email'): void {
    this.driverEmailFilter.set(value ?? 'all');
    this.driverPage.set(1);
  }

  setDriverPageSize(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.driverPageSize.set(value);
    this.driverPage.set(1);
  }

  goToPreviousDriverPage(): void {
    this.driverPage.set(Math.max(1, this.safeDriverPage() - 1));
  }

  goToNextDriverPage(): void {
    this.driverPage.set(Math.min(this.driverTotalPages(), this.safeDriverPage() + 1));
  }

  setFuelSearchTerm(value: string): void {
    this.fuelSearchTerm.set(value ?? '');
    this.fuelPage.set(1);
  }

  setFuelStatusFilter(value: 'all' | 'completed' | 'pending' | 'other'): void {
    this.fuelStatusFilter.set(value ?? 'all');
    this.fuelPage.set(1);
  }

  setFuelSourceFilter(value: 'all' | 'motive-card' | 'other'): void {
    this.fuelSourceFilter.set(value ?? 'all');
    this.fuelPage.set(1);
  }

  setFuelCardFilter(value: string): void {
    this.fuelCardFilter.set(value ?? 'all');
    this.fuelPage.set(1);
  }

  setFuelYearFilter(value: string): void {
    this.fuelYearFilter.set(value ?? 'all');
    this.fuelWeekFilter.set('all');
    this.fuelPage.set(1);
  }

  setFuelWeekFilter(value: string): void {
    this.fuelWeekFilter.set(value ?? 'all');
    this.fuelPage.set(1);
  }

  setFuelSort(column: FuelSortColumn): void {
    if (this.fuelSortColumn() === column) {
      this.fuelSortDirection.set(this.fuelSortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.fuelSortColumn.set(column);
      this.fuelSortDirection.set(column === 'date' || column === 'week' || column === 'amount' ? 'desc' : 'asc');
    }
    this.fuelPage.set(1);
  }

  getFuelSortIndicator(column: FuelSortColumn): string {
    if (this.fuelSortColumn() !== column) return '';
    return this.fuelSortDirection() === 'asc' ? '↑' : '↓';
  }

  setFuelPageSize(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.fuelPageSize.set(value);
    this.fuelPage.set(1);
  }

  goToPreviousFuelPage(): void {
    this.fuelPage.set(Math.max(1, this.safeFuelPage() - 1));
  }

  goToNextFuelPage(): void {
    this.fuelPage.set(Math.min(this.fuelTotalPages(), this.safeFuelPage() + 1));
  }

  setFuelCardSearchTerm(value: string): void {
    this.fuelCardSearchTerm.set(value ?? '');
    this.fuelCardPage.set(1);
  }

  setFuelCardStatusFilter(value: 'all' | 'active' | 'inactive' | 'other'): void {
    this.fuelCardStatusFilter.set(value ?? 'all');
    this.fuelCardPage.set(1);
  }

  setFuelCardYearFilter(value: string): void {
    this.fuelCardYearFilter.set(value ?? 'all');
    this.fuelCardWeekFilter.set('all');
    this.fuelCardPage.set(1);
  }

  setFuelCardWeekFilter(value: string): void {
    this.fuelCardWeekFilter.set(value ?? 'all');
    this.fuelCardPage.set(1);
  }

  setFuelCardPageSize(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.fuelCardPageSize.set(value);
    this.fuelCardPage.set(1);
  }

  goToPreviousFuelCardPage(): void {
    this.fuelCardPage.set(Math.max(1, this.safeFuelCardPage() - 1));
  }

  goToNextFuelCardPage(): void {
    this.fuelCardPage.set(Math.min(this.fuelCardTotalPages(), this.safeFuelCardPage() + 1));
  }

  setUserSearchTerm(value: string): void {
    this.userSearchTerm.set(value ?? '');
    this.userPage.set(1);
  }

  setUserStatusFilter(value: 'all' | 'active' | 'deactivated'): void {
    this.userStatusFilter.set(value ?? 'all');
    this.userPage.set(1);
  }

  setUserTypeFilter(value: 'all' | 'driver' | 'admin' | 'other'): void {
    this.userTypeFilter.set(value ?? 'all');
    this.userPage.set(1);
  }

  setSafetySearchTerm(value: string): void {
    this.safetySearchTerm.set(value ?? '');
  }

  setSafetyTypeFilter(value: string): void {
    this.safetyTypeFilter.set(value ?? 'all');
  }

  setSafetyVideoFilter(value: 'all' | 'with-video' | 'without-video'): void {
    this.safetyVideoFilter.set(value ?? 'all');
  }

  setSafetyDaysFilter(value: number): void {
    const normalized = Math.max(1, Math.min(365, Number(value || 30)));
    this.safetyDaysFilter.set(normalized);
    this.loadSafetyEvents();
  }

  setUserPageSize(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.userPageSize.set(value);
    this.userPage.set(1);
  }

  goToPreviousUserPage(): void {
    this.userPage.set(Math.max(1, this.safeUserPage() - 1));
  }

  goToNextUserPage(): void {
    this.userPage.set(Math.min(this.userTotalPages(), this.safeUserPage() + 1));
  }

  loadFuelPurchases(background = false): void {
    this.loadingFuel.set(true);
    this.fuelPage.set(1);
    if (!background) {
      this.fuelError.set('');
      this.saveFuelMessage.set('');
      this.saveFuelError.set('');
    }
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/fuel-purchases`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivFuelPurchases.set(this.extractRows(payload));
        this.loadingFuel.set(false);
      },
      error: (err) => {
        if (!background) {
          this.fuelError.set(err?.error?.error || 'Unable to load MOTIV fuel purchases.');
        }
        this.loadingFuel.set(false);
      }
    });
  }

  loadFuelCards(background = false): void {
    this.loadingFuelCards.set(true);
    this.fuelCardPage.set(1);
    if (!background) {
      this.fuelCardsError.set('');
    }
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/fuel-cards`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivFuelCards.set(this.extractRows(payload));
        this.loadingFuelCards.set(false);
      },
      error: (err) => {
        if (!background) {
          this.fuelCardsError.set(err?.error?.error || 'Unable to load MOTIV fuel cards.');
        }
        this.loadingFuelCards.set(false);
      }
    });
  }

  loadCardTransactions(background = false): void {
    this.http.get<any>(`${this.apiUrl}/api/v1/motiv/card-transactions`).subscribe({
      next: (res) => {
        const payload = res?.data ?? res;
        this.motivCardTransactions.set(this.extractRows(payload));
      },
      error: () => {
        if (!background) {
          // Best-effort enrichment only; keep table usable with zeroed rollups when unavailable.
          this.motivCardTransactions.set([]);
        }
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

  backfillFuelPurchases(days = 730): void {
    this.savingFuel.set(true);
    this.saveFuelMessage.set('');
    this.saveFuelError.set('');
    this.http.post<any>(`${this.apiUrl}/api/v1/motiv/fuel-purchases/backfill?days=${days}`, {}).subscribe({
      next: (res) => {
        this.savingFuel.set(false);
        this.saveFuelMessage.set(
          `Historical backfill complete - fetched: ${res?.fetched ?? 0}, created: ${res?.created ?? 0}, updated: ${res?.updated ?? 0}, skipped: ${res?.skipped ?? 0}, days: ${res?.days ?? days}.`
        );
        this.loadFuelPurchases(true);
      },
      error: (err) => {
        this.savingFuel.set(false);
        this.saveFuelError.set(err?.error?.error || 'Unable to backfill MOTIV fuel purchases.');
      }
    });
  }

  generateFuelReportPerActiveDriver(): void {
    this.generatingFuelReport.set(true);
    this.saveFuelMessage.set('');
    this.saveFuelError.set('');

    this.http.get<any>(`${this.apiUrl}/api/v1/drivers?limit=2000&page=1`).pipe(timeout(30000)).subscribe({
      next: async (res) => {
        try {
          const payload = res?.data ?? res;
          const activeDrivers = this.extractRows(payload).filter((row: any) => {
            const status = String(row?.status ?? row?.Status ?? '').trim();
            return this.isActiveLikeStatus(status);
          });

          const byId = new Map<string, any>();
          const byName = new Map<string, any>();
          for (const driver of activeDrivers) {
            const idKey = this.normalizeFuelReportKey(driver?.id ?? driver?.Id ?? driver?.userId ?? driver?.UserId);
            const name = this.resolveFuelReportDriverName(driver);
            const nameKey = this.normalizeFuelReportKey(name);
            if (idKey && !byId.has(idKey)) byId.set(idKey, driver);
            if (nameKey && !byName.has(nameKey)) byName.set(nameKey, driver);
          }

          const filteredRows = this.filteredFuelRows();
          const activeMatchedRows = filteredRows.filter((fuelRow) => {
            const key = this.normalizeFuelReportKey(fuelRow.driverId);
            return !!key && (byId.has(key) || byName.has(key));
          });
          const reportRows = activeMatchedRows.length > 0 ? activeMatchedRows : filteredRows;
          const reportScope = activeMatchedRows.length > 0 ? 'active-matched' : 'filtered-fallback';

          const aggregates = new Map<string, {
            name: string;
            driverId: string;
            transactions: number;
            total: number;
            fuel: number;
            other: number;
            unknown: number;
            cards: Set<string>;
          }>();

          for (const fuelRow of reportRows) {
            const key = this.normalizeFuelReportKey(fuelRow.driverId);
            const matchedDriver = (key && byId.get(key)) || (key && byName.get(key));

            const reportDriverName = matchedDriver
              ? this.resolveFuelReportDriverName(matchedDriver)
              : (String(fuelRow.driverId ?? '').trim() || 'Unknown Driver');
            const reportDriverId = matchedDriver
              ? (String(matchedDriver?.id ?? matchedDriver?.Id ?? matchedDriver?.userId ?? matchedDriver?.UserId ?? fuelRow.driverId ?? 'N/A').trim() || 'N/A')
              : (String(fuelRow.driverId ?? '').trim() || 'N/A');
            const aggregateKey = `${reportDriverId}|${reportDriverName}`.toLowerCase();
            if (!aggregates.has(aggregateKey)) {
              aggregates.set(aggregateKey, {
                name: reportDriverName,
                driverId: reportDriverId,
                transactions: 0,
                total: 0,
                fuel: 0,
                other: 0,
                unknown: 0,
                cards: new Set<string>()
              });
            }

            const agg = aggregates.get(aggregateKey)!;
            const amount = Number.isFinite(fuelRow.amountValue) ? fuelRow.amountValue : 0;
            agg.transactions += 1;
            agg.total += amount;
            const kind = this.classifyFuelCharge(fuelRow);
            if (kind === 'fuel') agg.fuel += amount;
            else if (kind === 'other') agg.other += amount;
            else agg.unknown += amount;
            const card = String(fuelRow.cardLabel ?? '').trim();
            if (card && card.toLowerCase() !== 'n/a') {
              agg.cards.add(card);
            }
          }

          const ordered = Array.from(aggregates.values()).sort((a, b) => b.total - a.total);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `fuel-active-driver-report-${stamp}.pdf`;
          await this.openFuelReportPdf(filename, ordered, reportRows, {
            filteredCount: filteredRows.length,
            activeMatchedCount: activeMatchedRows.length,
            scope: reportScope,
            activeDriverCount: activeDrivers.length
          });

          this.saveFuelMessage.set(`Fuel report generated with ${reportRows.length} transactions and ${ordered.length} driver summaries.`);
        } catch {
          this.saveFuelError.set('Unable to generate fuel report from current data.');
        } finally {
          this.generatingFuelReport.set(false);
        }
      },
      error: (err) => {
        this.generatingFuelReport.set(false);
        this.saveFuelError.set(err?.error?.error || 'Unable to load active drivers for fuel report.');
      }
    });
  }

  private extractRows(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.driver_performance_events)) return payload.driver_performance_events;
    if (Array.isArray(payload?.driverPerformanceEvents)) return payload.driverPerformanceEvents;
    if (Array.isArray(payload?.safety_events)) return payload.safety_events;
    if (Array.isArray(payload?.safetyEvents)) return payload.safetyEvents;
    if (Array.isArray(payload?.events)) return payload.events;
    if (Array.isArray(payload?.driver_locations)) return payload.driver_locations;
    if (Array.isArray(payload?.vehicle_locations)) return payload.vehicle_locations;
    if (Array.isArray(payload?.asset_locations)) return payload.asset_locations;
    if (Array.isArray(payload?.dispatch_locations)) return payload.dispatch_locations;
    if (Array.isArray(payload?.vehicles)) return payload.vehicles;
    if (Array.isArray(payload?.users)) return payload.users;
    if (Array.isArray(payload?.cards)) return payload.cards;
    if (Array.isArray(payload?.fuel_cards)) return payload.fuel_cards;
    if (Array.isArray(payload?.payment_cards)) return payload.payment_cards;
    if (Array.isArray(payload?.fuel_purchases)) return payload.fuel_purchases;
    if (Array.isArray(payload?.transactions)) return payload.transactions;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  private mapDriverRow(raw: any): MotivDriverTableRow {
    const user = raw?.user ?? raw ?? {};
    const location = this.extractLocationSeed(raw) ?? raw?.current_location ?? raw?.location ?? {};
    const vehicle = raw?.current_vehicle ?? raw?.vehicle ?? {};
    const firstName = user?.first_name ?? user?.firstName ?? user?.FirstName ?? '';
    const lastName = user?.last_name ?? user?.lastName ?? user?.LastName ?? '';
    const fallbackName = user?.name ?? user?.Name ?? user?.full_name ?? user?.FullName ?? user?.username ?? user?.Username ?? 'N/A';
    const name = `${firstName} ${lastName}`.trim() || fallbackName;
    const email = user?.email ?? user?.Email ?? 'N/A';
    const phone = user?.phone ?? user?.Phone ?? user?.phone_number ?? user?.PhoneNumber ?? 'N/A';
    const status = this.resolveDriverDisplayStatus(raw, user);
    const locationText = this.buildLocationDisplayFromRaw(raw);
    const vehicleTextParts = [
      vehicle?.number ?? vehicle?.Number ?? raw?.number ?? raw?.truckNumber ?? raw?.TruckNumber ?? raw?.fleet_number ?? raw?.fleetNumber ?? raw?.unit ?? raw?.unitNumber,
      vehicle?.year ?? vehicle?.Year ?? raw?.year ?? raw?.truckYear ?? raw?.TruckYear ?? raw?.vehicle_year ?? raw?.vehicleYear,
      vehicle?.make ?? vehicle?.Make ?? raw?.make ?? raw?.truckMake ?? raw?.TruckMake ?? raw?.vehicle_make ?? raw?.vehicleMake,
      vehicle?.model ?? vehicle?.Model ?? raw?.model ?? raw?.truckModel ?? raw?.TruckModel ?? raw?.vehicle_model ?? raw?.vehicleModel
    ].filter((v: any) => !!v);
    const vehicleText = vehicleTextParts.length
      ? vehicleTextParts.join(' ')
      : (vehicle?.vin ?? vehicle?.Vin ?? raw?.vin ?? raw?.truckVin ?? raw?.TruckVin ?? raw?.vehicle_vin ?? raw?.vehicleVin ?? 'N/A');
    const lastUpdate =
      location?.located_at ??
      location?.locatedAt ??
      raw?.lastLocationUpdate ??
      raw?.LastLocationUpdate ??
      raw?.located_at ??
      raw?.locatedAt ??
      raw?.updated_at ??
      raw?.UpdatedAt ??
      raw?.updatedAt ??
      'N/A';

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

  private resolveDriverDisplayStatus(raw: any, user: any): string {
    const explicitStatus = String(
      raw?.status ??
      raw?.Status ??
      raw?.driverStatus ??
      raw?.DriverStatus ??
      raw?.employmentStatus ??
      raw?.EmploymentStatus ??
      ''
    ).trim();

    const userStatus = String(user?.status ?? user?.Status ?? '').trim();
    const resolved = explicitStatus || userStatus || 'N/A';

    const activeFlag =
      raw?.isActive ??
      raw?.IsActive ??
      raw?.active ??
      raw?.Active;
    const deletedFlag =
      raw?.isDeleted ??
      raw?.IsDeleted ??
      false;
    const deactivatedAt =
      raw?.deactivatedAt ??
      raw?.DeactivatedAt ??
      null;

    if (deletedFlag === true || activeFlag === false || !!deactivatedAt) {
      return 'deactivated';
    }

    if (this.isVehicleDeactivatedStatus(resolved)) {
      return 'deactivated';
    }

    return resolved || 'N/A';
  }

  private buildLocationDisplayFromRaw(raw: any): string {
    const location = this.extractLocationSeed(raw) ?? {};
    const city = String(
      location?.city ??
      location?.City ??
      location?.address?.city ??
      location?.address?.City ??
      raw?.city ??
      raw?.City ??
      ''
    ).trim();
    const state = String(
      location?.state ??
      location?.State ??
      location?.address?.state ??
      location?.address?.State ??
      raw?.state ??
      raw?.State ??
      ''
    ).trim();

    const cityState = city && state
      ? `${city}, ${state}`
      : (city || state || '');
    if (cityState) return cityState;

    const textLocation = String(
      location?.description ??
      location?.name ??
      location?.location_name ??
      location?.place_name ??
      location?.formatted ??
      location?.address?.formatted ??
      location?.address?.line1 ??
      location?.address?.line_1 ??
      location?.address?.street ??
      location?.address ??
      location?.formatted_address ??
      location?.address_line_1 ??
      location?.street ??
      raw?.address ??
      raw?.Address ??
      raw?.location_name ??
      raw?.place_name ??
      raw?.formatted ??
      (typeof raw?.location === 'string' ? raw.location : null) ??
      ''
    ).trim();
    if (textLocation) return textLocation;

    const lat = location?.lat ?? location?.latitude ?? location?.Latitude ?? raw?.lat ?? raw?.latitude ?? raw?.Latitude;
    const lon = location?.lon ?? location?.lng ?? location?.longitude ?? location?.Longitude ?? raw?.lon ?? raw?.lng ?? raw?.longitude ?? raw?.Longitude;
    if (lat != null && lon != null) {
      return `${lat}, ${lon}`;
    }
    return 'N/A';
  }

  private dedupeDriverRows(rows: MotivDriverTableRow[]): MotivDriverTableRow[] {
    const byKey = new Map<string, MotivDriverTableRow>();

    for (const row of rows) {
      const key = this.buildDriverDedupKey(row);
      if (!byKey.has(key)) {
        byKey.set(key, row);
        continue;
      }

      const existing = byKey.get(key)!;
      byKey.set(key, this.pickBestDriverRow(existing, row));
    }

    return Array.from(byKey.values());
  }

  private buildDriverDedupKey(row: MotivDriverTableRow): string {
    const name = String(row.name || '').trim().toLowerCase();
    if (name && name !== 'n/a') {
      return `name:${name}`;
    }

    const email = String(row.email || '').trim().toLowerCase();
    if (email && email !== 'n/a') {
      return `email:${email}`;
    }

    const phone = String(row.phone || '').trim().toLowerCase();
    return `phone:${phone}`;
  }

  private pickBestDriverRow(a: MotivDriverTableRow, b: MotivDriverTableRow): MotivDriverTableRow {
    const scoreA = this.scoreDriverRow(a);
    const scoreB = this.scoreDriverRow(b);
    const preferred = scoreB > scoreA ? b : a;
    const secondary = preferred === a ? b : a;

    // Keep the preferred base row but patch in missing fields from the secondary row.
    return {
      name: this.pickPreferredValue(preferred.name, secondary.name),
      email: this.pickPreferredValue(preferred.email, secondary.email),
      phone: this.pickPreferredValue(preferred.phone, secondary.phone),
      status: this.pickPreferredStatus(preferred.status, secondary.status),
      location: this.pickPreferredValue(preferred.location, secondary.location),
      vehicle: this.pickPreferredValue(preferred.vehicle, secondary.vehicle),
      lastUpdate: this.pickPreferredValue(preferred.lastUpdate, secondary.lastUpdate)
    };
  }

  private pickPreferredStatus(primary: string, fallback: string): string {
    const primaryNormalized = String(primary ?? '').trim().toLowerCase();
    const fallbackNormalized = String(fallback ?? '').trim().toLowerCase();

    if (this.isVehicleDeactivatedStatus(primaryNormalized) || this.isVehicleDeactivatedStatus(fallbackNormalized)) {
      return 'deactivated';
    }

    return this.pickPreferredValue(primary, fallback);
  }

  private scoreDriverRow(row: MotivDriverTableRow): number {
    let score = 0;
    if (this.hasDriverValue(row.vehicle)) score += 4;
    if (this.hasDriverValue(row.location)) score += 3;
    if (this.hasDriverValue(row.email)) score += 2;
    if (this.hasDriverValue(row.phone)) score += 1;

    if (this.isActiveLikeStatus(row.status.toLowerCase())) score += 2;
    if (this.parseDriverUpdateTime(row.lastUpdate) > 0) score += 1;

    return score;
  }

  private pickPreferredValue(primary: string, fallback: string): string {
    if (this.hasDriverValue(primary)) return primary;
    if (this.hasDriverValue(fallback)) return fallback;
    return primary || fallback || 'N/A';
  }

  private hasDriverValue(value: string): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    return !!normalized && normalized !== 'n/a' && normalized !== 'unknown';
  }

  private parseDriverUpdateTime(value: string): number {
    const parsed = this.tryParseDate(String(value || ''));
    return parsed ? parsed.getTime() : 0;
  }

  private isLatLonLocation(value: string): boolean {
    const text = String(value || '').trim();
    return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text);
  }

  private mergePreferredValue(primary: any, fallback: any): any {
    if (primary == null) return fallback;
    if (typeof primary === 'string') {
      const normalized = primary.trim().toLowerCase();
      if (!normalized || normalized === 'n/a' || normalized === 'unknown' || normalized === 'null') {
        return fallback ?? primary;
      }
    }
    return primary;
  }

  private mapVehicleRow(raw: any): MotivVehicleTableRow {
    const vehicle = raw?.vehicle ?? raw?.current_vehicle ?? raw ?? {};
    const availability = vehicle?.availability_details ?? raw?.availability_details ?? {};
    const locationSeed =
      raw?.current_location ??
      raw?.currentLocation ??
      raw?.location ??
      vehicle?.current_location ??
      vehicle?.currentLocation ??
      vehicle?.location ??
      availability?.current_location ??
      availability?.location ??
      raw?.last_known_location ??
      raw?.latest_location ??
      vehicle?.last_known_location ??
      {};
    const location = locationSeed?.current_location ?? locationSeed?.location ?? locationSeed;
    const lat = location?.lat ?? location?.latitude ?? location?.Latitude ?? raw?.lat ?? raw?.latitude ?? raw?.Latitude;
    const lon = location?.lon ?? location?.lng ?? location?.longitude ?? location?.Longitude ?? raw?.lon ?? raw?.lng ?? raw?.longitude ?? raw?.Longitude;
    const fallbackLocationText = [location?.city, location?.state].filter(Boolean).join(', ');
    const locationText = String(
      location?.description ??
      location?.name ??
      location?.address ??
      location?.formatted_address ??
      (fallbackLocationText || null) ??
      raw?.location_name ??
      (typeof raw?.location === 'string' ? raw.location : null) ??
      ((lat != null && lon != null) ? `${lat}, ${lon}` : null) ??
      'N/A'
    );
    return {
      id: String(vehicle?.id ?? raw?.id ?? raw?.vehicle_id ?? 'N/A'),
      number: String(vehicle?.number ?? vehicle?.fleet_number ?? vehicle?.fleetNumber ?? vehicle?.unit ?? vehicle?.unitNumber ?? raw?.number ?? 'N/A'),
      make: String(vehicle?.make ?? vehicle?.vehicle_make ?? vehicle?.vehicleMake ?? raw?.make ?? 'N/A'),
      model: String(vehicle?.model ?? vehicle?.vehicle_model ?? vehicle?.vehicleModel ?? raw?.model ?? 'N/A'),
      year: String(vehicle?.year ?? vehicle?.vehicle_year ?? vehicle?.vehicleYear ?? raw?.year ?? 'N/A'),
      vin: String(vehicle?.vin ?? vehicle?.vehicle_vin ?? vehicle?.vehicleVin ?? raw?.vin ?? 'N/A'),
      status: String(vehicle?.status ?? availability?.availability_status ?? raw?.status ?? raw?.state ?? 'N/A'),
      location: locationText,
      lastUpdate: String(
        location?.located_at ??
        location?.locatedAt ??
        location?.last_update ??
        location?.lastUpdate ??
        location?.timestamp ??
        vehicle?.updated_at ??
        vehicle?.updatedAt ??
        availability?.updated_at ??
        availability?.updatedAt ??
        raw?.updated_at ??
        raw?.updatedAt ??
        'N/A'
      )
    };
  }

  private mapUserRow(raw: any): MotivUserTableRow {
    const user = raw?.user ?? raw ?? {};
    const firstName = user?.first_name ?? user?.firstName ?? user?.FirstName ?? '';
    const lastName = user?.last_name ?? user?.lastName ?? user?.LastName ?? '';
    const fallbackName = user?.name ?? user?.Name ?? user?.full_name ?? user?.FullName ?? user?.username ?? user?.Username ?? 'N/A';
    const name = `${firstName} ${lastName}`.trim() || fallbackName;
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const roleLabel = roles.length
      ? roles.map((r: any) => String(r?.name ?? r ?? '').trim()).filter((x: string) => !!x).join(', ')
      : 'N/A';
    return {
      name,
      email: String(user?.email ?? user?.Email ?? 'N/A'),
      phone: String(user?.phone ?? user?.Phone ?? user?.phone_number ?? user?.PhoneNumber ?? 'N/A'),
      userType: String(user?.user_type ?? user?.userType ?? user?.type ?? 'N/A'),
      status: String(user?.status ?? user?.Status ?? 'N/A'),
      role: roleLabel
    };
  }

  private mapSafetyEventRow(raw: any): MotivSafetyEventRow {
    const event = raw?.driver_performance_event ?? raw?.event ?? raw ?? {};
    const driver = event?.driver ?? raw?.driver ?? {};
    const vehicle = event?.vehicle ?? raw?.vehicle ?? {};
    const video = event?.downloadable_videos ?? event?.media?.downloadable_videos ?? raw?.downloadable_videos ?? {};
    const eventType = this.firstText(
      event?.event_type,
      event?.type,
      event?.primary_behavior?.[0],
      event?.behaviors?.[0],
      event?.coachable_behaviors?.[0]
    ) || 'N/A';
    const severity = this.firstText(
      event?.severity,
      event?.priority,
      event?.risk_level,
      event?.intensity
    ) || 'N/A';
    const status = this.firstText(
      event?.coaching_status,
      event?.status,
      event?.state
    ) || 'N/A';
    const eventAtRaw = this.firstText(
      event?.event_time,
      event?.event_at,
      event?.occurred_at,
      event?.created_at,
      event?.timestamp
    );
    const eventAt = this.formatSafetyTimestamp(eventAtRaw);

    const driverName = this.firstText(
      `${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim(),
      driver?.name,
      event?.driver_name,
      event?.driver_id
    ) || 'N/A';
    const vehicleLabel = this.firstText(
      vehicle?.number,
      vehicle?.unit_number,
      vehicle?.fleet_number,
      event?.vehicle_number,
      event?.vehicle_id
    ) || 'N/A';
    const location = this.firstText(
      event?.location,
      event?.city && event?.state ? `${event.city}, ${event.state}` : '',
      event?.address,
      event?.place_name
    ) || 'N/A';

    const videoUrl = this.firstText(
      video?.dual_facing_enhanced_ai_url,
      video?.dual_facing_plain_url,
      video?.front_facing_plain_url,
      video?.driver_facing_plain_url,
      event?.video_url,
      raw?.video_url
    ) || '';

    const hasVideo = !!videoUrl || !!event?.downloadable_videos || !!event?.media;

    return {
      eventId: this.firstText(event?.id, event?.event_id, event?.uuid) || 'N/A',
      eventAt,
      eventType: String(eventType),
      severity: String(severity),
      driver: String(driverName),
      vehicle: String(vehicleLabel),
      location: String(location),
      status: String(status),
      hasVideo,
      videoUrl
    };
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

  private formatSafetyTimestamp(value: string): string {
    if (!value) return 'N/A';
    const parsed = this.tryParseDate(value);
    if (!parsed) return value;
    return parsed.toLocaleString();
  }

  private isDriverUser(raw: any): boolean {
    const user = raw?.user ?? raw ?? {};
    const typeValue = String(
      user?.user_type ??
      user?.userType ??
      user?.type ??
      user?.role ??
      ''
    ).trim().toLowerCase();
    if (typeValue) return typeValue === 'driver' || typeValue === 'drivers';

    if (typeof user?.is_driver === 'boolean') return user.is_driver;
    if (typeof user?.isDriver === 'boolean') return user.isDriver;

    const roles = Array.isArray(user?.roles) ? user.roles : [];
    return roles.some((r: any) => {
      const roleName = String(r?.name ?? r ?? '').trim().toLowerCase();
      return roleName === 'driver' || roleName === 'drivers';
    });
  }

  private isMotivDriverRow(raw: any): boolean {
    // Keep explicit driver rows from MOTIV payloads.
    if (this.isDriverUser(raw)) return true;

    // Keep Access DB rows typed as drivers.
    const driverType = String(raw?.driverType ?? raw?.DriverType ?? '').toLowerCase();
    if (driverType === 'driver' || driverType === 'drivers') return true;

    return false;
  }

  private mapFuelRow(raw: any): MotivFuelRow {
    const fuel = raw?.fuel_purchase ?? raw ?? {};
    const merchant = fuel?.merchant_info ?? fuel?.merchant ?? {};
    const vehicle = fuel?.vehicle ?? {};
    const driver = fuel?.driver ?? {};
    const amountRaw = fuel?.total_cost ?? fuel?.total_amount ?? fuel?.authorized_amount ?? fuel?.amount ?? 0;
    const amountNum = Number(amountRaw);
    const date = fuel?.purchased_at ?? fuel?.transaction_time ?? fuel?.posted_at ?? fuel?.created_at ?? 'N/A';
    const driverLabel = [
      driver?.first_name ?? driver?.firstName,
      driver?.last_name ?? driver?.lastName
    ].filter((x: any) => !!x).join(' ').trim();
    const vehicleLabel = vehicle?.number ?? vehicle?.unitNumber ?? vehicle?.fleet_number;
    const cardMeta = this.extractFuelCardMeta(raw, fuel);

    return {
      transactionId: String(fuel?.id ?? fuel?.transaction_id ?? fuel?.offline_id ?? 'N/A'),
      date,
      status: String(fuel?.transaction_status ?? fuel?.status ?? fuel?.approval_status ?? 'N/A'),
      amount: Number.isFinite(amountNum) ? amountNum.toFixed(2) : '0.00',
      amountValue: Number.isFinite(amountNum) ? amountNum : 0,
      currency: String(fuel?.currency ?? 'USD'),
      merchant: String(fuel?.vendor ?? merchant?.name ?? fuel?.merchant_name ?? 'N/A'),
      city: String(merchant?.city ?? fuel?.city ?? (fuel?.location ?? '').split(',')[1]?.trim() ?? 'N/A'),
      state: String(fuel?.jurisdiction ?? merchant?.state ?? fuel?.state ?? 'N/A'),
      driverId: String(driverLabel || driver?.driver_company_id || driver?.id || fuel?.driver_id || 'N/A'),
      vehicleId: String(vehicleLabel || vehicle?.id || fuel?.vehicle_id || 'N/A'),
      cardId: cardMeta.cardId,
      cardLabel: cardMeta.cardLabel,
      category: String(fuel?.fuel_type ?? fuel?.transaction_type ?? fuel?.type ?? 'N/A'),
      source: String(fuel?.source ?? 'N/A')
    };
  }

  private mapFuelCardRow(raw: any): MotivFuelCardRow {
    const card = raw?.card ?? raw?.fuel_card ?? raw?.payment_card ?? raw?.motive_card ?? raw ?? {};
    const limits = card?.limits ?? card?.spend_limits ?? raw?.limits ?? raw?.spend_limits ?? {};
    const stats = card?.stats ?? card?.usage ?? card?.metrics ?? raw?.stats ?? raw?.usage ?? raw?.metrics ?? {};
    const cardId = String(
      card?.id ??
      card?.card_id ??
      card?.cardId ??
      card?.external_id ??
      card?.uuid ??
      raw?.id ??
      raw?.card_id ??
      raw?.cardId ??
      raw?.external_id ??
      raw?.uuid ??
      'N/A'
    ).trim() || 'N/A';
    const last4 = this.parseCardLast4(
      card?.last_four ??
      card?.last4 ??
      card?.last_digits ??
      card?.number_last4 ??
      card?.pan_last4 ??
      card?.masked_card_number ??
      card?.card_number ??
      card?.masked_pan ??
      raw?.last_four ??
      raw?.last4 ??
      raw?.last_digits ??
      raw?.number_last4 ??
      raw?.pan_last4 ??
      raw?.masked_card_number ??
      raw?.card_number ??
      raw?.masked_pan
    );
    const label = String(
      card?.name ??
      card?.card_name ??
      card?.nickname ??
      card?.display_name ??
      card?.holder_name ??
      raw?.name ??
      raw?.card_name ??
      raw?.nickname ??
      raw?.display_name ??
      raw?.holder_name ??
      (last4 ? `**** ${last4}` : (cardId !== 'N/A' ? `Card ${cardId}` : 'N/A'))
    ).trim() || 'N/A';
    const status = String(card?.status ?? card?.state ?? raw?.status ?? raw?.state ?? 'N/A').trim() || 'N/A';
    const type = String(card?.type ?? card?.card_type ?? card?.product_type ?? raw?.type ?? raw?.card_type ?? raw?.product_type ?? 'N/A').trim() || 'N/A';
    const limitValue = Number(
      limits?.daily ??
      limits?.total ??
      limits?.overall ??
      card?.spend_limit ??
      card?.credit_limit ??
      card?.limit ??
      card?.amount_limit ??
      card?.spending_limit ??
      raw?.amount_limit ??
      raw?.spending_limit ??
      raw?.spend_limit ??
      raw?.credit_limit ??
      raw?.limit ??
      0
    );
    const currency = String(
      card?.currency ??
      limits?.currency ??
      raw?.currency ??
      raw?.limit_currency ??
      'USD'
    ).trim() || 'USD';
    const normalizedKeys = [
      this.normalizeFuelCardKey(cardId),
      this.normalizeFuelCardKey(label),
      this.normalizeFuelCardKey(last4)
    ].filter((x): x is string => !!x);
    let purchases = Number(
      stats?.purchases ??
      stats?.purchase_count ??
      stats?.transactions ??
      stats?.transaction_count ??
      card?.purchase_count ??
      card?.transactions_count ??
      card?.transaction_count ??
      raw?.purchase_count ??
      raw?.transactions_count ??
      raw?.transaction_count ??
      0
    );
    if (!Number.isFinite(purchases) || purchases < 0) purchases = 0;
    let spend = Number(
      stats?.spend ??
      stats?.total_spend ??
      stats?.amount_spent ??
      card?.spend ??
      card?.spent_amount ??
      card?.amount_spent ??
      card?.total_spend ??
      card?.lifetime_spend ??
      raw?.spend ??
      raw?.spent_amount ??
      raw?.amount_spent ??
      raw?.total_spend ??
      raw?.lifetime_spend ??
      0
    );
    if (!Number.isFinite(spend) || spend < 0) spend = 0;
    const spendIndex = this.fuelCardSpendIndex();
    for (const key of normalizedKeys) {
      const found = spendIndex.get(key);
      if (!found) continue;
      purchases = Math.max(purchases, found.purchases);
      spend = Math.max(spend, found.spend);
    }

    return {
      id: cardId,
      label,
      last4: last4 || 'N/A',
      status,
      type,
      limit: Number.isFinite(limitValue) ? limitValue.toFixed(2) : '0.00',
      currency,
      purchases,
      spend
    };
  }

  private extractFuelCardMeta(raw: any, fuel: any): { cardId: string; cardLabel: string } {
    const cardObjects = [
      fuel?.card,
      fuel?.payment_card,
      fuel?.motive_card,
      fuel?.fuel_card,
      fuel?.card_details,
      fuel?.cardInfo,
      fuel?.payment_method,
      raw?.card,
      raw?.payment_card,
      raw?.motive_card,
      raw?.fuel_card,
      raw?.card_details,
      raw?.cardInfo,
      raw?.payment_method
    ].filter((x: any) => !!x);

    const cardIdRaw =
      cardObjects.find((x: any) => x?.id)?.id ??
      cardObjects.find((x: any) => x?.card_id)?.card_id ??
      cardObjects.find((x: any) => x?.cardId)?.cardId ??
      cardObjects.find((x: any) => x?.external_id)?.external_id ??
      cardObjects.find((x: any) => x?.uuid)?.uuid ??
      fuel?.card_id ??
      fuel?.cardId ??
      fuel?.payment_method_id ??
      fuel?.payment_card_id ??
      fuel?.motive_card_id ??
      fuel?.fuel_card_id ??
      fuel?.card_uuid ??
      raw?.card_id ??
      raw?.cardId ??
      raw?.payment_method_id ??
      raw?.payment_card_id ??
      raw?.motive_card_id ??
      raw?.fuel_card_id ??
      raw?.card_uuid;

    const explicitNameRaw =
      cardObjects.find((x: any) => x?.name)?.name ??
      cardObjects.find((x: any) => x?.display_name)?.display_name ??
      cardObjects.find((x: any) => x?.holder_name)?.holder_name ??
      fuel?.card_name ??
      fuel?.cardName ??
      fuel?.payment_method_name ??
      fuel?.card_program_name ??
      raw?.card_name ??
      raw?.cardName ??
      raw?.payment_method_name ??
      raw?.card_program_name;

    const last4Raw =
      cardObjects.find((x: any) => x?.last_four)?.last_four ??
      cardObjects.find((x: any) => x?.last4)?.last4 ??
      cardObjects.find((x: any) => x?.last_digits)?.last_digits ??
      cardObjects.find((x: any) => x?.number_last4)?.number_last4 ??
      cardObjects.find((x: any) => x?.pan_last4)?.pan_last4 ??
      fuel?.card_last_four ??
      fuel?.card_last4 ??
      fuel?.cardLast4 ??
      fuel?.pan_last4 ??
      fuel?.number_last4 ??
      fuel?.last4 ??
      raw?.card_last_four ??
      raw?.card_last4 ??
      raw?.cardLast4 ??
      raw?.pan_last4 ??
      raw?.number_last4 ??
      raw?.last4 ??
      fuel?.card_number ??
      fuel?.masked_card_number ??
      raw?.card_number ??
      raw?.masked_card_number;

    const cardId = String(cardIdRaw ?? '').trim() || 'N/A';
    const explicitName = String(explicitNameRaw ?? '').trim();
    const parsedLast4 = this.parseCardLast4(last4Raw);
    const cardLabel = explicitName || (parsedLast4 ? `**** ${parsedLast4}` : (cardId !== 'N/A' ? `Card ${cardId}` : 'N/A'));

    return { cardId, cardLabel };
  }

  private parseCardLast4(value: any): string {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
    return '';
  }

  private normalizeFuelCardKey(value: any): string {
    const text = String(value ?? '').trim().toLowerCase();
    if (!text || text === 'n/a') return '';
    return text
      .replace(/^card\s+/i, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private isFuelCardActiveStatus(status: string): boolean {
    const normalized = String(status ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-');
    return normalized === 'active' || normalized === 'enabled' || normalized === 'open' || normalized === 'issued';
  }

  private isFuelCardInactiveStatus(status: string): boolean {
    const normalized = String(status ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-');
    return normalized === 'inactive' || normalized === 'disabled' || normalized === 'closed' || normalized === 'blocked' || normalized === 'deactivated' || normalized === 'suspended';
  }

  private tryParseDate(value: string): Date | null {
    if (!value || value === 'N/A') return null;
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  private extractCardTransactionDate(tx: any, raw: any): string {
    return String(
      tx?.purchased_at ??
      tx?.transaction_time ??
      tx?.posted_at ??
      tx?.processed_at ??
      tx?.occurred_at ??
      tx?.created_at ??
      tx?.date ??
      raw?.purchased_at ??
      raw?.transaction_time ??
      raw?.posted_at ??
      raw?.processed_at ??
      raw?.occurred_at ??
      raw?.created_at ??
      raw?.date ??
      'N/A'
    );
  }

  private getIsoWeekInfo(date: Date): { year: number; week: number; key: string } {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    const year = d.getUTCFullYear();
    return { year, week, key: `${year}-W${String(week).padStart(2, '0')}` };
  }

  private formatShortDate(date: Date): string {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getFuelWeekLabel(value: string): string {
    const dt = this.tryParseDate(value);
    if (!dt) return 'N/A';
    const info = this.getIsoWeekInfo(dt);
    return `W${String(info.week).padStart(2, '0')}`;
  }

  private getFuelWeekSortKey(value: string): string {
    const dt = this.tryParseDate(value);
    if (!dt) return '';
    return this.getIsoWeekInfo(dt).key;
  }

  private classifyFuelCharge(row: MotivFuelRow): 'fuel' | 'other' | 'unknown' {
    const category = String(row.category ?? '').trim().toLowerCase();
    const merchant = String(row.merchant ?? '').trim().toLowerCase();
    const source = String(row.source ?? '').trim().toLowerCase();

    if (!category || category === 'n/a' || category === 'unknown' || category === 'other') {
      if (merchant.includes('fuel') || merchant.includes('diesel') || merchant.includes('truck stop')) {
        return 'fuel';
      }
      if (source === 'access-db' || source === 'motive-card' || source === 'motive card') {
        return 'unknown';
      }
      return 'unknown';
    }

    if (
      category.includes('diesel')
      || category.includes('gas')
      || category.includes('fuel')
      || category.includes('def')
    ) {
      return 'fuel';
    }

    return 'other';
  }

  private resolveFuelReportDriverName(raw: any): string {
    const first = String(raw?.firstName ?? raw?.FirstName ?? raw?.first_name ?? '').trim();
    const last = String(raw?.lastName ?? raw?.LastName ?? raw?.last_name ?? '').trim();
    const full = `${first} ${last}`.trim();
    if (full) return full;
    return String(raw?.name ?? raw?.Name ?? raw?.full_name ?? raw?.FullName ?? raw?.email ?? raw?.Email ?? 'Unknown Driver').trim();
  }

  private normalizeFuelReportKey(value: any): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private async openFuelReportPdf(
    filename: string,
    rows: Array<{
      name: string;
      driverId: string;
      transactions: number;
      total: number;
      fuel: number;
      other: number;
      unknown: number;
      cards: Set<string>;
    }>,
    transactionRows: MotivFuelRow[],
    context: {
      filteredCount: number;
      activeMatchedCount: number;
      scope: 'active-matched' | 'filtered-fallback';
      activeDriverCount: number;
    }
  ): Promise<void> {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'letter'
    });

    const left = 32;
    const top = 36;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottom = pageHeight - 28;
    const totalAmount = transactionRows.reduce((sum, row) => sum + (Number.isFinite(row.amountValue) ? row.amountValue : 0), 0);
    const fuelAmount = transactionRows.reduce((sum, row) => sum + (this.classifyFuelCharge(row) === 'fuel' ? row.amountValue : 0), 0);
    const otherAmount = transactionRows.reduce((sum, row) => sum + (this.classifyFuelCharge(row) === 'other' ? row.amountValue : 0), 0);
    const unknownAmount = transactionRows.reduce((sum, row) => sum + (this.classifyFuelCharge(row) === 'unknown' ? row.amountValue : 0), 0);
    const uniqueDrivers = new Set(transactionRows.map((row) => this.normalizeFuelReportKey(row.driverId)).filter((x) => !!x)).size;
    const uniqueVehicles = new Set(transactionRows.map((row) => this.normalizeFuelReportKey(row.vehicleId)).filter((x) => !!x)).size;
    const uniqueCards = new Set(transactionRows.map((row) => this.normalizeFuelCardKey(row.cardLabel || row.cardId)).filter((x) => !!x)).size;

    let y = top;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Fuel Statement Report', left, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
    y += 12;
    doc.text(`Week filter: ${this.fuelWeekFilter() || 'All'} | Year filter: ${this.fuelYearFilter() || 'All'}`, left, y);
    y += 12;
    const scopeLabel = context.scope === 'active-matched'
      ? `Active-only transactions (${context.activeMatchedCount} matched from ${context.filteredCount} filtered, active drivers loaded: ${context.activeDriverCount})`
      : `Fallback to all filtered transactions (${context.filteredCount}) because active-driver matching found none`;
    doc.text(`Scope: ${scopeLabel}`, left, y);
    y += 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Summary', left, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Transactions: ${transactionRows.length.toLocaleString()}`, left, y);
    doc.text(`Total: ${this.formatPdfCurrency(totalAmount)}`, left + 180, y);
    doc.text(`Fuel: ${this.formatPdfCurrency(fuelAmount)}`, left + 320, y);
    doc.text(`Other: ${this.formatPdfCurrency(otherAmount)}`, left + 450, y);
    doc.text(`Unknown: ${this.formatPdfCurrency(unknownAmount)}`, left + 580, y);
    y += 12;
    doc.text(`Unique Drivers: ${uniqueDrivers.toLocaleString()}`, left, y);
    doc.text(`Unique Vehicles: ${uniqueVehicles.toLocaleString()}`, left + 180, y);
    doc.text(`Cards Used: ${uniqueCards.toLocaleString()}`, left + 320, y);
    y += 18;

    const ensureSpace = (neededHeight: number): void => {
      if (y + neededHeight > bottom) {
        doc.addPage();
        y = top;
      }
    };

    const driverColumns = [
      { label: 'Driver', width: 150 },
      { label: 'Driver ID', width: 80 },
      { label: 'Txns', width: 40, align: 'right' as const },
      { label: 'Total', width: 64, align: 'right' as const },
      { label: 'Fuel', width: 64, align: 'right' as const },
      { label: 'Other', width: 64, align: 'right' as const },
      { label: 'Unknown', width: 64, align: 'right' as const },
      { label: 'Cards', width: 40, align: 'right' as const },
      { label: 'Card Labels', width: 162 }
    ];
    const transactionColumns = [
      { label: 'Date', width: 64 },
      { label: 'Driver', width: 110 },
      { label: 'Txn ID', width: 72 },
      { label: 'Merchant', width: 110 },
      { label: 'Location', width: 76 },
      { label: 'Vehicle', width: 64 },
      { label: 'Card', width: 80 },
      { label: 'Category', width: 50 },
      { label: 'Status', width: 44 },
      { label: 'Amount', width: 58, align: 'right' as const }
    ];

    const drawColumnsHeader = (columns: Array<{ label: string; width: number; align?: 'right' }>): void => {
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      let x = left;
      for (const col of columns) {
        doc.text(col.label, x, y);
        x += col.width;
      }
      y += 12;
      doc.setDrawColor(170, 170, 170);
      doc.line(left, y - 8, pageWidth - left, y - 8);
      doc.setFont('courier', 'normal');
      doc.setFontSize(8.5);
    };

    const drawWrappedRow = (columns: Array<{ width: number; align?: 'right' }>, values: string[]): void => {
      const wrapped = columns.map((col, idx) => {
        const text = String(values[idx] ?? '');
        const parts = doc.splitTextToSize(text, Math.max(8, col.width - 4));
        return (parts.length ? parts : ['']) as string[];
      });
      const lineCount = wrapped.reduce((max, parts) => Math.max(max, parts.length), 1);
      ensureSpace(lineCount * 11 + 4);
      for (let line = 0; line < lineCount; line += 1) {
        let x = left;
        for (let i = 0; i < columns.length; i += 1) {
          const col = columns[i];
          const text = wrapped[i][line] ?? '';
          if (col.align === 'right') {
            doc.text(text, x + col.width - 2, y, { align: 'right' });
          } else {
            doc.text(text, x, y);
          }
          x += col.width;
        }
        y += 11;
      }
      y += 2;
    };

    ensureSpace(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Driver Summary Totals', left, y);
    y += 12;
    drawColumnsHeader(driverColumns);
    for (const row of rows) {
      const cardsText = Array.from(row.cards).sort((a, b) => a.localeCompare(b)).join(' | ') || 'N/A';
      drawWrappedRow(driverColumns, [
        row.name || 'N/A',
        row.driverId || 'N/A',
        String(row.transactions),
        this.formatPdfCurrency(row.total),
        this.formatPdfCurrency(row.fuel),
        this.formatPdfCurrency(row.other),
        this.formatPdfCurrency(row.unknown),
        String(row.cards.size),
        cardsText
      ]);
    }

    ensureSpace(36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Individual Transactions', left, y);
    y += 12;
    drawColumnsHeader(transactionColumns);
    for (const row of transactionRows) {
      const location = [row.city, row.state].filter((v) => !!v && String(v).trim() !== 'N/A').join(', ') || 'N/A';
      drawWrappedRow(transactionColumns, [
        this.formatPdfDate(row.date),
        String(row.driverId || 'N/A'),
        String(row.transactionId || 'N/A'),
        String(row.merchant || 'N/A'),
        location,
        String(row.vehicleId || 'N/A'),
        String(row.cardLabel || row.cardId || 'N/A'),
        String(row.category || 'N/A'),
        String(row.status || 'N/A'),
        this.formatPdfCurrency(Number.isFinite(row.amountValue) ? row.amountValue : 0)
      ]);
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) {
      await this.saveBlobFile(filename, blob, 'application/pdf', ['.pdf']);
      URL.revokeObjectURL(url);
      return;
    }

    // Keep the object URL alive long enough for browser PDF viewers to initialize.
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  private formatPdfCurrency(amount: number): string {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return safeAmount.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  }

  private formatPdfDate(value: string): string {
    const parsed = this.tryParseDate(value);
    if (!parsed) return 'N/A';
    return `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
  }

  private async saveBlobFile(filename: string, blob: Blob, mimeType: string, extensions: string[]): Promise<void> {
    const picker = (window as any)?.showSaveFilePicker;
    if (typeof picker === 'function') {
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: mimeType === 'application/pdf' ? 'PDF file' : 'File',
            accept: { [mimeType]: extensions }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private setApiStatus(route: string, status: 'connected' | 'not-connected'): void {
    this.availableApis.update(rows =>
      rows.map(row => row.route === route ? { ...row, status } : row)
    );
    this.persistMotivStatusCache();
  }

  private setPhase2Status(path: string, method: 'GET' | 'OPTIONS', status: 'connected' | 'not-connected'): void {
    this.phase2Apis.update(rows =>
      rows.map(row => row.path === path && row.method === method ? { ...row, status } : row)
    );
    this.persistMotivStatusCache();
  }

  private loadStrictMode(): void {
    try {
      const raw = localStorage.getItem(this.strictModeStorageKey);
      this.strictMode405.set(raw === '1');
    } catch {
      this.strictMode405.set(false);
    }
  }

  private restoreMotivStatusCache(): boolean {
    try {
      const raw = localStorage.getItem(this.motivStatusCacheKey);
      if (!raw) return false;

      const parsed = JSON.parse(raw) as MotivStatusCache;
      if (!parsed || typeof parsed.timestamp !== 'number') return false;
      if (typeof this.motivStatusCacheMaxAgeMs === 'number' &&
        this.motivStatusCacheMaxAgeMs > 0 &&
        (Date.now() - parsed.timestamp) > this.motivStatusCacheMaxAgeMs) {
        return false;
      }

      if (Array.isArray(parsed.availableApis) && parsed.availableApis.length > 0) {
        const cachedByRoute = new Map(parsed.availableApis.map((row) => [row.route, row.status] as const));
        const mergedAvailable = this.createApiRows().map((row) => ({
          ...row,
          status: cachedByRoute.get(row.route) ?? row.status
        }));
        this.availableApis.set(mergedAvailable);
      }
      if (Array.isArray(parsed.phase2Apis) && parsed.phase2Apis.length > 0) {
        const cachedByKey = new Map(parsed.phase2Apis.map((row) => [`${row.method}:${row.path}`, row.status] as const));
        const mergedPhase2 = this.createPhase2Rows().map((row) => ({
          ...row,
          status: cachedByKey.get(`${row.method}:${row.path}`) ?? row.status
        }));
        this.phase2Apis.set(mergedPhase2);
      }
      this.apiConfig.set(parsed.apiConfig ?? null);
      return true;
    } catch {
      return false;
    }
  }

  private persistMotivStatusCache(): void {
    try {
      const snapshot: MotivStatusCache = {
        timestamp: Date.now(),
        apiConfig: this.apiConfig(),
        availableApis: this.availableApis(),
        phase2Apis: this.phase2Apis()
      };
      localStorage.setItem(this.motivStatusCacheKey, JSON.stringify(snapshot));
    } catch {
      // Ignore storage failures; status still updates in-memory.
    }
  }

  private mapProbeResultToStatus(res: any, method: 'GET' | 'OPTIONS' = 'GET'): 'connected' | 'not-connected' {
    const status = Number(res?.status ?? 0);
    // Strict 405 mode is useful for GET capability checks but too noisy for write OPTIONS probes.
    if (method !== 'OPTIONS' && this.strictMode405() && status === 405) {
      return 'not-connected';
    }
    return !!res?.connected ? 'connected' : 'not-connected';
  }

  private getDriverStatusRank(status: string): number {
    const normalized = (status ?? '').trim().toLowerCase();
    if (this.isActiveLikeStatus(normalized)) return 0;
    if (normalized === 'deactivated') return 1;
    return 2;
  }

  private isActiveLikeStatus(status: string): boolean {
    const normalized = (status ?? '').trim().toLowerCase();
    return normalized === 'active' || normalized === 'available' || normalized === 'online' || normalized === 'in_service';
  }

  private isVehicleDeactivatedStatus(status: string): boolean {
    const normalized = (status ?? '').trim().toLowerCase();
    return normalized === 'deactivated' || normalized === 'inactive' || normalized === 'disabled' || normalized === 'off_duty';
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
      { name: 'MOTIV Fuel Cards', route: '/api/v1/motiv/fuel-cards', status: 'checking' },
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
        path: '/v1/assets/1/locate',
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
