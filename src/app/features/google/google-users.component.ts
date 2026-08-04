import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
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

interface TokenActivity {
  clientId: string;
  appName: string;
  lastActivityTime: string | null;
  lastEvent: string;
}

interface RoleAssignment {
  roleAssignmentId: string;
  roleId: string;
  roleName: string;
  roleDescription: string;
  isSuperAdminRole: boolean;
  isSystemRole: boolean;
  scopeType: string;
  orgUnitId: string | null;
}

interface GroupInfo {
  id: string;
  name: string;
  email: string;
  description: string;
  directMembersCount: number;
  adminCreated?: boolean;
  aliases?: string[];
}

interface GroupMemberInfo {
  id: string;
  email: string;
  role: string;    // OWNER | MANAGER | MEMBER
  type: string;    // USER | GROUP | CUSTOMER
  status: string;  // ACTIVE | SUSPENDED | ...
}

interface LicenseInfo {
  productId: string;
  productName: string;
  skuId: string;
  skuName: string;
}

interface LoginEvent {
  time: string | null;
  name: string;
  ipAddress: string | null;
}

interface TransferApp {
  id: number;
  name: string;
}

interface TransferInfo {
  id: string;
  targetEmail: string;
  targetUserId: string;
  applications: string;
  status: string;
  requestedBy: string | null;
  time: string;
}

interface UserStorage {
  email: string;
  usedMb: number;
  driveMb: number;
  gmailMb: number;
  photosMb: number;
  usedPercent: number;
}

interface DriveBackupRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  trigger: string;
  usersProcessed: number;
  filesBackedUp: number;
  filesSkipped: number;
  filesFailed: number;
  bytesUploaded: number;
  error: string | null;
}

interface BackupProgress {
  currentUser: string | null;
  usersProcessed: number;
  usersTotal: number;
  itemsBackedUp: number;
  itemsSkipped: number;
  itemsFailed: number;
  currentUserItems: number;
}

interface DriveBackupStatus {
  running: boolean;
  progress: BackupProgress | null;
  runs: DriveBackupRun[];
  perUser: { email: string; files: number; bytes: number; lastBackedUpAt: string }[];
  failedFiles: number;
}

interface GmailBackupRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  trigger: string;
  usersProcessed: number;
  messagesBackedUp: number;
  messagesSkipped: number;
  messagesFailed: number;
  bytesUploaded: number;
  error: string | null;
}

interface GmailBackupStatus {
  running: boolean;
  progress: BackupProgress | null;
  runs: GmailBackupRun[];
  perUser: { email: string; messages: number; bytes: number; lastBackedUpAt: string }[];
  failedMessages: number;
}

interface GoogleAccountTotal {
  email: string;
  driveFiles: number | null;
  gmailMessages: number | null;
  error: string | null;
  fetchedAt: string;
}

interface AccountTotalsStatus {
  running: boolean;
  progress: BackupProgress | null;
  data: GoogleAccountTotal[];
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
export class GoogleUsersComponent implements OnInit, OnDestroy {
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

  // ----- Page tabs -----
  pageTab = signal<'domain' | 'storage' | 'restricted' | 'groups'>('domain');

  setPageTab(tab: 'domain' | 'storage' | 'restricted' | 'groups') {
    this.pageTab.set(tab);
    if (tab === 'storage' && !this.storageLoaded) this.loadStorage();
    if ((tab === 'storage' || tab === 'restricted') && this.isProductOwner) {
      this.loadBackupStatus();
      this.loadGmailBackupStatus();
      if (tab === 'storage') this.loadAccountTotals();
    }
    // Storage rows resolve names/last-login from restricted users too.
    if (tab === 'storage' && this.isProductOwner && !this.restrictedLoaded) this.loadRestricted();
    if (tab === 'restricted' && !this.restrictedLoaded) this.loadRestricted();
    if (tab === 'groups' && !this.groupsLoaded) this.loadDomainGroups();
  }

  // ----- Groups tab -----
  private groupsLoaded = false;
  groupsLoading = signal(false);
  groupsError = signal<string | null>(null);
  domainGroups = signal<GroupInfo[]>([]);
  groupSearch = signal('');

