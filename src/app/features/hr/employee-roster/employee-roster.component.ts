import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-employee-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="roster-page">
      <div class="page-header">
        <div>
          <h1><i class="bx bx-id-card"></i> Employee Roster</h1>
          <p>Complete employee directory with entity assignments</p>
        </div>
        <div class="header-actions">
          <button class="btn-secondary" (click)="refreshRoster()" [disabled]="loading()">
            <i class="bx bx-refresh"></i> Refresh
          </button>
          <button class="btn-satellite" (click)="router.navigate(['/satellites'])">
            <i class="bx bx-building"></i> Create Satellite
          </button>
          <button class="btn-primary" (click)="openAddModal()">
            <i class="bx bx-plus"></i> Add Employee
          </button>
        </div>
      </div>

      <!-- Summary Stats -->
      @if (rosterTab() !== 'import') {
      <div class="stats-grid">
        <div class="stat-card total">
          <i class="bx bx-group"></i>
          <div>
            <span class="value">{{ employees().length }}</span>
            <span class="label">Total Employees</span>
          </div>
        </div>
        <div class="stat-card active">
          <i class="bx bx-user-check"></i>
          <div>
            <span class="value">{{ getStatusCount('active') }}</span>
            <span class="label">Active</span>
          </div>
        </div>
        <div class="stat-card inactive">
          <i class="bx bx-user-x"></i>
          <div>
            <span class="value">{{ getStatusCount('inactive') }}</span>
            <span class="label">Inactive</span>
          </div>
        </div>
        <div class="stat-card pending">
          <i class="bx bx-time-five"></i>
          <div>
            <span class="value">{{ getStatusCount('pending') }}</span>
            <span class="label">Pending</span>
          </div>
        </div>
        <div class="stat-card suspended">
          <i class="bx bx-block"></i>
          <div>
            <span class="value">{{ getStatusCount('suspended') }}</span>
            <span class="label">Suspended</span>
          </div>
        </div>
        <div class="stat-card archived">
          <i class="bx bx-archive"></i>
          <div>
            <span class="value">{{ getStatusCount('archived') }}</span>
            <span class="label">Archived</span>
          </div>
        </div>
        <div class="stat-card bulk" (click)="rosterTab.set('bulk'); rosterPage.set(1)" style="cursor: pointer">
          <i class="bx bx-table"></i>
          <div>
            <span class="value">{{ bulkEmployees().length }}</span>
            <span class="label">Bulk Staging</span>
          </div>
        </div>
      </div>

      }

      <!-- Filters -->
      @if (rosterTab() !== 'import' && rosterTab() !== 'bulk') {
      <div class="filters-bar">
        <input type="text" [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event); rosterPage.set(1)" placeholder="Search employees..." class="search-input">
        
        <select [(ngModel)]="statusFilter" (ngModelChange)="loadRoster()" class="filter-select">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        
        <select [(ngModel)]="entityFilter" (ngModelChange)="loadRoster()" class="filter-select">
          <option value="">All Organizations</option>
          <option *ngFor="let org of organizations()" [value]="org.id">{{ org.name }}</option>
        </select>
      </div>
      }

      <!-- Tabs -->
      <div class="roster-tabs">
        <button class="roster-tab" [class.active]="rosterTab() === 'live'" (click)="rosterTab.set('live'); rosterPage.set(1)">
          <i class="bx bx-user-check"></i> Active
          <span class="tab-count">{{ liveEmployees().length }}</span>
        </button>
        <button class="roster-tab" [class.active]="rosterTab() === 'deactivated'" (click)="rosterTab.set('deactivated'); rosterPage.set(1)">
          <i class="bx bx-user-x"></i> Deactivated
          <span class="tab-count">{{ deactivatedEmployees().length }}</span>
        </button>
        <button class="roster-tab" [class.active]="rosterTab() === 'archived'" (click)="rosterTab.set('archived'); rosterPage.set(1)">
          <i class="bx bx-archive"></i> Archived
          <span class="tab-count">{{ archivedEmployees().length }}</span>
        </button>
        <button class="roster-tab" [class.active]="rosterTab() === 'bulk'" (click)="rosterTab.set('bulk'); rosterPage.set(1)">
          <i class="bx bx-table"></i> Bulk
          @if (bulkEmployees().length) { <span class="tab-count bulk-count">{{ bulkEmployees().length }}</span> }
        </button>
        <button class="roster-tab import-tab" [class.active]="rosterTab() === 'import'" (click)="rosterTab.set('import')">
          <i class="bx bx-cloud-upload"></i> Import
        </button>
      </div>

      <!-- BULK TAB -->
      @if (rosterTab() === 'bulk') {
        @if (bulkEmployees().length === 0) {
          <div class="empty-bulk">
            <i class="bx bx-inbox"></i>
            <p>No pending employees. Use the Import tab to upload a CSV.</p>
          </div>
        } @else {
          <div class="filters-bar">
            <input type="text" [ngModel]="bulkSearchTerm()" (ngModelChange)="bulkSearchTerm.set($event); rosterPage.set(1)" placeholder="Search staging employees..." class="search-input">
            @if (bulkCompared()) {
              <select [ngModel]="bulkExistsFilter()" (ngModelChange)="bulkExistsFilter.set($event); rosterPage.set(1)" class="filter-select">
                <option value="">All</option>
                <option value="new">New Only</option>
                <option value="duplicate">Duplicates Only</option>
              </select>
            }
          </div>
          <div class="bulk-actions-bar">
            <span class="bulk-count-label">{{ filteredBulkEmployees().length }} @if (filteredBulkEmployees().length !== bulkEmployees().length) { of {{ bulkEmployees().length }} } pending review</span>
            <div class="bulk-actions-right">
              <button class="btn-compare" (click)="compareBulk()">
                <i class="bx bx-git-compare"></i> Compare
              </button>
              @if (bulkCompared() && getDuplicateCount() > 0) {
                <button class="btn-remove-dupes" (click)="removeDuplicates()" [disabled]="removingDuplicates()">
                  <i class="bx" [class.bx-trash]="!removingDuplicates()" [class.bx-loader-alt]="removingDuplicates()" [class.bx-spin]="removingDuplicates()"></i>
                  Remove {{ getDuplicateCount() }} Duplicate{{ getDuplicateCount() !== 1 ? 's' : '' }}
                </button>
              }
              <button class="btn-activate-all" (click)="activateAllBulk()">
                <i class="bx bx-check-double"></i> Activate All
              </button>
            </div>
          </div>
          <div class="roster-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Position</th>
                  <th>Imported</th>
                  @if (bulkCompared()) { <th>Exists</th> }
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (emp of paginatedBulkEmployees(); track emp.id) {
                  <tr>
                      <td><strong>{{ emp.name }}</strong><br><span class="text-muted">#{{ emp.id }}</span></td>
                      <td>{{ emp.email }}</td>
                      <td>{{ emp.phone || '—' }}</td>
                      <td><span class="role-badge">{{ emp.role || 'user' }}</span></td>
                      <td>{{ emp.department || '—' }}</td>
                      <td>{{ emp.position || '—' }}</td>
                      <td class="text-muted">{{ emp.createdAt | date:'short' }}</td>
                    @if (bulkCompared()) {
                      <td class="exists-cell">
                        @if (bulkExistsMap()[emp.id]) {
                          <span class="exists-badge duplicate" title="Already exists in roster"><i class="bx bx-error-circle"></i> Duplicate</span>
                        } @else {
                          <span class="exists-badge new" title="New employee"><i class="bx bx-user-plus"></i> New</span>
                        }
                      </td>
                    }
                    <td>
                      <div class="action-icons">
                        <button class="action-btn activate" (click)="activateBulkEmployee(emp)" title="Activate">
                          <i class="bx bx-check-circle"></i>
                        </button>
                        <button class="action-btn archive" (click)="archiveBulkEmployee(emp)" title="Archive">
                          <i class="bx bx-archive-in"></i>
                        </button>
                        <button class="action-btn edit" (click)="editEmployee(emp)" title="Edit">
                          <i class="bx bx-edit"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="roster-pagination" *ngIf="filteredBulkEmployees().length > 0">
            <div class="pagination-info">
              Showing {{ ((rosterPage() - 1) * rosterPageSize()) + 1 }} - {{ Math.min(rosterPage() * rosterPageSize(), filteredBulkEmployees().length) }} of {{ filteredBulkEmployees().length }}
            </div>
            <div class="pagination-controls">
              <button class="page-btn" [disabled]="rosterPage() <= 1" (click)="setBulkPage(rosterPage() - 1)">
                <i class="bx bx-chevron-left"></i>
              </button>
              <span class="page-current">{{ rosterPage() }} / {{ bulkTotalPages() }}</span>
              <button class="page-btn" [disabled]="rosterPage() >= bulkTotalPages()" (click)="setBulkPage(rosterPage() + 1)">
                <i class="bx bx-chevron-right"></i>
              </button>
            </div>
            <div class="pagination-size">
              <select [ngModel]="rosterPageSize()" (ngModelChange)="setRosterPageSize(+$event)">
                <option [value]="25">25 per page</option>
                <option [value]="50">50 per page</option>
                <option [value]="100">100 per page</option>
              </select>
            </div>
          </div>
        }
      }

      <!-- IMPORT TAB -->
      @if (rosterTab() === 'import') {
        <div class="import-section">
          <div class="import-header">
            <h2><i class="bx bx-cloud-upload"></i> Bulk Import Employees</h2>
            <p>Upload a CSV file to import multiple employees at once. All imports start as <strong>inactive</strong>.</p>
          </div>

          <div class="import-actions-bar">
            <a class="btn-template" [href]="apiUrl + '/api/v1/bulk/import/template/employees'" download>
              <i class="bx bx-download"></i> Download CSV Template
            </a>
          </div>

          @if (!importPreview().length && !importResult()) {
            <div class="import-dropzone" (dragover)="$event.preventDefault()" (drop)="onFileDrop($event)">
              <i class="bx bx-cloud-upload"></i>
              <p>Drag & drop a CSV file here, or</p>
              <label class="btn-browse">
                Browse Files
                <input type="file" accept=".csv" (change)="onFileSelect($event)" hidden>
              </label>
            </div>
          }

          @if (importPreview().length) {
            <div class="import-preview">
              <div class="preview-header">
                <h3>Preview ({{ importPreview().length }} rows)</h3>
                <div class="preview-actions">
                  <button class="btn-cancel" (click)="clearImport()"><i class="bx bx-x"></i> Cancel</button>
                  <button class="btn-primary" (click)="executeImport()" [disabled]="importing()">
                    <i class="bx" [class.bx-upload]="!importing()" [class.bx-loader-alt]="importing()" [class.bx-spin]="importing()"></i>
                    {{ importing() ? 'Importing...' : 'Import All' }}
                  </button>
                </div>
              </div>
              <div class="preview-table-wrap">
                <table class="preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Role</th>
                      <th>Position</th>
                      <th>Department</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of importPreview(); track $index) {
                      <tr [class.row-error]="row._error">
                        <td>{{ $index + 1 }}</td>
                        <td>{{ row.name }}</td>
                        <td>{{ row.email }}</td>
                        <td>{{ row.phone }}</td>
                        <td>{{ row.role }}</td>
                        <td>{{ row.position }}</td>
                        <td>{{ row.department }}</td>
                        <td>
                          @if (row._error) {
                            <span class="badge-error" [title]="row._error">Error</span>
                          } @else {
                            <span class="badge-ready">Ready</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          @if (importResult()) {
            <div class="import-result">
              <div class="result-card" [class.result-success]="importResult().status === 'completed'" [class.result-error]="importResult().status === 'failed'">
                <h3><i class="bx" [class.bx-check-circle]="importResult().status === 'completed'" [class.bx-error-circle]="importResult().status === 'failed'"></i> Import {{ importResult().status === 'completed' ? 'Complete' : 'Failed' }}</h3>
                <div class="result-stats">
                  <span class="stat-success"><i class="bx bx-check"></i> {{ importResult().successCount }} imported</span>
                  <span class="stat-fail"><i class="bx bx-x"></i> {{ importResult().failedCount }} failed</span>
                  <span class="stat-skip"><i class="bx bx-skip-next"></i> {{ importResult().skippedCount }} skipped</span>
                </div>
                @if (importResult().errors?.length) {
                  <div class="result-errors">
                    <h4>Errors:</h4>
                    @for (err of importResult().errors; track $index) {
                      <div class="error-line">Row {{ err.row }}: {{ err.error }}</div>
                    }
                  </div>
                }
                <button class="btn-secondary" (click)="clearImport(); rosterTab.set('bulk'); refreshRoster()">
                  <i class="bx bx-table"></i> View in Bulk Queue
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Entity Sub-Tabs -->
      @if (rosterTab() !== 'import' && rosterTab() !== 'bulk') {
      <div class="entity-tabs">
        <button class="entity-tab" [class.active]="entityTab() === 'all'" (click)="entityTab.set('all')">
          All <span class="entity-count">{{ getEntityCount('all') }}</span>
        </button>
        <button class="entity-tab" [class.active]="entityTab() === 'corporate'" (click)="entityTab.set('corporate')">
          <i class="bx bx-briefcase"></i> Corporate <span class="entity-count">{{ getEntityCount('corporate') }}</span>
        </button>
        <button class="entity-tab" [class.active]="entityTab() === 'satellite'" (click)="entityTab.set('satellite')">
          <i class="bx bx-building"></i> Satellites <span class="entity-count">{{ getEntityCount('satellite') }}</span>
        </button>
        <button class="entity-tab" [class.active]="entityTab() === 'agency'" (click)="entityTab.set('agency')">
          <i class="bx bx-store-alt"></i> Agents <span class="entity-count">{{ getEntityCount('agency') }}</span>
        </button>
        <button class="entity-tab" [class.active]="entityTab() === 'terminal'" (click)="entityTab.set('terminal')">
          <i class="bx bx-globe"></i> Terminals <span class="entity-count">{{ getEntityCount('terminal') }}</span>
        </button>
      </div>

      <!-- Employee Table -->
      <div class="roster-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Entity</th>
              <th>Department</th>
              <th>Position</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let employee of paginatedEmployees()" [class.inactive]="employee.status !== 'active'">
              <td>
                <div class="employee-name">
                  <div class="name-row">
                    <strong>{{ employee.name }}</strong>
                    <i *ngIf="employee.requiredDocCount > 0 && employee.documentCount < employee.requiredDocCount" class="bx bx-flag doc-flag" title="Missing {{ employee.requiredDocCount - employee.documentCount }} of {{ employee.requiredDocCount }} required documents"></i>
                  </div>
                  <span *ngIf="employee.alias" class="employee-alias">"{{ employee.alias }}"</span>
                  <span class="employee-id">#{{ employee.id }}</span>
                </div>
              </td>
              <td>{{ employee.email }}</td>
              <td>{{ employee.cellPhone || '-' }}</td>
              <td>
                <span class="role-badge" [class]="employee.role">{{ employee.role }}</span>
              </td>
              <td>
                <div class="entity-info">
                  <span class="entity-type">{{ employee.entityType }}</span>
                  <span class="entity-name" *ngIf="employee.satellite">{{ employee.satellite.name }}</span>
                  <span class="entity-name" *ngIf="employee.agency">{{ employee.agency.name }}</span>
                  <span class="entity-name" *ngIf="employee.terminal">{{ employee.terminal.name }}</span>
                  <span class="entity-name" *ngIf="employee.entityType === 'corporate'">Corporate</span>
                </div>
              </td>
              <td>{{ employee.department?.name || '-' }}</td>
              <td>{{ employee.position?.title || employee.jobTitle || '-' }}</td>
              <td>
                <span class="status-badge" [class]="employee.status">{{ employee.status }}</span>
              </td>
              <td>
                <div class="action-buttons">
                  <button class="action-btn view" (click)="viewEmployee(employee)" title="View Details">
                    <i class="bx bx-show"></i>
                  </button>
                  <button class="action-btn edit" (click)="editEmployee(employee)" title="Edit Employee">
                    <i class="bx bx-edit"></i>
                  </button>
                  @if (rosterTab() === 'live') {
                    <button class="action-btn toggle inactive" (click)="toggleEmployeeStatus(employee)" title="Deactivate Employee">
                      <i class="bx bx-toggle-right"></i>
                    </button>
                  }
                  @if (rosterTab() === 'deactivated') {
                    <button class="action-btn archive" (click)="archiveEmployee(employee)" title="Archive Employee">
                      <i class="bx bx-archive-in"></i>
                    </button>
                  }
                  @if (rosterTab() === 'deactivated' || rosterTab() === 'archived') {
                    <button class="action-btn restore" (click)="restoreEmployee(employee)" title="Restore to Active">
                      <i class="bx bx-user-check"></i>
                    </button>
                  }
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        
        <div *ngIf="loading()" class="loading">
          <i class="bx bx-loader-alt bx-spin"></i> Loading roster...
        </div>
        
        <div *ngIf="!loading() && employees().length === 0" class="empty-state">
          No employees found
        </div>
      </div>

      <!-- Pagination -->
      <div class="roster-pagination" *ngIf="displayedEmployees().length > 0">
        <div class="pagination-info">
          Showing {{ ((rosterPage() - 1) * rosterPageSize()) + 1 }} - {{ Math.min(rosterPage() * rosterPageSize(), displayedEmployees().length) }} of {{ displayedEmployees().length }}
        </div>
        <div class="pagination-controls">
          <button class="page-btn" [disabled]="rosterPage() <= 1" (click)="setRosterPage(rosterPage() - 1)">
            <i class="bx bx-chevron-left"></i>
          </button>
          <span class="page-current">{{ rosterPage() }} / {{ rosterTotalPages() }}</span>
          <button class="page-btn" [disabled]="rosterPage() >= rosterTotalPages()" (click)="setRosterPage(rosterPage() + 1)">
            <i class="bx bx-chevron-right"></i>
          </button>
        </div>
        <div class="pagination-size">
          <select [ngModel]="rosterPageSize()" (ngModelChange)="setRosterPageSize(+$event)">
            <option [value]="25">25 per page</option>
            <option [value]="50">50 per page</option>
            <option [value]="100">100 per page</option>
            <option [value]="250">250 per page</option>
          </select>
        </div>
      </div>
      }

      <!-- Employee Details Modal -->
      <div *ngIf="selectedEmployee()" class="modal-overlay" (click)="selectedEmployee.set(null)">
        <div class="modal-content details-modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="header-with-avatar">
              <div class="avatar-circle">
                @if (selectedEmployee()?.avatarUrl) {
                  <img [src]="selectedEmployee()?.avatarUrl" alt="Profile">
                } @else {
                  <i class="bx bx-user"></i>
                }
              </div>
              <h2>
                <i class="bx bx-user-circle"></i> 
                {{ selectedEmployee()?.name }}
                @if (selectedEmployee()?.alias) {
                  <span class="alias-tag">"{{ selectedEmployee()?.alias }}"</span>
                }
              </h2>
            </div>
            <button class="close-btn" (click)="selectedEmployee.set(null)">
              <i class="bx bx-x"></i>
            </button>
          </div>

          <div class="modal-tabs">
            <button class="tab-btn" [class.active]="activeDetailsTab() === 'details'" (click)="activeDetailsTab.set('details')">
              <i class="bx bx-info-circle"></i> Details
            </button>
            <button class="tab-btn" [class.active]="activeDetailsTab() === 'documents'" (click)="activeDetailsTab.set('documents'); loadEmployeeDocuments(); loadPositionRequirements()">
              <i class="bx bx-file"></i> Documents
            </button>
            <button class="tab-btn" [class.active]="activeDetailsTab() === 'onboarding'" (click)="activeDetailsTab.set('onboarding')">
              <i class="bx bx-log-in-circle"></i> Onboarding
            </button>
            <button class="tab-btn" [class.active]="activeDetailsTab() === 'offboarding'" (click)="activeDetailsTab.set('offboarding')">
              <i class="bx bx-log-out-circle"></i> Offboarding
            </button>
            <button class="tab-btn" [class.active]="activeDetailsTab() === 'evaluations'" (click)="activeDetailsTab.set('evaluations')">
              <i class="bx bx-star"></i> Evaluations
            </button>
          </div>

          <div class="modal-body">
            @if (activeDetailsTab() === 'details') {
              <div class="details-grid">
              <!-- Basic Information -->
              <div class="detail-section">
                <h3><i class="bx bx-info-circle"></i> Basic Information</h3>
                <div class="detail-row">
                  <span class="detail-label">Employee ID:</span>
                  <span class="detail-value">#{{ selectedEmployee()?.id }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Full Name:</span>
                  <span class="detail-value">{{ selectedEmployee()?.name }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Alias:</span>
                  <span class="detail-value">{{ selectedEmployee()?.alias || 'Not set' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Gender:</span>
                  <span class="detail-value">{{ selectedEmployee()?.gender || 'Not specified' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Work Email:</span>
                  <span class="detail-value">{{ selectedEmployee()?.email }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Personal Email:</span>
                  <span class="detail-value">{{ selectedEmployee()?.personalEmail || 'Not provided' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Zoom Email:</span>
                  <span class="detail-value">{{ selectedEmployee()?.zoomEmail || 'Not linked' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Work Phone:</span>
                  <span class="detail-value">{{ selectedEmployee()?.workPhone || 'Not provided' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Cell Phone:</span>
                  <span class="detail-value">{{ selectedEmployee()?.cellPhone || 'Not provided' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Address:</span>
                  <span class="detail-value address-text" *ngIf="selectedEmployee()?.address; else noAddress">
                    {{ selectedEmployee()?.address }}<br />
                    {{ selectedEmployee()?.city }}, {{ selectedEmployee()?.state }} {{ selectedEmployee()?.zipCode }}
                  </span>
                  <ng-template #noAddress>
                    <span class="detail-value">Not provided</span>
                  </ng-template>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Status:</span>
                  <span class="status-badge" [class]="selectedEmployee()?.status">{{ selectedEmployee()?.status }}</span>
                </div>
              </div>

              <!-- Personal Details -->
              <div class="detail-section">
                <h3><i class="bx bx-id-card"></i> Personal Details</h3>
                <div class="detail-row">
                  <span class="detail-label">Date of Birth:</span>
                  <span class="detail-value">{{ selectedEmployee()?.dateOfBirth ? (selectedEmployee()?.dateOfBirth | date:'mediumDate') : 'Not provided' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">ID Number:</span>
                  <span class="detail-value mono">{{ selectedEmployee()?.idNumber || 'Not provided' }}</span>
                </div>
              </div>

              <!-- Physical Characteristics -->
              <div class="detail-section">
                <h3><i class="bx bx-body"></i> Physical Characteristics</h3>
                <div class="detail-row">
                  <span class="detail-label">Height:</span>
                  <span class="detail-value">{{ selectedEmployee()?.height || 'Not specified' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Weight:</span>
                  <span class="detail-value">{{ selectedEmployee()?.weight || 'Not specified' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Eye Color:</span>
                  <span class="detail-value">{{ selectedEmployee()?.eyeColor || 'Not specified' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Hair Color:</span>
                  <span class="detail-value">{{ selectedEmployee()?.hairColor || 'Not specified' }}</span>
                </div>
              </div>

              <!-- Demographics -->
              <div class="detail-section">
                <h3><i class="bx bx-group"></i> Demographics</h3>
                <div class="detail-row">
                  <span class="detail-label">Ethnicity:</span>
                  <span class="detail-value">{{ selectedEmployee()?.ethnicity || 'Not specified' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Religion:</span>
                  <span class="detail-value">{{ selectedEmployee()?.religion || 'Not specified' }}</span>
                </div>
              </div>

              <!-- Role & Access -->
              <div class="detail-section">
                <h3><i class="bx bx-shield"></i> Role & Access</h3>
                <div class="detail-row">
                  <span class="detail-label">Role:</span>
                  <span class="role-badge" [class]="selectedEmployee()?.role">{{ selectedEmployee()?.role }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">API Key:</span>
                  <span class="detail-value mono">{{ selectedEmployee()?.apiKey || 'Not generated' }}</span>
                </div>
              </div>

              <!-- Localization Settings -->
              <div class="detail-section">
                <h3><i class="bx bx-globe"></i> Localization</h3>
                <div class="detail-row">
                  <span class="detail-label">Employee Country:</span>
                  <span class="detail-value">{{ selectedEmployee()?.country || 'USA' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Language:</span>
                  <span class="detail-value">{{ selectedEmployee()?.language || 'en' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Timezone:</span>
                  <span class="detail-value">{{ selectedEmployee()?.timezone || 'America/New_York' }}</span>
                </div>
              </div>

              <!-- Organization & Country -->
              <div class="detail-section">
                <h3><i class="bx bx-building"></i> Organization</h3>
                <div class="detail-row">
                  <span class="detail-label">Organization:</span>
                  <span class="detail-value">{{ selectedEmployee()?.organization?.name || 'Van Tac Logistics' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Country:</span>
                  <span class="detail-value">
                    <i class="bx bx-world"></i> {{ selectedEmployee()?.organization?.addressRef?.country || 'USA' }}
                  </span>
                </div>
                <div class="detail-row" *ngIf="selectedEmployee()?.organization?.addressRef">
                  <span class="detail-label">Address:</span>
                  <span class="detail-value address-text">
                    {{ selectedEmployee()?.organization?.addressRef?.street1 }}<br *ngIf="selectedEmployee()?.organization?.addressRef?.street2" />
                    {{ selectedEmployee()?.organization?.addressRef?.street2 }}<br *ngIf="selectedEmployee()?.organization?.addressRef?.street2" />
                    {{ selectedEmployee()?.organization?.addressRef?.city }}, {{ selectedEmployee()?.organization?.addressRef?.state }} {{ selectedEmployee()?.organization?.addressRef?.zipCode }}
                  </span>
                </div>
              </div>

              <!-- Entity Assignment -->
              <div class="detail-section">
                <h3><i class="bx bx-briefcase-alt"></i> Entity Assignment</h3>
                <div class="detail-row">
                  <span class="detail-label">Entity Type:</span>
                  <span class="detail-value">{{ selectedEmployee()?.entityType || 'Corporate' }}</span>
                </div>
                <div class="detail-row" *ngIf="selectedEmployee()?.satellite">
                  <span class="detail-label">Satellite:</span>
                  <span class="detail-value">{{ selectedEmployee()?.satellite?.name }} ({{ selectedEmployee()?.satellite?.code }})</span>
                </div>
                <div class="detail-row" *ngIf="selectedEmployee()?.agency">
                  <span class="detail-label">Agency:</span>
                  <span class="detail-value">{{ selectedEmployee()?.agency?.name }} ({{ selectedEmployee()?.agency?.code }})</span>
                </div>
                <div class="detail-row" *ngIf="selectedEmployee()?.terminal">
                  <span class="detail-label">Terminal:</span>
                  <span class="detail-value">{{ selectedEmployee()?.terminal?.name }} ({{ selectedEmployee()?.terminal?.code }})</span>
                </div>
              </div>

              <!-- Department & Position -->
              <div class="detail-section">
                <h3><i class="bx bx-briefcase"></i> Department & Position</h3>
                <div class="detail-row">
                  <span class="detail-label">Department:</span>
                  <span class="detail-value">{{ selectedEmployee()?.department?.name || 'Not assigned' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Position:</span>
                  <span class="detail-value">{{ selectedEmployee()?.position?.title || selectedEmployee()?.jobTitle || 'Not assigned' }}</span>
                </div>
              </div>

              <!-- Account Information -->
              <div class="detail-section full-width">
                <h3><i class="bx bx-time"></i> Account Information</h3>
                <div class="detail-row">
                  <span class="detail-label">Created:</span>
                  <span class="detail-value">{{ selectedEmployee()?.createdAt | date:'medium' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Last Login:</span>
                  <span class="detail-value">{{ selectedEmployee()?.lastLoginAt ? (selectedEmployee()?.lastLoginAt | date:'medium') : 'Never' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Last Updated:</span>
                  <span class="detail-value">{{ selectedEmployee()?.updatedAt ? (selectedEmployee()?.updatedAt | date:'medium') : 'N/A' }}</span>
                </div>
              </div>
            </div>
            } @else if (activeDetailsTab() === 'documents') {
              <!-- Documents Tab -->
              <div class="documents-section">
                <!-- Mandatory Documents Table -->
                <div class="mandatory-docs-section">
                  <h3><i class="bx bx-clipboard"></i> Mandatory Documents</h3>
                  @if (getMandatoryDocuments().length === 0) {
                    <div class="empty-docs">
                      <i class="bx bx-info-circle"></i>
                      <p>No document requirements configured for this position</p>
                    </div>
                  } @else {
                    <table class="mandatory-docs-table">
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Category</th>
                          <th>Expiration</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (doc of getMandatoryDocuments(); track doc.type) {
                          <tr [class.uploaded]="hasDocument(doc.type)">
                            <td><i class="bx bx-file-blank"></i> {{ doc.label }}</td>
                            <td><span class="category-badge">{{ doc.category }}</span></td>
                            <td>
                              @if (editingExpiryType === doc.type) {
                                <input type="date" class="expiry-input" [value]="getDocExpiration(doc.type) || todayDate()" (change)="saveExpiration(doc.type, $event)" (blur)="editingExpiryType = ''">
                              } @else if (getDocExpiration(doc.type)) {
                                <span class="expiry-date" [class.expiring]="isExpiringSoon(getDocExpiration(doc.type)!)" [class.expired]="isDocExpired(getDocExpiration(doc.type)!)" (click)="editingExpiryType = doc.type" style="cursor:pointer" title="Click to edit">
                                  {{ getDocExpiration(doc.type) | date:'mediumDate' }}
                                </span>
                              } @else {
                                <button class="action-btn-inline" (click)="editingExpiryType = doc.type" title="Set expiration date">
                                  <i class="bx bx-calendar-edit"></i>
                                </button>
                              }
                            </td>
                            <td>
                              @if (hasDocument(doc.type)) {
                                <span class="status-badge uploaded">Uploaded</span>
                              } @else {
                                <span class="status-badge missing">Missing</span>
                              }
                            </td>
                            <td>
                              <button class="action-btn upload" (click)="uploadMandatoryDoc(doc.type)" title="Upload">
                                <i class="bx bx-upload"></i>
                              </button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </div>

                <!-- All Documents Section -->
                <div class="documents-header">
                  <h3><i class="bx bx-folder-open"></i> All Documents</h3>
                  <button class="btn-primary" (click)="uploadEmployeeDocument()">
                    <i class="bx bx-upload"></i> Upload Document
                  </button>
                </div>

                @if (employeeDocuments().length === 0) {
                  <div class="empty-state">
                    <i class="bx bx-file"></i>
                    <p>No additional documents uploaded</p>
                  </div>
                } @else {
                  <div class="documents-list">
                    @for (doc of employeeDocuments(); track doc.id) {
                      <div class="document-card">
                        <div class="doc-icon">
                          <i class="bx bx-file-blank"></i>
                        </div>
                        <div class="doc-info">
                          <div class="doc-name">{{ doc.fileName }}</div>
                          <div class="doc-meta">
                            <span class="doc-type">{{ doc.documentType }}</span>
                            <span class="doc-date">{{ doc.createdAt | date:'short' }}</span>
                            <span class="doc-size">{{ (doc.fileSize / 1024).toFixed(1) }} KB</span>
                            @if (doc.expiresAt || doc.expirationDate) {
                              <span class="doc-expiry" [class.expiring]="isExpiringSoon(doc.expiresAt || doc.expirationDate)" [class.expired]="isDocExpired(doc.expiresAt || doc.expirationDate)">
                                <i class="bx bx-calendar"></i> Exp: {{ (doc.expiresAt || doc.expirationDate) | date:'mediumDate' }}
                              </span>
                            }
                          </div>
                        </div>
                        <div class="doc-actions">
                          <button class="action-btn view" (click)="viewDocument(doc)" title="View">
                            <i class="bx bx-show"></i>
                          </button>
                          <button class="action-btn delete" (click)="deleteDocument(doc)" title="Delete">
                            <i class="bx bx-trash"></i>
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            } @else if (activeDetailsTab() === 'onboarding') {
              <!-- Onboarding Tab -->
              <div class="onboarding-section">
                <h3><i class="bx bx-rocket"></i> Employee Onboarding Progress</h3>
                
                <div class="onboarding-checklist">
                  <div class="checklist-item">
                    <input type="checkbox" id="paperwork" checked>
                    <label for="paperwork">
                      <strong>Paperwork Completed</strong>
                      <span>Employment contract, I-9, W-4 signed</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="orientation">
                    <label for="orientation">
                      <strong>Company Orientation</strong>
                      <span>Completed orientation training</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="equipment">
                    <label for="equipment">
                      <strong>Equipment Issued</strong>
                      <span>Laptop, phone, access cards provided</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="accounts">
                    <label for="accounts">
                      <strong>System Accounts Created</strong>
                      <span>Email, VPN, software access setup</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="training">
                    <label for="training">
                      <strong>Initial Training</strong>
                      <span>Department-specific training completed</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="buddy">
                    <label for="buddy">
                      <strong>Buddy Assigned</strong>
                      <span>Mentor/buddy system setup</span>
                    </label>
                  </div>
                </div>
                
                <div class="onboarding-stats">
                  <div class="stat">
                    <span class="stat-value">66%</span>
                    <span class="stat-label">Completion</span>
                  </div>
                  <div class="stat">
                    <span class="stat-value">4/6</span>
                    <span class="stat-label">Tasks Done</span>
                  </div>
                  <div class="stat">
                    <span class="stat-value">2 days</span>
                    <span class="stat-label">Time Elapsed</span>
                  </div>
                </div>
              </div>
            } @else if (activeDetailsTab() === 'offboarding') {
              <!-- Offboarding Tab -->
              <div class="offboarding-section">
                <h3><i class="bx bx-exit"></i> Employee Offboarding Process</h3>
                
                <div class="offboarding-info">
                  <div class="info-row">
                    <span class="label">Last Day:</span>
                    <input type="date" class="form-input" placeholder="Select date">
                  </div>
                  <div class="info-row">
                    <span class="label">Reason:</span>
                    <select class="form-select">
                      <option value="">Select reason</option>
                      <option value="resignation">Resignation</option>
                      <option value="termination">Termination</option>
                      <option value="retirement">Retirement</option>
                      <option value="contract_end">Contract End</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div class="offboarding-checklist">
                  <div class="checklist-item">
                    <input type="checkbox" id="exit-interview">
                    <label for="exit-interview">
                      <strong>Exit Interview Conducted</strong>
                      <span>HR exit interview completed</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="equipment-return">
                    <label for="equipment-return">
                      <strong>Equipment Returned</strong>
                      <span>Laptop, phone, access cards collected</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="accounts-disabled">
                    <label for="accounts-disabled">
                      <strong>System Access Revoked</strong>
                      <span>Email, VPN, software access disabled</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="final-paycheck">
                    <label for="final-paycheck">
                      <strong>Final Paycheck Issued</strong>
                      <span>Final payment and accrued PTO paid out</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="benefits-term">
                    <label for="benefits-term">
                      <strong>Benefits Terminated</strong>
                      <span>Health insurance, 401k notifications sent</span>
                    </label>
                  </div>
                  <div class="checklist-item">
                    <input type="checkbox" id="knowledge-transfer">
                    <label for="knowledge-transfer">
                      <strong>Knowledge Transfer</strong>
                      <span>Handoff to replacement/team completed</span>
                    </label>
                  </div>
                </div>
              </div>
            } @else if (activeDetailsTab() === 'evaluations') {
              <!-- Evaluations Tab -->
              <div class="evaluations-section">
                <div class="evaluations-header">
                  <h3><i class="bx bx-chart"></i> Performance Evaluations</h3>
                  <button class="btn-primary" (click)="createEvaluation()">
                    <i class="bx bx-plus"></i> New Evaluation
                  </button>
                </div>

                <div class="evaluations-timeline">
                  <div class="evaluation-card">
                    <div class="eval-header">
                      <div class="eval-title">
                        <strong>Annual Review 2026</strong>
                        <span class="eval-date">Jan 15, 2026</span>
                      </div>
                      <span class="eval-score">4.5/5.0</span>
                    </div>
                    <div class="eval-body">
                      <div class="eval-categories">
                        <div class="category">
                          <span class="cat-name">Performance</span>
                          <div class="rating-stars">
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star-half"></i>
                          </div>
                        </div>
                        <div class="category">
                          <span class="cat-name">Teamwork</span>
                          <div class="rating-stars">
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                            <i class="bx bx-star"></i>
                          </div>
                        </div>
                        <div class="category">
                          <span class="cat-name">Communication</span>
                          <div class="rating-stars">
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                            <i class="bx bxs-star"></i>
                          </div>
                        </div>
                      </div>
                      <div class="eval-summary">
                        <strong>Summary:</strong>
                        <p>Excellent performance throughout the year. Strong team player with great communication skills.</p>
                      </div>
                    </div>
                    <div class="eval-footer">
                      <button class="action-btn view" title="View Full Evaluation">
                        <i class="bx bx-show"></i>
                      </button>
                      <button class="action-btn edit" title="Edit Evaluation">
                        <i class="bx bx-edit"></i>
                      </button>
                    </div>
                  </div>

                  <div class="empty-state" style="margin-top: 24px;">
                    <i class="bx bx-star"></i>
                    <p>No evaluations yet. Click "New Evaluation" to create one.</p>
                  </div>
                </div>
              </div>
            }
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" (click)="selectedEmployee.set(null)">
              <i class="bx bx-x"></i> Close
            </button>
            <button class="btn-primary" (click)="editEmployee(selectedEmployee()!)">
              <i class="bx bx-edit"></i> Edit Employee
            </button>
          </div>
        </div>
      </div>

      <!-- Edit Employee Modal -->
      <div *ngIf="showEditModal" class="modal-overlay" (click)="showEditModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2><i class="bx bx-edit"></i> Edit Employee</h2>
            <button class="close-btn" (click)="showEditModal = false">
              <i class="bx bx-x"></i>
            </button>
          </div>

          <!-- Edit Modal Tabs -->
          <div class="edit-modal-tabs">
            <button [class.active]="editModalTab() === 'personal'" (click)="editModalTab.set('personal')">
              <i class="bx bx-user"></i> Personal
            </button>
            <button [class.active]="editModalTab() === 'employment'" (click)="editModalTab.set('employment')">
              <i class="bx bx-briefcase"></i> Employment
            </button>
            @if (editingEmployee?.entityType !== 'satellite' || canSeeSatelliteFinancials()) {
              <button [class.active]="editModalTab() === 'financial'" (click)="switchEditTab('financial')">
                <i class="bx bx-credit-card"></i> Financial
              </button>
            }
            <button [class.active]="editModalTab() === 'integrations'" (click)="editModalTab.set('integrations')">
              <i class="bx bx-plug"></i> Integrations
            </button>
            <button [class.active]="editModalTab() === 'documents'" (click)="editModalTab.set('documents'); loadEditDocuments()">
              <i class="bx bx-file"></i> Documents
            </button>
            @if (editingEmployee?.entityType === 'satellite' && editingEmployee?.satelliteId && canSeeSatelliteFinancials()) {
              <button [class.active]="editModalTab() === 'business'" (click)="switchEditTab('business')">
                <i class="bx bx-building-house"></i> Business
              </button>
            }
          </div>

          <div class="modal-body">
            <div class="form-grid">

            <!-- ==================== PERSONAL TAB ==================== -->
            @if (editModalTab() === 'personal') {

              <!-- Basic Info -->
              <div class="form-section">
                <h3>Basic Information</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>Full Name *</label>
                    <input type="text" [(ngModel)]="editingEmployee.name" placeholder="John Doe" class="form-input" required>
                  </div>
                  <div class="form-group">
                    <label>Alias/Nickname</label>
                    <input type="text" [(ngModel)]="editingEmployee.alias" placeholder="Johnny" class="form-input">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Gender</label>
                    <select [(ngModel)]="editingEmployee.gender" class="form-select">
                      <option value="">Not specified</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Work Email *</label>
                    <input type="email" [(ngModel)]="editingEmployee.email" placeholder="john.doe@vantac.com" class="form-input" required>
                  </div>
                  <div class="form-group">
                    <label>Personal Email</label>
                    <input type="email" [(ngModel)]="editingEmployee.personalEmail" placeholder="john@gmail.com" class="form-input">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Work Phone</label>
                    <div class="phone-input-group">
                      <select [(ngModel)]="editingEmployee.workPhoneCountry" class="phone-country-select">
                        <option value="+1">+1 US</option>
                        <option value="+387">+387 BA</option>
                        <option value="+44">+44 UK</option>
                        <option value="+49">+49 DE</option>
                        <option value="+33">+33 FR</option>
                        <option value="+52">+52 MX</option>
                        <option value="+1CA">+1 CA</option>
                      </select>
                      <input type="tel" [(ngModel)]="editingEmployee.workPhone" placeholder="(555) 123-4567" class="form-input phone-number-input">
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Cell Phone</label>
                    <div class="phone-input-group">
                      <select [(ngModel)]="editingEmployee.cellPhoneCountry" class="phone-country-select">
                        <option value="+1">+1 US</option>
                        <option value="+387">+387 BA</option>
                        <option value="+44">+44 UK</option>
                        <option value="+49">+49 DE</option>
                        <option value="+33">+33 FR</option>
                        <option value="+52">+52 MX</option>
                        <option value="+1CA">+1 CA</option>
                      </select>
                      <input type="tel" [(ngModel)]="editingEmployee.cellPhone" placeholder="(555) 987-6543" class="form-input phone-number-input">
                    </div>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Job Title</label>
                    <select [(ngModel)]="editingEmployee.jobTitle" class="form-select">
                      <option value="">Select Job Title</option>
                      <option *ngFor="let jt of jobTitlesList()" [value]="jt.title">{{ jt.title }}</option>
                    </select>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Zoom Account Email
                      <button type="button" class="same-as-btn" (click)="editingEmployee.zoomEmail = editingEmployee.email">Same as email</button>
                    </label>
                    <input type="email" [(ngModel)]="editingEmployee.zoomEmail" placeholder="user@company.com" class="form-input">
                  </div>
                </div>
              </div>

            } <!-- end personal tab (first block: basic info, zoom) -->

            <!-- ==================== FINANCIAL TAB ==================== -->
            @if (editModalTab() === 'financial') {

              <!-- SATELLITE EMPLOYEES: Show satellite's shared banking info -->
              @if (editingEmployee?.entityType === 'satellite' && editingEmployee?.satelliteId) {
                <div class="form-section">
                  <h3><i class="bx bx-credit-card"></i> Satellite Banking — {{ satelliteDetails()?.name || 'Loading...' }}</h3>
                  <div class="country-banner">
                    <i class="bx bx-info-circle"></i> Financial details are shared across all employees in this satellite. Edit on the <a href="javascript:void(0)" (click)="showEditModal = false; router.navigate(['/satellites'])" style="color:#00f2fe">Satellites page</a>.
                  </div>

                  @if (satelliteDetails()) {
                    <div class="bank-account-card">
                      <div class="bank-card-header">
                        <span class="bank-name"><i class="bx bx-building"></i> {{ satelliteDetails()?.bankName || 'Bank Account' }}</span>
                        <span class="account-type-badge">satellite</span>
                      </div>
                      <div class="bank-card-body">
                        @if (satelliteDetails()?.routingNumber) {
                          <div class="bank-field"><span class="field-label">Routing #</span><span class="field-value mono">{{ satelliteDetails()?.routingNumber }}</span></div>
                        }
                        @if (satelliteDetails()?.accountNumber) {
                          <div class="bank-field"><span class="field-label">Account #</span><span class="field-value mono">{{ maskAccount(satelliteDetails()?.accountNumber) }}</span></div>
                        }
                        @if (satelliteDetails()?.paymentTerms) {
                          <div class="bank-field"><span class="field-label">Payment Terms</span><span class="field-value">{{ satelliteDetails()?.paymentTerms }}</span></div>
                        }
                        @if (satelliteDetails()?.commissionRate) {
                          <div class="bank-field"><span class="field-label">Commission Rate</span><span class="field-value">{{ satelliteDetails()?.commissionRate }}%</span></div>
                        }
                        @if (satelliteDetails()?.revenueSharePercent) {
                          <div class="bank-field"><span class="field-label">Revenue Share</span><span class="field-value">{{ satelliteDetails()?.revenueSharePercent }}%</span></div>
                        }
                      </div>
                    </div>

                    @if (!satelliteDetails()?.bankName && !satelliteDetails()?.accountNumber && !satelliteDetails()?.routingNumber) {
                      <div class="country-banner">
                        <i class="bx bx-error-circle"></i> No banking details configured for this satellite yet. Add them on the Satellites page.
                      </div>
                    }
                  } @else {
                    <div class="biz-loading"><i class="bx bx-loader-alt bx-spin"></i> Loading satellite financial details...</div>
                  }
                </div>

              <!-- NON-SATELLITE EMPLOYEES: Individual banking -->
              } @else {
                <div class="form-section">
                  <h3><i class="bx bx-credit-card"></i> Banking Information</h3>
                  <div class="country-banner">
                    @if (getEmployeeCountry() === 'BA') {
                      <i class="bx bx-globe"></i> <strong>Bosnia & Herzegovina</strong> — IBAN / SWIFT format
                    } @else {
                      <i class="bx bx-globe"></i> <strong>United States</strong> — Routing / Account Number format
                    }
                  </div>

                  @if (employeeAccounts().length > 0) {
                    <div class="bank-accounts-list">
                      @for (acct of employeeAccounts(); track acct.id) {
                        <div class="bank-account-card">
                          <div class="bank-card-header">
                            <span class="bank-name"><i class="bx bx-building"></i> {{ acct.bankName || 'Bank Account' }}</span>
                            <span class="account-type-badge">{{ acct.accountType || acct.type || 'checking' }}</span>
                          </div>
                          <div class="bank-card-body">
                            @if (acct.iban) {
                              <div class="bank-field"><span class="field-label">IBAN</span><span class="field-value mono">{{ maskIban(acct.iban) }}</span></div>
                            }
                            @if (acct.swiftBic) {
                              <div class="bank-field"><span class="field-label">SWIFT/BIC</span><span class="field-value mono">{{ acct.swiftBic }}</span></div>
                            }
                            @if (acct.routingNumber) {
                              <div class="bank-field"><span class="field-label">Routing #</span><span class="field-value mono">{{ acct.routingNumber }}</span></div>
                            }
                            @if (acct.accountNumber) {
                              <div class="bank-field"><span class="field-label">Account #</span><span class="field-value mono">{{ maskAccount(acct.accountNumber) }}</span></div>
                            }
                          </div>
                          <div class="bank-card-actions">
                            <button class="btn-sm" (click)="editBankAccount(acct)"><i class="bx bx-edit"></i> Edit</button>
                            <button class="btn-sm btn-danger" (click)="deleteBankAccount(acct.id)"><i class="bx bx-trash"></i></button>
                          </div>
                        </div>
                      }
                    </div>
                  }

                  @if (showBankForm()) {
                    <div class="bank-form">
                      <h4>{{ editingBankAccount() ? 'Edit Account' : 'Add Bank Account' }}</h4>
                      <div class="form-row">
                        <div class="form-group">
                          <label>Bank Name *</label>
                          <input type="text" [(ngModel)]="bankForm.bankName" placeholder="Bank name" class="form-input">
                        </div>
                        <div class="form-group">
                          <label>Account Type</label>
                          <select [(ngModel)]="bankForm.accountType" class="form-select">
                            <option value="checking">Checking</option>
                            <option value="savings">Savings</option>
                          </select>
                        </div>
                      </div>

                      @if (getEmployeeCountry() === 'BA') {
                        <div class="form-row">
                          <div class="form-group">
                            <label>IBAN *</label>
                            <input type="text" [(ngModel)]="bankForm.iban" placeholder="BA39 1290 0794 0102 8494" class="form-input mono" maxlength="34">
                          </div>
                          <div class="form-group">
                            <label>SWIFT/BIC Code *</label>
                            <input type="text" [(ngModel)]="bankForm.swiftBic" placeholder="RAABORBA" class="form-input mono" maxlength="11">
                          </div>
                        </div>
                      } @else {
                        <div class="form-row">
                          <div class="form-group">
                            <label>Routing Number *</label>
                            <input type="text" [(ngModel)]="bankForm.routingNumber" placeholder="021000021" class="form-input mono" maxlength="9">
                          </div>
                          <div class="form-group">
                            <label>Account Number *</label>
                            <input type="text" [(ngModel)]="bankForm.accountNumber" placeholder="1234567890" class="form-input mono">
                          </div>
                        </div>
                      }

                      <div class="bank-form-actions">
                        <button class="btn-secondary" (click)="cancelBankForm()"><i class="bx bx-x"></i> Cancel</button>
                        <button class="btn-primary" (click)="saveBankAccount()"><i class="bx bx-save"></i> Save Account</button>
                      </div>
                    </div>
                  } @else {
                    <button class="btn-add-account" (click)="openBankForm()">
                      <i class="bx bx-plus"></i> Add Bank Account
                    </button>
                  }
                </div>
              }

            } <!-- end financial tab -->

            <!-- ==================== INTEGRATIONS TAB ==================== -->
            @if (editModalTab() === 'integrations') {

              <!-- Integration Accounts -->
              <div class="form-section">
                <h3>Integration Accounts</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>Landstar Username</label>
                    <input type="text" [(ngModel)]="editingEmployee.landstarUsername" placeholder="Landstar username" class="form-input">
                  </div>
                  <div class="form-group">
                    <label>Landstar Password</label>
                    <div class="password-input-group">
                      <input [type]="showLandstarPw ? 'text' : 'password'" [(ngModel)]="editingEmployee.landstarPassword" placeholder="Landstar password" class="form-input">
                      <button type="button" class="pw-toggle" (click)="togglePassword('landstar')" title="Toggle visibility">
                        <i class="bx" [class.bx-show]="!showLandstarPw" [class.bx-hide]="showLandstarPw"></i>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>PowerDat Username</label>
                    <input type="text" [(ngModel)]="editingEmployee.powerdatUsername" placeholder="PowerDat username" class="form-input">
                  </div>
                  <div class="form-group">
                    <label>PowerDat Password</label>
                    <div class="password-input-group">
                      <input [type]="showPowerdatPw ? 'text' : 'password'" [(ngModel)]="editingEmployee.powerdatPassword" placeholder="PowerDat password" class="form-input">
                      <button type="button" class="pw-toggle" (click)="togglePassword('powerdat')" title="Toggle visibility">
                        <i class="bx" [class.bx-show]="!showPowerdatPw" [class.bx-hide]="showPowerdatPw"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            } <!-- end integrations tab -->

            <!-- ==================== DOCUMENTS TAB ==================== -->
            @if (editModalTab() === 'documents') {
              <div class="form-section">
                <h3><i class="bx bx-file"></i> Uploaded Documents</h3>
                <p class="section-hint">Manage documents and set expiration dates</p>
              </div>

              @if (editDocuments().length === 0) {
                <div class="edit-docs-empty">
                  <i class="bx bx-folder-open"></i>
                  <p>No documents uploaded for this employee</p>
                  <button class="btn-primary btn-sm" (click)="uploadEmployeeDocument()">
                    <i class="bx bx-upload"></i> Upload Document
                  </button>
                </div>
              } @else {
                <div class="edit-docs-actions">
                  <button class="btn-primary btn-sm" (click)="uploadEmployeeDocument()">
                    <i class="bx bx-upload"></i> Upload Document
                  </button>
                </div>
                <table class="edit-docs-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Type</th>
                      <th>Uploaded</th>
                      <th>Expiration Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (doc of editDocuments(); track doc.id) {
                      <tr>
                        <td class="doc-name-cell">
                          <i class="bx bx-file-blank"></i>
                          <span>{{ doc.fileName }}</span>
                        </td>
                        <td><span class="category-badge">{{ doc.documentType }}</span></td>
                        <td class="doc-date-cell">{{ doc.createdAt | date:'shortDate' }}</td>
                        <td>
                          <input type="date" class="expiry-input-inline"
                                 [value]="doc.expiresAt || doc.expirationDate || ''"
                                 (change)="updateDocExpiration(doc, $event)">
                        </td>
                        <td class="doc-actions-cell">
                          <button class="action-btn view" (click)="viewDocument(doc)" title="View">
                            <i class="bx bx-show"></i>
                          </button>
                          <button class="action-btn delete" (click)="deleteDocument(doc)" title="Delete">
                            <i class="bx bx-trash"></i>
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            } <!-- end documents tab -->

            <!-- ==================== BUSINESS TAB (satellite only) ==================== -->
            @if (editModalTab() === 'business' && satelliteDetails()) {
              <div class="form-section">
                <div class="biz-header">
                  <h3><i class="bx bx-building-house"></i> {{ satelliteDetails()?.name }} — Satellite Details</h3>
                  <a class="biz-edit-link" href="javascript:void(0)" (click)="showEditModal = false; router.navigate(['/satellites'])">
                    <i class="bx bx-edit"></i> Edit on Satellites Page
                  </a>
                </div>

                <!-- Country-specific business registration -->
                @if (getSatelliteCountry() === 'BA') {
                  <!-- Bosnia Business Registration -->
                  <div class="biz-card">
                    <h4><i class="bx bx-id-card"></i> Business Registration (Bosnia)</h4>
                    <div class="biz-grid">
                      <div class="biz-field"><span class="biz-label">Legal Business Name</span><span class="biz-value">{{ satelliteDetails()?.legalBusinessName || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">DBA Name</span><span class="biz-value">{{ satelliteDetails()?.dbaName || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">JIB (Tax ID)</span><span class="biz-value mono">{{ satelliteDetails()?.jib || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">PDV (VAT Number)</span><span class="biz-value mono">{{ satelliteDetails()?.pdvNumber || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">Court Registration</span><span class="biz-value">{{ satelliteDetails()?.courtRegistration || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">Activity Code</span><span class="biz-value mono">{{ satelliteDetails()?.activityCode || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">Registration Number</span><span class="biz-value mono">{{ satelliteDetails()?.registrationNumber || '—' }}</span></div>
                    </div>
                  </div>
                } @else {
                  <!-- USA Business Registration -->
                  <div class="biz-card">
                    <h4><i class="bx bx-id-card"></i> Business Registration (USA)</h4>
                    <div class="biz-grid">
                      <div class="biz-field"><span class="biz-label">Legal Business Name</span><span class="biz-value">{{ satelliteDetails()?.legalBusinessName || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">DBA Name</span><span class="biz-value">{{ satelliteDetails()?.dbaName || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">Business Structure</span><span class="biz-value">{{ satelliteDetails()?.businessStructure || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">EIN / Tax ID</span><span class="biz-value mono">{{ satelliteDetails()?.einTaxId || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">State Tax ID</span><span class="biz-value mono">{{ satelliteDetails()?.stateTaxId || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">DOT Number</span><span class="biz-value mono">{{ satelliteDetails()?.dotNumber || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">MC Number</span><span class="biz-value mono">{{ satelliteDetails()?.mcNumber || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">State of Incorporation</span><span class="biz-value">{{ satelliteDetails()?.stateOfIncorporation || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">Incorporation Date</span><span class="biz-value">{{ satelliteDetails()?.incorporationDate || '—' }}</span></div>
                    </div>
                  </div>

                  <!-- Insurance -->
                  <div class="biz-card">
                    <h4><i class="bx bx-shield-quarter"></i> Insurance & Compliance</h4>
                    <div class="biz-grid">
                      <div class="biz-field"><span class="biz-label">Insurance Carrier</span><span class="biz-value">{{ satelliteDetails()?.insuranceCarrier || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">Policy Number</span><span class="biz-value mono">{{ satelliteDetails()?.insurancePolicyNumber || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">Expiration</span><span class="biz-value">{{ satelliteDetails()?.insuranceExpirationDate || '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">Cargo Limit</span><span class="biz-value">{{ satelliteDetails()?.cargoInsuranceLimit ? ('$' + satelliteDetails()?.cargoInsuranceLimit?.toLocaleString()) : '—' }}</span></div>
                      <div class="biz-field"><span class="biz-label">Liability Limit</span><span class="biz-value">{{ satelliteDetails()?.liabilityInsuranceLimit ? ('$' + satelliteDetails()?.liabilityInsuranceLimit?.toLocaleString()) : '—' }}</span></div>
                    </div>
                  </div>
                }

                <!-- Shared fields: Location & Contact -->
                <div class="biz-card">
                  <h4><i class="bx bx-map"></i> Location & Contact</h4>
                  <div class="biz-grid">
                    <div class="biz-field"><span class="biz-label">Address</span><span class="biz-value">{{ satelliteDetails()?.address || '—' }}</span></div>
                    <div class="biz-field"><span class="biz-label">City</span><span class="biz-value">{{ satelliteDetails()?.city || '—' }}</span></div>
                    <div class="biz-field"><span class="biz-label">State / Province</span><span class="biz-value">{{ satelliteDetails()?.state || '—' }}</span></div>
                    <div class="biz-field"><span class="biz-label">ZIP / Postal</span><span class="biz-value">{{ satelliteDetails()?.zipCode || '—' }}</span></div>
                    <div class="biz-field"><span class="biz-label">Country</span><span class="biz-value">{{ satelliteDetails()?.country || '—' }}</span></div>
                    <div class="biz-field"><span class="biz-label">Contact Name</span><span class="biz-value">{{ satelliteDetails()?.contactName || '—' }}</span></div>
                    <div class="biz-field"><span class="biz-label">Contact Email</span><span class="biz-value">{{ satelliteDetails()?.contactEmail || '—' }}</span></div>
                    <div class="biz-field"><span class="biz-label">Contact Phone</span><span class="biz-value">{{ satelliteDetails()?.contactPhone || '—' }}</span></div>
                  </div>
                </div>

                <!-- Financial -->
                <div class="biz-card">
                  <h4><i class="bx bx-dollar-circle"></i> Financial</h4>
                  <div class="biz-grid">
                    <div class="biz-field"><span class="biz-label">Commission Rate</span><span class="biz-value">{{ satelliteDetails()?.commissionRate ? (satelliteDetails()?.commissionRate + '%') : '—' }}</span></div>
                    <div class="biz-field"><span class="biz-label">Revenue Share</span><span class="biz-value">{{ satelliteDetails()?.revenueSharePercent ? (satelliteDetails()?.revenueSharePercent + '%') : '—' }}</span></div>
                    <div class="biz-field"><span class="biz-label">Payment Terms</span><span class="biz-value">{{ satelliteDetails()?.paymentTerms || '—' }}</span></div>
                  </div>
                </div>

                <!-- Owners -->
                <div class="biz-card">
                  <h4><i class="bx bx-group"></i> Satellite Owners</h4>

                  @if (satelliteOwners().length > 0) {
                    <div class="biz-grid">
                      @for (owner of satelliteOwners(); track owner.id) {
                        <div class="biz-field">
                          <span class="biz-label">{{ owner.role }}</span>
                          <span class="biz-value">{{ owner.name }} — {{ owner.ownershipPercent }}%</span>
                        </div>
                      }
                    </div>
                  } @else {
                    <div style="padding:14px;color:#6b7280;font-size:0.8rem;text-align:center">No owners added. Manage owners on the Satellites page.</div>
                  }
                </div>

              </div>
            }

            @if (editModalTab() === 'business' && satelliteLoading()) {
              <div class="form-section">
                <div class="biz-loading"><i class="bx bx-loader-alt bx-spin"></i> Loading satellite business information...</div>
              </div>
            }

            @if (editModalTab() === 'business' && !satelliteLoading() && !satelliteDetails()) {
              <div class="form-section">
                <div class="biz-loading"><i class="bx bx-error-circle"></i> No satellite data available</div>
              </div>
            }

            <!-- ==================== PERSONAL TAB (continued) - Profile & Details ==================== -->
            @if (editModalTab() === 'personal') {

              <!-- Profile Picture -->
              <div class="form-section">
                <h3>Profile Picture</h3>
                <div class="profile-pic-section">
                  <div class="current-avatar">
                    @if (editingEmployee.avatarUrl) {
                      <img [src]="editingEmployee.avatarUrl" alt="Profile">
                    } @else {
                      <i class="bx bx-user"></i>
                    }
                  </div>
                  <div class="avatar-actions">
                    <input type="file" #avatarInput accept="image/*" (change)="onAvatarSelected($event)" style="display: none">
                    <button type="button" class="btn-secondary" (click)="avatarInput.click()">
                      <i class="bx bx-upload"></i> Upload Photo
                    </button>
                    @if (editingEmployee.avatarUrl) {
                      <button type="button" class="btn-secondary" (click)="removeAvatar()">
                        <i class="bx bx-trash"></i> Remove Photo
                      </button>
                    }
                  </div>
                </div>
              </div>

              <!-- Personal Details -->
              <div class="form-section">
                <h3>Personal Details</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>Date of Birth</label>
                    <input type="date" [(ngModel)]="editingEmployee.dateOfBirth" class="form-input">
                  </div>
                  <div class="form-group">
                    <label>ID Number (SSN, Passport, etc.)</label>
                    <input type="text" [(ngModel)]="editingEmployee.idNumber" placeholder="XXX-XX-XXXX" class="form-input">
                  </div>
                </div>
              </div>

              <!-- Physical Characteristics -->
              <div class="form-section">
                <h3>Physical Characteristics</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>Height</label>
                    <input type="text" [(ngModel)]="editingEmployee.height" placeholder="5'10&quot; or 178 cm" class="form-input">
                  </div>
                  <div class="form-group">
                    <label>Weight</label>
                    <input type="text" [(ngModel)]="editingEmployee.weight" placeholder="180 lbs or 82 kg" class="form-input">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Eye Color</label>
                    <select [(ngModel)]="editingEmployee.eyeColor" class="form-select">
                      <option value="">Not specified</option>
                      <option value="Brown">Brown</option>
                      <option value="Blue">Blue</option>
                      <option value="Green">Green</option>
                      <option value="Hazel">Hazel</option>
                      <option value="Gray">Gray</option>
                      <option value="Amber">Amber</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Hair Color</label>
                    <select [(ngModel)]="editingEmployee.hairColor" class="form-select">
                      <option value="">Not specified</option>
                      <option value="Black">Black</option>
                      <option value="Brown">Brown</option>
                      <option value="Blonde">Blonde</option>
                      <option value="Red">Red</option>
                      <option value="Gray">Gray</option>
                      <option value="White">White</option>
                      <option value="Auburn">Auburn</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Demographics -->
              <div class="form-section">
                <h3>Demographics</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>Ethnicity</label>
                    <select [(ngModel)]="editingEmployee.ethnicity" class="form-select">
                      <option value="">Not specified</option>
                      <option value="White/Caucasian">White/Caucasian</option>
                      <option value="Black/African American">Black/African American</option>
                      <option value="Hispanic/Latino">Hispanic/Latino</option>
                      <option value="Asian">Asian</option>
                      <option value="Native American">Native American/Alaska Native</option>
                      <option value="Pacific Islander">Native Hawaiian/Pacific Islander</option>
                      <option value="Middle Eastern">Middle Eastern/North African</option>
                      <option value="Mixed/Multiracial">Mixed/Multiracial</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Religion</label>
                    <select [(ngModel)]="editingEmployee.religion" class="form-select">
                      <option value="">Not specified</option>
                      <option value="Christianity">Christianity</option>
                      <option value="Islam">Islam</option>
                      <option value="Judaism">Judaism</option>
                      <option value="Hinduism">Hinduism</option>
                      <option value="Buddhism">Buddhism</option>
                      <option value="Sikhism">Sikhism</option>
                      <option value="Atheist">Atheist</option>
                      <option value="Agnostic">Agnostic</option>
                      <option value="Spiritual">Spiritual (non-religious)</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Address -->
              <div class="form-section">
                <h3>Home Address</h3>
                <div class="form-group">
                  <label>Street Address</label>
                  <div class="address-lookup-container">
                    <input 
                      type="text" 
                      #addressSearch
                      [(ngModel)]="editingEmployee.address" 
                      (input)="searchAddress($event)"
                      placeholder="Start typing address..." 
                      class="form-input address-search"
                      autocomplete="off">
                    @if (addressSuggestions().length > 0) {
                      <div class="address-suggestions">
                        @for (suggestion of addressSuggestions(); track suggestion.place_id) {
                          <div class="suggestion-item" (click)="selectAddress(suggestion)">
                            <i class="bx bx-map-pin"></i>
                            <div class="suggestion-text">
                              <strong>{{ suggestion.description || suggestion.structured_formatting?.main_text || 'Address' }}</strong>
                              <span class="secondary-text">{{ suggestion.structured_formatting?.secondary_text }}</span>
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>City</label>
                    <input type="text" [(ngModel)]="editingEmployee.city" placeholder="New York" class="form-input">
                  </div>
                  <div class="form-group">
                    <label>State/Province</label>
                    <input type="text" [(ngModel)]="editingEmployee.state" placeholder="NY" class="form-input">
                  </div>
                  <div class="form-group">
                    <label>ZIP/Postal Code</label>
                    <input type="text" [(ngModel)]="editingEmployee.zipCode" placeholder="10001" class="form-input">
                  </div>
                </div>
              </div>

            } <!-- end personal tab -->

            <!-- ==================== EMPLOYMENT TAB ==================== -->
            @if (editModalTab() === 'employment') {

              <!-- Organization & Localization -->
              <div class="form-section">
                <h3>Organization & Localization</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>Organization</label>
                    <select [(ngModel)]="editingEmployee.organizationId" (ngModelChange)="onOrganizationChange($event)" class="form-select">
                      <option *ngFor="let org of organizations()" [value]="org.id">
                        {{ org.name }}
                      </option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Org Country</label>
                    <div class="readonly-display">{{ editingEmployee.orgCountry || 'USA' }}</div>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Employee Country (for labels/formats)</label>
                    <select [(ngModel)]="editingEmployee.country" class="form-select">
                      <option value="USA">🇺🇸 United States</option>
                      <option value="Bosnia">🇧🇦 Bosnia and Herzegovina</option>
                      <option value="Canada">🇨🇦 Canada</option>
                      <option value="Mexico">🇲🇽 Mexico</option>
                      <option value="UK">🇬🇧 United Kingdom</option>
                      <option value="Germany">🇩🇪 Germany</option>
                      <option value="France">🇫🇷 France</option>
                      <option value="Other">🌐 Other</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Language</label>
                    <select [(ngModel)]="editingEmployee.language" class="form-select">
                      <option value="en">🇺🇸 English</option>
                      <option value="bs">🇧🇦 Bosnian</option>
                      <option value="es">🇲🇽 Spanish</option>
                      <option value="fr">🇫🇷 French</option>
                      <option value="de">🇩🇪 German</option>
                    </select>
                  </div>
                </div>
                <div class="locale-info">
                  <i class="bx bx-info-circle"></i>
                  Employee country affects UI labels, date/number formats, and language
                </div>
              </div>

              <!-- Entity Assignment -->
              <div class="form-section">
                <h3>Entity Assignment</h3>
                <div class="form-group">
                  <label>Entity Type</label>
                  <select [(ngModel)]="editingEmployee.entityType" (ngModelChange)="onEditEntityTypeChange()" class="form-select">
                    <option value="corporate">Corporate</option>
                    <option value="satellite">Satellite</option>
                    <option value="agency">Agency</option>
                    <option value="terminal">Terminal</option>
                  </select>
                </div>
                <div class="form-row" *ngIf="editingEmployee.entityType !== 'corporate'">
                  <div class="form-group" *ngIf="editingEmployee.entityType === 'satellite'">
                    <label>Satellite</label>
                    <select [(ngModel)]="editingEmployee.satelliteId" class="form-select">
                      <option [value]="null">Select Satellite</option>
                      <option *ngFor="let satellite of satellites()" [value]="satellite.id">
                        {{ satellite.name }} ({{ satellite.code }})
                      </option>
                    </select>
                  </div>
                  <div class="form-group" *ngIf="editingEmployee.entityType === 'agency'">
                    <label>Agency</label>
                    <select [(ngModel)]="editingEmployee.agencyId" class="form-select">
                      <option [value]="null">Select Agency</option>
                      <option *ngFor="let agency of agencies()" [value]="agency.id">
                        {{ agency.name }} ({{ agency.code }})
                      </option>
                    </select>
                  </div>
                  <div class="form-group" *ngIf="editingEmployee.entityType === 'terminal'">
                    <label>Terminal</label>
                    <select [(ngModel)]="editingEmployee.terminalId" class="form-select">
                      <option [value]="null">Select Terminal</option>
                      <option *ngFor="let terminal of terminals()" [value]="terminal.id">
                        {{ terminal.name }} ({{ terminal.code }})
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Role & Status -->
              <div class="form-section">
                <h3>Role & Status</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>Role *</label>
                    <select [(ngModel)]="editingEmployee.role" class="form-select" required>
                      <option *ngFor="let r of availableRoles()" [value]="r.value">{{ r.label }}</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Status</label>
                    <select [(ngModel)]="editingEmployee.status" class="form-select">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Division, Department & Position -->
              <div class="form-section">
                <h3>Division, Department & Position</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>Division</label>
                    <select [(ngModel)]="editingEmployee.divisionId" class="form-select">
                      <option [value]="null">Select Division</option>
                      <option *ngFor="let div of getFilteredDivisions(editingEmployee.organizationId)" [value]="div.id">
                        {{ div.name }}
                      </option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Department</label>
                    <select [(ngModel)]="editingEmployee.departmentId" class="form-select">
                      <option [value]="null">Select Department</option>
                      <option *ngFor="let dept of getFilteredDepartments(editingEmployee.organizationId)" [value]="dept.id">
                        {{ dept.name }}
                      </option>
                    </select>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Position</label>
                    <select [(ngModel)]="editingEmployee.positionId" class="form-select">
                      <option [value]="null">Select Position</option>
                      <option *ngFor="let pos of getFilteredPositions(editingEmployee.departmentId)" [value]="pos.id">
                        {{ pos.title }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Preferences -->
              <div class="form-section">
                <h3>Preferences</h3>
                <div class="form-group">
                  <label>Timezone</label>
                  <select [(ngModel)]="editingEmployee.timezone" class="form-select">
                    <option value="America/New_York">🇺🇸 Eastern Time (New York)</option>
                    <option value="America/Chicago">🇺🇸 Central Time (Chicago)</option>
                    <option value="America/Denver">🇺🇸 Mountain Time (Denver)</option>
                    <option value="America/Los_Angeles">🇺🇸 Pacific Time (Los Angeles)</option>
                    <option value="Europe/Sarajevo">🇧🇦 Central European Time (Sarajevo)</option>
                    <option value="Europe/London">🇬🇧 GMT (London)</option>
                    <option value="Europe/Paris">🇫🇷 Central European Time (Paris)</option>
                    <option value="Europe/Berlin">🇩🇪 Central European Time (Berlin)</option>
                    <option value="America/Mexico_City">🇲🇽 Central Time (Mexico City)</option>
                    <option value="America/Toronto">🇨🇦 Eastern Time (Toronto)</option>
                  </select>
                </div>
              </div>

            } <!-- end employment tab (second block) -->

            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" (click)="cancelEdit()">
              <i class="bx bx-x"></i> Cancel
            </button>
            <button class="btn-primary" (click)="saveEmployee()">
              <i class="bx bx-save"></i> Save Changes
            </button>
          </div>
        </div>
      </div>

      <!-- Add Employee Modal -->
      <div *ngIf="showAddModal" class="modal-overlay" (click)="showAddModal = false">
        <div class="modal-content modal-compact" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2><i class="bx bx-user-plus"></i> Add New Employee</h2>
            <button class="close-btn" (click)="showAddModal = false">
              <i class="bx bx-x"></i>
            </button>
          </div>

          <div class="modal-body">
            <div class="form-grid">
              <div class="form-section">
                <div class="form-row">
                  <div class="form-group">
                    <label>Full Name *</label>
                    <input type="text" [(ngModel)]="newEmployee.name" placeholder="John Doe" class="form-input" required>
                  </div>
                  <div class="form-group">
                    <label>Email *</label>
                    <input type="email" [(ngModel)]="newEmployee.email" placeholder="john.doe@company.com" class="form-input" required>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Role *</label>
                    <select [(ngModel)]="newEmployee.role" class="form-select" required>
                      <option value="">Select Role</option>
                      <option *ngFor="let r of availableRoles()" [value]="r.value">{{ r.label }}</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Organization</label>
                    <select [(ngModel)]="newEmployee.organizationId" class="form-select">
                      <option *ngFor="let org of organizations()" [value]="org.id">{{ org.name }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Credentials -->
              <div class="form-section">
                <h3>Login Credentials</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>Password *</label>
                    <input type="password" [(ngModel)]="newEmployee.password" placeholder="Min. 8 characters" class="form-input" required>
                  </div>
                  <div class="form-group">
                    <label>Confirm Password *</label>
                    <input type="password" [(ngModel)]="newEmployee.confirmPassword" placeholder="Re-enter password" class="form-input" required>
                  </div>
                </div>
                <div class="password-hint" *ngIf="newEmployee.password && newEmployee.password !== newEmployee.confirmPassword">
                  <i class="bx bx-error-circle"></i> Passwords do not match
                </div>
              </div>
            </div>

            <div class="add-hint">
              <i class="bx bx-info-circle"></i>
              Additional details (phone, department, position, documents, etc.) can be added after creation via <strong>Edit Employee</strong>.
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" (click)="cancelAdd()">
              <i class="bx bx-x"></i> Cancel
            </button>
            <button class="btn-primary" (click)="addEmployee()" [disabled]="!isFormValid()">
              <i class="bx bx-check"></i> Create Employee
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .roster-page {
      padding: 24px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }

    .page-header h1 {
      color: #00f2fe;
      font-size: 2rem;
      margin: 0 0 8px 0;
      display: flex;
      align-items: center;
      gap: 12px;
      text-shadow: 0 0 20px rgba(0, 242, 254, 0.5);
    }

    .page-header p {
      color: #9ca3af;
      margin: 0;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-shrink: 0;
    }

    .btn-secondary {
      background: rgba(156, 163, 175, 0.2);
      border: 1px solid rgba(156, 163, 175, 0.3);
      color: #9ca3af;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .btn-secondary:hover:not(:disabled) {
      background: rgba(156, 163, 175, 0.3);
      border-color: rgba(0, 242, 254, 0.4);
      color: #00f2fe;
    }

    .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-satellite {
      background: rgba(0, 200, 83, 0.1);
      border: 1px solid rgba(0, 200, 83, 0.3);
      color: #00c853;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .btn-satellite:hover {
      background: rgba(0, 200, 83, 0.2);
      border-color: rgba(0, 200, 83, 0.5);
      box-shadow: 0 0 12px rgba(0, 200, 83, 0.15);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin: 24px 0;
    }

    .stat-card {
      background: rgba(26, 26, 46, 0.6);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .stat-card i {
      font-size: 1.8rem;
      color: #00f2fe;
    }

    .stat-card .value {
      display: block;
      font-size: 1.4rem;
      font-weight: 700;
      color: #fff;
    }

    .stat-card.total { border-color: rgba(0, 212, 255, 0.3); }
    .stat-card.total i { color: #00d4ff; }
    .stat-card.total .value { color: #00d4ff; }

    .stat-card.active { border-color: rgba(34, 197, 94, 0.3); }
    .stat-card.active i { color: #22c55e; }
    .stat-card.active .value { color: #22c55e; }

    .stat-card.inactive { border-color: rgba(239, 68, 68, 0.3); }
    .stat-card.inactive i { color: #ef4444; }
    .stat-card.inactive .value { color: #ef4444; }

    .stat-card.pending { border-color: rgba(251, 191, 36, 0.3); }
    .stat-card.pending i { color: #fbbf24; }
    .stat-card.pending .value { color: #fbbf24; }

    .stat-card.suspended { border-color: rgba(168, 85, 247, 0.3); }
    .stat-card.suspended i { color: #a855f7; }
    .stat-card.suspended .value { color: #a855f7; }

    .stat-card.archived { border-color: rgba(156, 163, 175, 0.3); }
    .stat-card.archived i { color: #9ca3af; }
    .stat-card.archived .value { color: #9ca3af; }

    .stat-card.bulk { border-color: rgba(0, 242, 254, 0.3); }
    .stat-card.bulk i { color: #00f2fe; }
    .stat-card.bulk .value { color: #00f2fe; }
    .stat-card.bulk:hover { border-color: rgba(0, 242, 254, 0.5); background: rgba(0, 242, 254, 0.05); }

    .stat-card .label {
      display: block;
      font-size: 0.85rem;
      color: #9ca3af;
      margin-top: 4px;
    }

    .roster-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
      border-bottom: 1px solid #2a2a4e;
    }

    .roster-tab {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border: none;
      background: transparent;
      color: #888;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;

      &:hover { color: #ccc; }
      &.active { color: var(--cyan, #00d4ff); border-bottom-color: var(--cyan, #00d4ff); }
    }

    .tab-count {
      font-size: 0.72rem;
      background: rgba(0, 212, 255, 0.1);
      color: var(--cyan, #00d4ff);
      padding: 1px 7px;
      border-radius: 10px;
    }

    .roster-tab.active .tab-count {
      background: rgba(0, 212, 255, 0.2);
    }

    .entity-tabs {
      display: flex;
      gap: 2px;
      margin-bottom: 16px;
      padding: 4px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 10px;
      width: fit-content;
    }

    .entity-tab {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 6px 14px;
      border: none;
      background: transparent;
      color: #888;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.15s;
    }

    .entity-tab:hover { color: #ccc; background: rgba(255,255,255,0.04); }
    .entity-tab.active { color: #fff; background: rgba(0, 212, 255, 0.15); }
    .entity-tab i { font-size: 0.9rem; }

    .entity-count {
      font-size: 0.68rem;
      background: rgba(255,255,255,0.06);
      padding: 1px 6px;
      border-radius: 8px;
    }
    .entity-tab.active .entity-count {
      background: rgba(0, 212, 255, 0.2);
      color: #00d4ff;
    }

    .filters-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
    }

    .search-input,
    .filter-select {
      background: rgba(16, 18, 27, 0.8);
      border: 1px solid rgba(0, 242, 254, 0.3);
      border-radius: 8px;
      padding: 10px 16px;
      color: #e0e0e0;
      outline: none;
    }

    .search-input {
      flex: 1;
    }

    .roster-table {
      background: rgba(26, 26, 46, 0.6);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 242, 254, 0.3);
      border-radius: 16px;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead {
      background: rgba(16, 18, 27, 0.8);
    }

    th {
      padding: 16px;
      text-align: left;
      color: #00f2fe;
      font-weight: 600;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid rgba(0, 242, 254, 0.3);
    }

    td {
      padding: 16px;
      color: #e0e0e0;
      border-bottom: 1px solid rgba(0, 242, 254, 0.1);
    }

    tr:hover {
      background: rgba(0, 242, 254, 0.05);
    }

    tr.inactive {
      opacity: 0.6;
    }

    .employee-name {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .name-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .employee-name strong {
      color: #00f2fe;
    }

    .doc-flag {
      color: #ef4444;
      font-size: 0.9rem;
      animation: pulse-flag 2s ease-in-out infinite;
      margin-left: 2px;
    }
    @keyframes pulse-flag {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .employee-alias {
      font-size: 0.78rem;
      color: #a78bfa;
      font-style: italic;
    }

    .employee-id {
      font-size: 0.8rem;
      color: #9ca3af;
    }

    .entity-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .entity-type {
      font-size: 0.75rem;
      color: #9ca3af;
      text-transform: uppercase;
    }

    .entity-name {
      color: #00f2fe;
      font-weight: 500;
    }

    .role-badge,
    .status-badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-badge.active {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.4);
    }

    .status-badge.inactive {
      background: rgba(156, 163, 175, 0.2);
      color: #9ca3af;
    }

    .role-badge {
      background: rgba(102, 126, 234, 0.2);
      color: #667eea;
      border: 1px solid rgba(102, 126, 234, 0.4);
    }

    .loading,
    .empty-state {
      text-align: center;
      padding: 60px;
      color: #9ca3af;
    }

    .roster-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      background: rgba(16, 18, 27, 0.6);
      border: 1px solid rgba(0, 242, 254, 0.1);
      border-radius: 12px;
      margin-top: 12px;
    }
    .pagination-info { color: #9ca3af; font-size: 0.85rem; }
    .pagination-controls { display: flex; align-items: center; gap: 12px; }
    .page-btn {
      background: rgba(0, 242, 254, 0.1);
      border: 1px solid rgba(0, 242, 254, 0.2);
      color: #00f2fe;
      width: 34px; height: 34px;
      border-radius: 8px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    .page-btn:hover:not(:disabled) { background: rgba(0, 242, 254, 0.2); }
    .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .page-current { color: #e0e0e0; font-size: 0.85rem; font-weight: 600; }
    .pagination-size select {
      background: rgba(16, 18, 27, 0.8);
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 8px;
      padding: 7px 12px;
      color: #e0e0e0;
      font-size: 0.82rem;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.3s ease;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .modal-content {
      background: linear-gradient(135deg, rgba(26, 26, 46, 0.98) 0%, rgba(16, 18, 27, 0.98) 100%);
      border: 1px solid rgba(0, 242, 254, 0.3);
      border-radius: 20px;
      width: 90%;
      max-width: 900px;
      max-height: 90vh;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 242, 254, 0.3);
      animation: slideUp 0.3s ease;
      display: flex;
      flex-direction: column;
    }

    @keyframes slideUp {
      from { transform: translateY(50px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px 32px;
      border-bottom: 1px solid rgba(0, 242, 254, 0.2);
    }

    .modal-header h2 {
      color: #00f2fe;
      font-size: 1.5rem;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 12px;
      text-shadow: 0 0 20px rgba(0, 242, 254, 0.5);
    }

    .close-btn {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #ef4444;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .close-btn:hover {
      background: rgba(239, 68, 68, 0.3);
      transform: scale(1.1);
    }

    .close-btn i {
      font-size: 1.5rem;
    }

    .modal-body {
      padding: 32px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }

    .modal-body::-webkit-scrollbar {
      width: 8px;
    }

    .modal-body::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }

    .modal-body::-webkit-scrollbar-thumb {
      background: rgba(0, 242, 254, 0.3);
      border-radius: 4px;
    }

    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    .form-section {
      background: rgba(16, 18, 27, 0.6);
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 12px;
      padding: 24px;
    }

    .form-section h3 {
      color: #00f2fe;
      font-size: 1.1rem;
      margin: 0 0 20px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 16px;
    }

    .form-row:last-child {
      margin-bottom: 0;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-group label {
      color: #9ca3af;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .form-input,
    .form-select {
      background: rgba(26, 26, 46, 0.8);
      border: 1px solid rgba(0, 242, 254, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      color: #e0e0e0;
      font-size: 0.95rem;
      outline: none;
      transition: all 0.2s ease;
    }

    .form-select option {
      background: #16213e !important;
      color: #e0e0e0 !important;
      padding: 10px;
      font-weight: 500;
    }

    .form-select option:hover {
      background: rgba(0, 242, 254, 0.15) !important;
      color: #00f2fe !important;
    }

    .form-select option:checked,
    .form-select option:focus,
    .form-select option[selected] {
      background: rgba(0, 242, 254, 0.25) !important;
      color: #00f2fe !important;
      font-weight: 600;
    }

    .form-input:focus,
    .form-select:focus {
      border-color: #00f2fe;
      box-shadow: 0 0 0 3px rgba(0, 242, 254, 0.1);
    }

    .form-input::placeholder {
      color: #6b7280;
    }

    .same-as-btn {
      background: rgba(0, 242, 254, 0.1);
      border: 1px solid rgba(0, 242, 254, 0.25);
      color: #00f2fe;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      margin-left: 8px;
      transition: all 0.2s;
    }
    .same-as-btn:hover {
      background: rgba(0, 242, 254, 0.2);
    }

    .password-input-group {
      display: flex;
      position: relative;
    }
    .password-input-group .form-input {
      flex: 1;
      padding-right: 40px;
    }
    .pw-toggle {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      font-size: 1.1rem;
      padding: 4px;
      &:hover { color: #00f2fe; }
    }

    .phone-input-group {
      display: flex;
      gap: 0;
    }
    .phone-country-select {
      background: rgba(26, 26, 46, 0.8);
      border: 1px solid rgba(0, 242, 254, 0.3);
      border-right: none;
      border-radius: 8px 0 0 8px;
      padding: 10px 8px;
      color: #00f2fe;
      font-size: 0.8rem;
      font-weight: 600;
      min-width: 80px;
    }
    .phone-number-input {
      border-radius: 0 8px 8px 0 !important;
      flex: 1;
    }

    .password-hint {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #ef4444;
      font-size: 0.85rem;
      margin-top: 8px;
    }

    .modal-compact {
      max-width: 600px;
    }

    .add-hint {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #9ca3af;
      font-size: 0.82rem;
      background: rgba(0, 242, 254, 0.05);
      border: 1px solid rgba(0, 242, 254, 0.15);
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 8px;
      i { color: #00f2fe; }
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 24px 32px;
      border-top: 1px solid rgba(0, 242, 254, 0.2);
      background: rgba(16, 18, 27, 0.95);
      flex-shrink: 0;
      position: sticky;
      bottom: 0;
      z-index: 10;
    }

    .btn-secondary {
      background: rgba(156, 163, 175, 0.2);
      border: 1px solid rgba(156, 163, 175, 0.3);
      color: #9ca3af;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .btn-secondary:hover {
      background: rgba(156, 163, 175, 0.3);
    }

    .action-buttons {
      display: flex;
      gap: 8px;
      justify-content: flex-start;
    }

    .action-btn {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 1.1rem;
    }

    .action-btn i {
      pointer-events: none;
    }

    .action-btn.view {
      background: rgba(59, 130, 246, 0.2);
      color: #3b82f6;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .action-btn.view:hover {
      background: rgba(59, 130, 246, 0.3);
      transform: scale(1.1);
    }

    .action-btn.edit {
      background: rgba(251, 191, 36, 0.2);
      color: #fbbf24;
      border: 1px solid rgba(251, 191, 36, 0.3);
    }

    .action-btn.edit:hover {
      background: rgba(251, 191, 36, 0.3);
      transform: scale(1.1);
    }

    .action-btn.toggle {
      background: rgba(156, 163, 175, 0.2);
      color: #9ca3af;
      border: 1px solid rgba(156, 163, 175, 0.3);
      font-size: 1.3rem;
    }

    .action-btn.toggle.active {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .action-btn.toggle.inactive {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .action-btn.toggle:hover {
      transform: scale(1.1);
    }

    .action-btn.toggle.active:hover {
      background: rgba(34, 197, 94, 0.3);
    }

    .action-btn.toggle.inactive:hover {
      background: rgba(239, 68, 68, 0.3);
    }

    .action-btn.delete {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .action-btn.delete:hover {
      background: rgba(239, 68, 68, 0.3);
      transform: scale(1.1);
    }

    .action-btn.archive {
      background: rgba(255, 170, 0, 0.15);
      color: #ffaa00;
      border: 1px solid rgba(255, 170, 0, 0.3);
    }

    .action-btn.archive:hover {
      background: rgba(255, 170, 0, 0.25);
      transform: scale(1.1);
    }

    .action-btn.restore {
      background: rgba(0, 255, 136, 0.15);
      color: #00ff88;
      border: 1px solid rgba(0, 255, 136, 0.3);
    }

    .action-btn.restore:hover {
      background: rgba(0, 255, 136, 0.25);
      transform: scale(1.1);
    }

    /* Details Modal Styles */
    .details-modal {
      max-width: 1000px;
    }

    .details-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }

    .detail-section {
      background: rgba(16, 18, 27, 0.6);
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 12px;
      padding: 20px;
    }

    .detail-section.full-width {
      grid-column: 1 / -1;
    }

    .detail-section h3 {
      color: #00f2fe;
      font-size: 1rem;
      margin: 0 0 16px 0;
      display: flex;
      align-items: center;
      gap: 8px;
      text-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid rgba(0, 242, 254, 0.1);
    }

    .detail-row:last-child {
      border-bottom: none;
    }

    .detail-label {
      color: #9ca3af;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .detail-value {
      color: #e0e0e0;
      font-weight: 600;
      text-align: right;
    }

    .detail-value.mono {
      font-family: 'Courier New', monospace;
      font-size: 0.85rem;
      color: #00f2fe;
    }

    .details-grid .role-badge,
    .details-grid .status-badge {
      margin-left: auto;
    }

    .address-text {
      text-align: right;
      line-height: 1.5;
      max-width: 300px;
    }

    .detail-value i.bx-world {
      color: #00f2fe;
      margin-right: 6px;
    }

    .form-input[readonly] {
      background: rgba(26, 26, 46, 0.4);
      color: #9ca3af;
      cursor: not-allowed;
    }

    .readonly-display {
      background: rgba(26, 26, 46, 0.4);
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 8px;
      padding: 12px 16px;
      color: #9ca3af;
      font-size: 0.95rem;
    }

    .locale-info {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      color: #3b82f6;
      font-size: 0.85rem;
      margin-top: 12px;
      padding: 10px 12px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 6px;
      line-height: 1.4;
    }

    .locale-info i {
      font-size: 1.1rem;
      margin-top: 2px;
    }

    .header-with-avatar {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-with-avatar h2 {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .alias-tag {
      font-size: 0.85rem;
      color: #fbbf24;
      font-weight: 500;
      font-style: italic;
      opacity: 0.9;
    }

    .avatar-circle {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: rgba(0, 242, 254, 0.2);
      border: 2px solid rgba(0, 242, 254, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .avatar-circle img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-circle i {
      font-size: 2rem;
      color: #00f2fe;
    }

    .profile-pic-section {
      display: flex;
      gap: 24px;
      align-items: center;
    }

    .current-avatar {
      width: 120px;
      height: 120px;
      border-radius: 12px;
      background: rgba(0, 242, 254, 0.1);
      border: 2px solid rgba(0, 242, 254, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .current-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .current-avatar i {
      font-size: 4rem;
      color: rgba(0, 242, 254, 0.5);
    }

    .avatar-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .modal-tabs {
      display: flex;
      gap: 4px;
      padding: 0 32px;
      border-bottom: 2px solid rgba(0, 242, 254, 0.2);
      background: rgba(16, 18, 27, 0.6);
    }

    .edit-modal-tabs {
      display: flex;
      gap: 0;
      border-bottom: 2px solid rgba(0, 242, 254, 0.15);
      background: rgba(16, 18, 27, 0.4);
      padding: 0 24px;

      button {
        background: transparent;
        border: none;
        color: #6b7280;
        padding: 12px 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        font-size: 0.82rem;
        border-bottom: 2px solid transparent;
        transition: all 0.15s;
        position: relative;
        top: 2px;

        i { font-size: 1rem; }

        &:hover { color: #00f2fe; background: rgba(0, 242, 254, 0.03); }
        &.active {
          color: #00f2fe;
          border-bottom-color: #00f2fe;
        }
      }
    }

    .country-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: rgba(0, 242, 254, 0.04);
      border: 1px solid rgba(0, 242, 254, 0.12);
      border-radius: 6px;
      font-size: 0.82rem;
      color: #9ca3af;
      margin-bottom: 16px;
      i { color: #00f2fe; font-size: 1.1rem; }
    }

    .bank-accounts-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 16px;
    }

    .bank-account-card {
      border: 1px solid rgba(0, 242, 254, 0.1);
      border-radius: 8px;
      background: rgba(16, 18, 27, 0.5);
      overflow: hidden;
    }

    .bank-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: rgba(0, 242, 254, 0.03);
      border-bottom: 1px solid rgba(0, 242, 254, 0.06);
    }

    .bank-name {
      font-weight: 600;
      font-size: 0.88rem;
      color: #e5e7eb;
      display: flex;
      align-items: center;
      gap: 6px;
      i { color: #00f2fe; }
    }

    .account-type-badge {
      padding: 2px 10px;
      border-radius: 4px;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      background: rgba(0, 242, 254, 0.1);
      color: #00f2fe;
    }

    .bank-card-body {
      padding: 10px 14px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .bank-field {
      .field-label { display: block; font-size: 0.65rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.3px; }
      .field-value { display: block; font-size: 0.85rem; color: #e5e7eb; }
      .field-value.mono { font-family: 'Courier New', monospace; color: #00f2fe; letter-spacing: 1px; }
    }

    .bank-card-actions {
      display: flex;
      gap: 6px;
      padding: 8px 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.03);
    }

    .btn-sm {
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid rgba(0, 242, 254, 0.2);
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      font-size: 0.72rem;
      display: flex;
      align-items: center;
      gap: 4px;
      &:hover { color: #00f2fe; border-color: rgba(0, 242, 254, 0.4); }
      &.btn-danger:hover { color: #ff4444; border-color: rgba(255, 68, 68, 0.3); }
    }

    .bank-form {
      padding: 16px;
      border: 1px solid rgba(0, 242, 254, 0.12);
      border-radius: 8px;
      background: rgba(16, 18, 27, 0.4);
      margin-top: 12px;
      h4 { margin: 0 0 12px; color: #00f2fe; font-size: 0.9rem; }
    }

    .bank-form-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      justify-content: flex-end;
    }

    .btn-add-account {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      border-radius: 6px;
      border: 1px dashed rgba(0, 242, 254, 0.3);
      background: transparent;
      color: #00f2fe;
      cursor: pointer;
      font-size: 0.82rem;
      font-weight: 600;
      width: 100%;
      justify-content: center;
      margin-top: 12px;
      &:hover { background: rgba(0, 242, 254, 0.04); border-color: rgba(0, 242, 254, 0.5); }
    }

    .biz-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      h3 { margin: 0; display: flex; align-items: center; gap: 8px; i { color: #00f2fe; } }
    }

    .biz-edit-link {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #00f2fe;
      font-size: 0.78rem;
      text-decoration: none;
      padding: 4px 10px;
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 4px;
      &:hover { background: rgba(0, 242, 254, 0.06); border-color: rgba(0, 242, 254, 0.4); }
    }

    .biz-card {
      border: 1px solid rgba(0, 242, 254, 0.08);
      border-radius: 8px;
      background: rgba(16, 18, 27, 0.4);
      margin-bottom: 14px;
      overflow: hidden;

      h4 {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        padding: 10px 14px;
        font-size: 0.8rem;
        color: #00f2fe;
        background: rgba(0, 242, 254, 0.03);
        border-bottom: 1px solid rgba(0, 242, 254, 0.06);
        i { font-size: 1rem; }
      }
    }

    .biz-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px;
      padding: 10px 14px;
    }

    .biz-field {
      padding: 6px 8px;
      border-radius: 4px;
      .biz-label {
        display: block;
        font-size: 0.62rem;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-bottom: 2px;
      }
      .biz-value {
        display: block;
        font-size: 0.85rem;
        color: #e5e7eb;
        &.mono { font-family: 'Courier New', monospace; color: #00f2fe; letter-spacing: 0.5px; }
      }
    }

    .owners-list {
      padding: 6px 14px;
    }
    .owner-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      &:last-child { border-bottom: none; }
    }
    .owner-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .owner-name {
      font-size: 0.85rem;
      color: #e5e7eb;
      display: flex;
      align-items: center;
      gap: 4px;
      i { color: #00f2fe; font-size: 0.9rem; }
    }
    .owner-role {
      font-size: 0.68rem;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(0, 242, 254, 0.08);
      color: #00f2fe;
      text-transform: uppercase;
      font-weight: 600;
    }
    .owner-pct {
      font-size: 0.88rem;
      font-weight: 700;
      color: #00c853;
      min-width: 40px;
      text-align: right;
    }
    .owner-actions {
      display: flex;
      gap: 4px;
    }
    .owner-form {
      padding: 12px 14px;
      border-top: 1px solid rgba(0,242,254,0.06);
    }

    .biz-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
      padding: 40px;
      color: #6b7280;
      font-size: 0.85rem;
      i { color: #00f2fe; font-size: 1.2rem; }
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: #9ca3af;
      padding: 16px 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 0.95rem;
      border-bottom: 3px solid transparent;
      transition: all 0.2s ease;
      position: relative;
      top: 2px;
    }

    .tab-btn:hover {
      color: #00f2fe;
      background: rgba(0, 242, 254, 0.05);
    }

    .tab-btn.active {
      color: #00f2fe;
      border-bottom-color: #00f2fe;
      background: rgba(0, 242, 254, 0.1);
    }

    .tab-btn i {
      font-size: 1.2rem;
    }

    .documents-section {
      padding: 24px;
    }

    .documents-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .documents-header h3 {
      color: #00f2fe;
      font-size: 1.2rem;
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }

    .documents-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .document-card {
      background: rgba(16, 18, 27, 0.6);
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      transition: all 0.2s ease;
    }

    .document-card:hover {
      border-color: rgba(0, 242, 254, 0.4);
      background: rgba(0, 242, 254, 0.05);
    }

    .doc-icon {
      width: 48px;
      height: 48px;
      background: rgba(0, 242, 254, 0.1);
      border: 1px solid rgba(0, 242, 254, 0.3);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .doc-icon i {
      font-size: 1.8rem;
      color: #00f2fe;
    }

    .doc-info {
      flex: 1;
      min-width: 0;
    }

    .doc-name {
      color: #e0e0e0;
      font-weight: 600;
      font-size: 0.95rem;
      margin-bottom: 6px;
    }

    .doc-meta {
      display: flex;
      gap: 12px;
      font-size: 0.8rem;
      color: #9ca3af;
    }

    .doc-type {
      color: #00f2fe;
      text-transform: capitalize;
    }

    .doc-actions {
      display: flex;
      gap: 8px;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #9ca3af;
    }

    .empty-state i {
      font-size: 4rem;
      color: rgba(0, 242, 254, 0.3);
      margin-bottom: 16px;
    }

    .empty-state p {
      margin: 0;
      font-size: 1.1rem;
    }

    .mandatory-docs-section {
      margin-bottom: 32px;
    }

    .mandatory-docs-section h3 {
      color: #00f2fe;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 16px 0;
    }

    .mandatory-docs-table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(16, 18, 27, 0.6);
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 12px;
      overflow: hidden;
    }

    .mandatory-docs-table thead {
      background: rgba(0, 242, 254, 0.1);
    }

    .mandatory-docs-table th {
      padding: 12px 16px;
      text-align: left;
      color: #00f2fe;
      font-weight: 600;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid rgba(0, 242, 254, 0.3);
    }

    .mandatory-docs-table td {
      padding: 12px 16px;
      color: #e0e0e0;
      border-bottom: 1px solid rgba(0, 242, 254, 0.08);
      font-size: 0.88rem;
    }

    .mandatory-docs-table tr:last-child td {
      border-bottom: none;
    }

    .mandatory-docs-table tr.uploaded {
      opacity: 0.7;
    }
    .mandatory-docs-table tr.uploaded td:first-child {
      text-decoration: line-through;
      text-decoration-color: rgba(0, 255, 136, 0.5);
    }

    .mandatory-docs-table tr:hover {
      background: rgba(0, 242, 254, 0.05);
    }

    .mandatory-docs-table td i {
      margin-right: 8px;
      color: #00f2fe;
    }

    .required-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .required-badge:not(.optional) {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .required-badge.optional {
      background: rgba(156, 163, 175, 0.2);
      color: #9ca3af;
      border: 1px solid rgba(156, 163, 175, 0.3);
    }

    .category-badge {
      padding: 3px 10px;
      border-radius: 10px;
      font-size: 0.72rem;
      font-weight: 600;
      background: rgba(255, 170, 0, 0.12);
      color: #ffaa00;
      white-space: nowrap;
    }

    .status-badge {
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .status-badge.uploaded {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .status-badge.missing {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.2);
      font-size: 0.72rem;
    }

    .status-badge.uploaded {
      font-size: 0.72rem;
    }

    .expiry-date {
      font-size: 0.82rem;
      color: #ccc;
      &.expiring { color: #ffaa00; }
      &.expired { color: #ff4444; font-weight: 600; }
      &:hover { text-decoration: underline; }
    }
    .expiry-none { color: #555; font-size: 0.82rem; }
    .expiry-input {
      padding: 4px 8px; border: 1px solid var(--cyan, #00e5ff); border-radius: 6px;
      background: rgba(0,0,0,0.3); color: #fff; font-size: 0.82rem; outline: none;
      width: 140px;
    }
    .edit-docs-empty {
      text-align: center; padding: 40px 20px; color: #888;
      i { display: block; font-size: 2.5rem; color: var(--cyan); opacity: 0.4; margin-bottom: 12px; }
      p { margin: 0 0 16px; }
    }
    .edit-docs-actions { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .edit-docs-table {
      width: 100%; border-collapse: collapse;
      th, td { padding: 10px 12px; text-align: left; font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
      th { color: var(--cyan, #00e5ff); font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; background: rgba(255,255,255,0.02); }
      td { color: #ccc; }
      tbody tr:hover { background: rgba(0,229,255,0.03); }
      tbody tr:last-child td { border-bottom: none; }
    }
    .doc-name-cell {
      display: flex; align-items: center; gap: 8px;
      i { color: var(--cyan); font-size: 1.1rem; }
      span { font-weight: 500; }
    }
    .doc-date-cell { color: #888; font-size: 0.8rem; }
    .doc-actions-cell { display: flex; gap: 4px; }
    .expiry-input-inline {
      padding: 5px 8px; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
      background: rgba(0,0,0,0.3); color: #fff; font-size: 0.82rem; outline: none; width: 140px;
      &:focus { border-color: var(--cyan, #00e5ff); box-shadow: 0 0 6px rgba(0,212,255,0.2); }
    }
    .section-hint { color: #888; font-size: 0.82rem; margin: -8px 0 16px; }
    .btn-sm { padding: 8px 16px; font-size: 0.82rem; border-radius: 8px; }

    .action-btn-inline {
      width: 28px; height: 28px; border-radius: 6px;
      border: 1px solid rgba(0, 212, 255, 0.2); background: transparent;
      color: var(--cyan, #00e5ff); cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 1rem; transition: all 0.2s;
      &:hover { background: rgba(0, 212, 255, 0.1); border-color: var(--cyan); box-shadow: 0 0 8px rgba(0,212,255,0.2); }
    }

    .doc-expiry {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 0.72rem; color: #aaa;
      i { font-size: 0.8rem; }
      &.expiring { color: #ffaa00; }
      &.expired { color: #ff4444; font-weight: 600; }
    }

    .empty-docs {
      text-align: center; padding: 30px 20px; color: #888;
      i { font-size: 1.5rem; color: #555; display: block; margin-bottom: 8px; }
      p { margin: 0; font-size: 0.88rem; }
    }

    .status-badge.pending {
      background: rgba(156, 163, 175, 0.2);
      color: #9ca3af;
      border: 1px solid rgba(156, 163, 175, 0.3);
    }

    .action-btn.upload {
      background: rgba(0, 242, 254, 0.2);
      color: #00f2fe;
      border: 1px solid rgba(0, 242, 254, 0.3);
    }

    .action-btn.upload:hover {
      background: rgba(0, 242, 254, 0.3);
      transform: scale(1.1);
    }

    /* Onboarding/Offboarding Sections */
    .onboarding-section,
    .offboarding-section,
    .evaluations-section {
      padding: 24px;
    }

    .onboarding-section h3,
    .offboarding-section h3 {
      color: #00f2fe;
      font-size: 1.2rem;
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 24px 0;
    }

    .onboarding-checklist,
    .offboarding-checklist {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 32px;
    }

    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: rgba(16, 18, 27, 0.6);
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 12px;
      transition: all 0.2s ease;
    }

    .checklist-item:hover {
      border-color: rgba(0, 242, 254, 0.4);
      background: rgba(0, 242, 254, 0.05);
    }

    .checklist-item input[type="checkbox"] {
      width: 20px;
      height: 20px;
      margin-top: 2px;
      cursor: pointer;
      accent-color: #00f2fe;
    }

    .checklist-item label {
      flex: 1;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .checklist-item label strong {
      color: #e0e0e0;
      font-size: 0.95rem;
    }

    .checklist-item label span {
      color: #9ca3af;
      font-size: 0.85rem;
    }

    .onboarding-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 24px;
    }

    .stat {
      background: rgba(16, 18, 27, 0.6);
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }

    .stat-value {
      display: block;
      font-size: 2rem;
      font-weight: 700;
      color: #00f2fe;
      margin-bottom: 8px;
    }

    .stat-label {
      display: block;
      color: #9ca3af;
      font-size: 0.85rem;
    }

    .offboarding-info {
      background: rgba(16, 18, 27, 0.6);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }

    .info-row {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 16px;
      align-items: center;
      margin-bottom: 16px;
    }

    .info-row:last-child {
      margin-bottom: 0;
    }

    .info-row .label {
      color: #9ca3af;
      font-weight: 600;
    }

    /* Evaluations */
    .evaluations-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .evaluations-header h3 {
      color: #00f2fe;
      font-size: 1.2rem;
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }

    .evaluations-timeline {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .evaluation-card {
      background: rgba(16, 18, 27, 0.6);
      border: 1px solid rgba(0, 242, 254, 0.2);
      border-radius: 12px;
      padding: 20px;
    }

    .eval-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(0, 242, 254, 0.1);
    }

    .eval-title strong {
      color: #00f2fe;
      font-size: 1.1rem;
      display: block;
      margin-bottom: 4px;
    }

    .eval-date {
      color: #9ca3af;
      font-size: 0.85rem;
    }

    .eval-score {
      font-size: 1.8rem;
      font-weight: 700;
      color: #fbbf24;
    }

    .eval-categories {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }

    .category {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: rgba(0, 242, 254, 0.05);
      border-radius: 8px;
    }

    .cat-name {
      color: #e0e0e0;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .rating-stars {
      display: flex;
      gap: 2px;
    }

    .rating-stars i {
      color: #fbbf24;
      font-size: 1.1rem;
    }

    .eval-summary {
      background: rgba(0, 242, 254, 0.05);
      border-radius: 8px;
      padding: 16px;
      margin-top: 16px;
    }

    .eval-summary strong {
      color: #00f2fe;
      display: block;
      margin-bottom: 8px;
    }

    .eval-summary p {
      color: #e0e0e0;
      margin: 0;
      line-height: 1.6;
    }

    .eval-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(0, 242, 254, 0.1);
    }

    /* Address Lookup */
    .address-lookup-container {
      position: relative;
    }

    .address-suggestions {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #16213e !important;
      border: 1px solid rgba(0, 242, 254, 0.4);
      border-radius: 8px;
      margin-top: 4px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .address-suggestions,
    .address-suggestions div,
    .address-suggestions strong,
    .address-suggestions span {
      color: #ffffff !important;
    }

    .suggestion-item {
      padding: 12px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid rgba(0, 242, 254, 0.1);
      transition: all 0.2s ease;
      background: transparent;
    }

    .suggestion-item,
    .suggestion-item * {
      color: #ffffff !important;
    }

    .suggestion-item:last-child {
      border-bottom: none;
    }

    .suggestion-item:hover {
      background: rgba(0, 242, 254, 0.15);
    }

    .suggestion-item i {
      color: #00f2fe;
      font-size: 1.2rem;
      flex-shrink: 0;
    }

    .suggestion-text {
      flex: 1;
      min-width: 0;
    }

    .suggestion-text strong {
      color: #ffffff !important;
      font-size: 1rem !important;
      font-weight: 600 !important;
      display: block;
      white-space: normal;
      line-height: 1.4;
    }

    .suggestion-text .secondary-text {
      color: #9ca3af !important;
      font-size: 0.85rem !important;
      display: block;
      margin-top: 4px;
    }

    /* Bulk & Import Tab Styles */
    .bulk-count { background: rgba(245,158,11,0.15) !important; color: #f59e0b !important; }
    .import-tab { margin-left: auto; }
    .bulk-section { padding: 20px 0; }
    .empty-bulk { text-align: center; padding: 60px 20px; color: #94a3b8; }
    .empty-bulk i { font-size: 3rem; color: #475569; display: block; margin-bottom: 12px; }
    .bulk-actions-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .bulk-actions-right { display: flex; gap: 8px; align-items: center; }
    .bulk-count-label { color: #f59e0b; font-weight: 600; font-size: 0.9rem; }
    .btn-compare {
      padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3);
      background: rgba(59, 130, 246, 0.1); color: #3b82f6; cursor: pointer; font-weight: 600;
      display: flex; align-items: center; gap: 6px; font-size: 0.85rem; transition: all 0.2s;
    }
    .btn-compare:hover { background: rgba(59, 130, 246, 0.2); }
    .btn-remove-dupes {
      padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.3);
      background: rgba(239, 68, 68, 0.1); color: #ef4444; cursor: pointer; font-weight: 600;
      display: flex; align-items: center; gap: 6px; font-size: 0.85rem; transition: all 0.2s;
    }
    .btn-remove-dupes:hover:not(:disabled) { background: rgba(239, 68, 68, 0.2); }
    .btn-remove-dupes:disabled { opacity: 0.6; cursor: not-allowed; }
    .exists-cell { white-space: nowrap; }
    .exists-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;
    }
    .exists-badge.duplicate {
      background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .exists-badge.new {
      background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .btn-activate-all {
      padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(34,197,94,0.3);
      background: rgba(34,197,94,0.1); color: #22c55e; cursor: pointer; font-weight: 600;
    }
    .btn-activate-all:hover { background: rgba(34,197,94,0.2); }
    .action-icons { display: flex; gap: 6px; }
    .action-icons .action-btn.activate {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .action-icons .action-btn.activate:hover {
      background: rgba(34, 197, 94, 0.3);
      transform: scale(1.1);
    }
    .action-icons .action-btn.archive {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    .action-icons .action-btn.archive:hover {
      background: rgba(245, 158, 11, 0.3);
      transform: scale(1.1);
    }
    .action-icons .action-btn.edit {
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }
    .action-icons .action-btn.edit:hover {
      background: rgba(59, 130, 246, 0.3);
      transform: scale(1.1);
    }
    .text-muted { color: #64748b; font-size: 0.8rem; }
    .import-section { padding: 20px 0; }
    .import-header { margin-bottom: 20px; }
    .import-header h2 { color: #00f2fe; font-size: 1.3rem; margin: 0 0 8px; }
    .import-header p { color: #94a3b8; margin: 0; }
    .import-header strong { color: #f59e0b; }
    .import-actions-bar { margin-bottom: 20px; }
    .btn-template {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 6px; font-size: 0.85rem;
      background: rgba(0,242,254,0.1); color: #00f2fe; border: 1px solid rgba(0,242,254,0.2);
      text-decoration: none; cursor: pointer; transition: all 0.2s;
    }
    .btn-template:hover { background: rgba(0,242,254,0.2); }
    .import-dropzone {
      border: 2px dashed rgba(0,242,254,0.3); border-radius: 12px;
      padding: 60px 20px; text-align: center; color: #94a3b8;
      transition: all 0.2s; cursor: pointer;
    }
    .import-dropzone:hover { border-color: #00f2fe; background: rgba(0,242,254,0.05); }
    .import-dropzone i { font-size: 3rem; color: #00f2fe; display: block; margin-bottom: 12px; }
    .btn-browse {
      display: inline-block; padding: 8px 20px; border-radius: 6px; margin-top: 8px;
      background: #00f2fe; color: #0a0e17; font-weight: 600; cursor: pointer;
    }
    .import-preview { margin-top: 16px; }
    .preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .preview-header h3 { color: #e2e8f0; margin: 0; }
    .preview-actions { display: flex; gap: 8px; }
    .btn-cancel {
      padding: 6px 14px; border-radius: 6px; border: 1px solid #475569;
      background: transparent; color: #94a3b8; cursor: pointer;
    }
    .preview-table-wrap { overflow-x: auto; max-height: 400px; overflow-y: auto; border-radius: 8px; }
    .preview-table {
      width: 100%; border-collapse: collapse; font-size: 0.82rem;
    }
    .preview-table th {
      background: #1a2236; color: #00f2fe; padding: 8px 12px;
      text-align: left; position: sticky; top: 0; z-index: 1;
    }
    .preview-table td { padding: 6px 12px; border-bottom: 1px solid #1e293b; color: #e2e8f0; }
    .preview-table tr:hover { background: rgba(0,242,254,0.03); }
    .row-error { background: rgba(239,68,68,0.08) !important; }
    .badge-ready { color: #22c55e; font-size: 0.75rem; font-weight: 600; }
    .badge-error { color: #ef4444; font-size: 0.75rem; font-weight: 600; cursor: help; }
    .import-result { margin-top: 20px; }
    .result-card {
      background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 24px;
    }
    .result-card h3 { margin: 0 0 16px; color: #e2e8f0; display: flex; align-items: center; gap: 8px; }
    .result-success h3 i { color: #22c55e; }
    .result-error h3 i { color: #ef4444; }
    .result-stats { display: flex; gap: 20px; margin-bottom: 16px; }
    .stat-success { color: #22c55e; }
    .stat-fail { color: #ef4444; }
    .stat-skip { color: #f59e0b; }
    .result-errors { background: rgba(239,68,68,0.08); border-radius: 8px; padding: 12px; margin-bottom: 16px; }
    .result-errors h4 { color: #ef4444; margin: 0 0 8px; font-size: 0.85rem; }
    .error-line { color: #fca5a5; font-size: 0.8rem; padding: 2px 0; font-family: monospace; }
  `]
})
export class EmployeeRosterComponent implements OnInit {
  private http = inject(HttpClient);
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  apiUrl = environment.apiUrl;
  private toast = inject(ToastService);
  private orgContext = inject(OrganizationContextService);
  private confirm = inject(ConfirmService);

  Math = Math;
  employees = signal<any[]>([]);
  loading = signal(true);
  searchTerm = signal('');
  statusFilter = '';
  entityFilter = '';
  rosterTab = signal<'live' | 'deactivated' | 'archived' | 'bulk' | 'import'>('live');
  stagingEmployees = signal<any[]>([]);
  importPreview = signal<any[]>([]);
  importResult = signal<any>(null);
  importing = signal(false);
  bulkCompared = signal(false);
  bulkExistsMap = signal<Record<string, boolean>>({});
  removingDuplicates = signal(false);
  bulkSearchTerm = signal('');
  bulkExistsFilter = signal<'' | 'new' | 'duplicate'>('');
  entityTab = signal<'all' | 'corporate' | 'satellite' | 'agency' | 'terminal'>('all');

  liveEmployees = computed(() => this.employees().filter(e => e.status === 'active'));
  deactivatedEmployees = computed(() => this.employees().filter(e => e.status === 'inactive' || e.status === 'suspended'));
  archivedEmployees = computed(() => this.employees().filter(e => e.status === 'archived'));
  bulkEmployees = computed(() => this.stagingEmployees());
  filteredBulkEmployees = computed(() => {
    let list = this.bulkEmployees();
    const term = this.bulkSearchTerm().toLowerCase().trim();
    if (term) {
      list = list.filter((e: any) =>
        e.name?.toLowerCase().includes(term) ||
        e.email?.toLowerCase().includes(term) ||
        e.phone?.toLowerCase().includes(term) ||
        e.department?.toLowerCase().includes(term) ||
        e.position?.toLowerCase().includes(term) ||
        e.role?.toLowerCase().includes(term)
      );
    }
    const ef = this.bulkExistsFilter();
    if (ef && this.bulkCompared()) {
      const map = this.bulkExistsMap();
      list = list.filter((e: any) => ef === 'duplicate' ? map[e.id] : !map[e.id]);
    }
    return list;
  });
  bulkTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredBulkEmployees().length / this.rosterPageSize())));
  paginatedBulkEmployees = computed(() => {
    const start = (this.rosterPage() - 1) * this.rosterPageSize();
    return this.filteredBulkEmployees().slice(start, start + this.rosterPageSize());
  });

  private getStatusList(): any[] {
    switch (this.rosterTab()) {
      case 'deactivated': return this.deactivatedEmployees();
      case 'archived': return this.archivedEmployees();
      default: return this.liveEmployees();
    }
  }

  private matchesEntity(e: any, tab: string): boolean {
    if (tab === 'all') return true;
    if (tab === 'corporate') return !e.satelliteId && !e.agencyId && !e.terminalId;
    if (tab === 'satellite') return !!e.satelliteId;
    if (tab === 'agency') return !!e.agencyId;
    if (tab === 'terminal') return !!e.terminalId;
    return true;
  }

  private matchesSearch(e: any, term: string): boolean {
    if (!term) return true;
    const lower = term.toLowerCase();
    return (e.name?.toLowerCase().includes(lower)) ||
           (e.email?.toLowerCase().includes(lower)) ||
           (e.phone?.toLowerCase().includes(lower)) ||
           (e.cellPhone?.toLowerCase().includes(lower)) ||
           (e.workPhone?.toLowerCase().includes(lower)) ||
           (e.jobTitle?.toLowerCase().includes(lower)) ||
           (e.alias?.toLowerCase().includes(lower)) ||
           (e.role?.toLowerCase().includes(lower));
  }

  displayedEmployees = computed(() => {
    const term = this.searchTerm();
    return this.getStatusList()
      .filter(e => this.matchesEntity(e, this.entityTab()))
      .filter(e => this.matchesSearch(e, term));
  });

  rosterPageSize = signal(25);
  rosterPage = signal(1);
  rosterTotalPages = computed(() => Math.max(1, Math.ceil(this.displayedEmployees().length / this.rosterPageSize())));
  paginatedEmployees = computed(() => {
    const start = (this.rosterPage() - 1) * this.rosterPageSize();
    return this.displayedEmployees().slice(start, start + this.rosterPageSize());
  });

  setRosterPageSize(size: number) {
    this.rosterPageSize.set(size);
    this.rosterPage.set(1);
  }

  setRosterPage(page: number) {
    if (page >= 1 && page <= this.rosterTotalPages()) this.rosterPage.set(page);
  }

  setBulkPage(page: number) {
    if (page >= 1 && page <= this.bulkTotalPages()) this.rosterPage.set(page);
  }

  getEntityCount(entityType: string): number {
    return this.getStatusList().filter(e => this.matchesEntity(e, entityType)).length;
  }
  showAddModal = false;
  showEditModal = false;
  showLandstarPw = false;
  showPowerdatPw = false;
  selectedEmployee = signal<any>(null);
  editingEmployee: any = null;
  selectedOrgCountry = signal<string>('USA');

  // Edit modal tabs & banking
  editModalTab = signal<'personal' | 'employment' | 'financial' | 'integrations' | 'documents' | 'business'>('personal');
  satelliteDetails = signal<any>(null);
  employeeAccounts = signal<any[]>([]);
  showBankForm = signal(false);
  editingBankAccount = signal<any>(null);
  bankForm: any = { bankName: '', accountNumber: '', routingNumber: '', accountType: 'checking', iban: '', swiftBic: '' };
  activeDetailsTab = signal<'details' | 'documents' | 'onboarding' | 'offboarding' | 'evaluations'>('details');
  employeeDocuments = signal<any[]>([]);
  editDocuments = signal<any[]>([]);
  editingExpiryType = '';
  docCategories = signal<any[]>([]);
  addressSuggestions = signal<any[]>([]);
  private addressSearchTimeout: any;

  summary = signal({
    totalEmployees: 0,
    activeEmployees: 0,
    byEntity: { corporate: 0, satellites: 0, agencies: 0, terminals: 0 },
    byRole: [],
    byDepartment: [],
    bySatellite: []
  });

  // Entity dropdowns
  organizations = signal<any[]>([]);
  satellites = signal<any[]>([]);
  agencies = signal<any[]>([]);
  terminals = signal<any[]>([]);
  departments = signal<any[]>([]);
  positions = signal<any[]>([]);
  empDivisions = signal<any[]>([]);
  jobTitlesList = signal<any[]>([]);
  availableRoles = signal<any[]>([]);

  // Search is now client-side via the searchTerm signal and displayedEmployees computed

  getStatusCount(status: string): number {
    return this.employees().filter(e => e.status === status).length;
  }

  getFilteredDepartments(orgId: any): any[] {
    if (!orgId) return this.departments();
    return this.departments().filter(d => String(d.organizationId) === String(orgId));
  }

  getFilteredPositions(deptId: any): any[] {
    const all = this.positions();
    if (!deptId) return all;
    const filtered = all.filter(p => String(p.departmentId) === String(deptId));
    return filtered.length > 0 ? filtered : all;
  }

  newEmployee = {
    name: '',
    email: '',
    phone: '',
    jobTitle: '',
    zoomEmail: '',
    role: '',
    status: 'active',
    organizationId: null as number | null,
    country: 'USA',
    language: 'en',
    timezone: 'America/New_York',
    entityType: 'corporate',
    satelliteId: null as number | null,
    agencyId: null as number | null,
    terminalId: null as number | null,
    divisionId: null as number | null,
    departmentId: null as number | null,
    positionId: null as number | null,
    password: '',
    confirmPassword: ''
  };

  private formDataLoaded = false;

  ngOnInit() {
    this.loadRoster();
    this.loadSummary();
    this.loadStaging();
    this.route.queryParams.subscribe(p => {
      if (p['tab'] === 'import') this.rosterTab.set('import');
    });
  }

  private async loadFormData() {
    if (this.formDataLoaded) return;
    this.formDataLoaded = true;
    await Promise.all([
      this.loadOrganizations(),
      this.loadEntities(),
      this.loadDepartments(),
      this.loadPositions(),
      this.loadEmpDivisions(),
      this.loadJobTitles(),
      this.loadRoles(),
      this.loadDocCategories()
    ]);
  }

  async loadDocCategories() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/document-categories`).toPromise();
      this.docCategories.set(res?.data || []);
    } catch { this.docCategories.set([]); }
  }

  async loadRoster() {
    try {
      this.loading.set(true);
      const params = new URLSearchParams({
        limit: '1000',
        ...(this.statusFilter && { status: this.statusFilter }),
        ...(this.entityFilter && { organizationId: this.entityFilter })
      });

      const url = this.orgContext.addOrgParam(`${this.apiUrl}/api/v1/employee-roster?${params}`);
      const response: any = await this.http.get(url).toPromise();
      this.employees.set(response?.data || []);
      this.loading.set(false);
    } catch (err) {
      console.error('Failed to load roster:', err);
      this.loading.set(false);
    }
  }

  refreshRoster() {
    this.loadRoster();
    this.loadSummary();
    this.toast.info('Employee roster refreshed', 'Refreshed');
  }

  async loadSummary() {
    try {
      const summary: any = await this.http.get(`${this.apiUrl}/api/v1/employee-roster/summary`).toPromise();
      this.summary.set(summary || this.summary());
    } catch (err) {
      console.error('Failed to load summary:', err);
    }
  }

  async loadOrganizations() {
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/organizations`).toPromise();
      this.organizations.set(response?.data || []);
      
      // Auto-select first organization if not set
      if (!this.newEmployee.organizationId && response?.data?.length > 0) {
        this.newEmployee.organizationId = response.data[0].id;
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  }

  async loadEntities() {
    try {
      const [satellites, agencies, terminals]: any = await Promise.all([
        this.http.get(`${this.apiUrl}/api/v1/satellites?pageSize=500&adminReport=true&includeAll=true`).toPromise(),
        this.http.get(`${this.apiUrl}/api/v1/agencies?pageSize=500`).toPromise(),
        this.http.get(`${this.apiUrl}/api/v1/terminals?pageSize=500`).toPromise()
      ]);
      this.satellites.set(satellites?.data || []);
      this.agencies.set(agencies?.data || []);
      this.terminals.set(terminals?.data || []);
    } catch (err) {
      console.error('Failed to load entities:', err);
    }
  }

  async loadDepartments() {
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/departments?adminReport=true&includeAll=true&pageSize=500`).toPromise();
      this.departments.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load departments:', err);
    }
  }

  async loadPositions() {
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/positions?adminReport=true&includeAll=true&pageSize=500`).toPromise();
      let positions = response?.data || [];

      // If no positions exist, also try loading job titles as fallback
      if (positions.length === 0) {
        try {
          const jtRes: any = await this.http.get(`${this.apiUrl}/api/v1/job-titles`).toPromise();
          const jobTitles = jtRes?.data || [];
          positions = jobTitles.map((jt: any) => ({
            id: jt.id,
            title: jt.title,
            departmentId: jt.departmentId,
            departmentName: jt.department?.name || '',
            level: jt.level,
            source: 'job_title'
          }));
        } catch {}
      }

      this.positions.set(positions);
    } catch (err) {
      console.error('Failed to load positions:', err);
    }
  }

  async loadEmpDivisions() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/divisions?limit=500`).toPromise();
      this.empDivisions.set(res?.data || []);
    } catch { this.empDivisions.set([]); }
  }

  async loadJobTitles() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/job-titles`).toPromise();
      this.jobTitlesList.set(res?.data || []);
    } catch { this.jobTitlesList.set([]); }
  }

  getFilteredDivisions(orgId: any): any[] {
    if (!orgId) return this.empDivisions();
    return this.empDivisions().filter(d => String(d.organizationId) === String(orgId));
  }

  async loadRoles() {
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/roles`).toPromise();
      const roles = (response?.data || response || [])
        .filter((r: any) => r.name !== 'product_owner')
        .map((r: any) => ({ value: r.name, label: r.displayName || r.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) }));
      this.availableRoles.set(roles);
    } catch {
      this.availableRoles.set([
        { value: 'admin', label: 'Admin' },
        { value: 'manager', label: 'Manager' },
        { value: 'dispatcher', label: 'Dispatcher' },
        { value: 'driver', label: 'Driver' },
        { value: 'accountant', label: 'Accountant' },
        { value: 'hr', label: 'HR' },
        { value: 'recruiter', label: 'Recruiter' },
        { value: 'user', label: 'User' }
      ]);
    }
  }

  onEntityTypeChange() {
    // Reset entity IDs when type changes
    this.newEmployee.satelliteId = null;
    this.newEmployee.agencyId = null;
    this.newEmployee.terminalId = null;
  }

  isFormValid(): boolean {
    const { name, email, role, password, confirmPassword } = this.newEmployee;
    if (!name || !email || !role || !password || !confirmPassword) return false;
    if (password !== confirmPassword) return false;
    if (password.length < 8) return false;
    return true;
  }

  async addEmployee() {
    if (!this.isFormValid()) {
      alert('Please fill in all required fields correctly');
      return;
    }

    try {
      const payload: any = {
        name: this.newEmployee.name,
        email: this.newEmployee.email,
        role: this.newEmployee.role,
        status: 'active',
        password: this.newEmployee.password,
        organizationId: this.newEmployee.organizationId
      };

      await this.http.post(`${this.apiUrl}/api/v1/users`, payload).toPromise();
      
      const empName = this.newEmployee.name;
      this.showAddModal = false;
      this.resetForm();
      this.loadRoster();
      this.loadSummary();
      
      this.toast.champagne(`🎉 ${empName} created! Use Edit to add additional details.`);
    } catch (err: any) {
      console.error('Failed to add employee:', err);
      const errorMsg = err?.error?.error || err?.error?.message || 'Failed to add employee';
      if (errorMsg.toLowerCase().includes('already exists')) {
        this.toast.champagne(`👤 ${this.newEmployee.name} already exists in the system! You can find them in the roster and edit their details.`);
        this.showAddModal = false;
        this.resetForm();
      } else {
        this.toast.error(errorMsg, 'Error');
      }
    }
  }

  cancelAdd() {
    this.showAddModal = false;
    this.resetForm();
  }

  resetForm() {
    this.newEmployee = {
      name: '',
      email: '',
      phone: '',
      jobTitle: '',
      zoomEmail: '',
      role: '',
      status: 'active',
      organizationId: null,
      divisionId: null,
      country: 'USA',
      language: 'en',
      timezone: 'America/New_York',
      entityType: 'corporate',
      satelliteId: null,
      agencyId: null,
      terminalId: null,
      departmentId: null,
      positionId: null,
      password: '',
      confirmPassword: ''
    };
  }

  openAddModal() {
    this.loadFormData();
    this.showAddModal = true;
  }

  viewEmployee(employee: any) {
    this.loadFormData();
    this.selectedEmployee.set(employee);
    this.activeDetailsTab.set('details');
    this.employeeDocuments.set([]);
  }

  async loadEmployeeDocuments() {
    const employeeId = this.selectedEmployee()?.id;
    if (!employeeId) return;

    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/employee-documents?employeeId=${employeeId}`).toPromise();
      this.employeeDocuments.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load employee documents:', err);
      this.employeeDocuments.set([]);
    }
  }

  uploadEmployeeDocument() {
    this.triggerFileUpload('general');
  }

  private triggerFileUpload(docType: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx';
    input.onchange = async (event: any) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const employeeId = this.selectedEmployee()?.id;
      if (!employeeId) return;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('employeeId', employeeId.toString());
      formData.append('documentType', docType);
      formData.append('description', file.name);

      try {
        await this.http.post(`${this.apiUrl}/api/v1/employee-documents`, formData).toPromise();
        this.toast.champagne(`${file.name} uploaded successfully`);
        this.loadEmployeeDocuments();
      } catch (err: any) {
        console.error('Upload failed:', err);
        this.toast.error(err?.error?.message || 'Failed to upload document');
      }
    };
    input.click();
  }

  async viewDocument(doc: any) {
    try {
      const res = await this.http.get(`${this.apiUrl}/api/v1/employee-documents/${doc.id}/view`, { responseType: 'blob' }).toPromise();
      if (res) {
        const blob = new Blob([res], { type: doc.contentType || 'application/pdf' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err: any) {
      console.error('Failed to open document:', err);
      this.toast.error(err?.error?.message || 'Failed to open document');
    }
  }

  async deleteDocument(doc: any) {
    if (!confirm(`Delete ${doc.fileName}?`)) return;
    try {
      await this.http.delete(`${this.apiUrl}/api/v1/employee-documents/${doc.id}`).toPromise();
      this.toast.success('Document deleted');
      this.loadEmployeeDocuments();
    } catch {
      this.toast.error('Failed to delete document');
    }
  }

  async togglePassword(type: 'landstar' | 'powerdat') {
    const field = type === 'landstar' ? 'landstarPassword' : 'powerdatPassword';
    const showField = type === 'landstar' ? 'showLandstarPw' : 'showPowerdatPw';
    const currentlyShowing = this[showField];
    
    if (!currentlyShowing && this.editingEmployee[field]?.startsWith('ENC:')) {
      try {
        const res: any = await this.http.post(`${this.apiUrl}/api/v1/employee-roster/decrypt-password`, 
          { value: this.editingEmployee[field] }).toPromise();
        this.editingEmployee[field] = res?.value || '';
      } catch { }
    }
    (this as any)[showField] = !currentlyShowing;
  }

  editEmployee(employee: any) {
    this.loadFormData();
    this.showLandstarPw = false;
    this.showPowerdatPw = false;
    this.selectedEmployee.set(null); // Close details modal
    
    // Determine entity type
    let entityType = 'corporate';
    if (employee.satelliteId) entityType = 'satellite';
    else if (employee.agencyId) entityType = 'agency';
    else if (employee.terminalId) entityType = 'terminal';
    
    this.editingEmployee = {
      id: employee.id,
      avatarUrl: employee.avatarUrl,
      name: employee.name,
      alias: employee.alias,
      gender: employee.gender,
      dateOfBirth: employee.dateOfBirth,
      idNumber: employee.idNumber,
      height: employee.height,
      weight: employee.weight,
      eyeColor: employee.eyeColor,
      hairColor: employee.hairColor,
      ethnicity: employee.ethnicity,
      religion: employee.religion,
      email: employee.email,
      personalEmail: employee.personalEmail,
      zoomEmail: employee.zoomEmail || '',
      landstarUsername: (employee as any).landstarUsername || '',
      landstarPassword: (employee as any).landstarPassword || '',
      powerdatUsername: (employee as any).powerdatUsername || '',
      powerdatPassword: (employee as any).powerdatPassword || '',
      phone: employee.phone,
      workPhone: employee.workPhone,
      workPhoneCountry: (employee as any).workPhoneCountry || '+1',
      cellPhone: employee.cellPhone,
      cellPhoneCountry: (employee as any).cellPhoneCountry || '+1',
      address: employee.address,
      city: employee.city,
      state: employee.state,
      zipCode: employee.zipCode,
      jobTitle: employee.jobTitle,
      role: employee.role,
      status: employee.status,
      organizationId: employee.organizationId ? Number(employee.organizationId) : null,
      organizationName: employee.organization?.name || 'Van Tac Logistics',
      orgCountry: employee.organization?.addressRef?.country || employee.organization?.country || 'USA',
      country: employee.country || employee.organization?.addressRef?.country || employee.organization?.country || 'USA',
      language: employee.language || 'en',
      entityType: entityType,
      satelliteId: employee.satelliteId ? Number(employee.satelliteId) : null,
      agencyId: employee.agencyId ? Number(employee.agencyId) : null,
      terminalId: employee.terminalId ? Number(employee.terminalId) : null,
      divisionId: (employee as any).divisionId ? Number((employee as any).divisionId) : null,
      departmentId: employee.departmentId ? Number(employee.departmentId) : null,
      positionId: employee.positionId ? Number(employee.positionId) : null,
      timezone: employee.timezone || 'America/New_York'
    };
    this.editModalTab.set('personal');
    this.employeeAccounts.set([]);
    this.showBankForm.set(false);
    this.showEditModal = true;
  }

  onEditEntityTypeChange() {
    // Reset entity IDs when type changes
    this.editingEmployee.satelliteId = null;
    this.editingEmployee.agencyId = null;
    this.editingEmployee.terminalId = null;
  }

  onOrganizationChange(orgId: number) {
    // Update org country and employee country when organization changes in edit modal
    const selectedOrg = this.organizations().find(o => o.id === orgId);
    if (selectedOrg) {
      const orgCountry = selectedOrg.addressRef?.country || selectedOrg.country || 'USA';
      this.editingEmployee.orgCountry = orgCountry;
      // Also update employee country to match org
      this.editingEmployee.country = orgCountry;
    }
  }

  onNewEmployeeOrgChange(orgId: number) {
    // Update org country and employee country when organization changes in add modal
    const selectedOrg = this.organizations().find(o => o.id === orgId);
    if (selectedOrg) {
      const orgCountry = selectedOrg.addressRef?.country || selectedOrg.country || 'USA';
      this.selectedOrgCountry.set(orgCountry);
      // Also set employee country to match org country
      if (this.newEmployee) {
        this.newEmployee.country = orgCountry;
      }
    }
  }

  cancelEdit() {
    this.showEditModal = false;
    this.editingEmployee = null;
    this.editModalTab.set('personal');
    this.employeeAccounts.set([]);
    this.showBankForm.set(false);
    this.satelliteDetails.set(null);
  }

  getEmployeeCountry(): string {
    const orgId = this.editingEmployee?.organizationId;
    const org = this.organizations()?.find((o: any) => o.id == orgId);
    const country = (org?.country || org?.addressRef?.country || '').toLowerCase();
    if (country.includes('bosni') || country === 'ba') return 'BA';
    return 'US';
  }

  switchEditTab(tab: string) {
    this.editModalTab.set(tab as any);
    if (tab === 'financial') {
      if (this.editingEmployee?.entityType === 'satellite' && this.editingEmployee?.satelliteId && !this.satelliteDetails()) {
        this.loadSatelliteDetails();
      } else if (this.employeeAccounts().length === 0) {
        this.loadEmployeeAccounts();
      }
    }
    if (tab === 'business') {
      if (!this.satelliteDetails()) this.loadSatelliteDetails();
      this.loadSatelliteOwners();
    }
  }

  satelliteLoading = signal(false);
  satelliteOwners = signal<any[]>([]);
  showOwnerForm = signal(false);
  ownerForm: any = { name: '', role: 'owner', ownershipPercent: 0, userId: null };

  async loadSatelliteDetails() {
    const satId = this.editingEmployee?.satelliteId;
    if (!satId) return;
    this.satelliteLoading.set(true);
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/satellites/${satId}`).toPromise();
      const data = res?.data || res;
      console.log('[Business] Satellite loaded:', data?.name, data);
      this.satelliteDetails.set(data);
    } catch (err) {
      console.error('[Business] Failed to load satellite:', err);
      this.satelliteDetails.set({ error: true, name: 'Failed to load' });
    } finally {
      this.satelliteLoading.set(false);
    }
  }

  canSeeSatelliteFinancials(): boolean {
    const role = this.authService.currentUser()?.role?.toLowerCase();
    if (role === 'product_owner' || role === 'superadmin' || role === 'admin') return true;
    // Satellite owners can see their own satellite
    const currentSatId = (this.authService.currentUser() as any)?.satelliteId;
    if (currentSatId && currentSatId === this.editingEmployee?.satelliteId) return true;
    return false;
  }

  getSatelliteCountry(): string {
    // Check organization country first, then satellite's own country
    const orgId = this.satelliteDetails()?.organizationId || this.editingEmployee?.organizationId;
    const org = this.organizations()?.find((o: any) => o.id == orgId);
    const orgCountry = (org?.country || org?.name || '').toLowerCase();
    if (orgCountry.includes('bosni') || orgCountry === 'ba') return 'BA';

    const satCountry = (this.satelliteDetails()?.country || '').toLowerCase();
    if (satCountry.includes('bosni') || satCountry === 'ba') return 'BA';

    // Also check city/location hints
    const city = (this.satelliteDetails()?.city || '').toLowerCase();
    const bosnianCities = ['sarajevo', 'tuzla', 'zenica', 'mostar', 'banja luka', 'bihac', 'bihać', 'velika kladuša', 'velika kladusa', 'brčko', 'brcko', 'travnik', 'cazin'];
    if (bosnianCities.some(c => city.includes(c))) return 'BA';

    return 'US';
  }

  async loadSatelliteOwners() {
    const satId = this.editingEmployee?.satelliteId;
    if (!satId) return;
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/satellites/${satId}/owners`).toPromise();
      this.satelliteOwners.set(res?.data || []);
    } catch {
      this.satelliteOwners.set([]);
    }
  }

  onOwnerUserSelect(userId: any) {
    if (userId) {
      const emp = this.employees().find((e: any) => e.id == userId);
      if (emp) this.ownerForm.name = emp.name;
    }
  }

  async saveOwner() {
    const satId = this.editingEmployee?.satelliteId;
    if (!satId || !this.ownerForm.name) return;
    try {
      await this.http.post(`${this.apiUrl}/api/v1/satellites/${satId}/owners`, this.ownerForm).toPromise();
      this.toast.success('Owner added', 'Saved');
      this.showOwnerForm.set(false);
      this.ownerForm = { name: '', role: 'owner', ownershipPercent: 0, userId: null };
      this.loadSatelliteOwners();
    } catch (err: any) {
      this.toast.error(err?.error?.error || 'Failed to add owner', 'Error');
    }
  }

  async deleteOwner(ownerId: number) {
    const satId = this.editingEmployee?.satelliteId;
    if (!satId) return;
    try {
      await this.http.delete(`${this.apiUrl}/api/v1/satellites/${satId}/owners/${ownerId}`).toPromise();
      this.toast.success('Owner removed', 'Deleted');
      this.loadSatelliteOwners();
    } catch {
      this.toast.error('Failed to remove owner', 'Error');
    }
  }

  async loadEmployeeAccounts() {
    const userId = this.editingEmployee?.id;
    if (!userId) return;
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/employee-accounts?userId=${userId}`).toPromise();
      this.employeeAccounts.set(res?.data || []);
    } catch {
      this.employeeAccounts.set([]);
    }
  }

  openBankForm() {
    this.editingBankAccount.set(null);
    this.bankForm = { bankName: '', accountNumber: '', routingNumber: '', accountType: 'checking', iban: '', swiftBic: '' };
    this.showBankForm.set(true);
  }

  editBankAccount(acct: any) {
    this.editingBankAccount.set(acct);
    this.bankForm = {
      bankName: acct.bankName || '',
      accountNumber: acct.accountNumber || '',
      routingNumber: acct.routingNumber || '',
      accountType: acct.accountType || 'checking',
      iban: acct.iban || '',
      swiftBic: acct.swiftBic || ''
    };
    this.showBankForm.set(true);
  }

  cancelBankForm() {
    this.showBankForm.set(false);
    this.editingBankAccount.set(null);
  }

  async saveBankAccount() {
    const userId = this.editingEmployee?.id;
    const orgId = this.editingEmployee?.organizationId || 1;
    const country = this.getEmployeeCountry();
    const payload: any = {
      userId, organizationId: orgId, type: 'bank', status: 'active', country,
      bankName: this.bankForm.bankName,
      accountType: this.bankForm.accountType,
      accountNumber: country === 'BA' ? null : this.bankForm.accountNumber,
      routingNumber: country === 'BA' ? null : this.bankForm.routingNumber,
      iban: country === 'BA' ? this.bankForm.iban : null,
      swiftBic: country === 'BA' ? this.bankForm.swiftBic : null
    };

    try {
      if (this.editingBankAccount()) {
        await this.http.put(`${this.apiUrl}/api/v1/employee-accounts/${this.editingBankAccount().id}`, payload).toPromise();
        this.toast.success('Bank account updated', 'Saved');
      } else {
        await this.http.post(`${this.apiUrl}/api/v1/employee-accounts`, payload).toPromise();
        this.toast.success('Bank account added', 'Saved');
      }
      this.cancelBankForm();
      this.loadEmployeeAccounts();
    } catch (err: any) {
      this.toast.error(err?.error?.error || 'Failed to save bank account', 'Error');
    }
  }

  async deleteBankAccount(id: number) {
    try {
      await this.http.delete(`${this.apiUrl}/api/v1/employee-accounts/${id}`).toPromise();
      this.toast.success('Bank account removed', 'Deleted');
      this.loadEmployeeAccounts();
    } catch {
      this.toast.error('Failed to delete account', 'Error');
    }
  }

  maskAccount(num: string): string {
    if (!num || num.length < 4) return num || '';
    return '••••' + num.slice(-4);
  }

  maskIban(iban: string): string {
    if (!iban || iban.length < 8) return iban || '';
    return iban.slice(0, 4) + ' •••• •••• ' + iban.slice(-4);
  }

  async saveEmployee() {
    if (!this.editingEmployee.name || !this.editingEmployee.email || !this.editingEmployee.role) {
      alert('Please fill in all required fields (Name, Email, Role)');
      return;
    }

    try {
      const payload: any = {
        avatar: this.editingEmployee.avatarUrl,
        name: this.editingEmployee.name,
        alias: this.editingEmployee.alias,
        gender: this.editingEmployee.gender,
        dateOfBirth: this.editingEmployee.dateOfBirth,
        idNumber: this.editingEmployee.idNumber,
        height: this.editingEmployee.height,
        weight: this.editingEmployee.weight,
        eyeColor: this.editingEmployee.eyeColor,
        hairColor: this.editingEmployee.hairColor,
        ethnicity: this.editingEmployee.ethnicity,
        religion: this.editingEmployee.religion,
        email: this.editingEmployee.email,
        personalEmail: this.editingEmployee.personalEmail,
        zoomEmail: this.editingEmployee.zoomEmail,
        landstarUsername: this.editingEmployee.landstarUsername,
        landstarPassword: this.editingEmployee.landstarPassword,
        powerdatUsername: this.editingEmployee.powerdatUsername,
        powerdatPassword: this.editingEmployee.powerdatPassword,
        phone: this.editingEmployee.phone,
        workPhone: this.editingEmployee.workPhone,
        workPhoneCountry: this.editingEmployee.workPhoneCountry,
        cellPhone: this.editingEmployee.cellPhone,
        cellPhoneCountry: this.editingEmployee.cellPhoneCountry,
        address: this.editingEmployee.address,
        city: this.editingEmployee.city,
        state: this.editingEmployee.state,
        zipCode: this.editingEmployee.zipCode,
        jobTitle: this.editingEmployee.jobTitle,
        role: this.editingEmployee.role,
        status: this.editingEmployee.status,
        organizationId: this.editingEmployee.organizationId,
        country: this.editingEmployee.country,
        language: this.editingEmployee.language,
        divisionId: this.editingEmployee.divisionId,
        departmentId: this.editingEmployee.departmentId,
        positionId: this.editingEmployee.positionId,
        timezone: this.editingEmployee.timezone
      };

      // Add entity assignments based on type (0 = clear, positive = set)
      if (this.editingEmployee.entityType === 'satellite') {
        payload.satelliteId = this.editingEmployee.satelliteId;
        payload.agencyId = 0;
        payload.terminalId = 0;
      } else if (this.editingEmployee.entityType === 'agency') {
        payload.agencyId = this.editingEmployee.agencyId;
        payload.satelliteId = 0;
        payload.terminalId = 0;
      } else if (this.editingEmployee.entityType === 'terminal') {
        payload.terminalId = this.editingEmployee.terminalId;
        payload.satelliteId = 0;
        payload.agencyId = 0;
      } else {
        payload.satelliteId = 0;
        payload.agencyId = 0;
        payload.terminalId = 0;
      }

      await this.http.put(`${this.apiUrl}/api/v1/users/${this.editingEmployee.id}`, payload).toPromise();
      
      this.showEditModal = false;
      const employeeName = this.editingEmployee.name;
      this.editingEmployee = null;
      this.loadRoster();
      this.loadSummary();
      
      this.toast.champagne(`🎉 ${employeeName} updated successfully!`);
    } catch (err: any) {
      console.error('Failed to update employee:', err);
      alert(err?.error?.message || 'Failed to update employee');
    }
  }

  async toggleEmployeeStatus(employee: any) {
    const newStatus = employee.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? 'activate' : 'deactivate';
    
    const confirmed = await this.confirm.show({ message: `Are you sure you want to ${action} ${employee.name}?`, type: 'champagne' });
    if (!confirmed) return;

    try {
      await this.http.put(`${this.apiUrl}/api/v1/users/${employee.id}`, {
        status: newStatus
      }).toPromise();
      
      this.toast.success(`${employee.name} ${action}d successfully`, 'Status Updated');
      this.loadRoster();
      this.loadSummary();
    } catch (err: any) {
      console.error('Failed to toggle employee status:', err);
      this.toast.error(err?.error?.message || 'Failed to update employee status', 'Error');
    }
  }

  async archiveEmployee(employee: any) {
    const confirmed = await this.confirm.show({ message: `Archive ${employee.name}? They will be moved to the Archived tab.`, type: 'champagne', confirmText: 'Archive' });
    if (!confirmed) return;

    try {
      await this.http.put(`${this.apiUrl}/api/v1/users/${employee.id}`, { status: 'archived' }).toPromise();
      this.toast.success(`${employee.name} archived`);
      this.loadRoster();
      this.loadSummary();
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'Failed to archive employee', 'Error');
    }
  }

  async restoreEmployee(employee: any) {
    try {
      await this.http.put(`${this.apiUrl}/api/v1/users/${employee.id}`, { status: 'active' }).toPromise();
      this.toast.success(`${employee.name} restored to active`);
      this.loadRoster();
      this.loadSummary();
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'Failed to restore employee', 'Error');
    }
  }

  async deleteEmployee(employee: any) {
    const confirmed = await this.confirm.show({ message: `Permanently delete ${employee.name}? This cannot be undone.`, type: 'danger', confirmText: 'Delete' });
    if (!confirmed) return;

    try {
      await this.http.delete(`${this.apiUrl}/api/v1/users/${employee.id}`).toPromise();
      this.toast.success(`${employee.name} deleted`);
      this.loadRoster();
      this.loadSummary();
    } catch (err: any) {
      console.error('Failed to delete employee:', err);
      alert(err?.error?.message || 'Failed to delete employee');
    }
  }

  onAvatarSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      this.toast.error('Image too large. Maximum size is 2MB.', 'Upload Failed');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.toast.error('Please upload an image file (JPG, PNG, etc.)', 'Invalid File');
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.editingEmployee.avatarUrl = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  removeAvatar() {
    this.editingEmployee.avatarUrl = null;
  }

  hasDocument(docType: string): boolean {
    const slug = docType.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return this.employeeDocuments().some(d => {
      const dType = (d.documentType || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
      const dName = (d.fileName || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
      const dDesc = (d.description || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
      return dType === slug || dType.includes(slug) || slug.includes(dType) ||
             dName.includes(slug) || dDesc.includes(slug);
    });
  }

  getDocumentDate(docType: string): string | null {
    const slug = docType.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const doc = this.employeeDocuments().find(d => {
      const dType = (d.documentType || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
      return dType === slug || dType.includes(slug) || slug.includes(dType);
    });
    return doc ? new Date(doc.createdAt).toLocaleDateString() : null;
  }

  todayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  getDocExpiration(docType: string): string | null {
    const slug = docType.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const doc = this.employeeDocuments().find(d => {
      const dType = (d.documentType || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
      return dType === slug || dType.includes(slug) || slug.includes(dType);
    });
    return doc?.expiresAt || doc?.expirationDate || doc?.expiryDate || null;
  }

  isExpiringSoon(dateStr: string): boolean {
    if (!dateStr) return false;
    const exp = new Date(dateStr);
    const now = new Date();
    const days = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days > 0 && days <= 90;
  }

  isDocExpired(dateStr: string): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  loadEditDocuments(): void {
    const emp = this.editingEmployee;
    if (!emp?.userId && !emp?.id) return;
    const userId = emp.userId || emp.id;
    this.http.get<any>(`${this.apiUrl}/api/v1/employee-documents?employeeId=${userId}`).subscribe({
      next: (res) => this.editDocuments.set(res?.data || []),
      error: () => this.editDocuments.set([])
    });
  }

  updateDocExpiration(doc: any, event: any): void {
    const date = event.target?.value;
    if (!date) return;
    this.http.put(`${this.apiUrl}/api/v1/employee-documents/${doc.id}`, { expirationDate: date }).subscribe({
      next: () => {
        doc.expirationDate = date;
        this.editDocuments.set([...this.editDocuments()]);
        this.toast.success('Expiration date updated', 'Saved');
      },
      error: () => this.toast.error('Failed to update expiration', 'Error')
    });
  }

  saveExpiration(docType: string, event: any): void {
    const date = event.target?.value;
    this.editingExpiryType = '';
    if (!date) return;

    const slug = docType.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const doc = this.employeeDocuments().find(d => {
      const dType = (d.documentType || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
      return dType === slug || dType.includes(slug) || slug.includes(dType);
    });

    if (doc) {
      this.http.put(`${this.apiUrl}/api/v1/employee-documents/${doc.id}`, { expirationDate: date }).subscribe({
        next: () => {
          doc.expirationDate = date;
          this.employeeDocuments.set([...this.employeeDocuments()]);
          this.toast.success('Expiration date saved', 'Updated');
        },
        error: () => this.toast.error('Failed to save expiration', 'Error')
      });
    } else {
      this.toast.info('Upload the document first, then set the expiration', 'No Document');
    }
  }

  uploadMandatoryDoc(docType: string) {
    this.triggerFileUpload(docType);
  }

  viewMandatoryDoc(docType: string) {
    const doc = this.employeeDocuments().find(d => d.documentType === docType);
    if (doc) {
      this.viewDocument(doc);
    }
  }

  async deleteMandatoryDoc(docType: string) {
    const doc = this.employeeDocuments().find(d => d.documentType === docType);
    if (!doc) return;

    const confirmed = await this.confirm.show({ message: `Are you sure you want to delete this ${docType} document?`, type: 'danger', confirmText: 'Delete' });
    if (!confirmed) return;

    try {
      await this.http.delete(`${this.apiUrl}/api/v1/employee-documents/${doc.id}`).toPromise();
      this.toast.success('Document deleted successfully', 'Deleted');
      this.loadEmployeeDocuments(); // Reload to update table
    } catch (err: any) {
      console.error('Failed to delete document:', err);
      this.toast.error('Failed to delete document', 'Error');
    }
  }

  // Position-specific required documents loaded from API
  positionRequiredDocs = signal<any[]>([]);

  async loadPositionRequirements() {
    const emp = this.selectedEmployee();
    const positionId = emp?.positionId;
    const departmentId = emp?.departmentId;

    // 1. Try employee's own position requirements
    if (positionId) {
      try {
        const res: any = await this.http.get(`${this.apiUrl}/api/v1/document-categories/position/${positionId}/requirements`).toPromise();
        const docs = res?.data?.docs || [];
        if (docs.length > 0) {
          this.positionRequiredDocs.set(docs);
          return;
        }
      } catch {}
    }

    // 2. Try department-level: find any position in same department with requirements
    if (departmentId) {
      try {
        const posRes: any = await this.http.get(`${this.apiUrl}/api/v1/positions?departmentId=${departmentId}&pageSize=100`).toPromise();
        const positions = posRes?.data || [];
        for (const pos of positions) {
          try {
            const reqRes: any = await this.http.get(`${this.apiUrl}/api/v1/document-categories/position/${pos.id}/requirements`).toPromise();
            const docs = reqRes?.data?.docs || [];
            if (docs.length > 0) {
              this.positionRequiredDocs.set(docs);
              return;
            }
          } catch {}
        }
      } catch {}
    }

    // 3. Final fallback: load org's document categories filtered by employee's country/department
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/document-categories`).toPromise();
      const categories = res?.data || [];
      const allDocs: any[] = [];

      // Smart filter: show country-matched employment forms + all non-country categories
      const deptRaw = emp?.department;
      const deptName = (typeof deptRaw === 'string' ? deptRaw : deptRaw?.name || emp?.departmentName || '').toLowerCase();
      const countryKeywords = ['usa', 'bosni', 'canada', 'mexico', 'uk', 'europe'];

      const orgName = (emp?.organizationName || emp?.organization?.name || emp?.organization || '').toString().toLowerCase();
      const entityName = (emp?.satellite?.name || emp?.agency?.name || emp?.terminal?.name || '').toString().toLowerCase();
      const allContext = `${deptName} ${orgName} ${entityName}`;

      const catsToUse = categories.filter((cat: any) => {
        const catName = (cat.name || '').toLowerCase();
        const isCountrySpecific = countryKeywords.some(kw => catName.includes(kw));
        if (!isCountrySpecific) return true;
        if (allContext.includes('bosni') && catName.includes('bosni')) return true;
        if ((allContext.includes('usa') || allContext.includes('corporate') || allContext.includes('america')) && catName.includes('usa')) return true;
        if (allContext.includes('canada') && catName.includes('canada')) return true;
        return false;
      });

      for (const cat of catsToUse) {
        for (const item of (cat.docs || cat.items || [])) {
          allDocs.push({ name: item.name, categoryName: cat.name, id: item.id });
        }
      }
      this.positionRequiredDocs.set(allDocs);
    } catch {
      this.positionRequiredDocs.set([]);
    }
  }

  getMandatoryDocuments(): { type: string; label: string; required: boolean; category: string }[] {
    return this.positionRequiredDocs().map((doc: any) => ({
      type: doc.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      label: doc.name,
      required: true,
      category: doc.categoryName || ''
    }));
  }

  createEvaluation() {
    this.toast.info('Performance evaluation system coming soon', 'Evaluations');
  }

  searchAddress(event: any) {
    const query = event.target.value;
    
    if (!query || query.length < 3) {
      this.addressSuggestions.set([]);
      return;
    }

    // Debounce search
    clearTimeout(this.addressSearchTimeout);
    this.addressSearchTimeout = setTimeout(async () => {
      try {
        // Using geocoder API endpoint
        const response: any = await this.http.get(
          `${this.apiUrl}/api/v1/geocoder/autocomplete?input=${encodeURIComponent(query)}`
        ).toPromise();
        
        console.log('[Address Lookup] API Response:', response);
        console.log('[Address Lookup] Predictions:', response?.predictions);
        
        this.addressSuggestions.set(response?.predictions || []);
      } catch (err) {
        console.error('Address lookup failed:', err);
        this.addressSuggestions.set([]);
      }
    }, 300);
  }

  selectAddress(suggestion: any) {
    // Use address data directly from autocomplete response (no extra API call needed)
    if (suggestion.address_components) {
      const ac = suggestion.address_components;
      this.editingEmployee.address = ac.street || '';
      this.editingEmployee.city = ac.city || '';
      this.editingEmployee.state = ac.state || '';
      this.editingEmployee.zipCode = ac.zip || '';
    } else {
      // Fallback: parse from description
      const parts = (suggestion.description || '').split(',').map((p: string) => p.trim());
      if (parts.length >= 1) this.editingEmployee.address = parts[0];
      if (parts.length >= 2) this.editingEmployee.city = parts[1];
      if (parts.length >= 3) this.editingEmployee.state = parts[2];
    }
    this.addressSuggestions.set([]);
    this.toast.success('Address autofilled', 'Address Lookup');
  }

  private getComponent(components: any[], type: string, nameType: 'long_name' | 'short_name' = 'long_name'): string {
    const component = components.find((c: any) => c.types.includes(type));
    return component ? component[nameType] : '';
  }

  // ====== Staging / Bulk Queue ======

  loadStaging() {
    this.http.get<any>(`${this.apiUrl}/api/v1/employee-data/staging`).subscribe({
      next: (res) => this.stagingEmployees.set(res?.data || []),
      error: () => this.stagingEmployees.set([])
    });
  }

  activateBulkEmployee(emp: any) {
    this.http.post(`${this.apiUrl}/api/v1/employee-data/staging/${emp.id}/approve`, {}).subscribe({
      next: () => { this.toast.success(`${emp.name} activated as employee`, 'Approved'); this.loadStaging(); this.loadRoster(); },
      error: (e) => this.toast.error(e?.error?.error || 'Failed to approve', 'Error')
    });
  }

  archiveBulkEmployee(emp: any) {
    this.http.delete(`${this.apiUrl}/api/v1/employee-data/staging/${emp.id}`).subscribe({
      next: () => { this.toast.success(`${emp.name} removed from queue`, 'Rejected'); this.loadStaging(); },
      error: () => this.toast.error('Failed to remove', 'Error')
    });
  }

  activateAllBulk() {
    this.http.post<any>(`${this.apiUrl}/api/v1/employee-data/staging/approve-all`, {}).subscribe({
      next: (res) => {
        this.toast.success(`${res.approved} employees activated`, 'All Approved');
        this.loadStaging();
        this.loadRoster();
      },
      error: () => this.toast.error('Failed to approve all', 'Error')
    });
  }

  compareBulk() {
    const existingEmails = new Set(this.employees().map((e: any) => e.email?.toLowerCase().trim()));
    const map: Record<string, boolean> = {};
    for (const emp of this.bulkEmployees()) {
      map[emp.id] = existingEmails.has(emp.email?.toLowerCase().trim());
    }
    this.bulkExistsMap.set(map);
    this.bulkCompared.set(true);
    const dupes = Object.values(map).filter(v => v).length;
    this.toast.info(`${dupes} duplicate${dupes !== 1 ? 's' : ''} found out of ${this.bulkEmployees().length} staging records`, 'Compare Complete');
  }

  getDuplicateCount(): number {
    return Object.values(this.bulkExistsMap()).filter(v => v).length;
  }

  async removeDuplicates() {
    const map = this.bulkExistsMap();
    const dupeIds = Object.keys(map).filter(id => map[id]);
    if (dupeIds.length === 0) return;

    this.removingDuplicates.set(true);
    let removed = 0;
    let errors = 0;

    for (const id of dupeIds) {
      try {
        await this.http.delete(`${this.apiUrl}/api/v1/employee-data/staging/${id}`).toPromise();
        removed++;
      } catch {
        errors++;
      }
    }

    this.removingDuplicates.set(false);
    this.toast.success(`${removed} duplicate${removed !== 1 ? 's' : ''} removed${errors > 0 ? `, ${errors} failed` : ''}`, 'Duplicates Cleaned');
    this.loadStaging();
    this.bulkCompared.set(false);
    this.bulkExistsMap.set({});
  }

  // ====== CSV Import ======

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.parseCSV(input.files[0]);
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.name.endsWith('.csv')) this.parseCSV(file);
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  }

  private parseCSV(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { this.toast.error('CSV must have a header and at least one row', 'Error'); return; }

      const headers = this.parseCsvLine(lines[0]);
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = this.parseCsvLine(lines[i]);
        const row: any = {};
        headers.forEach((h, idx) => row[h] = vals[idx] || '');

        const alias = (row.alias || '').trim();
        row.name = row.name || (alias && alias !== '-' ? alias : [row.firstname || row.FirstName, row.lastname || row.LastName].filter(Boolean).join(' ').trim()) || row.username || '';
        row.email = row.email || row.workemail || row.username || '';
        row.phone = row.phone || row.dialpad || row.Phone || '';
        row.role = row.role || row.Role || '';
        row.position = row.position || row.Position || '';
        row.department = row.department || row.Department || '';

        if (!row.name && !row.email) { row._error = 'Name or username required'; }
        rows.push(row);
      }
      this.importPreview.set(rows);
      this.importResult.set(null);
      this.toast.success(`${rows.length} rows parsed`, 'CSV Loaded');
    };
    reader.readAsText(file);
  }

  clearImport() {
    this.importPreview.set([]);
    this.importResult.set(null);
  }

  executeImport() {
    const rows = this.importPreview();
    if (!rows.length) return;

    const headers = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
    const csvLines = [headers.join(',')];
    rows.forEach(row => {
      csvLines.push(headers.map(h => `"${(row[h] || '').replace(/"/g, '""')}"`).join(','));
    });
    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'employees_import.csv');

    this.importing.set(true);
    this.http.post<any>(`${this.apiUrl}/api/v1/bulk/import/employees`, formData).subscribe({
      next: (res) => {
        this.importResult.set(res);
        this.importPreview.set([]);
        this.importing.set(false);
        if (res.successCount > 0) {
          this.toast.success(`${res.successCount} employees added to Bulk queue`, 'Import Complete');
          this.loadStaging();
        }
      },
      error: (err) => {
        this.importing.set(false);
        this.toast.error(err?.error?.message || 'Import failed', 'Error');
      }
    });
  }
}
