import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface OAuthToken {
  clientId: string;
  displayText: string;
  scopes: string[];
  nativeApp: boolean;
}

interface AppSpecificPassword {
  codeId: number;
  name: string;
  creationTime: number;
  lastTimeUsed: number;
}

interface UserSecurity {
  tokens: OAuthToken[];
  asps: AppSpecificPassword[];
  backupCodes: string[];
}

interface GoogleUser {
  id: string;
  email: string;
  fullName: string;
  givenName: string;
  familyName: string;
  orgUnitPath: string;
  recoveryEmail: string | null;
  recoveryPhone: string | null;
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
  private authService = inject(AuthService);
  private apiUrl = environment.apiUrl;

  readonly isProductOwner = this.authService.getEffectiveRoles().includes('product_owner');

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
      next: (res) => {
        const list: GoogleUser[] = res?.data || [];
        this.users.set(list);
        this.loading.set(false);
        // Keep the open register in sync with refreshed data
        const open = this.registerUser();
        if (open) this.registerUser.set(list.find(u => u.id === open.id) || null);
      },
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
        this.closeManage();
        this.loadUsers();
      },
      error: (err) => {
        this.actionBusyId.set(null);
        this.toast.error(err?.error?.error || `Failed to ${label.toLowerCase()} ${user.email}`, 'Google');
      }
    });
  }

  // ----- Account register drawer -----
  registerUser = signal<GoogleUser | null>(null);
  security = signal<UserSecurity | null>(null);
  securityLoading = signal(false);
  securityError = signal<string | null>(null);
  securityBusy = signal(false);
  showBackupCodes = signal(false);

  openRegister(user: GoogleUser) {
    this.registerUser.set(user);
    this.showBackupCodes.set(false);
    if (!user.deleted) this.loadSecurity(user);
    else { this.security.set(null); this.securityError.set(null); }
  }

  closeRegister() {
    this.registerUser.set(null);
    this.security.set(null);
    this.securityError.set(null);
  }

  manageFromRegister() {
    const user = this.registerUser();
    if (user) this.openManage(user);
  }

  adminConsoleLinks(user: GoogleUser) {
    return [
      { label: 'User in Admin Console', icon: 'bx bx-user-circle', url: `https://admin.google.com/ac/users/${user.id}` },
      { label: 'Groups', icon: 'bx bx-group', url: 'https://admin.google.com/ac/groups' },
      { label: 'Licenses & Billing', icon: 'bx bx-badge-check', url: 'https://admin.google.com/ac/billing' },
      { label: 'Login Audit (Reports)', icon: 'bx bx-history', url: 'https://admin.google.com/ac/reporting/audit/user' },
      { label: 'Data Transfer', icon: 'bx bx-transfer', url: 'https://admin.google.com/ac/datatransfer' }
    ];
  }

  loadSecurity(user: GoogleUser) {
    this.securityLoading.set(true);
    this.securityError.set(null);
    this.http.get<any>(`${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/security`).subscribe({
      next: (res) => { this.security.set(res?.data || null); this.securityLoading.set(false); },
      error: (err) => {
        this.security.set(null);
        this.securityLoading.set(false);
        this.securityError.set(err?.error?.error || 'Failed to load security details');
      }
    });
  }

  revokeToken(token: OAuthToken) {
    const user = this.registerUser();
    if (!user) return;
    if (!confirm(`Revoke access for "${token.displayText || token.clientId}"?\nThe app will lose access to ${user.email}.`)) return;

    this.securityBusy.set(true);
    this.http.delete(
      `${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/tokens/${encodeURIComponent(token.clientId)}`,
      { params: { email: user.email } }
    ).subscribe({
      next: () => {
        this.securityBusy.set(false);
        this.toast.champagne(`Access revoked — ${token.displayText || token.clientId}`, 'Google');
        this.loadSecurity(user);
      },
      error: (err) => {
        this.securityBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to revoke token', 'Google');
      }
    });
  }

  deleteAsp(asp: AppSpecificPassword) {
    const user = this.registerUser();
    if (!user) return;
    if (!confirm(`Delete app-specific password "${asp.name}" for ${user.email}?`)) return;

    this.securityBusy.set(true);
    this.http.delete(
      `${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/asps/${asp.codeId}`,
      { params: { email: user.email } }
    ).subscribe({
      next: () => {
        this.securityBusy.set(false);
        this.toast.champagne(`App password deleted — ${asp.name}`, 'Google');
        this.loadSecurity(user);
      },
      error: (err) => {
        this.securityBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to delete app password', 'Google');
      }
    });
  }

  generateBackupCodes() {
    const user = this.registerUser();
    if (!user) return;
    if (!confirm(`Generate new 2SV backup codes for ${user.email}? Existing codes will be replaced.`)) return;

    this.securityBusy.set(true);
    this.http.post(
      `${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/backup-codes/generate`,
      null, { params: { email: user.email } }
    ).subscribe({
      next: () => {
        this.securityBusy.set(false);
        this.showBackupCodes.set(true);
        this.toast.champagne(`Backup codes generated — ${user.email}`, 'Google');
        this.loadSecurity(user);
      },
      error: (err) => {
        this.securityBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to generate backup codes', 'Google');
      }
    });
  }

  invalidateBackupCodes() {
    const user = this.registerUser();
    if (!user) return;
    if (!confirm(`Invalidate all 2SV backup codes for ${user.email}? They can no longer be used to sign in.`)) return;

    this.securityBusy.set(true);
    this.http.post(
      `${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/backup-codes/invalidate`,
      null, { params: { email: user.email } }
    ).subscribe({
      next: () => {
        this.securityBusy.set(false);
        this.showBackupCodes.set(false);
        this.toast.champagne(`Backup codes invalidated — ${user.email}`, 'Google');
        this.loadSecurity(user);
      },
      error: (err) => {
        this.securityBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to invalidate backup codes', 'Google');
      }
    });
  }

  // ----- Manage modal -----
  showManageModal = signal(false);
  manageUser = signal<GoogleUser | null>(null);
  savingProfile = signal(false);
  resettingPassword = signal(false);
  aliasBusy = signal(false);

  profileForm = { givenName: '', familyName: '', orgUnitPath: '', recoveryEmail: '', recoveryPhone: '', primaryEmail: '' };
  passwordForm = { password: '', changeAtNextLogin: true };
  newAlias = '';

  openManage(user: GoogleUser) {
    this.manageUser.set(user);
    this.profileForm = {
      givenName: user.givenName || '',
      familyName: user.familyName || '',
      orgUnitPath: user.orgUnitPath || '/',
      recoveryEmail: user.recoveryEmail || '',
      recoveryPhone: user.recoveryPhone || '',
      primaryEmail: user.email
    };
    this.passwordForm = { password: '', changeAtNextLogin: true };
    this.newAlias = '';
    this.showManageModal.set(true);
  }

  closeManage() {
    this.showManageModal.set(false);
    this.manageUser.set(null);
  }

  saveProfile() {
    const user = this.manageUser();
    if (!user) return;

    const f = this.profileForm;
    const payload: any = { email: user.email };
    if (f.givenName !== (user.givenName || '')) payload.givenName = f.givenName;
    if (f.familyName !== (user.familyName || '')) payload.familyName = f.familyName;
    if (f.orgUnitPath !== (user.orgUnitPath || '/')) payload.orgUnitPath = f.orgUnitPath;
    if (f.recoveryEmail !== (user.recoveryEmail || '')) payload.recoveryEmail = f.recoveryEmail;
    if (f.recoveryPhone !== (user.recoveryPhone || '')) payload.recoveryPhone = f.recoveryPhone;
    if (f.primaryEmail.trim() && f.primaryEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      if (!confirm(`Rename ${user.email} to ${f.primaryEmail.trim()}? The old address becomes an alias.`)) return;
      payload.primaryEmail = f.primaryEmail.trim();
    }

    const fields = Object.keys(payload).filter(k => k !== 'email');
    if (fields.length === 0) { this.toast.error('No changes to save', 'Google'); return; }

    this.savingProfile.set(true);
    this.http.patch(`${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}`, payload).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.toast.champagne(`Profile updated — ${user.email}`, 'Google');
        this.closeManage();
        this.loadUsers();
      },
      error: (err) => {
        this.savingProfile.set(false);
        this.toast.error(err?.error?.error || 'Failed to update profile', 'Google');
      }
    });
  }

  resetPassword() {
    const user = this.manageUser();
    if (!user) return;
    if (!this.passwordForm.password || this.passwordForm.password.length < 8) {
      this.toast.error('Password must be at least 8 characters', 'Google');
      return;
    }
    if (!confirm(`Reset password for ${user.email}?`)) return;

    this.resettingPassword.set(true);
    this.http.patch(`${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}`, {
      email: user.email,
      password: this.passwordForm.password,
      changePasswordAtNextLogin: this.passwordForm.changeAtNextLogin
    }).subscribe({
      next: () => {
        this.resettingPassword.set(false);
        this.passwordForm.password = '';
        this.toast.champagne(`Password reset — ${user.email}`, 'Google');
      },
      error: (err) => {
        this.resettingPassword.set(false);
        this.toast.error(err?.error?.error || 'Failed to reset password', 'Google');
      }
    });
  }

  generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const bytes = new Uint32Array(16);
    crypto.getRandomValues(bytes);
    this.passwordForm.password = Array.from(bytes, b => chars[b % chars.length]).join('');
  }

  addAlias() {
    const user = this.manageUser();
    const alias = this.newAlias.trim();
    if (!user || !alias) return;
    if (!alias.includes('@')) { this.toast.error('Enter a full alias email address', 'Google'); return; }

    this.aliasBusy.set(true);
    this.http.post(`${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/aliases`, {
      alias, email: user.email
    }).subscribe({
      next: () => {
        this.aliasBusy.set(false);
        this.newAlias = '';
        user.aliases = [...(user.aliases || []), alias];
        this.toast.champagne(`Alias added — ${alias}`, 'Google');
      },
      error: (err) => {
        this.aliasBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to add alias', 'Google');
      }
    });
  }

  removeAlias(alias: string) {
    const user = this.manageUser();
    if (!user) return;
    if (!confirm(`Remove alias ${alias}?`)) return;

    this.aliasBusy.set(true);
    this.http.delete(
      `${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/aliases/${encodeURIComponent(alias)}`,
      { params: { email: user.email } }
    ).subscribe({
      next: () => {
        this.aliasBusy.set(false);
        user.aliases = (user.aliases || []).filter(a => a !== alias);
        this.toast.champagne(`Alias removed — ${alias}`, 'Google');
      },
      error: (err) => {
        this.aliasBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to remove alias', 'Google');
      }
    });
  }

  toggleAdmin() {
    const user = this.manageUser();
    if (!user) return;
    if (user.isAdmin) {
      this.runAction(user, 'revokeadmin', 'Revoke super admin from');
    } else {
      this.runAction(user, 'makeadmin', 'Grant SUPER ADMIN to');
    }
  }
}
