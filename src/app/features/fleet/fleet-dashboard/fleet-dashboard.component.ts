import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import * as topojson from 'topojson-client';
import { environment } from '../../../../environments/environment';

interface FleetDashboardStats {
  totalDrivers: number;
  activeDrivers: number;
  inactiveDrivers: number;
  driversWithDispatcher: number;
  driversUnassigned: number;
  dispatchers: number;
  totalCarriers: number;
  activeCarriers: number;
  totalFleets: number;
  trailersActive: number;
  trailersUnassigned: number;
  complianceAtRisk: number;
  fleetApplicants: number;
}

interface StatPanel {
  tone: 'cyan' | 'green' | 'orange' | 'violet';
  icon: string;
  label: string;
  badge: string;
  value: string | number;
  meter: number;
  chip: string;
  soft: string;
  route?: string;
}

interface ActionAlert {
  id: string;
  level: 'high' | 'medium' | 'low';
  tone: 'cyan' | 'green' | 'orange' | 'violet';
  icon: string;
  label: string;
  badge: string;
  value: string | number;
  meter: number;
  chip: string;
  soft: string;
  route?: string;
}

interface WavePoint2D {
  x: number;
  y: number;
}

interface FleetApplicantRow {
  position: string;
  appliedDate: string;
  state: string | null;
}

interface DriverTrendRow {
  startMonth: string;
  state: string | null;
}

interface PipelineSeries {
  months: string[];
  applicantsMonthly: number[];
  applicantsCumulative: number[];
  activeDrivers: number[];
}

interface UsStateShape {
  code: string;
  path: string;
  applicantCount: number;
  driverCount: number;
  applicantIntensity: number;
  driverIntensity: number;
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
  fleetApplicantCount = signal(0);
  fleetApplicantStateCounts = signal<Map<string, number>>(new Map());
  currentDriverStateCounts = signal<Map<string, number>>(new Map());
  pipelineSeries = signal<PipelineSeries | null>(null);
  usStateShapes = signal<UsStateShape[]>([]);
  usMapLoading = signal(false);
  usMapError = signal<string | null>(null);
  readonly applicantDensityYear = new Date().getFullYear();
  readonly usMapViewBox = '0 0 960 600';
  readonly pipelineView = { w: 1040, h: 320, padL: 48, padR: 48, padT: 18, padB: 40 };
  private usMapLoaded = false;
  private readonly usAtlasUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

  stats = signal<FleetDashboardStats>({
    totalDrivers: 0,
    activeDrivers: 0,
    inactiveDrivers: 0,
    driversWithDispatcher: 0,
    driversUnassigned: 0,
    dispatchers: 0,
    totalCarriers: 0,
    activeCarriers: 0,
    totalFleets: 0,
    trailersActive: 0,
    trailersUnassigned: 0,
    complianceAtRisk: 0,
    fleetApplicants: 0
  });

  readonly quickLinks = [
    { label: 'Driver Roster', icon: 'bx bx-id-card', route: '/drivers', detail: 'Manage driver records and status.' },
    { label: 'Dispatchers', icon: 'bx bx-broadcast', route: '/dispatchers', detail: 'Coverage and driver assignments.' },
    { label: 'Carriers', icon: 'bx bxs-truck', route: '/carriers', detail: 'View and update carrier profiles.' },
    { label: 'Fleet Entities', icon: 'bx bx-collection', route: '/fleet-entities', detail: 'Manage fleets, divisions, and terminals.' },
    { label: 'Asset Assignments', icon: 'bx bx-badge-check', route: '/compliance/tags-permits', detail: 'Review trailer and assignment compliance.' },
    { label: 'Compliance Board', icon: 'bx bx-shield-alt-2', route: '/compliance/driver-database', detail: 'Drivers at risk and document status.' }
  ];

  private pct(n: number, d: number): number {
    return d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0;
  }

