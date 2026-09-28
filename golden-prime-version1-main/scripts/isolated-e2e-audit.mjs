import { writeFile } from "node:fs/promises";
import superjson from "superjson";

const baseUrl = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const buildingId = Number(process.env.AUDIT_BUILDING_ID);
const auditTag = process.env.AUDIT_TAG;
const ownerPhone = process.env.AUDIT_OWNER_PHONE;
const ownerPassword = process.env.AUDIT_OWNER_PASSWORD;
const managerPhone = process.env.AUDIT_MANAGER_PHONE;
const managerPassword = process.env.AUDIT_MANAGER_PASSWORD;

if (!Number.isSafeInteger(buildingId) || buildingId <= 0 || !auditTag || !ownerPhone || !ownerPassword || !managerPhone || !managerPassword) {
  throw new Error("AUDIT_BUILDING_ID, AUDIT_TAG, AUDIT_OWNER_PHONE, AUDIT_OWNER_PASSWORD, AUDIT_MANAGER_PHONE, and AUDIT_MANAGER_PASSWORD are required.");
}

const suffix = String(buildingId).padStart(9, "0");
const phones = {
  primary: `8${suffix}`,
  contenderOne: `7${suffix}`,
  contenderTwo: `6${suffix}`,
};
const tenantPassword = "AuditPass!2026";
const auditDate = "2026-08-23";
const nextMonth = "2026-09";
const results = [];

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
    const message = entry?.error?.json?.message ?? entry?.error?.message ?? raw ?? `HTTP ${response.status}`;
    const error = new Error(message);
    error.code = entry?.error?.json?.data?.code ?? String(response.status);
    throw error;
  }
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie") ?? null;
  return { data: superjson.deserialize(entry.result.data), setCookie: setCookie?.split(";")[0] ?? null };
}

async function login(phone, password) {
  const { data, setCookie } = await invoke("auth.login", { phone, password }, null);
  assert(setCookie, `No session cookie was returned for ${phone}.`);
  return { user: data, cookie: setCookie };
}

async function step(name, callback) {
  const value = await callback();
  results.push({ name, status: "passed" });
  return value;
}

async function snapshot(session) {
  return (await invoke("pg.operations.snapshot", { buildingId }, session.cookie, "GET")).data;
}

const owner = await step("Owner phone-password login", () => login(ownerPhone, ownerPassword));
const manager = await step("Manager phone-password login", () => login(managerPhone, managerPassword));

await step("Owner sees Manager-created temporary building", async () => {
  const buildings = (await invoke("pg.buildings.list", undefined, owner.cookie, "GET")).data;
  assert(buildings.some(building => building.id === buildingId), "Owner cannot see the temporary Manager-created building.");
});

await step("Owner updates payment settings on the shared temporary building", async () => {
  await invoke("pg.buildings.update", {
    id: buildingId,
    name: `${auditTag} Owner verified`,
    address: "Temporary isolated end-to-end audit property",
    city: "Test City",
    landmark: "Audit only",
    contactPhone: "9000000001",
    imageUrl: "",
    mapUrl: "",
    ownerCutPercent: 12,
    paymentBankName: "Audit Bank",
    paymentAccountName: "Audit Tenant Collection",
    paymentAccountNumber: "000000000000",
    paymentIfsc: "AUDT0000001",
    paymentUpiId: "audit@upi",
    paymentQrUrl: "",
    electricityRatePaise: 1200,
    rentDueDay: 5,
  }, owner.cookie);
});

await step("Manager creates an isolated floor", async () => {
  const response = await invoke("pg.operations.addFloor", { buildingId, name: "Audit floor", level: 1 }, manager.cookie);
  assert(response.data.success, "Floor creation did not report success.");
});

let state = await snapshot(manager);
const floor = state.floors.find(item => item.name === "Audit floor");
assert(floor, "Temporary floor is absent from the Manager snapshot.");

