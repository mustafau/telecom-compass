import "../guard";
import { createHash, randomUUID } from "node:crypto";
import type { Principal, SessionRecord } from "../auth/types";

export type TurnState =
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "interrupted";

export type ConversationRow = {
  id: string;
  tenantId: string;
  deploymentId: string;
  ownerSubject: string;
  audience: string;
  targetCustomerId: string | null;
  title: string;
  revision: number;
  activeTurnId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type TurnRow = {
  id: string;
  tenantId: string;
  conversationId: string;
  clientTurnId: string;
  requestHash: string;
  profileRevision: string;
  policyVersion: string;
  state: TurnState;
  leaseToken: string;
  leaseExpiresAt: Date;
  cancelRequested: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  errorCode: string | null;
  modelProvider: string | null;
  modelId: string | null;
  answerJson: Record<string, unknown> | null;
  budgetsJson: Record<string, unknown>;
};

export type MessageRow = {
  id: string;
  tenantId: string;
  conversationId: string;
  turnId: string;
  sequence: number;
  role: "user" | "assistant";
  contentJson: Record<string, unknown>;
  contentSchemaVersion: string;
  createdAt: Date;
};

export type EvidenceRow = {
  id: string;
  tenantId: string;
  conversationId: string;
  turnId: string;
  deploymentId: string;
  profileRevision: string;
  kind: string;
  entityType: string | null;
  entityId: string | null;
  sanitizedFields: Record<string, unknown>;
  provenance: Record<string, unknown>;
  visibility: string;
  retrievedAt: Date;
  sourceUpdatedAt: Date | null;
  expiresAt: Date | null;
  sourceLocator: string;
};

export type AcceptTurnInput = {
  conversationId: string;
  tenantId: string;
  ownerSubject: string;
  clientTurnId: string;
  expectedRevision: number;
  text: string;
  requestHash: string;
  profileRevision: string;
  policyVersion: string;
  leaseMs?: number;
  now?: Date;
};

export type AcceptTurnResult =
  | { status: "accepted"; turn: TurnRow; conversation: ConversationRow; replay: false }
  | { status: "replay"; turn: TurnRow; conversation: ConversationRow; replay: true }
  | { status: "conflict"; code: "REVISION_CONFLICT" | "TURN_IN_PROGRESS" | "IDEMPOTENCY_CONFLICT" };

/** Deterministic in-memory store for unit/integration tests and local scripted mode. */
export class MemoryStore {
  sessions = new Map<string, SessionRecord>();
  conversations = new Map<string, ConversationRow>();
  turns = new Map<string, TurnRow>();
  messages: MessageRow[] = [];
  evidence: EvidenceRow[] = [];
  feedback: Array<Record<string, unknown>> = [];
  audit: Array<Record<string, unknown>> = [];

  createSession(principal: Principal, tokenPlain: string, now = new Date()): SessionRecord {
    const idleMs = 30 * 60_000;
    const absoluteMs = 8 * 60 * 60_000;
    const record: SessionRecord = {
      id: randomUUID(),
      tokenHash: hashToken(tokenPlain),
      principal,
      expiresAt: new Date(now.getTime() + absoluteMs),
      idleExpiresAt: new Date(now.getTime() + idleMs),
      policyCheckedAt: now,
    };
    this.sessions.set(record.tokenHash, record);
    return record;
  }

  getSessionByToken(tokenPlain: string, now = new Date()): SessionRecord | null {
    const record = this.sessions.get(hashToken(tokenPlain));
    if (!record) return null;
    if (record.expiresAt <= now || record.idleExpiresAt <= now) {
      this.sessions.delete(record.tokenHash);
      return null;
    }
    record.idleExpiresAt = new Date(now.getTime() + 30 * 60_000);
    return record;
  }

  revokeSession(tokenPlain: string): void {
    this.sessions.delete(hashToken(tokenPlain));
  }

  createConversation(input: {
    tenantId: string;
    deploymentId: string;
    ownerSubject: string;
    audience: string;
    targetCustomerId: string | null;
    title?: string;
  }): ConversationRow {
    const now = new Date();
    const row: ConversationRow = {
      id: randomUUID(),
      tenantId: input.tenantId,
      deploymentId: input.deploymentId,
      ownerSubject: input.ownerSubject,
      audience: input.audience,
      targetCustomerId: input.targetCustomerId,
      title: input.title ?? "Conversation",
      revision: 0,
      activeTurnId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.conversations.set(row.id, row);
    return row;
  }

  getConversation(tenantId: string, id: string): ConversationRow | null {
    const row = this.conversations.get(id);
    if (!row || row.tenantId !== tenantId || row.deletedAt) return null;
    return row;
  }

  listConversations(tenantId: string, ownerSubject: string): ConversationRow[] {
    return [...this.conversations.values()]
      .filter((c) => c.tenantId === tenantId && c.ownerSubject === ownerSubject && !c.deletedAt)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  acceptTurn(input: AcceptTurnInput): AcceptTurnResult {
    const now = input.now ?? new Date();
    const conversation = this.getConversation(input.tenantId, input.conversationId);
    if (!conversation || conversation.ownerSubject !== input.ownerSubject) {
      throw new Error("Conversation not found");
    }

    const existing = [...this.turns.values()].find(
      (t) =>
        t.tenantId === input.tenantId &&
        t.conversationId === input.conversationId &&
        t.clientTurnId === input.clientTurnId,
    );
    if (existing) {
      if (existing.requestHash === input.requestHash) {
        return { status: "replay", turn: existing, conversation, replay: true };
      }
      return { status: "conflict", code: "IDEMPOTENCY_CONFLICT" };
    }

    if (conversation.revision !== input.expectedRevision) {
      return { status: "conflict", code: "REVISION_CONFLICT" };
    }
    if (conversation.activeTurnId) {
      const active = this.turns.get(conversation.activeTurnId);
      if (active && active.state === "running" && active.leaseExpiresAt > now) {
        return { status: "conflict", code: "TURN_IN_PROGRESS" };
      }
    }

    const turn: TurnRow = {
      id: randomUUID(),
      tenantId: input.tenantId,
      conversationId: conversation.id,
      clientTurnId: input.clientTurnId,
      requestHash: input.requestHash,
      profileRevision: input.profileRevision,
      policyVersion: input.policyVersion,
      state: "running",
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? 20_000)),
      cancelRequested: false,
      startedAt: now,
      finishedAt: null,
      errorCode: null,
      modelProvider: null,
      modelId: null,
      answerJson: null,
      budgetsJson: {},
    };
    this.turns.set(turn.id, turn);

    const sequence = this.messages.filter((m) => m.conversationId === conversation.id).length + 1;
    this.messages.push({
      id: randomUUID(),
      tenantId: input.tenantId,
      conversationId: conversation.id,
      turnId: turn.id,
      sequence,
      role: "user",
      contentJson: { text: input.text },
      contentSchemaVersion: "1",
      createdAt: now,
    });

    conversation.revision += 1;
    conversation.activeTurnId = turn.id;
    conversation.updatedAt = now;
    return { status: "accepted", turn, conversation, replay: false };
  }

  heartbeat(turnId: string, leaseToken: string, now = new Date(), leaseMs = 20_000): boolean {
    const turn = this.turns.get(turnId);
    if (!turn || turn.leaseToken !== leaseToken || turn.state !== "running") return false;
    if (turn.leaseExpiresAt <= now) return false;
    turn.leaseExpiresAt = new Date(now.getTime() + leaseMs);
    return true;
  }

  requestCancel(turnId: string, tenantId: string): TurnRow | null {
    const turn = this.turns.get(turnId);
    if (!turn || turn.tenantId !== tenantId) return null;
    turn.cancelRequested = true;
    return turn;
  }

  finalizeTurn(input: {
    turnId: string;
    leaseToken: string;
    state: Exclude<TurnState, "running">;
    answerJson?: Record<string, unknown> | null;
    errorCode?: string | null;
    now?: Date;
  }): { ok: true; turn: TurnRow; conversation: ConversationRow } | { ok: false; code: string } {
    const now = input.now ?? new Date();
    const turn = this.turns.get(input.turnId);
    if (!turn) return { ok: false, code: "NOT_FOUND" };
    if (turn.leaseToken !== input.leaseToken) return { ok: false, code: "LEASE_MISMATCH" };
    if (turn.state !== "running") {
      const conversation = this.conversations.get(turn.conversationId)!;
      return { ok: true, turn, conversation };
    }
    if (turn.cancelRequested && input.state !== "cancelled") {
      // Prefer cancellation if requested before final answer commit.
      turn.state = "cancelled";
    } else {
      turn.state = input.state;
    }
    turn.answerJson = input.answerJson ?? null;
    turn.errorCode = input.errorCode ?? null;
    turn.finishedAt = now;
    const conversation = this.conversations.get(turn.conversationId)!;
    conversation.activeTurnId = null;
    conversation.revision += 1;
    conversation.updatedAt = now;

    if (turn.answerJson && (turn.state === "completed" || turn.state === "partial")) {
      const sequence = this.messages.filter((m) => m.conversationId === conversation.id).length + 1;
      this.messages.push({
        id: randomUUID(),
        tenantId: turn.tenantId,
        conversationId: conversation.id,
        turnId: turn.id,
        sequence,
        role: "assistant",
        contentJson: turn.answerJson,
        contentSchemaVersion: "1",
        createdAt: now,
      });
    }
    return { ok: true, turn, conversation };
  }

  recoverExpiredLeases(now = new Date()): number {
    let count = 0;
    for (const turn of this.turns.values()) {
      if (turn.state === "running" && turn.leaseExpiresAt <= now) {
        turn.state = "interrupted";
        turn.finishedAt = now;
        turn.errorCode = "LEASE_EXPIRED";
        const conversation = this.conversations.get(turn.conversationId);
        if (conversation && conversation.activeTurnId === turn.id) {
          conversation.activeTurnId = null;
          conversation.revision += 1;
          conversation.updatedAt = now;
        }
        count += 1;
      }
    }
    return count;
  }

  addEvidence(row: Omit<EvidenceRow, "id"> & { id?: string }): EvidenceRow {
    const full: EvidenceRow = { ...row, id: row.id ?? randomUUID() };
    this.evidence.push(full);
    return full;
  }

  getEvidence(tenantId: string, conversationId: string, evidenceId: string): EvidenceRow | null {
    return (
      this.evidence.find(
        (e) =>
          e.tenantId === tenantId &&
          e.conversationId === conversationId &&
          e.id === evidenceId,
      ) ?? null
    );
  }

  listEvidenceForTurn(tenantId: string, turnId: string): EvidenceRow[] {
    return this.evidence.filter((e) => e.tenantId === tenantId && e.turnId === turnId);
  }

  deleteConversation(tenantId: string, id: string, ownerSubject: string): boolean {
    const row = this.getConversation(tenantId, id);
    if (!row || row.ownerSubject !== ownerSubject) return false;
    if (row.activeTurnId) {
      const active = this.turns.get(row.activeTurnId);
      if (active?.state === "running") return false;
    }
    row.deletedAt = new Date();
    return true;
  }

  retainOlderThan(days: number, now = new Date()): number {
    const cutoff = now.getTime() - days * 24 * 60 * 60_000;
    let removed = 0;
    for (const [id, c] of this.conversations) {
      if (c.updatedAt.getTime() < cutoff) {
        this.conversations.delete(id);
        removed += 1;
      }
    }
    this.evidence = this.evidence.filter((e) => e.retrievedAt.getTime() >= cutoff);
    return removed;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashRequest(text: string, expectedRevision: number): string {
  return createHash("sha256")
    .update(JSON.stringify({ text: text.trim(), expectedRevision }))
    .digest("hex");
}
