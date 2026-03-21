import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { timeout } from 'rxjs/operators';

type MotivTab = 'api' | 'drivers' | 'vehicles' | 'users' | 'fuel' | 'fuel-cards';
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
type FuelWeekOption = {
  key: string;
  label: string;
  year: number;
  week: number;
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
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'fuel-cards'"
          (click)="setTab('fuel-cards')">
          6. Fuel Cards
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
                  <th>Transaction</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Merchant</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Card</th>
                  <th>Category</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of pagedFuelRows(); let i = index">
                  <td>{{ fuelPageStartIndex() + i }}</td>
                  <td>{{ row.transactionId }}</td>
                  <td>{{ row.date }}</td>
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
  loadingFuelCards = signal(false);
  savingDrivers = signal(false);
  syncingDrivers = signal(false);
  loadingFuel = signal(false);
  savingFuel = signal(false);
  driversError = signal('');
  vehiclesError = signal('');
  vehicleLocationSyncMessage = signal('');
  usersError = signal('');
  fuelError = signal('');
  fuelCardsError = signal('');
  saveDriversMessage = signal('');
  saveDriversError = signal('');
  syncStatusMessage = signal('Ready.');
  lastDriverSyncSummary = signal<DriverSyncSummary | null>(null);
  saveFuelMessage = signal('');
  saveFuelError = signal('');
  motivDrivers = signal<any[]>([]);
  motivVehicles = signal<any[]>([]);
  motivUsers = signal<any[]>([]);
  motivFuelPurchases = signal<any[]>([]);
  motivFuelCards = signal<any[]>([]);
  motivCardTransactions = signal<any[]>([]);
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
  fuelYearFilter = signal<string>('all');
  fuelWeekFilter = signal<string>('all');
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
    this.fuelRows().reduce((sum, row) => sum + (Number.isFinite(row.amountValue) ? row.amountValue : 0), 0)
  );
  fuelUniqueDriversCount = computed<number>(() =>
    new Set(
      this.fuelRows()
        .map(x => x.driverId)
        .filter(x => !!x && x.toLowerCase() !== 'n/a')
    ).size
  );
  fuelUniqueVehiclesCount = computed<number>(() =>
    new Set(
      this.fuelRows()
        .map(x => x.vehicleId)
        .filter(x => !!x && x.toLowerCase() !== 'n/a')
    ).size
  );
  fuelUniqueCardsCount = computed<number>(() =>
    new Set(
      this.fuelRows()
        .map(x => x.cardId)
        .filter(x => !!x && x.toLowerCase() !== 'n/a')
    ).size
  );
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
    return Array.from(weekMap.values()).sort((a, b) => b.key.localeCompare(a.key));
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
    return this.filteredFuelRows().slice(start, start + size);
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
        // Mirror the Drivers page "Active" panel semantics in MOTIV.
        const activeDriverRows = rows.filter((row: any) =>
          this.isActiveLikeStatus(this.mapDriverRow(row).status)
        );
        this.motivDrivers.set(activeDriverRows);
        this.loadedDriverRows.set(activeDriverRows.length);
        this.loadingDrivers.set(false);
        this.syncStatusMessage.set(`Loaded ${activeDriverRows.length} active driver rows from Drivers DB.`);
        if (runBackgroundSync) {
          this.autoSyncDriversToDb();
        }
      },
      error: (err) => {
        this.driversError.set(err?.error?.error || 'Unable to load MOTIV drivers.');
        this.loadingDrivers.set(false);
        this.syncStatusMessage.set('Unable to load drivers from Access DB.');
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
        this.loadDriversFromDb(false);
      },
      error: (err) => {
        this.syncingDrivers.set(false);
        this.saveDriversError.set(err?.error?.error || 'Auto-sync failed.');
        this.syncStatusMessage.set('Auto-sync failed.');
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
        this.loadDriversFromDb(false);
      },
      error: (err) => {
        this.savingDrivers.set(false);
        this.saveDriversError.set(err?.error?.error || 'Unable to save MOTIV drivers to Access DB.');
        this.syncStatusMessage.set('Manual sync failed.');
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
      return {
        rows: this.extractRows(payload),
        attempted: Array.isArray(payload?.attempted) ? payload.attempted : [],
        sourcePath: typeof payload?.sourcePath === 'string' ? payload.sourcePath : null
      };
    } catch {
      return { rows: [], attempted: [], sourcePath: null };
    }
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
        normalized?.id ??
        normalized?.vehicle_id ??
        row?.vehicle_id ??
        row?.vehicleId ??
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

  private extractRows(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.driver_locations)) return payload.driver_locations;
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
    const location = raw?.current_location ?? raw?.location ?? {};
    const vehicle = raw?.current_vehicle ?? raw?.vehicle ?? {};
    const firstName = user?.first_name ?? user?.firstName ?? user?.FirstName ?? '';
    const lastName = user?.last_name ?? user?.lastName ?? user?.LastName ?? '';
    const fallbackName = user?.name ?? user?.Name ?? user?.full_name ?? user?.FullName ?? user?.username ?? user?.Username ?? 'N/A';
    const name = `${firstName} ${lastName}`.trim() || fallbackName;
    const email = user?.email ?? user?.Email ?? 'N/A';
    const phone = user?.phone ?? user?.Phone ?? user?.phone_number ?? user?.PhoneNumber ?? 'N/A';
    const status = user?.status ?? user?.Status ?? 'N/A';
    const lat = location?.lat ?? location?.latitude ?? location?.Latitude ?? raw?.lat ?? raw?.latitude ?? raw?.Latitude;
    const lon = location?.lon ?? location?.longitude ?? location?.Longitude ?? raw?.lon ?? raw?.lng ?? raw?.longitude ?? raw?.Longitude;
    const locationText = lat != null && lon != null ? `${lat}, ${lon}` : (location?.description ?? 'N/A');
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
    const locationText =
      lat != null && lon != null
        ? `${lat}, ${lon}`
        : String(
          location?.description ??
          location?.name ??
          location?.address ??
          location?.formatted_address ??
          (fallbackLocationText || null) ??
          raw?.location_name ??
          (typeof raw?.location === 'string' ? raw.location : null) ??
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