  loadDomainGroups() {
    this.groupsLoaded = true;
    this.groupsLoading.set(true);
    this.groupsError.set(null);
    this.http.get<any>(`${this.apiUrl}/api/v1/google/groups`).subscribe({
      next: (res) => {
        this.domainGroups.set(res?.data || []);
        this.groupsLoading.set(false);
      },
      error: (err) => {
        this.domainGroups.set([]);
        this.groupsLoading.set(false);
        this.groupsError.set(err?.error?.error || 'Failed to load Google groups');
      }
    });
  }

  filteredGroups = computed(() => {
    const search = this.groupSearch().toLowerCase();
    let list = this.domainGroups();
    if (search) {
      list = list.filter(g =>
        g.name?.toLowerCase().includes(search) ||
        g.email?.toLowerCase().includes(search) ||
        g.description?.toLowerCase().includes(search) ||
        g.aliases?.some(a => a.toLowerCase().includes(search))
      );
    }
    return list;
  });

  groupStats = computed(() => {
    const all = this.domainGroups();
    return {
      total: all.length,
      members: all.reduce((sum, g) => sum + (g.directMembersCount || 0), 0),
      adminCreated: all.filter(g => g.adminCreated).length,
      empty: all.filter(g => !g.directMembersCount).length
    };
  });

  // ----- Group members modal -----
  membersGroup = signal<GroupInfo | null>(null);
  groupMembers = signal<GroupMemberInfo[]>([]);
  groupMembersLoading = signal(false);
  groupMembersError = signal<string | null>(null);

  openGroupMembers(group: GroupInfo) {
    this.membersGroup.set(group);
    this.groupMembers.set([]);
    this.groupMembersError.set(null);
    this.groupMembersLoading.set(true);
    this.http.get<any>(`${this.apiUrl}/api/v1/google/groups/${encodeURIComponent(group.id)}/members`).subscribe({
      next: (res) => {
        this.groupMembers.set(res?.data || []);
        this.groupMembersLoading.set(false);
      },
      error: (err) => {
        this.groupMembersLoading.set(false);
        this.groupMembersError.set(err?.error?.error || 'Failed to load group members');
      }
    });
  }

  closeGroupMembers() {
    this.membersGroup.set(null);
  }

  memberName(member: GroupMemberInfo): string {
    if (member.type === 'GROUP') {
      return this.domainGroups().find(g => g.email.toLowerCase() === member.email.toLowerCase())?.name || member.email;
    }
    return this.userByEmail().get(member.email.toLowerCase())?.fullName || member.email;
  }

  memberPhoto(member: GroupMemberInfo): string | null {
    if (member.type !== 'USER') return null;
    return this.userByEmail().get(member.email.toLowerCase())?.thumbnailPhotoUrl || null;
  }

  // ----- Restricted access tab (product owner only) -----
  private restrictedLoaded = false;
  restrictedLoading = signal(false);
  restrictedError = signal<string | null>(null);
  restrictedUsers = signal<GoogleUser[]>([]);

  loadRestricted() {
    this.restrictedLoaded = true;
    this.restrictedLoading.set(true);
    this.restrictedError.set(null);
    this.http.get<any>(`${this.apiUrl}/api/v1/google/workspace-users/restricted`).subscribe({
      next: (res) => {
        this.restrictedUsers.set(res?.data || []);
        this.restrictedLoading.set(false);
        this.syncRegisterUser();
      },
      error: (err) => {
        this.restrictedUsers.set([]);
        this.restrictedLoading.set(false);
        this.restrictedError.set(err?.error?.error || 'Failed to load restricted accounts');
      }
    });
  }

  /** The user list backing the current Domain-style view. */
  sourceUsers = computed(() =>
    this.pageTab() === 'restricted' ? this.restrictedUsers() : this.users());

  viewLoading = computed(() => {
    if (this.pageTab() === 'restricted') return this.restrictedLoading();
    if (this.pageTab() === 'groups') return this.groupsLoading();
    return this.loading();
  });

  viewError = computed(() => {
    if (this.pageTab() === 'restricted') return this.restrictedError();
    if (this.pageTab() === 'groups') return this.groupsError();
    return this.loadError();
  });

  refreshCurrentTab() {
    if (this.pageTab() === 'restricted') this.loadRestricted();
    else if (this.pageTab() === 'groups') this.loadDomainGroups();
    else this.loadUsers();
  }

  private syncRegisterUser() {
    const open = this.registerUser();
    if (!open) return;
    const merged = [...this.users(), ...this.restrictedUsers()];
    this.registerUser.set(merged.find(u => u.id === open.id) || null);
  }

