import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// ============ TWO-FACTOR AUTH ============
export interface TwoFactorStatus {
  isEnabled: boolean;
  enabledAt?: string;
  lastVerifiedAt?: string;
}

export interface TwoFactorSetupResponse {
  secretKey: string;
  qrCodeUri: string;
  backupCodes: string[];
}

// ============ USER INVITATIONS ============
export interface UserInvitation {
  id: string;
  email: string;
  name?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  role?: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
  isExpired: boolean;
}

export interface CreateInvitationRequest {
  email: string;
  name?: string;
  roleId?: string;
  personalMessage?: string;
}

export interface AcceptInvitationRequest {
  token: string;
  name: string;
  password: string;
  confirmPassword: string;
  phone?: string;
}

// ============ BULK OPERATIONS ============
export interface BulkImportJob {
  id: string;
  entityType: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRows: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  errors?: any[];
  createdAt: string;
  completedAt?: string;
}

export interface BulkExportJob {
  id: string;
  entityType: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRecords: number;
  downloadUrl?: string;
  createdAt: string;
  completedAt?: string;
}

// ============ CUSTOM REPORTS ============
export interface CustomReport {
  id: string;
  name: string;
  description?: string;
  dataSource: string;
  columns: string[] | string; // Can be array or JSON string
  filters?: Record<string, string>;
  groupBy?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDataSource {
  id: string;
  name: string;
  description: string;
  fields: { name: string; type: string; label: string; }[];
}

// ============ PUSH NOTIFICATIONS ============
export interface PushSubscription {
  id: string;
  platform: 'web' | 'ios' | 'android';
  deviceName?: string;
  lastPushAt?: string;
  createdAt: string;
}

export interface NotificationLog {
  id: string;
  type: string;
  title: string;
  body: string;
  channel: 'push' | 'email' | 'sms' | 'in_app';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'read';
  createdAt: string;
  readAt?: string;
}

// ============ INTEGRATIONS ============
export interface IntegrationStatus {
  status: 'not_configured' | 'active' | 'error';
  features?: string[];
  setupRequired?: boolean;
}

export interface AllIntegrations {
  quickbooks: IntegrationStatus;
  eld: IntegrationStatus;
  loadboards: IntegrationStatus;
  fuelcards: IntegrationStatus;
  mapping: IntegrationStatus;
}

@Injectable({
  providedIn: 'root'
})
export class ExtendedApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  // ==========================================
  // TWO-FACTOR AUTHENTICATION
  // ==========================================

  get2FAStatus(): Observable<TwoFactorStatus> {
    return this.http.get<TwoFactorStatus>(`${this.baseUrl}${environment.api.twoFactor}/status`);
  }

  setup2FA(): Observable<TwoFactorSetupResponse> {
    return this.http.post<TwoFactorSetupResponse>(`${this.baseUrl}${environment.api.twoFactor}/setup`, {});
  }

