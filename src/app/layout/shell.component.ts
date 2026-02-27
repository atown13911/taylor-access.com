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
      ]
    },
    {
      label: 'Admin',
      items: [
        { label: 'Users', icon: 'bx bx-user', route: '/users' },
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
