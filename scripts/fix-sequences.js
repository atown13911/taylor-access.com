const { Client } = require('pg');
const TARGET_URL = 'postgresql://postgres:PdMRjqwZUlmsOwRQtxGiUVUdAjWGuxXw@maglev.proxy.rlwy.net:57249/railway';

async function fixTable(client, table) {
  try {
    const { rows } = await client.query(`SELECT MAX("Id") as max_id FROM "${table}"`);
    const maxId = rows[0].max_id || 0;
    const seq = `${table}_Id_seq`;
    await client.query(`CREATE SEQUENCE IF NOT EXISTS "${seq}" OWNED BY "${table}"."Id"`);
    await client.query(`SELECT setval('"${seq}"', $1, true)`, [Math.max(maxId, 1)]);
    await client.query(`ALTER TABLE "${table}" ALTER COLUMN "Id" SET DEFAULT nextval('"${seq}"')`);
    console.log(`${table}: fixed (next Id = ${maxId + 1})`);
  } catch (e) {
    console.log(`${table}: ${e.message}`);
  }
}

async function run() {
  const client = new Client({ connectionString: TARGET_URL });
  await client.connect();

  const tables = [
    'Addresses', 'Drivers', 'Divisions', 'DriverTerminals',
    'DriverDocuments', 'DriverPaySheets', 'DriverPayments',
    'InsurancePolicies', 'InsuranceEnrollments',
    'TimeOffRequests', 'TimeOffBalances',
    'Tickets', 'TicketComments', 'TicketAttachments', 'TicketCategories',
    'NotificationLogs', 'PushSubscriptions',
    'Roles', 'UserRoles', 'UserSettings', 'UserInvitations',
    'Organizations', 'Users', 'UserOrganizations',
    'Departments', 'Positions', 'JobTitles',
    'Satellites', 'SatelliteOwners', 'Agencies', 'Terminals',
    'DocumentCategories', 'DocumentCategoryItems',
    'PositionDocumentRequirements',
    'EmployeeRosters', 'EmployeeAccounts', 'EmployeeDeductions',
    'EmployeeBenefits', 'EmployeeSnapshots',
    'AccountTransactions', 'Paychecks', 'AttendanceRecords', 'Timesheets',
    'Places', 'Orders', 'Loads', 'Shipments'
  ];

  for (const t of tables) {
    await fixTable(client, t);
  }

  console.log('\nDone!');
  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
