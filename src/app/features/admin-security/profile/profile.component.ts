import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
  jobTitle?: string;
  department?: string;
  createdAt?: string;
  lastLoginAt?: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private api = inject(VanTacApiService);
  private toast = inject(ToastService);

  // Profile data
  profile = signal<UserProfile | null>(null);
  loading = signal(true);
  saving = signal(false);

  // Active tab
  activeTab = signal<'profile' | 'security' | 'preferences'>('profile');

  // Profile form
  profileForm = {
    name: '',
    email: '',
    phone: '',
    jobTitle: '',
    department: '',
    timezone: 'America/Chicago',
    language: 'en'
  };

  // Password form
  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  changingPassword = signal(false);
  showCurrentPassword = signal(false);
  showNewPassword = signal(false);
  showConfirmPassword = signal(false);

  // Avatar
  avatarPreview = signal<string | null>(null);
  selectedAvatarFile: File | null = null;
  uploadingAvatar = signal(false);

  // Timezone options
  timezones = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
    { value: 'UTC', label: 'UTC' }
  ];

  // Language options
  languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' }
  ];

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.loading.set(true);
    const currentUser = this.authService.currentUser();
    
    if (currentUser) {
      // Use current user data from auth service
      const userProfile: UserProfile = {
        id: currentUser.id,
        name: currentUser.name || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        role: currentUser.role || 'user',
        status: currentUser.status || 'active',
        avatarUrl: currentUser.avatarUrl || currentUser.avatar,
        timezone: currentUser.timezone || 'America/Chicago',
        language: currentUser.language || 'en',
        jobTitle: currentUser.jobTitle || '',
        department: currentUser.department || '',
        createdAt: currentUser.createdAt,
        lastLoginAt: currentUser.lastLoginAt
      };
      
      this.profile.set(userProfile);
      this.populateForm(userProfile);
      this.loading.set(false);
    }

    // Also try to fetch fresh data from API
    this.api.getMe().subscribe({
      next: (res: any) => {
        const userData = res?.data || res;
        if (userData) {
          const userProfile: UserProfile = {
            id: userData.id || userData.Id,
            name: userData.name || userData.Name || '',
            email: userData.email || userData.Email || '',
            phone: userData.phone || userData.Phone || '',
            role: userData.role || userData.Role || 'user',
            status: userData.status || userData.Status || 'active',
            avatarUrl: userData.avatarUrl || userData.AvatarUrl,
            timezone: userData.timezone || userData.Timezone || 'America/Chicago',
            language: userData.language || userData.Language || 'en',
            jobTitle: userData.jobTitle || userData.JobTitle || '',
            department: userData.department || userData.Department || '',
            createdAt: userData.createdAt || userData.CreatedAt,
            lastLoginAt: userData.lastLoginAt || userData.LastLoginAt
          };
          
          this.profile.set(userProfile);
          this.populateForm(userProfile);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  populateForm(profile: UserProfile): void {
    this.profileForm = {
      name: profile.name,
      email: profile.email,
      phone: profile.phone || '',
      jobTitle: profile.jobTitle || '',
      department: profile.department || '',
      timezone: profile.timezone || 'America/Chicago',
      language: profile.language || 'en'
    };
    
    // Set avatar preview if available
    if (profile.avatarUrl) {
      // Base64 data URLs and HTTP URLs use as-is
      if (profile.avatarUrl.startsWith('data:') || profile.avatarUrl.startsWith('http')) {
        this.avatarPreview.set(profile.avatarUrl);
      } else {
        // Legacy file path (shouldn't exist after base64 migration)
        this.avatarPreview.set(`${environment.apiUrl}${profile.avatarUrl}`);
      }
    } else {
      this.avatarPreview.set(null);
    }
  }

  setActiveTab(tab: 'profile' | 'security' | 'preferences'): void {
    this.activeTab.set(tab);
  }

  // Profile Methods
  saveProfile(): void {
    if (!this.profileForm.name || !this.profileForm.email) {
      this.toast.error('Name and email are required', 'Validation Error');
      return;
    }

    this.saving.set(true);
    
    const profileData = {
      Name: this.profileForm.name,
      Email: this.profileForm.email,
      Phone: this.profileForm.phone || null,
      JobTitle: this.profileForm.jobTitle || null,
      Department: this.profileForm.department || null,
      Timezone: this.profileForm.timezone,
      Language: this.profileForm.language
    };

    this.api.updateProfile(profileData).subscribe({
      next: (res: any) => {
        this.toast.success('Profile updated successfully', 'Success');
        
        // Update local auth state
        const updatedUser = {
          ...this.authService.currentUser(),
          name: this.profileForm.name,
          email: this.profileForm.email,
          phone: this.profileForm.phone,
          jobTitle: this.profileForm.jobTitle,
          department: this.profileForm.department,
          timezone: this.profileForm.timezone,
          language: this.profileForm.language
        };
        localStorage.setItem('vantac_user', JSON.stringify(updatedUser));
        
        this.saving.set(false);
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to update profile', 'Error');
        this.saving.set(false);
      }
    });
  }

  // Avatar Methods
  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedAvatarFile = input.files[0];
      
      // Preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.avatarPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(this.selectedAvatarFile);
    }
  }

  uploadAvatar(): void {
    if (!this.selectedAvatarFile) return;

    this.uploadingAvatar.set(true);
    
    // Keep current preview before clearing file
    const currentPreview = this.avatarPreview();
    
    const formData = new FormData();
    formData.append('avatar', this.selectedAvatarFile);

    this.api.uploadAvatar(formData).subscribe({
      next: (res: any) => {
        this.toast.success('Profile photo updated', 'Success');
        this.uploadingAvatar.set(false);
        
        // Update avatar URL in profile - check all possible response formats
        const avatarUrl = res?.avatarUrl || res?.AvatarUrl || res?.avatar || res?.Avatar;
        
        if (avatarUrl) {
          // Base64 data URLs use as-is (no transformation needed)
          this.avatarPreview.set(avatarUrl);
          
          // Update the profile object too
          const currentProfile = this.profile();
          if (currentProfile) {
            this.profile.set({ ...currentProfile, avatarUrl: avatarUrl });
          }
          
          // Update auth service so sidebar avatar updates too
          this.authService.updateUserAvatar(avatarUrl);
        } else {
          console.warn('No avatarUrl in response, keeping current preview:', currentPreview);
          // Keep the data: URL preview if server didn't return a URL
          if (currentPreview) {
            this.avatarPreview.set(currentPreview);
          }
        }
        
        this.selectedAvatarFile = null;
      },
      error: (err) => {
        console.error('Avatar upload FAILED:', err);
        console.error('Error details:', JSON.stringify(err.error));
        this.toast.error(err.error?.error || err.error?.message || 'Failed to upload photo', 'Error');
        this.uploadingAvatar.set(false);
        // Keep the preview on error
        if (currentPreview) {
          this.avatarPreview.set(currentPreview);
        }
      }
    });
  }

  removeAvatar(): void {
    this.api.deleteAvatar().subscribe({
      next: () => {
        this.toast.success('Profile photo removed', 'Success');
        this.avatarPreview.set(null);
        this.selectedAvatarFile = null;
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to remove photo', 'Error');
      }
    });
  }

  // Password Methods
  changePassword(): void {
    // Validation
    if (!this.passwordForm.currentPassword) {
      this.toast.error('Current password is required', 'Validation Error');
      return;
    }
    
    if (!this.passwordForm.newPassword) {
      this.toast.error('New password is required', 'Validation Error');
      return;
    }
    
    if (this.passwordForm.newPassword.length < 8) {
      this.toast.error('Password must be at least 8 characters', 'Validation Error');
      return;
    }
    
    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.toast.error('Passwords do not match', 'Validation Error');
      return;
    }

    this.changingPassword.set(true);

    this.api.changePassword({
      CurrentPassword: this.passwordForm.currentPassword,
      NewPassword: this.passwordForm.newPassword,
      ConfirmPassword: this.passwordForm.confirmPassword
    }).subscribe({
      next: () => {
        this.toast.success('Password changed successfully', 'Success');
        this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
        this.changingPassword.set(false);
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to change password', 'Error');
        this.changingPassword.set(false);
      }
    });
  }

  togglePasswordVisibility(field: 'current' | 'new' | 'confirm'): void {
    if (field === 'current') {
      this.showCurrentPassword.update(v => !v);
    } else if (field === 'new') {
      this.showNewPassword.update(v => !v);
    } else {
      this.showConfirmPassword.update(v => !v);
    }
  }

  // Utility Methods
  getInitials(): string {
    const name = this.profile()?.name || '';
    return name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);
  }

  onAvatarError(): void {
    console.warn('Avatar image failed to load, showing placeholder');
    this.avatarPreview.set(null);
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getRoleBadgeClass(): string {
    const role = this.profile()?.role?.toLowerCase();
    if (role === 'product_owner') return 'role-owner';
    if (role === 'superadmin' || role === 'admin') return 'role-admin';
    if (role === 'manager') return 'role-manager';
    return 'role-user';
  }
}



