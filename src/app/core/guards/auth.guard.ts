import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

const VALIDATED_KEY = 'access_token_validated';

function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!decoded.exp) return false;
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

async function validateTokenOnce(token: string): Promise<boolean> {
  if (sessionStorage.getItem(VALIDATED_KEY) === 'true') return true;
  try {
    const res = await fetch('https://taylor-accesscom-production.up.railway.app/oauth/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { sessionStorage.setItem(VALIDATED_KEY, 'true'); return true; }
  } catch {}
  return false;
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = localStorage.getItem('vantac_token');
  if (!token || isTokenExpired(token)) {
    cleanup(auth, router);
    return false;
  }

  const valid = await validateTokenOnce(token);
  if (!valid) {
    cleanup(auth, router);
    return false;
  }

  return true;
};

function cleanup(auth: AuthService, router: Router) {
  sessionStorage.removeItem(VALIDATED_KEY);
  auth.logout();
  router.navigate(['/login']);
}
