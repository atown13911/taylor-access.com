import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { environment } from '../../../../environments/environment';

interface IndeedSettings {
  enabled: boolean;
  apiBaseUrl: string;
  authMode: 'bearer' | 'apiKey';
  bearerToken: string;
  apiKey: string;
  partnerId: string;
  clientId: string;
  clientSecret: string;
  employerId: string;
  webhookSecret: string;
}

@Component({
  selector: 'app-indeed',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="indeed-page">
      <header class="page-header">
        <div>
          <h1><i class='bx bx-link'></i> Indeed Integration</h1>
          <p>Configure your Indeed partner API connection for recruiting workflows.</p>
        </div>
        <div class="header-actions">
          <a class="docs-link" href="https://docs.indeed.com/getstarted" target="_blank" rel="noopener noreferrer">
            <i class='bx bx-book-open'></i> Open Indeed Docs
          </a>
        </div>
      </header>

      <section class="card">
        <div class="card-head">
          <h2>Connection Settings</h2>
          <label class="toggle">
            <input type="checkbox" [(ngModel)]="form.enabled" />
            <span>Enabled</span>
          </label>
        </div>

        <div class="form-grid">
          <label class="field full">
            <span>API Base URL</span>
            <input type="text" [(ngModel)]="form.apiBaseUrl" placeholder="https://apis.indeed.com/graphql" />
          </label>

          <label class="field">
            <span>Auth Mode</span>
            <select [(ngModel)]="form.authMode">
              <option value="bearer">Bearer Token</option>
              <option value="apiKey">API Key Header</option>
            </select>
          </label>

          @if (form.authMode === 'bearer') {
            <label class="field">
              <span>Bearer Token</span>
              <input type="password" [(ngModel)]="form.bearerToken" placeholder="Paste Indeed bearer token" />
            </label>
          } @else {
            <label class="field">
              <span>API Key</span>
              <input type="password" [(ngModel)]="form.apiKey" placeholder="Paste Indeed API key" />
            </label>
          }

          <label class="field">
            <span>Partner ID</span>
            <input type="text" [(ngModel)]="form.partnerId" placeholder="Partner identifier" />
          </label>

          <label class="field">
            <span>Client ID</span>
            <input type="text" [(ngModel)]="form.clientId" placeholder="OAuth client id" />
          </label>

          <label class="field">
            <span>Client Secret</span>
            <input type="password" [(ngModel)]="form.clientSecret" placeholder="OAuth client secret" />
          </label>

          <label class="field">
            <span>Employer ID</span>
            <input type="text" [(ngModel)]="form.employerId" placeholder="Indeed employer id" />
          </label>

          <label class="field">
            <span>Webhook Secret</span>
            <input type="password" [(ngModel)]="form.webhookSecret" placeholder="Webhook secret (optional)" />
          </label>
        </div>

        <div class="actions">
          <button class="btn secondary" (click)="reload()" [disabled]="loading()">
            <i class='bx bx-refresh'></i> Reload
          </button>
          <button class="btn primary" (click)="save()" [disabled]="loading()">
            <i class='bx bx-save'></i> Save
          </button>
          <button class="btn accent" (click)="testConnection()" [disabled]="loading() || !form.enabled">
            <i class='bx bx-plug'></i> Test Connection
          </button>
        </div>
      </section>

      @if (statusMessage()) {
        <section class="status" [class.error]="statusType() === 'error'" [class.success]="statusType() === 'success'">
          {{ statusMessage() }}
        </section>
      }
    </div>
  `,
  styles: [`
    .indeed-page { padding: 20px; display: grid; gap: 16px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .page-header h1 { margin: 0; color: #00d4ff; display: flex; gap: 10px; align-items: center; }
    .page-header p { margin: 6px 0 0; color: #94a3b8; }
    .docs-link { color: #7dd3fc; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .card { background: rgba(11, 16, 30, 0.84); border: 1px solid #243447; border-radius: 12px; padding: 16px; display: grid; gap: 14px; }
    .card-head { display: flex; justify-content: space-between; align-items: center; }
    .card-head h2 { margin: 0; color: #e2e8f0; font-size: 1.05rem; }
    .toggle { display: inline-flex; align-items: center; gap: 8px; color: #cbd5e1; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .field { display: grid; gap: 6px; }
    .field.full { grid-column: 1 / -1; }
    .field span { color: #9fb3c8; font-size: 0.86rem; }
    .field input, .field select {
      width: 100%;
      background: rgba(2, 6, 23, 0.65);
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn { border: 1px solid transparent; border-radius: 8px; padding: 9px 14px; color: #f8fafc; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn.primary { background: #0369a1; border-color: #0ea5e9; }
    .btn.secondary { background: #1e293b; border-color: #334155; }
    .btn.accent { background: #14532d; border-color: #22c55e; }
    .status { border: 1px solid #334155; border-radius: 10px; padding: 10px 12px; color: #cbd5e1; background: rgba(15, 23, 42, 0.7); }
    .status.success { border-color: #166534; color: #86efac; background: rgba(20, 83, 45, 0.2); }
    .status.error { border-color: #7f1d1d; color: #fecaca; background: rgba(127, 29, 29, 0.2); }
  `]
})
export class IndeedComponent implements OnInit {
  private settings = inject(UserSettingsService);
  private http = inject(HttpClient);
  private readonly storageKey = 'integrations.indeed.v1';
  private readonly apiUrl = environment.apiUrl;

  loading = signal(false);
  statusMessage = signal('');
  statusType = signal<'idle' | 'success' | 'error'>('idle');

  form: IndeedSettings = this.defaultForm();

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.statusMessage.set('');
    try {
      const saved = await firstValueFrom(this.settings.get(this.storageKey));
      this.form = this.mergeDefaults(saved);
      this.statusType.set('success');
      this.statusMessage.set('Indeed settings loaded.');
    } catch {
      this.form = this.defaultForm();
      this.statusType.set('error');
      this.statusMessage.set('Unable to load saved Indeed settings.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    this.loading.set(true);
    this.statusMessage.set('');
    try {
      await firstValueFrom(this.settings.set(this.storageKey, this.form));
      this.statusType.set('success');
      this.statusMessage.set('Indeed settings saved.');
    } catch {
      this.statusType.set('error');
      this.statusMessage.set('Failed to save Indeed settings.');
    } finally {
      this.loading.set(false);
    }
  }

  async testConnection(): Promise<void> {
    this.loading.set(true);
    this.statusMessage.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<any>(`${this.apiUrl}/api/v1/integrations/indeed/test`, {
          apiBaseUrl: this.form.apiBaseUrl,
          authMode: this.form.authMode,
          bearerToken: this.form.bearerToken,
          apiKey: this.form.apiKey,
          partnerId: this.form.partnerId,
          clientId: this.form.clientId
        })
      );
      const typeName = String(res?.typeName ?? '').trim();
      const statusCode = Number(res?.statusCode ?? 0);
      if (typeName || (statusCode >= 200 && statusCode < 300)) {
        this.statusType.set('success');
        this.statusMessage.set(`Indeed connection OK${typeName ? `. Response type: ${typeName}` : ''}.`);
      } else {
        this.statusType.set('error');
        this.statusMessage.set('Connection test responded without expected GraphQL data.');
      }
    } catch (err: any) {
      const details = String(err?.error?.message || err?.message || 'Request failed');
      this.statusType.set('error');
      this.statusMessage.set(`Connection test failed: ${details}`);
    } finally {
      this.loading.set(false);
    }
  }

  private defaultForm(): IndeedSettings {
    return {
      enabled: false,
      apiBaseUrl: 'https://apis.indeed.com/graphql',
      authMode: 'bearer',
      bearerToken: '',
      apiKey: '',
      partnerId: '',
      clientId: '',
      clientSecret: '',
      employerId: '',
      webhookSecret: ''
    };
  }

  private mergeDefaults(raw: any): IndeedSettings {
    const defaults = this.defaultForm();
    return {
      ...defaults,
      ...(raw && typeof raw === 'object' ? raw : {}),
      enabled: Boolean(raw?.enabled ?? defaults.enabled),
      authMode: raw?.authMode === 'apiKey' ? 'apiKey' : 'bearer'
    };
  }
}

