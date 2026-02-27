import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// ============ ROLE INTERFACES ============

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  assignedAt: string;
  assignedBy?: string;
}

export interface Permission {
  key: string;
  value: string;
  category?: string;
  description?: string;
}

// ============ AUDIT INTERFACES ============

export interface AuditLog {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  oldValues?: string;
  newValues?: string;
  changes?: string;
  description?: string;
  module?: string;
  endpoint?: string;
  httpMethod?: string;
  httpStatusCode?: number;
  timestamp: string;
  severity: string;
}

export interface AuditSummary {
  period: { from: string; to: string };
  totalEvents: number;
  byAction: { [key: string]: number };
  byEntityType: { [key: string]: number };
  bySeverity: { [key: string]: number };
  byUser: { [key: string]: number };
  recentActivity: AuditLog[];
}

// ============ DASHBOARD INTERFACES ============

export interface DashboardStats {
  orders: {
    total: number;
    pending: number;
    dispatched: number;
    inTransit: number;
    delivered: number;
    completedToday: number;
  };
  loads: {
    total: number;
    quoted: number;
    booked: number;
    dispatched: number;
    delivered: number;
  };
  drivers: {
    total: number;
    online: number;
    available: number;
    onTrip: number;
  };
  vehicles: {
    total: number;
    active: number;
    maintenance: number;
    outOfService: number;
  };
  financial: {
    revenueToday: number;
    revenueThisWeek: number;
    revenueThisMonth: number;
    outstandingAR: number;
    outstandingAP: number;
    overdueInvoices: number;
    overduePayables: number;
  };
  generatedAt: string;
}

export interface DashboardAlert {
  type: 'info' | 'warning' | 'error';
  category: string;
  message: string;
  count: number;
}

export interface ChartDataPoint {
  date: string;
  value?: number;
  revenue?: number;
  count?: number;
  created?: number;
  completed?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  // ============ ROLES ============

  getRoles(): Observable<{ data: Role[] }> {
    return this.http.get<{ data: Role[] }>(`${this.baseUrl}/api/v1/roles`);
  }

  getRolesWithCounts(): Observable<{ data: (Role & { userCount: number })[] }> {
    return this.http.get<{ data: (Role & { userCount: number })[] }>(`${this.baseUrl}/api/v1/roles/with-counts`);
  }

  getRole(id: string): Observable<{ role: Role }> {
    return this.http.get<{ role: Role }>(`${this.baseUrl}/api/v1/roles/${id}`);
  }

  createRole(name: string, description?: string, permissions?: string[]): Observable<{ role: Role }> {
    return this.http.post<{ role: Role }>(`${this.baseUrl}/api/v1/roles`, {
      name,
      description,
      permissions
    });
  }

  updateRole(id: string, description?: string, permissions?: string[]): Observable<{ role: Role }> {
    return this.http.put<{ role: Role }>(`${this.baseUrl}/api/v1/roles/${id}`, {
      description,
      permissions
    });
  }

  deleteRole(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/api/v1/roles/${id}`);
  }

  getPermissions(): Observable<{ permissions: { [category: string]: Permission[] } }> {
    return this.http.get<{ permissions: { [category: string]: Permission[] } }>(
      `${this.baseUrl}/api/v1/roles/permissions`
    );
  }

  getUserRoles(userId: string): Observable<{ roles: Role[]; permissions: string[] }> {
    return this.http.get<{ roles: Role[]; permissions: string[] }>(
      `${this.baseUrl}/api/v1/roles/user/${userId}`
    );
  }

  assignRole(userId: string, roleId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/api/v1/roles/assign`, {
      userId,
      roleId
    });
  }

  removeRole(userId: string, roleId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/api/v1/roles/remove`, {
      userId,
      roleId
    });
  }

  // ============ AUDIT LOGS ============

  getAuditLogs(params?: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    action?: string;
    from?: string;
    to?: string;
    severity?: string;
    limit?: number;
    page?: number;
  }): Observable<{ data: AuditLog[]; meta: any }> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }
    return this.http.get<{ data: AuditLog[]; meta: any }>(
      `${this.baseUrl}/api/v1/audit`,
      { params: httpParams }
    );
  }

  getAuditLog(id: string): Observable<{ log: AuditLog }> {
    return this.http.get<{ log: AuditLog }>(`${this.baseUrl}/api/v1/audit/${id}`);
  }

  getEntityAuditHistory(entityType: string, entityId: string, limit = 50): Observable<{ data: AuditLog[] }> {
    return this.http.get<{ data: AuditLog[] }>(
      `${this.baseUrl}/api/v1/audit/entity/${entityType}/${entityId}?limit=${limit}`
    );
  }

  getUserActivity(userId: string, limit = 50): Observable<{ data: AuditLog[] }> {
    return this.http.get<{ data: AuditLog[] }>(
      `${this.baseUrl}/api/v1/audit/user/${userId}?limit=${limit}`
    );
  }

  getAuditSummary(from?: string, to?: string): Observable<AuditSummary> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<AuditSummary>(`${this.baseUrl}/api/v1/audit/summary`, { params });
  }

  getLoginHistory(from?: string, to?: string, limit = 100): Observable<{ data: any[] }> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    params = params.set('limit', limit.toString());
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/api/v1/audit/logins`, { params });
  }

  exportAuditLogs(from?: string, to?: string, format = 'json'): Observable<any> {
    let params = new HttpParams().set('format', format);
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    
    if (format === 'csv') {
      return this.http.get(`${this.baseUrl}/api/v1/audit/export`, { 
        params,
        responseType: 'blob'
      });
    }
    return this.http.get<{ data: AuditLog[] }>(`${this.baseUrl}/api/v1/audit/export`, { params });
  }

  // ============ DASHBOARD ============

  getDashboardStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.baseUrl}/api/v1/dashboard/stats`);
  }

  getCachedDashboardStats(): Observable<{ stats: any; isCached: boolean; cacheAge: string }> {
    return this.http.get<{ stats: any; isCached: boolean; cacheAge: string }>(
      `${this.baseUrl}/api/v1/dashboard/cached-stats`
    );
  }

  getRevenueChart(days = 30): Observable<{ data: ChartDataPoint[] }> {
    return this.http.get<{ data: ChartDataPoint[] }>(
      `${this.baseUrl}/api/v1/dashboard/charts/revenue?days=${days}`
    );
  }

  getOrdersChart(days = 30): Observable<{ data: ChartDataPoint[] }> {
    return this.http.get<{ data: ChartDataPoint[] }>(
      `${this.baseUrl}/api/v1/dashboard/charts/orders?days=${days}`
    );
  }

  getTopDrivers(limit = 5): Observable<{ data: any[] }> {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/api/v1/dashboard/top-drivers?limit=${limit}`
    );
  }

  getRecentActivity(limit = 20): Observable<{ data: AuditLog[] }> {
    return this.http.get<{ data: AuditLog[] }>(
      `${this.baseUrl}/api/v1/dashboard/activity?limit=${limit}`
    );
  }

  getDashboardAlerts(): Observable<{ alerts: DashboardAlert[]; generatedAt: string }> {
    return this.http.get<{ alerts: DashboardAlert[]; generatedAt: string }>(
      `${this.baseUrl}/api/v1/dashboard/alerts`
    );
  }
}
