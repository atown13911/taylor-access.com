import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

/**
 * Public legal pages (/terms and /privacy) — no auth required.
 * Referenced by Twilio Trust Hub / A2P 10DLC registration, so they include
 * the SMS program language carriers require (opt-in, STOP/HELP, no sharing
 * of mobile data for marketing).
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

  readonly doc: 'terms' | 'privacy' =
    this.route.snapshot.data['doc'] === 'privacy' ? 'privacy' : 'terms';

  readonly lastUpdated = 'July 28, 2026';
  readonly companyName = 'Taylor Logistics';
  readonly contactEmail = 'dispatch@taylor-access.com';
}
