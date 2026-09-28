import { BellRing, CheckCheck, CircleAlert, CircleDollarSign, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { BuildingEmptyState, LoadingState } from "@/components/AppStates";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { liveQueryOptions } from "@/lib/liveQuery";
import { useActiveBuilding } from "@/hooks/useActiveBuilding";
import { useLocation } from "wouter";

const iconForKind = (kind: string) => kind.startsWith("electricity") ? Zap : kind === "rent_cycle" ? CircleDollarSign : CircleAlert;
const toneForKind = (kind: string) => kind.includes("overdue") ? "bg-rose-50 text-rose-700 ring-rose-100" : kind === "rent_cycle" ? "bg-sky-50 text-sky-700 ring-sky-100" : "bg-amber-50 text-amber-700 ring-amber-100";

export default function Notifications() {
  const { buildingsQuery, building, buildingId, setBuildingId } = useActiveBuilding();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const notifications = trpc.pg.notifications.list.useQuery({ buildingId: buildingId ?? 0 }, { enabled: Boolean(buildingId), ...liveQueryOptions });
  const generateCycle = trpc.pg.rent.generateCycle.useMutation();
  const refreshAlerts = trpc.pg.notifications.refresh.useMutation();
  const markRead = trpc.pg.notifications.markRead.useMutation();

  const refreshCollection = async () => {
    if (!buildingId) return;
    try {
      const cycles = await generateCycle.mutateAsync({ buildingId });
      const refreshed = await refreshAlerts.mutateAsync({ buildingId });
      await Promise.all([utils.pg.notifications.list.invalidate({ buildingId }), utils.pg.operations.snapshot.invalidate({ buildingId }), utils.pg.dashboard.get.invalidate({ buildingId })]);
      toast.success(cycles.created > 0 ? `${cycles.created} monthly rent ${cycles.created === 1 ? "cycle was" : "cycles were"} created; ${refreshed.refreshed} alerts refreshed.` : `${refreshed.refreshed} collection alerts refreshed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Collection alerts could not be refreshed.");
    }
  };

  const markAllRead = async () => {
    if (!buildingId) return;
    try {
      await markRead.mutateAsync({ buildingId });
      await Promise.all([utils.pg.notifications.list.invalidate({ buildingId }), utils.pg.operations.snapshot.invalidate({ buildingId }), utils.pg.dashboard.get.invalidate({ buildingId })]);
      toast.success("All collection notifications marked as read.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notifications could not be updated.");
    }
  };

  const openBilling = async (id: number, unread: boolean) => {
    if (buildingId && unread) {
      try { await markRead.mutateAsync({ buildingId, notificationIds: [id] }); await Promise.all([utils.pg.notifications.list.invalidate({ buildingId }), utils.pg.operations.snapshot.invalidate({ buildingId })]); } catch { /* Navigation remains available if read-state synchronization fails. */ }
    }
    setLocation("/billing");
  };

  if (buildingsQuery.isLoading) return <LoadingState />;
  if (!building || !buildingId) return <BuildingEmptyState />;
  if (notifications.isLoading || !notifications.data) return <LoadingState />;

  const unread = notifications.data.filter(item => item.status === "unread");
  return <div className="pb-8"><PageHeader eyebrow="Collection watch" title="Notifications" description="Review new rent cycles and upcoming or overdue rent and electricity balances for the selected building." buildings={buildingsQuery.data} buildingId={buildingId} onBuildingChange={setBuildingId} actions={<button type="button" onClick={refreshCollection} disabled={generateCycle.isPending || refreshAlerts.isPending} className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`mr-1.5 h-4 w-4 ${generateCycle.isPending || refreshAlerts.isPending ? "animate-spin" : ""}`} />{generateCycle.isPending || refreshAlerts.isPending ? "Refreshing…" : "Refresh alerts"}</button>} />
    <section className="mb-5 rounded-3xl bg-[#123B38] p-5 text-white shadow-[0_16px_36px_rgba(18,59,56,0.22)]"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10"><BellRing className="h-5 w-5 text-[#BCE7D6]" /></div><div><p className="text-sm font-semibold">{unread.length} unread collection {unread.length === 1 ? "alert" : "alerts"}</p><p className="mt-1 text-sm leading-6 text-white/70">A refresh safely creates any missing current-month rent cycles, then checks pending rent and electricity dues. It never changes paid amounts or manual corrections.</p></div></div>{unread.length > 0 ? <button type="button" onClick={markAllRead} disabled={markRead.isPending} className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold transition hover:bg-white/20 disabled:opacity-50"><CheckCheck className="mr-1.5 inline h-3.5 w-3.5" />Read all</button> : null}</div></section>
    <section className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_10px_28px_rgba(23,43,77,0.05)]"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Selected building alerts</h2><p className="mt-1 text-xs text-muted-foreground">Open an alert to review the underlying rent or electricity collection in Billing.</p></div>{notifications.data.length === 0 ? <div className="p-10 text-center"><BellRing className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">No collection notifications yet</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Use Refresh alerts after adding tenants or bills to check the current building.</p></div> : <div className="divide-y divide-border/70">{notifications.data.map(notification => { const Icon = iconForKind(notification.kind); const unreadItem = notification.status === "unread"; return <article key={notification.id} className={`flex gap-3 px-4 py-4 sm:px-5 ${unreadItem ? "bg-primary/[0.025]" : ""}`}><div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${toneForKind(notification.kind)}`}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{notification.title}</p>{unreadItem ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">New</span> : <span className="text-[11px] font-medium text-muted-foreground">Read</span>}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.body}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{notification.dueDate ? `Due ${formatDate(notification.dueDate)}` : "Collection event"}</span><button type="button" onClick={() => openBilling(notification.id, unreadItem)} disabled={markRead.isPending} className="text-xs font-semibold text-primary underline-offset-2 transition hover:underline disabled:opacity-50">Open billing</button></div></div></article>; })}</div>}</section>
  </div>;
}
