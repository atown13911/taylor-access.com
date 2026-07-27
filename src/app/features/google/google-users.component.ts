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

  filteredUsers = computed(() => {
    let list = this.users();
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    if (search) {
      list = list.filter(u =>
        u.email?.toLowerCase().includes(search) ||
        u.fullName?.toLowerCase().includes(search) ||
        u.orgUnitPath?.toLowerCase().includes(search) ||
        u.aliases?.some(a => a.toLowerCase().includes(search))
      );
    }
    if (status === 'active') list = list.filter(u => !u.suspended && !u.archived);
    else if (status === 'suspended') list = list.filter(u => u.suspended);
    else if (status === 'archived') list = list.filter(u => u.archived);
    else if (status === 'admins') list = list.filter(u => u.isAdmin || u.isDelegatedAdmin);
    else if (status === 'no2sv') list = list.filter(u => !u.isEnrolledIn2Sv && !u.suspended && !u.archived);
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
    if (user.archived) return 'archived';
    if (user.suspended) return 'suspended';
    return 'active';
  }
}
