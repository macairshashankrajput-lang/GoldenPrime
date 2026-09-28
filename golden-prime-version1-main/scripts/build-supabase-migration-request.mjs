import { readFile, writeFile } from "node:fs/promises";

const migrationSql = await readFile(new URL("../drizzle-pg/migrations/0000_glossy_slipstream.sql", import.meta.url), "utf8");
const hardeningSql = await readFile(new URL("../drizzle-pg/migrations/0001_harden_updated_at_trigger.sql", import.meta.url), "utf8");

await writeFile(
  "/tmp/golden-prime-pg-supabase-migration-request.json",
  `${JSON.stringify({
    project_id: "tfwlikowakkmeceoulez",
    name: "golden_prime_pg_harden_updated_at_trigger",
    query: hardeningSql,
  })}\n`,
  "utf8",
);
