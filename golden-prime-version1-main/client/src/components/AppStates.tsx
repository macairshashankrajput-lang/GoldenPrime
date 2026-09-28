import { Building2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export function LoadingState() {
  return <div className="grid min-h-[48vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
}

export function BuildingEmptyState({ title = "Set up your first building", description = "Create a building to begin managing rooms, tenants, billing, and expenses.", onCreate }: { title?: string; description?: string; onCreate?: () => void }) {
  return (
    <section className="grid min-h-[45vh] place-items-center rounded-3xl border border-dashed border-primary/30 bg-primary/[0.03] p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Building2 className="h-6 w-6" /></div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row"><Button type="button" onClick={onCreate} className="h-11 rounded-xl px-4"><Sparkles className="mr-1.5 h-4 w-4" />Set up first building</Button><Button asChild variant="outline" className="h-11 rounded-xl px-4"><Link href="/buildings">Open Buildings <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button></div>
      </div>
    </section>
  );
}
