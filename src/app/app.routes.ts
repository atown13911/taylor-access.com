import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'oauth/authorize',
    loadComponent: () => import('./features/oauth/oauth-consent.component').then(m => m.OAuthConsentComponent)
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/hr/hr-dashboard/hr-dashboard.component').then(m => m.HrDashboardComponent)
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
        path: 'fleet-entities',
        loadComponent: () => import('./features/fleet/fleets/fleets.component').then(m => m.FleetsComponent)
      },
      {
        path: 'hr/time-clock',
        loadComponent: () => import('./features/hr/time-clock/time-clock.component').then(m => m.TimeClockComponent)
      },
      {
        path: 'hr/time-off',
        loadComponent: () => import('./features/hr/time-off/time-off.component').then(m => m.TimeOffComponent)
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
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/admin-security/profile/profile.component').then(m => m.ProfileComponent)
      },
      {
        path: 'hr/my-profile',
        loadComponent: () => import('./features/hr/my-hr-profile/my-hr-profile.component').then(m => m.MyHrProfileComponent)
      },
      {
        path: 'admin/roles',
        loadComponent: () => import('./features/admin-security/admin/role-management/role-management.component').then(m => m.RoleManagementComponent)
      },
      {
        path: 'admin/audit',
        loadComponent: () => import('./features/admin-security/admin/audit-log/audit-log.component').then(m => m.AuditLogComponent)
      },
      {
        path: 'admin/invite',
        loadComponent: () => import('./features/admin-security/admin/invite-users/invite-users.component').then(m => m.InviteUsersComponent)
      },
      {
        path: 'admin/apps',
        loadComponent: () => import('./features/admin-security/connected-apps/connected-apps.component').then(m => m.ConnectedAppsComponent)
      },
      {
        path: 'chat',
        loadComponent: () => import('./features/communication/chat/chat.component').then(m => m.ChatComponent)
      },
      {
        path: 'tickets',
        loadComponent: () => import('./features/support/tickets/tickets.component').then(m => m.TicketsComponent)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/system/notifications/notifications.component').then(m => m.NotificationsComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'hr/roster'
  }
];
