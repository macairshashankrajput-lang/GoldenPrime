import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccountCredentialsForm } from "@/components/AccountCredentialsForm";
import { BuildingEmptyState, LoadingState } from "@/components/AppStates";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { useActiveBuilding } from "@/hooks/useActiveBuilding";
import { useAuth } from "@/_core/hooks/useAuth";

const fieldClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

export default function AccountSecurity() {
  const { user } = useAuth();
  const { buildingsQuery, building, buildingId, setBuildingId } = useActiveBuilding();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const accounts = trpc.pg.account.recoveryAccounts.useQuery({ buildingId: buildingId ?? 0 }, { enabled: Boolean(buildingId) });
  const reset = trpc.pg.account.resetBuildingAccountPassword.useMutation({ onSuccess: async () => { await accounts.refetch(); setSelectedAccountId(null); toast.success("Replacement password saved. The prior password is no longer valid."); }, onError: error => toast.error(error.message) });
  if (buildingsQuery.isLoading) return <LoadingState />;
  if (!building || !buildingId) return <BuildingEmptyState />;
  const selectedAccount = accounts.data?.find(account => account.id === selectedAccountId) ?? null;
  return <div className="pb-8"><PageHeader eyebrow="Account safety" title="Login & recovery" description="Update your Manager login and recover linked building account access without viewing current passwords." buildings={buildingsQuery.data} buildingId={buildingId} onBuildingChange={setBuildingId} />
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]"><AccountCredentialsForm initialPhone={user?.phone ?? ""} title="Manager login details" /><section className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_10px_28px_rgba(23,43,77,0.05)]"><div className="border-b border-border px-5 py-4"><div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span><div><h2 className="text-base font-semibold">Building-linked credential recovery</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">This list shows login phones and roles for accounts linked to the selected building. Resetting creates a replacement password; existing passwords and hashes remain private.</p></div></div></div><div className="divide-y divide-border/70">{accounts.isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading linked accounts…</p> : accounts.data?.map(account => <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-semibold">{account.name}</p><p className="mt-1 text-xs text-muted-foreground">{account.role === "admin" ? "Owner" : account.role} · Login phone {account.phone ?? "not configured"}</p></div><button type="button" onClick={() => setSelectedAccountId(account.id)} className="h-9 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 text-xs font-semibold text-primary"><KeyRound className="mr-1 inline h-3.5 w-3.5" />Reset password</button></div>)}</div></section></div>
    {selectedAccount ? <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-amber-950">Reset login password · {selectedAccount.name}</h2><p className="mt-1 text-xs leading-5 text-amber-800">The account keeps the same login phone. Give the replacement password to the verified account holder through a secure channel.</p></div><button type="button" onClick={() => setSelectedAccountId(null)} className="text-xs font-semibold text-amber-900">Close</button></div><form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); reset.mutate({ buildingId, userId: selectedAccount.id, password: String(form.get("password")) }); }} className="mt-4 flex flex-wrap gap-3"><input required name="password" type="password" minLength={8} autoComplete="new-password" placeholder="New password (8+ characters)" className={`${fieldClass} max-w-sm`} /><button disabled={reset.isPending} className="h-10 rounded-xl bg-amber-800 px-4 text-sm font-semibold text-white disabled:opacity-60">{reset.isPending ? "Resetting…" : "Save replacement password"}</button></form></section> : null}
  </div>;
}