  enable2FA(code: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}${environment.api.twoFactor}/enable`, { code });
  }

  verify2FA(code: string, userId: string): Observable<{ verified: boolean }> {
    return this.http.post<{ verified: boolean }>(
      `${this.baseUrl}${environment.api.twoFactor}/verify?userId=${userId}`, 
      { code }
    );
  }

  disable2FA(password: string, code: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}${environment.api.twoFactor}/disable`, { password, code });
  }

  useBackupCode(backupCode: string, userId: string): Observable<{ verified: boolean; remainingBackupCodes: number }> {
    return this.http.post<{ verified: boolean; remainingBackupCodes: number }>(
      `${this.baseUrl}${environment.api.twoFactor}/backup-code?userId=${userId}`, 
      { backupCode }
    );
  }

  regenerateBackupCodes(code: string): Observable<{ backupCodes: string[] }> {
    return this.http.post<{ backupCodes: string[] }>(`${this.baseUrl}${environment.api.twoFactor}/regenerate-backup-codes`, { code });
  }

  // ==========================================
  // USER INVITATIONS
  // ==========================================

  getInvitations(status?: string, limit = 25, page = 1): Observable<{ data: UserInvitation[]; meta: any }> {
    let params = new HttpParams().set('limit', limit.toString()).set('page', page.toString());
    if (status) params = params.set('status', status);
    return this.http.get<{ data: UserInvitation[]; meta: any }>(`${this.baseUrl}${environment.api.invitations}`, { params });
  }

  createInvitation(request: CreateInvitationRequest): Observable<{ message: string; invitation: Partial<UserInvitation> }> {
    return this.http.post<{ message: string; invitation: Partial<UserInvitation> }>(`${this.baseUrl}${environment.api.invitations}`, request);
  }

  verifyInvitation(token: string): Observable<{ valid: boolean; email?: string; name?: string; role?: string; expiresAt?: string }> {
    return this.http.get<{ valid: boolean; email?: string; name?: string; role?: string; expiresAt?: string }>(
      `${this.baseUrl}${environment.api.invitations}/verify?token=${token}`
    );
  }

  acceptInvitation(request: AcceptInvitationRequest): Observable<{ message: string; user: any }> {
    return this.http.post<{ message: string; user: any }>(`${this.baseUrl}${environment.api.invitations}/accept`, request);
  }

  resendInvitation(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}${environment.api.invitations}/${id}/resend`, {});
  }

  revokeInvitation(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}${environment.api.invitations}/${id}`);
  }

  // ==========================================
  // BULK OPERATIONS
  // ==========================================

  getImportJobs(limit = 25): Observable<{ data: BulkImportJob[] }> {
    return this.http.get<{ data: BulkImportJob[] }>(`${this.baseUrl}${environment.api.bulk}/import/jobs?limit=${limit}`);
  }

  getImportTemplate(entityType: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}${environment.api.bulk}/import/template/${entityType}`, { responseType: 'blob' });
  }

  importData(entityType: string, file: File): Observable<{ jobId: string; status: string; totalRows: number; successCount: number; failedCount: number; errors?: any[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<any>(`${this.baseUrl}${environment.api.bulk}/import/${entityType}`, formData, {
      headers: {} // Don't set Content-Type, let browser set it with boundary
    });
  }

  getExportJobs(limit = 25): Observable<{ data: BulkExportJob[] }> {
    return this.http.get<{ data: BulkExportJob[] }>(`${this.baseUrl}${environment.api.bulk}/export/jobs?limit=${limit}`);
  }

  exportData(entityType: string, format = 'csv'): Observable<Blob> {
    return this.http.post(`${this.baseUrl}${environment.api.bulk}/export/${entityType}?format=${format}`, {}, { responseType: 'blob' });
  }

  // ==========================================
  // CUSTOM REPORT BUILDER
  // ==========================================

  getReportDataSources(): Observable<{ sources: ReportDataSource[] }> {
    return this.http.get<{ sources: ReportDataSource[] }>(`${this.baseUrl}${environment.api.reportBuilder}/sources`);
  }

  getSavedReports(): Observable<{ data: CustomReport[] }> {
    return this.http.get<{ data: CustomReport[] }>(`${this.baseUrl}${environment.api.reportBuilder}/saved`);
  }

  saveReport(report: Partial<CustomReport>): Observable<{ message: string; report: CustomReport }> {
    return this.http.post<{ message: string; report: CustomReport }>(`${this.baseUrl}${environment.api.reportBuilder}/save`, report);
  }

  updateReport(id: string, report: Partial<CustomReport>): Observable<{ message: string; report: CustomReport }> {
    return this.http.put<{ message: string; report: CustomReport }>(`${this.baseUrl}${environment.api.reportBuilder}/${id}`, report);
  }

  deleteReport(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}${environment.api.reportBuilder}/${id}`);
  }

  runReport(request: { dataSource: string; columns?: string[]; filters?: Record<string, string>; limit?: number }): Observable<{ data: any[]; meta: { totalRecords: number } }> {
    return this.http.post<{ data: any[]; meta: { totalRecords: number } }>(`${this.baseUrl}${environment.api.reportBuilder}/run`, request);
  }

  exportReport(request: { dataSource: string; columns?: string[]; filters?: Record<string, string> }): Observable<Blob> {
    return this.http.post(`${this.baseUrl}${environment.api.reportBuilder}/export`, request, { responseType: 'blob' });
  }

  // ==========================================
  // PUSH NOTIFICATIONS
  // ==========================================

  getVapidKey(): Observable<{ publicKey: string }> {
    return this.http.get<{ publicKey: string }>(`${this.baseUrl}${environment.api.push}/vapid-key`);
  }

  subscribeToPush(subscription: { platform: string; token: string; p256dhKey?: string; authSecret?: string; deviceName?: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}${environment.api.push}/subscribe`, subscription);
  }

  unsubscribeFromPush(token: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}${environment.api.push}/unsubscribe`, { token });
  }

  getPushSubscriptions(): Observable<{ data: PushSubscription[] }> {
    return this.http.get<{ data: PushSubscription[] }>(`${this.baseUrl}${environment.api.push}/subscriptions`);
  }

  sendPushNotification(userId: string, title: string, body: string, type?: string, data?: Record<string, string>): Observable<{ message: string; sent: number }> {
    return this.http.post<{ message: string; sent: number }>(`${this.baseUrl}${environment.api.push}/send`, { userId, title, body, type, data });
  }

  broadcastPush(title: string, body: string, type?: string, role?: string): Observable<{ message: string; sent: number }> {
    return this.http.post<{ message: string; sent: number }>(`${this.baseUrl}${environment.api.push}/broadcast`, { title, body, type, role });
  }

  getNotificationHistory(limit = 50): Observable<{ data: NotificationLog[] }> {
    return this.http.get<{ data: NotificationLog[] }>(`${this.baseUrl}${environment.api.push}/history?limit=${limit}`);
  }

  markNotificationAsRead(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}${environment.api.push}/${id}/read`, {});
  }

  // ==========================================
  // INTEGRATIONS
  // ==========================================

  getAllIntegrations(): Observable<AllIntegrations> {
    return this.http.get<AllIntegrations>(`${this.baseUrl}${environment.api.integrations}/all`);
  }

  getQuickBooksStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.integrations}/quickbooks/status`);
  }

  getEldStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.integrations}/eld/status`);
  }

  getEldLocations(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.integrations}/eld/locations`);
  }

  getLoadBoardStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.integrations}/loadboards/status`);
  }

  searchLoadBoards(request: { originCity: string; originState: string; destinationCity: string; destinationState: string; equipmentType?: string; pickupDate?: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}${environment.api.integrations}/loadboards/search`, request);
  }

  getFuelCardStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.integrations}/fuelcards/status`);
  }

  getMappingStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.integrations}/mapping/status`);
  }
}
