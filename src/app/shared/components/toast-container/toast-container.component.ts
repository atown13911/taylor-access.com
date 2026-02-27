import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="toast.type" [class.locked]="toast.locked" (click)="toastService.dismiss(toast.id)">
          <div class="toast-icon">
            @switch (toast.type) {
              @case ('success') { <i class="bx bx-check-circle"></i> }
              @case ('champagne') { <i class="bx bx-party"></i> }
              @case ('error') { <i class="bx bx-x-circle"></i> }
              @case ('warning') { <i class="bx bx-error"></i> }
              @case ('info') { <i class="bx bx-info-circle"></i> }
            }
          </div>
          <div class="toast-content">
            @if (toast.title) {
              <div class="toast-title">{{ toast.title }}</div>
            }
            <div class="toast-message">{{ toast.message }}</div>
            @if (toast.locked) {
              <div class="toast-locked-hint"><i class="bx bx-lock-alt"></i> Mark as In Progress to dismiss</div>
            }
          </div>
          @if (!toast.locked) {
            <button class="toast-close" (click)="toastService.dismiss(toast.id); $event.stopPropagation()">
              <i class="bx bx-x"></i>
            </button>
          }
          @if (toast.duration) {
            <div class="toast-progress" [style.animation-duration.ms]="toast.duration"></div>
          }
          @if (toast.type === 'champagne') {
            <div class="confetti"></div>
            <div class="confetti"></div>
            <div class="confetti"></div>
            <div class="confetti"></div>
            <div class="confetti"></div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 400px;
    }

    .toast {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 20px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      animation: slideIn 0.3s ease;
      position: relative;
      overflow: hidden;

      &.success {
        border-left: 4px solid #00ff88;
        .toast-icon { color: #00ff88; }
        .toast-progress { background: #00ff88; }
      }

      &.error {
        border-left: 4px solid #ff2a6d;
        .toast-icon { color: #ff2a6d; }
        .toast-progress { background: #ff2a6d; }
      }

      &.warning {
        border-left: 4px solid #ff6b35;
        .toast-icon { color: #ff6b35; }
        .toast-progress { background: #ff6b35; }
      }

      &.info {
        border-left: 4px solid #00d4ff;
        .toast-icon { color: #00d4ff; }
        .toast-progress { background: #00d4ff; }
      }

      &.champagne {
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.95), rgba(245, 158, 11, 0.95));
        border: 1px solid rgba(251, 191, 36, 0.4);
        border-left: 4px solid #fbbf24;
        animation: slideIn 0.3s ease, celebration 0.6s ease-in-out 0.3s;
        .toast-icon { 
          color: white; 
          font-size: 2rem;
          animation: spin 1s ease-in-out infinite;
        }
        .toast-content { color: white; }
        .toast-message { color: rgba(255, 255, 255, 0.95); }
        .toast-progress { background: #fde047; }
      }
    }

    .toast.locked {
      cursor: default;
      box-shadow: 0 0 20px rgba(251, 191, 36, 0.4), 0 10px 40px rgba(0, 0, 0, 0.4);
      animation: slideIn 0.3s ease, locked-pulse 3s ease-in-out infinite;
    }

    .toast-locked-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 6px;
      font-size: 0.72rem;
      color: rgba(255, 255, 255, 0.7);
      font-weight: 500;
    }

    .toast-locked-hint i { font-size: 0.8rem; }

    @keyframes locked-pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.4), 0 10px 40px rgba(0, 0, 0, 0.4); }
      50% { box-shadow: 0 0 30px rgba(251, 191, 36, 0.6), 0 10px 40px rgba(0, 0, 0, 0.4); }
    }

    @keyframes celebration {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    @keyframes spin {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-10deg); }
      75% { transform: rotate(10deg); }
    }

    .toast-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }

    .toast-content {
      flex: 1;
      min-width: 0;
    }

    .toast-title {
      font-weight: 600;
      color: #f1f5f9;
      font-size: 0.95rem;
      margin-bottom: 4px;
    }

    .toast-message {
      color: #94a3b8;
      font-size: 0.875rem;
      line-height: 1.4;
    }

    .toast-close {
      background: none;
      border: none;
      color: #64748b;
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: color 0.2s ease;

      &:hover {
        color: #f1f5f9;
      }
    }

    .toast-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      width: 100%;
      animation: progress linear forwards;
      opacity: 0.6;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes progress {
      from { width: 100%; }
      to { width: 0%; }
    }

    /* Confetti Animation */
    .confetti {
      position: absolute;
      width: 8px;
      height: 8px;
      background: white;
      opacity: 0;
      border-radius: 50%;
    }

    .confetti:nth-child(5) {
      left: 15%;
      top: 20%;
      animation: confetti-fall 1.5s ease-out forwards;
      background: #fde047;
    }

    .confetti:nth-child(6) {
      left: 35%;
      top: 30%;
      animation: confetti-fall 1.8s ease-out 0.2s forwards;
      background: #fbbf24;
    }

    .confetti:nth-child(7) {
      left: 55%;
      top: 25%;
      animation: confetti-fall 2s ease-out 0.4s forwards;
      background: #fef08a;
    }

    .confetti:nth-child(8) {
      left: 75%;
      top: 35%;
      animation: confetti-fall 1.6s ease-out 0.6s forwards;
      background: #facc15;
    }

    .confetti:nth-child(9) {
      left: 90%;
      top: 20%;
      animation: confetti-fall 1.9s ease-out 0.8s forwards;
      background: #fde68a;
    }

    @keyframes confetti-fall {
      0% {
        transform: translateY(0) rotate(0deg) scale(1);
        opacity: 1;
      }
      100% {
        transform: translateY(80px) rotate(720deg) scale(0.5);
        opacity: 0;
      }
    }
  `]
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
}
