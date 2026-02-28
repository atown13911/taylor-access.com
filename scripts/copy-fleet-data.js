const { Client } = require('pg');

// VanTac DB (source)
const SOURCE_URL = process.env.VANTAC_DB_URL || 'postgresql://postgres:HCBxSXAbVdPyfrgJINqtPmHJzIOVtmEZ@monorail.proxy.rlwy.net:24513/railway';

// Taylor Access DB (target)
const TARGET_URL = process.env.TA_DB_URL || 'postgresql://postgres:qFhaNNMTxJhBMRLPHOxvuKdjeMRFJDfH@ballast.proxy.rlwy.net:40312/railway';

async function run() {
  const src = new Client({ connectionString: SOURCE_URL });
  const tgt = new Client({ connectionString: TARGET_URL });

  await src.connect();
  await tgt.connect();
  console.log('Connected to both databases');

  // 1. Create tables if they don't exist
  await tgt.query(`
    CREATE TABLE IF NOT EXISTS "Fleets" (
      "Id" SERIAL PRIMARY KEY,
      "OrganizationId" INTEGER NOT NULL DEFAULT 0,
      "Name" TEXT NOT NULL DEFAULT '',
      "Description" TEXT,
      "Status" TEXT NOT NULL DEFAULT 'active',
      "Task" TEXT,
      "ParentFleetId" INTEGER,
      "CreatedAt" TIMESTAMP DEFAULT NOW(),
      "UpdatedAt" TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "Vehicles" (
      "Id" SERIAL PRIMARY KEY,
      "Name" TEXT NOT NULL DEFAULT '',
      "Make" TEXT,
      "Model" TEXT,
      "Year" INTEGER,
      "Vin" TEXT,
      "PlateNumber" TEXT,
      "PlateState" TEXT,
      "Status" TEXT NOT NULL DEFAULT 'active',
      "OrganizationId" INTEGER,
      "FleetId" INTEGER,
      "CreatedAt" TIMESTAMP DEFAULT NOW(),
      "UpdatedAt" TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "FleetDrivers" (
      "FleetId" INTEGER NOT NULL,
      "DriverId" INTEGER NOT NULL,
      "AssignedAt" TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY ("FleetId", "DriverId")
    );

    CREATE TABLE IF NOT EXISTS "FleetVehicles" (
      "FleetId" INTEGER NOT NULL,
      "VehicleId" INTEGER NOT NULL,
      "AssignedAt" TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY ("FleetId", "VehicleId")
    );
  `);
  console.log('Tables created/verified');

  // 2. Copy Fleets
  const { rows: fleets } = await src.query('SELECT * FROM "Fleets" ORDER BY "Id"');
  console.log(`Found ${fleets.length} fleets in source`);

  for (const f of fleets) {
    await tgt.query(`
      INSERT INTO "Fleets" ("Id", "OrganizationId", "Name", "Description", "Status", "Task", "ParentFleetId", "CreatedAt", "UpdatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT ("Id") DO UPDATE SET
        "Name" = EXCLUDED."Name",
        "Description" = EXCLUDED."Description",
        "Status" = EXCLUDED."Status",
        "UpdatedAt" = NOW()
    `, [f.Id, f.OrganizationId || 0, f.Name, f.Description, f.Status || 'active', f.Task, f.ParentFleetId, f.CreatedAt, f.UpdatedAt]);
  }
  console.log(`Copied ${fleets.length} fleets`);

  // Reset sequence
  if (fleets.length > 0) {
    const maxId = Math.max(...fleets.map(f => f.Id));
    await tgt.query(`SELECT setval('"Fleets_Id_seq"', $1, true)`, [maxId]);
  }

  // 3. Copy Vehicles if they exist in source
  try {
    const { rows: vehicles } = await src.query('SELECT * FROM "Vehicles" ORDER BY "Id"');
    console.log(`Found ${vehicles.length} vehicles in source`);

    for (const v of vehicles) {
      await tgt.query(`
        INSERT INTO "Vehicles" ("Id", "Name", "Make", "Model", "Year", "Vin", "PlateNumber", "PlateState", "Status", "OrganizationId", "FleetId", "CreatedAt", "UpdatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT ("Id") DO UPDATE SET
          "Name" = EXCLUDED."Name",
          "Status" = EXCLUDED."Status",
          "UpdatedAt" = NOW()
      `, [v.Id, v.Name || '', v.Make, v.Model, v.Year, v.Vin, v.PlateNumber, v.PlateState, v.Status || 'active', v.OrganizationId, v.FleetId, v.CreatedAt, v.UpdatedAt]);
    }
    console.log(`Copied ${vehicles.length} vehicles`);

    if (vehicles.length > 0) {
      const maxId = Math.max(...vehicles.map(v => v.Id));
      await tgt.query(`SELECT setval('"Vehicles_Id_seq"', $1, true)`, [maxId]);
    }
  } catch (e) {
    console.log('No Vehicles table in source or error:', e.message);
  }

  // 4. Copy FleetDrivers
  try {
    const { rows: fd } = await src.query('SELECT * FROM "FleetDrivers"');
    console.log(`Found ${fd.length} fleet-driver assignments`);

    for (const r of fd) {
      await tgt.query(`
        INSERT INTO "FleetDrivers" ("FleetId", "DriverId", "AssignedAt")
        VALUES ($1, $2, $3)
        ON CONFLICT ("FleetId", "DriverId") DO NOTHING
      `, [r.FleetId, r.DriverId, r.AssignedAt]);
    }
    console.log(`Copied ${fd.length} fleet-driver assignments`);
  } catch (e) {
    console.log('FleetDrivers copy error:', e.message);
  }

  // 5. Copy FleetVehicles
  try {
    const { rows: fv } = await src.query('SELECT * FROM "FleetVehicles"');
    console.log(`Found ${fv.length} fleet-vehicle assignments`);

    for (const r of fv) {
      await tgt.query(`
        INSERT INTO "FleetVehicles" ("FleetId", "VehicleId", "AssignedAt")
        VALUES ($1, $2, $3)
        ON CONFLICT ("FleetId", "VehicleId") DO NOTHING
      `, [r.FleetId, r.VehicleId, r.AssignedAt]);
    }
    console.log(`Copied ${fv.length} fleet-vehicle assignments`);
  } catch (e) {
    console.log('FleetVehicles copy error:', e.message);
  }

  console.log('\nDone! Fleet data migration complete.');
  await src.end();
  await tgt.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
