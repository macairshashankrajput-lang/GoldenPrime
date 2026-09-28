import pg from "pg";
import superjson from "superjson";
import { randomBytes } from "node:crypto";
import { hashPassword, normalizePhone } from "../server/auth.ts";

const connectionString = process.env.SUPABASE_DATABASE_URL;
const baseUrl = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not configured.");

const phone = normalizePhone(`9${Date.now().toString().slice(-9)}`);
const password = `TmpOwner-${randomBytes(10).toString("hex")}`;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
let userId;
try {
  const inserted = await client.query(`
    INSERT INTO public."users" ("openId", "name", "phone", "passwordHash", "loginMethod", "role")
    VALUES ($1, $2, $3, $4, 'phone-password', 'admin')
    RETURNING "id"
  `, [`temporary-owner-${phone}`, "Temporary Owner Verification", phone, hashPassword(password)]);
  userId = inserted.rows[0]?.id;
  if (!userId) throw new Error("Temporary account was not created.");

  const invoke = async (path, input, cookie = null, method = "POST") => {
    const serialized = superjson.serialize(input);
    const endpoint = method === "GET"
      ? `${baseUrl}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: serialized }))}`
      : `${baseUrl}/api/trpc/${path}?batch=1`;
    const response = await fetch(endpoint, {
      method,
      headers: { ...(method === "POST" ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      ...(method === "POST" ? { body: JSON.stringify({ 0: serialized }) } : {}),
    });
    const payload = await response.json();
    const entry = Array.isArray(payload) ? payload[0] : payload;
    if (!response.ok || entry?.error) throw new Error(entry?.error?.json?.message ?? entry?.error?.message ?? `HTTP ${response.status}`);
    const sessionCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie") ?? null;
    return { data: superjson.deserialize(entry.result.data), cookie: sessionCookie?.split(";")[0] ?? cookie };
  };

  const login = await invoke("auth.login", { phone, password });
  if (!login.cookie) throw new Error("Temporary owner login did not return a session cookie.");
  const me = await invoke("auth.me", undefined, login.cookie, "GET");
  if (me.data?.role !== "admin") throw new Error("Temporary owner session role verification failed.");
  console.log(JSON.stringify({ loginStatus: "passed", sessionStatus: "passed", roleStatus: "passed", cleanupPending: true }));
} finally {
  await client.query(`DELETE FROM public."users" WHERE "id" = $1`, [userId ?? -1]);
  await client.end();
}
console.log(JSON.stringify({ cleanupStatus: "passed" }));
