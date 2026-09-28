import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("managed storage URL contracts", () => {
  it("accepts the relative managed storage paths returned by the shared uploader", () => {
    const pg = source("server/routers/pg.ts");
    const tenant = source("server/routers/tenant.ts");

    expect(pg).toContain('regex(/^\\/manus-storage\\/[A-Za-z0-9][A-Za-z0-9._/-]*$/');
    expect(pg).toContain("const optionalStoredImageUrl");
    expect(tenant).toContain('regex(/^\\/manus-storage\\/[A-Za-z0-9][A-Za-z0-9._/-]*$/');
  });

  it("uses the managed storage contract in building, room, tenant, meter, and receipt inputs", () => {
    const pg = source("server/routers/pg.ts");
    const tenant = source("server/routers/tenant.ts");

    expect(pg).toContain("imageUrl: optionalStoredImageUrl");
    expect(pg).toContain("paymentQrUrl: optionalNullableStoredImageUrl");
    expect(pg).toContain("identityDocumentUrl: optionalStoredImageUrl");
    expect(pg).toContain("meterImageUrl: optionalStoredImageUrl");
    expect(pg).toContain("receiptUrl: optionalStoredImageUrl");
    expect(tenant).toContain("receiptUrl: storedReceiptUrl");
  });
});
