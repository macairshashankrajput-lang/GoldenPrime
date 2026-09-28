import { Building2, Clock3, DoorOpen, ReceiptIndianRupee, RefreshCw, UsersRound, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { getOfflineSnapshotFreshness, loadLastOfflineWorkspaceSnapshot } from "@/lib/offlineSnapshot";

type SnapshotRecord = Record<string, unknown>;

function asRecords(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is SnapshotRecord => Boolean(item) && typeof item === "object") : [];
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatCurrency(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

export default function OfflineSnapshot() {
  const [isReconnecting, setIsReconnecting] = useState(false);
  useEffect(() => {
    const reconnect = () => {
      setIsReconnecting(true);
      window.setTimeout(() => window.location.replace("/"), 250);
    };
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, []);

  const snapshot = loadLastOfflineWorkspaceSnapshot();
  if (isReconnecting) return <ReconnectingState />;
  if (!snapshot) return <NoSnapshotState />;

  const building = snapshot.building;
  const data = snapshot.data;
  const tenantPortal = data.kind === "tenant" && data.portal && typeof data.portal === "object" ? data.portal as SnapshotRecord : null;
  if (tenantPortal) return <TenantOfflineSnapshot building={building} portal={tenantPortal} capturedAt={snapshot.capturedAt} />;

  const rooms = asRecords(data.rooms);
  const tenants = asRecords(data.tenants);
  const allocations = asRecords(data.allocations).filter(allocation => allocation.status === "active");
  const rents = asRecords(data.rents);
  const electricity = asRecords(data.electricity);
  const roomById = new Map(rooms.map(room => [asNumber(room.id), room]));
  const activeAllocationsByRoom = new Map<number, number>();
  allocations.forEach(allocation => {
    const roomId = asNumber(allocation.roomId);
    activeAllocationsByRoom.set(roomId, (activeAllocationsByRoom.get(roomId) ?? 0) + 1);
  });
  const unpaidRentPaise = rents.reduce((total, rent) => total + Math.max(0, asNumber(rent.amountPaise) - asNumber(rent.paidPaise)), 0);
  const unpaidElectricityPaise = electricity.reduce((total, bill) => total + Math.max(0, asNumber(bill.amountPaise) - asNumber(bill.paidPaise)), 0);

  return <main className="min-h-screen bg-background px-4 py-5 sm:px-6"><div className="mx-auto max-w-5xl pb-8"><OfflineHeader title={String(building.name ?? "Golden Prime PG")} capturedAt={snapshot.capturedAt} /><SnapshotFreshnessNotice capturedAt={snapshot.capturedAt} />
    <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={Building2} label="Rooms" value={String(rooms.length)} detail="Saved in this building" /><Metric icon={UsersRound} label="Active tenants" value={String(allocations.length)} detail={`${tenants.length} tenant profiles saved`} /><Metric icon={ReceiptIndianRupee} label="Rent pending" value={formatCurrency(unpaidRentPaise)} detail="Based on last sync" /><Metric icon={ReceiptIndianRupee} label="Electricity pending" value={formatCurrency(unpaidElectricityPaise)} detail="Based on last sync" /></section>
    <section className="mt-5 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_10px_28px_rgba(23,43,77,0.05)] sm:p-6"><div className="flex items-center gap-2"><DoorOpen className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">Rooms and occupancy</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rooms.length ? rooms.map(room => { const roomId = asNumber(room.id); const used = activeAllocationsByRoom.get(roomId) ?? 0; const capacity = Math.max(1, asNumber(room.capacity) || ({ single: 1, double: 2, triple: 3, four: 4 }[String(room.type)] ?? 1)); return <article key={roomId} className="rounded-2xl border border-border/70 bg-background p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Room {String(room.roomNumber ?? room.number ?? roomId)}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{String(room.type ?? room.roomType ?? "configured room")} sharing</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${used < capacity ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{used}/{capacity} beds</span></div><p className="mt-4 text-xs text-muted-foreground">{used < capacity ? `${capacity - used} bed${capacity - used === 1 ? "" : "s"} available at last sync` : "Fully occupied at last sync"}</p></article>; }) : <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">No rooms were present in the saved snapshot.</p>}</div></section>
    <section className="mt-5 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_10px_28px_rgba(23,43,77,0.05)] sm:p-6"><h2 className="text-base font-semibold">Saved tenant allocations</h2><div className="mt-4 divide-y divide-border/70">{allocations.length ? allocations.map(allocation => { const tenant = tenants.find(item => asNumber(item.id) === asNumber(allocation.tenantId)); const room = roomById.get(asNumber(allocation.roomId)); return <div key={String(allocation.id)} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{String(tenant?.fullName ?? tenant?.name ?? "Tenant")}</p><p className="mt-1 text-xs text-muted-foreground">Room {String(room?.number ?? room?.roomNumber ?? allocation.roomId)} · {String(room?.roomType ?? room?.type ?? "sharing")}</p></div><p className="text-xs font-medium text-muted-foreground">{formatCurrency(asNumber(allocation.agreedRentPaise ?? allocation.monthlyRentPaise))}/month</p></div>; }) : <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">No active tenant allocations were present in the saved snapshot.</p>}</div></section>
  </div></main>;
}

function OfflineHeader({ title, capturedAt }: { title: string; capturedAt: string }) {
  return <section className="rounded-3xl bg-[#123B38] p-5 text-white shadow-[0_16px_36px_rgba(18,59,56,0.22)] sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#BCE7D6]">Offline read-only snapshot</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Last synchronized {new Date(capturedAt).toLocaleString()}. This view is stored only on this device and cannot create, edit, or record payments while offline.</p></div><a href="/login" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" />Reconnect</a></div></section>;
}

function SnapshotFreshnessNotice({ capturedAt }: { capturedAt: string }) {
  const freshness = getOfflineSnapshotFreshness(capturedAt);
  return <section className={`mt-5 rounded-2xl border p-4 ${freshness.isStale ? "border-amber-300 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950"}`} role={freshness.isStale ? "alert" : "status"} aria-live="polite"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-semibold">Snapshot age: {freshness.ageLabel}</p><p className="mt-1 text-xs leading-5 opacity-80">Saved {new Date(capturedAt).toLocaleString()}. {freshness.isStale ? "This data is more than 24 hours old. Reconnect before relying on balances, occupancy, or payment status." : "Reconnect when available to refresh this saved view."}</p></div></div></section>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Building2; label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-border/70 bg-card p-4 shadow-[0_8px_20px_rgba(23,43,77,0.04)]"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span></div><p className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}

function TenantOfflineSnapshot({ building, portal, capturedAt }: { building: SnapshotRecord; portal: SnapshotRecord; capturedAt: string }) {
  const tenant = portal.tenant as SnapshotRecord | undefined;
  const allocation = portal.allocation as SnapshotRecord | undefined;
  const room = portal.room as SnapshotRecord | undefined;
  const rents = asRecords(portal.rents);
  const electricity = asRecords(portal.electricity);
  const charges = asRecords(portal.charges);
  const reminders = asRecords(portal.reminders);
  const latestRent = rents[0];
  const latestElectricity = electricity[0];
  return <main className="min-h-screen bg-background px-4 py-5 sm:px-6"><div className="mx-auto max-w-4xl pb-8"><OfflineHeader title={`Hello, ${String(tenant?.fullName ?? "Resident")}`} capturedAt={capturedAt} /><SnapshotFreshnessNotice capturedAt={capturedAt} /><section className="mt-5 grid gap-3 sm:grid-cols-3"><Metric icon={DoorOpen} label="Your room" value={room ? `Room ${String(room.number ?? "—")}` : "Not assigned"} detail={allocation?.bedLabel ? `Bed ${String(allocation.bedLabel)}` : "Saved allocation"} /><Metric icon={ReceiptIndianRupee} label="Latest rent" value={latestRent ? formatCurrency(asNumber(latestRent.expectedAmountPaise)) : "—"} detail={latestRent ? String(latestRent.status ?? "Saved record") : "No saved rent record"} /><Metric icon={ReceiptIndianRupee} label="Latest electricity" value={latestElectricity ? formatCurrency(asNumber(latestElectricity.billAmountPaise)) : "—"} detail={latestElectricity ? `${asNumber(latestElectricity.unitsConsumed)} units at last sync` : "No saved bill"} /></section><section className="mt-5 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_10px_28px_rgba(23,43,77,0.05)]"><h2 className="text-base font-semibold">Saved balances and reminders</h2><div className="mt-4 divide-y divide-border/70"><SnapshotList title="Rent records" items={rents} amountField="expectedAmountPaise" /><SnapshotList title="Shared or assigned charges" items={charges} amountField="expectedAmountPaise" /><SnapshotList title="Reminders" items={reminders} /></div></section></div></main>;
}

function SnapshotList({ title, items, amountField }: { title: string; items: SnapshotRecord[]; amountField?: string }) {
  return <div className="py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{title}</p><span className="text-xs text-muted-foreground">{items.length} saved</span></div>{items.length ? <div className="mt-2 space-y-2">{items.slice(0, 4).map((item, index) => <div key={String(item.id ?? index)} className="flex items-center justify-between gap-3 text-sm"><p className="min-w-0 truncate text-muted-foreground">{String(item.title ?? item.rentMonth ?? item.billingMonth ?? "Saved item")}</p>{amountField ? <p className="whitespace-nowrap font-semibold text-foreground">{formatCurrency(asNumber(item[amountField]))}</p> : <p className="whitespace-nowrap text-xs capitalize text-muted-foreground">{String(item.status ?? "saved")}</p>}</div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No saved records.</p>}</div>;
}

function NoSnapshotState() {
  return <main className="mx-auto grid min-h-screen max-w-xl place-items-center p-5"><section className="w-full rounded-3xl border border-border bg-card p-6 text-center shadow-sm"><WifiOff className="mx-auto h-9 w-9 text-primary" /><h1 className="mt-4 text-xl font-semibold">No offline snapshot yet</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Connect to Golden Prime PG once to save your latest building workspace for read-only offline viewing.</p><a href="/login" className="mt-5 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Return to sign in</a></section></main>;
}

function ReconnectingState() {
  return <main className="mx-auto grid min-h-screen max-w-xl place-items-center p-5"><section className="w-full rounded-3xl border border-primary/20 bg-card p-6 text-center shadow-sm"><RefreshCw className="mx-auto h-9 w-9 animate-spin text-primary" /><h1 className="mt-4 text-xl font-semibold">Connection restored</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Refreshing your latest workspace data now.</p></section></main>;
}
