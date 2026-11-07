#!/usr/bin/env tsx
import { MemoryStore } from "../src/server/db/memory-store";

/**
 * Maintenance entrypoint for retention. Production should wire the Postgres
 * repositories; local/scripted mode can pass --memory-demo to exercise the API.
 */
async function main(): Promise<void> {
  const days = Number(process.argv.find((a, i, all) => all[i - 1] === "--days") ?? 30);
  if (process.argv.includes("--memory-demo")) {
    const store = new MemoryStore();
    const removed = await store.retainOlderThan(days);
    console.log(JSON.stringify({ ok: true, mode: "memory-demo", removed, days }));
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required unless --memory-demo");
    process.exit(2);
  }
  const { createDb } = await import("../src/server/db/client");
  const { PostgresStore } = await import("../src/server/db/postgres-store");
  const { db, pool } = createDb(process.env.DATABASE_URL);
  try {
    const store = new PostgresStore(db);
    const removed = await store.retainOlderThan(days);
    console.log(JSON.stringify({ ok: true, mode: "postgres", removed, days }));
  } finally {
    await pool.end();
  }
}


main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
