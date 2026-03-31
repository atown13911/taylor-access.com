import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const navPermissionGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.currentUser();
  const userRole = user?.role?.toLowerCase();

  // Product owner and superadmin can access everything
  if (userRole === 'product_owner' || userRole === 'superadmin') {
    return true;
  }

  if (!user) {
    inject(AuthService).logout();
    return false;
  }

  // Check nav permissions
  const permissions = authService.permissions();
  const navPerms = permissions.filter(p => p.startsWith('nav:') && p !== 'nav:configured');

  // If no nav permissions configured, allow access (open by default)
  if (navPerms.length === 0) {
    return true;
  }

  // Check if the current route is in the allowed nav routes
  const currentPath = '/' + (route.routeConfig?.path || '');
  const allowedRoutes = new Set(navPerms.map(p => p.substring(4)));

  if (allowedRoutes.has(currentPath)) {
    return true;
  }

  // Support section-level nav grants like "nav:compliance" for "/compliance/*" routes.
  const sectionAllowed = Array.from(allowedRoutes).some((route) => {
    const normalized = String(route || '').trim();
    if (!normalized) return false;
    if (!normalized.startsWith('/')) {
      return currentPath.startsWith(`/${normalized}/`) || currentPath === `/${normalized}`;
    }
    return currentPath.startsWith(`${normalized}/`) || currentPath === normalized;
  });
  if (sectionAllowed) {
    return true;
  }

  // Dashboard, profile, and settings are always accessible
  const alwaysAllowed = [
    '/dashboard', '/', '/profile', '/settings', '/settings/2fa',
    '/hr/my-profile', '/satellites', '/finance/vendor-invoicing',
    '/structure', '/organizations', '/users', '/compliance/tags-permits'
  ];
  if (alwaysAllowed.includes(currentPath)) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
