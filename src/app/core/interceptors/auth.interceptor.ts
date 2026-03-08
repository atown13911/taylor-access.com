import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  let clonedReq = req;
  const isFormData = req.body instanceof FormData;

  if (!isFormData) {
    clonedReq = req.clone({
      headers: req.headers
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
    });
  } else {
    clonedReq = req.clone({
      headers: req.headers.set('Accept', 'application/json')
    });
  }

  if (token) {
    clonedReq = clonedReq.clone({
      headers: clonedReq.headers.set('Authorization', `Bearer ${token}`)
    });
  }

  return next(clonedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        const currentUrl = router.url;
        const isPublicPage = currentUrl.includes('/login') ||
                             currentUrl.includes('/callback') ||
                             currentUrl.includes('/oauth/');

        if (!isPublicPage) {
          console.warn('Token expired or invalid — redirecting to portal');
          authService.logout();
        }
      }

      return throwError(() => error);
    })
  );
};
