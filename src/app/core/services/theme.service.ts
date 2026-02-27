import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly DARK_CLASS = 'tron-dark';
  private readonly STORAGE_KEY = 'tms-theme';
  
  isDark = signal(true); // Default to dark

  constructor() {
    // Auto-init on service creation
    this.init();
  }

  init(): void {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    // Default to dark if no preference saved
    if (saved === 'dark' || !saved) {
      this.enableDark();
    } else {
      this.disableDark();
    }
  }

  enableDark(): void {
    // Add class to both body and html for maximum coverage
    document.body.classList.add(this.DARK_CLASS);
    document.body.classList.add('mat-app-background');
    document.documentElement.classList.add(this.DARK_CLASS);
    
    // Also set inline styles as fallback
    document.body.style.backgroundColor = '#050508';
    document.body.style.color = '#e0f7ff';
    document.documentElement.style.backgroundColor = '#050508';
    
    localStorage.setItem(this.STORAGE_KEY, 'dark');
    this.isDark.set(true);
  }

  disableDark(): void {
    document.body.classList.remove(this.DARK_CLASS);
    document.documentElement.classList.remove(this.DARK_CLASS);
    
    document.body.style.backgroundColor = '#ffffff';
    document.body.style.color = '#1a1a1a';
    document.documentElement.style.backgroundColor = '#ffffff';
    
    localStorage.setItem(this.STORAGE_KEY, 'light');
    this.isDark.set(false);
  }

  toggle(): void {
    if (this.isDark()) {
      this.disableDark();
    } else {
      this.enableDark();
    }
  }
}
