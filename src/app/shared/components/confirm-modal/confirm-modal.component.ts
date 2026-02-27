import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (confirmService.state().visible) {
      <div class="confirm-overlay" (click)="cancel()">
        <div class="confirm-modal" [class]="confirmService.state().options.type || 'champagne'" (click)="$event.stopPropagation()">
          <!-- Confetti particles for champagne type -->
          @if (confirmService.state().options.type === 'champagne' || !confirmService.state().options.type) {
            <div class="confetti-container">
              <div class="confetti c1"></div>
              <div class="confetti c2"></div>
              <div class="confetti c3"></div>
              <div class="confetti c4"></div>
              <div class="confetti c5"></div>
              <div class="confetti c6"></div>
            </div>
          }
          <div class="confirm-icon">
            @switch (confirmService.state().options.type) {
              @case ('danger') {
                <i class="bx bx-error-circle"></i>
              }
              @case ('info') {
                <i class="bx bx-info-circle"></i>
              }
              @default {
                <i class="bx bx-party"></i>
              }
            }
          </div>
          <h3 class="confirm-title">{{ confirmService.state().options.title }}</h3>
          <p class="confirm-message">{{ confirmService.state().options.message }}</p>
          <div class="confirm-actions">
            <button class="btn btn-cancel" (click)="cancel()">
              {{ confirmService.state().options.cancelText }}
            </button>
            <button class="btn btn-confirm" [class]="'btn-confirm-' + (confirmService.state().options.type || 'champagne')" (click)="ok()">
              {{ confirmService.state().options.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000000;
      backdrop-filter: blur(4px);
      animation: overlayIn 0.2s ease;
    }

    @keyframes overlayIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .confirm-modal {
      background: #1a1a2e;
      border: 1px solid #2a2a4e;
      border-radius: 20px;
      padding: 36px 32px 28px;
      max-width: 420px;
      width: 90%;
      text-align: center;
      position: relative;
      overflow: hidden;
      animation: modalIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);

      &.champagne {
        border-color: rgba(251, 191, 36, 0.4);
        box-shadow: 0 20px 60px rgba(251, 191, 36, 0.15), 0 0 40px rgba(251, 191, 36, 0.05);
      }

      &.danger {
        border-color: rgba(255, 42, 109, 0.4);
        box-shadow: 0 20px 60px rgba(255, 42, 109, 0.15);
      }

      &.info {
        border-color: rgba(0, 212, 255, 0.4);
        box-shadow: 0 20px 60px rgba(0, 212, 255, 0.15);
      }
    }

    @keyframes modalIn {
      from {
        transform: scale(0.8) translateY(20px);
        opacity: 0;
      }
      to {
        transform: scale(1) translateY(0);
        opacity: 1;
      }
    }

    .confirm-icon {
      font-size: 3rem;
      margin-bottom: 16px;

      .champagne & {
        color: #fbbf24;
        animation: iconBounce 0.6s ease-in-out 0.3s;
      }
      .danger & { color: #ff2a6d; }
      .info & { color: #00d4ff; }
    }

    @keyframes iconBounce {
      0%, 100% { transform: scale(1) rotate(0deg); }
      30% { transform: scale(1.2) rotate(-10deg); }
      60% { transform: scale(1.1) rotate(10deg); }
    }

    .confirm-title {
      margin: 0 0 8px;
      color: #f1f5f9;
      font-size: 1.25rem;
      font-weight: 700;
    }

    .confirm-message {
      margin: 0 0 28px;
      color: #94a3b8;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .confirm-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }

    .btn {
      padding: 12px 28px;
      border: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s ease;
      min-width: 100px;
    }

    .btn-cancel {
      background: #2a2a4e;
      color: #94a3b8;

      &:hover {
        background: #3a3a6e;
        color: #f1f5f9;
      }
    }

    .btn-confirm-champagne {
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      color: #1a1a2e;

      &:hover {
        box-shadow: 0 0 20px rgba(251, 191, 36, 0.4);
        transform: translateY(-1px);
      }
    }

    .btn-confirm-danger {
      background: linear-gradient(135deg, #ff2a6d, #e11d48);
      color: #fff;

      &:hover {
        box-shadow: 0 0 20px rgba(255, 42, 109, 0.4);
        transform: translateY(-1px);
      }
    }

    .btn-confirm-info {
      background: linear-gradient(135deg, #00d4ff, #0080ff);
      color: #1a1a2e;

      &:hover {
        box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
        transform: translateY(-1px);
      }
    }

    /* Confetti */
    .confetti-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }

    .confetti {
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      opacity: 0;
    }

    .c1 { left: 10%; top: 15%; background: #fde047; animation: confettiFall 2s ease-out 0.3s forwards; }
    .c2 { left: 25%; top: 10%; background: #fbbf24; animation: confettiFall 2.2s ease-out 0.5s forwards; }
    .c3 { left: 50%; top: 8%;  background: #fef08a; animation: confettiFall 1.8s ease-out 0.4s forwards; }
    .c4 { left: 70%; top: 12%; background: #facc15; animation: confettiFall 2.1s ease-out 0.6s forwards; }
    .c5 { left: 85%; top: 15%; background: #fde68a; animation: confettiFall 1.9s ease-out 0.7s forwards; }
    .c6 { left: 40%; top: 5%;  background: #fbbf24; animation: confettiFall 2.3s ease-out 0.35s forwards; width: 6px; height: 6px; }

    @keyframes confettiFall {
      0% {
        transform: translateY(0) rotate(0deg) scale(1);
        opacity: 0.9;
      }
      100% {
        transform: translateY(120px) rotate(720deg) scale(0.3);
        opacity: 0;
      }
    }
  `]
})
export class ConfirmModalComponent {
  confirmService = inject(ConfirmService);

  ok(): void {
    this.confirmService.respond(true);
  }

  cancel(): void {
    this.confirmService.respond(false);
  }
}
