import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not configured.");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const target = await client.query("SELECT current_database() AS database_name, current_schema() AS schema_name");
  if (target.rows[0]?.schema_name !== "public") {
    throw new Error(`Reset refused: expected public schema, received ${target.rows[0]?.schema_name ?? "unknown"}.`);
  }

  const sql = await readFile(new URL("../supabase/reset-operational-data.sql", import.meta.url), "utf8");
  await client.query(sql);

  const managers = await client.query(`
    SELECT "id", "name", "phone", "role"
    FROM public."users"
    WHERE "role" = 'manager'
    ORDER BY "id"
    LIMIT 50
  `);
  const counts = {};
  for (const tableName of [
    "buildings", "floors", "rooms", "tenants", "roomAllocations", "rentPayments",
    "electricityBills", "expenses", "operatingCosts", "ownerSettlements",
    "governmentElectricityPayments", "managerCreditAdjustments", "tenantCharges",
    "serviceCharges", "tenantServices", "reminders", "managerNotifications",
    "tenantTransfers", "staffAssignments", "exportHistory", "changeAuditLogs",
  ]) {
    const safeTable = tableName.replaceAll('"', '""');
    const result = await client.query(`SELECT count(*)::integer AS row_count FROM public."${safeTable}"`);
    counts[tableName] = result.rows[0].row_count;
  }
  console.log(JSON.stringify({ preservedManagers: managers.rows, operationalCounts: counts }, null, 2));
} finally {
  await client.end();
}
