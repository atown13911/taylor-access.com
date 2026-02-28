export interface NavItemDefinition {
  label: string;
  icon: string;
  route: string;
  section?: string;
  roles?: string[];
}

export const ALL_NAV_ITEMS: NavItemDefinition[] = [
  // Dashboards
  { label: 'Main Dashboard', icon: 'bx-home', route: '/dashboard', section: 'Dashboards' },
  { label: 'Overview Dashboard', icon: 'bx-stats', route: '/overview' },
  { label: 'OTR Dashboard', icon: 'bxs-truck', route: '/otr/dashboard' },
  { label: 'Drayage Dashboard', icon: 'bxs-ship', route: '/drayage-ops/dashboard' },
  { label: 'Brokerage Dashboard', icon: 'bxs-analyse', route: '/brokerage-ops/dashboard' },
  { label: 'HR Dashboard', icon: 'bx-group', route: '/hr' },
  // Operations
  { label: 'Dispatch', icon: 'bx-broadcast', route: '/dispatch', section: 'Operations' },
  { label: 'Routes', icon: 'bx-trip', route: '/routes' },
  // Tracking & Telematics
  { label: 'Live Map', icon: 'bx-map', route: '/live-map', section: 'Tracking' },
  { label: 'Positions', icon: 'bx-current-location', route: '/positions' },
  { label: 'Telematics', icon: 'bx-wifi', route: '/telematics' },
  { label: 'Devices', icon: 'bx-devices', route: '/devices' },
  { label: 'Sensors', icon: 'bx-chip', route: '/sensors' },
  // Shipments & Orders
  { label: 'Load Board', icon: 'bx-list-check', route: '/load-board', section: 'Shipments' },
  { label: 'OTR Shipments', icon: 'bx-package', route: '/shipments' },
  { label: 'Drayage', icon: 'bx-cube', route: '/drayage' },
  { label: 'Brokerage', icon: 'bx-transfer-alt', route: '/brokerage' },
  { label: 'Orders', icon: 'bx-receipt', route: '/orders' },
  { label: 'Payloads', icon: 'bx-cube-alt', route: '/payloads' },
  { label: 'Entities', icon: 'bx-cube', route: '/entities' },
  { label: 'Labels', icon: 'bx-purchase-tag', route: '/labels' },
  { label: 'Proofs', icon: 'bx-check-shield', route: '/proofs' },
  // Fleet
  { label: 'Driver Roster', icon: 'bx-id-card', route: '/drivers', section: 'Fleet' },
  { label: 'Carriers', icon: 'bxs-truck', route: '/carriers' },
  { label: 'Vehicles', icon: 'bx-car', route: '/vehicles' },
  { label: 'Fleet Mgmt', icon: 'bx-group', route: '/fleets' },
  { label: 'Fleet Entities', icon: 'bx-collection', route: '/admin/fleet-entities' },
  { label: 'Fuel Reports', icon: 'bxs-gas-pump', route: '/fuel-reports' },
  // Equipment
  { label: 'Equipment', icon: 'bx-cabinet', route: '/equipment', section: 'Equipment' },
  { label: 'Work Orders', icon: 'bx-wrench', route: '/work-orders' },
  { label: 'Trailer Utilization', icon: 'bx-cabinet', route: '/trailer-utilization' },
  { label: 'Trailer Vendors', icon: 'bx-building', route: '/trailer-vendors' },
  // Maintenance
  { label: 'PM/Compliance', icon: 'bx-cog', route: '/maintenance', section: 'PM/Compliance' },
  { label: 'Parts', icon: 'bx-package', route: '/parts' },
  { label: 'Warranties', icon: 'bx-shield-quarter', route: '/warranties' },
  // Support
  { label: 'Issues', icon: 'bx-error-circle', route: '/issues', section: 'Support' },
  { label: 'Support Tickets', icon: 'bx-support', route: '/tickets' },
  // Finance
  { label: 'Transport Financial', icon: 'bx-dollar-circle', route: '/financial', section: 'Finance' },
  { label: 'Account Mgmt', icon: 'bx-briefcase-alt-2', route: '/account-mgmt' },
  { label: 'Bank Accounts', icon: 'bxs-bank', route: '/bank-accounts' },
  { label: 'Transport Invoices', icon: 'bx-receipt', route: '/invoices' },
  { label: 'Payables', icon: 'bx-credit-card-alt', route: '/payables' },
  { label: 'Payments', icon: 'bx-credit-card', route: '/payments' },
  { label: 'Internal Invoices', icon: 'bx-transfer', route: '/internal-invoices' },
  { label: 'Cost Allocation', icon: 'bx-pie-chart-alt-2', route: '/cost-allocation' },
  { label: 'Quotes', icon: 'bx-calculator', route: '/service-quotes' },
  { label: 'Rates', icon: 'bx-purchase-tag-alt', route: '/purchase-rates' },
  { label: 'Reports', icon: 'bx-bar-chart-alt-2', route: '/reports' },
  { label: 'Metrics', icon: 'bx-line-chart', route: '/metrics' },
  { label: 'Factoring', icon: 'bx-coin-stack', route: '/factoring' },
  { label: 'Deductions', icon: 'bx-minus-circle', route: '/deductions' },
  { label: 'Vendor Invoicing', icon: 'bx-receipt', route: '/finance/vendor-invoicing' },
  { label: 'Finance Settings', icon: 'bx-cog', route: '/finance/settings' },
  // HR & People
  { label: 'Employee Roster', icon: 'bx-id-card', route: '/hr/roster', section: 'HR & People' },
  { label: 'Payroll Parameters', icon: 'bx-wallet', route: '/payroll' },
  { label: 'Paychecks', icon: 'bx-money', route: '/hr/paychecks' },
  { label: 'Time Off', icon: 'bx-calendar-event', route: '/hr/time-off' },
  { label: 'Attendance', icon: 'bx-time-five', route: '/hr/attendance' },
  { label: 'Timesheets', icon: 'bx-spreadsheet', route: '/hr/timesheets' },
  { label: 'Benefits', icon: 'bx-health', route: '/hr/benefits' },
  { label: 'Performance Reviews', icon: 'bx-bar-chart-square', route: '/hr/performance-reviews' },
  { label: 'HR Documents', icon: 'bx-folder-open', route: '/hr/documents' },
  { label: 'HR Settings', icon: 'bx-cog', route: '/hr/settings' },
  // Sales
  { label: 'Sales CRM', icon: 'bx-line-chart', route: '/sales', section: 'Sales' },
  // Recruiting
  { label: 'Recruiting Platform', icon: 'bx-user-plus', route: '/recruiting', section: 'Recruiting' },
  { label: 'Job Postings', icon: 'bx-briefcase-alt-2', route: '/recruiting/job-postings' },
  { label: 'Applications', icon: 'bx-file', route: '/recruiting/applications' },
  // System
  { label: 'Order Configs', icon: 'bx-customize', route: '/order-configs', section: 'System' },
  { label: 'Service Rates', icon: 'bx-dollar', route: '/service-rates' },
  { label: 'Webhooks', icon: 'bx-link', route: '/webhooks' },
  { label: 'Documents', icon: 'bx-file', route: '/documents' },
  { label: 'Integrations', icon: 'bx-link-alt', route: '/integrated-vendors' },
  { label: 'EDI', icon: 'bx-transfer', route: '/edi' },
  { label: 'Database', icon: 'bx-data', route: '/database' },
  { label: 'Import Wizard', icon: 'bx-import', route: '/import-wizard' },
  { label: 'Notifications', icon: 'bx-bell', route: '/notifications' },
  { label: 'Chat', icon: 'bx-message-rounded-dots', route: '/chat' },
  // Admin
  { label: 'Users', icon: 'bx-user-circle', route: '/users', section: 'Admin' },
  { label: 'Structure', icon: 'bx-sitemap', route: '/structure' },
  { label: 'Roles & Permissions', icon: 'bx-lock-alt', route: '/admin/roles' },
  { label: 'Audit Logs', icon: 'bx-history', route: '/admin/audit' },
  { label: 'Invite Users', icon: 'bx-user-plus', route: '/admin/invitations' },
  // Accounting
  { label: 'General Ledger', icon: 'bx-book', route: '/accounting/general-ledger', section: 'Accounting' },
  { label: 'Accounts Payable', icon: 'bx-credit-card-alt', route: '/accounting/payable' },
  { label: 'Accounts Receivable', icon: 'bx-wallet', route: '/accounting/receivable' },
  { label: 'Profit & Loss', icon: 'bx-line-chart', route: '/accounting/profit-loss' },
  { label: 'Balance Sheet', icon: 'bx-bar-chart-square', route: '/accounting/balance-sheet' },
  { label: 'Cash Flow', icon: 'bx-transfer', route: '/accounting/cash-flow' },
  { label: 'Bank Reconciliation', icon: 'bx-check-double', route: '/accounting/bank-recon' },
  { label: 'Tax Reports', icon: 'bx-file', route: '/accounting/tax-reports' },
  { label: 'Budgeting', icon: 'bx-target-lock', route: '/accounting/budgeting' },
  { label: 'CPM Analysis', icon: 'bx-analyse', route: '/accounting/cpm' },
  // Market Analysis
  { label: 'Market Analysis', icon: 'bx-trending-up', route: '/market-analysis', section: 'Market Analysis' },
  // Compliance
  { label: 'Driver Compliance', icon: 'bx-group', route: '/compliance/driver-database', section: 'Compliance' },
  { label: 'Registrations & Authority', icon: 'bx-id-card', route: '/compliance/registrations' },
  { label: 'Insurance & Financial', icon: 'bx-dollar-circle', route: '/compliance/insurance' },
  { label: 'Driver Qualification Files', icon: 'bx-folder-open', route: '/compliance/driver-files' },
  { label: 'Drug & Alcohol Testing', icon: 'bx-test-tube', route: '/compliance/drug-testing' },
  { label: 'Hours of Service (HOS)', icon: 'bx-time', route: '/compliance/hos' },
  { label: 'Vehicle Inspections', icon: 'bx-check-shield', route: '/compliance/vehicle-inspections' },
  { label: 'DOT Compliance', icon: 'bx-shield-alt-2', route: '/compliance/dot' },
  // Landstar
  { label: 'Landstar Dashboard', icon: 'bxs-analyse', route: '/landstar-dashboard', section: 'Landstar' },
  { label: 'Load Board', icon: 'bx-list-check', route: '/landstar-loadboard' },
  { label: 'Shipments', icon: 'bx-package', route: '/landstar-shipments' },
  { label: 'Bill To', icon: 'bx-receipt', route: '/landstar-billto' },
  { label: 'Heat Map', icon: 'bx-map-alt', route: '/landstar-heatmap' },
  // Gmail
  { label: 'Gmail', icon: 'bx-envelope', route: '/gmail', section: 'Gmail' },
  // API
  { label: 'Landstar API', icon: 'bx-globe', route: '/landstar-api', section: 'API' },
  { label: 'Gmail API', icon: 'bx-envelope', route: '/communications/gmail' },
  { label: 'Zoom API', icon: 'bx-video', route: '/communications/zoom' },
  { label: 'Google Maps API', icon: 'bx-map', route: '/api/google-maps' },
  // Tools
  { label: 'Bulk Import', icon: 'bx-import', route: '/bulk-import', section: 'Tools' },
  { label: 'Report Builder', icon: 'bx-bar-chart-alt-2', route: '/report-builder' },
  { label: 'Mileage Calculator', icon: 'bx-map-alt', route: '/mileage-calculator' },
  { label: 'Contacts', icon: 'bx-user', route: '/contacts' },
  { label: 'Places', icon: 'bx-map-pin', route: '/places' },
  { label: 'Geocoder', icon: 'bx-crosshair', route: '/geocoder' },
  { label: 'Service Zones', icon: 'bx-shape-polygon', route: '/service-zones' },
  { label: 'Navigator Setup', icon: 'bx-mobile-alt', route: '/navigator-setup' },
  { label: 'Scheduled Events', icon: 'bx-calendar-event', route: '/scheduled-events' },
  { label: 'Integrations', icon: 'bx-plug', route: '/integrations' },
  { label: 'Documentation', icon: 'bx-book-open', route: '/user-manual' },
  { label: '2FA Settings', icon: 'bx-shield-quarter', route: '/settings/2fa' }
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
