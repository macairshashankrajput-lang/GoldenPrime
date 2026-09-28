import { Client } from "pg";
import { describe, expect, it } from "vitest";

describe("Supabase PostgreSQL connection", () => {
  const connectionString = process.env.SUPABASE_DATABASE_URL
    ?? process.env.POSTGRES_URL
    ?? process.env.POSTGRES_PRISMA_URL
    ?? process.env.POSTGRES_URL_NON_POOLING;

  it.skipIf(!connectionString)("connects with the server-only connection string and executes a lightweight query", async () => {

    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8_000,
    });

    try {
      await client.connect();
      const result = await client.query<{ connected: number }>("SELECT 1 AS connected");
      expect(result.rows).toEqual([{ connected: 1 }]);
    } finally {
      await client.end().catch(() => undefined);
    }
  }, 12_000);
});
