const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:PdMRjqwZUlmsOwRQtxGiUVUdAjWGuxXw@maglev.proxy.rlwy.net:57249/railway' });
c.connect().then(async () => {
  await c.query('ALTER TABLE "Drivers" ADD COLUMN IF NOT EXISTS "TruckNumber" TEXT');
  console.log('Added TruckNumber column to Drivers');
  await c.end();
}).catch(e => console.error(e.message));
