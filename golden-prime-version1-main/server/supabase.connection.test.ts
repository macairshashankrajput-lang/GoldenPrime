import { describe, expect, it } from "vitest";

describe("Supabase connector credentials", () => {
  const url = (process.env.SUPABASE_URL ?? "").replace(/^SUPABASE_URL=/, "");
  const key = (process.env.SUPABASE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "").replace(/^SUPABASE_(?:KEY|ANON_KEY)=/, "");

  it.skipIf(!url || !key)("authenticate against the Supabase settings endpoint", async () => {

    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key as string, Authorization: `Bearer ${key}` },
    });

    expect(response.ok).toBe(true);
  }, 15_000);
});

export {};
