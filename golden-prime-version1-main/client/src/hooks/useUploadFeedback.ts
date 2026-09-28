import { useCallback, useRef, useState } from "react";

export type UploadPhase = "reading" | "uploading" | "saving" | "cancelled" | "error";
export type UploadFeedbackState = { progress: number; phase: UploadPhase; fileName?: string; error?: string };
export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled.");
    this.name = "UploadCancelledError";
  }
}

type UploadRequest<T> = { file: File; upload: (dataUrl: string) => Promise<T> };

export function useUploadFeedback() {
  const [state, setState] = useState<UploadFeedbackState | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const lastRequestRef = useRef<UploadRequest<unknown> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const readFile = useCallback((file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    readerRef.current = reader;
    reader.onprogress = event => {
      if (!cancelledRef.current && event.lengthComputable) setState({ progress: Math.min(35, Math.max(5, event.loaded / event.total * 35)), phase: "reading", fileName: file.name });
    };
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onabort = () => reject(new UploadCancelledError());
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  }), []);

  const uploadFile = useCallback(async <T,>(file: File, upload: (dataUrl: string) => Promise<T>) => {
    lastRequestRef.current = { file, upload };
    cancelledRef.current = false;
    setState({ progress: 5, phase: "reading", fileName: file.name });
    try {
      const dataUrl = await readFile(file);
      if (cancelledRef.current) throw new UploadCancelledError();
      setState({ progress: 40, phase: "uploading", fileName: file.name });
      let progress = 40;
      clearTimer();
      timerRef.current = window.setInterval(() => {
        if (!cancelledRef.current) {
          progress = Math.min(88, progress + 5);
          setState(current => current ? { ...current, progress, phase: "uploading" } : current);
        }
      }, 180);
      const result = await upload(dataUrl);
      if (cancelledRef.current) throw new UploadCancelledError();
      setState(current => current ? { ...current, progress: 90, phase: "uploading" } : current);
      return result;
    } catch (error) {
      clearTimer();
      if (error instanceof UploadCancelledError) {
        setState({ progress: 0, phase: "cancelled", fileName: file.name });
      } else {
        setState({ progress: 0, phase: "error", fileName: file.name, error: error instanceof Error ? error.message : "Upload failed." });
      }
      throw error;
    } finally {
      readerRef.current = null;
      clearTimer();
    }
  }, [clearTimer, readFile]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    readerRef.current?.abort();
    const fileName = lastRequestRef.current?.file.name;
    setState({ progress: 0, phase: "cancelled", fileName });
  }, [clearTimer]);

  const retry = useCallback(async () => {
    const request = lastRequestRef.current;
    if (!request) return;
    await uploadFile(request.file, request.upload);
    setState(null);
  }, [uploadFile]);

  const markSaving = useCallback(() => setState(current => current ? { ...current, progress: 96, phase: "saving" } : current), []);
  const clear = useCallback(() => { cancelledRef.current = false; clearTimer(); setState(null); }, [clearTimer]);

  return { state, uploadFile, markSaving, cancel, retry, clear };
}
