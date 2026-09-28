import { readFile, writeFile } from "node:fs/promises";

const query = await readFile(new URL("../drizzle-pg/migrations/0003_align_source_enum_column_names.sql", import.meta.url), "utf8");

await writeFile(
  "/tmp/golden-prime-pg-supabase-enum-column-request.json",
  `${JSON.stringify({
    project_id: "tfwlikowakkmeceoulez",
    name: "align_source_enum_column_names",
    query,
  })}\n`,
  "utf8",
);
