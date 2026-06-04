import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Color, NgxChartsModule, ScaleType } from '@swimlane/ngx-charts';
import { environment } from '../../../../environments/environment';

interface FleetDashboardStats {
  totalDrivers: number;
  activeDrivers: number;
  inactiveDrivers: number;
  totalCarriers: number;
  activeCarriers: number;
  totalFleets: number;
}

interface ChartPoint {
  name: string;
  value: number;
}

interface FleetApplicantRow {
  position: string;
  appliedDate: string;
  state: string | null;
}

@Component({
  selector: 'app-fleet-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NgxChartsModule],
  templateUrl: './fleet-dashboard.component.html',
  styleUrls: ['./fleet-dashboard.component.scss']
})
export class FleetDashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  loading = signal(false);
  error = signal<string | null>(null);
  lastUpdated = signal<Date | null>(null);
  fleetApplicantDensityData = signal<ChartPoint[]>([]);
  fleetApplicantCount = signal(0);
  fleetApplicantStateCounts = signal<Map<string, number>>(new Map());
  readonly applicantDensityWindowDays = 60;
  readonly fleetApplicantDensityScheme: Color = {
    name: 'fleet-applicant-density',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#00d4ff']
  };

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

  readonly fleetApplicantDensityChartData = computed(() => [
    { name: 'Fleet Applicant Density', series: this.fleetApplicantDensityData() }
  ]);

  readonly stateHeatmapTiles = computed(() => {
    const counts = this.fleetApplicantStateCounts();
    const maxCount = Math.max(...Array.from(counts.values()), 1);
    return this.usStateOrder
      .map((state) => {
        const count = counts.get(state) ?? 0;
        const intensity = maxCount > 0 ? count / maxCount : 0;
        return { state, count, intensity };
      });
  });

  readonly topStateBreakdown = computed(() => {
    const entries = Array.from(this.fleetApplicantStateCounts().entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return entries.map(([state, count]) => ({ state, count }));
  });

  readonly peakDensityLabel = computed(() => {
    const points = this.fleetApplicantDensityData();
    if (points.length === 0) return 'N/A';
    const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
    return peak?.name || 'N/A';
  });

  ngOnInit(): void {
    void this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [totalDrivers, activeDrivers, inactiveDrivers, carriers, fleets, applicantRows, applicantPositions] = await Promise.all([
        this.fetchTotal('/api/v1/drivers?limit=1'),
        this.fetchTotal('/api/v1/drivers?status=active&limit=1'),
        this.fetchTotal('/api/v1/drivers?status=inactive&limit=1'),
        this.fetchDataArray('/api/v1/carriers'),
        this.fetchDataArray('/api/v1/fleets'),
        this.fetchDataArray('/api/v1/applicants/records?includeCv=false'),
        this.fetchDataArray('/api/v1/applicants/positions')
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
      this.updateFleetApplicantInsights(applicantRows, applicantPositions);
      this.lastUpdated.set(new Date());
    } catch {
      this.error.set('Unable to load fleet dashboard data right now.');
      this.fleetApplicantDensityData.set([]);
      this.fleetApplicantCount.set(0);
      this.fleetApplicantStateCounts.set(new Map());
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

  private updateFleetApplicantInsights(recordsPayload: unknown[], positionsPayload: unknown[]): void {
    const positionsGroupMap = this.buildPositionGroupMap(positionsPayload);
    const applicantRows = this.parseFleetApplicants(recordsPayload);
    const fleetApplicants = applicantRows.filter((row) => this.isFleetPosition(row.position, positionsGroupMap));
    const densityPoints = this.buildDensityPoints(fleetApplicants, this.applicantDensityWindowDays);
    const stateCounts = this.buildStateCounts(fleetApplicants);

    this.fleetApplicantCount.set(fleetApplicants.length);
    this.fleetApplicantDensityData.set(densityPoints);
    this.fleetApplicantStateCounts.set(stateCounts);
  }

  private buildPositionGroupMap(payload: unknown[]): Map<string, 'fleet' | 'office'> {
    const map = new Map<string, 'fleet' | 'office'>();
    for (const item of payload) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const name = this.normalizeText(row['name'] ?? row['Name']);
      if (!name) continue;
      const group = this.normalizeText(row['group'] ?? row['Group']).toLowerCase();
      map.set(name.toLowerCase(), group === 'fleet' ? 'fleet' : 'office');
    }
    return map;
  }

  private parseFleetApplicants(payload: unknown[]): FleetApplicantRow[] {
    const rows: FleetApplicantRow[] = [];
    for (const item of payload) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const position = this.normalizeText(row['position'] ?? row['Position']);
      const appliedDate = this.toDateOnlyIso(row['appliedDate'] ?? row['AppliedDate']);
        const state = this.extractApplicantState(row);
      if (!position || !appliedDate) continue;
      rows.push({ position, appliedDate, state });
    }
    return rows;
  }

  private isFleetPosition(position: string, map: Map<string, 'fleet' | 'office'>): boolean {
    const normalized = this.normalizeText(position).toLowerCase();
    if (!normalized) return false;
    const explicitGroup = map.get(normalized);
    if (explicitGroup) return explicitGroup === 'fleet';
    const fleetKeywords = ['driver', 'otr', 'cdl', 'truck', 'tractor', 'fleet', 'owner operator', 'owner-operator'];
    return fleetKeywords.some((keyword) => normalized.includes(keyword));
  }

  private buildDensityPoints(rows: FleetApplicantRow[], dayWindow: number): ChartPoint[] {
    const windowDays = Math.max(dayWindow, 14);
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (windowDays - 1));

    const counts = new Map<string, number>();
    for (const row of rows) {
      const parsed = this.parseDateOnly(row.appliedDate);
      if (!parsed || parsed < start || parsed > end) continue;
      const key = row.appliedDate;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const rawPoints: ChartPoint[] = [];
    for (let i = 0; i < windowDays; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = this.formatDateOnly(date);
      rawPoints.push({
        name: key,
        value: counts.get(key) ?? 0
      });
    }

    return this.smoothDensity(rawPoints, 3);
  }

  private buildStateCounts(rows: FleetApplicantRow[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.state) continue;
      map.set(row.state, (map.get(row.state) ?? 0) + 1);
    }
    return map;
  }

  private smoothDensity(points: ChartPoint[], radius: number): ChartPoint[] {
    if (points.length === 0) return [];
    const smoothed: ChartPoint[] = [];

    for (let i = 0; i < points.length; i++) {
      let weightedSum = 0;
      let totalWeight = 0;

      for (let offset = -radius; offset <= radius; offset++) {
        const index = i + offset;
        if (index < 0 || index >= points.length) continue;
        const weight = radius + 1 - Math.abs(offset);
        weightedSum += (points[index]?.value ?? 0) * weight;
        totalWeight += weight;
      }

      smoothed.push({
        name: points[i]?.name ?? '',
        value: totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : 0
      });
    }

    return smoothed;
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private extractApplicantState(row: Record<string, unknown>): string | null {
    const directCandidates = [
      row['state'],
      row['State'],
      row['homeState'],
      row['HomeState'],
      row['locationState'],
      row['LocationState']
    ];

    for (const value of directCandidates) {
      const normalized = this.normalizeUsState(value);
      if (normalized) return normalized;
    }

    const notes = this.normalizeText(row['notes'] ?? row['Notes']);
    if (notes) {
      const homeStateMatch = notes.match(/home\s+state\s*:\s*([A-Za-z .-]+)/i);
      if (homeStateMatch?.[1]) {
        const normalized = this.normalizeUsState(homeStateMatch[1]);
        if (normalized) return normalized;
      }
    }

    return null;
  }

  private normalizeUsState(value: unknown): string | null {
    const raw = this.normalizeText(value);
    if (!raw) return null;

    const compact = raw.replace(/[.]/g, '').trim();
    if (compact.length === 2) {
      const code = compact.toUpperCase();
      return this.usStateNameToCode.has(code) ? code : null;
    }

    const normalizedName = compact.toLowerCase().replace(/\s+/g, ' ');
    return this.usStateNameToCode.get(normalizedName) ?? null;
  }

  private toDateOnlyIso(value: unknown): string {
    const text = this.normalizeText(value);
    if (!text) return '';
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setHours(0, 0, 0, 0);
    return this.formatDateOnly(parsed);
  }

  private parseDateOnly(value: string): Date | null {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private formatDateOnly(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private readonly usStateOrder = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
  ];

  private readonly usStateNameToCode = new Map<string, string>([
    ['AL', 'AL'], ['AK', 'AK'], ['AZ', 'AZ'], ['AR', 'AR'], ['CA', 'CA'], ['CO', 'CO'], ['CT', 'CT'], ['DE', 'DE'],
    ['FL', 'FL'], ['GA', 'GA'], ['HI', 'HI'], ['ID', 'ID'], ['IL', 'IL'], ['IN', 'IN'], ['IA', 'IA'], ['KS', 'KS'],
    ['KY', 'KY'], ['LA', 'LA'], ['ME', 'ME'], ['MD', 'MD'], ['MA', 'MA'], ['MI', 'MI'], ['MN', 'MN'], ['MS', 'MS'],
    ['MO', 'MO'], ['MT', 'MT'], ['NE', 'NE'], ['NV', 'NV'], ['NH', 'NH'], ['NJ', 'NJ'], ['NM', 'NM'], ['NY', 'NY'],
    ['NC', 'NC'], ['ND', 'ND'], ['OH', 'OH'], ['OK', 'OK'], ['OR', 'OR'], ['PA', 'PA'], ['RI', 'RI'], ['SC', 'SC'],
    ['SD', 'SD'], ['TN', 'TN'], ['TX', 'TX'], ['UT', 'UT'], ['VT', 'VT'], ['VA', 'VA'], ['WA', 'WA'], ['WV', 'WV'],
    ['WI', 'WI'], ['WY', 'WY'], ['DC', 'DC'],
    ['alabama', 'AL'], ['alaska', 'AK'], ['arizona', 'AZ'], ['arkansas', 'AR'], ['california', 'CA'],
    ['colorado', 'CO'], ['connecticut', 'CT'], ['delaware', 'DE'], ['florida', 'FL'], ['georgia', 'GA'],
    ['hawaii', 'HI'], ['idaho', 'ID'], ['illinois', 'IL'], ['indiana', 'IN'], ['iowa', 'IA'], ['kansas', 'KS'],
    ['kentucky', 'KY'], ['louisiana', 'LA'], ['maine', 'ME'], ['maryland', 'MD'], ['massachusetts', 'MA'],
    ['michigan', 'MI'], ['minnesota', 'MN'], ['mississippi', 'MS'], ['missouri', 'MO'], ['montana', 'MT'],
    ['nebraska', 'NE'], ['nevada', 'NV'], ['new hampshire', 'NH'], ['new jersey', 'NJ'], ['new mexico', 'NM'],
    ['new york', 'NY'], ['north carolina', 'NC'], ['north dakota', 'ND'], ['ohio', 'OH'], ['oklahoma', 'OK'],
    ['oregon', 'OR'], ['pennsylvania', 'PA'], ['rhode island', 'RI'], ['south carolina', 'SC'],
    ['south dakota', 'SD'], ['tennessee', 'TN'], ['texas', 'TX'], ['utah', 'UT'], ['vermont', 'VT'],
    ['virginia', 'VA'], ['washington', 'WA'], ['west virginia', 'WV'], ['wisconsin', 'WI'], ['wyoming', 'WY'],
    ['district of columbia', 'DC']
  ]);
}
