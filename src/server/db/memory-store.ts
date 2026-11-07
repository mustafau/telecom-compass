import "../guard";
import { createHash, randomUUID } from "node:crypto";
import type { Principal, SessionRecord } from "../auth/types";
import type {
  AcceptTurnInput,
  AcceptTurnResult,
  CompassStore,
  ConversationRow,
  EvidenceRow,
  FeedbackRow,
  FinalizeTurnInput,
  FinalizeTurnResult,
  MessageRow,
  TurnRow,
} from "./types";

/** Deterministic in-memory store for unit/integration tests and local scripted mode. */
export class MemoryStore implements CompassStore {
  private sessions = new Map<string, SessionRecord>();
  private conversations = new Map<string, ConversationRow>();
  private turns = new Map<string, TurnRow>();
  private messages: MessageRow[] = [];
  private evidence: EvidenceRow[] = [];
  private feedback: FeedbackRow[] = [];

  async createSession(principal: Principal, tokenPlain: string, now = new Date()): Promise<SessionRecord> {
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

  async getSessionByToken(tokenPlain: string, now = new Date()): Promise<SessionRecord | null> {
    const record = this.sessions.get(hashToken(tokenPlain));
    if (!record) return null;
    if (record.expiresAt <= now || record.idleExpiresAt <= now) {
      this.sessions.delete(record.tokenHash);
      return null;
    }
    record.idleExpiresAt = new Date(now.getTime() + 30 * 60_000);
    return record;
  }

  async revokeSession(tokenPlain: string): Promise<void> {
    this.sessions.delete(hashToken(tokenPlain));
  }

  async createConversation(input: {
    tenantId: string;
    deploymentId: string;
    ownerSubject: string;
    audience: string;
    targetCustomerId: string | null;
    title?: string;
  }): Promise<ConversationRow> {
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

  async getConversation(tenantId: string, id: string): Promise<ConversationRow | null> {
    const row = this.conversations.get(id);
    if (!row || row.tenantId !== tenantId || row.deletedAt) return null;
    return row;
  }

  async listConversations(tenantId: string, ownerSubject: string): Promise<ConversationRow[]> {
    return [...this.conversations.values()]
      .filter((c) => c.tenantId === tenantId && c.ownerSubject === ownerSubject && !c.deletedAt)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async acceptTurn(input: AcceptTurnInput): Promise<AcceptTurnResult> {
    const now = input.now ?? new Date();
    const conversation = await this.getConversation(input.tenantId, input.conversationId);
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

    const sequence =
      this.messages.filter((m) => m.conversationId === conversation.id).length + 1;
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

  async getTurn(tenantId: string, turnId: string): Promise<TurnRow | null> {
    const turn = this.turns.get(turnId);
    if (!turn || turn.tenantId !== tenantId) return null;
    return turn;
  }

  async heartbeat(
    turnId: string,
    leaseToken: string,
    now = new Date(),
    leaseMs = 20_000,
  ): Promise<boolean> {
    const turn = this.turns.get(turnId);
    if (!turn || turn.leaseToken !== leaseToken || turn.state !== "running") return false;
    if (turn.leaseExpiresAt <= now) return false;
    turn.leaseExpiresAt = new Date(now.getTime() + leaseMs);
    return true;
  }

  async requestCancel(turnId: string, tenantId: string): Promise<TurnRow | null> {
    const turn = this.turns.get(turnId);
    if (!turn || turn.tenantId !== tenantId) return null;
    turn.cancelRequested = true;
    return turn;
  }

  async finalizeTurn(input: FinalizeTurnInput): Promise<FinalizeTurnResult> {
    const now = input.now ?? new Date();
    const turn = this.turns.get(input.turnId);
    if (!turn) return { ok: false, code: "NOT_FOUND" };
    if (turn.leaseToken !== input.leaseToken) return { ok: false, code: "LEASE_MISMATCH" };
    if (turn.state !== "running") {
      const conversation = this.conversations.get(turn.conversationId)!;
      return { ok: true, turn, conversation };
    }
    if (turn.cancelRequested && input.state !== "cancelled") {
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
      const sequence =
        this.messages.filter((m) => m.conversationId === conversation.id).length + 1;
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

  async recoverExpiredLeases(now = new Date()): Promise<number> {
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

  async listMessages(tenantId: string, conversationId: string): Promise<MessageRow[]> {
    return this.messages
      .filter((m) => m.tenantId === tenantId && m.conversationId === conversationId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  async addEvidence(row: Omit<EvidenceRow, "id"> & { id?: string }): Promise<EvidenceRow> {
    const full: EvidenceRow = { ...row, id: row.id ?? randomUUID() };
    this.evidence.push(full);
    return full;
  }

  async getEvidence(
    tenantId: string,
    conversationId: string,
    evidenceId: string,
  ): Promise<EvidenceRow | null> {
    return (
      this.evidence.find(
        (e) =>
          e.tenantId === tenantId &&
          e.conversationId === conversationId &&
          e.id === evidenceId,
      ) ?? null
    );
  }

  async listEvidenceForTurn(tenantId: string, turnId: string): Promise<EvidenceRow[]> {
    return this.evidence.filter((e) => e.tenantId === tenantId && e.turnId === turnId);
  }

  async upsertFeedback(input: {
    tenantId: string;
    conversationId: string;
    turnId: string;
    subject: string;
    rating: string;
    reason?: string;
    comment?: string;
  }): Promise<FeedbackRow> {
    const existing = this.feedback.find(
      (f) =>
        f.tenantId === input.tenantId &&
        f.turnId === input.turnId &&
        f.subject === input.subject,
    );
    if (existing) {
      existing.rating = input.rating;
      existing.reason = input.reason ?? null;
      existing.comment = input.comment ?? null;
      return existing;
    }
    const row: FeedbackRow = {
      id: randomUUID(),
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      turnId: input.turnId,
      subject: input.subject,
      rating: input.rating,
      reason: input.reason ?? null,
      comment: input.comment ?? null,
    };
    this.feedback.push(row);
    return row;
  }

  async deleteConversation(
    tenantId: string,
    id: string,
    ownerSubject: string,
  ): Promise<boolean> {
    const row = await this.getConversation(tenantId, id);
    if (!row || row.ownerSubject !== ownerSubject) return false;
    if (row.activeTurnId) {
      const active = this.turns.get(row.activeTurnId);
      if (active?.state === "running") return false;
    }
    row.deletedAt = new Date();
    return true;
  }

  async retainOlderThan(days: number, now = new Date()): Promise<number> {
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