  // ----- Data storage tab -----
  private storageLoaded = false;
  storageLoading = signal(false);
  storageError = signal<string | null>(null);
  storage = signal<UserStorage[]>([]);
  storageReportDate = signal<string | null>(null);
  storageSearch = signal('');

  filteredStorage = computed(() => {
    const search = this.storageSearch().toLowerCase();
    let list = this.storage();
    if (search) {
      list = list.filter(s => {
        const user = this.userByEmail().get(s.email.toLowerCase());
        return s.email.toLowerCase().includes(search) ||
          (user?.fullName || '').toLowerCase().includes(search);
      });
    }
    return [...list].sort((a, b) => b.usedMb - a.usedMb);
  });

  storageTotals = computed(() => {
    const list = this.storage();
    return {
      used: list.reduce((sum, s) => sum + s.usedMb, 0),
      drive: list.reduce((sum, s) => sum + s.driveMb, 0),
      gmail: list.reduce((sum, s) => sum + s.gmailMb, 0),
      photos: list.reduce((sum, s) => sum + s.photosMb, 0)
    };
  });

  userByEmail = computed(() => {
    const map = new Map<string, GoogleUser>();
    for (const u of this.users()) map.set(u.email.toLowerCase(), u);
    for (const u of this.restrictedUsers()) map.set(u.email.toLowerCase(), u);
    return map;
  });

  loadStorage() {
    this.storageLoaded = true;
    this.storageLoading.set(true);
    this.storageError.set(null);
    this.http.get<any>(`${this.apiUrl}/api/v1/google/storage-usage`).subscribe({
      next: (res) => {
        this.storage.set(res?.data || []);
        this.storageReportDate.set(res?.reportDate || null);
        this.storageLoading.set(false);
      },
      error: (err) => {
        this.storageLoading.set(false);
        this.storageError.set(err?.error?.error || 'Failed to load storage usage');
      }
    });
  }

  refreshStorage() {
    this.loadStorage();
    if (this.isProductOwner) {
      this.loadBackupStatus();
      this.loadGmailBackupStatus();
      this.loadAccountTotals();
    }
  }

  // ----- Drive-to-bucket backup (product owner only) -----
  backupStatus = signal<DriveBackupStatus | null>(null);
  backupBusy = signal(false);

  loadBackupStatus() {
    this.http.get<DriveBackupStatus>(`${this.apiUrl}/api/v1/google/drive-backup/status`).subscribe({
      next: (res) => this.backupStatus.set(res),
      error: () => this.backupStatus.set(null)
    });
  }

  runBackup() {
    if (!confirm('Back up every user\'s Drive files to the storage bucket now? The first pass can take several hours.')) return;
    this.backupBusy.set(true);
    this.http.post<any>(`${this.apiUrl}/api/v1/google/drive-backup/run`, {}).subscribe({
      next: (res) => {
        this.backupBusy.set(false);
        if (res?.started) {
          this.toast.champagne('Drive backup started — files are being copied to the bucket', 'Google');
        } else {
          this.toast.info(res?.message || 'A backup run is already in progress', 'Google');
        }
        this.loadBackupStatus();
      },
      error: (err) => {
        this.backupBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to start backup', 'Google');
      }
    });
  }

  lastBackupRun = computed(() => this.backupStatus()?.runs?.[0] ?? null);

  backupTotals = computed(() => {
    const perUser = this.backupStatus()?.perUser ?? [];
    return {
      users: perUser.length,
      files: perUser.reduce((sum, u) => sum + u.files, 0),
      bytes: perUser.reduce((sum, u) => sum + u.bytes, 0)
    };
  });

  formatBytes(bytes: number): string {
    return this.formatMb(Math.round(bytes / (1024 * 1024)));
  }

  // ----- Gmail-to-bucket backup (product owner only) -----
  gmailBackupStatus = signal<GmailBackupStatus | null>(null);
  gmailBackupBusy = signal(false);

  loadGmailBackupStatus() {
    this.http.get<GmailBackupStatus>(`${this.apiUrl}/api/v1/google/gmail-backup/status`).subscribe({
      next: (res) => this.gmailBackupStatus.set(res),
      error: () => this.gmailBackupStatus.set(null)
    });
  }

