import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

const VALIDATED_KEY = 'access_token_validated';
const SPA_REDIRECT_KEY = 'spa_redirect';

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
    const res = await fetch(`${environment.portalApiUrl}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { sessionStorage.setItem(VALIDATED_KEY, 'true'); return true; }
  } catch {}
  return false;
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const pendingRedirect = sessionStorage.getItem(SPA_REDIRECT_KEY);
  const token = localStorage.getItem('vantac_token');

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a50aa21d-15aa-4850-852f-91d136237950',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.guard.ts:entry',message:'Auth guard fired',data:{pendingRedirect:pendingRedirect,hasToken:!!token,tokenExpired:token?isTokenExpired(token):null,validated:sessionStorage.getItem(VALIDATED_KEY),url:window.location.href},timestamp:Date.now(),hypothesisId:'A,C'})}).catch(()=>{});
  // #endregion

  if (pendingRedirect?.startsWith('/callback')) {
    sessionStorage.removeItem(SPA_REDIRECT_KEY);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a50aa21d-15aa-4850-852f-91d136237950',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.guard.ts:redirect',message:'Redirecting to callback',data:{pendingRedirect:pendingRedirect},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    router.navigateByUrl(pendingRedirect);
    return false;
  }

  if (!token || isTokenExpired(token)) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a50aa21d-15aa-4850-852f-91d136237950',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.guard.ts:no-token',message:'No valid token, logging out',data:{hasToken:!!token,expired:token?isTokenExpired(token):null},timestamp:Date.now(),hypothesisId:'A,E'}),keepalive:true}).catch(()=>{});
    // #endregion
    cleanup(auth);
    return false;
  }

  const valid = await validateTokenOnce(token);
  if (!valid) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a50aa21d-15aa-4850-852f-91d136237950',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.guard.ts:invalid-token',message:'Token validation failed',data:{},timestamp:Date.now(),hypothesisId:'E'}),keepalive:true}).catch(()=>{});
    // #endregion
    cleanup(auth);
    return false;
  }

  return true;
};

function cleanup(auth: AuthService) {
  sessionStorage.removeItem(VALIDATED_KEY);
  auth.logout();
}
