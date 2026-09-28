import { RotateCcw, ShieldAlert } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";

type DeleteRequest = {
  label: string;
  description?: string;
  onConfirm: () => void;
};

type UndoRecord = {
  auditId: number;
  buildingId: number;
  label: string;
  onRestored?: () => Promise<void> | void;
};

type DeletionSafetyContextValue = {
  requestDelete: (request: DeleteRequest) => void;
  offerUndo: (record: UndoRecord) => void;
};

const DeletionSafetyContext = createContext<DeletionSafetyContextValue | null>(null);

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title = "Delete this entry?",
  description,
  confirmLabel = "Delete entry",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent className="rounded-3xl border-rose-200 p-5 sm:p-6">
      <AlertDialogHeader>
        <div className="mb-1 grid h-10 w-10 place-items-center rounded-2xl bg-rose-100 text-rose-700"><ShieldAlert className="h-5 w-5" /></div>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription className="leading-5">{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending} className="rounded-xl">Keep entry</AlertDialogCancel>
        <AlertDialogAction disabled={pending} onClick={onConfirm} className="rounded-xl bg-rose-700 text-white hover:bg-rose-800 focus-visible:ring-rose-500">{pending ? "Deleting…" : confirmLabel}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

export function DeletionUndoNotice({
  label,
  pending = false,
  onUndo,
  onDismiss,
}: {
  label: string;
  pending?: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return <section role="status" className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-lg sm:inset-x-6 sm:flex-row sm:items-center sm:justify-between">
    <div><p className="text-sm font-semibold">{label} deleted</p><p className="mt-0.5 text-xs leading-5 text-amber-900">Undo is available to the deleting Manager for 10 minutes. The deletion and any restoration remain in the audit history.</p></div>
    <div className="flex shrink-0 gap-2"><button type="button" onClick={onUndo} disabled={pending} className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-800 px-3 text-sm font-semibold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60"><RotateCcw className="mr-1.5 h-4 w-4" />{pending ? "Restoring…" : "Undo"}</button><button type="button" onClick={onDismiss} disabled={pending} className="h-10 rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 disabled:opacity-60">Dismiss</button></div>
  </section>;
}

export function DeletionSafetyProvider({ children }: { children: ReactNode }) {
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [undoRecord, setUndoRecord] = useState<UndoRecord | null>(null);
  const restore = trpc.pg.recovery.restore.useMutation({
    onSuccess: async data => {
      await undoRecord?.onRestored?.();
      setUndoRecord(null);
      toast.success(`${data.restoredLabel} restored.`);
    },
    onError: error => toast.error(error.message),
  });
  const offerUndo = (record: UndoRecord) => {
    setUndoRecord(record);
    toast.success(`${record.label} deleted. Undo is available for 10 minutes.`);
  };
  return <DeletionSafetyContext.Provider value={{ requestDelete: setDeleteRequest, offerUndo }}>
    {children}
    <ConfirmDeleteDialog
      open={Boolean(deleteRequest)}
      onOpenChange={open => { if (!open) setDeleteRequest(null); }}
      title={`Delete ${deleteRequest?.label ?? "entry"}?`}
      description={deleteRequest?.description ?? "This removes the entry from current totals. A recovery snapshot is retained and the deleting Manager can safely undo the change for 10 minutes."}
      onConfirm={() => {
        deleteRequest?.onConfirm();
        setDeleteRequest(null);
      }}
    />
    {undoRecord ? <DeletionUndoNotice label={undoRecord.label} pending={restore.isPending} onUndo={() => restore.mutate({ buildingId: undoRecord.buildingId, auditId: undoRecord.auditId })} onDismiss={() => setUndoRecord(null)} /> : null}
  </DeletionSafetyContext.Provider>;
}

export function useDeletionSafety() {
  const context = useContext(DeletionSafetyContext);
  if (!context) throw new Error("Deletion safety must be used inside its provider.");
  return context;
}