  runGmailBackup() {
    if (!confirm('Back up every user\'s Gmail messages to the storage bucket now? The first pass covers ~11 TB of mail and will run for days, resuming automatically if interrupted.')) return;
    this.gmailBackupBusy.set(true);
    this.http.post<any>(`${this.apiUrl}/api/v1/google/gmail-backup/run`, {}).subscribe({
      next: (res) => {
        this.gmailBackupBusy.set(false);
        if (res?.started) {
          this.toast.champagne('Gmail backup started — messages are being copied to the bucket', 'Google');
        } else {
          this.toast.info(res?.message || 'A Gmail backup run is already in progress', 'Google');
        }
        this.loadGmailBackupStatus();
      },
      error: (err) => {
        this.gmailBackupBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to start Gmail backup', 'Google');
      }
    });
  }

  lastGmailBackupRun = computed(() => this.gmailBackupStatus()?.runs?.[0] ?? null);

  // ----- Per-user bucket totals (what each account already has backed up) -----
  private driveBackupByEmail = computed(() => {
    const map = new Map<string, { files: number; bytes: number }>();
    for (const u of this.backupStatus()?.perUser ?? []) map.set(u.email.toLowerCase(), u);
    return map;
  });

  private gmailBackupByEmail = computed(() => {
    const map = new Map<string, { messages: number; bytes: number }>();
    for (const u of this.gmailBackupStatus()?.perUser ?? []) map.set(u.email.toLowerCase(), u);
    return map;
  });

  driveBackupLabel(email: string): string | null {
    const info = this.driveBackupByEmail().get(email.toLowerCase());
    if (!info || info.files === 0) return null;
    return `${this.formatBytes(info.bytes)} · ${info.files.toLocaleString()} files`;
  }

  gmailBackupLabel(email: string): string | null {
    const info = this.gmailBackupByEmail().get(email.toLowerCase());
    if (!info || info.messages === 0) return null;
    return `${this.formatBytes(info.bytes)} · ${info.messages.toLocaleString()} msgs`;
  }

  // ----- What Google currently holds per account (product owner only) -----
  accountTotals = signal<AccountTotalsStatus | null>(null);
  accountTotalsBusy = signal(false);

  loadAccountTotals() {
    this.http.get<AccountTotalsStatus>(`${this.apiUrl}/api/v1/google/account-totals`).subscribe({
      next: (res) => this.accountTotals.set(res),
      error: () => this.accountTotals.set(null)
    });
  }

  refreshAccountTotals() {
    if (this.accountTotals()?.running) {
      this.toast.info('A Google recount is already in progress', 'Google');
      return;
    }
    this.accountTotalsBusy.set(true);
    this.http.post<any>(`${this.apiUrl}/api/v1/google/account-totals/refresh`, {}).subscribe({
      next: (res) => {
        this.accountTotalsBusy.set(false);
        if (res?.started) this.toast.champagne('Recounting Drive files and Gmail messages in Google', 'Google');
        else this.toast.info(res?.message || 'A recount is already in progress', 'Google');
        this.loadAccountTotals();
      },
      error: (err) => {
        this.accountTotalsBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to start recount', 'Google');
      }
    });
  }

  private accountTotalsByEmail = computed(() => {
    const map = new Map<string, GoogleAccountTotal>();
    for (const t of this.accountTotals()?.data ?? []) map.set(t.email.toLowerCase(), t);
    return map;
  });

  accountTotalsDate = computed(() => {
    const rows = this.accountTotals()?.data ?? [];
    if (rows.length === 0) return null;
    return rows.reduce((max, r) => r.fetchedAt > max ? r.fetchedAt : max, rows[0].fetchedAt);
  });

  driveGoogleLabel(email: string): string | null {
    const t = this.accountTotalsByEmail().get(email.toLowerCase());
    if (t?.driveFiles == null) return null;
    return `${t.driveFiles.toLocaleString()} files`;
  }

  gmailGoogleLabel(email: string): string | null {
    const t = this.accountTotalsByEmail().get(email.toLowerCase());
    if (t?.gmailMessages == null) return null;
    return `${t.gmailMessages.toLocaleString()} msgs`;
  }

  /** 'ok' when the bucket has at least as many items as Google, 'behind' when short, null when unknown. */
  driveCompareState(email: string): 'ok' | 'behind' | null {
    const total = this.accountTotalsByEmail().get(email.toLowerCase())?.driveFiles;
    if (total == null) return null;
    const backed = this.driveBackupByEmail().get(email.toLowerCase())?.files ?? 0;
    return backed >= total ? 'ok' : 'behind';
  }

