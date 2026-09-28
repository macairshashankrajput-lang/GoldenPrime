import { Building2, LockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({
    onSuccess: async user => {
      utils.auth.me.setData(undefined, user);
      await utils.auth.me.invalidate();
      setLocation(user.role === "tenant" ? "/tenant" : "/");
    },
    onError: error => toast.error(error.message || "Could not sign in with those details."),
  });

  useEffect(() => {
    if (!loading && user) setLocation(user.role === "tenant" ? "/tenant" : "/");
  }, [loading, setLocation, user]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({ phone: String(form.get("phone")), password: String(form.get("password")) });
  };

  return <main className="grid min-h-[100dvh] bg-[#F8F7F3] lg:grid-cols-[1.05fr_0.95fr]">
    <section className="relative hidden overflow-hidden bg-[#113D39] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full bg-[#51A68E]/30 blur-3xl" />
      <div className="relative flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><Building2 className="h-5 w-5 text-[#BCE7D6]" /></span><span className="text-lg font-semibold tracking-tight">Golden Prime PG</span></div>
      <div className="relative max-w-md"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#BCE7D6]">Property operations</p><h1 className="mt-4 font-serif text-5xl font-semibold leading-[1.08] tracking-[-0.05em]">A calm, clear way to manage every stay.</h1><p className="mt-6 max-w-sm text-base leading-7 text-white/70">One secure workspace for rooms, collections, electricity, and day-to-day PG operations.</p></div>
      <div className="relative flex items-center gap-2 text-sm text-white/65"><ShieldCheck className="h-4 w-4 text-[#BCE7D6]" />Private phone-password access</div>
    </section>
    <section className="flex items-center justify-center p-5 sm:p-8"><div className="w-full max-w-md"><div className="mb-10 flex items-center gap-3 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span><span className="font-semibold tracking-tight text-primary">Golden Prime PG</span></div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Welcome back</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-foreground">Sign in to your space</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Use your registered phone number and password to access your dashboard.</p>
      <form onSubmit={submit} className="mt-8 space-y-5 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_16px_42px_rgba(23,43,77,0.08)] sm:p-7"><label className="block text-sm font-semibold"><span className="mb-2 block">Phone number</span><span className="relative block"><Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" /><input required name="phone" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number" className="h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" /></span></label><label className="block text-sm font-semibold"><span className="mb-2 block">Password</span><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" /><input required name="password" type="password" autoComplete="current-password" placeholder="Your password" className="h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" /></span></label><button disabled={login.isPending} type="submit" className="h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_10px_22px_rgba(15,118,110,0.22)] transition enabled:hover:brightness-95 disabled:opacity-70">{login.isPending ? "Signing in…" : "Sign in securely"}</button></form>
      <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Contact the Building Owner if you need your phone number or access role updated.</p></div></section>
  </main>;
}
