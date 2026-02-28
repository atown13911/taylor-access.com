import { HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const SESSION_VERSION_KEY = 'vantac_session_version';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  
  
  // Skip adding Content-Type for FormData (file uploads) - let browser set it with boundary
  let clonedReq = req;
  const isFormData = req.body instanceof FormData;
  
  if (!isFormData) {
    clonedReq = req.clone({
      headers: req.headers
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
    });
  } else {
    // For FormData, only set Accept header, let browser handle Content-Type
    clonedReq = req.clone({
      headers: req.headers.set('Accept', 'application/json')
    });
  }
  
  // Add Authorization header if token exists
  if (token) {
    clonedReq = clonedReq.clone({
      headers: clonedReq.headers.set('Authorization', `Bearer ${token}`)
    });
  }
  
  return next(clonedReq).pipe(
    tap(event => {
      if (event instanceof HttpResponse && token) {
        const serverVersion = event.headers.get('X-Session-Version');
        if (serverVersion) {
          const storedVersion = localStorage.getItem(SESSION_VERSION_KEY);
          if (!storedVersion) {
            localStorage.setItem(SESSION_VERSION_KEY, serverVersion);
          } else if (storedVersion !== serverVersion) {
            localStorage.setItem(SESSION_VERSION_KEY, serverVersion);
            // Product owner is exempt from force logout
            const user = authService.currentUser();
            if (user?.role?.toLowerCase() !== 'product_owner') {
              authService.logout();
            }
          }
        }
      }
    }),
    catchError((error: HttpErrorResponse) => {
      // Handle 401 Unauthorized - only redirect if not already on login page
      // and if this is not a background/optional API call
      if (error.status === 401) {
        const currentUrl = router.url;
        const isLoginPage = currentUrl.includes('/login') || currentUrl === '/';
        const isOptionalEndpoint = req.url.includes('/notifications') || 
                                   req.url.includes('/organizations') ||
                                   req.url.includes('/setup/status') ||
                                   req.url.includes('/oauth/');
        const isOAuthPage = currentUrl.includes('/oauth/');
        
        if (!isLoginPage && !isOAuthPage && !isOptionalEndpoint) {
          console.warn('Unauthorized request - redirecting to login');
          authService.logout();
          router.navigate(['/login']);
        }
      }
      
      // Handle 403 Forbidden
      if (error.status === 403) {
        console.warn('Forbidden - insufficient permissions');
      }
      
      // Handle 500 Server Error
      if (error.status >= 500) {
        console.error('Server error:', error.message);
      }
      
      return throwError(() => error);
    })
  );
};
