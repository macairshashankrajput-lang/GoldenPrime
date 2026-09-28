import { readFile, writeFile } from "node:fs/promises";

const query = await readFile(new URL("../drizzle-pg/migrations/0004_reset_imported_id_sequences.sql", import.meta.url), "utf8");

await writeFile(
  "/tmp/golden-prime-pg-supabase-sequence-reset-request.json",
  `${JSON.stringify({
    project_id: "tfwlikowakkmeceoulez",
    name: "reset_imported_id_sequences",
    query,
  })}\n`,
  "utf8",
);
