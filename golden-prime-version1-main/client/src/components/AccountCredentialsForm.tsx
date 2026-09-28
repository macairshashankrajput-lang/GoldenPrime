import { FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const fieldClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

export function AccountCredentialsForm({ initialPhone, title = "Your login credentials" }: { initialPhone: string; title?: string }) {
  const update = trpc.pg.account.updateOwnCredentials.useMutation({ onSuccess: () => toast.success("Login credentials updated. Sign out and use the new phone or password next time."), onError: error => toast.error(error.message) });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    update.mutate({ phone: String(form.get("phone")), currentPassword: String(form.get("currentPassword")), newPassword: String(form.get("newPassword")) || undefined });
  };
  return <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-[0_10px_28px_rgba(23,43,77,0.05)]"><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Change your own login phone or password. Enter the current password to confirm the change; no stored password is ever displayed.</p><form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-muted-foreground">Login phone<input required name="phone" type="tel" inputMode="numeric" defaultValue={initialPhone} className={fieldClass} /></label><label className="grid gap-1 text-xs font-semibold text-muted-foreground">Current password<input required name="currentPassword" type="password" minLength={8} className={fieldClass} autoComplete="current-password" /></label><label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:col-span-2">New password <span className="font-normal">(optional when only changing phone)</span><input name="newPassword" type="password" minLength={8} className={fieldClass} autoComplete="new-password" /></label><button disabled={update.isPending} className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2">{update.isPending ? "Saving…" : "Save login details"}</button></form></section>;
}
