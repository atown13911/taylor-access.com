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
      },
      {
        path: 'structure',
        loadComponent: () => import('./features/admin-security/structure/structure.component').then(m => m.StructureComponent)
      },
      {
        path: 'database',
        loadComponent: () => import('./features/system/database/database.component').then(m => m.DatabaseComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'hr/roster'
  }
];
