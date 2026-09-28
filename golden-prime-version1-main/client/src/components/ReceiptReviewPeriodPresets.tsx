export type ReviewPeriodPreset = "all" | "today" | "last_7_days" | "this_month" | "last_month" | "custom";

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateRangeForPreset(preset: Exclude<ReviewPeriodPreset, "custom">) {
  const today = new Date();
  if (preset === "all") return { reviewedFrom: "", reviewedTo: "" };
  if (preset === "today") { const date = toDateInput(today); return { reviewedFrom: date, reviewedTo: date }; }
  if (preset === "last_7_days") { const from = new Date(today); from.setDate(today.getDate() - 6); return { reviewedFrom: toDateInput(from), reviewedTo: toDateInput(today) }; }
  if (preset === "this_month") return { reviewedFrom: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)), reviewedTo: toDateInput(today) };
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  return { reviewedFrom: toDateInput(lastMonthStart), reviewedTo: toDateInput(lastMonthEnd) };
}

export function ReceiptReviewPeriodPresets({ activePreset, onApply }: { activePreset: ReviewPeriodPreset; onApply: (preset: Exclude<ReviewPeriodPreset, "custom">, range: { reviewedFrom: string; reviewedTo: string }) => void }) {
  const presets: Array<{ value: Exclude<ReviewPeriodPreset, "custom">; label: string }> = [{ value: "all", label: "All time" }, { value: "today", label: "Today" }, { value: "last_7_days", label: "Last 7 days" }, { value: "this_month", label: "This month" }, { value: "last_month", label: "Last month" }];
  return <div className="mt-3"><p className="mb-1.5 text-xs font-semibold text-slate-600">Saved review periods</p><div className="flex flex-wrap gap-2">{presets.map(preset => <button key={preset.value} type="button" onClick={() => onApply(preset.value, dateRangeForPreset(preset.value))} className={`h-8 rounded-lg border px-2.5 text-xs font-semibold transition ${activePreset === preset.value ? "border-primary bg-primary text-primary-foreground" : "border-slate-200 bg-card text-slate-700 hover:border-primary/40"}`}>{preset.label}</button>)}</div></div>;
}
