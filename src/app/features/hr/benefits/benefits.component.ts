import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-benefits',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 24px;">
      <h1 style="color: #00f2fe;"><i class="bx bx-health"></i> Benefits Management</h1>
      <p style="color: #9ca3af;">Health insurance, 401k, and benefits enrollment - Coming soon!</p>
    </div>
  `
})
export class BenefitsComponent {}
