export interface NavItemDefinition {
  label: string;
  icon: string;
  route: string;
  section?: string;
  roles?: string[];
  permission?: string;
}

export const ALL_NAV_ITEMS: NavItemDefinition[] = [
  // Dashboards
  { label: 'Main Dashboard', icon: 'bx-home', route: '/dashboard', section: 'Dashboards', permission: 'dashboard:view' },
  { label: 'Overview Dashboard', icon: 'bx-stats', route: '/overview', permission: 'dashboard:view' },
  { label: 'OTR Dashboard', icon: 'bxs-truck', route: '/otr/dashboard', permission: 'dashboard:view' },
  { label: 'Drayage Dashboard', icon: 'bxs-ship', route: '/drayage-ops/dashboard', permission: 'dashboard:view' },
  { label: 'Brokerage Dashboard', icon: 'bxs-analyse', route: '/brokerage-ops/dashboard', permission: 'dashboard:view' },
  { label: 'HR Dashboard', icon: 'bx-group', route: '/hr', permission: 'hr:view' },
  // Operations
  { label: 'Dispatch', icon: 'bx-broadcast', route: '/dispatch', section: 'Operations', permission: 'orders:dispatch' },
  { label: 'Routes', icon: 'bx-trip', route: '/routes', permission: 'shipments:view' },
  // Tracking & Telematics
  { label: 'Live Map', icon: 'bx-map', route: '/live-map', section: 'Tracking', permission: 'telematics:view' },
  { label: 'Positions', icon: 'bx-current-location', route: '/positions', permission: 'telematics:view' },
  { label: 'Telematics', icon: 'bx-wifi', route: '/telematics', permission: 'telematics:view' },
  { label: 'Devices', icon: 'bx-devices', route: '/devices', permission: 'devices:view' },
  { label: 'Sensors', icon: 'bx-chip', route: '/sensors', permission: 'devices:view' },
  // Shipments & Orders
  { label: 'Load Board', icon: 'bx-list-check', route: '/load-board', section: 'Shipments', permission: 'loads:view' },
  { label: 'OTR Shipments', icon: 'bx-package', route: '/shipments', permission: 'shipments:view' },
  { label: 'Drayage', icon: 'bx-cube', route: '/drayage', permission: 'shipments:view' },
  { label: 'Brokerage', icon: 'bx-transfer-alt', route: '/brokerage', permission: 'shipments:view' },
  { label: 'Orders', icon: 'bx-receipt', route: '/orders', permission: 'orders:view' },
  { label: 'Payloads', icon: 'bx-cube-alt', route: '/payloads', permission: 'shipments:view' },
  { label: 'Entities', icon: 'bx-cube', route: '/entities', permission: 'shipments:view' },
  { label: 'Labels', icon: 'bx-purchase-tag', route: '/labels', permission: 'shipments:view' },
  { label: 'Proofs', icon: 'bx-check-shield', route: '/proofs', permission: 'shipments:view' },
  // Fleet
  { label: 'Driver Roster', icon: 'bx-id-card', route: '/drivers', section: 'Fleet', permission: 'drivers:view' },
  { label: 'Carriers', icon: 'bxs-truck', route: '/carriers', permission: 'fleet:view' },
  { label: 'Vehicles', icon: 'bx-car', route: '/vehicles', permission: 'vehicles:view' },
  { label: 'Fleet Mgmt', icon: 'bx-group', route: '/fleets', permission: 'fleet:view' },
  { label: 'Fleet Entities', icon: 'bx-collection', route: '/admin/fleet-entities', permission: 'fleet:manage' },
  { label: 'Fuel Reports', icon: 'bxs-gas-pump', route: '/fuel-reports', permission: 'fleet:view' },
  // Equipment
  { label: 'Equipment', icon: 'bx-cabinet', route: '/equipment', section: 'Equipment', permission: 'equipment:view' },
  { label: 'Work Orders', icon: 'bx-wrench', route: '/work-orders', permission: 'maintenance:view' },
  { label: 'Trailer Utilization', icon: 'bx-cabinet', route: '/trailer-utilization', permission: 'equipment:view' },
  { label: 'Trailer Vendors', icon: 'bx-building', route: '/trailer-vendors', permission: 'equipment:view' },
  // Maintenance
  { label: 'PM/Compliance', icon: 'bx-cog', route: '/maintenance', section: 'PM/Compliance', permission: 'maintenance:view' },
  { label: 'Parts', icon: 'bx-package', route: '/parts', permission: 'maintenance:view' },
  { label: 'Warranties', icon: 'bx-shield-quarter', route: '/warranties', permission: 'maintenance:view' },
  // Support
  { label: 'Issues', icon: 'bx-error-circle', route: '/issues', section: 'Support' },
  { label: 'Support Tickets', icon: 'bx-support', route: '/tickets' },
  // Finance
  { label: 'Transport Financial', icon: 'bx-dollar-circle', route: '/financial', section: 'Finance', permission: 'finance:view' },
  { label: 'Account Mgmt', icon: 'bx-briefcase-alt-2', route: '/account-mgmt', permission: 'finance:manage' },
  { label: 'Bank Accounts', icon: 'bxs-bank', route: '/bank-accounts', permission: 'finance:manage' },
  { label: 'Transport Invoices', icon: 'bx-receipt', route: '/invoices', permission: 'invoices:view' },
  { label: 'Payables', icon: 'bx-credit-card-alt', route: '/payables', permission: 'payables:view' },
  { label: 'Payments', icon: 'bx-credit-card', route: '/payments', permission: 'payables:pay' },
  { label: 'Internal Invoices', icon: 'bx-transfer', route: '/internal-invoices', permission: 'invoices:view' },
  { label: 'Cost Allocation', icon: 'bx-pie-chart-alt-2', route: '/cost-allocation', permission: 'finance:manage' },
  { label: 'Quotes', icon: 'bx-calculator', route: '/service-quotes', permission: 'finance:view' },
  { label: 'Rates', icon: 'bx-purchase-tag-alt', route: '/purchase-rates', permission: 'rates:view' },
  { label: 'Reports', icon: 'bx-bar-chart-alt-2', route: '/reports', permission: 'reports:view' },
  { label: 'Metrics', icon: 'bx-line-chart', route: '/metrics', permission: 'reports:view' },
  { label: 'Factoring', icon: 'bx-coin-stack', route: '/factoring', permission: 'finance:manage' },
  { label: 'Deductions', icon: 'bx-minus-circle', route: '/deductions', permission: 'payables:view' },
  { label: 'Vendor Invoicing', icon: 'bx-receipt', route: '/finance/vendor-invoicing', permission: 'invoices:view' },
  { label: 'Finance Settings', icon: 'bx-cog', route: '/finance/settings', permission: 'settings:edit' },
  // HR & People
  { label: 'Employee Roster', icon: 'bx-id-card', route: '/hr/roster', section: 'HR & People', permission: 'users:view' },
  { label: 'Payroll', icon: 'bx-dollar-circle', route: '/hr/payroll', permission: 'payroll:view' },
  { label: 'Time Off', icon: 'bx-calendar-event', route: '/hr/time-off', permission: 'hr:view' },
  { label: 'Attendance', icon: 'bx-time-five', route: '/hr/attendance', permission: 'timeclock:view' },
  { label: 'Timesheets', icon: 'bx-spreadsheet', route: '/hr/timesheets', permission: 'timeclock:view' },
  { label: 'Benefits', icon: 'bx-health', route: '/hr/benefits', permission: 'hr:view' },
  { label: 'Performance Reviews', icon: 'bx-bar-chart-square', route: '/hr/performance-reviews', permission: 'hr:view' },
  { label: 'HR Documents', icon: 'bx-folder-open', route: '/hr/documents', permission: 'hr:view' },
  { label: 'HR Settings', icon: 'bx-cog', route: '/hr/settings', permission: 'settings:edit' },
  // Sales
  { label: 'Sales CRM', icon: 'bx-line-chart', route: '/sales', section: 'Sales', permission: 'contacts:view' },
  // Recruiting
  { label: 'Recruiting Platform', icon: 'bx-user-plus', route: '/recruiting', section: 'Recruiting', permission: 'users:manage_roles' },
  { label: 'Job Postings', icon: 'bx-briefcase-alt-2', route: '/recruiting/job-postings', permission: 'users:manage_roles' },
  { label: 'Applications', icon: 'bx-file', route: '/recruiting/applications', permission: 'users:manage_roles' },
  // System
  { label: 'Order Configs', icon: 'bx-customize', route: '/order-configs', section: 'System', permission: 'settings:edit' },
  { label: 'Service Rates', icon: 'bx-dollar', route: '/service-rates', permission: 'rates:manage' },
  { label: 'Webhooks', icon: 'bx-link', route: '/webhooks', permission: 'integrations:manage' },
  { label: 'Documents', icon: 'bx-file', route: '/documents', permission: 'settings:view' },
  { label: 'Integrations', icon: 'bx-link-alt', route: '/integrated-vendors', permission: 'integrations:view' },
  { label: 'EDI', icon: 'bx-transfer', route: '/edi', permission: 'integrations:manage' },
  { label: 'Database', icon: 'bx-data', route: '/database', permission: 'admin:full' },
  { label: 'Import Wizard', icon: 'bx-import', route: '/import-wizard', permission: 'settings:edit' },
  { label: 'Notifications', icon: 'bx-bell', route: '/notifications', permission: 'settings:view' },
  { label: 'Chat', icon: 'bx-message-rounded-dots', route: '/chat' },
  // Admin
  { label: 'Users', icon: 'bx-user-circle', route: '/users', section: 'Admin', permission: 'users:view' },
  { label: 'Structure', icon: 'bx-sitemap', route: '/structure', permission: 'organizations:view' },
  { label: 'Roles & Permissions', icon: 'bx-lock-alt', route: '/admin/roles', permission: 'users:manage_roles' },
  { label: 'Audit Logs', icon: 'bx-history', route: '/admin/audit', permission: 'audit:view' },
  { label: 'Invite Users', icon: 'bx-user-plus', route: '/admin/invitations', permission: 'users:invite' },
  // Accounting
  { label: 'General Ledger', icon: 'bx-book', route: '/accounting/general-ledger', section: 'Accounting', permission: 'finance:view' },
  { label: 'Accounts Payable', icon: 'bx-credit-card-alt', route: '/accounting/payable', permission: 'payables:view' },
  { label: 'Accounts Receivable', icon: 'bx-wallet', route: '/accounting/receivable', permission: 'invoices:view' },
  { label: 'Profit & Loss', icon: 'bx-line-chart', route: '/accounting/profit-loss', permission: 'finance:view' },
  { label: 'Balance Sheet', icon: 'bx-bar-chart-square', route: '/accounting/balance-sheet', permission: 'finance:view' },
  { label: 'Cash Flow', icon: 'bx-transfer', route: '/accounting/cash-flow', permission: 'finance:view' },
  { label: 'Bank Reconciliation', icon: 'bx-check-double', route: '/accounting/bank-recon', permission: 'finance:manage' },
  { label: 'Tax Reports', icon: 'bx-file', route: '/accounting/tax-reports', permission: 'finance:view' },
  { label: 'Budgeting', icon: 'bx-target-lock', route: '/accounting/budgeting', permission: 'finance:manage' },
  { label: 'CPM Analysis', icon: 'bx-analyse', route: '/accounting/cpm', permission: 'finance:view' },
  // Market Analysis
  { label: 'Market Analysis', icon: 'bx-trending-up', route: '/market-analysis', section: 'Market Analysis', permission: 'reports:view' },
  // Compliance
  { label: 'Driver Compliance', icon: 'bx-group', route: '/compliance/driver-database', section: 'Compliance', permission: 'compliance:view' },
  { label: 'Registrations & Authority', icon: 'bx-id-card', route: '/compliance/registrations', permission: 'compliance:view' },
  { label: 'Insurance & Financial', icon: 'bx-dollar-circle', route: '/compliance/insurance', permission: 'compliance:view' },
  { label: 'Driver Qualification Files', icon: 'bx-folder-open', route: '/compliance/driver-files', permission: 'compliance:view' },
  { label: 'Drug & Alcohol Testing', icon: 'bx-test-tube', route: '/compliance/drug-testing', permission: 'compliance:view' },
  { label: 'Hours of Service (HOS)', icon: 'bx-time', route: '/compliance/hos', permission: 'compliance:view' },
  { label: 'Vehicle Inspections', icon: 'bx-check-shield', route: '/compliance/vehicle-inspections', permission: 'compliance:view' },
  { label: 'DOT Compliance', icon: 'bx-shield-alt-2', route: '/compliance/dot', permission: 'compliance:view' },
  // Landstar
  { label: 'Landstar Dashboard', icon: 'bxs-analyse', route: '/landstar-dashboard', section: 'Landstar', permission: 'loads:view' },
  { label: 'Load Board', icon: 'bx-list-check', route: '/landstar-loadboard', permission: 'loads:view' },
  { label: 'Shipments', icon: 'bx-package', route: '/landstar-shipments', permission: 'shipments:view' },
  { label: 'Bill To', icon: 'bx-receipt', route: '/landstar-billto', permission: 'invoices:view' },
  { label: 'Heat Map', icon: 'bx-map-alt', route: '/landstar-heatmap', permission: 'loads:view' },
  // Gmail
  { label: 'Gmail', icon: 'bx-envelope', route: '/gmail', section: 'Gmail', permission: 'integrations:view' },
  // API
  { label: 'Landstar API', icon: 'bx-globe', route: '/landstar-api', section: 'API', permission: 'integrations:view' },
  { label: 'Gmail API', icon: 'bx-envelope', route: '/communications/gmail', permission: 'integrations:view' },
  { label: 'Zoom API', icon: 'bx-video', route: '/communications/zoom', permission: 'integrations:view' },
  { label: 'Google Maps API', icon: 'bx-map', route: '/api/google-maps', permission: 'integrations:view' },
  // Tools
  { label: 'Bulk Import', icon: 'bx-import', route: '/bulk-import', section: 'Tools', permission: 'settings:edit' },
  { label: 'Report Builder', icon: 'bx-bar-chart-alt-2', route: '/report-builder', permission: 'reports:create' },
  { label: 'Mileage Calculator', icon: 'bx-map-alt', route: '/mileage-calculator' },
  { label: 'Contacts', icon: 'bx-user', route: '/contacts', permission: 'contacts:view' },
  { label: 'Places', icon: 'bx-map-pin', route: '/places', permission: 'places:view' },
  { label: 'Geocoder', icon: 'bx-crosshair', route: '/geocoder', permission: 'settings:view' },
  { label: 'Service Zones', icon: 'bx-shape-polygon', route: '/service-zones', permission: 'settings:view' },
  { label: 'Navigator Setup', icon: 'bx-mobile-alt', route: '/navigator-setup', permission: 'settings:edit' },
  { label: 'Scheduled Events', icon: 'bx-calendar-event', route: '/scheduled-events', permission: 'settings:view' },
  { label: 'Integrations', icon: 'bx-plug', route: '/integrations', permission: 'integrations:view' },
  { label: 'Documentation', icon: 'bx-book-open', route: '/user-manual' },
  { label: '2FA Settings', icon: 'bx-shield-quarter', route: '/settings/2fa', permission: 'settings:view' }
];

/** Build a route-to-section lookup map */
export function buildRouteSectionMap(): Map<string, string> {
  const map = new Map<string, string>();
  let currentSection = '';
  for (const item of ALL_NAV_ITEMS) {
    if (item.section) currentSection = item.section;
    map.set(item.route, currentSection);
  }
  return map;
}

/** Group nav items into sections */
export interface NavSection {
  name: string;
  items: NavItemDefinition[];
}

export function getNavSections(): NavSection[] {
  const sections: NavSection[] = [];
  let current: NavSection | null = null;

  for (const item of ALL_NAV_ITEMS) {
    if (item.section) {
      current = { name: item.section, items: [] };
      sections.push(current);
    }
    if (current) {
      current.items.push(item);
    }
  }

  return sections;
}
