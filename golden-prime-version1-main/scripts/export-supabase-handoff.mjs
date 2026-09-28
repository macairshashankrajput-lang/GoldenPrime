import pg from "pg";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not configured.");
const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const supabaseDir = resolve(projectRoot, "supabase");
const bucketName = "golden-prime-images";
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const [bucketResult, policyResult] = await Promise.all([
    db.query(`SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = $1 LIMIT 1`, [bucketName]),
    db.query(`SELECT policyname, schemaname, tablename, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname`),
  ]);
  const bucket = bucketResult.rows[0] ?? { id: bucketName, name: bucketName, public: false, file_size_limit: null, allowed_mime_types: null };
  const quote = value => String(value ?? "").replace(/'/g, "''");
  const arrayLiteral = values => values === null ? "NULL" : `ARRAY[${values.map(value => `'${quote(value)}'`).join(", ")}]::text[]`;
  const policySql = policyResult.rows.length === 0
    ? "-- No storage.objects CREATE POLICY statements are present intentionally.\n-- The private bucket is accessed only by the server using SUPABASE_SECRET_KEY; the browser never queries Storage directly."
    : policyResult.rows.map(policy => [
      `-- ${policy.policyname}`,
      `CREATE POLICY \"${policy.policyname.replace(/\"/g, '\"\"')}\" ON storage.objects`,
      `${policy.permissive === "PERMISSIVE" ? "AS PERMISSIVE" : "AS RESTRICTIVE"}`,
      `FOR ${policy.cmd}`,
      `TO ${policy.roles.map(role => `\"${role.replace(/\"/g, '\"\"')}\"`).join(", ")}`,
      policy.qual ? `USING (${policy.qual})` : "",
      policy.with_check ? `WITH CHECK (${policy.with_check})` : "",
      ";",
    ].filter(Boolean).join(" ")).join("\n\n");

  const storageSql = `-- Golden Prime PG Supabase Storage handoff\n-- Generated from the active project on ${new Date().toISOString()}\n-- Bucket: ${bucket.name}\n-- Runtime posture: private bucket; server-side signed URLs; browser has no direct Storage Data API access.\n\nINSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\nVALUES ('${quote(bucket.id)}', '${quote(bucket.name)}', ${Boolean(bucket.public)}, ${bucket.file_size_limit === null ? "NULL" : Number(bucket.file_size_limit)}, ${arrayLiteral(bucket.allowed_mime_types)})\nON CONFLICT (id) DO UPDATE SET\n  name = EXCLUDED.name,\n  public = EXCLUDED.public,\n  file_size_limit = EXCLUDED.file_size_limit,\n  allowed_mime_types = EXCLUDED.allowed_mime_types;\n\nALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;\n\n${policySql}\n\n-- Keep the bucket private. Do not create permissive anon/authenticated policies for this application.\n-- The application uploads with SUPABASE_SECRET_KEY and serves 60-second signed URLs through /manus-storage.\n`;
  const schema = await readFile(resolve(supabaseDir, "schema.sql"), "utf8");
  const policies = await readFile(resolve(supabaseDir, "policies.sql"), "utf8");
  const completeSql = `-- Golden Prime PG complete Supabase migration handoff\n-- Generated from the active project on ${new Date().toISOString()}\n-- Apply schema first, then database RLS posture, then Storage configuration.\n\n${schema.trim()}\n\n-- Database RLS posture\n${policies.trim()}\n\n-- Storage bucket and object policy posture\n${storageSql.trim()}\n`;
  const manifest = {
    generatedAt: new Date().toISOString(),
    bucket,
    storageObjectPolicies: policyResult.rows,
    databasePolicyFile: "policies.sql",
    completeSqlFile: "complete-migration.sql",
    storagePolicyFile: "storage-policies.sql",
    runtimePosture: "server-mediated access with private bucket and no direct browser Data API access",
  };
  await mkdir(supabaseDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(supabaseDir, "storage-policies.sql"), storageSql, { mode: 0o600 }),
    writeFile(resolve(supabaseDir, "complete-migration.sql"), completeSql, { mode: 0o600 }),
    writeFile(resolve(supabaseDir, "handoff-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 }),
  ]);
  console.log(JSON.stringify({
    generated: ["supabase/complete-migration.sql", "supabase/storage-policies.sql", "supabase/handoff-manifest.json"],
    bucket: { id: bucket.id, public: Boolean(bucket.public), policyCount: policyResult.rows.length },
  }, null, 2));
} finally {
  await db.end();
}
