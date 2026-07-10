import { Injectable } from '@angular/core';

const ADMIN_ROLES = new Set(['product_owner', 'superadmin', 'admin', 'development']);

const ROLE_CLAIM_KEYS = [
  'role',
  'Role',
  'app_role',
  'appRole',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
];

const FINANCIAL_NAV_ROUTES = new Set([
  '/dashboard',
  '/compliance/insurance',
  '/compliance/driver-database',
  '/hr/payroll',
  '/hr/roster',
  '/drivers',
  '/profile',
  '/settings',
  '/settings/2fa',
  '/hr/my-profile'
]);

const ALWAYS_ALLOWED_ROUTES = new Set([
  '/dashboard',
  '/',
  '/profile',
  '/settings',
  '/settings/2fa',
  '/hr/my-profile',
  '/satellites',
  '/finance/vendor-invoicing',
  '/structure',
  '/organizations',
  '/users',
  '/compliance/tags-permits',
  '/compliance/insurance',
  '/compliance/driver-database',
  '/compliance/dot',
  '/compliance/registrations',
]);

@Injectable({ providedIn: 'root' })
export class NavPermissionService {
  isAdminRole(role?: string | null): boolean {
    return ADMIN_ROLES.has((role || '').trim().toLowerCase());
  }

  isFinancialRole(role?: string | null): boolean {
    return (role || '').trim().toLowerCase() === 'financial';
  }

  /** Collect all role strings from a JWT payload (handles arrays and duplicate claims). */
  parseRoles(payload: Record<string, unknown> | null | undefined): string[] {
    if (!payload) return [];
    const out = new Set<string>();

    const add = (raw: unknown) => {
      if (raw == null) return;
      if (Array.isArray(raw)) {
        raw.forEach(add);
        return;
      }
      const text = String(raw).trim();
      if (!text) return;
      for (const part of text.split(',')) {
        const role = part.trim().toLowerCase();
        if (role) out.add(role);
      }
    };

    for (const key of ROLE_CLAIM_KEYS) {
      add(payload[key]);
    }

    return Array.from(out);
  }

  /** Prefer Portal system admin role when user is a global admin launching an app. */
  resolveStoredRole(payload: Record<string, unknown>): string {
    const roles = this.parseRoles(payload);
    const adminRole = roles.find((role) => this.isAdminRole(role));
    if (adminRole) return adminRole;

    const appRole = String(payload['app_role'] ?? payload['appRole'] ?? '').trim().toLowerCase();
    if (appRole) return appRole;

    return roles[0] || 'user';
  }

  resolveEffectiveRole(payload: Record<string, unknown> | null | undefined, storedRole?: string | null): string {
    if (payload) {
      const fromToken = this.resolveStoredRole(payload);
      if (fromToken && fromToken !== 'user') return fromToken;
    }
    return (storedRole || 'user').trim().toLowerCase() || 'user';
  }

  hasAnyRole(roles: string[], candidates: Set<string>): boolean {
    return roles.some((role) => candidates.has(role.trim().toLowerCase()));
  }

  canAccessRoute(
    route: string,
    role: string | undefined | null,
    permissions: string[],
    allRoles: string[] = []
  ): boolean {
    const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
    const roleSet = new Set<string>([
      ...allRoles.map((r) => r.trim().toLowerCase()),
      (role || '').trim().toLowerCase(),
    ].filter(Boolean));

    if (Array.from(roleSet).some((r) => this.isAdminRole(r))) return true;
    if (ALWAYS_ALLOWED_ROUTES.has(normalizedRoute)) return true;

    const navPerms = permissions.filter((p) => p.startsWith('nav:') && p !== 'nav:configured');
    const hasComplianceAccess =
      permissions.includes('compliance:view') ||
      permissions.includes('compliance:manage') ||
      permissions.includes('finance:view') ||
      permissions.includes('finance:manage');

    if (Array.from(roleSet).some((r) => this.isFinancialRole(r)) || hasComplianceAccess) {
      if (FINANCIAL_NAV_ROUTES.has(normalizedRoute)) return true;
      if (normalizedRoute.startsWith('/compliance/')) return true;
    }

    if (navPerms.length === 0) return true;

    const allowedRoutes = new Set(navPerms.map((p) => p.substring(4)));
    if (allowedRoutes.has(normalizedRoute)) return true;

    const sectionAllowed = Array.from(allowedRoutes).some((allowed) => {
      const normalized = String(allowed || '').trim();
      if (!normalized) return false;
      if (!normalized.startsWith('/')) {
        return normalizedRoute.startsWith(`/${normalized}/`) || normalizedRoute === `/${normalized}`;
      }
      return normalizedRoute.startsWith(`${normalized}/`) || normalizedRoute === normalized;
    });

    return sectionAllowed;
  }
}