  readonly statPanels = computed<StatPanel[]>(() => {
    const s = this.stats();
    const assignedPct = this.pct(s.driversWithDispatcher, s.activeDrivers || s.totalDrivers || 1);
    const unassignedPct = this.pct(s.driversUnassigned, s.activeDrivers || s.totalDrivers || 1);
    const trailerOpenPct = this.pct(s.trailersUnassigned, s.trailersActive || 1);
    const compliancePct = this.pct(s.complianceAtRisk, s.activeDrivers || s.totalDrivers || 1);
    const activePct = this.pct(s.activeDrivers, s.totalDrivers || 1);

    return [
      {
        tone: 'green',
        icon: 'bx-id-card',
        label: 'Active Drivers',
        badge: 'Roster',
        value: s.activeDrivers,
        meter: activePct,
        chip: `${s.totalDrivers} on file`,
        soft: `${activePct}% active`,
        route: '/drivers'
      },
      {
        tone: 'orange',
        icon: 'bx-broadcast',
        label: 'Dispatch Coverage',
        badge: 'Ops',
        value: `${assignedPct}%`,
        meter: assignedPct,
        chip: `${s.driversWithDispatcher} linked`,
        soft: `${s.dispatchers} dispatchers`,
        route: '/dispatchers'
      },
      {
        tone: 'cyan',
        icon: 'bx-user-x',
        label: 'Unassigned Drivers',
        badge: 'Coverage',
        value: s.driversUnassigned,
        meter: unassignedPct,
        chip: `${s.activeDrivers} active`,
        soft: unassignedPct > 0 ? 'Needs dispatcher' : 'Fully covered',
        route: '/dispatchers'
      },
      {
        tone: 'violet',
        icon: 'bx-shield-alt-2',
        label: 'Compliance At Risk',
        badge: 'DOT',
        value: s.complianceAtRisk,
        meter: compliancePct,
        chip: `${compliancePct}% of roster`,
        soft: s.complianceAtRisk > 0 ? 'Review board' : 'Clear',
        route: '/compliance/driver-database'
      },
      {
        tone: 'green',
        icon: 'bx-trailer',
        label: 'Unassigned Trailers',
        badge: 'Assets',
        value: s.trailersUnassigned,
        meter: trailerOpenPct,
        chip: `${s.trailersActive} active`,
        soft: `${trailerOpenPct}% open`,
        route: '/compliance/tags-permits'
      },
      {
        tone: 'cyan',
        icon: 'bx-user-plus',
        label: 'Fleet Applicants',
        badge: 'Hiring',
        value: s.fleetApplicants,
        meter: Math.min(100, s.fleetApplicants),
        chip: 'In pipeline',
        soft: s.fleetApplicants > 0 ? 'Recruiting' : 'None open',
        route: '/hr/applicants'
      },
      {
        tone: 'orange',
        icon: 'bx-collection',
        label: 'Fleet Entities',
        badge: 'Org',
        value: s.totalFleets,
        meter: s.totalFleets > 0 ? 100 : 0,
        chip: `${s.totalCarriers} carriers`,
        soft: `${s.activeCarriers} carriers active`,
        route: '/fleet-entities'
      },
      {
        tone: 'violet',
        icon: 'bx-user-minus',
        label: 'Inactive Drivers',
        badge: 'Status',
        value: s.inactiveDrivers,
        meter: this.pct(s.inactiveDrivers, s.totalDrivers || 1),
        chip: `${s.totalDrivers} total`,
        soft: s.inactiveDrivers > 0 ? 'May need review' : 'None',
        route: '/drivers'
      }
    ];
  });

