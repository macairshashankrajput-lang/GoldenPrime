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

const period = "2026-08";
const auditDate = "2026-08-23";
const suffix = String(buildingId).padStart(9, "0");
const tenantAPhone = `5${suffix}`;
const tenantBPhone = `4${suffix}`;
const tenantPassword = "CalcAudit!2026";
const expected = {
  rentExpected: 2200000,
  rentCollected: 1800000,
  rentPending: 400000,
  electricityBilled: 30000,
  electricityPaid: 15000,
  electricityPending: 15000,
  tenantRecoveryExpected: 150100,
  tenantRecoveryCollected: 70050,
  tenantRecoveryPending: 80050,
  expensesBooked: 250100,
  expensesPaid: 200050,
  cashResult: 1670000,
  projectedResult: 2115000,
  ownerCut: 211500,
  managerResult: 1903500,
  totalCredit: 1885050,
  recurringServices: 15000,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expectedValue, label) {
  assert(actual === expectedValue, `${label}: expected ${expectedValue}, received ${actual}.`);
}

async function invoke(path, input, cookie, method = "POST") {
  const serialized = superjson.serialize(input);
  const endpoint = method === "GET"
    ? `${baseUrl}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: serialized }))}`
    : `${baseUrl}/api/trpc/${path}?batch=1`;
  const response = await fetch(endpoint, {
    method,
    headers: { ...(method === "POST" ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    ...(method === "POST" ? { body: JSON.stringify({ 0: serialized }) } : {}),
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  const entry = Array.isArray(payload) ? payload[0] : payload;
  if (!response.ok || entry?.error) throw new Error(entry?.error?.json?.message ?? entry?.error?.message ?? raw ?? `HTTP ${response.status}`);
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie") ?? null;
  return { data: superjson.deserialize(entry.result.data), cookie: setCookie?.split(";")[0] ?? null };
}

async function login(phone, password) {
  const result = await invoke("auth.login", { phone, password }, null);
  assert(result.cookie, `No session cookie was returned for ${phone}.`);
  return result;
}

async function snapshot(cookie) {
  return (await invoke("pg.operations.snapshot", { buildingId }, cookie, "GET")).data;
}

const checks = [];
async function step(name, callback) {
  const value = await callback();
  checks.push(name);
  return value;
}

const owner = await step("Owner session", () => login(ownerPhone, ownerPassword));
const manager = await step("Manager session", () => login(managerPhone, managerPassword));

await step("Owner verifies Manager-created calculation building", async () => {
  const buildings = (await invoke("pg.buildings.list", undefined, owner.cookie, "GET")).data;
  assert(buildings.some(building => building.id === buildingId), "Owner cannot access the calculation audit building.");
});

await step("Manager creates populated shared room", async () => {
  const result = await invoke("pg.operations.setupRoomWithTenant", {
    buildingId,
    floorId: null,
    number: "CALC-1",
    roomType: "double",
    airConditioning: "non_ac",
    balcony: "non_balcony",
    imageUrl: "",
    tenant: { fullName: "Calculation Tenant A", phone: tenantAPhone, password: tenantPassword, email: "calc.a@example.test", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "" },
    allocation: { moveInDate: auditDate, bedLabel: "A", monthlyRentPaise: 1000000, depositPaise: 0 },
    services: [{ serviceType: "water_bottle", monthlyChargePaise: 5000, notes: "Calculation recurring service" }],
  }, manager.cookie);
  assert(result.data.roomId && result.data.tenantId && result.data.allocationId, "Initial room setup identifiers are missing.");
});

let state = await snapshot(manager.cookie);
const room = state.rooms.find(item => item.number === "CALC-1");
const tenantA = state.tenants.find(item => item.phone === tenantAPhone);
assert(room && tenantA, "Initial calculation room or tenant is missing.");

await step("Manager allocates a second tenant at a distinct rent", async () => {
  const result = await invoke("pg.operations.createTenantForRoom", {
    buildingId,
    roomId: room.id,
    tenant: { fullName: "Calculation Tenant B", phone: tenantBPhone, password: tenantPassword, email: "calc.b@example.test", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "" },
    allocation: { moveInDate: auditDate, bedLabel: "B", monthlyRentPaise: 1200000, depositPaise: 0 },
    services: [],
  }, manager.cookie);
  assert(result.data.tenantId && result.data.allocationId, "Second tenant allocation identifiers are missing.");
});

state = await snapshot(manager.cookie);
const tenantB = state.tenants.find(item => item.phone === tenantBPhone);
const allocationA = state.allocations.find(item => item.tenantId === tenantA.id && item.status === "active");
const allocationB = state.allocations.find(item => item.tenantId === tenantB?.id && item.status === "active");
assert(tenantB && allocationA && allocationB, "Calculation allocations are missing.");

await step("Manager records partial and full rent collections", async () => {
  const first = await invoke("pg.rent.upsert", { buildingId, allocationId: allocationA.id, tenantId: tenantA.id, rentMonth: period, dueDate: "2026-08-05", expectedAmountPaise: 1000000, paidAmountPaise: 600000, paidOn: "2026-08-10", paymentMethod: "upi", notes: "Calculation partial rent", receiptUrl: "" }, manager.cookie);
  const second = await invoke("pg.rent.upsert", { buildingId, allocationId: allocationB.id, tenantId: tenantB.id, rentMonth: period, dueDate: "2026-08-05", expectedAmountPaise: 1200000, paidAmountPaise: 1200000, paidOn: "2026-08-08", paymentMethod: "cash", notes: "Calculation full rent", receiptUrl: "" }, manager.cookie);
  assert(first.data.status === "partial" && second.data.status === "paid", "Rent status calculation is incorrect.");
});

await step("Manager records and partly collects shared electricity", async () => {
  const bill = await invoke("pg.electricity.upsert", { buildingId, roomId: room.id, billingMonth: period, previousReading: 100, currentReading: 125, dueDate: "2026-08-25", notes: "Calculation electricity", meterImageUrl: "" }, manager.cookie);
  equal(bill.data.unitsConsumed, 25, "Electricity units");
  equal(bill.data.billAmountPaise, expected.electricityBilled, "Electricity billed amount");
});

await step("Manager records building, assigned, and shared operating costs", async () => {
  await invoke("pg.expenses.create", { buildingId, roomId: null, tenantId: null, liabilityMode: "building", category: "maintenance", amountPaise: 100000, expenseDate: auditDate, notes: "Calculation building expense", receiptUrl: "" }, manager.cookie);
  await invoke("pg.expenses.create", { buildingId, roomId: null, tenantId: tenantA.id, liabilityMode: "tenant_assigned", category: "utilities", amountPaise: 50000, expenseDate: auditDate, notes: "Calculation assigned expense", receiptUrl: "" }, manager.cookie);
  await invoke("pg.expenses.operatingCostCreate", { buildingId, roomId: room.id, tenantId: null, liabilityMode: "room_shared", kind: "supplies", category: "cleaning", title: "Calculation shared supplies", payeeName: "Audit Vendor", vendorName: "Audit Vendor", amountPaise: 100100, paidAmountPaise: 50050, workStatus: "complete", costDate: auditDate, receiptUrl: "", notes: "Calculation shared operating cost" }, manager.cookie);
  await invoke("pg.expenses.serviceChargeCreate", { buildingId, name: "Calculation Wi-Fi", amountPaise: 10000, billingCycle: "monthly", dueDay: 3, notes: "Calculation recurring building service" }, manager.cookie);
});

state = await snapshot(manager.cookie);
const electricityCharges = state.tenantCharges.filter(item => item.sourceType === "electricity");
const assignedCharge = state.tenantCharges.find(item => item.sourceType === "expense" && item.tenantId === tenantA.id);
const sharedOperatingCharge = state.tenantCharges.find(item => item.sourceType === "operating_cost" && item.tenantId === tenantA.id);
assert(electricityCharges.length === 2 && assignedCharge && sharedOperatingCharge, "Expected shared and assigned tenant charges are missing.");
equal(electricityCharges.reduce((total, item) => total + item.expectedAmountPaise, 0), expected.electricityBilled, "Electricity split total");
equal(sharedOperatingCharge.expectedAmountPaise, 50050, "Shared operating-cost split");

await step("Manager records representative tenant-charge collections", async () => {
  const electricityCharge = electricityCharges.find(item => item.tenantId === tenantA.id);
  assert(electricityCharge, "Tenant A electricity charge is missing.");
  await invoke("pg.tenantCharges.recordPayment", { id: electricityCharge.id, buildingId, expectedUpdatedAt: electricityCharge.updatedAt, paidAmountPaise: 15000, paidOn: auditDate, paymentMethod: "upi", receiptUrl: "" }, manager.cookie);
  await invoke("pg.tenantCharges.recordPayment", { id: assignedCharge.id, buildingId, expectedUpdatedAt: assignedCharge.updatedAt, paidAmountPaise: 20000, paidOn: auditDate, paymentMethod: "bank_transfer", receiptUrl: "" }, manager.cookie);
  await invoke("pg.tenantCharges.recordPayment", { id: sharedOperatingCharge.id, buildingId, expectedUpdatedAt: sharedOperatingCharge.updatedAt, paidAmountPaise: 50050, paidOn: auditDate, paymentMethod: "cash", receiptUrl: "" }, manager.cookie);
});

await step("Manager and Owner dashboards reconcile to independent expected values", async () => {
  const [managerDashboard, ownerDashboard] = await Promise.all([
    invoke("pg.dashboard.get", { buildingId, periodMode: "monthly", periodKey: period }, manager.cookie, "GET"),
    invoke("pg.dashboard.get", { buildingId, periodMode: "monthly", periodKey: period }, owner.cookie, "GET"),
  ]);
  const summary = managerDashboard.data.summary;
  const expectedSummary = { expectedRentPaise: expected.rentExpected, collectedPaise: expected.rentCollected, pendingPaise: expected.rentPending, monthlyElectricityBilledPaise: expected.electricityBilled, monthlyElectricityPaidPaise: expected.electricityPaid, monthlyElectricityPendingPaise: expected.electricityPending, periodTenantChargeExpectedPaise: expected.tenantRecoveryExpected, periodTenantChargeCreditPaise: expected.tenantRecoveryCollected, periodTenantChargePendingPaise: expected.tenantRecoveryPending, totalExpensesBookedPaise: expected.expensesBooked, totalExpensesPaidPaise: expected.expensesPaid, cashOperatingResultPaise: expected.cashResult, projectedOperatingResultPaise: expected.projectedResult, ownerCutPaise: expected.ownerCut, managerOperatingResultPaise: expected.managerResult, totalCreditCollectedPaise: expected.totalCredit };
  for (const [key, expectedValue] of Object.entries(expectedSummary)) equal(summary[key], expectedValue, `Dashboard ${key}`);
  equal(summary.monthlyServiceChargePaise + summary.monthlyTenantServicePaise, expected.recurringServices, "Recurring services");
  equal(summary.activeTenants, 2, "Active tenants");
  equal(summary.occupiedRooms, 1, "Occupied rooms");
  equal(summary.vacantBeds, 0, "Vacant beds");
  assert(JSON.stringify(ownerDashboard.data.summary) === JSON.stringify(summary), "Owner and Manager dashboards disagree for the same building and period.");
  const insightIds = new Set(managerDashboard.data.insights.map(item => item.id));
  ["rent-pending", "electricity-pending", "tenant-charge-pending", "operating-payable"].forEach(id => assert(insightIds.has(id), `Missing ${id} insight.`));
  assert(!insightIds.has("on-track"), "On-track insight incorrectly masks pending balances.");
  const cashItems = managerDashboard.data.metricDetails.cashProfit.items;
  const projectedItems = managerDashboard.data.metricDetails.projectedProfit.items;
  assert(cashItems.some(item => item.id === "cash-recoveries" && item.amountPaise === expected.tenantRecoveryCollected), "Cash profit detail omits paid recovery.");
  assert(projectedItems.some(item => item.id === "projected-recoveries" && item.amountPaise === expected.tenantRecoveryExpected), "Projected profit detail omits expected recovery.");
});

await step("Tenant portal reconciles individual rent, electricity, and assigned-charge balances", async () => {
  const tenant = await login(tenantAPhone, tenantPassword);
  const portal = (await invoke("tenant.me", undefined, tenant.cookie, "GET")).data;
  const rent = portal.rents.find(item => item.rentMonth === period);
  const electricity = portal.electricity.find(item => item.billingMonth === period);
  const charges = portal.charges.filter(item => item.billingMonth === period && item.sourceType !== "electricity");
  assert(rent && electricity, "Tenant portal is missing current rent or electricity data.");
  equal(rent.expectedAmountPaise, 1000000, "Tenant rent expected");
  equal(rent.paidAmountPaise, 600000, "Tenant rent paid");
  equal(electricity.billAmountPaise, expected.electricityBilled, "Tenant electricity bill");
  equal(charges.reduce((total, item) => total + item.expectedAmountPaise, 0), 100050, "Tenant assigned and shared charge expected");
  equal(charges.reduce((total, item) => total + item.paidAmountPaise, 0), 70050, "Tenant assigned and shared charge paid");
});

const report = { auditTag, buildingId, period, expected, checks, completedAt: new Date().toISOString() };
await writeFile("/tmp/golden-calculation-audit-report.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
