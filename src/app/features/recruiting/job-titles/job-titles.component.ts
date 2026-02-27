import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-job-titles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="job-titles-page">
      <div class="page-header">
        <div>
          <h1><i class="bx bx-id-card"></i> Job Titles</h1>
          <p>Manage position titles for recruiting</p>
        </div>
        <button class="btn-primary" (click)="showModal = true">
          <i class="bx bx-plus"></i> Add Job Title
        </button>
      </div>

      <!-- Job Titles Table -->
      <div class="titles-table">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Code</th>
              <th>Organization</th>
              <th>Department</th>
              <th>Level</th>
              <th>Category</th>
              <th>Salary Range</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let title of jobTitles()">
              <td><strong>{{ title.title }}</strong></td>
              <td>{{ title.code || '-' }}</td>
              <td>{{ title.organization?.name || '-' }}</td>
              <td>{{ title.department?.name || '-' }}</td>
              <td><span class="level-badge">{{ title.level || '-' }}</span></td>
              <td>{{ title.category || '-' }}</td>
              <td>
                <span *ngIf="title.salaryMin && title.salaryMax">
                  {{ '$' + (title.salaryMin | number) + ' - $' + (title.salaryMax | number) }}
                </span>
                <span *ngIf="!title.salaryMin">-</span>
              </td>
              <td>
                <span class="status-badge" [class.active]="title.isActive">
                  {{ title.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Create Modal -->
      <div *ngIf="showModal" class="modal-overlay" (click)="showModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <h2>Add Job Title</h2>
          <div class="form-grid">
            <input type="text" [(ngModel)]="newTitle.title" placeholder="Title *" class="form-input">
            <input type="text" [(ngModel)]="newTitle.code" placeholder="Code" class="form-input">
            <div class="form-row">
              <select [(ngModel)]="newTitle.organizationId" (ngModelChange)="onOrgChange($event)" class="form-select">
                <option [ngValue]="null">Select Organization *</option>
                <option *ngFor="let org of organizations()" [ngValue]="org.id">{{ org.name }}</option>
              </select>
              <select [(ngModel)]="newTitle.departmentId" class="form-select">
                <option [ngValue]="null">Select Department</option>
                <option *ngFor="let dept of filteredDepartments()" [ngValue]="dept.id">{{ dept.name }}</option>
              </select>
            </div>
            <div class="form-row">
              <select [(ngModel)]="newTitle.level" class="form-select">
                <option value="">Select Level</option>
                <option value="entry">Entry</option>
                <option value="junior">Junior</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
                <option value="manager">Manager</option>
                <option value="director">Director</option>
                <option value="executive">Executive</option>
              </select>
              <select [(ngModel)]="newTitle.category" class="form-select">
                <option value="">Select Category</option>
                <option value="operations">Operations</option>
                <option value="admin">Administration</option>
                <option value="sales">Sales</option>
                <option value="technical">Technical</option>
                <option value="management">Management</option>
              </select>
            </div>
            <textarea [(ngModel)]="newTitle.description" placeholder="Description" rows="3" class="form-textarea"></textarea>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" (click)="showModal = false">Cancel</button>
            <button class="btn-primary" (click)="createTitle()">Add Title</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .job-titles-page { padding: 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .page-header h1 { color: #00f2fe; font-size: 2rem; margin: 0 0 8px 0; display: flex; align-items: center; gap: 12px; }
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
    .titles-table { background: rgba(26, 26, 46, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 16px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: rgba(16, 18, 27, 0.8); }
    th { padding: 16px; text-align: left; color: #00f2fe; font-weight: 600; font-size: 0.9rem; text-transform: uppercase; }
    td { padding: 16px; color: #e0e0e0; border-bottom: 1px solid rgba(0, 242, 254, 0.1); }
    .level-badge { background: rgba(102, 126, 234, 0.2); color: #667eea; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
    .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; background: rgba(156, 163, 175, 0.2); color: #9ca3af; }
    .status-badge.active { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-content { background: rgba(26, 26, 46, 0.98); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 16px; padding: 32px; width: 90%; max-width: 600px; }
    .form-grid { display: grid; gap: 16px; margin-bottom: 24px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-input, .form-select, .form-textarea { background: rgba(16, 18, 27, 0.8); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 8px; padding: 12px; color: #e0e0e0; width: 100%; }
    .modal-actions { display: flex; gap: 12px; justify-content: flex-end; }
    .btn-secondary { background: rgba(156, 163, 175, 0.2); color: #9ca3af; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; }
  `]
})
export class JobTitlesComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  jobTitles = signal<any[]>([]);
  organizations = signal<any[]>([]);
  departments = signal<any[]>([]);
  filteredDepartments = signal<any[]>([]);
  showModal = false;

  newTitle: any = {
    title: '',
    code: '',
    level: '',
    category: '',
    description: '',
    organizationId: null,
    departmentId: null
  };

  ngOnInit() {
    this.loadTitles();
    this.loadOrganizations();
    this.loadDepartments();
  }

  async loadOrganizations() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/organizations`).toPromise();
      this.organizations.set(res?.data || res || []);
    } catch {}
  }

  async loadDepartments() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/departments?adminReport=true&includeAll=true&pageSize=500`).toPromise();
      this.departments.set(res?.data || res || []);
    } catch {}
  }

  onOrgChange(orgId: number) {
    this.newTitle.departmentId = null;
    if (orgId) {
      this.filteredDepartments.set(this.departments().filter((d: any) => String(d.organizationId) === String(orgId)));
    } else {
      this.filteredDepartments.set([]);
    }
  }

  async loadTitles() {
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/job-titles`).toPromise();
      this.jobTitles.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load titles:', err);
    }
  }

  async createTitle() {
    if (!this.newTitle.title?.trim()) return;
    if (!this.newTitle.organizationId) return;

    try {
      await this.http.post(`${this.apiUrl}/api/v1/job-titles`, this.newTitle).toPromise();
      this.showModal = false;
      this.newTitle = { title: '', code: '', level: '', category: '', description: '', organizationId: null, departmentId: null };
      this.filteredDepartments.set([]);
      this.loadTitles();
    } catch (err) {
      console.error('Failed to create title:', err);
    }
  }
}
