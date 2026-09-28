import { BellRing, Check, Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { BuildingEmptyState, LoadingState } from "@/components/AppStates";
import { PageHeader, PrimaryAction } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { buildReminderShareMessage } from "@shared/sharing";
import { trpc } from "@/lib/trpc";
import { useActiveBuilding } from "@/hooks/useActiveBuilding";

const fieldClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium"><span className="mb-1.5 block">{label}</span>{children}</label>; }

export default function Reminders() {
  const { buildingsQuery, building, buildingId, setBuildingId, snapshotQuery: snapshot } = useActiveBuilding();
  const utils = trpc.useUtils(); const [showForm, setShowForm] = useState(false);
  const create = trpc.pg.reminders.create.useMutation({ onSuccess: async () => { await utils.pg.operations.snapshot.invalidate(); await utils.pg.dashboard.get.invalidate(); setShowForm(false); toast.success("Reminder created"); }, onError: error => toast.error(error.message) });
  const complete = trpc.pg.reminders.complete.useMutation({ onSuccess: async () => { await utils.pg.operations.snapshot.invalidate(); await utils.pg.dashboard.get.invalidate(); toast.success("Reminder marked complete"); }, onError: error => toast.error(error.message) });
  if (buildingsQuery.isLoading) return <LoadingState />; if (!building || !buildingId) return <BuildingEmptyState />; if (snapshot.isLoading || !snapshot.data) return <LoadingState />;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); create.mutate({ buildingId, title: String(form.get("title")), dueDate: String(form.get("dueDate")), tenantId: form.get("tenantId") ? Number(form.get("tenantId")) : null, rentPaymentId: null }); };
  const shareReminder = async (reminder: NonNullable<typeof snapshot.data>["reminders"][number]) => {
    const tenant = reminder.tenantId ? snapshot.data.tenants.find(item => item.id === reminder.tenantId) : undefined;
    const message = buildReminderShareMessage(building, reminder.title, formatDate(reminder.dueDate), tenant?.fullName);
    try { if (navigator.share) await navigator.share({ title: `${building.name} reminder`, text: message }); else { await navigator.clipboard.writeText(message); toast.success("Reminder message copied"); } } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) toast.error("Unable to share reminder"); }
  };
  return <div className="pb-8"><PageHeader eyebrow="Follow-up" title="Reminders & alerts" description="Create focused follow-ups for rent collection and property operations. Overdue rent records also alert the owner." buildings={buildingsQuery.data} buildingId={buildingId} onBuildingChange={setBuildingId} actions={<PrimaryAction onClick={() => setShowForm(value => !value)}><Plus className="mr-1.5 h-4 w-4" />New reminder</PrimaryAction>} />
    {showForm ? <form onSubmit={submit} className="mb-5 grid gap-3 rounded-3xl border border-primary/20 bg-primary/[0.035] p-4 sm:grid-cols-2 sm:p-5"><Field label="Reminder title"><input required name="title" className={fieldClass} placeholder="Follow up on partial rent" /></Field><Field label="Due date"><input required name="dueDate" type="date" className={fieldClass} /></Field><Field label="Related tenant (optional)"><select name="tenantId" className={fieldClass}><option value="">No linked tenant</option>{snapshot.data.tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.fullName}</option>)}</select></Field><div className="flex items-end"><PrimaryAction type="submit">{create.isPending ? "Saving…" : "Create reminder"}</PrimaryAction></div></form> : null}
    <section className="grid gap-3 md:grid-cols-2">{snapshot.data.reminders.length === 0 ? <div className="md:col-span-2 rounded-3xl border border-dashed border-border bg-muted/30 p-8 text-center"><BellRing className="mx-auto h-6 w-6 text-primary" /><p className="mt-3 font-semibold">Your reminders will appear here</p><p className="mt-1 text-sm text-muted-foreground">Create a reminder for any collection, service, or operational follow-up.</p></div> : snapshot.data.reminders.map(reminder => <article key={reminder.id} className={`rounded-3xl border p-5 shadow-[0_10px_28px_rgba(23,43,77,0.05)] ${reminder.status === "complete" ? "border-border bg-muted/40" : "border-border/70 bg-card"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{reminder.title}</p><p className="mt-1 text-xs text-muted-foreground">Due {formatDate(reminder.dueDate)}</p></div>{reminder.status === "active" ? <button onClick={() => complete.mutate({ buildingId, reminderId: reminder.id })} className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary transition hover:bg-primary hover:text-primary-foreground" aria-label="Mark reminder complete"><Check className="h-4 w-4" /></button> : <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Complete</span>}</div><button type="button" onClick={() => shareReminder(reminder)} className="mt-4 inline-flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-primary">Share reminder message</button></article>)}</section>
  </div>;
}
