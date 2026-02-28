const { Client } = require('pg');

async function run() {
  const url = process.env.DATABASE_URL;
  console.log('DATABASE_URL:', url ? url.replace(/:[^:@]+@/, ':***@') : 'NOT SET');

  if (!url) { console.log('No DATABASE_URL'); process.exit(1); }

  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();

  // List all tables
  const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
  console.log('\nAll tables:', tables.rows.map(r => r.tablename).join(', '));

  // Check Fleets table
  try {
    const count = await client.query('SELECT COUNT(*) as cnt FROM "Fleets"');
    console.log('\nFleets row count:', count.rows[0].cnt);

    if (parseInt(count.rows[0].cnt) > 0) {
      const sample = await client.query('SELECT "Id", "Name", "Status", "OrganizationId", "ParentFleetId" FROM "Fleets" LIMIT 5');
      console.log('Sample fleets:', JSON.stringify(sample.rows, null, 2));
    }
  } catch (e) {
    console.log('Fleets table error:', e.message);
  }

  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
