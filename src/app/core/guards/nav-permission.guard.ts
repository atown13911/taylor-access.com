import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { NavPermissionService } from '../services/nav-permission.service';

export const navPermissionGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const navPermission = inject(NavPermissionService);

  const user = authService.currentUser();
  if (!user) {
    authService.logout();
    return false;
  }

  const currentPath = '/' + (route.routeConfig?.path || '');
  if (navPermission.canAccessRoute(
    currentPath,
    authService.getEffectiveRole(),
    authService.permissions(),
    authService.getEffectiveRoles()
  )) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