  readonly actionAlerts = computed<ActionAlert[]>(() => {
    const s = this.stats();
    const items: ActionAlert[] = [];

    if (s.driversUnassigned > 0) {
      items.push({
        id: 'unassigned-drivers',
        level: s.driversUnassigned > 10 ? 'high' : 'medium',
        tone: 'orange',
        icon: 'bx-broadcast',
        label: 'Drivers Need Dispatcher',
        badge: 'Coverage',
        value: s.driversUnassigned,
        meter: this.pct(s.driversUnassigned, s.activeDrivers || 1),
        chip: `${s.activeDrivers} active`,
        soft: 'Assign coverage',
        route: '/dispatchers'
      });
    }
    if (s.complianceAtRisk > 0) {
      items.push({
        id: 'compliance',
        level: s.complianceAtRisk > 5 ? 'high' : 'medium',
        tone: 'violet',
        icon: 'bx-shield-alt-2',
        label: 'Compliance Pressure',
        badge: 'DOT',
        value: s.complianceAtRisk,
        meter: this.pct(s.complianceAtRisk, s.activeDrivers || s.totalDrivers || 1),
        chip: 'At risk',
        soft: 'Open board',
        route: '/compliance/driver-database'
      });
    }
    if (s.trailersUnassigned > 0) {
      items.push({
        id: 'trailers',
        level: 'medium',
        tone: 'green',
        icon: 'bx-trailer',
        label: 'Open Trailer Slots',
        badge: 'Assets',
        value: s.trailersUnassigned,
        meter: this.pct(s.trailersUnassigned, s.trailersActive || 1),
        chip: `${s.trailersActive} active`,
        soft: 'Assign assets',
        route: '/compliance/tags-permits'
      });
    }
    if (s.fleetApplicants > 0) {
      items.push({
        id: 'applicants',
        level: 'low',
        tone: 'cyan',
        icon: 'bx-user-plus',
        label: 'Fleet Hiring Pipeline',
        badge: 'Recruit',
        value: s.fleetApplicants,
        meter: Math.min(100, s.fleetApplicants),
        chip: 'Applicants',
        soft: 'Review candidates',
        route: '/hr/applicants'
      });
    }
    if (s.totalFleets === 0) {
      items.push({
        id: 'fleets',
        level: 'medium',
        tone: 'orange',
        icon: 'bx-collection',
        label: 'No Fleet Entities',
        badge: 'Setup',
        value: 0,
        meter: 0,
        chip: 'Missing org',
        soft: 'Create first fleet',
        route: '/fleet-entities'
      });
    }
    if (items.length === 0) {
      items.push({
        id: 'healthy',
        level: 'low',
        tone: 'green',
        icon: 'bx-check-circle',
        label: 'Fleet Health',
        badge: 'OK',
        value: 'Clear',
        meter: 100,
        chip: 'No blockers',
        soft: 'Looking good'
      });
    }
    return items.slice(0, 4);
  });

  readonly comparisonWindowLabel = computed(() => `YTD ${this.applicantDensityYear} (monthly)`);

  readonly peakApplicantMonthLabel = computed(() => {
    const series = this.pipelineSeries();
    if (!series?.months.length) return 'N/A';
    let peakIdx = 0;
    for (let i = 1; i < series.applicantsMonthly.length; i++) {
      if ((series.applicantsMonthly[i] ?? 0) > (series.applicantsMonthly[peakIdx] ?? 0)) peakIdx = i;
    }
    const month = series.months[peakIdx];
    const count = series.applicantsMonthly[peakIdx] ?? 0;
    return count > 0 ? `${this.formatMonthShort(month)} (${count})` : 'N/A';
  });

