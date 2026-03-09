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
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.userId || payload.sub) {
      sessionStorage.setItem(VALIDATED_KEY, 'true');
      return true;
    }
  } catch {}
  return false;
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = localStorage.getItem('vantac_token');
  // #region agent log
  console.log('[DEBUG-GUARD] token exists:', !!token, 'length:', token?.length);
  // #endregion
  if (!token || isTokenExpired(token)) {
    // #region agent log
    console.log('[DEBUG-GUARD] REJECTED: no token or expired. expired:', token ? isTokenExpired(token) : 'no token');
    // #endregion
    cleanup(auth, router);
    return false;
  }

  const valid = await validateTokenOnce(token);
  // #region agent log
  console.log('[DEBUG-GUARD] validateTokenOnce result:', valid);
  // #endregion
  if (!valid) {
    // #region agent log
    console.log('[DEBUG-GUARD] REJECTED: validation failed');
    // #endregion
    cleanup(auth, router);
    return false;
  }

  // #region agent log
  console.log('[DEBUG-GUARD] ALLOWED');
  // #endregion
  return true;
};

function cleanup(auth: AuthService, _router: Router) {
  sessionStorage.removeItem(VALIDATED_KEY);
  auth.logout();
  const params = new URLSearchParams(window.location.search);
  if (params.has('local')) {
    _router.navigate(['/login']);
  } else {
    window.location.href = 'https://tss-portal.com';
  }
}
