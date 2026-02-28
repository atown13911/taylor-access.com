import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { NotificationService, AppNotification } from '../../../core/services/notification.service';

type NotificationType = 'shipment' | 'driver' | 'compliance' | 'financial' | 'system' | 'edi';
type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

// Use the shared AppNotification type
type Notification = AppNotification;

interface NotificationPreference {
  type: NotificationType;
  label: string;
  icon: string;
  email: boolean;
  push: boolean;
  sms: boolean;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss']
})
export class NotificationsComponent {
  private toast = inject(ToastService);
  private notificationService = inject(NotificationService);
  
  selectedTab = signal<'all' | 'unread' | 'settings'>('all');
  selectedType = signal<NotificationType | 'all'>('all');
  searchQuery = signal('');

  // Use the shared notification service
  notifications = this.notificationService.notifications;

  preferences: NotificationPreference[] = [
    { type: 'shipment', label: 'Shipment Updates', icon: 'bx-package', email: true, push: true, sms: false },
    { type: 'driver', label: 'Driver Alerts', icon: 'bx-id-card', email: true, push: true, sms: true },
    { type: 'compliance', label: 'Compliance Warnings', icon: 'bx-check-shield', email: true, push: true, sms: true },
    { type: 'financial', label: 'Financial Updates', icon: 'bx-dollar-circle', email: true, push: false, sms: false },
    { type: 'edi', label: 'EDI Transactions', icon: 'bx-transfer', email: true, push: true, sms: false },
    { type: 'system', label: 'System Notifications', icon: 'bx-cog', email: false, push: true, sms: false }
  ];

  stats = computed(() => {
    const notifs = this.notifications();
    return {
      total: notifs.length,
      unread: notifs.filter(n => !n.isRead).length,
      critical: notifs.filter(n => n.priority === 'critical' && !n.isRead).length,
      high: notifs.filter(n => n.priority === 'high' && !n.isRead).length
    };
  });

  filteredNotifications = computed(() => {
    let filtered = this.notifications();
    const tab = this.selectedTab();
    const type = this.selectedType();
    const query = this.searchQuery().toLowerCase();

    if (tab === 'unread') {
      filtered = filtered.filter(n => !n.isRead);
    }

    if (type !== 'all') {
      filtered = filtered.filter(n => n.type === type);
    }

    if (query) {
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.message.toLowerCase().includes(query)
      );
    }

    return filtered;
  });

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getTypeIcon(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      'shipment': 'bx-package',
      'driver': 'bx-id-card',
      'compliance': 'bx-check-shield',
      'financial': 'bx-dollar-circle',
      'edi': 'bx-transfer',
      'system': 'bx-cog'
    };
    return icons[type];
  }

  getPriorityClass(priority: NotificationPriority): string {
    return priority;
  }

  markAsRead(notification: Notification): void {
    this.notificationService.markAsRead(notification.id);
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
    this.toast.success('All notifications marked as read', 'Done');
  }

  deleteNotification(notification: Notification): void {
    this.notificationService.deleteNotification(notification.id);
  }

  clearAll(): void {
    if (confirm('Are you sure you want to clear all notifications?')) {
      this.notificationService.clearAll();
      this.toast.success('All notifications cleared', 'Done');
    }
  }

  refreshNotifications(): void {
    this.notificationService.refresh();
    this.toast.info('Notifications refreshed', 'Refreshed');
  }

  togglePreference(pref: NotificationPreference, channel: 'email' | 'push' | 'sms'): void {
    pref[channel] = !pref[channel];
  }

  savePreferences(): void {
    this.toast.success('Notification preferences saved', 'Preferences Saved');
  }
}



