import pg from "pg";
import superjson from "superjson";
import { SignJWT } from "jose";
const connectionString = process.env.SUPABASE_DATABASE_URL;
const baseUrl = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const deviceCount = Number(process.env.LOAD_TEST_DEVICES ?? 3);
const cycles = Number(process.env.LOAD_TEST_CYCLES ?? 3);
const managerPhone = (process.env.LOAD_TEST_MANAGER_PHONE ?? "7668992940").replace(/\D/g, "").slice(-10);
const suppliedToken = process.env.LOAD_TEST_MANAGER_TOKEN?.trim() ?? "";
const suppliedUserId = process.env.LOAD_TEST_MANAGER_USER_ID ? Number(process.env.LOAD_TEST_MANAGER_USER_ID) : null;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not configured.");
if (!Number.isInteger(deviceCount) || deviceCount < 2 || deviceCount > 20) throw new Error("LOAD_TEST_DEVICES must be between 2 and 20.");
if (!Number.isInteger(cycles) || cycles < 1 || cycles > 20) throw new Error("LOAD_TEST_CYCLES must be between 1 and 20.");
if (suppliedUserId !== null && (!Number.isInteger(suppliedUserId) || suppliedUserId <= 0)) throw new Error("LOAD_TEST_MANAGER_USER_ID must be a positive integer when supplied.");

const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await db.connect();
let buildingId;
try {
  const manager = suppliedUserId
    ? await db.query(`SELECT "id", "role" FROM public."users" WHERE "id" = $1 LIMIT 1`, [suppliedUserId])
    : await db.query(`SELECT "id", "role" FROM public."users" WHERE "phone" = $1 LIMIT 1`, [managerPhone]);
  const managerRow = manager.rows[0];
  if (!managerRow || managerRow.role !== "manager") throw new Error("The permanent load-test account must be an existing Manager profile.");
  const managerId = Number(managerRow.id);

  const building = await db.query(`
    INSERT INTO public."buildings" ("name", "address", "ownerId")
    VALUES ($1, $2, $3)
    RETURNING "id"
  `, [`QA sync harness ${Date.now()}`, "Temporary validation address", managerId]);
  buildingId = building.rows[0]?.id;
  if (!buildingId) throw new Error("QA load-test building could not be created.");
  await db.query(`INSERT INTO public."staffAssignments" ("buildingId", "userId") VALUES ($1, $2)`, [buildingId, managerId]);

  const mintManagerToken = async () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET is required to mint a re-authenticated Manager session.");
    return new SignJWT({ auth: "phone-password" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(managerId))
      .setIssuedAt()
      .setExpirationTime("14d")
      .sign(new TextEncoder().encode(jwtSecret));
  };
  const managerToken = suppliedToken || await mintManagerToken();
  const managerCookie = managerToken.includes("=") ? managerToken : `golden_prime_session=${managerToken}`;

  const invoke = async (path, input, cookie, method = "GET") => {
    const serialized = superjson.serialize(input ?? null);
    const endpoint = `${baseUrl}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: serialized }))}`;
    const started = performance.now();
    const response = await fetch(endpoint, { method, headers: cookie ? { cookie } : {} });
    const elapsedMs = performance.now() - started;
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : null; } catch { throw new Error(`Invalid JSON from ${path}`); }
    const entry = Array.isArray(payload) ? payload[0] : payload;
    if (!response.ok || entry?.error) throw new Error(entry?.error?.json?.message ?? entry?.error?.message ?? `HTTP ${response.status}`);
    return { elapsedMs, data: superjson.deserialize(entry.result.data) };
  };

  const cookies = Array.from({ length: deviceCount }, () => managerCookie);
  const requests = [];
  const started = performance.now();
  await Promise.all(cookies.map(async (cookie, deviceIndex) => {
    const auth = await invoke("auth.me", null, cookie);
    if (auth.data?.id !== managerId || auth.data.role !== "manager") throw new Error(`Device ${deviceIndex + 1} failed permanent Manager re-authentication.`);
    requests.push(auth.elapsedMs);
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const [snapshot, dashboard] = await Promise.all([
        invoke("pg.operations.snapshot", { buildingId }, cookie),
        invoke("pg.dashboard.get", { buildingId, periodMode: "monthly", periodKey: "2026-08" }, cookie),
      ]);
      if (!snapshot.data || !dashboard.data?.summary) throw new Error(`Device ${deviceIndex + 1} received an incomplete protected response.`);
      requests.push(snapshot.elapsedMs, dashboard.elapsedMs);
    }
  }));
  const durationMs = performance.now() - started;
  const sorted = requests.slice().sort((a, b) => a - b);
  const percentile = ratio => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  console.log(JSON.stringify({
    test: "re-authenticated-manager-sync-load",
    buildingId,
    permanentManagerUserId: managerId,
    tokenSource: suppliedToken ? "provided-permanent-token" : "minted-from-permanent-manager-profile",
    simulatedDevices: deviceCount,
    cyclesPerDevice: cycles,
    reauthenticatedDevices: deviceCount,
    requestsCompleted: requests.length,
    errors: 0,
    durationMs: Math.round(durationMs),
    throughputPerSecond: Number((requests.length / (durationMs / 1000)).toFixed(2)),
    latencyMs: { p50: Math.round(percentile(0.5)), p95: Math.round(percentile(0.95)), max: Math.round(sorted.at(-1)) },
    writesPerformed: 0,
    realtimeModel: "concurrent authenticated refetch/polling; temporary QA building only; no financial mutations",
  }, null, 2));
} finally {
  if (buildingId) await db.query(`DELETE FROM public."buildings" WHERE "id" = $1`, [buildingId]);
  await db.end();
}
console.log(JSON.stringify({ cleanupStatus: "passed" }));
