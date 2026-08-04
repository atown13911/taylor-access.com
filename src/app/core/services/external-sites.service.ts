import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ExternalSiteRecord {
  id: number;
  name: string;
  url: string;
  username?: string | null;
  password?: string | null;
  category?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExternalSiteWritePayload {
  name: string;
  url: string;
  username?: string | null;
  password?: string | null;
  category?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ExternalSitesService {
  private http = inject(HttpClient);
  private readonly _sites = signal<ExternalSiteRecord[]>([]);
  readonly sites = this._sites.asReadonly();

  private url(path = ''): string {
    return `${environment.apiUrl}/api/v1/external-sites${path}`;
  }

  load(_force = false): Observable<ExternalSiteRecord[]> {
    const params = new HttpParams().set('limit', '500');
    return this.http.get<{ data?: ExternalSiteRecord[] }>(this.url(), { params }).pipe(
      map((res) => res?.data || []),
      tap((rows) => this._sites.set(rows))
    );
  }

  create(payload: ExternalSiteWritePayload): Observable<ExternalSiteRecord> {
    return this.http.post<{ data: ExternalSiteRecord }>(this.url(), payload).pipe(
      map((res) => res.data),
      tap((row) => this._sites.update((list) => [...list, row].sort((a, b) => a.name.localeCompare(b.name))))
    );
  }

  update(id: number, payload: ExternalSiteWritePayload): Observable<ExternalSiteRecord> {
    return this.http.put<{ data: ExternalSiteRecord }>(this.url(`/${id}`), payload).pipe(
      map((res) => res.data),
      tap((row) =>
        this._sites.update((list) =>
          list.map((s) => (s.id === id ? row : s)).sort((a, b) => a.name.localeCompare(b.name))
        )
      )
    );
  }
}
