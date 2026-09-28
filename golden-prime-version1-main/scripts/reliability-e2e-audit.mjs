import { writeFile } from "node:fs/promises";
import pg from "pg";
import superjson from "superjson";

const baseUrl = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const ownerPhone = process.env.AUDIT_OWNER_PHONE;
const ownerPassword = process.env.AUDIT_OWNER_PASSWORD;
const managerPhone = process.env.AUDIT_MANAGER_PHONE;
const managerPassword = process.env.AUDIT_MANAGER_PASSWORD;

if (!ownerPhone || !ownerPassword || !managerPhone || !managerPassword) {
  throw new Error("AUDIT_OWNER_PHONE, AUDIT_OWNER_PASSWORD, AUDIT_MANAGER_PHONE, and AUDIT_MANAGER_PASSWORD are required.");
}

const runId = String(Date.now());
const auditTag = `E2E ${runId}`;
const auditDate = "2026-08-24";
const billingMonth = "2026-08";
const tenantPassword = "AuditPass!2026";
const resetTenantPassword = "AuditReset!2026";
const phones = {
  primary: `91${runId.slice(-8)}`,
  secondary: `81${runId.slice(-8)}`,
  deleteOnly: `71${runId.slice(-8)}`,
  contenderOne: `61${runId.slice(-8)}`,
  contenderTwo: `51${runId.slice(-8)}`,
};
const tinyPngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+XQAAAABJRU5ErkJggg==";
const results = [];
let buildingId = null;
let buildingName = null;
let cleanupCompleted = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function invoke(path, input, cookie, method = "POST") {
  const serialized = superjson.serialize(input);
  const endpoint = method === "GET"
    ? `${baseUrl}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: serialized }))}`
    : `${baseUrl}/api/trpc/${path}?batch=1`;
  const response = await fetch(endpoint, {
    method,
    headers: {
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify({ 0: serialized }) } : {}),
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  const entry = Array.isArray(payload) ? payload[0] : payload;
  if (!response.ok || entry?.error) {
    const error = new Error(entry?.error?.json?.message ?? entry?.error?.message ?? raw ?? `HTTP ${response.status}`);
    error.code = entry?.error?.json?.data?.code ?? String(response.status);
    throw error;
  }
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie") ?? null;
  return { data: superjson.deserialize(entry.result.data), cookie: setCookie?.split(";")[0] ?? null };
}

async function login(phone, password) {
  const response = await invoke("auth.login", { phone, password }, null);
  assert(response.cookie, `No session cookie was returned for ${phone}.`);
  return { user: response.data, cookie: response.cookie };
}

async function snapshot(session) {
  return (await invoke("pg.operations.snapshot", { buildingId }, session.cookie, "GET")).data;
}

async function step(name, action) {
  const value = await action();
  results.push({ name, status: "passed" });
  return value;
}

async function expectRejected(name, action) {
  try {
    await action();
  } catch {
    results.push({ name, status: "passed" });
    return;
  }
  throw new Error(`${name} unexpectedly succeeded.`);
}

async function assertStoredImageReachable(url, purpose) {
  assert(url.startsWith("/manus-storage/"), `${purpose} upload did not return a managed storage URL.`);
  const response = await fetch(new URL(url, baseUrl));
  assert(response.ok, `${purpose} image URL was not reachable: HTTP ${response.status}.`);
  assert((response.headers.get("content-type") ?? "").startsWith("image/"), `${purpose} image URL did not return an image response.`);
}

async function cleanup() {
  if (!buildingId || !buildingName) return;
  const connection = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await connection.connect();
  try {
    const buildingResult = await connection.query('SELECT "id", "name" FROM "buildings" WHERE "id" = $1 LIMIT 1', [buildingId]);
    assert(buildingResult.rows.length === 1 && buildingResult.rows[0].name === buildingName, "Audit cleanup refused an unverified building scope.");
    await connection.query("BEGIN");
    const buildingScopedTables = [
      "tenantTransfers",
      "reminders",
      "tenantCharges",
      "managerNotifications",
      "rentPayments",
      "electricityBills",
      "expenses",
      "operatingCosts",
      "tenantServices",
      "serviceCharges",
      "roomAllocations",
      "rooms",
      "floors",
      "tenants",
      "staffAssignments",
    ];
    for (const table of buildingScopedTables) {
      await connection.query(`DELETE FROM "${table}" WHERE "buildingId" = $1`, [buildingId]);
    }
    await connection.query('DELETE FROM "buildings" WHERE "id" = $1 AND "name" = $2', [buildingId, buildingName]);
    await connection.query('DELETE FROM "users" WHERE "phone" = ANY($1::text[]) AND "role" = \'tenant\'', [Object.values(phones)]);
    await connection.query("COMMIT");
    const remainingBuildings = await connection.query('SELECT "id" FROM "buildings" WHERE "id" = $1 LIMIT 1', [buildingId]);
    const remainingUsers = await connection.query('SELECT "phone" FROM "users" WHERE "phone" = ANY($1::text[]) LIMIT 100', [Object.values(phones)]);
    assert(remainingBuildings.rows.length === 0, "Audit building remains after cleanup.");
    assert(remainingUsers.rows.length === 0, "Audit tenant accounts remain after cleanup.");
    cleanupCompleted = true;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    await connection.end();
  }
}

let primaryTenantId;
let primaryAllocationId;
let primaryRentId;
let primaryTenantSession;

try {
  const owner = await step("Owner phone-password sign-in", () => login(ownerPhone, ownerPassword));
  const manager = await step("Manager phone-password sign-in", () => login(managerPhone, managerPassword));

  await step("Manager creates an isolated building", async () => {
    buildingName = `${auditTag} Temporary Building`;
    const result = await invoke("pg.buildings.create", {
      name: buildingName,
      address: "Temporary controlled end-to-end audit building",
      city: "Audit City",
      landmark: "Automated cleanup only",
      contactPhone: "9000000001",
      imageUrl: "",
      mapUrl: "",
      ownerCutPercent: 10,
      electricityRatePaise: 1200,
      rentDueDay: 5,
    }, manager.cookie);
    buildingId = result.data.buildingId;
    assert(Number.isInteger(buildingId) && buildingId > 0, "Temporary building was not created.");
  });

  await step("Owner and Manager receive the same newly created building", async () => {
    const [ownerBuildings, managerBuildings] = await Promise.all([
      invoke("pg.buildings.list", undefined, owner.cookie, "GET"),
      invoke("pg.buildings.list", undefined, manager.cookie, "GET"),
    ]);
    assert(ownerBuildings.data.some(building => building.id === buildingId), "Owner cannot access the Manager-created building.");
    assert(managerBuildings.data.some(building => building.id === buildingId), "Manager cannot access the created building.");
  });

  const uploads = {};
  await step("Shared image uploader stores room, meter, receipt, and payment QR images", async () => {
    for (const purpose of ["room", "meter", "receipt", "payment_qr"]) {
      const upload = await invoke("pg.uploads.image", { dataUrl: tinyPngDataUrl, purpose }, manager.cookie);
      uploads[purpose] = upload.data.url;
      await assertStoredImageReachable(upload.data.url, purpose);
    }
  });

  await step("Manager edits payment and building details with a stored QR image", async () => {
    const result = await invoke("pg.buildings.update", {
      id: buildingId,
      name: `${auditTag} Edited Building`,
      address: "Edited controlled audit building address",
      city: "Audit City",
      landmark: "Edited end-to-end check",
      contactPhone: "9000000002",
      imageUrl: uploads.room,
      mapUrl: "",
      ownerCutPercent: 12,
      paymentBankName: "Audit Bank",
      paymentAccountName: "Audit Collection",
      paymentAccountNumber: "000000000000",
      paymentIfsc: "AUDT0000001",
      paymentUpiId: "audit@upi",
      paymentQrUrl: uploads.payment_qr,
      electricityRatePaise: 1200,
      rentDueDay: 6,
    }, manager.cookie);
    assert(result.data.success, "Building edit did not report success.");
    buildingName = `${auditTag} Edited Building`;
    const ownerBuildings = (await invoke("pg.buildings.list", undefined, owner.cookie, "GET")).data;
    const edited = ownerBuildings.find(building => building.id === buildingId);
    assert(edited?.name === buildingName && edited.paymentQrUrl === uploads.payment_qr, "Owner did not receive the Manager building edit.");
  });

  await step("Manager creates and edits a floor", async () => {
    await invoke("pg.operations.addFloor", { buildingId, name: "Audit Floor", level: 1 }, manager.cookie);
    const state = await snapshot(manager);
    assert(state.floors.some(floor => floor.name === "Audit Floor" && floor.level === 1), "Floor creation was not reflected in the live snapshot.");
  });

  let state = await snapshot(manager);
  const floor = state.floors.find(item => item.name === "Audit Floor");
  assert(floor, "Audit floor was not found.");

  await step("Manager creates a room, a tenant account, allocation, service, and rent cycle", async () => {
    const result = await invoke("pg.operations.setupRoomWithTenant", {
      buildingId,
      floorId: floor.id,
      number: "E2E-A",
      roomType: "double",
      airConditioning: "ac",
      balcony: "balcony",
      imageUrl: uploads.room,
      tenant: {
        fullName: "Audit Primary Tenant",
        phone: phones.primary,
        password: tenantPassword,
        email: "audit.primary@example.test",
        emergencyContactName: "Audit Contact",
        emergencyContactPhone: "9000000003",
        address: "Audit address",
        identityDocumentUrl: uploads.receipt,
      },
      allocation: { moveInDate: auditDate, bedLabel: "A", monthlyRentPaise: 1500000, depositPaise: 300000 },
      services: [{ serviceType: "tiffin", monthlyChargePaise: 250000, notes: "Audit tenant service" }],
    }, manager.cookie);
    primaryTenantId = result.data.tenantId;
    primaryAllocationId = result.data.allocationId;
    assert(result.data.roomId && primaryTenantId && primaryAllocationId, "Unified room, tenant, and allocation setup did not return identifiers.");
  });

  state = await snapshot(manager);
  const primaryRoom = state.rooms.find(room => room.number === "E2E-A");
  assert(primaryRoom, "Primary audit room was not created.");

  await step("Manager edits the populated room without losing its allocation", async () => {
    const result = await invoke("pg.operations.updateRoom", {
      id: primaryRoom.id,
      buildingId,
      floorId: floor.id,
      number: "E2E-A",
      roomType: "double",
      capacity: 2,
      airConditioning: "ac",
      balcony: "non_balcony",
      imageUrl: uploads.room,
      defaultRentPaise: 0,
    }, manager.cookie);
    assert(result.data.success, "Room edit did not report success.");
    const after = await snapshot(manager);
    const edited = after.rooms.find(room => room.id === primaryRoom.id);
    assert(edited?.balcony === "non_balcony" && after.allocations.some(allocation => allocation.id === primaryAllocationId && allocation.status === "active"), "Room edit did not preserve the active allocation.");
  });

  primaryTenantSession = await step("New primary tenant logs in with phone and password", () => login(phones.primary, tenantPassword));

  await step("Primary tenant sees only their assigned room, rent, and service charges", async () => {
    const portal = (await invoke("tenant.me", undefined, primaryTenantSession.cookie, "GET")).data;
    assert(portal.tenant.id === primaryTenantId && portal.building.id === buildingId, "Tenant portal scope is incorrect.");
    assert(portal.rents.some(rent => rent.rentMonth === billingMonth), "Tenant portal is missing its generated current rent cycle.");
    assert(portal.charges.some(charge => charge.sourceType === "tenant_service" && charge.billingMonth === billingMonth), "Tenant portal is missing its allocated tenant service.");
  });

  let secondaryTenantId;
  await step("Manager creates a second tenant account in the shared room", async () => {
    const result = await invoke("pg.operations.createTenantForRoom", {
      buildingId,
      roomId: primaryRoom.id,
      tenant: {
        fullName: "Audit Secondary Tenant",
        phone: phones.secondary,
        password: tenantPassword,
        email: "audit.secondary@example.test",
        emergencyContactName: "",
        emergencyContactPhone: "",
        address: "",
        identityDocumentUrl: "",
      },
      allocation: { moveInDate: auditDate, bedLabel: "B", monthlyRentPaise: 1600000, depositPaise: 300000 },
      services: [{ serviceType: "water_bottle", monthlyChargePaise: 30000, notes: "Audit water service" }],
    }, manager.cookie);
    secondaryTenantId = result.data.tenantId;
    assert(secondaryTenantId && result.data.allocationId, "Second tenant account and allocation were not created.");
  });

  await step("Manager edits a tenant profile and resets that tenant password", async () => {
    const updated = await invoke("pg.operations.updateTenant", {
      id: secondaryTenantId,
      buildingId,
      fullName: "Audit Secondary Tenant Edited",
      phone: phones.secondary,
      email: "audit.secondary@example.test",
      emergencyContactName: "Audit Secondary Contact",
      emergencyContactPhone: "9000000004",
      address: "Edited audit address",
      identityDocumentUrl: uploads.receipt,
      status: "active",
    }, manager.cookie);
    assert(updated.data.success, "Tenant profile edit did not report success.");
    const reset = await invoke("pg.operations.resetTenantCredentials", { tenantId: secondaryTenantId, buildingId, password: resetTenantPassword }, manager.cookie);
    assert(reset.data.success, "Tenant credential reset did not report success.");
    await expectRejected("Previous tenant password is rejected after reset", () => login(phones.secondary, tenantPassword));
    const secondarySession = await login(phones.secondary, resetTenantPassword);
    const portal = (await invoke("tenant.me", undefined, secondarySession.cookie, "GET")).data;
    assert(portal.tenant.id === secondaryTenantId && portal.tenant.fullName === "Audit Secondary Tenant Edited", "Reset tenant cannot access the corrected portal profile.");
  });

  await step("Manager creates a meter bill with a stored meter image and allocated tenant shares", async () => {
    const bill = await invoke("pg.electricity.upsert", {
      buildingId,
      roomId: primaryRoom.id,
      billingMonth,
      previousReading: 100,
      currentReading: 130,
      dueDate: "2026-08-28",
      notes: "Audit meter evidence",
      meterImageUrl: uploads.meter,
    }, manager.cookie);
    assert(bill.data.unitsConsumed === 30 && bill.data.billAmountPaise === 36000, "Meter bill calculation is incorrect.");
    const portal = (await invoke("tenant.me", undefined, primaryTenantSession.cookie, "GET")).data;
    assert(portal.electricity.some(item => item.billingMonth === billingMonth && item.meterImageUrl === uploads.meter), "Tenant electricity history does not expose the stored meter image.");
    assert(portal.charges.some(item => item.sourceType === "electricity" && item.expectedAmountPaise === 18000), "Tenant electricity share was not split across occupants.");
  });

  await step("Tenant uploads and submits a receipt, then Manager approves the proof", async () => {
    state = await snapshot(manager);
    const rent = state.rents.find(item => item.allocationId === primaryAllocationId && item.rentMonth === billingMonth);
    assert(rent, "Current rent record is absent for receipt workflow testing.");
    primaryRentId = rent.id;
    const submitted = await invoke("tenant.payments.submitReceipt", { type: "rent", billId: primaryRentId, paymentMethod: "upi", receiptUrl: uploads.receipt }, primaryTenantSession.cookie);
    assert(submitted.data.success, "Tenant receipt submission did not report success.");
    state = await snapshot(manager);
    const pending = state.rents.find(item => item.id === primaryRentId);
    assert(pending?.receiptUrl === uploads.receipt && pending.receiptReviewStatus === "pending", "Submitted receipt was not stored as pending review.");
    const reviewed = await invoke("pg.receiptReviews.decide", { type: "rent", billId: primaryRentId, buildingId, expectedUpdatedAt: pending.updatedAt, status: "approved", reviewNote: "Controlled audit receipt approved." }, manager.cookie);
    assert(reviewed.data.status === "approved", "Manager receipt approval was not persisted.");
  });

  await step("Owner reads the Manager-approved receipt review history", async () => {
    const history = (await invoke("pg.receiptReviews.history", { buildingId }, owner.cookie, "GET")).data;
    assert(history.some(item => item.id === primaryRentId && item.status === "approved" && item.receiptUrl === uploads.receipt), "Owner receipt review history is missing the approved stored proof.");
  });

  await step("Manager creates and deletes empty room, floor, and tenant records", async () => {
    await invoke("pg.operations.addRoom", { buildingId, floorId: floor.id, number: "E2E-DELETE", roomType: "single", capacity: 1, airConditioning: "non_ac", balcony: "non_balcony", imageUrl: "", defaultRentPaise: 1000000 }, manager.cookie);
    let after = await snapshot(manager);
    const removableRoom = after.rooms.find(room => room.number === "E2E-DELETE");
    assert(removableRoom, "Removable audit room was not created.");
    const roomDeleted = await invoke("pg.operations.deleteRoom", { id: removableRoom.id, buildingId }, manager.cookie);
    assert(roomDeleted.data.success, "Empty room deletion did not report success.");
    await invoke("pg.operations.addFloor", { buildingId, name: "Delete Floor", level: 2 }, manager.cookie);
    after = await snapshot(manager);
    const removableFloor = after.floors.find(item => item.name === "Delete Floor");
    assert(removableFloor, "Removable audit floor was not created.");
    const floorDeleted = await invoke("pg.operations.deleteFloor", { id: removableFloor.id, buildingId }, manager.cookie);
    assert(floorDeleted.data.success, "Empty floor deletion did not report success.");
    await invoke("pg.operations.createTenant", { buildingId, fullName: "Audit Deletable Tenant", phone: phones.deleteOnly, password: tenantPassword, email: "delete@example.test", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "" }, manager.cookie);
    after = await snapshot(manager);
    const removableTenant = after.tenants.find(tenant => tenant.phone === phones.deleteOnly);
    assert(removableTenant, "Removable audit tenant was not created.");
    const tenantDeleted = await invoke("pg.operations.deleteTenant", { tenantId: removableTenant.id, buildingId }, manager.cookie);
    assert(tenantDeleted.data.success, "Unallocated tenant deletion did not report success.");
    await expectRejected("Populated audit building deletion is safely blocked", () => invoke("pg.buildings.delete", { id: buildingId }, manager.cookie));
  });

  await step("Concurrent allocation allows only one account into a one-bed room", async () => {
    await invoke("pg.operations.addRoom", { buildingId, floorId: floor.id, number: "E2E-CONCURRENT", roomType: "single", capacity: 1, airConditioning: "non_ac", balcony: "non_balcony", imageUrl: "", defaultRentPaise: 1200000 }, manager.cookie);
    await Promise.all([
      invoke("pg.operations.createTenant", { buildingId, fullName: "Audit Contender One", phone: phones.contenderOne, password: tenantPassword, email: "one@example.test", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "" }, manager.cookie),
      invoke("pg.operations.createTenant", { buildingId, fullName: "Audit Contender Two", phone: phones.contenderTwo, password: tenantPassword, email: "two@example.test", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "" }, manager.cookie),
    ]);
    const after = await snapshot(manager);
    const oneBedRoom = after.rooms.find(room => room.number === "E2E-CONCURRENT");
    const contenderOne = after.tenants.find(tenant => tenant.phone === phones.contenderOne);
    const contenderTwo = after.tenants.find(tenant => tenant.phone === phones.contenderTwo);
    assert(oneBedRoom && contenderOne && contenderTwo, "Concurrent allocation fixtures are incomplete.");
    const outcomes = await Promise.allSettled([
      invoke("pg.operations.allocateTenant", { buildingId, roomId: oneBedRoom.id, tenantId: contenderOne.id, moveInDate: auditDate, bedLabel: "A", monthlyRentPaise: 1200000, depositPaise: 0 }, manager.cookie),
      invoke("pg.operations.allocateTenant", { buildingId, roomId: oneBedRoom.id, tenantId: contenderTwo.id, moveInDate: auditDate, bedLabel: "B", monthlyRentPaise: 1200000, depositPaise: 0 }, manager.cookie),
    ]);
    assert(outcomes.filter(outcome => outcome.status === "fulfilled").length === 1 && outcomes.filter(outcome => outcome.status === "rejected").length === 1, "One-bed room did not enforce concurrent allocation capacity.");
  });

  await step("Owner immediately reads a Manager-created live reminder update", async () => {
    const before = await snapshot(owner);
    const created = await invoke("pg.reminders.create", { buildingId, title: "Audit live data update", dueDate: "2026-08-27", tenantId: primaryTenantId, rentPaymentId: null }, manager.cookie);
    assert(created.data.success, "Manager reminder creation did not report success.");
    const after = await snapshot(owner);
    assert(after.reminders.length === before.reminders.length + 1 && after.reminders.some(reminder => reminder.title === "Audit live data update"), "Owner snapshot did not receive the Manager update.");
  });

  await step("Owner and Manager dashboards return the same current building response", async () => {
    const [managerDashboard, ownerDashboard] = await Promise.all([
      invoke("pg.dashboard.get", { buildingId, periodMode: "monthly", periodKey: billingMonth }, manager.cookie, "GET"),
      invoke("pg.dashboard.get", { buildingId, periodMode: "monthly", periodKey: billingMonth }, owner.cookie, "GET"),
    ]);
    assert(JSON.stringify(managerDashboard.data.summary) === JSON.stringify(ownerDashboard.data.summary), "Owner and Manager dashboards returned inconsistent current responses.");
  });
} finally {
  const cleanupError = await cleanup().catch(error => error);
  if (cleanupError instanceof Error) {
    results.push({ name: "Isolated audit cleanup", status: "failed", message: cleanupError.message });
    throw cleanupError;
  }
  if (buildingId) results.push({ name: "Isolated audit cleanup", status: "passed" });
}

const report = {
  auditTag,
  completedAt: new Date().toISOString(),
  cleanupCompleted,
  results,
};
await writeFile("/tmp/golden-reliability-e2e-audit-report.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
