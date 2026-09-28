import { Button } from "@/components/ui/button";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { registerSW } from "virtual:pwa-register";

type UpdateServiceWorker = () => Promise<void>;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaLifecycle() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState<UpdateServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const syncConnectionState = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", syncConnectionState);
    window.addEventListener("offline", syncConnectionState);

    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateServiceWorker(() => update);
        setUpdateAvailable(true);
      },
      onOfflineReady() {
        toast.success("Golden Prime PG is ready to use offline.");
      },
    });

    return () => {
      window.removeEventListener("online", syncConnectionState);
      window.removeEventListener("offline", syncConnectionState);
    };
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const clearInstallPrompt = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return <>
    {!isOnline ? <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-950" role="status" aria-live="polite"><span className="inline-flex items-center gap-2"><WifiOff className="h-4 w-4" />You’re offline. Changes need a connection.</span><Button size="sm" variant="outline" className="h-8 rounded-lg border-amber-300 bg-transparent" onClick={() => window.location.assign("/offline")}>View saved snapshot</Button></div> : null}
    {updateAvailable ? <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-xl sm:inset-x-auto sm:right-4" role="status" aria-live="polite"><RefreshCw className="h-5 w-5 shrink-0 text-primary" /><p className="min-w-0 flex-1 text-sm font-medium text-card-foreground">An application update is ready.</p><Button size="sm" className="shrink-0 rounded-lg" onClick={() => void updateServiceWorker?.()}>Refresh</Button><Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-lg" aria-label="Dismiss update notice" onClick={() => setUpdateAvailable(false)}><X className="h-4 w-4" /></Button></div> : null}
    {!updateAvailable && installPrompt ? <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-xl sm:inset-x-auto sm:right-4"><Download className="h-5 w-5 shrink-0 text-primary" /><p className="min-w-0 flex-1 text-sm font-medium text-card-foreground">Install Golden Prime PG for faster access.</p><Button size="sm" className="shrink-0 rounded-lg" onClick={() => void installApp()}>Install</Button><Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-lg" aria-label="Dismiss install notice" onClick={() => setInstallPrompt(null)}><X className="h-4 w-4" /></Button></div> : null}
  </>;
}
