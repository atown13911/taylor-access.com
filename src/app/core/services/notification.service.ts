import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface AppNotification {
  id: string;
  type: 'shipment' | 'driver' | 'compliance' | 'financial' | 'edi' | 'system';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  actionUrl?: string;
  actionLabel?: string;
  relatedEntity?: {
    type: string;
    id: string;
    name: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  notifications = signal<AppNotification[]>([]);
  
  unreadCount = computed(() => 
    this.notifications().filter(n => !n.isRead).length
  );

  criticalCount = computed(() =>
    this.notifications().filter(n => n.priority === 'critical' && !n.isRead).length
  );

  highPriorityCount = computed(() =>
    this.notifications().filter(n => n.priority === 'high' && !n.isRead).length
  );

  constructor() {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.http.get<{ data: AppNotification[] }>(`${this.baseUrl}/api/v1/notifications`).subscribe({
      next: (res) => {
        this.notifications.set(res?.data || []);
      },
      error: () => {
        // Load some default/mock notifications on error (for development)
        this.notifications.set([
          {
            id: '1', type: 'shipment', priority: 'high',
            title: 'Shipment Delayed',
            message: 'TSS-20240206-0001 is running 2 hours behind schedule due to traffic.',
            timestamp: new Date().toISOString(), isRead: false
          },
          {
            id: '2', type: 'compliance', priority: 'critical',
            title: 'License Expiring',
            message: 'Driver John D. license expires in 5 days.',
            timestamp: new Date().toISOString(), isRead: false
          },
          {
            id: '3', type: 'financial', priority: 'medium',
            title: 'Payment Received',
            message: 'Invoice INV-2024-0042 paid - $3,500.00',
            timestamp: new Date().toISOString(), isRead: true
          }
        ]);
      }
    });
  }

  markAsRead(notificationId: string): void {
    this.notifications.update(notifs =>
      notifs.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );

    // Also call API to persist
    this.http.put(`${this.baseUrl}/api/v1/notifications/${notificationId}/read`, {}).subscribe();
  }

  markAllAsRead(): void {
    this.notifications.update(notifs =>
      notifs.map(n => ({ ...n, isRead: true }))
    );

    // Also call API to persist
    this.http.put(`${this.baseUrl}/api/v1/notifications/mark-all-read`, {}).subscribe();
  }

  deleteNotification(notificationId: string): void {
    this.notifications.update(notifs =>
      notifs.filter(n => n.id !== notificationId)
    );

    this.http.delete(`${this.baseUrl}/api/v1/notifications/${notificationId}`).subscribe();
  }

  clearAll(): void {
    this.notifications.set([]);
    this.http.delete(`${this.baseUrl}/api/v1/notifications`).subscribe();
  }

  refresh(): void {
    this.loadNotifications();
  }
}
