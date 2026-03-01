import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface OAuthApp {
  clientId: string;
  name: string;
  description: string;
  homepageUrl: string;
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  appAccess: Record<string, boolean>;
}

@Component({
  selector: 'app-app-access',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1>App Access Management</h1>
          <p class="subtitle">Control which applications each user can access via SSO</p>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-state">
          <span class="material-icons spin">sync</span>
          <p>Loading users and apps...</p>
        </div>
      } @else {
        <div class="access-grid-wrapper">
          <table class="access-grid">
            <thead>
              <tr>
                <th class="user-col">User</th>
                @for (app of apps(); track app.clientId) {
                  <th class="app-col">
                    <div class="app-header">
                      <span class="app-name">{{ app.name }}</span>
                    </div>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr>
                  <td class="user-col">
                    <div class="user-info">
                      <span class="user-name">{{ user.name }}</span>
                      <span class="user-email">{{ user.email }}</span>
                    </div>
                  </td>
                  @for (app of apps(); track app.clientId) {
                    <td class="app-col">
                      @if (isAdmin(user)) {
                        <span class="admin-badge" title="Admins have access to all apps">ALL</span>
                      } @else {
                        <label class="toggle">
                          <input type="checkbox"
                            [checked]="user.appAccess[app.clientId]"
                            (change)="toggleAccess(user, app.clientId, $event)">
                          <span class="toggle-slider"></span>
                        </label>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-container { padding: 0; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { font-size: 1.5rem; font-weight: 700; margin: 0; }
    .subtitle { color: var(--text-secondary, #8899a6); font-size: 0.85rem; margin-top: 4px; }
    .loading-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; color: var(--text-secondary, #8899a6); }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .access-grid-wrapper { overflow-x: auto; border: 1px solid var(--border-color, #2a2f3a); border-radius: 12px; }
    .access-grid { width: 100%; border-collapse: collapse; }
    .access-grid th, .access-grid td { padding: 12px 16px; text-align: center; border-bottom: 1px solid var(--border-color, #2a2f3a); }
    .access-grid thead th { background: var(--bg-secondary, #151922); font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary, #8899a6); position: sticky; top: 0; z-index: 1; }
    .access-grid tbody tr:hover { background: var(--bg-hover, rgba(255,255,255,0.02)); }

    .user-col { text-align: left !important; min-width: 220px; }
    .app-col { min-width: 100px; }
    .app-header { display: flex; flex-direction: column; gap: 2px; }
    .app-name { font-size: 0.7rem; }

    .user-info { display: flex; flex-direction: column; gap: 2px; }
    .user-name { font-weight: 600; font-size: 0.875rem; }
    .user-email { font-size: 0.75rem; color: var(--text-secondary, #8899a6); }

    .admin-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 700; background: rgba(59, 130, 246, 0.15); color: #60a5fa; letter-spacing: 0.1em; }

    .toggle { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; inset: 0; background: var(--bg-tertiary, #2a2f3a); border-radius: 20px; transition: 0.2s; }
    .toggle-slider::before { content: ''; position: absolute; width: 16px; height: 16px; left: 2px; top: 2px; background: white; border-radius: 50%; transition: 0.2s; }
    .toggle input:checked + .toggle-slider { background: #3b82f6; }
    .toggle input:checked + .toggle-slider::before { transform: translateX(16px); }
  `]
})
export class AppAccessComponent implements OnInit {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  loading = signal(true);
  apps = signal<OAuthApp[]>([]);
  users = signal<UserRow[]>([]);

  ngOnInit() {
    this.loadData();
  }

  isAdmin(user: UserRow): boolean {
    return ['product_owner', 'superadmin', 'admin'].includes(user.role);
  }

  async loadData() {
    this.loading.set(true);
    try {
      const [appsRes, usersRes] = await Promise.all([
        this.http.get<any[]>(`${this.baseUrl}/oauth/clients`).toPromise(),
        this.http.get<any>(`${this.baseUrl}/api/v1/users`).toPromise(),
      ]);

      const appsList = (appsRes || []).map((a: any) => ({
        clientId: a.clientId,
        name: a.name,
        description: a.description || '',
        homepageUrl: a.homepageUrl || '',
      }));
      this.apps.set(appsList);

      const usersList = (usersRes?.data || usersRes || []) as any[];
      const userRows: UserRow[] = [];

      for (const u of usersList) {
        const assignmentsRes = await this.http.get<any[]>(`${this.baseUrl}/oauth/users/${u.id}/apps`).toPromise();
        const accessMap: Record<string, boolean> = {};
        for (const app of appsList) {
          accessMap[app.clientId] = (assignmentsRes || []).some((a: any) => a.appClientId === app.clientId && a.status === 'active');
        }
        userRows.push({ id: u.id, name: u.name, email: u.email, role: u.role || 'user', appAccess: accessMap });
      }

      this.users.set(userRows);
    } catch (err) {
      console.error('Failed to load app access data', err);
    } finally {
      this.loading.set(false);
    }
  }

  async toggleAccess(user: UserRow, appClientId: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    try {
      if (checked) {
        await this.http.post(`${this.baseUrl}/oauth/users/${user.id}/apps`, {
          appClientId,
          role: 'user',
          permissions: null,
        }).toPromise();
      } else {
        await this.http.delete(`${this.baseUrl}/oauth/users/${user.id}/apps/${appClientId}`).toPromise();
      }
      user.appAccess[appClientId] = checked;
    } catch (err) {
      console.error('Failed to update access', err);
      (event.target as HTMLInputElement).checked = !checked;
    }
  }
}
