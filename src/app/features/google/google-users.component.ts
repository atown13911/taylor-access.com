import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../core/services/toast.service';
import { environment } from '../../../environments/environment';

interface GoogleUser {
  id: string;
  email: string;
  fullName: string;
  orgUnitPath: string;
  isAdmin: boolean;
  isDelegatedAdmin: boolean;
  suspended: boolean;
  archived: boolean;
  deleted: boolean;
  deletionTime: string | null;
  suspensionReason: string | null;
  isEnrolledIn2Sv: boolean;
  lastLoginTime: string | null;
  creationTime: string | null;
  thumbnailPhotoUrl: string | null;
  aliases: string[];
}

@Component({
  selector: 'app-google-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './google-users.component.html',
  styleUrls: ['./google-users.component.scss']
})
export class GoogleUsersComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private apiUrl = environment.apiUrl;

  loading = signal(false);
  loadError = signal<string | null>(null);
  users = signal<GoogleUser[]>([]);
  searchTerm = signal('');
  statusFilter = signal('all');
  extraFilter = signal('all');
  actionBusyId = signal<string | null>(null);

  readonly statusTabs = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'archived', label: 'Archived' },
    { key: 'deleted', label: 'Deleted' }
  ];

  tabCounts = computed(() => {
    const counts: Record<string, number> = { all: 0, active: 0, suspended: 0, archived: 0, deleted: 0 };
    for (const u of this.users()) {
      counts['all']++;
      counts[this.getStatus(u)]++;
    }
    return counts;
  });

  filteredUsers = computed(() => {
    let list = this.users();
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    const extra = this.extraFilter();
    if (search) {
      list = list.filter(u =>
        u.email?.toLowerCase().includes(search) ||
        u.fullName?.toLowerCase().includes(search) ||
        u.orgUnitPath?.toLowerCase().includes(search) ||
        u.aliases?.some(a => a.toLowerCase().includes(search))
      );
    }
    if (status !== 'all') list = list.filter(u => this.getStatus(u) === status);
    if (extra === 'admins') list = list.filter(u => u.isAdmin || u.isDelegatedAdmin);
    else if (extra === 'no2sv') list = list.filter(u => !u.isEnrolledIn2Sv && this.getStatus(u) === 'active');
    return list;
  });

  stats = computed(() => {
    const all = this.users();
    return {
      total: all.length,
      active: all.filter(u => !u.suspended && !u.archived).length,
      suspended: all.filter(u => u.suspended).length,
      admins: all.filter(u => u.isAdmin || u.isDelegatedAdmin).length,
      enrolled2sv: all.filter(u => u.isEnrolledIn2Sv).length
    };
  });

  ngOnInit() { this.loadUsers(); }

  loadUsers() {
    this.loading.set(true);
    this.loadError.set(null);
    this.http.get<any>(`${this.apiUrl}/api/v1/google/workspace-users`).subscribe({
      next: (res) => { this.users.set(res?.data || []); this.loading.set(false); },
      error: (err) => {
        this.users.set([]);
        this.loading.set(false);
        const message = err?.error?.error || 'Failed to load Google Workspace users';
        this.loadError.set(message);
        this.toast.error(message, 'Google');
      }
    });
  }

  getStatus(user: GoogleUser): string {
    if (user.deleted) return 'deleted';
    if (user.archived) return 'archived';
    if (user.suspended) return 'suspended';
    return 'active';
  }

  getStatusTooltip(user: GoogleUser): string {
    if (user.deleted) {
      const when = user.deletionTime ? new Date(user.deletionTime).toLocaleDateString() : '';
      return `Deleted${when ? ' ' + when : ''} — recoverable for ~20 days`;
    }
    if (user.suspended && user.suspensionReason) return `Suspension reason: ${user.suspensionReason}`;
    return '';
  }

  runAction(user: GoogleUser, action: string, label: string) {
    if (!confirm(`${label} ${user.email}?`)) return;
    this.actionBusyId.set(user.id);
    this.http.post(`${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/actions`, {
      action,
      email: user.email,
      orgUnitPath: user.orgUnitPath || '/'
    }).subscribe({
      next: () => {
        this.actionBusyId.set(null);
        this.toast.champagne(`${label} — ${user.email}`, 'Google');
        this.loadUsers();
      },
      error: (err) => {
        this.actionBusyId.set(null);
        this.toast.error(err?.error?.error || `Failed to ${label.toLowerCase()} ${user.email}`, 'Google');
      }
    });
  }
}
