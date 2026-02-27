import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExtendedApiService, UserInvitation, CreateInvitationRequest } from '../../../../core/services/extended-api.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-invite-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invite-users.component.html',
  styleUrls: ['./invite-users.component.scss']
})
export class InviteUsersComponent implements OnInit {
  private api = inject(ExtendedApiService);
  private toast = inject(ToastService);

  invitations = signal<UserInvitation[]>([]);
  loading = signal(true);
  sending = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  newInvite: CreateInvitationRequest = {
    email: '',
    name: '',
    roleId: '',
    personalMessage: ''
  };

  ngOnInit(): void {
    this.loadInvitations();
  }

  async loadInvitations() {
    this.loading.set(true);
    try {
      const response = await this.api.getInvitations(undefined, 50).toPromise();
      this.invitations.set(response?.data || []);
    } catch {
      this.invitations.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async sendInvitation() {
    if (!this.newInvite.email) {
      this.errorMessage.set('Email is required');
      return;
    }

    this.sending.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    try {
      const response = await this.api.createInvitation(this.newInvite).toPromise();
      this.successMessage.set(response?.message || 'Invitation sent successfully!');
      this.newInvite = { email: '', name: '', roleId: '', personalMessage: '' };
      this.loadInvitations();
    } catch (err: any) {
      this.errorMessage.set(err.error?.message || 'Failed to send invitation');
    } finally {
      this.sending.set(false);
    }
  }

  async resendInvitation(id: string) {
    try {
      await this.api.resendInvitation(id).toPromise();
      this.loadInvitations();
    } catch (err: any) {
      this.toast.error(err.error?.message || 'Failed to resend invitation', 'Error');
    }
  }

  async revokeInvitation(id: string) {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;

    try {
      await this.api.revokeInvitation(id).toPromise();
      this.loadInvitations();
    } catch (err: any) {
      this.toast.error(err.error?.message || 'Failed to revoke invitation', 'Error');
    }
  }
}
