import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

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

  navItems = [
    { label: 'Employee Roster', icon: 'bx bx-id-card', route: '/hr/roster' },
    { label: 'Users', icon: 'bx bx-user', route: '/users' },
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
