import { Injectable, inject, ErrorHandler } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, NavigationEnd, NavigationStart } from '@angular/router';
import { environment } from '../../../environments/environment';
import { filter } from 'rxjs/operators';

export interface TrackingEvent {
  eventType: string;
  elementId?: string;
  elementClass?: string;
  elementText?: string;
  elementType?: string;
  pageUrl?: string;
  pageTitle?: string;
  route?: string;
  x?: number;
  y?: number;
  target?: string;
  sessionId?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  metadata?: Record<string, any>;
}

// Keep backward compatibility
export type ClickEvent = TrackingEvent;

/**
 * Enhanced Event Tracking Service
 * Tracks: clicks, page views, time-on-page, sessions, errors, forms, scroll depth, focus/blur
 */
@Injectable({
  providedIn: 'root'
})
export class EventTrackingService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = environment.apiUrl;
  private sessionId: string;
  private eventQueue: TrackingEvent[] = [];
  private batchSize = 10;
  private flushInterval = 5000;
  private enabled = true;

  // Session tracking
  private sessionStartTime = Date.now();
  private pageEnterTime = Date.now();
  private currentRoute = '';
  private isTabVisible = true;
  private activeTime = 0;
  private lastActiveTimestamp = Date.now();

  // Scroll tracking
  private maxScrollDepth = 0;
  private scrollTracked = false;

  // Idle detection
  private idleTimeout = 60000; // 1 minute
  private lastActivity = Date.now();
  private isIdle = false;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();

    if (this.enabled && typeof window !== 'undefined') {
      this.initializeTracking();
      this.startBatchFlush();
      this.trackSessionStart();
    }
  }

  private getOrCreateSessionId(): string {
    // Reuse session if within 30 min
    const stored = sessionStorage.getItem('vt_session');
    const storedTime = sessionStorage.getItem('vt_session_time');
    if (stored && storedTime && (Date.now() - parseInt(storedTime)) < 1800000) {
      sessionStorage.setItem('vt_session_time', Date.now().toString());
      return stored;
    }
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('vt_session', id);
    sessionStorage.setItem('vt_session_time', Date.now().toString());
    return id;
  }

  private initializeTracking() {
    // Page navigation
    this.router.events.pipe(
      filter(event => event instanceof NavigationStart)
    ).subscribe(() => {
      this.trackPageExit();
    });

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.trackPageEnter(event.urlAfterRedirects);
    });

    // Click listener
    document.addEventListener('click', (e) => this.handleClick(e), true);

    // Scroll depth
    window.addEventListener('scroll', () => this.handleScroll(), { passive: true });

    // Tab visibility (focus/blur)
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    window.addEventListener('focus', () => this.handleWindowFocus());
    window.addEventListener('blur', () => this.handleWindowBlur());

    // Form interactions
    document.addEventListener('focusin', (e) => this.handleFormFocus(e));
    document.addEventListener('change', (e) => this.handleFormChange(e));
    document.addEventListener('submit', (e) => this.handleFormSubmit(e));

    // Error tracking
    window.addEventListener('error', (e) => this.handleJsError(e));
    window.addEventListener('unhandledrejection', (e) => this.handlePromiseRejection(e));

    // Activity detection (for idle tracking)
    ['mousemove', 'keydown', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, () => this.recordActivity(), { passive: true });
    });

    // Page unload -- flush + session end
    window.addEventListener('beforeunload', () => {
      this.trackPageExit();
      this.trackSessionEnd();
      this.flushEvents();
    });

    // Idle check every 30s
    setInterval(() => this.checkIdle(), 30000);
  }

  // ========== CLICK TRACKING ==========

  private handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (this.shouldIgnoreElement(target)) return;

    const clickEvent: TrackingEvent = {
      eventType: 'click',
      elementId: target.id || undefined,
      elementClass: (typeof target.className === 'string' ? target.className : '').substring(0, 200) || undefined,
      elementText: this.getElementText(target),
      elementType: target.tagName?.toLowerCase(),
      pageUrl: window.location.href,
      pageTitle: document.title,
      route: this.router.url,
      x: event.clientX,
      y: event.clientY,
      target: this.getCssSelector(target),
      sessionId: this.sessionId,
      deviceType: this.getDeviceType(),
      browser: this.getBrowser(),
      os: this.getOS()
    };

    this.queueEvent(clickEvent);
  }

  // ========== PAGE TIME TRACKING ==========

  private trackPageEnter(url: string) {
    this.currentRoute = url;
    this.pageEnterTime = Date.now();
    this.maxScrollDepth = 0;
    this.scrollTracked = false;

    this.trackPageView(url);
  }

  private trackPageExit() {
    if (!this.currentRoute) return;
    const duration = Date.now() - this.pageEnterTime;

    this.queueEvent({
      eventType: 'page_exit',
      route: this.currentRoute,
      pageUrl: window.location.href,
      sessionId: this.sessionId,
      deviceType: this.getDeviceType(),
      browser: this.getBrowser(),
      os: this.getOS(),
      metadata: {
        duration,
        durationSeconds: Math.round(duration / 1000),
        scrollDepth: this.maxScrollDepth,
        wasIdle: this.isIdle
      }
    });
  }

  // ========== SESSION TRACKING ==========

  private trackSessionStart() {
    this.queueEvent({
      eventType: 'session_start',
      pageUrl: window.location.href,
      route: this.router.url,
      sessionId: this.sessionId,
      deviceType: this.getDeviceType(),
      browser: this.getBrowser(),
      os: this.getOS(),
      metadata: {
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    });
  }

  private trackSessionEnd() {
    const sessionDuration = Date.now() - this.sessionStartTime;
    this.queueEvent({
      eventType: 'session_end',
      sessionId: this.sessionId,
      deviceType: this.getDeviceType(),
      browser: this.getBrowser(),
      os: this.getOS(),
      metadata: {
        sessionDuration,
        sessionDurationMinutes: Math.round(sessionDuration / 60000),
        pagesVisited: this.currentRoute
      }
    });
  }

  // ========== SCROLL TRACKING ==========

  private handleScroll() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const depth = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;

    if (depth > this.maxScrollDepth) {
      this.maxScrollDepth = depth;
    }

    // Track scroll milestones (25%, 50%, 75%, 100%)
    if (!this.scrollTracked && depth >= 75) {
      this.scrollTracked = true;
      this.queueEvent({
        eventType: 'scroll_depth',
        route: this.router.url,
        sessionId: this.sessionId,
        metadata: { depth: this.maxScrollDepth }
      });
    }
  }

  // ========== TAB FOCUS / BLUR ==========

  private handleVisibilityChange() {
    if (document.hidden) {
      this.handleWindowBlur();
    } else {
      this.handleWindowFocus();
    }
  }

  private handleWindowFocus() {
    if (!this.isTabVisible) {
      this.isTabVisible = true;
      this.lastActiveTimestamp = Date.now();
      this.queueEvent({
        eventType: 'tab_focus',
        route: this.router.url,
        sessionId: this.sessionId,
        metadata: { timestamp: Date.now() }
      });
    }
  }

  private handleWindowBlur() {
    if (this.isTabVisible) {
      this.isTabVisible = false;
      this.activeTime += Date.now() - this.lastActiveTimestamp;
      this.queueEvent({
        eventType: 'tab_blur',
        route: this.router.url,
        sessionId: this.sessionId,
        metadata: { activeTimeMs: this.activeTime }
      });
    }
  }

  // ========== FORM TRACKING ==========

  private handleFormFocus(event: Event) {
    const target = event.target as HTMLElement;
    if (!this.isFormElement(target)) return;

    this.queueEvent({
      eventType: 'form_focus',
      elementId: target.id || undefined,
      elementType: target.tagName?.toLowerCase(),
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: {
        fieldName: (target as HTMLInputElement).name || target.id || this.getLabel(target),
        fieldType: (target as HTMLInputElement).type || target.tagName?.toLowerCase()
      }
    });
  }

  private handleFormChange(event: Event) {
    const target = event.target as HTMLElement;
    if (!this.isFormElement(target)) return;

    this.queueEvent({
      eventType: 'form_change',
      elementId: target.id || undefined,
      elementType: target.tagName?.toLowerCase(),
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: {
        fieldName: (target as HTMLInputElement).name || target.id || this.getLabel(target),
        fieldType: (target as HTMLInputElement).type || 'select'
        // Don't log values for privacy
      }
    });
  }

  private handleFormSubmit(event: Event) {
    const form = event.target as HTMLFormElement;
    this.queueEvent({
      eventType: 'form_submit',
      elementId: form.id || undefined,
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: {
        formAction: form.action || 'inline',
        formMethod: form.method || 'post'
      }
    });
  }

  private isFormElement(el: HTMLElement): boolean {
    return ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
  }

  private getLabel(el: HTMLElement): string {
    const label = el.closest('.form-group')?.querySelector('label');
    return label?.textContent?.trim() || '';
  }

  // ========== ERROR TRACKING ==========

  private handleJsError(event: ErrorEvent) {
    this.queueEvent({
      eventType: 'js_error',
      route: this.router.url,
      pageUrl: window.location.href,
      sessionId: this.sessionId,
      metadata: {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        col: event.colno
      }
    });
  }

  private handlePromiseRejection(event: PromiseRejectionEvent) {
    this.queueEvent({
      eventType: 'promise_error',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: {
        reason: event.reason?.message || String(event.reason).substring(0, 200)
      }
    });
  }

  /**
   * Track API errors (call from HTTP interceptor or components)
   */
  trackApiError(url: string, status: number, message?: string) {
    this.queueEvent({
      eventType: 'api_error',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { url, status, message: message?.substring(0, 200) }
    });
  }

  // ========== IDLE DETECTION ==========

  private recordActivity() {
    this.lastActivity = Date.now();
    if (this.isIdle) {
      this.isIdle = false;
      this.queueEvent({
        eventType: 'user_active',
        route: this.router.url,
        sessionId: this.sessionId,
        metadata: { idleDuration: Date.now() - this.lastActivity }
      });
    }
  }

  private checkIdle() {
    if (Date.now() - this.lastActivity > this.idleTimeout && !this.isIdle) {
      this.isIdle = true;
      this.queueEvent({
        eventType: 'user_idle',
        route: this.router.url,
        sessionId: this.sessionId,
        metadata: { idleAfterMs: this.idleTimeout }
      });
    }
  }

  // ========== BUSINESS EVENT TRACKING (Public API) ==========

  /** Track when a user views an entity detail */
  trackView(entityType: string, entityId: string | number, entityName?: string) {
    this.queueEvent({
      eventType: 'entity_view',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { entityType, entityId, entityName }
    });
  }

  /** Track when a user creates something */
  trackCreate(entityType: string, entityId?: string | number, entityName?: string) {
    this.queueEvent({
      eventType: 'entity_create',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { entityType, entityId, entityName }
    });
  }

  /** Track when a user updates something */
  trackUpdate(entityType: string, entityId: string | number, entityName?: string) {
    this.queueEvent({
      eventType: 'entity_update',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { entityType, entityId, entityName }
    });
  }

  /** Track when a user deletes something */
  trackDelete(entityType: string, entityId: string | number, entityName?: string) {
    this.queueEvent({
      eventType: 'entity_delete',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { entityType, entityId, entityName }
    });
  }

  /** Track file upload */
  trackUpload(docType: string, fileName: string, fileSize?: number) {
    this.queueEvent({
      eventType: 'file_upload',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { docType, fileName, fileSize }
    });
  }

  /** Track file download */
  trackDownload(docType: string, fileName: string) {
    this.queueEvent({
      eventType: 'file_download',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { docType, fileName }
    });
  }

  /** Track search */
  trackSearch(query: string, resultCount: number, context?: string) {
    this.queueEvent({
      eventType: 'search',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { query: query.substring(0, 100), resultCount, context }
    });
  }

  /** Track modal open/close */
  trackModal(action: 'open' | 'close', modalName: string) {
    this.queueEvent({
      eventType: 'modal_' + action,
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { modalName }
    });
  }

  /** Track export/print */
  trackExport(format: string, context: string) {
    this.queueEvent({
      eventType: 'export',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { format, context }
    });
  }

  /** Track tab switch */
  trackTabSwitch(tabName: string, context?: string) {
    this.queueEvent({
      eventType: 'tab_switch',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { tabName, context }
    });
  }

  /** Track filter usage */
  trackFilter(filterName: string, filterValue: string, context?: string) {
    this.queueEvent({
      eventType: 'filter',
      route: this.router.url,
      sessionId: this.sessionId,
      metadata: { filterName, filterValue, context }
    });
  }

  // ========== PAGE VIEW (existing) ==========

  trackPageView(url: string) {
    const pageView = {
      pageUrl: url,
      pageTitle: document.title,
      referrer: document.referrer,
      route: this.router.url,
      sessionId: this.sessionId,
      deviceType: this.getDeviceType(),
      browser: this.getBrowser()
    };

    this.http.post(`${this.apiUrl}/api/v1/events/page-view`, pageView).subscribe({
      error: () => {} // silent
    });
  }

  /** Track custom event (existing) */
  trackCustomEvent(eventType: string, metadata?: Record<string, any>) {
    this.queueEvent({
      eventType,
      pageUrl: window.location.href,
      pageTitle: document.title,
      route: this.router.url,
      sessionId: this.sessionId,
      deviceType: this.getDeviceType(),
      browser: this.getBrowser(),
      os: this.getOS(),
      metadata
    });
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; }
  forceFlush() { this.flushEvents(); }

  // ========== INTERNALS ==========

  private getElementText(element: HTMLElement): string | undefined {
    const text = element.innerText || element.textContent || '';
    return text.substring(0, 100) || undefined;
  }

  private shouldIgnoreElement(element: HTMLElement): boolean {
    return ['HTML', 'BODY'].includes(element.tagName);
  }

  private getCssSelector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;
    if (typeof element.className === 'string' && element.className) {
      const firstClass = element.className.split(' ')[0];
      if (firstClass) return `.${firstClass}`;
    }
    return element.tagName.toLowerCase();
  }

  private getDeviceType(): string {
    const w = window.innerWidth;
    return w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  }

  private getBrowser(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome') && !ua.includes('Edge')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private getOS(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'MacOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'Unknown';
  }

  private queueEvent(event: TrackingEvent) {
    // Convert all metadata values to strings for MongoDB compatibility
    if (event.metadata) {
      const cleaned: Record<string, string> = {};
      for (const [key, value] of Object.entries(event.metadata)) {
        if (value !== null && value !== undefined) {
          cleaned[key] = String(value);
        }
      }
      event.metadata = cleaned;
    }
    this.eventQueue.push(event);
    if (this.eventQueue.length >= this.batchSize) {
      this.flushEvents();
    }
  }

  private startBatchFlush() {
    setInterval(() => {
      if (this.eventQueue.length > 0) this.flushEvents();
    }, this.flushInterval);
  }

  private flushEvents() {
    if (this.eventQueue.length === 0) return;
    const events = [...this.eventQueue];
    this.eventQueue = [];
    this.http.post(`${this.apiUrl}/api/v1/events/batch`, events).subscribe({
      error: () => {} // silent -- never block the UI
    });
  }
}
