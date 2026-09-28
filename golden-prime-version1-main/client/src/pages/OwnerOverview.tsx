import { BellRing, Building2, CheckCircle2, ChevronDown, CircleDollarSign, DoorOpen, History, LogOut, ReceiptIndianRupee, UsersRound, Zap } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { LoadingState } from "@/components/AppStates";
import { AccountCredentialsForm } from "@/components/AccountCredentialsForm";
import { MotionPreferencePanel } from "@/components/MotionPreferencePanel";
import { formatCurrency, formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";

const monthNow = () => new Date().toISOString().slice(0, 7);
const fieldClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

export default function OwnerOverview() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [month, setMonth] = useState(monthNow);
  const [expandedBuildingId, setExpandedBuildingId] = useState<number | null>(null);
  const [reminderBuildingId, setReminderBuildingId] = useState<number | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showMotionPreferences, setShowMotionPreferences] = useState(false);
  const overview = trpc.pg.owner.overview.useQuery({ periodKey: month }, { enabled: user?.role === "admin" });
  const refresh = async () => {
    await utils.pg.owner.overview.invalidate();
    await utils.pg.profit.get.invalidate();
    await utils.pg.dashboard.get.invalidate();
  };
  const confirmSettlement = trpc.pg.owner.confirmSettlement.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Owner payment status confirmed");
    },
    onError: error => toast.error(error.message),
  });
  const remindManager = trpc.pg.owner.remindManager.useMutation({
    onSuccess: () => {
      setReminderBuildingId(null);
      toast.success("Manager follow-up reminder created");
    },
    onError: error => toast.error(error.message),
  });
  const signOut = async () => {
    await logout();
    toast.success("Signed out");
    setLocation("/login");
  };

  if (overview.isLoading || !overview.data) return <LoadingState />;

  const totals = overview.data.buildings.reduce(
    (value, item) => ({
      ownerSettlement: value.ownerSettlement + item.finance.monthlyProfitPaise,
      buildingExpenses: value.buildingExpenses + item.finance.monthlyBuildingExpensePaise,
    }),
    { ownerSettlement: 0, buildingExpenses: 0 },
  );
  const reminderBuilding = overview.data.buildings.find(item => item.building.id === reminderBuildingId) ?? null;

  return (
    <main className="min-h-[100dvh] bg-[#F8F7F3] pb-10">
      <header className="border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
            <div><p className="text-sm font-semibold text-primary">Golden Prime PG</p><p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Owner summary</p></div>
          </div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => setShowMotionPreferences(value => !value)} className="h-9 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-muted-foreground">Motion</button><button type="button" onClick={() => setShowAccountForm(value => !value)} className="h-9 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 text-xs font-semibold text-primary">Login details</button><button onClick={signOut} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-muted-foreground"><LogOut className="h-3.5 w-3.5" />Sign out</button></div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Owner portfolio</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Hello, {user?.name?.split(" ")[0] ?? "Owner"}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Review only your assigned buildings, Owner settlement records, approved monthly building-expense totals, occupancy, and Manager follow-up actions.</p>
          </div>
          <label className="grid gap-1 text-sm font-medium">Summary month<input type="month" value={month} onChange={event => setMonth(event.target.value || monthNow())} className={fieldClass} /></label>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <article className="rounded-3xl bg-[#123B38] p-5 text-white"><CircleDollarSign className="h-5 w-5 text-[#BCE7D6]" /><p className="mt-6 text-xs text-white/65">Owner monthly settlement</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(totals.ownerSettlement)}</p></article>
          <article className="rounded-3xl border border-rose-200 bg-rose-50 p-5"><ReceiptIndianRupee className="h-5 w-5 text-rose-700" /><p className="mt-6 text-xs text-rose-800">Monthly building expenses</p><p className="mt-1 text-2xl font-semibold text-rose-950">{formatCurrency(totals.buildingExpenses)}</p></article>
        </section>

        {showAccountForm ? <section className="mt-5"><AccountCredentialsForm initialPhone={user?.phone ?? ""} title="Owner login details" /></section> : null}
        {showMotionPreferences ? <section className="mt-5"><MotionPreferencePanel title="Owner motion preference" description="Choose the amount of interface motion you want on this device." /></section> : null}

        {reminderBuilding ? (
          <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-[0_10px_28px_rgba(23,43,77,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-amber-950">Remind Building Manager · {reminderBuilding.building.name}</p><p className="mt-1 text-xs text-amber-800">Create an auditable Manager follow-up without changing tenant, bill, or settlement records.</p></div><button type="button" onClick={() => setReminderBuildingId(null)} className="h-9 rounded-xl border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-900">Close</button></div>
            <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); remindManager.mutate({ buildingId: reminderBuilding.building.id, title: String(form.get("title")), dueDate: String(form.get("dueDate")) }); }} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-amber-800">Follow-up<input required name="title" minLength={3} className={fieldClass} placeholder="Review the next Owner settlement" /></label>
              <label className="grid gap-1 text-xs font-semibold text-amber-800">Due date<input required name="dueDate" type="date" defaultValue={`${month}-05`} className={fieldClass} /></label>
              <button disabled={remindManager.isPending} className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-900 disabled:opacity-60 sm:col-span-2">{remindManager.isPending ? "Sending…" : "Create Manager reminder"}</button>
            </form>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {overview.data.buildings.length === 0 ? <article className="rounded-3xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground lg:col-span-2">No building summary is available for this Owner account.</article> : overview.data.buildings.map(item => {
            const isExpanded = expandedBuildingId === item.building.id;
            return (
              <article key={item.building.id} className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_10px_28px_rgba(23,43,77,0.05)]">
                {item.building.imageUrl ? <img src={item.building.imageUrl} alt={`${item.building.name} building`} className="h-32 w-full object-cover" /> : <div className="h-16 bg-primary/[0.05]" />}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{item.building.name}</h2><p className="mt-1 text-sm text-muted-foreground">{item.building.address}{item.building.city ? ` · ${item.building.city}` : ""}</p>{item.building.landmark ? <p className="mt-1 text-xs text-muted-foreground">Near {item.building.landmark}</p> : null}</div><button type="button" onClick={() => setReminderBuildingId(item.building.id)} className="rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2 text-xs font-semibold text-primary"><BellRing className="mr-1 inline h-3.5 w-3.5" />Manager follow-up</button></div>
                  <button type="button" onClick={() => setExpandedBuildingId(isExpanded ? null : item.building.id)} className="mt-5 grid w-full grid-cols-3 gap-2 text-left"><span className="rounded-2xl bg-muted/60 p-3"><Building2 className="h-4 w-4 text-primary" /><span className="mt-3 block text-xs text-muted-foreground">Rooms</span><span className="mt-1 block text-lg font-semibold">{item.occupancy.totalRooms}</span></span><span className="rounded-2xl bg-muted/60 p-3"><DoorOpen className="h-4 w-4 text-primary" /><span className="mt-3 block text-xs text-muted-foreground">Vacant</span><span className="mt-1 block text-lg font-semibold">{item.occupancy.vacantRooms}</span></span><span className="rounded-2xl bg-muted/60 p-3"><UsersRound className="h-4 w-4 text-primary" /><span className="mt-3 block text-xs text-muted-foreground">Tenants</span><span className="mt-1 block text-lg font-semibold">{item.occupancy.activeTenants}</span></span></button>
                  <div className="mt-4 rounded-2xl bg-rose-50 p-3"><p className="text-xs text-rose-700">Monthly building expenses</p><p className="mt-1 font-semibold text-rose-950">{formatCurrency(item.finance.monthlyBuildingExpensePaise)}</p><p className="mt-1 text-xs text-rose-700">Approved total only; Manager collections, tenant dues, room bills, and operating calculations remain private.</p></div>
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-amber-950">Next building payment</p><p className="mt-1 text-xs text-amber-800">{item.finance.nextPayment.billingMonth} · {item.finance.nextPayment.status} · due {formatDate(item.finance.nextPayment.dueDate)}</p></div>{item.finance.nextPayment.id ? <button type="button" disabled={confirmSettlement.isPending} onClick={() => confirmSettlement.mutate({ buildingId: item.building.id, settlementId: item.finance.nextPayment.id })} className="inline-flex h-9 items-center rounded-xl border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800 disabled:opacity-60"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Confirm status</button> : null}</div><p className="mt-2 text-xl font-semibold text-amber-950">{formatCurrency(item.finance.nextPayment.expectedAmountPaise - item.finance.nextPayment.paidAmountPaise)}</p></div>
                  {isExpanded ? <div className="mt-5 border-t border-border pt-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Room and resident detail</p><p className="mt-1 text-xs text-muted-foreground">Floor, room type, vacancy, and active resident contact.</p></div><ChevronDown className="h-4 w-4 text-primary" /></div><div className="mt-3 divide-y divide-border/70">{item.occupancy.rooms.map(room => <div key={room.id} className="py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Room {room.number} <span className="font-normal text-muted-foreground">· {room.floor}</span></p><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${room.status === "filled" ? "bg-emerald-50 text-emerald-700" : room.status === "vacant" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>{room.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-muted-foreground">{room.roomType} · {room.filledBeds}/{room.capacity} filled · {room.vacantBeds} vacant</p>{room.tenants.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{room.tenants.map(tenant => <span key={tenant.id} className="rounded-xl bg-muted px-2.5 py-1.5 text-xs"><span className="font-semibold">{tenant.fullName}</span> · {tenant.phone}</span>)}</div> : null}</div>)}</div></div> : null}
                  <div className="mt-5 border-t border-border pt-4"><div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Payment history</p></div><div className="mt-3 divide-y divide-border/70">{item.paymentHistory.length === 0 ? <p className="py-3 text-xs text-muted-foreground">No recorded Owner payout yet.</p> : item.paymentHistory.map(payment => <div key={payment.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{payment.billingMonth} · {payment.paymentMethod?.replace("_", " ") ?? "Payment"}</p><p className="mt-1 text-xs text-muted-foreground">Paid {payment.paidOn ? formatDate(payment.paidOn) : "date not recorded"}</p></div><p className="text-sm font-semibold">{formatCurrency(payment.paidAmountPaise)}</p></div>)}</div></div>
                </div>
              </article>
            );
          })}
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">Owner actions are limited to Manager follow-up, settlement confirmation, and approved occupancy detail for assigned buildings.</p>
      </div>
    </main>
  );
}
