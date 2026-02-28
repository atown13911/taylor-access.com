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
  activeTab = signal<'profile' | 'security' | 'preferences' | 'style'>('profile');

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

  setActiveTab(tab: 'profile' | 'security' | 'preferences' | 'style'): void {
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

  // ============ STYLE TAB ============

  selectedTheme = signal(localStorage.getItem('ta_theme') || 'tron-dark');
  selectedAccent = signal(localStorage.getItem('ta_accent') || 'Cyan');
  selectedFontSize = signal(localStorage.getItem('ta_font_size') || 'medium');

  themes = [
    { id: 'tron-dark', name: 'TRON Dark', description: 'Deep black with neon cyan glow', bg: '#050508', sidebar: '#0d0d1a', topbar: '#08080f', accent: '#00d4ff' },
    { id: 'midnight', name: 'Midnight', description: 'Deep navy blue tones', bg: '#0a0e1a', sidebar: '#0d1225', topbar: '#080c18', accent: '#4a90d9' },
    { id: 'carbon', name: 'Carbon', description: 'Neutral dark gray', bg: '#1a1a1a', sidebar: '#222222', topbar: '#181818', accent: '#00d4ff' },
    { id: 'dark-emerald', name: 'Dark Emerald', description: 'Dark with green accents', bg: '#0a100e', sidebar: '#0d1812', topbar: '#080f0c', accent: '#00ff88' },
    { id: 'obsidian', name: 'Obsidian', description: 'Pure black minimal', bg: '#000000', sidebar: '#0a0a0a', topbar: '#050505', accent: '#ffffff' },
    { id: 'dark-purple', name: 'Nebula', description: 'Dark with purple accents', bg: '#0e0a14', sidebar: '#150d1e', topbar: '#0a0810', accent: '#a855f7' },
    { id: 'dark-red', name: 'Crimson', description: 'Dark with red accents', bg: '#100a0a', sidebar: '#1a0d0d', topbar: '#0f0808', accent: '#ff2a6d' },
    { id: 'dark-orange', name: 'Blaze', description: 'Dark with warm orange', bg: '#100e0a', sidebar: '#1a150d', topbar: '#0f0c08', accent: '#ff6b35' },
  ];

  accentColors = [
    { name: 'Cyan', value: '#00d4ff' },
    { name: 'Blue', value: '#0080ff' },
    { name: 'Green', value: '#00ff88' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Red', value: '#ff2a6d' },
    { name: 'Orange', value: '#ff6b35' },
    { name: 'Yellow', value: '#fbbf24' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'White', value: '#ffffff' },
  ];

  fontSizes = [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' },
  ];

  selectedBg = signal(localStorage.getItem('ta_bg') || 'none');

  backgrounds = [
    { id: 'grid-cyan', name: 'Cyber Grid', url: 'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=400&q=60' },
    { id: 'space', name: 'Deep Space', url: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=400&q=60' },
    { id: 'nebula', name: 'Nebula', url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=400&q=60' },
    { id: 'mountain', name: 'Mountain', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&q=60' },
    { id: 'city', name: 'City Night', url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=400&q=60' },
    { id: 'abstract', name: 'Abstract', url: 'https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=400&q=60' },
    { id: 'ocean', name: 'Ocean', url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=400&q=60' },
    { id: 'forest', name: 'Dark Forest', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=60' },
  ];

  selectBackground(id: string) {
    this.selectedBg.set(id);
    localStorage.setItem('ta_bg', id);

    const contentArea = document.querySelector('.content-area') as HTMLElement;
    if (!contentArea) return;

    if (id === 'none') {
      contentArea.style.backgroundImage = 'none';
      return;
    }

    if (id === 'custom') {
      const custom = localStorage.getItem('ta_bg_custom');
      if (custom) contentArea.style.backgroundImage = `url(${custom})`;
      return;
    }

    const bg = this.backgrounds.find(b => b.id === id);
    if (bg) {
      const hiRes = bg.url.replace('w=400&q=60', 'w=1920&q=80');
      contentArea.style.backgroundImage = `linear-gradient(rgba(5,5,8,0.85), rgba(5,5,8,0.92)), url(${hiRes})`;
      contentArea.style.backgroundSize = 'cover';
      contentArea.style.backgroundPosition = 'center';
      contentArea.style.backgroundAttachment = 'fixed';
    }
  }

  uploadBackground(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const dataUrl = e.target.result;
      localStorage.setItem('ta_bg_custom', dataUrl);
      localStorage.setItem('ta_bg', 'custom');
      this.selectedBg.set('custom');

      const contentArea = document.querySelector('.content-area') as HTMLElement;
      if (contentArea) {
        contentArea.style.backgroundImage = `linear-gradient(rgba(5,5,8,0.85), rgba(5,5,8,0.92)), url(${dataUrl})`;
        contentArea.style.backgroundSize = 'cover';
        contentArea.style.backgroundPosition = 'center';
      }
      this.toast.success('Background uploaded');
    };
    reader.readAsDataURL(file);
  }

  selectTheme(id: string) {
    this.selectedTheme.set(id);
    const theme = this.themes.find(t => t.id === id);
    if (theme) {
      document.documentElement.style.setProperty('--bg-primary', theme.bg);
      document.documentElement.style.setProperty('--bg-secondary', theme.sidebar);
      document.documentElement.style.setProperty('--bg-card', theme.sidebar);
      document.documentElement.style.setProperty('--bg-elevated', theme.sidebar);
      document.body.style.background = theme.bg;
    }
    localStorage.setItem('ta_theme', id);
  }

  selectAccent(name: string) {
    this.selectedAccent.set(name);
    const color = this.accentColors.find(c => c.name === name);
    if (color) {
      document.documentElement.style.setProperty('--cyan', color.value);
      document.documentElement.style.setProperty('--cyan-bright', color.value);
      document.documentElement.style.setProperty('--border-color', `${color.value}26`);
      document.documentElement.style.setProperty('--border-bright', `${color.value}4d`);
      document.documentElement.style.setProperty('--accent-10', `${color.value}1a`);
      document.documentElement.style.setProperty('--accent-15', `${color.value}26`);
      document.documentElement.style.setProperty('--accent-20', `${color.value}33`);
    }
    localStorage.setItem('ta_accent', name);
  }

  selectFontSize(size: string) {
    this.selectedFontSize.set(size);
    const sizes: any = { small: '13px', medium: '14px', large: '16px' };
    document.documentElement.style.fontSize = sizes[size] || '14px';
    localStorage.setItem('ta_font_size', size);
  }

  saveStylePreferences() {
    localStorage.setItem('ta_theme', this.selectedTheme());
    localStorage.setItem('ta_accent', this.selectedAccent());
    localStorage.setItem('ta_font_size', this.selectedFontSize());

    const accent = this.accentColors.find(c => c.name === this.selectedAccent());
    if (accent) {
      document.documentElement.style.setProperty('--cyan', accent.value);
    }

    const theme = this.themes.find(t => t.id === this.selectedTheme());
    if (theme) {
      document.documentElement.style.setProperty('--bg-primary', theme.bg);
      document.documentElement.style.setProperty('--bg-secondary', theme.sidebar);
    }

    this.toast.success('Style preferences saved');
  }
}



