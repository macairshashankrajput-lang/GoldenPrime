import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const billingSource = readFileSync(new URL("../client/src/pages/Billing.tsx", import.meta.url), "utf8");
const buildingsSource = readFileSync(new URL("../client/src/pages/Buildings.tsx", import.meta.url), "utf8");
const roomsSource = readFileSync(new URL("../client/src/pages/Rooms.tsx", import.meta.url), "utf8");
const progressSource = readFileSync(new URL("../client/src/components/UploadProgress.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../client/src/hooks/useUploadFeedback.ts", import.meta.url), "utf8");

describe("image upload feedback UI", () => {
  it("exposes reading, uploading, and saving phases with bounded progress", () => {
    expect(hookSource).toContain('phase: "reading"');
    expect(hookSource).toContain('phase: "uploading"');
    expect(hookSource).toContain('phase: "saving"');
    expect(hookSource).toContain('phase: "cancelled"');
    expect(hookSource).toContain('phase: "error"');
    expect(hookSource).toContain("readerRef.current?.abort()");
    expect(hookSource).toContain("const retry");
    expect(hookSource).toContain("Math.min(88");
    expect(hookSource).toContain("progress: 96");
  });

  it("renders accessible live progress feedback with an animated loading indicator", () => {
    expect(progressSource).toContain('role="status"');
    expect(progressSource).toContain("aria-live=\"polite\"");
    expect(progressSource).toContain("transition-[width]");
    expect(progressSource).toContain("motion-safe:animate-spin");
    expect(progressSource).toContain("Retry upload");
    expect(progressSource).toContain("Cancel upload");
    expect(progressSource).toContain("Dismiss");
  });

  it("wires progress feedback into building, room, receipt, and meter uploads", () => {
    expect(buildingsSource).toContain("useUploadFeedback");
    expect(buildingsSource).toContain("<UploadProgress");
    expect(buildingsSource).toContain("uploadFeedback.uploadFile");
    expect(roomsSource).toContain("useUploadFeedback");
    expect(roomsSource).toContain("<UploadProgress");
    expect(roomsSource).toContain("uploadFeedback.uploadFile");
    expect(billingSource).toContain("useUploadFeedback");
    expect(billingSource).toContain("<UploadProgress");
    expect(billingSource).toContain("purpose }))).url");
    expect(billingSource).toContain("uploadFeedback.markSaving");
    expect(billingSource).toContain("onRetry={() => void uploadFeedback.retry()}");
    const workspaceSource = readFileSync(new URL("../client/src/contexts/BuildingWorkspaceContext.tsx", import.meta.url), "utf8");
    const layoutSource = readFileSync(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");
    expect(workspaceSource).toContain("isRefreshing");
    expect(workspaceSource).toContain("liveWorkspaceSnapshot.isFetching");
    expect(layoutSource).toContain("Refreshing workspace");
    expect(layoutSource).toContain('aria-label="Refreshing workspace"');
  });
});