const primarySetup = await step("Manager creates a room, tenant login, allocation, rent cycle, and service", () => invoke("pg.operations.setupRoomWithTenant", {
  buildingId,
  floorId: floor.id,
  number: "AUD-A",
  roomType: "double",
  airConditioning: "ac",
  balcony: "balcony",
  imageUrl: "",
  tenant: {
    fullName: "Audit Tenant Primary",
    phone: phones.primary,
    password: tenantPassword,
    email: "audit.primary@example.test",
    emergencyContactName: "Audit Emergency",
    emergencyContactPhone: "9111111111",
    address: "Temporary audit address",
    identityDocumentUrl: "",
  },
  allocation: { moveInDate: auditDate, bedLabel: "A", monthlyRentPaise: 1500000, depositPaise: 300000 },
  services: [{ serviceType: "tiffin", monthlyChargePaise: 250000, notes: "Audit service" }],
}, manager.cookie));
assert(primarySetup.data.roomId && primarySetup.data.tenantId && primarySetup.data.allocationId, "Unified room setup did not return all created identifiers.");

await step("Manager creates transfer and concurrency test rooms", async () => {
  const payloads = [
    { number: "AUD-B", roomType: "single", capacity: 1 },
    { number: "AUD-C", roomType: "single", capacity: 1 },
  ];
  for (const room of payloads) {
    const response = await invoke("pg.operations.addRoom", { buildingId, floorId: floor.id, number: room.number, roomType: room.roomType, capacity: room.capacity, airConditioning: "non_ac", balcony: "non_balcony", imageUrl: "", defaultRentPaise: 1400000 }, manager.cookie);
    assert(response.data.success, `Room ${room.number} creation failed.`);
  }
});

state = await snapshot(manager);
const roomB = state.rooms.find(item => item.number === "AUD-B");
const roomC = state.rooms.find(item => item.number === "AUD-C");
const primaryAllocation = state.allocations.find(item => item.id === primarySetup.data.allocationId);
assert(roomB && roomC && primaryAllocation, "Temporary rooms or primary allocation are missing.");

const primaryTenantSession = await step("Tenant logs in with the generated phone-password account", () => login(phones.primary, tenantPassword));
await step("Tenant portal exposes current room and payment data", async () => {
  const portal = (await invoke("tenant.me", undefined, primaryTenantSession.cookie, "GET")).data;
  assert(portal.tenant.id === primarySetup.data.tenantId && portal.building.id === buildingId, "Tenant portal scope is incorrect.");
});

await step("Manager transfers the active tenant with proration enabled", async () => {
  const response = await invoke("pg.operations.transferTenant", {
    buildingId,
    allocationId: primaryAllocation.id,
    destinationRoomId: roomB.id,
    effectiveDate: auditDate,
    bedLabel: "Window",
    monthlyRentPaise: 1600000,
    depositPaise: 350000,
    applyProration: true,
  }, manager.cookie);
  assert(response.data.destinationAllocationId, "Tenant transfer did not return a destination allocation.");
});

state = await snapshot(manager);
const transferredAllocation = state.allocations.find(item => item.tenantId === primarySetup.data.tenantId && item.status === "active");
assert(transferredAllocation?.roomId === roomB.id, "Transferred tenant is not active in the destination room.");
assert(state.tenantTransfers.some(item => item.tenantId === primarySetup.data.tenantId && item.destinationRoomId === roomB.id), "Transfer history was not persisted.");

await step("Manager records a partial next-month rent payment", async () => {
  const response = await invoke("pg.rent.upsert", {
    buildingId,
    allocationId: transferredAllocation.id,
    tenantId: primarySetup.data.tenantId,
    rentMonth: nextMonth,
    dueDate: "2026-09-05",
    expectedAmountPaise: 1600000,
    paidAmountPaise: 800000,
    paidOn: "2026-09-02",
    paymentMethod: "upi",
    notes: "Audit partial collection",
    receiptUrl: "",
  }, manager.cookie);
  assert(response.data.status === "partial", "Partial rent status was not derived correctly.");
});

