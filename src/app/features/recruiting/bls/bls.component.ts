import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-bls',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bls-page">
      <header class="page-header">
        <h1><i class='bx bx-line-chart'></i> BLS Labor Data</h1>
        <p>Bureau of Labor Statistics integration for recruiting and compensation market context.</p>
      </header>

      <section class="card">
        <h2>Connection</h2>
        <p>
          This tab is ready for BLS API setup. Next step is wiring API key settings and
          query tools for series like occupation <code>53-3032</code> and NAICS <code>484</code>.
        </p>
      </section>
    </div>
  `,
  styles: [`
    .bls-page { padding: 20px; display: grid; gap: 14px; }
    .page-header h1 { margin: 0; color: #7dd3fc; display: flex; align-items: center; gap: 8px; }
    .page-header p { margin: 6px 0 0; color: #9fb3c8; }
    .card { background: rgba(11, 16, 30, 0.84); border: 1px solid #243447; border-radius: 12px; padding: 16px; }
    .card h2 { margin: 0 0 8px; color: #e2e8f0; font-size: 1rem; }
    .card p { margin: 0; color: #cbd5e1; line-height: 1.45; }
    code { color: #93c5fd; }
  `]
})
export class BlsComponent {}

