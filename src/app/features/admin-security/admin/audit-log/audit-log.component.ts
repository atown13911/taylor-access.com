import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AuditLog, AuditSummary } from '../../../../core/services/admin.service';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-log.component.html',
  styleUrls: ['./audit-log.component.scss']
})
export class AuditLogComponent implements OnInit {
  private adminService = inject(AdminService);

  Math = Math;

  logs = signal<AuditLog[]>([]);
  summary = signal<AuditSummary | null>(null);
  meta = signal<any>(null);
  selectedLog = signal<AuditLog | null>(null);
  
  loading = signal(true);
  
  dateRange = 'week';
  searchTerm = '';
  userFilter = '';
  filters = {
    entityType: '',
    action: '',
    severity: '',
    from: '',
    to: '',
    page: 1,
    limit: 25
  };

  /** Get unique user names from loaded logs for the user filter dropdown */
  uniqueUsers(): string[] {
    const names = this.logs().map(l => l.userName).filter((n): n is string => !!n);
    return [...new Set(names)].sort();
  }

  ngOnInit() {
    this.updateDateRange();
    this.loadSummary();
  }

  updateDateRange() {
    const now = new Date();
    switch (this.dateRange) {
      case 'today':
        this.filters.from = now.toISOString().split('T')[0];
        this.filters.to = '';
        break;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        this.filters.from = weekAgo.toISOString().split('T')[0];
        this.filters.to = '';
        break;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        this.filters.from = monthAgo.toISOString().split('T')[0];
        this.filters.to = '';
        break;
      case 'all':
        this.filters.from = '';
        this.filters.to = '';
        break;
    }
    this.loadLogs();
  }

  loadLogs() {
    this.loading.set(true);
    
    const params: any = {
      limit: this.filters.limit,
      page: this.filters.page
    };
    
    if (this.filters.entityType) params.entityType = this.filters.entityType;
    if (this.filters.action) params.action = this.filters.action;
    if (this.filters.severity) params.severity = this.filters.severity;
    if (this.filters.from) params.from = this.filters.from;
    if (this.filters.to) params.to = this.filters.to;

    this.adminService.getAuditLogs(params).subscribe({
      next: (response) => {
        this.logs.set(response.data);
        this.meta.set(response.meta);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  loadSummary() {
    this.adminService.getAuditSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
      }
    });
  }

  filteredLogs(): AuditLog[] {
    let results = this.logs();
    if (this.userFilter) {
      results = results.filter(l => l.userName === this.userFilter);
    }
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      results = results.filter(l =>
        (l.userName || '').toLowerCase().includes(term) ||
        (l.description || '').toLowerCase().includes(term) ||
        (l.entityType || '').toLowerCase().includes(term) ||
        (l.entityName || '').toLowerCase().includes(term) ||
        (l.action || '').toLowerCase().includes(term) ||
        (l.ipAddress || '').toLowerCase().includes(term)
      );
    }
    return results;
  }

  clearFilters() {
    this.filters = {
      entityType: '',
      action: '',
      severity: '',
      from: '',
      to: '',
      page: 1,
      limit: 25
    };
    this.dateRange = 'week';
    this.searchTerm = '';
    this.userFilter = '';
    this.updateDateRange();
  }

  changePage(page: number) {
    this.filters.page = page;
    this.loadLogs();
  }

  viewDetails(log: AuditLog) {
    this.selectedLog.set(log);
  }

  exportLogs() {
    this.adminService.exportAuditLogs(this.filters.from, this.filters.to, 'csv').subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    });
  }
}
