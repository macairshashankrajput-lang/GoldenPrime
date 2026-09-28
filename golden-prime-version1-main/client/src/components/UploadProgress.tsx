import { LoaderCircle, RotateCcw, UploadCloud, X } from "lucide-react";
import type { UploadFeedbackState } from "@/hooks/useUploadFeedback";

type UploadProgressProps = UploadFeedbackState & {
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
  tone?: "primary" | "cyan" | "violet";
};

const toneStyles = {
  primary: "border-primary/20 bg-primary/[0.045] text-primary",
  cyan: "border-cyan-200 bg-cyan-50/70 text-cyan-800",
  violet: "border-violet-200 bg-violet-50/70 text-violet-800",
} as const;

const phaseLabels = {
  reading: "Preparing image…",
  uploading: "Uploading securely…",
  saving: "Saving changes…",
  cancelled: "Upload cancelled",
  error: "Upload failed",
} as const;

export function UploadProgress({ progress, phase, fileName, error, onCancel, onRetry, onDismiss, tone = "primary" }: UploadProgressProps) {
  const canCancel = phase === "reading" || phase === "uploading";
  const canRetry = phase === "cancelled" || phase === "error";
  const statusText = error && phase === "error" ? `${phaseLabels[phase]}. ${error}` : phaseLabels[phase];
  return (
    <div className={`mt-2 rounded-xl border px-3 py-2.5 ${toneStyles[tone]}`} role="status" aria-live="polite" aria-label={`${statusText}${canCancel ? ` ${Math.round(progress)} percent` : ""}`}>
      <div className="flex items-start gap-2">
        <UploadCloud className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
            <span className="truncate">{statusText}</span>
            {canCancel ? <span className="tabular-nums">{Math.round(progress)}%</span> : null}
          </div>
          {canCancel ? <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-current/15"><div className="h-full rounded-full bg-current transition-[width] duration-200 ease-out" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} /></div> : null}
          {fileName ? <p className="mt-1 truncate text-[11px] opacity-75">{fileName}</p> : null}
          {canRetry ? <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={onRetry} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-current/25 bg-background/60 px-2.5 text-[11px] font-semibold transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Retry upload</button><button type="button" onClick={onDismiss} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold opacity-80 transition hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">Dismiss<X className="h-3.5 w-3.5" aria-hidden="true" /></button></div> : null}
        </div>
        {canCancel ? <><LoaderCircle className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" /><button type="button" onClick={onCancel} className="grid min-h-8 min-w-8 shrink-0 place-items-center rounded-lg transition hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" aria-label="Cancel upload"><X className="h-4 w-4" aria-hidden="true" /></button></> : null}
      </div>
    </div>
  );
}
