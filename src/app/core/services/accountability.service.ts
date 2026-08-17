import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AccountabilityEntry {
  id: number;
  jobPosition: string;
  individual?: string | null;
  notes?: string | null;
  employeeId?: number | null;
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
      map((res) => res?.data || []),
      tap((rows) => this._entries.set(rows))
    );
  }

  create(payload: AccountabilityWritePayload): Observable<AccountabilityEntry> {
    return this.http.post<{ data: AccountabilityEntry }>(this.url(), payload).pipe(
      map((res) => res.data),
      tap((row) => this._entries.update((list) => [...list, row]))
    );
  }

  update(id: number, payload: AccountabilityWritePayload): Observable<AccountabilityEntry> {
    return this.http.put<{ data: AccountabilityEntry }>(this.url(`/${id}`), payload).pipe(
      map((res) => res.data),
      tap((row) => this._entries.update((list) => list.map((e) => (e.id === id ? row : e))))
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(this.url(`/${id}`)).pipe(
      tap(() => this._entries.update((list) => list.filter((e) => e.id !== id)))
    );
  }
}
