import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-tags-permits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tags-permits.component.html',
  styleUrls: ['./tags-permits.component.scss']
})
export class TagsPermitsComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  activeTab = signal<'permits' | 'irp'>('permits');
  drivers = signal<any[]>([]);
  searchTerm = signal('');
  loading = signal(false);

  filteredDrivers = computed(() => {
    const search = this.searchTerm().toLowerCase();
    let list = this.drivers();
    if (search) {
      list = list.filter((d: any) =>
        (d.name || '').toLowerCase().includes(search) ||
        (d.truckNumber || '').toLowerCase().includes(search) ||
        (d.truckTag || '').toLowerCase().includes(search)
      );
    }
    return list;
  });

  permitDrivers = computed(() => this.filteredDrivers().filter((d: any) => d.truckTag || d.twiccCardNumber));
  irpDrivers = computed(() => this.filteredDrivers());

  totalPermits = computed(() => this.drivers().filter((d: any) => d.truckTag).length);
  totalTwic = computed(() => this.drivers().filter((d: any) => d.twiccCardNumber).length);
  expiringPermits = computed(() => this.drivers().filter((d: any) => {
    if (!d.twiccExpiry) return false;
    const days = Math.ceil((new Date(d.twiccExpiry).getTime() - Date.now()) / 86400000);
    return days > 0 && days <= 30;
  }).length);

  ngOnInit() {
    this.loadDrivers();
  }

  loadDrivers() {
    this.loading.set(true);
    this.http.get<any>(`${this.apiUrl}/api/v1/drivers?limit=1000`).subscribe({
      next: (res) => { this.drivers.set(res?.data || []); this.loading.set(false); },
      error: () => { this.drivers.set([]); this.loading.set(false); }
    });
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getExpiryClass(d: string): string {
    if (!d) return '';
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring';
    return 'valid';
  }
}
