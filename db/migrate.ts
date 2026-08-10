import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./client";

// Applies pending migrations from db/migrations/ using Drizzle's own
// migrator (tracks applied migrations in a __drizzle_migrations table on
// the target DB itself, so it's safe to run repeatedly and only applies
// what's new). This is the officially-recommended production path —
// `drizzle-kit push` is meant for rapid local prototyping and has a
// documented bug talking to Turso's HTTP protocol (confirmed 2026-08-10:
// it silently reported "No changes detected" against a completely empty
// Turso database). `migrate()` doesn't do live introspection/diffing at
// all, so it sidesteps that specific failure mode.
async function main() {
  console.log("Applying migrations from ./db/migrations ...");
  await migrate(db, { migrationsFolder: "./db/migrations" });
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
