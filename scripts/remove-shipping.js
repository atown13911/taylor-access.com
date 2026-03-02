const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:PdMRjqwZUlmsOwRQtxGiUVUdAjWGuxXw@maglev.proxy.rlwy.net:57249/railway' });
c.connect().then(async () => {
  await c.query('DELETE FROM "AppRoleAssignments" WHERE "AppClientId" = $1', ['ta_taylor_shipping']);
  await c.query('DELETE FROM "OAuthClients" WHERE "ClientId" = $1', ['ta_taylor_shipping']);
  console.log('Deleted Taylor Shipping Solutions');
  await c.end();
}).catch(e => console.error(e.message));
