import { FormEvent, useState } from "react";
import { Building2, CheckCircle2, Layers3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toPaise } from "@/lib/format";

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

export function BuildingOnboardingModal({ open, onOpenChange, onComplete }: { open: boolean; onOpenChange: (open: boolean) => void; onComplete?: (buildingId: number) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [createdBuildingId, setCreatedBuildingId] = useState<number | null>(null);
  const [floorCount, setFloorCount] = useState(0);
  const [floorError, setFloorError] = useState<string | null>(null);
  const createBuilding = trpc.pg.buildings.create.useMutation();
  const generateFloors = trpc.pg.operations.addGeneratedFloors.useMutation();
  const utils = trpc.useUtils();

  const reset = () => { setStep(1); setCreatedBuildingId(null); setFloorCount(0); setFloorError(null); };
  const close = (nextOpen: boolean) => { if (!nextOpen && !createBuilding.isPending && !generateFloors.isPending) { reset(); onOpenChange(false); } };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const building = await createBuilding.mutateAsync({
        name: String(form.get("name")),
        address: String(form.get("address")),
        city: String(form.get("city")) || undefined,
        ownerName: String(form.get("ownerName")),
        ownerPhone: String(form.get("ownerPhone")),
        ownerPassword: String(form.get("ownerPassword")) || undefined,
        electricityRatePaise: toPaise(String(form.get("rate") || "8")),
        ownerMonthlyCutPaise: 0,
        rentDueDay: Number(form.get("rentDueDay") || 5),
      });
      const requestedFloorCount = Number(form.get("floorCount"));
      setCreatedBuildingId(building.buildingId);
      setFloorCount(requestedFloorCount);
      setStep(2);
      setFloorError(null);
      try {
        await generateFloors.mutateAsync({ buildingId: building.buildingId, floorCount: requestedFloorCount });
        await Promise.all([utils.pg.buildings.list.invalidate(), utils.pg.operations.snapshot.invalidate({ buildingId: building.buildingId })]);
        toast.success("Building and floors are ready");
        onComplete?.(building.buildingId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Automatic floor setup failed.";
        setFloorError(message);
        toast.error(message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Building setup could not be completed.");
    }
  };

  const retryFloors = async () => {
    if (!createdBuildingId) return;
    setFloorError(null);
    try {
      await generateFloors.mutateAsync({ buildingId: createdBuildingId, floorCount });
      await Promise.all([utils.pg.buildings.list.invalidate(), utils.pg.operations.snapshot.invalidate({ buildingId: createdBuildingId })]);
      toast.success("Floor setup completed");
      onComplete?.(createdBuildingId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Automatic floor setup failed.";
      setFloorError(message);
      toast.error(message);
    }
  };

  const busy = createBuilding.isPending || generateFloors.isPending;
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl p-5 sm:max-w-xl sm:p-6">
      <DialogHeader>
        <div className="mb-2 flex items-center gap-2 text-primary"><Building2 className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">First building setup</span></div>
        <DialogTitle>Set up your property workspace</DialogTitle>
        <DialogDescription>Enter the essentials once. We’ll create the building and standard floors so you can start adding rooms immediately.</DialogDescription>
      </DialogHeader>
      {step === 1 ? <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 rounded-2xl border border-primary/15 bg-primary/[0.035] p-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Automatic floors:</span> entering 3 creates Ground Floor, Floors 1–3, and Terrace.</div>
        <Field label="Building name"><input required name="name" className={inputClass} placeholder="Golden Prime Residency" /></Field>
        <Field label="City"><input name="city" className={inputClass} placeholder="City" /></Field>
        <div className="sm:col-span-2"><Field label="Full address"><input required name="address" className={inputClass} placeholder="Street, locality, city" /></Field></div>
        <Field label="Owner name"><input required name="ownerName" className={inputClass} placeholder="Building Owner" /></Field>
        <Field label="Owner login phone"><input required name="ownerPhone" type="tel" inputMode="numeric" className={inputClass} placeholder="10-digit phone" /></Field>
        <Field label="Initial Owner password"><input name="ownerPassword" type="password" minLength={8} className={inputClass} placeholder="Optional for existing Owner" /></Field>
        <Field label="Electricity rate per unit (₹)"><input required name="rate" type="number" min="0" step="0.01" defaultValue="8" inputMode="decimal" className={inputClass} /></Field>
        <Field label="Number of numbered floors"><input required name="floorCount" type="number" min="0" max="200" step="1" defaultValue="1" inputMode="numeric" className={inputClass} /></Field>
        <Field label="Monthly rent due day"><input required name="rentDueDay" type="number" min="1" max="28" defaultValue="5" inputMode="numeric" className={inputClass} /></Field>
        <div className="sm:col-span-2 flex flex-wrap justify-end gap-2 pt-1"><button type="button" onClick={() => close(false)} className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Cancel</button><button type="submit" disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">{busy ? <><Loader2 className="h-4 w-4 animate-spin" />Creating workspace…</> : <>Create building & floors</>}</button></div>
      </form> : <div className="space-y-4"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /><p className="text-sm font-semibold">Building created</p></div><p className="mt-1 text-xs leading-5">Your property workspace is ready. Standard floors are being prepared for the first room setup.</p></div>{generateFloors.isPending ? <div className="flex items-center gap-2 rounded-2xl bg-muted/60 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin text-primary" />Generating Ground Floor, numbered floors, and Terrace…</div> : floorError ? <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950"><p className="text-sm font-semibold">Floor setup needs another try</p><p className="text-xs leading-5">{floorError}</p><button type="button" onClick={() => void retryFloors()} className="h-10 rounded-xl border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-800">Retry floor setup</button></div> : <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm"><Layers3 className="h-4 w-4 text-primary" />Ground Floor, Floors 1–{floorCount}, and Terrace are ready.</div>}<div className="flex justify-end"><button type="button" onClick={() => close(false)} disabled={busy} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">Continue to workspace</button></div></div>}
    </DialogContent>
  </Dialog>;
}