  gmailCompareState(email: string): 'ok' | 'behind' | null {
    const total = this.accountTotalsByEmail().get(email.toLowerCase())?.gmailMessages;
    if (total == null) return null;
    const backed = this.gmailBackupByEmail().get(email.toLowerCase())?.messages ?? 0;
    return backed >= total ? 'ok' : 'behind';
  }

  // ----- Per-user backup (product owner only) -----
  /** Restricted-tab backup actions are limited to this account. */
  private static readonly RestrictedBackupEmail = 'dino.cehajic@taylor-corp.net';

  showRestrictedBackupActions(user: { email: string }): boolean {
    return this.isProductOwner
      && this.pageTab() === 'restricted'
      && user.email.toLowerCase() === GoogleUsersComponent.RestrictedBackupEmail;
  }

  /** "drive:email" / "gmail:email" while a start request is in flight. */
  userBackupBusy = signal<string | null>(null);

  /** Email currently being moved to Restricted Access. */
  restrictBusy = signal<string | null>(null);

  moveToRestricted(email: string) {
    if (!this.isProductOwner || !email) return;
    if (!confirm(
      `Move ${email} to Restricted Access?\n\n` +
      `They will disappear from Domain and Data Storage for everyone except the product owner.`
    )) return;

    this.restrictBusy.set(email);
    this.http.post<any>(`${this.apiUrl}/api/v1/google/workspace-users/restricted`, { email }).subscribe({
      next: () => {
        this.restrictBusy.set(null);
        const key = email.toLowerCase();
        // Product owner still sees restricted accounts on Data Storage — only drop from Domain.
        this.users.update(rows => rows.filter(u => u.email.toLowerCase() !== key));
        this.restrictedLoaded = false;
        this.toast.champagne(`Moved ${email} to Restricted Access`, 'Google');
      },
      error: (err) => {
        this.restrictBusy.set(null);
        this.toast.error(err?.error?.error || 'Failed to move account to Restricted Access', 'Google');
      }
    });
  }

  runUserBackup(row: { email: string }, kind: 'drive' | 'gmail') {
    const label = kind === 'drive' ? 'Drive' : 'Gmail';
    const running = kind === 'drive' ? this.backupStatus()?.running : this.gmailBackupStatus()?.running;
    if (running) {
      this.toast.info(`A ${label} backup run is already in progress — try again when it finishes`, 'Google');
      return;
    }
    if (!confirm(`Back up ${label} for ${row.email} to the storage bucket now?`)) return;

    this.userBackupBusy.set(`${kind}:${row.email}`);
    this.http.post<any>(`${this.apiUrl}/api/v1/google/${kind}-backup/run`, null, { params: { email: row.email } }).subscribe({
      next: (res) => {
        this.userBackupBusy.set(null);
        if (res?.started) {
          this.toast.champagne(`${label} backup started — ${row.email}`, 'Google');
        } else {
          this.toast.info(res?.message || 'A backup run is already in progress', 'Google');
        }
        if (kind === 'drive') this.loadBackupStatus();
        else this.loadGmailBackupStatus();
      },
      error: (err) => {
        this.userBackupBusy.set(null);
        this.toast.error(err?.error?.error || `Failed to start ${label} backup`, 'Google');
      }
    });
  }

  gmailBackupTotals = computed(() => {
    const perUser = this.gmailBackupStatus()?.perUser ?? [];
    return {
      users: perUser.length,
      messages: perUser.reduce((sum, u) => sum + u.messages, 0),
      bytes: perUser.reduce((sum, u) => sum + u.bytes, 0)
    };
  });

  formatMb(mb: number): string {
    if (mb >= 1024 * 1024) return (mb / (1024 * 1024)).toFixed(2) + ' TB';
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb + ' MB';
  }

  storageUserName(email: string): string {
    return this.userByEmail().get(email.toLowerCase())?.fullName || email;
  }

  storageUserPhoto(email: string): string | null {
    return this.userByEmail().get(email.toLowerCase())?.thumbnailPhotoUrl || null;
  }

  storageUserLastLogin(email: string): string | null {
    return this.userByEmail().get(email.toLowerCase())?.lastLoginTime || null;
  }

