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
    const removed = store.retainOlderThan(days);
    console.log(JSON.stringify({ ok: true, mode: "memory-demo", removed, days }));
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required unless --memory-demo");
    process.exit(2);
  }
  // Postgres cleanup SQL kept explicit for operator review.
  console.log(
    JSON.stringify({
      ok: true,
      mode: "sql-handoff",
      days,
      note: "Run reviewed DELETE statements for conversations/evidence older than retention; see docs/design/persistence.md",
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
