const { Client } = require('pg');

const SOURCE_URL = 'postgresql://postgres:FvvaZajshbyeSurLBYhxSegTipctVVjH@interchange.proxy.rlwy.net:41778/railway';
const TARGET_URL = 'postgresql://postgres:PdMRjqwZUlmsOwRQtxGiUVUdAjWGuxXw@maglev.proxy.rlwy.net:57249/railway';

async function run() {
  const src = new Client({ connectionString: SOURCE_URL });
  const tgt = new Client({ connectionString: TARGET_URL });
  await src.connect();
  await tgt.connect();

  // Check source
  try {
    const srcCount = await src.query('SELECT COUNT(*) as cnt FROM "EmployeeDocuments"');
    console.log('VanTac EmployeeDocuments:', srcCount.rows[0].cnt, 'rows');
  } catch (e) { console.log('VanTac EmployeeDocuments:', e.message); }

  // Check target
  try {
    const tgtCount = await tgt.query('SELECT COUNT(*) as cnt FROM "EmployeeDocuments"');
    console.log('Taylor Access EmployeeDocuments:', tgtCount.rows[0].cnt, 'rows');
  } catch (e) { console.log('Taylor Access EmployeeDocuments:', e.message); }

  // Check what other HR tables exist in target
  const tables = await tgt.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Employee%' ORDER BY tablename`);
  console.log('\nEmployee tables in Taylor Access:', tables.rows.map(r => r.tablename).join(', '));

  await src.end();
  await tgt.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
