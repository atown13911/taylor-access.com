import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-connected-apps',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1><i class="bx bx-link"></i> Connected Apps (SSO)</h1>
          <p>Manage applications that use Taylor Access for authentication</p>
        </div>
        <button class="btn-primary" (click)="showAddModal.set(true)">
          <i class="bx bx-plus"></i> Register App
        </button>
      </div>

      <div class="apps-grid">
        @for (app of apps(); track app.id) {
          <div class="app-card">
            <div class="app-header">
              <div class="app-icon">
                @if (app.logoUrl) {
                  <img [src]="app.logoUrl" [alt]="app.name">
                } @else {
                  <i class="bx bx-cube"></i>
                }
              </div>
              <div class="app-info">
                <h3>{{ app.name }}</h3>
                <p class="app-desc">{{ app.description || 'No description' }}</p>
              </div>
              <span class="status-badge" [class.active]="app.status === 'active'">{{ app.status }}</span>
            </div>
            <div class="app-details">
              <div class="detail"><span class="label">Client ID</span><code>{{ app.clientId }}</code></div>
              <div class="detail"><span class="label">Homepage</span><span>{{ app.homepageUrl || '—' }}</span></div>
              <div class="detail"><span class="label">Active Sessions</span><span class="sessions">{{ app.activeTokens }}</span></div>
              <div class="detail"><span class="label">Created</span><span>{{ app.createdAt | date:'mediumDate' }}</span></div>
            </div>
            <div class="app-actions">
              <button class="btn-sm btn-danger" (click)="deleteApp(app)">
                <i class="bx bx-trash"></i> Remove
              </button>
            </div>
          </div>
        }
        @if (apps().length === 0 && !loading()) {
          <div class="empty">No connected apps yet. Register one to enable SSO.</div>
        }
      </div>

      <!-- Add App Modal -->
      @if (showAddModal()) {
        <div class="modal-overlay" (click)="showAddModal.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>Register New App</h2>
            <div class="field"><label>App Name</label><input [(ngModel)]="newApp.name" placeholder="e.g. My Application"></div>
            <div class="field"><label>Description</label><input [(ngModel)]="newApp.description" placeholder="Optional description"></div>
            <div class="field"><label>Homepage URL</label><input [(ngModel)]="newApp.homepageUrl" placeholder="https://myapp.com"></div>
            <div class="field"><label>Redirect URIs (comma separated)</label><input [(ngModel)]="newApp.redirectUris" placeholder="https://myapp.com/callback"></div>
            <div class="modal-actions">
              <button class="btn-primary" (click)="registerApp()">Register</button>
              <button class="btn-cancel" (click)="showAddModal.set(false)">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- Credentials Modal -->
      @if (showCredentials()) {
        <div class="modal-overlay">
          <div class="modal">
            <h2><i class="bx bx-key"></i> App Credentials</h2>
            <p class="warning">Save these credentials now. The client secret won't be shown again.</p>
            <div class="cred"><label>Client ID</label><code>{{ credentials().clientId }}</code></div>
            <div class="cred"><label>Client Secret</label><code>{{ credentials().clientSecret }}</code></div>
            <div class="modal-actions">
              <button class="btn-primary" (click)="showCredentials.set(false)">I've Saved These</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 0; }
    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;
      h1 { font-size: 22px; color: var(--cyan); display: flex; align-items: center; gap: 8px; i { font-size: 26px; } }
      p { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
    }
    .btn-primary {
      display: flex; align-items: center; gap: 6px; padding: 10px 18px;
      background: linear-gradient(135deg, #00d4ff, #0099cc); color: #050508;
      border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .apps-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }
    .app-card {
      background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px;
      &:hover { border-color: var(--border-bright); }
    }
    .app-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .app-icon {
      width: 44px; height: 44px; background: var(--accent-08); border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      i { font-size: 24px; color: var(--cyan); }
      img { width: 44px; height: 44px; border-radius: 10px; }
    }
    .app-info { flex: 1; h3 { font-size: 16px; color: var(--text-primary); } }
    .app-desc { font-size: 12px; color: var(--text-muted); }
    .status-badge {
      padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;
      background: rgba(255,255,255,0.05); color: #888;
      &.active { background: rgba(0,255,136,0.1); color: #00ff88; }
    }
    .app-details { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .detail {
      .label { display: block; font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
      code { font-size: 11px; color: var(--cyan); background: var(--accent-05); padding: 2px 6px; border-radius: 4px; }
      span { font-size: 13px; color: var(--text-secondary); }
      .sessions { color: var(--green); font-weight: 600; }
    }
    .app-actions { display: flex; gap: 8px; }
    .btn-sm { padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; border: none; display: flex; align-items: center; gap: 4px; }
    .btn-danger { background: rgba(255,42,109,0.1); color: #ff2a6d; border: 1px solid rgba(255,42,109,0.2); &:hover { background: rgba(255,42,109,0.2); } }
    .empty { text-align: center; padding: 60px; color: var(--text-muted); }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal {
      background: var(--bg-card); border: 1px solid var(--border-bright); border-radius: 16px; padding: 28px; width: 440px;
      h2 { font-size: 18px; color: var(--text-primary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; i { color: var(--cyan); } }
    }
    .field { margin-bottom: 12px; label { display: block; font-size: 12px; color: var(--cyan); margin-bottom: 4px; } input { width: 100%; padding: 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary); font-size: 13px; &:focus { border-color: var(--cyan); outline: none; } } }
    .modal-actions { display: flex; gap: 8px; margin-top: 16px; .btn-cancel { padding: 10px 18px; background: none; border: 1px solid var(--border-color); border-radius: 8px; color: #888; cursor: pointer; } }
    .warning { color: #fbbf24; font-size: 13px; margin-bottom: 16px; background: rgba(251,191,36,0.1); padding: 10px; border-radius: 8px; }
    .cred { margin-bottom: 12px; label { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 4px; } code { display: block; padding: 10px; background: var(--bg-secondary); border-radius: 6px; font-size: 13px; color: var(--cyan); word-break: break-all; } }
  `]
})
export class ConnectedAppsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private baseUrl = environment.apiUrl;

  apps = signal<any[]>([]);
  loading = signal(true);
  showAddModal = signal(false);
  showCredentials = signal(false);
  credentials = signal<any>({});
  newApp = { name: '', description: '', homepageUrl: '', redirectUris: '' };

  ngOnInit() { this.loadApps(); }

  loadApps() {
    this.http.get<any[]>(`${this.baseUrl}/oauth/clients`).subscribe({
      next: (apps) => { this.apps.set(apps); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  registerApp() {
    const uris = this.newApp.redirectUris.split(',').map(u => u.trim()).filter(u => u);
    this.http.post(`${this.baseUrl}/oauth/clients`, {
      name: this.newApp.name,
      description: this.newApp.description,
      redirectUris: uris,
      homepageUrl: this.newApp.homepageUrl
    }).subscribe({
      next: (res: any) => {
        this.credentials.set(res);
        this.showCredentials.set(true);
        this.showAddModal.set(false);
        this.newApp = { name: '', description: '', homepageUrl: '', redirectUris: '' };
        this.loadApps();
        this.toast.success('App registered successfully');
      },
      error: () => this.toast.error('Failed to register app')
    });
  }

  async deleteApp(app: any) {
    const confirmed = await this.confirm.show({ title: 'Delete App', message: `Remove "${app.name}" from SSO? All active sessions will be revoked.`, type: 'danger' });
    if (!confirmed) return;
    this.http.delete(`${this.baseUrl}/oauth/clients/${app.id}`).subscribe({
      next: () => { this.loadApps(); this.toast.success('App removed'); },
      error: () => this.toast.error('Failed to remove app')
    });
  }
}
