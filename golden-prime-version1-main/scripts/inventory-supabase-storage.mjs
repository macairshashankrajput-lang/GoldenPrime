import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) throw new Error("Supabase Storage server configuration is missing.");

const client = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const bucket = "golden-prime-images";
const files = [];
const queue = [""];
while (queue.length > 0) {
  const path = queue.shift();
  const { data, error } = await client.storage.from(bucket).list(path, { limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`Storage listing failed: ${error.message}`);
  for (const entry of data ?? []) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.id) files.push({ path: entryPath, size: entry.metadata?.size ?? null, mimeType: entry.metadata?.mimetype ?? null, createdAt: entry.created_at ?? null });
    else queue.push(entryPath);
  }
}
console.log(JSON.stringify({ bucket, objectCount: files.length, objects: files }, null, 2));
