import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';

interface DatabaseTable {
  id: string;
  name: string;
  displayName: string;
  icon: string;
  recordCount: number;
  lastModified: string;
  size: string;
  description: string;
}

interface TableRecord {
  id: string;
  [key: string]: any;
}

interface TableColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'status';
}

interface Backup {
  id: string;
  name: string;
  timestamp: string;
  size: string;
  status: string;
  type: string;
}

interface DatabaseStats {
  totalTables: number;
  totalRecords: number;
  estimatedSize: string;
  lastBackup: string;
  status: string;
}

@Component({
  selector: 'app-database',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './database.component.html',
  styleUrls: ['./database.component.scss']
})
export class DatabaseComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private baseUrl = environment.apiUrl;

  Math = Math; // Expose Math to template
  selectedTab = signal<'tables' | 'query' | 'backups'>('tables');
  selectedTable = signal<DatabaseTable | null>(null);
  searchQuery = signal('');
  tableSearchQuery = signal('');
  showRecordModal = signal(false);
  selectedRecord = signal<TableRecord | null>(null);
  loading = signal(false);

  tables = signal<DatabaseTable[]>([]);
  currentRecords = signal<TableRecord[]>([]);
  backups = signal<Backup[]>([]);
  stats = signal<DatabaseStats | null>(null);

  // Column definitions for different tables
  tableColumns: Record<string, TableColumn[]> = {
    orders: [
      { key: 'tss_number', label: 'TSS #', type: 'string' },
      { key: 'customer', label: 'Customer', type: 'string' },
      { key: 'origin', label: 'Origin', type: 'string' },
      { key: 'destination', label: 'Destination', type: 'string' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'created_at', label: 'Created', type: 'date' }
    ],
    contacts: [
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'code', label: 'Code', type: 'string' },
      { key: 'contact', label: 'Contact', type: 'string' },
      { key: 'email', label: 'Email', type: 'string' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'created_at', label: 'Created', type: 'date' }
    ],
    drivers: [
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'unit', label: 'Unit #', type: 'string' },
      { key: 'phone', label: 'Phone', type: 'string' },
      { key: 'license', label: 'License', type: 'string' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'hire_date', label: 'Hire Date', type: 'date' }
    ],
    vehicles: [
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'vin', label: 'VIN', type: 'string' },
      { key: 'make', label: 'Make', type: 'string' },
      { key: 'model', label: 'Model', type: 'string' },
      { key: 'status', label: 'Status', type: 'status' }
    ],
    invoices: [
      { key: 'invoiceNumber', label: 'Invoice #', type: 'string' },
      { key: 'customerName', label: 'Customer', type: 'string' },
      { key: 'totalAmount', label: 'Amount', type: 'number' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'createdAt', label: 'Created', type: 'date' }
    ],
    loads: [
      { key: 'internalId', label: 'Load #', type: 'string' },
      { key: 'pickupLocation', label: 'Origin', type: 'string' },
      { key: 'deliveryLocation', label: 'Destination', type: 'string' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'createdAt', label: 'Created', type: 'date' }
    ]
  };

  sqlQuery = signal('SELECT * FROM orders WHERE status = \'in_transit\' LIMIT 10;');

  filteredTables = computed(() => {
    const query = this.tableSearchQuery().toLowerCase();
    if (!query) return this.tables();
    return this.tables().filter(t => 
      t.name.toLowerCase().includes(query) ||
      t.displayName.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query)
    );
  });

  totalRecords = computed(() => 
    this.tables().reduce((sum, t) => sum + t.recordCount, 0)
  );

  totalSize = computed(() => {
    const bytes = this.tables().reduce((sum, t) => {
      const size = parseFloat(t.size);
      return sum + (isNaN(size) ? 0 : size);
    }, 0);
    return bytes.toFixed(1) + ' MB';
  });

  currentColumns = computed(() => {
    const table = this.selectedTable();
    if (!table) return [];
    return this.tableColumns[table.id] || [
      { key: 'id', label: 'ID', type: 'string' as const }
    ];
  });

  ngOnInit(): void {
    this.loadTables();
    this.loadStats();
    this.loadBackups();
  }

  async loadTables() {
    this.loading.set(true);
    try {
      const response = await this.http.get<{ data: DatabaseTable[] }>(`${this.baseUrl}/api/v1/database/tables`).toPromise();
      this.tables.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load database tables:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async loadStats() {
    try {
      const response = await this.http.get<DatabaseStats>(`${this.baseUrl}/api/v1/database/stats`).toPromise();
      if (response) {
        this.stats.set(response);
      }
    } catch (err) {
      console.error('Failed to load database stats:', err);
    }
  }

  async loadBackups() {
    try {
      const response = await this.http.get<{ data: Backup[] }>(`${this.baseUrl}/api/v1/database/backups`).toPromise();
      this.backups.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load backups:', err);
    }
  }

  async loadTableRecords(tableName: string) {
    this.loading.set(true);
    try {
      const response = await this.http.get<{ data: TableRecord[] }>(
        `${this.baseUrl}/api/v1/database/tables/${tableName}/records`
      ).toPromise();
      this.currentRecords.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load table records:', err);
      this.currentRecords.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatNumber(num: number): string {
    return new Intl.NumberFormat('en-US').format(num);
  }

  selectTable(table: DatabaseTable): void {
    this.selectedTable.set(table);
    this.loadTableRecords(table.id);
  }

  backToTables(): void {
    this.selectedTable.set(null);
    this.currentRecords.set([]);
  }

  viewRecord(record: TableRecord): void {
    this.selectedRecord.set(record);
    this.showRecordModal.set(true);
  }

  closeRecordModal(): void {
    this.showRecordModal.set(false);
    this.selectedRecord.set(null);
  }

  async exportTable(table: DatabaseTable): Promise<void> {
    try {
      const response = await this.http.get(`${this.baseUrl}/api/v1/database/tables/${table.id}/export`).toPromise();
      this.toast.success(`Exporting ${table.displayName} to CSV...`, 'Export Started');
    } catch (err) {
      console.error('Failed to export table:', err);
      this.toast.error('Failed to export table', 'Export Error');
    }
  }

  runQuery(): void {
    this.toast.info('Executing query...', 'Query');
    // In production, this would send the query to a backend endpoint
  }

  async createBackup(): Promise<void> {
    try {
      await this.http.post(`${this.baseUrl}/api/v1/database/backups`, { name: 'Manual Backup' }).toPromise();
      this.toast.success('Backup created successfully', 'Backup');
      this.loadBackups();
    } catch (err) {
      console.error('Failed to create backup:', err);
      this.toast.error('Failed to create backup', 'Backup Error');
    }
  }

  async restoreBackup(backup: Backup) {
    const ok = await this.confirm.show({ message: `Restore backup from ${this.formatDate(backup.timestamp)}? This will overwrite current data.`, type: 'danger', confirmText: 'Restore' });
    if (!ok) return;
    this.toast.info(`Restoring backup from ${this.formatDate(backup.timestamp)}...`, 'Restore');
  }

  downloadBackup(backup: Backup): void {
    this.toast.info(`Downloading ${backup.name}...`, 'Download');
  }

  refreshData(): void {
    this.loadTables();
    this.loadStats();
    this.loadBackups();
  }
}



