import { ApplicationConfig } from '@angular/core';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

const CHUNK_RELOAD_GUARD_KEY = 'ta_chunk_reload_once';

function handleNavigationError(error: unknown): void {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  const isChunkFailure =
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('loading chunk') ||
    message.includes('chunkloaderror');

  if (!isChunkFailure || typeof window === 'undefined') {
    return;
  }

  const hasReloaded = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1';
  if (hasReloaded) {
    return;
  }

  sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
  const cacheBustedUrl = new URL(window.location.href);
  cacheBustedUrl.searchParams.set('v', Date.now().toString());
  window.location.replace(cacheBustedUrl.toString());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withNavigationErrorHandler(handleNavigationError)),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations()
  ]
};
