import { CircleDollarSign, ReceiptIndianRupee, SlidersHorizontal, Zap } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { BuildingEmptyState, LoadingState } from "@/components/AppStates";
import { useDeletionSafety } from "@/components/DeletionSafety";
import { PageHeader } from "@/components/PageHeader";
import { formatCurrency } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useActiveBuilding } from "@/hooks/useActiveBuilding";

const fieldClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";
const monthNow = () => new Date().toISOString().slice(0, 7);

export default function Collections() {
  const [location] = useLocation();
  const { buildingsQuery, building, buildingId, setBuildingId, snapshotQuery: snapshot } = useActiveBuilding();
  const utils = trpc.useUtils();
  const deletionSafety = useDeletionSafety();
  const requestedMonth = new URLSearchParams(location.split("?")[1] ?? "").get("month");
  const [month, setMonth] = useState(() => requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : monthNow());
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "partial" | "paid">("all");
  const [editor, setEditor] = useState<string | null>(null);
  const refresh = async () => { await utils.pg.operations.snapshot.invalidate(); await utils.pg.dashboard.get.invalidate(); await utils.pg.profit.get.invalidate(); };
  const updateRent = trpc.pg.rent.update.useMutation({ onSuccess: async data => { await refresh(); setEditor(null); toast.success(`Rent is now ${data.status}`); }, onError: error => toast.error(error.message) });
  const updateCharge = trpc.pg.tenantCharges.recordPayment.useMutation({ onSuccess: async () => { await refresh(); setEditor(null); toast.success("Collection status updated"); }, onError: error => toast.error(error.message) });
  const deleteRent = trpc.pg.rent.delete.useMutation({ onSuccess: async data => { await refresh(); setEditor(null); deletionSafety.offerUndo({ auditId: data.auditId, buildingId: buildingId ?? 0, label: "Rent record", onRestored: refresh }); }, onError: error => toast.error(error.message) });
  const deleteCharge = trpc.pg.tenantCharges.delete.useMutation({ onSuccess: async data => { await refresh(); setEditor(null); deletionSafety.offerUndo({ auditId: data.auditId, buildingId: buildingId ?? 0, label: "Tenant collection", onRestored: refresh }); }, onError: error => toast.error(error.message) });

  const rows = useMemo(() => {
    if (!snapshot.data) return [];
    const tenantName = new Map(snapshot.data.tenants.map(tenant => [tenant.id, tenant.fullName]));
    const roomById = new Map(snapshot.data.rooms.map(room => [room.id, room.number]));
    const rents = snapshot.data.rents.filter(rent => rent.rentMonth === month).map(rent => ({ key: `rent-${rent.id}`, kind: "rent" as const, id: rent.id, tenantName: tenantName.get(rent.tenantId) ?? "Tenant", title: `Rent · ${rent.rentMonth}`, room: roomById.get(snapshot.data.allocations.find(allocation => allocation.id === rent.allocationId)?.roomId ?? 0), expectedAmountPaise: rent.expectedAmountPaise, paidAmountPaise: rent.paidAmountPaise, status: rent.status, dueDate: rent.dueDate, updatedAt: rent.updatedAt, notes: rent.notes, paymentMethod: rent.paymentMethod, paidOn: rent.paidOn }));
    const charges = snapshot.data.tenantCharges.filter(charge => charge.billingMonth === month).map(charge => ({ key: `charge-${charge.id}`, kind: "charge" as const, id: charge.id, tenantName: tenantName.get(charge.tenantId) ?? "Tenant", title: charge.title, room: charge.roomId ? roomById.get(charge.roomId) : undefined, expectedAmountPaise: charge.expectedAmountPaise, paidAmountPaise: charge.paidAmountPaise, status: charge.status, dueDate: charge.dueDate ?? "—", updatedAt: charge.updatedAt, notes: charge.notes, paymentMethod: charge.paymentMethod, paidOn: charge.paidOn }));
    return [...rents, ...charges].filter(row => statusFilter === "all" || row.status === statusFilter);
  }, [month, snapshot.data, statusFilter]);

  if (buildingsQuery.isLoading || snapshot.isLoading) return <LoadingState />;
  if (!building || !buildingId || !snapshot.data) return <BuildingEmptyState />;
  const selected = rows.find(row => row.key === editor) ?? null;

  const submitUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const paidAmountPaise = Math.round(Number(form.get("paidAmount") || 0) * 100);
    if (selected.kind === "rent") {
      updateRent.mutate({ id: selected.id, buildingId, expectedUpdatedAt: selected.updatedAt, dueDate: String(form.get("dueDate")), expectedAmountPaise: Math.round(Number(form.get("expectedAmount") || 0) * 100), paidAmountPaise, paidOn: String(form.get("paidOn")) || undefined, paymentMethod: String(form.get("paymentMethod")) as "cash" | "upi" | "bank_transfer", notes: String(form.get("notes")) || undefined });
      return;
    }
    updateCharge.mutate({ id: selected.id, buildingId, expectedUpdatedAt: selected.updatedAt, paidAmountPaise, paidOn: String(form.get("paidOn")) || undefined, paymentMethod: String(form.get("paymentMethod")) as "cash" | "upi" | "bank_transfer" });
  };
  const markPaid = (row: typeof rows[number]) => {
    const paidOn = new Date().toISOString().slice(0, 10);
    if (row.kind === "rent") {
      updateRent.mutate({ id: row.id, buildingId, expectedUpdatedAt: row.updatedAt, dueDate: row.dueDate, expectedAmountPaise: row.expectedAmountPaise, paidAmountPaise: row.expectedAmountPaise, paidOn, paymentMethod: row.paymentMethod ?? "upi", notes: row.notes || "Marked paid by Manager" });
      return;
    }
    updateCharge.mutate({ id: row.id, buildingId, expectedUpdatedAt: row.updatedAt, paidAmountPaise: row.expectedAmountPaise, paidOn, paymentMethod: row.paymentMethod ?? "upi" });
  };
  const removeRow = (row: typeof rows[number]) => {
    const label = row.kind === "rent" ? "rent record" : "tenant collection";
    deletionSafety.requestDelete({ label, onConfirm: () => {
      if (row.kind === "rent") deleteRent.mutate({ id: row.id, buildingId });
      else deleteCharge.mutate({ id: row.id, buildingId });
    } });
  };

  return <div className="pb-8"><PageHeader eyebrow="Manager collections" title="Dues & status" description="Update rent, electricity shares, services, and assigned-cost collections from one purpose-built workspace." buildings={buildingsQuery.data} buildingId={buildingId} onBuildingChange={setBuildingId} />
    <section className="mb-5 flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-border/70 bg-card p-4 shadow-[0_10px_28px_rgba(23,43,77,0.05)]"><label className="grid gap-1 text-sm font-medium"><span>Billing month</span><input type="month" value={month} onChange={event => setMonth(event.target.value || monthNow())} className={fieldClass} /></label><label className="grid gap-1 text-sm font-medium"><span className="flex items-center gap-1"><SlidersHorizontal className="h-3.5 w-3.5" />Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className={fieldClass}><option value="all">All statuses</option><option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option></select></label><div className="rounded-2xl bg-primary/[0.05] px-4 py-3 text-sm"><p className="font-semibold">{rows.length} active collection{rows.length === 1 ? "" : "s"}</p><p className="mt-0.5 text-xs text-muted-foreground">Payment status is derived from the recorded total.</p></div></section>
    {selected ? <form onSubmit={submitUpdate} className="mb-5 grid gap-3 rounded-3xl border border-primary/25 bg-primary/[0.04] p-4 sm:grid-cols-2"><div className="sm:col-span-2"><p className="text-sm font-semibold">Update {selected.title}</p><p className="mt-1 text-xs text-muted-foreground">{selected.tenantName}{selected.room ? ` · Room ${selected.room}` : ""} · Due {selected.dueDate}</p></div>{selected.kind === "rent" ? <><label className="grid gap-1 text-sm font-medium">Expected amount (₹)<input required name="expectedAmount" inputMode="decimal" defaultValue={selected.expectedAmountPaise / 100} className={fieldClass} /></label><label className="grid gap-1 text-sm font-medium">Due date<input required name="dueDate" type="date" defaultValue={selected.dueDate} className={fieldClass} /></label></> : <div className="rounded-2xl bg-card px-3 py-2 text-sm"><p className="text-xs text-muted-foreground">Tenant share due</p><p className="mt-1 font-semibold">{formatCurrency(selected.expectedAmountPaise)}</p></div>}<label className="grid gap-1 text-sm font-medium">Total received (₹)<input required name="paidAmount" min="0" max={selected.expectedAmountPaise / 100} inputMode="decimal" defaultValue={selected.paidAmountPaise / 100} className={fieldClass} /></label><label className="grid gap-1 text-sm font-medium">Payment method<select name="paymentMethod" defaultValue={selected.paymentMethod ?? "upi"} className={fieldClass}><option value="upi">UPI</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option></select></label><label className="grid gap-1 text-sm font-medium">Payment date<input name="paidOn" type="date" defaultValue={selected.paidOn ?? ""} className={fieldClass} /></label>{selected.kind === "rent" ? <label className="grid gap-1 text-sm font-medium">Collection note<input name="notes" defaultValue={selected.notes ?? ""} className={fieldClass} placeholder="Reference or follow-up note" /></label> : null}<div className="sm:col-span-2 flex flex-wrap gap-2"><button type="submit" disabled={updateRent.isPending || updateCharge.isPending} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{updateRent.isPending || updateCharge.isPending ? "Saving…" : "Save status update"}</button><button type="button" onClick={() => setEditor(null)} className="h-11 rounded-xl border border-border bg-card px-4 text-sm font-semibold">Cancel</button></div></form> : null}
    <section className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_10px_28px_rgba(23,43,77,0.05)]"><div className="border-b border-border px-5 py-4"><div className="flex items-center gap-2"><ReceiptIndianRupee className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Tenant-wise dues</h2></div><p className="mt-1 text-xs text-muted-foreground">Electricity, services, and assigned expenses appear as tenant-specific collection rows. Delete is available for rent and unpaid tenant charges; paid collections remain correctable for audit safety.</p></div><div className="divide-y divide-border/70">{rows.length === 0 ? <p className="p-7 text-center text-sm text-muted-foreground">No collections match these filters.</p> : rows.map(row => { const canDelete = row.kind === "rent" || row.paidAmountPaise === 0; return <div key={row.key} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="min-w-0"><p className="text-sm font-semibold">{row.tenantName} <span className="font-normal text-muted-foreground">· {row.title}</span></p><p className="mt-1 text-xs text-muted-foreground">{row.room ? `Room ${row.room} · ` : ""}Due {row.dueDate}</p></div><div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end"><div className="text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${row.status === "paid" ? "bg-emerald-50 text-emerald-700" : row.status === "partial" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{row.status}</span><p className="mt-2 text-sm font-semibold">{formatCurrency(row.paidAmountPaise)} <span className="text-xs font-normal text-muted-foreground">/ {formatCurrency(row.expectedAmountPaise)}</span></p></div>{row.status !== "paid" ? <button type="button" disabled={updateRent.isPending || updateCharge.isPending} onClick={() => markPaid(row)} className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 disabled:opacity-60">Mark paid</button> : null}<button type="button" onClick={() => setEditor(row.key)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/[0.04] px-3 text-xs font-semibold text-primary"><CircleDollarSign className="h-3.5 w-3.5" />Update</button>{canDelete ? <button type="button" disabled={deleteRent.isPending || deleteCharge.isPending} onClick={() => removeRow(row)} className="inline-flex h-10 items-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 disabled:opacity-60">Delete</button> : <span className="max-w-24 text-right text-[11px] leading-4 text-muted-foreground">Correct paid entry</span>}</div></div>; })}</div></section>
    <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Zap className="h-3.5 w-3.5 text-primary" />Use Billing for meter readings and receipt-review queues. Use this workspace for collection status updates.</p>
  </div>;
}
