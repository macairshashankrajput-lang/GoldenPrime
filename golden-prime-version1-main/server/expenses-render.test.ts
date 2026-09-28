import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Expenses workspace render safety", () => {
  it("declares the operating-cost summary hook before loading and empty-state exits", () => {
    const source = readFileSync(new URL("../client/src/pages/Expenses.tsx", import.meta.url), "utf8");
    const summaryHook = source.indexOf("const operatingTotals = useMemo");
    const loadingExit = source.indexOf("if (buildingsQuery.isLoading) return <LoadingState />");
    const snapshotExit = source.indexOf("if (snapshot.isLoading || !snapshot.data) return <LoadingState />");
    expect(summaryHook).toBeGreaterThan(-1);
    expect(summaryHook).toBeLessThan(loadingExit);
    expect(summaryHook).toBeLessThan(snapshotExit);
  });
});