await step("Manager records room electricity and a tenant-assigned expense", async () => {
  const electricity = await invoke("pg.electricity.upsert", { buildingId, roomId: roomB.id, billingMonth: nextMonth, previousReading: 100, currentReading: 135, dueDate: "2026-09-10", notes: "Audit meter", meterImageUrl: "" }, manager.cookie);
  assert(electricity.data.unitsConsumed === 35 && electricity.data.billAmountPaise === 42000, "Electricity calculation does not match the configured rate.");
  const expense = await invoke("pg.expenses.create", { buildingId, tenantId: primarySetup.data.tenantId, liabilityMode: "tenant_assigned", category: "utilities", amountPaise: 30000, expenseDate: auditDate, notes: "Audit assigned utility", receiptUrl: "" }, manager.cookie);
  assert(expense.data.success, "Tenant-assigned expense was not saved.");
});

await step("Manager creates a reminder, recurring charge, operating cost, and notification refresh", async () => {
  const reminder = await invoke("pg.reminders.create", { buildingId, title: "Audit follow-up", dueDate: "2026-09-03", tenantId: primarySetup.data.tenantId, rentPaymentId: null }, manager.cookie);
  assert(reminder.data.success, "Reminder creation failed.");
  const service = await invoke("pg.expenses.serviceChargeCreate", { buildingId, name: "Audit Wi-Fi", amountPaise: 150000, billingCycle: "monthly", dueDay: 3, notes: "Audit recurring charge" }, manager.cookie);
  assert(service.data.success, "Service charge creation failed.");
  const operating = await invoke("pg.expenses.operatingCostCreate", { buildingId, roomId: null, tenantId: null, liabilityMode: "building", kind: "supplies", category: "cleaning", title: "Audit cleaning supplies", payeeName: "Audit Vendor", vendorName: "Audit Vendor", amountPaise: 45000, paidAmountPaise: 45000, workStatus: "complete", costDate: auditDate, receiptUrl: "", notes: "Audit operating cost" }, manager.cookie);
  assert(operating.data.success, "Operating cost creation failed.");
  await invoke("pg.notifications.refresh", { buildingId }, manager.cookie);
});

state = await snapshot(manager);
const nextRent = state.rents.find(item => item.allocationId === transferredAllocation.id && item.rentMonth === nextMonth);
assert(nextRent, "Next-month rent record was not available for tenant receipt testing.");

await step("Tenant submits a receipt proof and a support request", async () => {
  const receipt = await invoke("tenant.payments.submitReceipt", { type: "rent", billId: nextRent.id, paymentMethod: "upi", receiptUrl: "https://audit.invalid/receipt-proof.png" }, primaryTenantSession.cookie);
  assert(receipt.data.success, "Tenant receipt proof submission failed.");
  const request = await invoke("tenant.requests.create", { category: "payment", description: "Please review the isolated audit payment receipt." }, primaryTenantSession.cookie);
  assert(request.data.success, "Tenant support request failed.");
});

state = await snapshot(manager);
const submittedRent = state.rents.find(item => item.id === nextRent.id);
assert(submittedRent?.receiptReviewStatus === "pending", "Tenant receipt did not enter the pending review state.");

await step("Manager rejects the tenant proof with a required audit note", async () => {
  const response = await invoke("pg.receiptReviews.decide", { type: "rent", billId: submittedRent.id, buildingId, expectedUpdatedAt: submittedRent.updatedAt, status: "rejected", reviewNote: "Audit rejection reason recorded for workflow verification." }, manager.cookie);
  assert(response.data.status === "rejected", "Receipt rejection was not persisted.");
});

await step("Owner sees the reviewed receipt in audit history", async () => {
  const history = (await invoke("pg.receiptReviews.history", { buildingId }, owner.cookie, "GET")).data;
  assert(history.some(item => item.id === submittedRent.id && item.status === "rejected"), "Owner receipt audit history is missing the Manager review.");
});

