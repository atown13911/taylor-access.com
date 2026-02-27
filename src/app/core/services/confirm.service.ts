import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'champagne' | 'danger' | 'info';
}

interface ConfirmState {
  visible: boolean;
  options: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  state = signal<ConfirmState>({
    visible: false,
    options: { message: '' },
    resolve: null
  });

  /**
   * Show a champagne-styled confirmation dialog.
   * Returns a Promise<boolean> -- true if user clicks confirm, false if cancel.
   *
   * Usage:
   *   const ok = await this.confirm.show({ message: 'Transfer to Brokerage?' });
   *   if (!ok) return;
   */
  show(options: ConfirmOptions | string): Promise<boolean> {
    const opts: ConfirmOptions = typeof options === 'string'
      ? { message: options }
      : options;

    return new Promise<boolean>((resolve) => {
      this.state.set({
        visible: true,
        options: {
          title: opts.title ?? 'Confirm',
          message: opts.message,
          confirmText: opts.confirmText ?? 'OK',
          cancelText: opts.cancelText ?? 'Cancel',
          type: opts.type ?? 'champagne'
        },
        resolve
      });
    });
  }

  /** Shortcut for danger-style confirms (deletes, disconnects, etc.) */
  danger(message: string, title?: string): Promise<boolean> {
    return this.show({ message, title: title ?? 'Are you sure?', type: 'danger', confirmText: 'Delete', cancelText: 'Cancel' });
  }

  /** Called by the confirm modal component */
  respond(confirmed: boolean): void {
    const current = this.state();
    if (current.resolve) {
      current.resolve(confirmed);
    }
    this.state.set({ visible: false, options: { message: '' }, resolve: null });
  }
}
