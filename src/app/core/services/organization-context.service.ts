import { Injectable, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class OrganizationContextService {
  private authService = inject(AuthService);
  private selectedOrgId = signal<number | null>(null);

  constructor() {
    // Load from localStorage (needed for persistence across reload)
    const savedOrgId = localStorage.getItem('selectedOrganizationId');
    if (savedOrgId) {
      this.selectedOrgId.set(parseInt(savedOrgId));
      console.log('🔧 OrganizationContext restored from localStorage:', savedOrgId);
    } else {
      console.log('🔧 OrganizationContext initialized - no saved selection');
    }
  }

  setOrganization(orgId: number): void {
    this.selectedOrgId.set(orgId);
    localStorage.setItem('selectedOrganizationId', orgId.toString());
    console.log('✅ OrganizationContext set to:', orgId, '(saved to localStorage)');
  }
  
  clearOrganization(): void {
    this.selectedOrgId.set(null);
    localStorage.removeItem('selectedOrganizationId');
  }

  getOrganizationId(): number | null {
    return this.selectedOrgId();
  }

  /**
   * Adds organizationId query parameter to URL if an organization is selected
   * and user is product_owner/superadmin (can view cross-org data)
   */
  addOrgParam(url: string): string {
    const orgId = this.selectedOrgId();
    console.log('🔍 addOrgParam called - selectedOrgId:', orgId);
    
    if (!orgId) {
      console.log('⚠️ No org selected - returning URL unchanged');
      return url;
    }

    // Get user from AuthService (more reliable than localStorage)
    const currentUser = this.authService.currentUser();
    const userOrgId = currentUser?.organizationId;
    
    console.log('👤 User org:', userOrgId, '- Selected org:', orgId);
    
    // If user is viewing their own organization, don't add parameter (backend defaults to it)
    const userOrgIdNum = typeof userOrgId === 'string' ? parseInt(userOrgId) : userOrgId;
    if (userOrgIdNum === orgId) {
      console.log('ℹ️ Viewing own organization - using default filtering');
      return url;
    }

    // User is trying to view a DIFFERENT organization - add parameter
    // Backend will check if user has permission
    const separator = url.includes('?') ? '&' : '?';
    const newUrl = `${url}${separator}organizationId=${orgId}`;
    console.log('✅ Adding org param for cross-org access - New URL:', newUrl);
    return newUrl;
  }
}
