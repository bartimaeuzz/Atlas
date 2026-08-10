import { defineConfig } from "drizzle-kit";

// Local dev (no env vars set): pushes/introspects the local SQLite file.
// Production (Turso): set DATABASE_URL (libsql://...) + DATABASE_AUTH_TOKEN
// and this points at the hosted database instead — same "sqlite" dialect
// since libSQL is wire-compatible, drizzle-kit push/studio work unchanged.
const url = process.env.DATABASE_URL ?? `file:${process.env.DATABASE_PATH ?? "./db/atlas.db"}`;
const authToken = process.env.DATABASE_AUTH_TOKEN;

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "turso",
  dbCredentials: authToken ? { url, authToken } : { url },
});
