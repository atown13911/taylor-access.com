export const environment = {
  production: true,
  apiUrl: 'https://taylor-accesscom-production.up.railway.app',
  appName: 'Taylor Access HR',
  version: '1.0.0',
  api: {
    auth: '/api/v1/auth',
    users: '/api/v1/users',
    organizations: '/api/v1/organizations',
    password: '/api/v1/password',
    roles: '/api/v1/roles',
    audit: '/api/v1/audit',
    dashboard: '/api/v1/dashboard',
    twoFactor: '/api/v1/2fa',
    invitations: '/api/v1/invitations',
    bulk: '/api/v1/bulk',
  }
};
