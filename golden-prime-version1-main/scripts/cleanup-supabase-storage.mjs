import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) throw new Error("Supabase Storage server configuration is missing.");

const bucket = "golden-prime-images";
const paths = [
  "pg/0/building/building-1787681537934-7f73d5f4-7b79-45b0-b799-a273bbc54914.png",
  "pg/0/building/building-1787681756168-d215e073-4367-4dcc-acad-4b4f5d7bfb8e.png",
  "pg/0/building/building-1787682349548-29159904-efe4-4d32-a4ca-be4da350c653.png",
  "pg/0/building/building-1787682380836-cd4f5379-90cb-4fba-8cb8-6284230ea8f3.png",
  "pg/0/building/building-1787683112734-b514162a-5898-4576-860a-7e1deab645b9.png",
  "pg/0/building/building-1787683986305-97aa4018-5156-43a2-a1b9-d98e910c797c.png",
  "pg/0/building/building-1787684659456-bb8346bd-3e95-41c7-8e48-1c0b16c80364.png",
  "pg/0/building/building-1787685254329-6a4c5cde-18de-4e88-82bb-89cc16cf76b3.png",
  "pg/0/building/building-1787685326820-1acb182c-face-4dc9-a1d0-60b4110381de.png",
  "pg/0/building/building-1787685629883-29422174-fa47-414f-bcd6-857f40c4233f.png",
  "pg/0/building/building-1787685700839-ac2b3e66-19aa-42ca-990a-17812020887c.png",
  "pg/0/building/building-1787686770125-40bb192e-78ce-4089-b76b-2050d278eb29.png",
  "pg/0/building/building-1787686801968-4147821c-3185-47e4-a958-7b059c58c6d5.png",
];

const client = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await client.storage.from(bucket).remove(paths);
if (error) throw new Error(`Storage cleanup failed: ${error.message}`);
const removed = new Set((data ?? []).map(item => item.name));
if (removed.size !== paths.length) throw new Error(`Storage cleanup incomplete: expected ${paths.length} removals, received ${removed.size}.`);
console.log(JSON.stringify({ bucket, removedCount: removed.size, remainingExpected: 0 }));
