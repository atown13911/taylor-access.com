import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-my-hr-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="hr-profile-page">
      <header class="page-header">
        <h1><i class='bx bx-id-card'></i> My HR Profile</h1>
        <p class="subtitle">Your employment details, documents, and time off</p>
      </header>

      @if (loading()) {
        <div class="loading"><i class='bx bx-loader-alt bx-spin'></i> Loading your profile...</div>
      } @else if (employee()) {
        <!-- Employee Info -->
        <div class="profile-grid">
          <div class="info-card">
            <h3><i class='bx bx-user'></i> Personal Information</h3>
            <div class="info-rows">
              <div class="info-row"><span class="label">Name</span><span class="value">{{ employee().name }}</span></div>
              <div class="info-row"><span class="label">Email</span><span class="value">{{ employee().email }}</span></div>
              <div class="info-row"><span class="label">Phone</span><span class="value">{{ employee().phone || '—' }}</span></div>
              <div class="info-row"><span class="label">Role</span><span class="value role-badge">{{ employee().role }}</span></div>
              <div class="info-row"><span class="label">Status</span><span class="value"><span class="status-badge" [class]="employee().status">{{ employee().status }}</span></span></div>
            </div>
          </div>

          <div class="info-card">
            <h3><i class='bx bx-buildings'></i> Organization & Position</h3>
            <div class="info-rows">
              <div class="info-row"><span class="label">Organization</span><span class="value">{{ employee().organization?.name || '—' }}</span></div>
              <div class="info-row"><span class="label">Department</span><span class="value">{{ employee().department?.name || '—' }}</span></div>
              <div class="info-row"><span class="label">Position</span><span class="value">{{ employee().position?.title || employee().jobTitle || '—' }}</span></div>
              <div class="info-row"><span class="label">Entity</span><span class="value">{{ employee().satellite?.name || employee().agency?.name || employee().terminal?.name || 'Corporate' }}</span></div>
            </div>
          </div>

          <div class="info-card">
            <h3><i class='bx bx-globe'></i> Localization</h3>
            <div class="info-rows">
              <div class="info-row"><span class="label">Country</span><span class="value">{{ employee().country || '—' }}</span></div>
              <div class="info-row"><span class="label">Language</span><span class="value">{{ employee().language || '—' }}</span></div>
              <div class="info-row"><span class="label">Timezone</span><span class="value">{{ employee().timezone || '—' }}</span></div>
              <div class="info-row"><span class="label">Member Since</span><span class="value">{{ employee().createdAt | date:'mediumDate' }}</span></div>
            </div>
          </div>

          <div class="info-card">
            <h3><i class='bx bx-file'></i> Required Documents</h3>
            @if (requiredDocs().length === 0) {
              <div class="empty-msg">No document requirements for your position</div>
            } @else {
              <div class="doc-list">
                @for (doc of requiredDocs(); track doc.label) {
                  <div class="doc-item">
                    <i class='bx bx-file-blank'></i>
                    <span>{{ doc.label }}</span>
                    <span class="cat-tag">{{ doc.category }}</span>
                    <span class="status-badge missing">Missing</span>
                  </div>
                }
              </div>
            }
          </div>

          <div class="info-card">
            <h3><i class='bx bx-calendar-event'></i> Time Off</h3>
            <div class="info-rows">
              <div class="info-row"><span class="label">PTO Balance</span><span class="value">{{ timeOffBalance()?.ptoRemaining || 0 }} / {{ timeOffBalance()?.ptoTotal || 0 }} days</span></div>
              <div class="info-row"><span class="label">Sick Leave</span><span class="value">{{ timeOffBalance()?.sickRemaining || 0 }} / {{ timeOffBalance()?.sickTotal || 0 }} days</span></div>
              <div class="info-row"><span class="label">Personal Days</span><span class="value">{{ timeOffBalance()?.personalRemaining || 0 }} / {{ timeOffBalance()?.personalTotal || 0 }} days</span></div>
            </div>
          </div>
        </div>
      } @else {
        <div class="empty-state">
          <i class='bx bx-user-x'></i>
          <h3>Profile not found</h3>
          <p>Unable to load your HR profile</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .hr-profile-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: 28px; }
    .page-header h1 { color: #fff; font-size: 1.8rem; margin: 0; display: flex; align-items: center; gap: 12px; i { color: #00d4ff; } }
    .subtitle { color: #888; margin: 6px 0 0; font-size: 0.9rem; }
    .loading { text-align: center; padding: 60px; color: #888; font-size: 1rem; i { margin-right: 8px; } }
    .profile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }
    .info-card { background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 14px; padding: 22px; }
    .info-card h3 { margin: 0 0 18px; font-size: 1rem; color: #00d4ff; display: flex; align-items: center; gap: 8px; }
    .info-rows { display: flex; flex-direction: column; gap: 12px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; }
    .label { color: #888; font-size: 0.85rem; }
    .value { color: #e0e0e0; font-size: 0.9rem; font-weight: 500; }
    .role-badge { background: rgba(0, 212, 255, 0.12); color: #00d4ff; padding: 2px 10px; border-radius: 10px; font-size: 0.78rem; }
    .status-badge { padding: 3px 10px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
    .status-badge.active { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
    .status-badge.inactive { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .status-badge.missing { background: rgba(239, 68, 68, 0.12); color: #ef4444; font-size: 0.7rem; }
    .doc-list { display: flex; flex-direction: column; gap: 8px; }
    .doc-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 0.85rem; color: #ccc; i { color: #00d4ff; } }
    .cat-tag { margin-left: auto; background: rgba(255, 170, 0, 0.12); color: #ffaa00; padding: 2px 8px; border-radius: 8px; font-size: 0.7rem; }
    .empty-msg { color: #666; font-size: 0.88rem; text-align: center; padding: 20px; }
    .empty-state { text-align: center; padding: 60px; color: #888; i { font-size: 3rem; color: #444; display: block; margin-bottom: 12px; } h3 { color: #ccc; margin: 0 0 6px; } p { margin: 0; } }
  `]
})
export class MyHrProfileComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiUrl = environment.apiUrl;

  loading = signal(true);
  employee = signal<any>(null);
  requiredDocs = signal<any[]>([]);
  timeOffBalance = signal<any>(null);

  async ngOnInit() {
    try {
      const userId = this.auth.currentUser()?.id;
      if (!userId) { this.loading.set(false); return; }

      // Load employee profile
      const userRes: any = await this.http.get(`${this.apiUrl}/api/v1/users/${userId}`).toPromise();
      const emp = userRes?.data || userRes?.user || userRes;
      this.employee.set(emp);

      // Load position requirements
      if (emp?.positionId) {
        try {
          const docRes: any = await this.http.get(`${this.apiUrl}/api/v1/document-categories/position/${emp.positionId}/requirements`).toPromise();
          const docs = (docRes?.data?.docs || []).map((d: any) => ({
            label: d.name,
            category: d.categoryName || ''
          }));
          this.requiredDocs.set(docs);
        } catch { }
      }

      // Load time off balance
      try {
        const balRes: any = await this.http.get(`${this.apiUrl}/api/v1/time-off/balances`).toPromise();
        const balance = (balRes?.data || []).find((b: any) => b.employeeId === +userId);
        this.timeOffBalance.set(balance || null);
      } catch { }
    } catch (err) {
      console.error('Failed to load HR profile:', err);
    } finally {
      this.loading.set(false);
    }
  }
}
