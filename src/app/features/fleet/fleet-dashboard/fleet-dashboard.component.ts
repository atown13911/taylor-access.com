import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface FleetDashboardStats {
  totalDrivers: number;
  activeDrivers: number;
  inactiveDrivers: number;
  totalCarriers: number;
  activeCarriers: number;
  totalFleets: number;
}

@Component({
  selector: 'app-fleet-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './fleet-dashboard.component.html',
  styleUrls: ['./fleet-dashboard.component.scss']
})
export class FleetDashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  loading = signal(false);
  error = signal<string | null>(null);
  lastUpdated = signal<Date | null>(null);

  stats = signal<FleetDashboardStats>({
    totalDrivers: 0,
    activeDrivers: 0,
    inactiveDrivers: 0,
    totalCarriers: 0,
    activeCarriers: 0,
    totalFleets: 0
  });

  readonly quickLinks = [
    { label: 'Driver Roster', icon: 'bx bx-id-card', route: '/drivers', detail: 'Manage driver records and status.' },
    { label: 'Carriers', icon: 'bx bxs-truck', route: '/carriers', detail: 'View and update carrier profiles.' },
    { label: 'Fleet Entities', icon: 'bx bx-collection', route: '/fleet-entities', detail: 'Manage fleets, divisions, and terminals.' },
    { label: 'Asset Assignments', icon: 'bx bx-badge-check', route: '/compliance/tags-permits', detail: 'Review trailer and assignment compliance.' }
  ];

  readonly actionItems = computed(() => {
    const s = this.stats();
    const items: string[] = [];

    if (s.totalFleets === 0) items.push('No fleets created yet. Add your first fleet entity.');
    if (s.inactiveDrivers > 0) items.push(`${s.inactiveDrivers} drivers are currently inactive and may need review.`);
    if (s.totalCarriers > s.activeCarriers) items.push(`${s.totalCarriers - s.activeCarriers} carriers are not active.`);
    if (items.length === 0) items.push('Fleet health looks good. No immediate action items.');

    return items;
  });

  ngOnInit(): void {
    void this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [totalDrivers, activeDrivers, inactiveDrivers, carriers, fleets] = await Promise.all([
        this.fetchTotal('/api/v1/drivers?limit=1'),
        this.fetchTotal('/api/v1/drivers?status=active&limit=1'),
        this.fetchTotal('/api/v1/drivers?status=inactive&limit=1'),
        this.fetchDataArray('/api/v1/carriers'),
        this.fetchDataArray('/api/v1/fleets')
      ]);

      const totalCarriers = carriers.length;
      const activeCarriers = carriers.filter(c => String(c?.status ?? '').toLowerCase() === 'active').length;

      this.stats.set({
        totalDrivers,
        activeDrivers,
        inactiveDrivers,
        totalCarriers,
        activeCarriers,
        totalFleets: fleets.length
      });
      this.lastUpdated.set(new Date());
    } catch {
      this.error.set('Unable to load fleet dashboard data right now.');
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchTotal(path: string): Promise<number> {
    const response: any = await this.http.get(`${this.apiUrl}${path}`).toPromise();
    if (typeof response?.total === 'number') return response.total;
    if (Array.isArray(response?.data)) return response.data.length;
    return 0;
  }

  private async fetchDataArray(path: string): Promise<any[]> {
    const response: any = await this.http.get(`${this.apiUrl}${path}`).toPromise();
    return Array.isArray(response?.data) ? response.data : [];
  }
}
