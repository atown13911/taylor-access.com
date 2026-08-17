import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AccountabilityRole = 'Accountable' | 'Responsible' | 'Consulted' | 'Informed';
export type SeatStatus = 'Active' | 'Interim' | 'Vacant' | 'Transitioning';

export const ACCOUNTABILITY_ROLES: { value: AccountabilityRole; label: string; hint: string }[] = [
  { value: 'Accountable', label: 'Accountable', hint: 'Single throat to choke' },
  { value: 'Responsible', label: 'Responsible', hint: 'Does the work' },
  { value: 'Consulted', label: 'Consulted', hint: 'Gives input before decisions' },
  { value: 'Informed', label: 'Informed', hint: 'Kept in the loop' },
];

export const SEAT_STATUSES: SeatStatus[] = ['Active', 'Interim', 'Vacant', 'Transitioning'];

export const SCOPE_DOMAINS = [
  'Dispatch & Load Planning',
  'Owner-Operator Settlements & CPM',
  'Compliance / Safety / Drug Testing',
  'Recruiting & IC Agreements',
  'Bosnia Operations / Payroll',
  'Tech / TMS / Integrations',
  'Accounting / P&L / Factoring',
  'Insurance & Risk',
] as const;

export interface AccountabilityEntry {
  id: number;
  jobPosition: string;
  individual?: string | null;
  notes?: string | null;
  employeeId?: number | null;
  reportsToId?: number | null;
  accountabilityRole?: AccountabilityRole | string | null;
  seatStatus?: SeatStatus | string | null;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
  scopeTags?: string[] | null;
  keyResults?: string[] | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountabilityWritePayload {
  jobPosition: string;
  individual?: string | null;
  notes?: string | null;
  employeeId?: number | null;
  reportsToId?: number | null;
  accountabilityRole?: AccountabilityRole | string;
  seatStatus?: SeatStatus | string;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
  scopeTags?: string[];
  keyResults?: string[];
}

@Injectable({ providedIn: 'root' })
export class AccountabilityService {
  private http = inject(HttpClient);
  private readonly _entries = signal<AccountabilityEntry[]>([]);
  readonly entries = this._entries.asReadonly();

  private url(path = ''): string {
    return `${environment.apiUrl}/api/v1/accountability${path}`;
  }

  load(): Observable<AccountabilityEntry[]> {
    const params = new HttpParams().set('limit', '500');
    return this.http.get<{ data?: AccountabilityEntry[] }>(this.url(), { params }).pipe(
      map((res) => (res?.data || []).map((row) => this.normalize(row))),
      tap((rows) => this._entries.set(rows))
    );
  }

  create(payload: AccountabilityWritePayload): Observable<AccountabilityEntry> {
    return this.http.post<{ data: AccountabilityEntry }>(this.url(), payload).pipe(
      map((res) => this.normalize(res.data)),
      tap((row) => this._entries.update((list) => [...list, row]))
    );
  }

  update(id: number, payload: AccountabilityWritePayload): Observable<AccountabilityEntry> {
    return this.http.put<{ data: AccountabilityEntry }>(this.url(`/${id}`), payload).pipe(
      map((res) => this.normalize(res.data)),
      tap((row) => this._entries.update((list) => list.map((e) => (e.id === id ? row : e))))
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(this.url(`/${id}`)).pipe(
      tap(() => this._entries.update((list) => list.filter((e) => e.id !== id)))
    );
  }

  private normalize(row: AccountabilityEntry): AccountabilityEntry {
    return {
      ...row,
      scopeTags: Array.isArray(row?.scopeTags) ? row.scopeTags : [],
      keyResults: Array.isArray(row?.keyResults) ? row.keyResults : [],
      accountabilityRole: row?.accountabilityRole || 'Accountable',
      seatStatus: row?.seatStatus || 'Active',
    };
  }
}
