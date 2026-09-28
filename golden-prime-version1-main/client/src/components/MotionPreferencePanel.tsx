import { Gauge, Sparkles, VolumeX } from "lucide-react";
import { type MotionIntensity, useMotionPreferences } from "@/contexts/MotionContext";

const options: Array<{ value: MotionIntensity; label: string; description: string }> = [
  { value: "system", label: "Use device setting", description: "Follow your phone or browser reduced-motion preference." },
  { value: "minimal", label: "Minimal motion", description: "Keep interactions immediate and remove decorative movement." },
  { value: "standard", label: "Standard motion", description: "Use short interface transitions when your device allows motion." },
];

export function MotionPreferencePanel({ title = "Motion and accessibility", description = "Choose how much interface motion you want to see on this device." }: { title?: string; description?: string }) {
  const { motionIntensity, setMotionIntensity } = useMotionPreferences();
  return <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-[0_10px_28px_rgba(23,43,77,0.05)]"><div className="flex items-center gap-3"><Gauge className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div><div className="mt-4 grid gap-2" role="radiogroup" aria-label="Motion intensity">{options.map(option => { const selected = motionIntensity === option.value; const Icon = option.value === "minimal" ? VolumeX : option.value === "standard" ? Sparkles : Gauge; return <button key={option.value} type="button" role="radio" aria-checked={selected} onClick={() => setMotionIntensity(option.value)} className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-primary bg-primary/[0.05] text-primary" : "border-border bg-background text-foreground hover:border-primary/30"}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="block text-sm font-semibold">{option.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span></span></button>; })}</div><p className="mt-3 text-xs leading-5 text-muted-foreground">This preference is saved on this device. The device reduced-motion preference always remains respected.</p></section>;
}
