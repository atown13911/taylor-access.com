const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:PdMRjqwZUlmsOwRQtxGiUVUdAjWGuxXw@maglev.proxy.rlwy.net:57249/railway' });
c.connect().then(async () => {
  await c.query('ALTER TABLE "Drivers" ADD COLUMN IF NOT EXISTS "FleetId" INTEGER');
  await c.query('ALTER TABLE "Drivers" ADD COLUMN IF NOT EXISTS "Ssn" TEXT');
  console.log('Added FleetId and Ssn columns to Drivers');
  await c.end();
}).catch(e => console.error(e.message));
