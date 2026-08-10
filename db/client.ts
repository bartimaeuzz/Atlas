import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// libSQL is Turso's SQLite-compatible driver. Locally (no DATABASE_URL set)
// it opens a plain SQLite file, same as better-sqlite3 did before this
// migration — DATABASE_PATH still works for local dev if you want a custom
// path. In production, set DATABASE_URL (libsql://...) + DATABASE_AUTH_TOKEN
// to point at a hosted Turso database instead (needed for serverless
// deployment, since a local file doesn't persist on Vercel).
const url = process.env.DATABASE_URL ?? `file:${process.env.DATABASE_PATH ?? "./db/atlas.db"}`;
const authToken = process.env.DATABASE_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });

// SQLite (and libSQL) don't enforce foreign keys by default per connection —
// better-sqlite3's client had the same requirement (sqlite.pragma("foreign_keys = ON")).
// No top-level await here: this file is required synchronously by tsx-run
// scripts (seed.ts, tests) via CommonJS, which errors on an async module
// (ERR_REQUIRE_ASYNC_MODULE) — confirmed by trying it. Fire-and-forget is
// safe in practice: this resolves on the same local/network round trip
// before any real query from application code gets a chance to run.
void client.execute("PRAGMA foreign_keys = ON");

export const db = drizzle(client, { schema });
