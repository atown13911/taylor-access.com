const { Client } = require('pg');

const SOURCE_URL = 'postgresql://postgres:FvvaZajshbyeSurLBYhxSegTipctVVjH@interchange.proxy.rlwy.net:41778/railway';
const TARGET_URL = 'postgresql://postgres:PdMRjqwZUlmsOwRQtxGiUVUdAjWGuxXw@maglev.proxy.rlwy.net:57249/railway';

async function copyTable(src, tgt, table, idCol = 'Id') {
  try {
    const { rows } = await src.query(`SELECT * FROM "${table}" ORDER BY "${idCol}"`);
    console.log(`${table}: ${rows.length} rows in source`);
    if (rows.length === 0) return;

    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(', ');
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

    for (const row of rows) {
      const vals = cols.map(c => row[c]);
      try {
        await tgt.query(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("${idCol}") DO NOTHING`, vals);
      } catch (e) {
        // Table might not exist, try creating it
        if (e.message.includes('does not exist')) {
          console.log(`  Table "${table}" does not exist in target, creating...`);
          const colDefs = cols.map(c => {
            const v = row[c];
            if (c === idCol) return `"${c}" SERIAL PRIMARY KEY`;
            if (typeof v === 'number') return `"${c}" ${Number.isInteger(v) ? 'INTEGER' : 'DOUBLE PRECISION'}`;
            if (typeof v === 'boolean') return `"${c}" BOOLEAN`;
            if (v instanceof Date) return `"${c}" TIMESTAMP`;
            return `"${c}" TEXT`;
          }).join(', ');
          await tgt.query(`CREATE TABLE IF NOT EXISTS "${table}" (${colDefs})`);
          await tgt.query(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("${idCol}") DO NOTHING`, vals);
        }
      }
    }

    // Reset sequence
    const maxId = Math.max(...rows.map(r => r[idCol]));
    try {
      await tgt.query(`SELECT setval('"${table}_${idCol}_seq"', $1, true)`, [maxId]);
    } catch {}

    console.log(`  Copied ${rows.length} rows`);
  } catch (e) {
    console.log(`${table}: ${e.message}`);
  }
}

async function run() {
  const src = new Client({ connectionString: SOURCE_URL });
  const tgt = new Client({ connectionString: TARGET_URL });
  await src.connect();
  await tgt.connect();
  console.log('Connected\n');

  await copyTable(src, tgt, 'InsurancePolicies');
  await copyTable(src, tgt, 'InsuranceEnrollments');

  console.log('\nDone!');
  await src.end();
  await tgt.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
