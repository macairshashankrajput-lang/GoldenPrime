import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle-pg/schema.ts",
  out: "./drizzle-pg/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.SUPABASE_DATABASE_URL ?? "postgresql://migration-schema-only.invalid/postgres",
  },
});
