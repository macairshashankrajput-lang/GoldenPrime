import { mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not configured.");

const outputDirectory = process.env.SUPABASE_BACKUP_DIR ?? "/home/ubuntu/supabase-backups";
const outputFile = join(outputDirectory, `golden-prime-before-reset-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`);
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
await client.connect();
try {
  const tablesResult = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const tables = {};
  for (const { table_name: tableName } of tablesResult.rows) {
    const safeTable = tableName.replaceAll('"', '""');
    const result = await client.query(`SELECT * FROM public."${safeTable}"`);
    tables[tableName] = result.rows;
  }
  const backup = {
    createdAt: new Date().toISOString(),
    database: "supabase-postgresql",
    tables,
  };
  await writeFile(outputFile, `${JSON.stringify(backup, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(outputFile, 0o600);
  const counts = Object.fromEntries(Object.entries(tables).map(([tableName, rows]) => [tableName, rows.length]));
  console.log(JSON.stringify({ outputFile, counts }));
} finally {
  await client.end();
}
