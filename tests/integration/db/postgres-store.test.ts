import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDb } from "../../../src/server/db/client";
import { hashRequest } from "../../../src/server/db/memory-store";
import { PostgresStore } from "../../../src/server/db/postgres-store";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const url = process.env.DATABASE_URL ?? process.env.COMPASS_TEST_DATABASE_URL;
const enabled = Boolean(url);

async function applyMigrations(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const dir = path.resolve("migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const exists = await client.query("SELECT 1 FROM schema_migrations WHERE id = $1", [file]);
      if (exists.rowCount) continue;
      const sqlText = await readFile(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sqlText);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

describe.skipIf(!enabled)("postgres store", () => {
  let store: PostgresStore;
  let pool: pg.Pool;

  beforeAll(async () => {
    await applyMigrations(url!);
    const created = createDb(url!);
    store = new PostgresStore(created.db);
    pool = created.pool;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("isolates tenants and enforces turn leases", async () => {
    const a = await store.createConversation({
      tenantId: "pg-tenant-a",
      deploymentId: "fixture-a",
      ownerSubject: "op-a",
      audience: "operator",
      targetCustomerId: "cust-100",
    });
    const b = await store.createConversation({
      tenantId: "pg-tenant-b",
      deploymentId: "fixture-a",
      ownerSubject: "op-b",
      audience: "operator",
      targetCustomerId: "cust-100",
    });
    expect(await store.getConversation("pg-tenant-a", b.id)).toBeNull();
    expect(await store.getConversation("pg-tenant-b", a.id)).toBeNull();

    const accepted = await store.acceptTurn({
      conversationId: a.id,
      tenantId: "pg-tenant-a",
      ownerSubject: "op-a",
      clientTurnId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      expectedRevision: 0,
      text: "hello",
      requestHash: hashRequest("hello", 0),
      profileRevision: "rev",
      policyVersion: "v1",
      leaseMs: 1,
    });
    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted") return;

    const bad = await store.finalizeTurn({
      turnId: accepted.turn.id,
      leaseToken: "00000000-0000-0000-0000-000000000000",
      state: "completed",
      answerJson: { ok: true },
    });
    expect(bad.ok).toBe(false);

    const recovered = await store.recoverExpiredLeases(new Date(Date.now() + 1000));
    expect(recovered).toBeGreaterThanOrEqual(1);
    expect((await store.getTurn("pg-tenant-a", accepted.turn.id))?.state).toBe("interrupted");
  });
});
