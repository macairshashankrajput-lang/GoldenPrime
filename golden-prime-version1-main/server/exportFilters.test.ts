import { describe, expect, it } from "vitest";
import { exportMonthBounds, hasValidExportDateRange, isWithinInclusiveDateRange } from "./exportFilters";

describe("export date filters", () => {
  it("accepts a valid inclusive date range and rejects an inverted range", () => {
    expect(hasValidExportDateRange({ dateFrom: "2026-08-01", dateTo: "2026-08-31" })).toBe(true);
    expect(hasValidExportDateRange({ dateFrom: "2026-09-01", dateTo: "2026-08-31" })).toBe(false);
  });

  it("includes boundaries when filtering date-based exports", () => {
    const range = { dateFrom: "2026-08-01", dateTo: "2026-08-31" };
    expect(isWithinInclusiveDateRange("2026-08-01", range)).toBe(true);
    expect(isWithinInclusiveDateRange("2026-08-31", range)).toBe(true);
    expect(isWithinInclusiveDateRange("2026-09-01", range)).toBe(false);
  });

  it("converts date filters into lexicographically sortable billing-month bounds", () => {
    expect(exportMonthBounds({ dateFrom: "2026-08-03", dateTo: "2026-10-18" })).toEqual({ fromMonth: "2026-08", toMonth: "2026-10" });
  });
});