await step("Concurrent allocation respects the one-bed capacity constraint", async () => {
  await Promise.all([
    invoke("pg.operations.createTenant", { buildingId, fullName: "Audit Contender One", phone: phones.contenderOne, password: tenantPassword, email: "one@example.test", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "" }, manager.cookie),
    invoke("pg.operations.createTenant", { buildingId, fullName: "Audit Contender Two", phone: phones.contenderTwo, password: tenantPassword, email: "two@example.test", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "" }, manager.cookie),
  ]);
  const beforeAllocation = await snapshot(manager);
  const contenderOne = beforeAllocation.tenants.find(item => item.phone === phones.contenderOne);
  const contenderTwo = beforeAllocation.tenants.find(item => item.phone === phones.contenderTwo);
  assert(contenderOne && contenderTwo, "Concurrent allocation test tenants were not created.");
  const outcomes = await Promise.allSettled([
    invoke("pg.operations.allocateTenant", { buildingId, roomId: roomC.id, tenantId: contenderOne.id, moveInDate: auditDate, bedLabel: "A", monthlyRentPaise: 1200000, depositPaise: 0 }, manager.cookie),
    invoke("pg.operations.allocateTenant", { buildingId, roomId: roomC.id, tenantId: contenderTwo.id, moveInDate: auditDate, bedLabel: "B", monthlyRentPaise: 1200000, depositPaise: 0 }, manager.cookie),
  ]);
  const fulfilled = outcomes.filter(outcome => outcome.status === "fulfilled");
  const rejected = outcomes.filter(outcome => outcome.status === "rejected");
  assert(fulfilled.length === 1 && rejected.length === 1, "One-bed room accepted an invalid number of concurrent allocations.");
});

await step("Owner observes a Manager live update in the shared building snapshot", async () => {
  const before = await snapshot(owner);
  await invoke("pg.reminders.create", { buildingId, title: "Audit live refresh signal", dueDate: "2026-09-04", tenantId: primarySetup.data.tenantId, rentPaymentId: null }, manager.cookie);
  const after = await snapshot(owner);
  assert(after.reminders.length === before.reminders.length + 1, "Owner snapshot did not reflect the Manager update.");
});

await step("Owner and Manager dashboards return isolated monthly and yearly reporting", async () => {
  const [managerDashboard, ownerDashboard] = await Promise.all([
    invoke("pg.dashboard.get", { buildingId, periodMode: "monthly", periodKey: nextMonth }, manager.cookie, "GET"),
    invoke("pg.dashboard.get", { buildingId, periodMode: "yearly", periodKey: "2026" }, owner.cookie, "GET"),
  ]);
  assert(managerDashboard.data.summary && ownerDashboard.data.summary, "Dashboard summaries were not returned for the isolated building.");
});

const finalSnapshot = await snapshot(manager);
const report = {
  auditTag,
  buildingId,
  phones,
  primaryTenantId: primarySetup.data.tenantId,
  createdAt: new Date().toISOString(),
  results,
  finalCounts: {
    floors: finalSnapshot.floors.length,
    rooms: finalSnapshot.rooms.length,
    tenants: finalSnapshot.tenants.length,
    allocations: finalSnapshot.allocations.length,
    rents: finalSnapshot.rents.length,
    electricity: finalSnapshot.electricity.length,
    expenses: finalSnapshot.expenses.length,
    operatingCosts: finalSnapshot.operatingCosts.length,
    serviceCharges: finalSnapshot.serviceCharges.length,
    reminders: finalSnapshot.reminders.length,
    tenantCharges: finalSnapshot.tenantCharges.length,
    tenantTransfers: finalSnapshot.tenantTransfers.length,
  },
};

await writeFile("/tmp/golden-isolated-e2e-audit-report.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
