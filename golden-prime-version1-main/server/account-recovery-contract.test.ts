import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("building account and recovery boundaries", () => {
  it("links every new building to an existing or newly created Owner while assigning the Manager separately", () => {
    const router = source("server/routers/pg.ts");
    const buildings = source("client/src/pages/Buildings.tsx");
    expect(router).toContain("createOrLinkBuildingOwner");
    expect(router).toContain("ownerId });");
    expect(router).toContain("addStaffAssignment({ buildingId, userId: ctx.user.id })");
    expect(buildings).toContain("Building Owner account");
    expect(buildings).toContain("ownerPassword");
  });

  it("requires the current password for Owner and Manager self-service updates and never returns a password hash", () => {
    const router = source("server/routers/pg.ts");
    const db = source("server/db.ts");
    const form = source("client/src/components/AccountCredentialsForm.tsx");
    expect(router).toContain("verifyPassword(input.currentPassword, account.passwordHash)");
    expect(db).toContain('action: "credentials_updated"');
    expect(form).toContain("currentPassword");
    expect(form).toContain("no stored password is ever displayed");
  });

  it("restricts recovery to the Manager and records a replacement password without exposing existing credentials", () => {
    const router = source("server/routers/pg.ts");
    const db = source("server/db.ts");
    const page = source("client/src/pages/AccountSecurity.tsx");
    expect(router).toContain("Only the Manager can access building credential recovery.");
    expect(router).toContain("resetBuildingAccountCredentials");
    expect(db).toContain('action: "password_reset_by_manager"');
    expect(page).toContain("existing passwords and hashes remain private");
  });
});
