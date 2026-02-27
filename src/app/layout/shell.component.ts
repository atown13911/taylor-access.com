import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

interface NavSection {
  label?: string;
  items: { label: string; icon: string; route: string }[];
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss']
})
export class ShellComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  sidebarCollapsed = signal(false);
  currentUser = this.authService.currentUser;

  navSections: NavSection[] = [
    {
      items: [
        { label: 'Employee Roster', icon: 'bx bx-id-card', route: '/hr/roster' },
        { label: 'Drivers', icon: 'bx bx-car', route: '/drivers' },
        { label: 'Benefits', icon: 'bx bx-star', route: '/hr/benefits' },
        { label: 'Performance Reviews', icon: 'bx bx-bar-chart-alt-2', route: '/hr/performance-reviews' },
        { label: 'HR Documents', icon: 'bx bx-file', route: '/hr/documents' },
      ]
    },
    {
      label: 'Compliance',
      items: [
        { label: 'Driver Database', icon: 'bx bx-search-alt', route: '/compliance/driver-database' },
        { label: 'Registrations & Authority', icon: 'bx bx-certification', route: '/compliance/registrations' },
        { label: 'Insurance & Financial', icon: 'bx bx-dollar-circle', route: '/compliance/insurance' },
        { label: 'Driver Qualification Files', icon: 'bx bx-folder-open', route: '/compliance/driver-files' },
        { label: 'Drug & Alcohol Testing', icon: 'bx bx-test-tube', route: '/compliance/drug-testing' },
        { label: 'Hours of Service (HOS)', icon: 'bx bx-time', route: '/compliance/hos' },
        { label: 'Vehicle Inspections', icon: 'bx bx-check-shield', route: '/compliance/vehicle-inspections' },
        { label: 'DOT Compliance', icon: 'bx bx-shield-alt-2', route: '/compliance/dot' },
      ]
    },
    {
      label: 'Admin',
      items: [
        { label: 'Users', icon: 'bx bx-user', route: '/users' },
        { label: 'Roles & Permissions', icon: 'bx bx-lock-alt', route: '/admin/roles' },
        { label: 'Audit Logs', icon: 'bx bx-history', route: '/admin/audit' },
        { label: 'Invite Users', icon: 'bx bx-user-plus', route: '/admin/invite' },
        { label: 'Connected Apps (SSO)', icon: 'bx bx-link', route: '/admin/apps' },
        { label: 'Structure', icon: 'bx bx-sitemap', route: '/structure' },
        { label: 'Database', icon: 'bx bx-data', route: '/database' },
      ]
    }
  ];

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
    }
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
