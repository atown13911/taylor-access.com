import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-time-clock',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tc-page" [class.drawer-open]="drawerOpen()">
      <div class="tc-main">
        <div class="tc-header">
          <div>
            <h1><i class="bx bx-time-five"></i> Time Clock</h1>
            <p class="tc-sub">Employee hours overview</p>
          </div>
          <div class="tc-header-actions">
            <input type="date" class="tc-filter tc-date-input"
              [ngModel]="listDate()"
              (ngModelChange)="listDate.set($event); loadSessions()">
            <button class="tc-btn" (click)="loadSessions(); loadSummary()">
              <i class="bx bx-refresh"></i> Refresh
            </button>
          </div>
        </div>

        <div class="tc-stats">
          <div class="tc-stat">
            <i class="bx bx-group"></i>
            <div class="tc-stat-info">
              <span class="tc-stat-val">{{ filteredRoster().length }}</span>
              <span class="tc-stat-lbl">Active Employees</span>
            </div>
          </div>
          <div class="tc-stat">
            <i class="bx bx-user-check"></i>
            <div class="tc-stat-info">
              <span class="tc-stat-val">{{ activeCount() }}</span>
              <span class="tc-stat-lbl">Online Now</span>
            </div>
          </div>
          <div class="tc-stat">
            <i class="bx bx-time"></i>
            <div class="tc-stat-info">
              <span class="tc-stat-val">{{ totalHoursFiltered() }}h</span>
              <span class="tc-stat-lbl">Total Hours</span>
            </div>
          </div>
        </div>

        <div class="tc-filters-row">
          <div class="tc-search-bar">
            <i class="bx bx-search"></i>
            <input type="text" placeholder="Search employees..." [ngModel]="searchTerm()" (ngModelChange)="onSearchChange($event)" autocomplete="off">
          </div>
          <select class="tc-filter" [ngModel]="statusFilter()" (ngModelChange)="onStatusChange($event)">
            <option value="all">All Employees</option>
            <option value="active">Active (Online)</option>
            <option value="offline">Offline</option>
            <option value="has-hours">Has Hours</option>
            <option value="no-hours">No Hours</option>
          </select>
        </div>

        <div class="tc-table-wrap">
          <table class="tc-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Status</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th class="tc-hours-col">Active</th>
                <th class="tc-hours-col">Idle</th>
                <th class="tc-hours-col">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (emp of paginatedRoster(); track emp.userId) {
                <tr (click)="openDrawer(emp)" [class.selected]="selectedEmployee()?.userId === emp.userId">
                  <td class="tc-user-cell">
                    <div class="tc-avatar">{{ (emp.userName || 'U').charAt(0) }}</div>
                    <div class="tc-user-info">
                      <strong>{{ emp.userName }}</strong>
                      <span>{{ emp.userEmail }}</span>
                    </div>
                  </td>
                  <td>
                    @if (emp.status === 'active') {
                      <span class="tc-active-badge">● Active</span>
                    } @else if (emp.status === 'idle') {
                      <span class="tc-idle-badge">◌ Idle</span>
                    } @else {
                      <span class="tc-inactive-badge">○ Offline</span>
                    }
                  </td>
                  <td class="tc-time-cell">{{ emp.firstLogin ? formatTime(emp.firstLogin) : '—' }}</td>
                  <td class="tc-time-cell">{{ emp.lastLogout ? formatTime(emp.lastLogout) : (emp.status !== 'offline' ? 'Active' : '—') }}</td>
                  <td class="tc-hours-col"><span class="tc-hours-active">{{ formatDurationH(emp.activeSeconds) }}</span></td>
                  <td class="tc-hours-col"><span class="tc-hours-idle">{{ formatDurationH(emp.idleSeconds) }}</span></td>
                  <td class="tc-hours-col"><span class="tc-hours">{{ formatDurationH(emp.totalSeconds) }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="tc-empty">No employees found</td></tr>
              }
            </tbody>
          </table>

          <!-- Pagination Footer -->
          <div class="tc-pagination">
            <div class="tc-page-info">
              Showing {{ (currentPage() - 1) * pageSize() + 1 }}–{{ minOf(currentPage() * pageSize(), filteredRoster().length) }}
              of {{ filteredRoster().length }} employees
            </div>
            <div class="tc-page-controls">
              <button class="tc-pg-btn" [disabled]="currentPage() === 1" (click)="goToPage(1)">
                <i class="bx bx-chevrons-left"></i>
              </button>
              <button class="tc-pg-btn" [disabled]="currentPage() === 1" (click)="goToPage(currentPage() - 1)">
                <i class="bx bx-chevron-left"></i>
              </button>
              @for (p of pageNumbers(); track $index) {
                @if (p === '...') {
                  <span class="tc-pg-ellipsis">…</span>
                } @else {
                  <button class="tc-pg-btn" [class.active]="p === currentPage()" (click)="goToPage(p)">{{ p }}</button>
                }
              }
              <button class="tc-pg-btn" [disabled]="currentPage() === totalPages()" (click)="goToPage(currentPage() + 1)">
                <i class="bx bx-chevron-right"></i>
              </button>
              <button class="tc-pg-btn" [disabled]="currentPage() === totalPages()" (click)="goToPage(totalPages())">
                <i class="bx bx-chevrons-right"></i>
              </button>
            </div>
            <select class="tc-page-size" [ngModel]="pageSize()" (ngModelChange)="onPageSizeChange($event)">
              <option [value]="10">10 / page</option>
              <option [value]="25">25 / page</option>
              <option [value]="50">50 / page</option>
              <option [value]="100">100 / page</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Slide-out Drawer -->
      @if (drawerOpen()) {
        <div class="tc-drawer-backdrop" (click)="closeDrawer()"></div>
        <div class="tc-drawer">
          <div class="tc-drawer-header">
            <div class="tc-drawer-user">
              <div class="tc-drawer-avatar">{{ (selectedEmployee()?.userName || 'U').charAt(0) }}</div>
              <div>
                <h3>{{ selectedEmployee()?.userName }}</h3>
                <span>{{ selectedEmployee()?.userEmail }}</span>
              </div>
            </div>
            <button class="tc-drawer-close" (click)="closeDrawer()"><i class="bx bx-x"></i></button>
          </div>

          <div class="tc-drawer-body">
            <div class="tc-drawer-section">
              <label class="tc-drawer-label">Date</label>
              <input type="date" class="tc-date-input" [ngModel]="selectedDate()" (ngModelChange)="onDateChange($event)">
            </div>

            @if (!drawerLoading() && activeSystems().length > 0) {
              <div class="tc-drawer-section">
                <label class="tc-drawer-label">Active Systems</label>
                <div class="tc-systems-row">
                  @for (sys of activeSystems(); track sys) {
                    <span class="tc-system-chip">{{ sys }}</span>
                  }
                </div>
              </div>
            }

            <!-- Session summary from TimeclockSessions DB -->
            <div class="tc-drawer-section">
              <label class="tc-drawer-label">First Clock In</label>
              <div class="tc-clock-in-card">
                <i class="bx bx-log-in-circle"></i>
                @if (drawerLoading()) {
                  <span class="tc-clock-in-time">Loading...</span>
                } @else if (firstClockIn()) {
                  <span class="tc-clock-in-time">{{ firstClockIn() }}</span>
                } @else {
                  <span class="tc-clock-in-none">No clock-in recorded</span>
                }
              </div>
            </div>

            @if (!drawerLoading() && sessionSummary()) {
              <div class="tc-drawer-section">
                <label class="tc-drawer-label">Time Summary</label>
                <div class="tc-time-summary">
                  <div class="tc-time-stat">
                    <i class="bx bx-run" style="color:#00ff88"></i>
                    <div>
                      <div class="tc-time-val">{{ formatDuration(sessionSummary()!.activeSeconds) }}</div>
                      <div class="tc-time-lbl">Active</div>
                    </div>
                  </div>
                  <div class="tc-time-stat">
                    <i class="bx bx-time" style="color:#fbbf24"></i>
                    <div>
                      <div class="tc-time-val">{{ formatDuration(sessionSummary()!.idleSeconds) }}</div>
                      <div class="tc-time-lbl">Idle</div>
                    </div>
                  </div>
                  <div class="tc-time-stat">
                    <i class="bx bx-stopwatch" style="color:#00d4ff"></i>
                    <div>
                      <div class="tc-time-val">{{ formatDuration(sessionSummary()!.totalSeconds) }}</div>
                      <div class="tc-time-lbl">Total</div>
                    </div>
                  </div>
                  @if (sessionSummary()!.logoutTime) {
                    <div class="tc-time-stat">
                      <i class="bx bx-log-out-circle" style="color:#ff2a6d"></i>
                      <div>
                        <div class="tc-time-val">{{ formatTime(sessionSummary()!.logoutTime) }}</div>
                        <div class="tc-time-lbl">Clock Out</div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            <div class="tc-drawer-section tc-drawer-logs">
              <label class="tc-drawer-label">Activity Log <span class="tc-log-count">{{ employeeAuditLogs().length }}</span></label>
              @if (drawerLoading()) {
                <div class="tc-log-loading">Loading activity...</div>
              } @else if (employeeAuditLogs().length === 0) {
                <div class="tc-log-empty">No activity recorded for this day</div>
              } @else {
                <div class="tc-log-list">
                  @for (log of employeeAuditLogs(); track $index) {
                    <div class="tc-log-item" [class.tc-log-login]="isLoginAction(log.action)">
                      <div class="tc-log-time">{{ formatTime(log.timestamp) }}</div>
                      <div class="tc-log-content">
                        <div class="tc-log-action">{{ log.action }}</div>
                        <div class="tc-log-desc">{{ log.description || '' }}</div>
                      </div>
                      <div class="tc-log-meta">
                        <span class="tc-log-source">{{ log.source || log.module || '' }}</span>
                        <span class="tc-log-severity" [class]="'sev-' + (log.severity || 'info')">
                          {{ log.severity || 'info' }}
                        </span>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .tc-page { padding: 1.5rem; display: flex; position: relative; }
    .tc-main { flex: 1; min-width: 0; transition: margin-right 0.3s ease; }
    .tc-page.drawer-open .tc-main { margin-right: 420px; }

    .tc-header {
      display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;
      h1 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; margin: 0;
        i { color: var(--cyan, #00e5ff); }
      }
      .tc-sub { color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem; }
    }
    .tc-header-actions { display: flex; gap: 0.75rem; align-items: center; }
    .tc-filter {
      padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px; color: var(--text-primary); font-size: 0.85rem; outline: none; min-width: 180px;
      &:focus { border-color: var(--cyan); }
    }
    .tc-btn {
      display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem;
      border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
      color: var(--text-primary); font-size: 0.85rem; cursor: pointer; transition: all 0.2s;
      &:hover { border-color: var(--cyan); background: rgba(0,212,255,0.08); }
    }

    .tc-stats {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;
    }
    .tc-stat {
      display: flex; align-items: center; gap: 12px; padding: 1rem 1.25rem;
      background: rgba(10, 10, 20, 0.85); backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
      i { font-size: 1.5rem; color: var(--cyan, #00e5ff); }
    }
    .tc-stat-info { display: flex; flex-direction: column; }
    .tc-stat-val { font-size: 1.3rem; font-weight: 700; color: var(--text-primary); }
    .tc-stat-lbl { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }

    .tc-filters-row { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem; }
    .tc-search-bar {
      position: relative; flex: 1; display: flex; align-items: center;
      i { position: absolute; left: 12px; color: var(--text-secondary); font-size: 1rem; }
      input { width: 100%; padding: 0.6rem 1rem 0.6rem 2.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; color: var(--text-primary); font-size: 0.85rem;
        &:focus { outline: none; border-color: rgba(0,212,255,0.3); }
        &::placeholder { color: var(--text-secondary); }
      }
    }

    .tc-table-wrap {
      background: rgba(10, 10, 20, 0.85); backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden;
    }
    .tc-table {
      width: 100%; border-collapse: collapse;
      th, td { padding: 0.75rem 1rem; text-align: left; font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
      th { background: rgba(255,255,255,0.03); color: var(--cyan, #00e5ff); font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
      td { color: var(--text-primary); }
      tbody tr {
        cursor: pointer; transition: background 0.15s;
        &:hover { background: rgba(0,212,255,0.06); }
        &.selected { background: rgba(0,212,255,0.1); border-left: 3px solid var(--cyan, #00e5ff); }
        &:last-child td { border-bottom: none; }
      }
    }
    .tc-user-cell { display: flex; align-items: center; gap: 0.6rem; }
    .tc-avatar {
      width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, rgba(0,229,255,0.2), rgba(136,0,255,0.2)); border: 1px solid rgba(0,229,255,0.3);
      font-size: 0.75rem; font-weight: 700; color: var(--cyan); flex-shrink: 0;
    }
    .tc-user-info { display: flex; flex-direction: column; strong { font-size: 0.82rem; } span { font-size: 0.7rem; color: var(--text-secondary); } }
    .tc-role { font-size: 0.78rem; color: var(--text-secondary); text-transform: capitalize; }
    .tc-active-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.3); }
    .tc-inactive-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600; background: rgba(136,136,170,0.1); color: #8888aa; border: 1px solid rgba(136,136,170,0.3); }
    .tc-hours { font-weight: 600; color: var(--text-primary); font-size: 0.9rem; }
    .tc-sessions-count { font-weight: 600; color: var(--cyan); }
    .tc-last-active { font-size: 0.78rem; color: var(--text-secondary); }
    .tc-empty { text-align: center; color: var(--text-secondary); padding: 2rem !important; }

    /* ========== Drawer ========== */
    .tc-drawer-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 998;
    }
    .tc-drawer {
      position: fixed; top: 0; right: 0; bottom: 0; width: 400px; z-index: 999;
      background: rgba(12, 12, 24, 0.97); backdrop-filter: blur(24px);
      border-left: 1px solid rgba(0,212,255,0.15);
      display: flex; flex-direction: column;
      animation: slideIn 0.25s ease-out;
      box-shadow: -8px 0 32px rgba(0,0,0,0.5);
    }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

    .tc-drawer-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1.25rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .tc-drawer-user { display: flex; align-items: center; gap: 0.75rem; }
    .tc-drawer-avatar {
      width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, rgba(0,229,255,0.25), rgba(136,0,255,0.25)); border: 1px solid rgba(0,229,255,0.4);
      font-size: 1rem; font-weight: 700; color: var(--cyan);
    }
    .tc-drawer-header h3 { margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--text-primary); }
    .tc-drawer-header span { font-size: 0.75rem; color: var(--text-secondary); }
    .tc-drawer-close {
      width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04); color: var(--text-secondary); cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
      transition: all 0.2s;
      &:hover { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,0.1); }
    }

    .tc-drawer-body { flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem; }

    .tc-drawer-section { margin-bottom: 1.5rem; }
    .tc-drawer-label {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--cyan, #00e5ff); font-weight: 600; margin-bottom: 0.75rem;
    }
    .tc-log-count {
      font-size: 0.65rem; background: rgba(0,212,255,0.15); color: var(--cyan);
      padding: 1px 8px; border-radius: 10px;
    }

    .tc-date-input {
      width: 100%; padding: 0.6rem 0.75rem; background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
      color: var(--text-primary); font-size: 0.85rem;
      color-scheme: dark;
      &:focus { outline: none; border-color: var(--cyan); }
    }

    .tc-clock-in-card {
      display: flex; align-items: center; gap: 0.75rem; padding: 1rem;
      background: rgba(0, 255, 136, 0.04); border: 1px solid rgba(0, 255, 136, 0.15);
      border-radius: 10px;
      i { font-size: 1.5rem; color: #00ff88; }
    }
    .tc-clock-in-time { font-size: 1.3rem; font-weight: 700; color: #00ff88; font-family: 'JetBrains Mono', monospace; }
    .tc-clock-in-none { font-size: 0.85rem; color: var(--text-secondary); }

    .tc-systems-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .tc-system-chip {
      font-size: 0.68rem; font-weight: 600; padding: 3px 10px; border-radius: 12px;
      background: rgba(0,212,255,0.08); color: var(--cyan, #00e5ff); border: 1px solid rgba(0,212,255,0.2);
    }

    .tc-drawer-logs { flex: 1; display: flex; flex-direction: column; }
    .tc-log-loading, .tc-log-empty {
      text-align: center; color: var(--text-secondary); font-size: 0.82rem; padding: 2rem 0;
    }
    .tc-log-list { display: flex; flex-direction: column; gap: 2px; }
    .tc-log-item {
      display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.65rem 0.75rem;
      background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);
      transition: background 0.15s;
      &:hover { background: rgba(255,255,255,0.05); }
      &.tc-log-login { border-left: 3px solid #00ff88; background: rgba(0,255,136,0.03); }
    }
    .tc-log-time {
      font-size: 0.72rem; font-weight: 600; color: var(--cyan); white-space: nowrap;
      font-family: 'JetBrains Mono', monospace; min-width: 58px; padding-top: 2px;
    }
    .tc-log-content { flex: 1; min-width: 0; }
    .tc-log-action { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }
    .tc-log-desc { font-size: 0.7rem; color: var(--text-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tc-log-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
    .tc-log-source {
      font-size: 0.6rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap;
      background: rgba(136,0,255,0.1); color: #a855f7; border: 1px solid rgba(136,0,255,0.2);
    }
    .tc-log-severity {
      font-size: 0.6rem; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; white-space: nowrap;
      &.sev-info { background: rgba(0,170,255,0.1); color: #00aaff; }
      &.sev-warning { background: rgba(255,170,0,0.1); color: #ffaa00; }
      &.sev-error { background: rgba(255,68,68,0.1); color: #ff4444; }
    }

    /* ========== Pagination ========== */
    .tc-pagination {
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;
      padding: 0.65rem 1rem; border-top: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.01);
    }
    .tc-page-info { font-size: 0.72rem; color: var(--text-secondary); }
    .tc-page-controls { display: flex; align-items: center; gap: 3px; }
    .tc-pg-btn {
      min-width: 30px; height: 30px; padding: 0 6px;
      border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03); color: var(--text-secondary);
      font-size: 0.78rem; cursor: pointer; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center;
      &:hover:not([disabled]) { border-color: var(--cyan, #00e5ff); color: var(--cyan, #00e5ff); background: rgba(0,212,255,0.08); }
      &.active { border-color: var(--cyan, #00e5ff); color: var(--cyan, #00e5ff); background: rgba(0,212,255,0.12); font-weight: 700; }
      &[disabled] { opacity: 0.3; cursor: not-allowed; }
      i { font-size: 0.95rem; }
    }
    .tc-pg-ellipsis { color: var(--text-secondary); font-size: 0.78rem; padding: 0 4px; }
    .tc-page-size {
      padding: 0.3rem 0.5rem; background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;
      color: var(--text-primary); font-size: 0.72rem; cursor: pointer;
      &:focus { outline: none; border-color: var(--cyan); }
      option { background: #0a0a14; }
    }

    @media (max-width: 900px) {
      .tc-stats { grid-template-columns: repeat(2, 1fr); }
      .tc-drawer { width: 100%; }
      .tc-page.drawer-open .tc-main { margin-right: 0; }
      .tc-pagination { flex-direction: column; align-items: flex-start; }
    }
    .tc-idle-badge {
      background: rgba(251,191,36,0.12); color: #fbbf24;
      padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;
    }
    .tc-time-cell { font-size: 0.82rem; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
    .tc-hours-active { color: #00ff88; font-weight: 600; font-size: 0.85rem; }
    .tc-hours-idle   { color: #fbbf24; font-weight: 600; font-size: 0.85rem; }
    .tc-time-summary {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;
    }
    .tc-time-stat {
      display: flex; align-items: center; gap: 0.5rem;
      background: rgba(255,255,255,0.04); border-radius: 8px; padding: 0.6rem 0.75rem;
      i { font-size: 1.4rem; }
    }
    .tc-time-val { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
    .tc-time-lbl { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
  `]
})
export class TimeClockComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiUrl = environment.apiUrl;
  private echoApiUrl = environment.echoApiUrl;
  private clockInterval: any;
  private readonly LOGIN_ACTIONS = ['login', 'sso_login', 'session_start', 'user_login', 'app_launch', 'oauth_consent'];

  sessions = signal<any[]>([]);       // raw daily summary from /api/v1/timeclock/daily-summary
  users = signal<any[]>([]);
  selectedUserId = signal('');
  listDate = signal(new Date().toISOString().split('T')[0]); // date shown in the main list
  summary = signal<any>({ hoursToday: 0, hoursWeek: 0, hoursMonth: 0, sessionsToday: 0 });
  liveTimer = signal('0:00:00');
  private sessionStart = new Date();
  searchTerm = signal('');
  statusFilter = signal('all');
  selectedWeek = signal('current');

  // Pagination
  currentPage = signal(1);
  pageSize = signal(25);

  drawerOpen = signal(false);
  selectedEmployee = signal<any>(null);
  selectedDate = signal(new Date().toISOString().split('T')[0]);
  employeeAuditLogs = signal<any[]>([]);
  sessionSummary = signal<any>(null);
  drawerLoading = signal(false);

  firstClockIn = computed(() => {
    // Prefer precise session loginTime from TimeclockSessions DB
    const session = this.sessionSummary();
    if (session?.loginTime) {
      return new Date(session.loginTime).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
    }
    // Fall back to audit log login events
    const logs = this.employeeAuditLogs();
    const loginLogs = logs.filter(l => this.LOGIN_ACTIONS.includes(l.action));
    if (loginLogs.length === 0) return null;
    const sorted = [...loginLogs].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return new Date(sorted[0].timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  });

  activeSystems = computed(() => {
    const logs = this.employeeAuditLogs();
    const sources = new Set<string>();
    for (const l of logs) {
      if (l.source) sources.add(l.source);
      else if (l.module) sources.add(l.module);
    }
    return Array.from(sources).sort();
  });

  weekOptions = (() => {
    const weeks: { value: string; label: string }[] = [{ value: 'current', label: 'Current Week' }];
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (i * 7));
      const sun = new Date(d); sun.setDate(sun.getDate() - sun.getDay());
      const sat = new Date(sun); sat.setDate(sat.getDate() + 6);
      const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeks.push({ value: i.toString(), label: `Week of ${fmt(sun)} – ${fmt(sat)}` });
    }
    return weeks;
  })();

  private getWeekRange(): { start: Date; end: Date } {
    const now = new Date();
    const weekVal = this.selectedWeek();
    const weeksAgo = weekVal === 'current' ? 0 : parseInt(weekVal) || 0;
    const ref = new Date(now);
    ref.setDate(ref.getDate() - (weeksAgo * 7));
    const start = new Date(ref);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  employeeRoster = computed(() => {
    const allSessions = this.sessions(); // from /api/v1/timeclock/daily-summary
    const allUsers = this.users();
    const userMap = new Map<string, any>();

    for (const u of allUsers) {
      const key = u.id?.toString();
      if (!key) continue;
      userMap.set(key, {
        userId: u.id, userName: u.name || u.email || 'Unknown',
        userEmail: u.email || '', role: u.role || '',
        totalHours: 0, sessionCount: 0, isActive: false, lastActive: null
      });
    }

    // Merge daily-summary data (new timeclock) into the user map
    for (const s of allSessions) {
      const key = s.userEmail?.toLowerCase() || s.userId?.toString();
      if (!key) continue;
      const loginTime = new Date(s.loginTime);

      // Upsert into map using data from daily-summary endpoint
      userMap.set(key, {
        userId:        s.userId,
        userName:      s.userName || 'Unknown',
        userEmail:     s.userEmail || '',
        role:          userMap.get(key)?.role || '',
        status:        s.status || 'offline',
        firstLogin:    s.firstLogin,
        lastLogout:    s.lastLogout,
        lastHeartbeat: s.lastHeartbeat,
        activeSeconds: s.activeSeconds || 0,
        idleSeconds:   s.idleSeconds   || 0,
        totalSeconds:  s.totalSeconds  || 0,
        sessions:      s.sessions      || 1,
      });
    }

    return Array.from(userMap.values())
      .sort((a, b) => {
        const order: Record<string, number> = { active: 0, idle: 1, offline: 2 };
        return (order[a.status] ?? 2) - (order[b.status] ?? 2) ||
               (b.totalSeconds || 0) - (a.totalSeconds || 0);
      });
  });

  filteredRoster = computed(() => {
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    let roster = this.employeeRoster();
    if (search) {
      roster = roster.filter(e =>
        e.userName.toLowerCase().includes(search) || e.userEmail.toLowerCase().includes(search)
      );
    }
    if (status === 'active')         roster = roster.filter(e => e.status === 'active' || e.status === 'idle');
    else if (status === 'offline')   roster = roster.filter(e => e.status === 'offline');
    else if (status === 'has-hours') roster = roster.filter(e => (e.totalSeconds || 0) > 0);
    else if (status === 'no-hours')  roster = roster.filter(e => (e.totalSeconds || 0) === 0);
    return roster;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRoster().length / this.pageSize())));

  paginatedRoster = computed(() => {
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.filteredRoster().slice(start, start + size);
  });

  pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: (number | '...')[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push('...');
      for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
      if (current < total - 2) pages.push('...');
      pages.push(total);
    }
    return pages;
  });

  goToPage(page: number | '...') {
    if (typeof page !== 'number') return;
    this.currentPage.set(Math.max(1, Math.min(page, this.totalPages())));
  }

  onSearchChange(val: string) { this.searchTerm.set(val); this.currentPage.set(1); }
  onStatusChange(val: string) { this.statusFilter.set(val); this.currentPage.set(1); }
  onPageSizeChange(val: number) { this.pageSize.set(+val); this.currentPage.set(1); }

  activeCount = computed(() => this.employeeRoster().filter(e => e.status === 'active' || e.status === 'idle').length);
  totalHoursFiltered = computed(() => {
    const secs = this.employeeRoster().reduce((sum, e) => sum + (e.totalSeconds || 0), 0);
    return Math.round((secs / 3600) * 10) / 10;
  });

  ngOnInit(): void {
    this.loadSessions();
    this.loadSummary();
    this.loadUsers();
    this.sessionStart = new Date();
    this.clockInterval = setInterval(() => this.updateLiveTimer(), 1000);
    this.updateLiveTimer();
  }

  ngOnDestroy(): void { clearInterval(this.clockInterval); }

  loadSessions(): void {
    const token = this.auth.getToken();
    const date  = this.listDate();
    const headers = new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
    this.http.get<{ data: any[] }>(`${this.apiUrl}/api/v1/timeclock/daily-summary?date=${date}`, { headers })
      .subscribe({
        next: (res) => this.sessions.set(res?.data || []),
        error: () => this.sessions.set([])
      });
  }

  loadSummary(): void {
    const userId = this.selectedUserId();
    const params = userId ? `?userId=${userId}` : '';
    this.http.get<any>(`${this.apiUrl}/api/v1/sessions/summary${params}`).subscribe({
      next: (res) => this.summary.set(res || {}),
      error: () => {}
    });
  }

  loadUsers(): void {
    this.http.get<any>(`${this.apiUrl}/api/v1/users?limit=2000&status=active`).subscribe({
      next: (res) => this.users.set(res?.data || []),
      error: () => {}
    });
  }

  openDrawer(emp: any): void {
    this.selectedEmployee.set(emp);
    this.selectedDate.set(new Date().toISOString().split('T')[0]);
    this.drawerOpen.set(true);
    this.loadEmployeeDay(emp.userEmail, this.selectedDate());
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.selectedEmployee.set(null);
    this.employeeAuditLogs.set([]);
    this.sessionSummary.set(null);
  }

  onDateChange(date: string): void {
    this.selectedDate.set(date);
    const emp = this.selectedEmployee();
    if (emp) this.loadEmployeeDay(emp.userEmail, date);
  }

  loadEmployeeDay(userEmail: string, date: string): void {
    this.drawerLoading.set(true);
    this.employeeAuditLogs.set([]);
    this.sessionSummary.set(null);
    const token = this.auth.getToken();
    const headers = new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});

    // Load session data (active/idle/total time)
    this.http.get<{ data: any[] }>(`${this.apiUrl}/api/v1/timeclock/sessions`, {
      params: { email: userEmail, date }, headers
    }).subscribe({
      next: (res) => {
        const sessions: any[] = res?.data || [];
        if (sessions.length > 0) {
          const first  = sessions.reduce((a: any, b: any) => new Date(a.loginTime) < new Date(b.loginTime) ? a : b);
          const logout = sessions.filter((s: any) => s.logoutTime).reduce((a: any, b: any) =>
            new Date(a.logoutTime) > new Date(b.logoutTime) ? a : b, sessions[0]);
          this.sessionSummary.set({
            loginTime:     first.loginTime,
            logoutTime:    logout?.logoutTime ?? null,
            activeSeconds: sessions.reduce((s: number, r: any) => s + (r.activeSeconds || 0), 0),
            idleSeconds:   sessions.reduce((s: number, r: any) => s + (r.idleSeconds || 0), 0),
            totalSeconds:  sessions.reduce((s: number, r: any) => s + (r.totalSeconds || 0), 0),
          });
        }
      },
      error: () => {}
    });

    // Load audit log activity
    this.http.get<{ data: any[] }>(`${this.apiUrl}/api/v1/audit/employee-day`, {
      params: { email: userEmail, date }, headers
    }).subscribe({
      next: (res) => {
        this.employeeAuditLogs.set(res?.data || []);
        this.drawerLoading.set(false);
      },
      error: () => {
        this.employeeAuditLogs.set([]);
        this.drawerLoading.set(false);
      }
    });
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  /** Compact format for table columns: "1h 23m" or "45m" */
  formatDurationH(seconds: number): string {
    if (!seconds || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    if (m > 0) return `${m}m`;
    return `<1m`;
  }

  isLoginAction(action: string): boolean {
    return this.LOGIN_ACTIONS.includes(action) || action === 'logout' || action === 'session_end';
  }

  updateLiveTimer(): void {
    const diff = Date.now() - this.sessionStart.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    this.liveTimer.set(`${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
  }

  formatDateTime(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }

  formatTime(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  minOf(a: number, b: number): number { return Math.min(a, b); }
}