  readonly topStateBreakdown = computed(() => {
    const entries = Array.from(this.fleetApplicantStateCounts().entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return entries.map(([state, count]) => ({ state, count }));
  });

  readonly topDriverStateBreakdown = computed(() => {
    const entries = Array.from(this.currentDriverStateCounts().entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return entries.map(([state, count]) => ({ state, count }));
  });

  readonly pipelineWave = computed(() => {
    const series = this.pipelineSeries();
    const view = this.pipelineView;
    if (!series?.months.length) {
      return {
        hasData: false,
        kpis: [] as Array<{ label: string; value: string | number; soft: string; tone: string }>,
        leftTicks: [] as Array<{ y: number; label: string }>,
        rightTicks: [] as Array<{ y: number; label: string }>,
        points: [] as Array<{
          key: string;
          label: string;
          x: number;
          apps: number;
          monthApps: number;
          drivers: number;
          appsY: number;
          driversY: number;
        }>,
        applicantsPath: '',
        applicantsArea: '',
        driversPath: '',
        driversArea: ''
      };
    }

    const leftMax = Math.max(...series.applicantsCumulative, 1);
    const rightMax = Math.max(...series.activeDrivers, 1);
    const plotW = view.w - view.padL - view.padR;
    const plotH = view.h - view.padT - view.padB;
    const n = series.months.length;
    const xAt = (i: number) => view.padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yLeft = (v: number) => view.padT + (1 - v / leftMax) * plotH;
    const yRight = (v: number) => view.padT + (1 - v / rightMax) * plotH;
    const baseY = view.h - view.padB;

    const appPts: WavePoint2D[] = series.applicantsCumulative.map((v, i) => ({ x: xAt(i), y: yLeft(v) }));
    const drvPts: WavePoint2D[] = series.activeDrivers.map((v, i) => ({ x: xAt(i), y: yRight(v) }));

    const applicantsPath = this.smoothPath(appPts);
    const driversPath = this.smoothPath(drvPts);
    const closeArea = (path: string, pts: WavePoint2D[]) =>
      pts.length ? `${path} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z` : '';

    const tickCount = 5;
    const leftTicks = Array.from({ length: tickCount }, (_, i) => {
      const t = i / (tickCount - 1);
      const value = Math.round(leftMax * (1 - t));
      return { y: yLeft(value), label: String(value) };
    });
    const rightTicks = Array.from({ length: tickCount }, (_, i) => {
      const t = i / (tickCount - 1);
      const value = Math.round(rightMax * (1 - t));
      return { y: yRight(value), label: String(value) };
    });

    const latestApps = series.applicantsCumulative[series.applicantsCumulative.length - 1] ?? 0;
    const latestDrivers = series.activeDrivers[series.activeDrivers.length - 1] ?? 0;
    const latestMonthApps = series.applicantsMonthly[series.applicantsMonthly.length - 1] ?? 0;
    const ratio = latestDrivers > 0 ? (latestApps / latestDrivers).toFixed(1) : '—';

    return {
      hasData: true,
      kpis: [
        { label: 'Applicants YTD', value: latestApps, soft: `${latestMonthApps} this month`, tone: 'cyan' },
        { label: 'Active Drivers', value: latestDrivers, soft: 'Current roster', tone: 'violet' },
        { label: 'Apps / Driver', value: ratio, soft: 'Pipeline pressure', tone: 'orange' },
        {
          label: 'Peak Month',
          value: this.peakApplicantMonthLabel(),
          soft: 'Highest inflow',
          tone: 'green'
        }
      ],
      leftTicks,
      rightTicks,
      points: series.months.map((month, i) => ({
        key: month,
        label: this.formatMonthShort(month),
        x: xAt(i),
        apps: series.applicantsCumulative[i] ?? 0,
        monthApps: series.applicantsMonthly[i] ?? 0,
        drivers: series.activeDrivers[i] ?? 0,
        appsY: yLeft(series.applicantsCumulative[i] ?? 0),
        driversY: yRight(series.activeDrivers[i] ?? 0)
      })),
      applicantsPath,
      applicantsArea: closeArea(applicantsPath, appPts),
      driversPath,
      driversArea: closeArea(driversPath, drvPts)
    };
  });

  ngOnInit(): void {
    void this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [
        carriers,
        fleets,
        applicantRows,
        applicantPositions,
        driverRows,
        trailerRows,
        complianceRows,
        dispatcherRows
      ] = await Promise.all([
        this.fetchDataArray('/api/v1/carriers'),
        this.fetchDataArray('/api/v1/fleets'),
        this.fetchDataArray('/api/v1/applicants/records?includeCv=false'),
        this.fetchDataArray('/api/v1/applicants/positions'),
        this.fetchDataArray('/api/v1/drivers?limit=5000'),
        this.fetchDataArray('/api/v1/trailer-assignments?limit=2000'),
        this.fetchDataArray('/api/v1/drivers/compliance-board?limit=10000'),
        this.fetchDispatchers()
      ]);

      const totalCarriers = carriers.length;
      const activeCarriers = carriers.filter((c) => String(c?.status ?? '').toLowerCase() === 'active').length;

      const totalDrivers = driverRows.length;
      const activeDriversList = driverRows.filter(
        (d) => this.isActiveStatus(d?.status) && !this.isInactiveStatus(d?.status)
      );
      const inactiveDrivers = driverRows.filter((d) => this.isInactiveStatus(d?.status)).length;
      const driversWithDispatcher = activeDriversList.filter((d) => this.hasDispatcher(d)).length;
      const driversUnassigned = Math.max(activeDriversList.length - driversWithDispatcher, 0);

      const activeTrailers = trailerRows.filter((r) => {
        const status = String(r?.trailerStatus ?? 'active').toLowerCase();
        return status === 'active' || status === '';
      });
      const trailersUnassigned = activeTrailers.filter((r) => {
        const id = Number(r?.assignedDriverId);
        const name = String(r?.assignedDriverName ?? '').trim();
        return !(Number.isFinite(id) && id > 0) && !name;
      }).length;

      const complianceAtRisk = complianceRows.filter((r) => {
        const status = String(r?.overallStatus ?? r?.status ?? r?.complianceStatus ?? '').toLowerCase();
        return (
          status.includes('expired') ||
          status.includes('missing') ||
          status.includes('expiring') ||
          status.includes('at_risk') ||
          status.includes('risk')
        );
      }).length;

      const positionsGroupMap = this.buildPositionGroupMap(applicantPositions);
      const applicantParsed = this.parseFleetApplicants(applicantRows);
      const fleetApplicants = applicantParsed.filter((row) => this.isFleetPosition(row.position, positionsGroupMap));

      this.stats.set({
        totalDrivers,
        activeDrivers: activeDriversList.length,
        inactiveDrivers,
        driversWithDispatcher,
        driversUnassigned,
        dispatchers: dispatcherRows.length,
        totalCarriers,
        activeCarriers,
        totalFleets: fleets.length,
        trailersActive: activeTrailers.length,
        trailersUnassigned,
        complianceAtRisk,
        fleetApplicants: fleetApplicants.length
      });
      this.updateFleetApplicantInsights(applicantRows, applicantPositions, driverRows);
      this.lastUpdated.set(new Date());
    } catch {
      this.error.set('Unable to load fleet dashboard data right now.');
      this.fleetApplicantCount.set(0);
      this.fleetApplicantStateCounts.set(new Map());
      this.currentDriverStateCounts.set(new Map());
      this.pipelineSeries.set(null);
      this.usStateShapes.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchDispatchers(): Promise<any[]> {
    let dispatchers = (await this.fetchDataArray('/api/v1/users?role=dispatcher&limit=500')).filter((u) => {
      const role = String(u?.role ?? u?.Role ?? '').toLowerCase();
      return role.includes('dispatch');
    });
    if (dispatchers.length === 0) {
      dispatchers = (await this.fetchDataArray('/api/v1/users?limit=2000')).filter((u) => {
        const role = String(u?.role ?? u?.Role ?? '').toLowerCase();
        return role.includes('dispatch');
      });
    }
    return dispatchers;
  }

  private isActiveStatus(value: unknown): boolean {
    const s = String(value ?? '').trim().toLowerCase();
    return !s || ['active', 'available', 'assigned', 'dispatched', 'current', 'hired'].includes(s);
  }

  private isInactiveStatus(value: unknown): boolean {
    const s = String(value ?? '').trim().toLowerCase();
    return ['inactive', 'terminated', 'archived', 'off-duty', 'off duty', 'disabled'].includes(s);
  }

  private hasDispatcher(driver: any): boolean {
    const id = Number(driver?.dispatchUserId ?? driver?.dispatcherId ?? driver?.assignedDispatcherId);
    if (Number.isFinite(id) && id > 0) return true;
    const notes = String(driver?.notes ?? '');
    return /\[dispatch-assignee-id:\d+/i.test(notes);
  }

  private async fetchDataArray(path: string): Promise<any[]> {
    const response: any = await this.http.get(`${this.apiUrl}${path}`).toPromise();
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.items)) return response.items;
    if (Array.isArray(response?.results)) return response.results;
    return [];
  }

  private updateFleetApplicantInsights(recordsPayload: unknown[], positionsPayload: unknown[], driverPayload: unknown[]): void {
    const positionsGroupMap = this.buildPositionGroupMap(positionsPayload);
    const applicantRows = this.parseFleetApplicants(recordsPayload);
    const fleetApplicants = applicantRows.filter((row) => this.isFleetPosition(row.position, positionsGroupMap));
    const applicantStateCounts = this.buildStateCounts(fleetApplicants);
    const currentDriverStateCounts = this.buildCurrentDriverStateCounts(driverPayload);
    const driverTrendRows = this.parseDriverTrendRows(driverPayload);

    this.fleetApplicantCount.set(fleetApplicants.length);
    this.fleetApplicantStateCounts.set(applicantStateCounts);
    this.currentDriverStateCounts.set(currentDriverStateCounts);
    this.pipelineSeries.set(this.buildPipelineSeries(fleetApplicants, driverTrendRows));
    void this.refreshUsMap(applicantStateCounts, currentDriverStateCounts);
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

  private buildPipelineSeries(applicants: FleetApplicantRow[], drivers: DriverTrendRow[]): PipelineSeries {
    const year = this.applicantDensityYear;
    const now = new Date();
    const endMonth = now.getFullYear() === year ? now.getMonth() : 11;
    const months: string[] = [];
    for (let m = 0; m <= endMonth; m++) {
      months.push(`${year}-${String(m + 1).padStart(2, '0')}`);
    }

    const applicantsMonthly = months.map((month) =>
      applicants.filter((a) => a.appliedDate.slice(0, 7) === month).length
    );

    let running = 0;
    const applicantsCumulative = applicantsMonthly.map((n) => {
      running += n;
      return running;
    });

    const activeDrivers = months.map(
      (month) => drivers.filter((d) => !d.startMonth || d.startMonth <= month).length
    );

    return { months, applicantsMonthly, applicantsCumulative, activeDrivers };
  }

  private parseDriverTrendRows(payload: unknown[]): DriverTrendRow[] {
    const rows: DriverTrendRow[] = [];
    for (const item of payload) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const status = this.normalizeText(row['status'] ?? row['Status']).toLowerCase();
      if (this.isInactiveStatus(status)) continue;
      if (status && !this.isActiveStatus(status) && status !== 'current') continue;

      const hire = row['hireDate'] ?? row['HireDate'];
      const created = row['createdAt'] ?? row['CreatedAt'];
      let startMonth = '';
      if (hire != null && String(hire)) {
        startMonth = this.normalizeMonthKey(String(hire));
      }
      if (!startMonth && created != null) {
        startMonth = this.normalizeMonthKey(String(created));
      }
      rows.push({
        startMonth,
        state: this.extractDriverState(row)
      });
    }
    return rows;
  }

  private normalizeMonthKey(raw: string): string {
    const s = String(raw ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return '';
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private formatMonthShort(month: string): string {
    const m = parseInt(month.split('-')[1] ?? '0', 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[m - 1] ?? month;
  }

  private smoothPath(points: WavePoint2D[]): string {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  }

  private buildStateCounts(rows: FleetApplicantRow[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.state) continue;
      map.set(row.state, (map.get(row.state) ?? 0) + 1);
    }
    return map;
  }

  private buildCurrentDriverStateCounts(payload: unknown[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const item of payload) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const status = this.normalizeText(row['status'] ?? row['Status']).toLowerCase();
      const isCurrent =
        !status ||
        (status !== 'inactive' &&
          status !== 'terminated' &&
          status !== 'archived' &&
          status !== 'deleted');
      if (!isCurrent) continue;

      const state = this.extractDriverState(row);
      if (!state) continue;
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return counts;
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private async refreshUsMap(applicantStateCounts: Map<string, number>, driverStateCounts: Map<string, number>): Promise<void> {
    this.usMapLoading.set(true);
    this.usMapError.set(null);
    try {
      const atlasResponse = await fetch(this.usAtlasUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache'
      });
      if (!atlasResponse.ok) throw new Error(`Atlas request failed: ${atlasResponse.status}`);
      const atlasJson = await atlasResponse.json();
      const geoCollection = topojson.feature(atlasJson, atlasJson.objects.states) as any;
      const features = Array.isArray(geoCollection?.features) ? geoCollection.features : [];
      const projection = geoAlbersUsa().fitSize([960, 600], geoCollection);
      const pathGenerator = geoPath(projection);
      const maxApplicantCount = Math.max(...Array.from(applicantStateCounts.values()), 1);
      const maxDriverCount = Math.max(...Array.from(driverStateCounts.values()), 1);

      const nextShapes: UsStateShape[] = [];
      for (const feature of features) {
        const fips = String(feature?.id ?? '').padStart(2, '0');
        const code = this.fipsToStateCode.get(fips);
        if (!code) continue;
        const path = pathGenerator(feature);
        if (!path) continue;
        const applicantCount = applicantStateCounts.get(code) ?? 0;
        const driverCount = driverStateCounts.get(code) ?? 0;
        nextShapes.push({
          code,
          path,
          applicantCount,
          driverCount,
          applicantIntensity: maxApplicantCount > 0 ? applicantCount / maxApplicantCount : 0,
          driverIntensity: maxDriverCount > 0 ? driverCount / maxDriverCount : 0
        });
      }

      this.usStateShapes.set(nextShapes);
      this.usMapLoaded = true;
    } catch {
      this.usMapError.set('Map layer unavailable right now.');
      if (!this.usMapLoaded) this.usStateShapes.set([]);
    } finally {
      this.usMapLoading.set(false);
    }
  }

  getMapFill(shape: UsStateShape): string {
    const applicantLevel = Math.max(0, Math.min(1, shape.applicantIntensity || 0));
    const driverLevel = Math.max(0, Math.min(1, shape.driverIntensity || 0));
    // Drivers win when present so both fields stay visually distinct on the map.
    if (driverLevel > 0) {
      return this.sampleHeatColor(driverLevel, this.driverHeatStops);
    }
    if (applicantLevel > 0) {
      return this.sampleHeatColor(applicantLevel, this.applicantHeatStops);
    }
    return 'rgba(10, 18, 30, 0.85)';
  }

  /** Fire heat: ember → red → orange → yellow for applicants. */
  private readonly applicantHeatStops: Array<[number, number, number]> = [
    [60, 20, 10],     // deep ember
    [140, 30, 18],    // dark red
    [210, 55, 20],    // hot red-orange
    [245, 140, 30],   // orange
    [255, 220, 120]   // pale gold
  ];

  /** Fire heat variant: charcoal → crimson → amber for current drivers. */
  private readonly driverHeatStops: Array<[number, number, number]> = [
    [45, 12, 8],      // near-black ember
    [120, 18, 22],    // crimson
    [190, 40, 25],    // scarlet
    [235, 95, 28],    // blaze orange
    [255, 200, 90]    // yellow-white heat
  ];

  private sampleHeatColor(t: number, stops: Array<[number, number, number]>): string {
    const level = Math.max(0.1, Math.min(1, t));
    const scaled = level * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    const localT = scaled - i;
    const a = stops[i];
    const b = stops[i + 1];
    const r = Math.round(a[0] + (b[0] - a[0]) * localT);
    const g = Math.round(a[1] + (b[1] - a[1]) * localT);
    const bl = Math.round(a[2] + (b[2] - a[2]) * localT);
    const alpha = (0.78 + level * 0.22).toFixed(3);
    return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
  }

  getMapTooltip(shape: UsStateShape): string {
    return `${shape.code}: ${shape.applicantCount} applicants, ${shape.driverCount} current drivers`;
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

  private extractDriverState(row: Record<string, unknown>): string | null {
    const directCandidates = [
      row['state'],
      row['State'],
      row['licenseState'],
      row['LicenseState'],
      row['addressState'],
      row['AddressState']
    ];
    for (const value of directCandidates) {
      const normalized = this.normalizeUsState(value);
      if (normalized) return normalized;
    }

    const addressRef = row['addressRef'] ?? row['AddressRef'];
    if (addressRef && typeof addressRef === 'object') {
      const nested = addressRef as Record<string, unknown>;
      const normalized = this.normalizeUsState(nested['state'] ?? nested['State']);
      if (normalized) return normalized;
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

  private formatDateOnly(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private readonly fipsToStateCode = new Map<string, string>([
    ['01', 'AL'], ['02', 'AK'], ['04', 'AZ'], ['05', 'AR'], ['06', 'CA'], ['08', 'CO'], ['09', 'CT'], ['10', 'DE'],
    ['11', 'DC'], ['12', 'FL'], ['13', 'GA'], ['15', 'HI'], ['16', 'ID'], ['17', 'IL'], ['18', 'IN'], ['19', 'IA'],
    ['20', 'KS'], ['21', 'KY'], ['22', 'LA'], ['23', 'ME'], ['24', 'MD'], ['25', 'MA'], ['26', 'MI'], ['27', 'MN'],
    ['28', 'MS'], ['29', 'MO'], ['30', 'MT'], ['31', 'NE'], ['32', 'NV'], ['33', 'NH'], ['34', 'NJ'], ['35', 'NM'],
    ['36', 'NY'], ['37', 'NC'], ['38', 'ND'], ['39', 'OH'], ['40', 'OK'], ['41', 'OR'], ['42', 'PA'], ['44', 'RI'],
    ['45', 'SC'], ['46', 'SD'], ['47', 'TN'], ['48', 'TX'], ['49', 'UT'], ['50', 'VT'], ['51', 'VA'], ['53', 'WA'],
    ['54', 'WV'], ['55', 'WI'], ['56', 'WY']
  ]);

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
