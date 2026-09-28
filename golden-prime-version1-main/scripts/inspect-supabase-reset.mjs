import pg from "pg";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not configured.");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const managers = await client.query(`
    SELECT "id", "name", "phone", "role", "openId", "createdAt"
    FROM "users"
    WHERE "role" = 'manager'
    ORDER BY "id"
    LIMIT 50
  `);
  const buildings = await client.query(`
    SELECT "id", "name", "ownerId"
    FROM "buildings"
    ORDER BY "id"
    LIMIT 50
  `);
  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
    LIMIT 100
  `);
  const counts = [];
  for (const { table_name: tableName } of tables.rows) {
    const safeTable = tableName.replaceAll('"', '""');
    const count = await client.query(`SELECT count(*)::text AS row_count FROM "${safeTable}"`);
    counts.push({ tableName, rowCount: count.rows[0].row_count });
  }
  console.log(JSON.stringify({ managers: managers.rows, buildings: buildings.rows, counts }, null, 2));
} finally {
  await client.end();
}
