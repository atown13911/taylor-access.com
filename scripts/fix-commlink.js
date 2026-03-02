const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:PdMRjqwZUlmsOwRQtxGiUVUdAjWGuxXw@maglev.proxy.rlwy.net:57249/railway' });
c.connect().then(async () => {
  // Check what exists
  const { rows } = await c.query(`SELECT "Id", "ClientId", "Name" FROM "OAuthClients" WHERE "ClientId" LIKE '%commlink%' OR "Name" ILIKE '%commlink%'`);
  console.log('CommLink clients found:', rows);

  // Delete the old one (ta_commlink), keep ta_taylor_commlink
  if (rows.length > 1) {
    const old = rows.find(r => r.ClientId === 'ta_commlink');
    if (old) {
      await c.query(`DELETE FROM "AppRoleAssignments" WHERE "AppClientId" = 'ta_commlink'`);
      await c.query(`DELETE FROM "OAuthClients" WHERE "ClientId" = 'ta_commlink'`);
      console.log('Deleted duplicate ta_commlink');
    }
  }

  // Verify
  const { rows: after } = await c.query(`SELECT "ClientId", "Name" FROM "OAuthClients" WHERE "ClientId" LIKE '%commlink%'`);
  console.log('After cleanup:', after);

  await c.end();
}).catch(e => console.error(e.message));
