import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: '',
        redirectTo: 'hr/roster',
        pathMatch: 'full'
      },
      {
        path: 'hr/roster',
        loadComponent: () => import('./features/hr/employee-roster/employee-roster.component').then(m => m.EmployeeRosterComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./features/admin-security/users/users.component').then(m => m.UsersComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'hr/roster'
  }
];
