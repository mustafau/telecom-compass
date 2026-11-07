import { describe, expect, it } from "vitest";
import { hashRequest, MemoryStore } from "../../../src/server/db/memory-store";
import type { Principal } from "../../../src/server/auth/types";

const principal: Principal = {
  subject: "local:op-alpha",
  tenantId: "tenant-a",
  audience: "operator",
  roles: ["operator"],
  policyVersion: "v1",
  issuer: "local-fixture",
  displayName: "Operator Alpha",
  allowedDeploymentIds: ["fixture-a"],
  allowedCustomerIds: ["cust-100"],
};

describe("memory store persistence semantics", () => {
  it("keeps tenants isolated for identical conversation resource shapes", async () => {
    const store = new MemoryStore();
    const a = await store.createConversation({
      tenantId: "tenant-a",
      deploymentId: "fixture-a",
      ownerSubject: "op-a",
      audience: "operator",
      targetCustomerId: "cust-100",
    });
    const b = await store.createConversation({
      tenantId: "tenant-b",
      deploymentId: "fixture-a",
      ownerSubject: "op-b",
      audience: "operator",
      targetCustomerId: "cust-100",
    });
    expect(await store.getConversation("tenant-a", b.id)).toBeNull();
    expect(await store.getConversation("tenant-b", a.id)).toBeNull();
  });

  it("replays identical clientTurnId fingerprints and conflicts on mismatch", async () => {
    const store = new MemoryStore();
    const conversation = await store.createConversation({
      tenantId: principal.tenantId,
      deploymentId: "fixture-a",
      ownerSubject: principal.subject,
      audience: "operator",
      targetCustomerId: "cust-100",
    });
    const hash = hashRequest("hello", 0);
    const first = await store.acceptTurn({
      conversationId: conversation.id,
      tenantId: principal.tenantId,
      ownerSubject: principal.subject,
      clientTurnId: "11111111-1111-1111-1111-111111111111",
      expectedRevision: 0,
      text: "hello",
      requestHash: hash,
      profileRevision: "abc",
      policyVersion: "v1",
    });
    expect(first.status).toBe("accepted");
    const replay = await store.acceptTurn({
      conversationId: conversation.id,
      tenantId: principal.tenantId,
      ownerSubject: principal.subject,
      clientTurnId: "11111111-1111-1111-1111-111111111111",
      expectedRevision: 0,
      text: "hello",
      requestHash: hash,
      profileRevision: "abc",
      policyVersion: "v1",
    });
    expect(replay.status).toBe("replay");
    const conflict = await store.acceptTurn({
      conversationId: conversation.id,
      tenantId: principal.tenantId,
      ownerSubject: principal.subject,
      clientTurnId: "11111111-1111-1111-1111-111111111111",
      expectedRevision: 0,
      text: "different",
      requestHash: hashRequest("different", 0),
      profileRevision: "abc",
      policyVersion: "v1",
    });
    expect(conflict).toEqual({ status: "conflict", code: "IDEMPOTENCY_CONFLICT" });
  });

  it("fences finalize on lease token and recovers expired leases", async () => {
    const store = new MemoryStore();
    const conversation = await store.createConversation({
      tenantId: principal.tenantId,
      deploymentId: "fixture-a",
      ownerSubject: principal.subject,
      audience: "operator",
      targetCustomerId: "cust-100",
    });
    const accepted = await store.acceptTurn({
      conversationId: conversation.id,
      tenantId: principal.tenantId,
      ownerSubject: principal.subject,
      clientTurnId: "22222222-2222-2222-2222-222222222222",
      expectedRevision: 0,
      text: "hello",
      requestHash: hashRequest("hello", 0),
      profileRevision: "abc",
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
    expect(recovered).toBe(1);
    expect((await store.getTurn(principal.tenantId, accepted.turn.id))?.state).toBe("interrupted");
  });

  it("rejects concurrent active turns", async () => {
    const store = new MemoryStore();
    const conversation = await store.createConversation({
      tenantId: principal.tenantId,
      deploymentId: "fixture-a",
      ownerSubject: principal.subject,
      audience: "operator",
      targetCustomerId: "cust-100",
    });
    const first = await store.acceptTurn({
      conversationId: conversation.id,
      tenantId: principal.tenantId,
      ownerSubject: principal.subject,
      clientTurnId: "33333333-3333-3333-3333-333333333333",
      expectedRevision: 0,
      text: "one",
      requestHash: hashRequest("one", 0),
      profileRevision: "abc",
      policyVersion: "v1",
    });
    expect(first.status).toBe("accepted");
    const second = await store.acceptTurn({
      conversationId: conversation.id,
      tenantId: principal.tenantId,
      ownerSubject: principal.subject,
      clientTurnId: "44444444-4444-4444-4444-444444444444",
      expectedRevision: 1,
      text: "two",
      requestHash: hashRequest("two", 1),
      profileRevision: "abc",
      policyVersion: "v1",
    });
    expect(second).toEqual({ status: "conflict", code: "TURN_IN_PROGRESS" });
  });
});
