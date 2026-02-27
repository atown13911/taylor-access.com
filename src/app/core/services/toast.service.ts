import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  title?: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'champagne';
  duration?: number;
  locked?: boolean;
  ticketId?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  toasts = signal<Toast[]>([]);

  show(message: string, type: Toast['type'] = 'info', titleOrDuration?: string | number) {
    const id = `toast_${Date.now()}_${Math.random()}`;
    let title: string | undefined;
    let duration = 4000;
    
    if (typeof titleOrDuration === 'string') {
      title = titleOrDuration;
    } else if (typeof titleOrDuration === 'number') {
      duration = titleOrDuration;
    }
    
    const toast: Toast = { id, message, title, type, duration };
    
    this.toasts.update(toasts => [...toasts, toast]);

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
  }

  success(message: string, titleOrDuration?: string | number) {
    this.show(message, 'success', titleOrDuration);
  }

  champagne(message: string, titleOrDuration?: string | number) {
    this.show(message, 'champagne', titleOrDuration);
  }

  error(message: string, titleOrDuration?: string | number) {
    this.show(message, 'error', titleOrDuration);
  }

  warning(message: string, titleOrDuration?: string | number) {
    this.show(message, 'warning', titleOrDuration);
  }

  info(message: string, titleOrDuration?: string | number) {
    this.show(message, 'info', titleOrDuration);
  }

  lockedChampagne(message: string, title: string, ticketId: number) {
    const existing = this.toasts().find(t => t.ticketId === ticketId && t.locked);
    if (existing) return;
    const id = `toast_locked_${ticketId}`;
    const toast: Toast = { id, message, title, type: 'champagne', duration: 0, locked: true, ticketId };
    this.toasts.update(toasts => [...toasts, toast]);
  }

  unlockByTicketId(ticketId: number) {
    this.toasts.update(toasts => toasts.filter(t => t.ticketId !== ticketId));
  }

  remove(id: string) {
    this.toasts.update(toasts => toasts.filter(t => t.id !== id));
  }

  dismiss(id: string) {
    const toast = this.toasts().find(t => t.id === id);
    if (toast?.locked) return;
    this.remove(id);
  }
}