  readonly statusTabs = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'archived', label: 'Archived' },
    { key: 'deleted', label: 'Deleted' }
  ];

  tabCounts = computed(() => {
    const counts: Record<string, number> = { all: 0, active: 0, suspended: 0, archived: 0, deleted: 0 };
    for (const u of this.sourceUsers()) {
      counts['all']++;
      counts[this.getStatus(u)]++;
    }
    return counts;
  });

  filteredUsers = computed(() => {
    let list = this.sourceUsers();
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
    const all = this.sourceUsers();
    return {
      total: all.length,
      active: all.filter(u => !u.suspended && !u.archived).length,
      suspended: all.filter(u => u.suspended).length,
      admins: all.filter(u => u.isAdmin || u.isDelegatedAdmin).length,
      enrolled2sv: all.filter(u => u.isEnrolledIn2Sv).length
    };
  });

  ngOnInit() {
    this.loadUsers();
    this.statusPollId = setInterval(() => this.pollBackupStatuses(), 5000);
  }

  ngOnDestroy() {
    if (this.statusPollId) clearInterval(this.statusPollId);
  }

  // ----- Live backup progress polling (storage tab, product owner) -----
  private statusPollId: ReturnType<typeof setInterval> | null = null;

  private pollBackupStatuses() {
    if (!this.isProductOwner) return;
    const tab = this.pageTab();
    if (tab !== 'storage' && tab !== 'restricted') return;
    if (this.backupStatus()?.running) this.loadBackupStatus();
    if (this.gmailBackupStatus()?.running) this.loadGmailBackupStatus();
    if (tab === 'storage' && this.accountTotals()?.running) this.loadAccountTotals();
  }

  /** Live label when a backup is currently processing this account, else null. */
  rowBackupLive(email: string): string | null {
    const target = email.toLowerCase();
    const parts: string[] = [];
    const drive = this.backupStatus();
    if (drive?.running && drive.progress?.currentUser?.toLowerCase() === target)
      parts.push(`Drive · ${drive.progress.currentUserItems.toLocaleString()} files`);
    const gmail = this.gmailBackupStatus();
    if (gmail?.running && gmail.progress?.currentUser?.toLowerCase() === target)
      parts.push(`Gmail · ${gmail.progress.currentUserItems.toLocaleString()} msgs`);
    return parts.length ? parts.join(' · ') : null;
  }

  loadUsers() {
    this.loading.set(true);
    this.loadError.set(null);
    this.http.get<any>(`${this.apiUrl}/api/v1/google/workspace-users`).subscribe({
      next: (res) => {
        const list: GoogleUser[] = res?.data || [];
        this.users.set(list);
        this.loading.set(false);
        this.syncRegisterUser();
        // Restricted accounts can change state from the same actions
        if (this.restrictedLoaded) this.loadRestricted();
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
  /** Last OAuth token audit event per clientId (and appName fallback). */
  tokenActivity = signal<Map<string, TokenActivity> | null>(null);

  openRegister(user: GoogleUser) {
    this.registerUser.set(user);
    this.showBackupCodes.set(false);
    this.registerTab.set('overview');
    this.roles.set([]);
    this.rolesError.set(null);
    this.rolesLoadedFor = null;
    if (!user.deleted) this.loadSecurity(user);
    else { this.security.set(null); this.securityError.set(null); }
  }

  closeRegister() {
    this.registerUser.set(null);
    this.security.set(null);
    this.securityError.set(null);
    this.toolModal.set(null);
  }

  // ----- Drawer sub-tabs (overview / roles) -----
  registerTab = signal<'overview' | 'roles'>('overview');
  roles = signal<RoleAssignment[]>([]);
  rolesLoading = signal(false);
  rolesError = signal<string | null>(null);
  private rolesLoadedFor: string | null = null;

  setRegisterTab(tab: 'overview' | 'roles') {
    this.registerTab.set(tab);
    if (tab === 'roles') this.loadRoles();
  }

  loadRoles() {
    const user = this.registerUser();
    if (!user || this.rolesLoadedFor === user.id) return;
    this.rolesLoadedFor = user.id;
    this.rolesLoading.set(true);
    this.rolesError.set(null);
    this.roles.set([]);
    this.http.get<any>(`${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/roles`).subscribe({
      next: (res) => { this.roles.set(res?.data || []); this.rolesLoading.set(false); },
      error: (err) => {
        this.rolesLoadedFor = null;   // allow retry on next tab visit
        this.rolesLoading.set(false);
        this.rolesError.set(err?.error?.error || 'Failed to load role assignments');
      }
    });
  }

  /** "_GROUPS_ADMIN_ROLE" → "Groups Admin Role"; custom roles pass through as-is. */
  roleDisplayName(role: RoleAssignment): string {
    const name = role.roleName || `Role ${role.roleId}`;
    if (!name.includes('_')) return name;
    return name
      .replace(/^_+/, '')
      .split('_')
      .filter(part => part.length)
      .map(part => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ');
  }

  roleScopeLabel(role: RoleAssignment): string {
    return role.scopeType === 'ORG_UNIT' ? 'Org unit' : 'Entire domain';
  }

  manageFromRegister() {
    const user = this.registerUser();
    if (user) this.openManage(user);
  }

  // ----- Account tool popups (groups, licenses, login audit, data transfer) -----
  toolModal = signal<'groups' | 'licenses' | 'audit' | 'transfer' | null>(null);
  toolLoading = signal(false);
  toolError = signal<string | null>(null);
  groups = signal<GroupInfo[]>([]);
  licenses = signal<LicenseInfo[]>([]);
  loginEvents = signal<LoginEvent[]>([]);
  transferApps = signal<TransferApp[]>([]);
  transfers = signal<TransferInfo[]>([]);
  transferBusy = signal(false);
  transferNewOwnerId = '';
  transferSelectedApps = new Set<number>();

  readonly toolButtons = [
    { kind: 'groups' as const, label: 'Groups', icon: 'bx bx-group' },
    { kind: 'licenses' as const, label: 'Licenses', icon: 'bx bx-badge-check' },
    { kind: 'audit' as const, label: 'Login Audit', icon: 'bx bx-history' },
    { kind: 'transfer' as const, label: 'Data Transfer', icon: 'bx bx-transfer' }
  ];

  readonly toolTitles: Record<string, string> = {
    groups: 'Group Memberships',
    licenses: 'License Assignments',
    audit: 'Login Audit',
    transfer: 'Data Transfer'
  };

  transferTargets = computed(() => {
    const current = this.registerUser();
    return this.users()
      .filter(u => !u.suspended && !u.archived && !u.deleted && u.id !== current?.id)
      .sort((a, b) => (a.email || '').localeCompare(b.email || ''));
  });

  openTool(kind: 'groups' | 'licenses' | 'audit' | 'transfer') {
    const user = this.registerUser();
    if (!user) return;
    this.toolModal.set(kind);
    this.toolError.set(null);
    this.toolLoading.set(true);

    const base = `${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}`;
    const done = () => this.toolLoading.set(false);
    const fail = (err: any) => {
      this.toolLoading.set(false);
      this.toolError.set(err?.error?.error || 'Failed to load data');
    };

    switch (kind) {
      case 'groups':
        this.groups.set([]);
        this.http.get<any>(`${base}/groups`).subscribe({
          next: (res) => { this.groups.set(res?.data || []); done(); }, error: fail
        });
        break;
      case 'licenses':
        this.licenses.set([]);
        this.http.get<any>(`${base}/licenses`, { params: { email: user.email } }).subscribe({
          next: (res) => { this.licenses.set(res?.data || []); done(); }, error: fail
        });
        break;
      case 'audit':
        this.loginEvents.set([]);
        this.http.get<any>(`${base}/login-events`).subscribe({
          next: (res) => { this.loginEvents.set(res?.data || []); done(); }, error: fail
        });
        break;
      case 'transfer':
        this.transferApps.set([]);
        this.transfers.set([]);
        this.transferNewOwnerId = '';
        this.transferSelectedApps = new Set<number>();
        this.http.get<any>(`${this.apiUrl}/api/v1/google/transfer-applications`).subscribe({
          next: (res) => {
            this.transferApps.set(res?.data || []);
            this.http.get<any>(`${base}/transfers`).subscribe({
              next: (r2) => { this.transfers.set(r2?.data || []); done(); },
              error: () => done()   // transfer history is non-critical
            });
          },
          error: fail
        });
        break;
    }
  }

  closeTool() {
    this.toolModal.set(null);
  }

  toggleTransferApp(appId: number) {
    if (this.transferSelectedApps.has(appId)) this.transferSelectedApps.delete(appId);
    else this.transferSelectedApps.add(appId);
  }

  startTransfer() {
    const user = this.registerUser();
    if (!user) return;
    const target = this.users().find(u => u.id === this.transferNewOwnerId);
    if (!target) { this.toast.error('Select a destination user', 'Google'); return; }
    if (this.transferSelectedApps.size === 0) { this.toast.error('Select at least one application', 'Google'); return; }

    const appNames = this.transferApps()
      .filter(a => this.transferSelectedApps.has(a.id))
      .map(a => a.name).join(', ');
    if (!confirm(`Transfer ${appNames} data from ${user.email} to ${target.email}?`)) return;

    this.transferBusy.set(true);
    this.http.post(`${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/transfers`, {
      newOwnerUserId: target.id,
      newOwnerEmail: target.email,
      applicationIds: [...this.transferSelectedApps],
      applicationNames: appNames,
      email: user.email
    }).subscribe({
      next: () => {
        this.transferBusy.set(false);
        this.toast.champagne(`Transfer started — ${user.email} → ${target.email}`, 'Google');
        this.openTool('transfer');
      },
      error: (err) => {
        this.transferBusy.set(false);
        this.toast.error(err?.error?.error || 'Failed to start transfer', 'Google');
      }
    });
  }

  transferStatusLabel(t: TransferInfo): string {
    const email = t.targetEmail || this.users().find(u => u.id === t.targetUserId)?.email || t.targetUserId;
    return `→ ${email} · ${t.status || 'unknown'}`;
  }

  transferDetailLabel(t: TransferInfo): string {
    const parts: string[] = [];
    if (t.applications) parts.push(t.applications);
    if (t.requestedBy) parts.push(`requested by ${t.requestedBy}`);
    return parts.join(' · ');
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

    // Non-blocking enrichment: last token use per connected app from the audit log.
    this.tokenActivity.set(null);
    this.http.get<any>(`${this.apiUrl}/api/v1/google/workspace-users/${encodeURIComponent(user.id)}/token-activity`).subscribe({
      next: (res) => {
        const map = new Map<string, TokenActivity>();
        for (const a of (res?.data || []) as TokenActivity[]) {
          if (a.clientId) map.set(a.clientId, a);
          if (a.appName) map.set(a.appName.toLowerCase(), a);
        }
        this.tokenActivity.set(map);
      },
      error: () => this.tokenActivity.set(new Map()),
    });
  }

  activityFor(token: OAuthToken): TokenActivity | null {
    const map = this.tokenActivity();
    if (!map) return null;
    return map.get(token.clientId) || map.get((token.displayText || '').toLowerCase()) || null;
  }

  /** True when the app used its grant within the last 24 hours. */
  isRecentlyActive(token: OAuthToken): boolean {
    const a = this.activityFor(token);
    if (!a?.lastActivityTime) return false;
    return Date.now() - new Date(a.lastActivityTime).getTime() < 24 * 3600 * 1000;
  }

  activityLabel(token: OAuthToken): string | null {
    const map = this.tokenActivity();
    if (!map) return null; // still loading — show nothing
    const a = this.activityFor(token);
    if (!a?.lastActivityTime) return 'no recent activity';
    const mins = Math.max(0, Math.floor((Date.now() - new Date(a.lastActivityTime).getTime()) / 60000));
    if (mins < 60) return `active ${mins <= 1 ? 'just now' : mins + 'm ago'}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `active ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `active ${days}d ago`;
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
    if (!this.passwordForm.password || this.passwordForm.password.length < 12) {
      this.toast.error('Password must be at least 12 characters (domain password policy)', 'Google');
      return;
    }
    if (this.passwordForm.password.length > 100) {
      this.toast.error('Password must be 100 characters or fewer', 'Google');
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
    // 16 chars with at least one upper, lower, digit, and symbol.
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%';
    const all = upper + lower + digits + symbols;

    const pick = (set: string, count: number) => {
      const bytes = new Uint32Array(count);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, b => set[b % set.length]);
    };

    const chars = [
      ...pick(upper, 1), ...pick(lower, 1), ...pick(digits, 1), ...pick(symbols, 1),
      ...pick(all, 12)
    ];
    // Fisher-Yates shuffle so the guaranteed classes aren't always in front
    const rand = new Uint32Array(chars.length);
    crypto.getRandomValues(rand);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = rand[i] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    this.passwordForm.password = chars.join('');
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

  removeAdminRoles() {
    const user = this.manageUser();
    if (!user) return;
    this.runAction(user, 'removeadminroles', 'Remove ALL delegated admin roles from');
  }
}
