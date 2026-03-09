import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ALL_NAV_ITEMS } from '../constants/nav-items';

export const navPermissionGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.currentUser();
  const userRole = user?.role?.toLowerCase();

  if (!user) {
    inject(AuthService).logout();
    return false;
  }

  // Product owner, superadmin, and admin can access everything
  if (userRole === 'product_owner' || userRole === 'superadmin') {
    return true;
  }

  const permissions = authService.permissions();

  // admin:full grants everything
  if (permissions.includes('admin:full')) {
    return true;
  }

  // Dashboard, profile, and settings are always accessible
  const currentPath = '/' + (route.routeConfig?.path || '');
  const alwaysAllowed = ['/dashboard', '/', '/profile', '/settings/2fa', '/hr/my-profile'];
  if (alwaysAllowed.includes(currentPath)) {
    return true;
  }

  // Find the nav item for this route and check its required permission
  const navItem = ALL_NAV_ITEMS.find(item => item.route === currentPath);
  if (navItem?.permission) {
    return permissions.includes(navItem.permission);
  }

  // Legacy nav: permissions support
  const navPerms = permissions.filter(p => p.startsWith('nav:') && p !== 'nav:configured');
  if (navPerms.length > 0) {
    const allowedRoutes = new Set(navPerms.map(p => p.substring(4)));
    if (allowedRoutes.has(currentPath)) return true;
  }

  // No permission defined for this route — allow by default
  if (!navItem?.permission) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
