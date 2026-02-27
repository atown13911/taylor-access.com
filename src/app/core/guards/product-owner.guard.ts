import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const productOwnerGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.currentUser();
  if (user?.role === 'product_owner' || user?.role === 'superadmin') {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
