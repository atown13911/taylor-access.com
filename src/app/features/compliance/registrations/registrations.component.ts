import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { environment } from '../../../../environments/environment';
import { ConfirmService } from '../../../core/services/confirm.service';

interface Registration {
  id?: string;
  type: 'usdot' | 'mc_authority' | 'ucr' | 'irp';
  number: string;
  status: 'active' | 'pending' | 'expired' | 'suspended';
  issueDate: string;
  expirationDate: string;
  renewalDate?: string;
  organizationId: number;
  notes?: string;
  documents?: string[];
}

@Component({
  selector: 'app-registrations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './registrations.component.html',
  styleUrls: ['./registrations.component.scss']
})
export class RegistrationsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private userSettings = inject(UserSettingsService);
  private confirm = inject(ConfirmService);
  
  loading = signal(false);
  registrations = signal<Registration[]>([]);
  showAddModal = signal(false);
  showDetailsModal = signal(false);
  selectedRegistration = signal<Registration | null>(null);
  saving = signal(false);
  
  formData: Registration = {
    type: 'usdot',
    number: '',
    status: 'active',
    issueDate: '',
    expirationDate: '',
    organizationId: 1,
    notes: ''
  };
  
  registrationTypes = [
    { value: 'usdot', label: 'USDOT Number', icon: 'bx-id-card', color: '#00d4ff', desc: 'Required for interstate commerce - Biennial renewal' },
    { value: 'mc_authority', label: 'MC Authority', icon: 'bx-shield-alt-2', color: '#a855f7', desc: 'Operating authority for for-hire carriers' },
    { value: 'ucr', label: 'UCR Registration', icon: 'bx-receipt', color: '#ffaa00', desc: 'Annual fee-based registration - All states' },
    { value: 'irp', label: 'IRP (Cab Card)', icon: 'bx-car', color: '#00ff88', desc: 'Apportioned registration - Multi-state operations' }
  ];
  
  ngOnInit() {
    this.loadRegistrations();
  }
  
  async loadRegistrations() {
    this.loading.set(true);
    try {
      const response: any = await this.http.get(`${environment.apiUrl}/api/v1/compliance/registrations`).toPromise();
      this.registrations.set(response?.data || []);
    } catch (err) {
      console.error('Failed to load registrations:', err);
      const stored = this.userSettings.getSync('vantac_registrations');
      if (stored) {
        this.registrations.set(JSON.parse(stored));
      }
    } finally {
      this.loading.set(false);
    }
  }
  
  openAddModal() {
    this.formData = {
      type: 'usdot',
      number: '',
      status: 'active',
      issueDate: new Date().toISOString().split('T')[0],
      expirationDate: '',
      organizationId: 1,
      notes: ''
    };
    this.showAddModal.set(true);
  }
  
  openAddModalWithType(type: string) {
    this.formData = {
      type: type as 'usdot' | 'mc_authority' | 'ucr' | 'irp',
      number: '',
      status: 'active',
      issueDate: new Date().toISOString().split('T')[0],
      expirationDate: '',
      organizationId: 1,
      notes: ''
    };
    this.showAddModal.set(true);
  }
  
  closeAddModal() {
    this.showAddModal.set(false);
  }
  
  async saveRegistration() {
    if (!this.formData.number || !this.formData.expirationDate) {
      this.toast.error('Please fill in required fields', 'Validation Error');
      return;
    }
    
    this.saving.set(true);
    try {
      const newReg: Registration = {
        ...this.formData,
        id: Date.now().toString()
      };
      
      const current = this.registrations();
      current.push(newReg);
      this.registrations.set([...current]);
      this.userSettings.set('vantac_registrations', current).subscribe();
      
      this.toast.success('Registration added successfully', 'Success');
      this.closeAddModal();
    } catch (err) {
      this.toast.error('Failed to save registration', 'Error');
    } finally {
      this.saving.set(false);
    }
  }
  
  viewDetails(registration: Registration) {
    this.selectedRegistration.set(registration);
    this.showDetailsModal.set(true);
  }
  
  closeDetailsModal() {
    this.showDetailsModal.set(false);
    this.selectedRegistration.set(null);
  }
  
  async deleteRegistration(registration: Registration) {
    const ok = await this.confirm.show({ message: `Delete ${this.getTypeName(registration.type)} registration ${registration.number}?`, type: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    
    const updated = this.registrations().filter(r => r.id !== registration.id);
    this.registrations.set(updated);
    this.userSettings.set('vantac_registrations', updated).subscribe();
    this.toast.success('Registration deleted', 'Success');
  }
  
  getTypeName(type: string): string {
    const typeObj = this.registrationTypes.find(t => t.value === type);
    return typeObj?.label || type;
  }
  
  getTypeIcon(type: string): string {
    const typeObj = this.registrationTypes.find(t => t.value === type);
    return typeObj?.icon || 'bx-file';
  }
  
  getTypeColor(type: string): string {
    const typeObj = this.registrationTypes.find(t => t.value === type);
    return typeObj?.color || '#00d4ff';
  }
  
  getDaysUntilExpiration(expirationDate: string): number {
    const exp = new Date(expirationDate);
    const now = new Date();
    const diff = exp.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
  
  getExpirationStatus(expirationDate: string): 'valid' | 'expiring' | 'expired' {
    const days = this.getDaysUntilExpiration(expirationDate);
    if (days < 0) return 'expired';
    if (days < 60) return 'expiring';
    return 'valid';
  }
  
  getRenewalFrequency(type: string): string {
    const frequencies: Record<string, string> = {
      'usdot': 'Biennial (every 2 years)',
      'mc_authority': 'No renewal required',
      'ucr': 'Annual (yearly)',
      'irp': 'Annual (yearly)'
    };
    return frequencies[type] || 'Variable';
  }
  
  getRegistrationsByType(type: string): Registration[] {
    return this.registrations().filter(r => r.type === type);
  }
}
