import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

/**
 * Public legal pages (/terms, /privacy, /sms-opt-in) — no auth required.
 * Referenced by Twilio Trust Hub / toll-free / A2P registration, so they include
 * the SMS program language carriers require (first-text opt-in, STOP/HELP, no
 * sharing of mobile data for marketing).
 */
@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './legal.component.html',
  styleUrls: ['./legal.component.scss']
})
export class LegalComponent {
  private route = inject(ActivatedRoute);

  readonly doc: 'terms' | 'privacy' | 'optin' =
    this.route.snapshot.data['doc'] === 'privacy' ? 'privacy'
    : this.route.snapshot.data['doc'] === 'optin' ? 'optin'
    : 'terms';

  readonly lastUpdated = 'August 7, 2026';
  readonly companyName = 'Taylor Logistics';
  readonly contactEmail = 'dispatch@taylor-access.com';
}
