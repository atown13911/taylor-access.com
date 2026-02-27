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
      },
      {
        path: 'drivers',
        loadComponent: () => import('./features/fleet/driver-list/driver-list.component').then(m => m.DriverListComponent)
      },
      {
        path: 'hr/benefits',
        loadComponent: () => import('./features/hr/benefits/benefits.component').then(m => m.BenefitsComponent)
      },
      {
        path: 'hr/performance-reviews',
        loadComponent: () => import('./features/hr/performance-reviews/performance-reviews.component').then(m => m.PerformanceReviewsComponent)
      },
      {
        path: 'hr/documents',
        loadComponent: () => import('./features/hr/documents/hr-documents.component').then(m => m.HrDocumentsComponent)
      },
      {
        path: 'compliance/driver-database',
        loadComponent: () => import('./features/compliance/driver-database/driver-database.component').then(m => m.DriverDatabaseComponent)
      },
      {
        path: 'compliance/registrations',
        loadComponent: () => import('./features/compliance/registrations/registrations.component').then(m => m.RegistrationsComponent)
      },
      {
        path: 'compliance/insurance',
        loadComponent: () => import('./features/compliance/insurance-financial/insurance-financial.component').then(m => m.InsuranceFinancialComponent)
      },
      {
        path: 'compliance/driver-files',
        loadComponent: () => import('./features/compliance/compliance-overview.component').then(m => m.ComplianceOverviewComponent)
      },
      {
        path: 'compliance/drug-testing',
        loadComponent: () => import('./features/compliance/compliance-overview.component').then(m => m.ComplianceOverviewComponent)
      },
      {
        path: 'compliance/hos',
        loadComponent: () => import('./features/compliance/compliance-overview.component').then(m => m.ComplianceOverviewComponent)
      },
      {
        path: 'compliance/vehicle-inspections',
        loadComponent: () => import('./features/compliance/compliance-overview.component').then(m => m.ComplianceOverviewComponent)
      },
      {
        path: 'compliance/dot',
        loadComponent: () => import('./features/compliance/document-management/document-management.component').then(m => m.DocumentManagementComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'hr/roster'
  }
];
