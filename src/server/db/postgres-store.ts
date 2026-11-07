import "../guard";
import { randomUUID } from "node:crypto";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Principal, SessionRecord } from "../auth/types";
import type { Db } from "./client";
import {
  authSessions,
  conversations,
  evidence,
  feedback,
  messages,
  turns,
} from "./schema";
import { hashToken } from "./memory-store";
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
  TurnState,
} from "./types";

type PrincipalClaims = {
  displayName: string;
  allowedDeploymentIds: string[];
  allowedCustomerIds: string[];
};

export class PostgresStore implements CompassStore {
  constructor(private readonly db: Db["db"]) {}

  async createSession(principal: Principal, tokenPlain: string, now = new Date()): Promise<SessionRecord> {
    const idleMs = 30 * 60_000;
    const absoluteMs = 8 * 60 * 60_000;
    const id = randomUUID();
    const tokenHash = hashToken(tokenPlain);
    const expiresAt = new Date(now.getTime() + absoluteMs);
    const idleExpiresAt = new Date(now.getTime() + idleMs);
    const claims: PrincipalClaims = {
      displayName: principal.displayName,
      allowedDeploymentIds: [...principal.allowedDeploymentIds],
      allowedCustomerIds: [...principal.allowedCustomerIds],
    };
    await this.db.insert(authSessions).values({
      id,
      tokenHash,
      issuer: principal.issuer,
      subject: principal.subject,
      tenantId: principal.tenantId,
      audience: principal.audience,
      rolesJson: [...principal.roles],
      claimsJson: claims,
      policyVersion: principal.policyVersion,
      expiresAt,
      idleExpiresAt,
      policyCheckedAt: now,
      createdAt: now,
    });
    return {
      id,
      tokenHash,
      principal,
      expiresAt,
      idleExpiresAt,
      policyCheckedAt: now,
    };
  }

  async getSessionByToken(tokenPlain: string, now = new Date()): Promise<SessionRecord | null> {
    const tokenHash = hashToken(tokenPlain);
    const rows = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt <= now || row.idleExpiresAt <= now) {
      await this.db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
      return null;
    }
    const idleExpiresAt = new Date(now.getTime() + 30 * 60_000);
    await this.db
      .update(authSessions)
      .set({ idleExpiresAt })
      .where(eq(authSessions.tokenHash, tokenHash));
    const claims = row.claimsJson as PrincipalClaims;
    return {
      id: row.id,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      idleExpiresAt,
      policyCheckedAt: row.policyCheckedAt,
      principal: {
        subject: row.subject,
        issuer: row.issuer,
        tenantId: row.tenantId,
        audience: row.audience as Principal["audience"],
        roles: row.rolesJson,
        policyVersion: row.policyVersion,
        displayName: claims.displayName ?? row.subject,
        allowedDeploymentIds: claims.allowedDeploymentIds ?? [],
        allowedCustomerIds: claims.allowedCustomerIds ?? [],
      },
    };
  }

  async revokeSession(tokenPlain: string): Promise<void> {
    await this.db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(tokenPlain)));
  }

  async createConversation(input: {
    tenantId: string;
    deploymentId: string;
    ownerSubject: string;
    audience: string;
    targetCustomerId: string | null;
    title?: string;
  }): Promise<ConversationRow> {
    const id = randomUUID();
    const now = new Date();
    await this.db.insert(conversations).values({
      id,
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
    });
    return {
      id,
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
  }

  async getConversation(tenantId: string, id: string): Promise<ConversationRow | null> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)))
      .limit(1);
    const row = rows[0];
    if (!row || row.deletedAt) return null;
    return mapConversation(row);
  }

  async listConversations(tenantId: string, ownerSubject: string): Promise<ConversationRow[]> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.ownerSubject, ownerSubject),
          sql`${conversations.deletedAt} is null`,
        ),
      )
      .orderBy(sql`${conversations.updatedAt} desc`);
    return rows.map(mapConversation);
  }

  async acceptTurn(input: AcceptTurnInput): Promise<AcceptTurnResult> {
    const now = input.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`select * from conversations where id = ${input.conversationId} and tenant_id = ${input.tenantId} for update`,
      );
      const convRaw = (locked.rows as Array<Record<string, unknown>>)[0];
      if (!convRaw || convRaw.deleted_at) throw new Error("Conversation not found");
      if (String(convRaw.owner_subject) !== input.ownerSubject) {
        throw new Error("Conversation not found");
      }

      const existingRows = await tx
        .select()
        .from(turns)
        .where(
          and(
            eq(turns.tenantId, input.tenantId),
            eq(turns.conversationId, input.conversationId),
            eq(turns.clientTurnId, input.clientTurnId),
          ),
        )
        .limit(1);
      const existing = existingRows[0];
      const conversation = mapConversationFromSql(convRaw);
      if (existing) {
        if (existing.requestHash === input.requestHash) {
          return {
            status: "replay" as const,
            turn: mapTurn(existing),
            conversation,
            replay: true as const,
          };
        }
        return { status: "conflict" as const, code: "IDEMPOTENCY_CONFLICT" as const };
      }

      if (Number(convRaw.revision) !== input.expectedRevision) {
        return { status: "conflict" as const, code: "REVISION_CONFLICT" as const };
      }

      if (convRaw.active_turn_id) {
        const activeRows = await tx
          .select()
          .from(turns)
          .where(eq(turns.id, String(convRaw.active_turn_id)))
          .limit(1);
        const active = activeRows[0];
        if (active && active.state === "running" && active.leaseExpiresAt > now) {
          return { status: "conflict" as const, code: "TURN_IN_PROGRESS" as const };
        }
      }

      const turnId = randomUUID();
      const leaseToken = randomUUID();
      const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? 20_000));
      await tx.insert(turns).values({
        id: turnId,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        clientTurnId: input.clientTurnId,
        requestHash: input.requestHash,
        profileRevision: input.profileRevision,
        policyVersion: input.policyVersion,
        state: "running",
        leaseToken,
        leaseExpiresAt,
        cancelRequested: false,
        startedAt: now,
        finishedAt: null,
        errorCode: null,
        modelProvider: null,
        modelId: null,
        answerJson: null,
        budgetsJson: {},
      });

      const seqResult = await tx.execute(
        sql`select coalesce(max(sequence), 0) + 1 as next from messages where conversation_id = ${input.conversationId} and tenant_id = ${input.tenantId}`,
      );
      const nextSeq = Number((seqResult.rows[0] as { next: string | number }).next);
      await tx.insert(messages).values({
        id: randomUUID(),
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        turnId,
        sequence: nextSeq,
        role: "user",
        contentJson: { text: input.text },
        contentSchemaVersion: "1",
        createdAt: now,
      });

      const newRevision = Number(convRaw.revision) + 1;
      await tx
        .update(conversations)
        .set({
          revision: newRevision,
          activeTurnId: turnId,
          updatedAt: now,
        })
        .where(eq(conversations.id, input.conversationId));

      const turn: TurnRow = {
        id: turnId,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        clientTurnId: input.clientTurnId,
        requestHash: input.requestHash,
        profileRevision: input.profileRevision,
        policyVersion: input.policyVersion,
        state: "running",
        leaseToken,
        leaseExpiresAt,
        cancelRequested: false,
        startedAt: now,
        finishedAt: null,
        errorCode: null,
        modelProvider: null,
        modelId: null,
        answerJson: null,
        budgetsJson: {},
      };
      return {
        status: "accepted" as const,
        turn,
        conversation: { ...conversation, revision: newRevision, activeTurnId: turnId, updatedAt: now },
        replay: false as const,
      };
    });
  }

  async getTurn(tenantId: string, turnId: string): Promise<TurnRow | null> {
    const rows = await this.db
      .select()
      .from(turns)
      .where(and(eq(turns.id, turnId), eq(turns.tenantId, tenantId)))
      .limit(1);
    return rows[0] ? mapTurn(rows[0]) : null;
  }

  async heartbeat(
    turnId: string,
    leaseToken: string,
    now = new Date(),
    leaseMs = 20_000,
  ): Promise<boolean> {
    const result = await this.db
      .update(turns)
      .set({ leaseExpiresAt: new Date(now.getTime() + leaseMs) })
      .where(
        and(
          eq(turns.id, turnId),
          eq(turns.leaseToken, leaseToken),
          eq(turns.state, "running"),
          sql`${turns.leaseExpiresAt} > ${now}`,
        ),
      )
      .returning({ id: turns.id });
    return result.length > 0;
  }

  async requestCancel(turnId: string, tenantId: string): Promise<TurnRow | null> {
    const result = await this.db
      .update(turns)
      .set({ cancelRequested: true })
      .where(and(eq(turns.id, turnId), eq(turns.tenantId, tenantId)))
      .returning();
    return result[0] ? mapTurn(result[0]) : null;
  }

  async finalizeTurn(input: FinalizeTurnInput): Promise<FinalizeTurnResult> {
    const now = input.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const turnRows = await tx
        .select()
        .from(turns)
        .where(eq(turns.id, input.turnId))
        .limit(1);
      const turn = turnRows[0];
      if (!turn) return { ok: false as const, code: "NOT_FOUND" };
      if (turn.leaseToken !== input.leaseToken) return { ok: false as const, code: "LEASE_MISMATCH" };

      const convRows = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, turn.conversationId))
        .limit(1);
      const conv = convRows[0];
      if (!conv) return { ok: false as const, code: "NOT_FOUND" };

      if (turn.state !== "running") {
        return { ok: true as const, turn: mapTurn(turn), conversation: mapConversation(conv) };
      }

      const nextState: TurnState =
        turn.cancelRequested && input.state !== "cancelled" ? "cancelled" : input.state;
      const answerJson = input.answerJson ?? null;
      await tx
        .update(turns)
        .set({
          state: nextState,
          answerJson,
          errorCode: input.errorCode ?? null,
          finishedAt: now,
        })
        .where(eq(turns.id, turn.id));

      const newRevision = conv.revision + 1;
      await tx
        .update(conversations)
        .set({
          activeTurnId: null,
          revision: newRevision,
          updatedAt: now,
        })
        .where(eq(conversations.id, conv.id));

      if (answerJson && (nextState === "completed" || nextState === "partial")) {
        const seqResult = await tx.execute(
          sql`select coalesce(max(sequence), 0) + 1 as next from messages where conversation_id = ${conv.id} and tenant_id = ${turn.tenantId}`,
        );
        const nextSeq = Number((seqResult.rows[0] as { next: string | number }).next);
        await tx.insert(messages).values({
          id: randomUUID(),
          tenantId: turn.tenantId,
          conversationId: conv.id,
          turnId: turn.id,
          sequence: nextSeq,
          role: "assistant",
          contentJson: answerJson,
          contentSchemaVersion: "1",
          createdAt: now,
        });
      }

      return {
        ok: true as const,
        turn: {
          ...mapTurn(turn),
          state: nextState,
          answerJson,
          errorCode: input.errorCode ?? null,
          finishedAt: now,
        },
        conversation: {
          ...mapConversation(conv),
          activeTurnId: null,
          revision: newRevision,
          updatedAt: now,
        },
      };
    });
  }

  async recoverExpiredLeases(now = new Date()): Promise<number> {
    const expired = await this.db
      .select()
      .from(turns)
      .where(and(eq(turns.state, "running"), lt(turns.leaseExpiresAt, now)));
    let count = 0;
    for (const turn of expired) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(turns)
          .set({
            state: "interrupted",
            finishedAt: now,
            errorCode: "LEASE_EXPIRED",
          })
          .where(eq(turns.id, turn.id));
        await tx
          .update(conversations)
          .set({
            activeTurnId: null,
            revision: sql`${conversations.revision} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(conversations.id, turn.conversationId),
              eq(conversations.activeTurnId, turn.id),
            ),
          );
      });
      count += 1;
    }
    return count;
  }

  async listMessages(tenantId: string, conversationId: string): Promise<MessageRow[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.tenantId, tenantId), eq(messages.conversationId, conversationId)))
      .orderBy(asc(messages.sequence));
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      conversationId: row.conversationId,
      turnId: row.turnId,
      sequence: row.sequence,
      role: row.role as "user" | "assistant",
      contentJson: row.contentJson,
      contentSchemaVersion: row.contentSchemaVersion,
      createdAt: row.createdAt,
    }));
  }

  async addEvidence(row: Omit<EvidenceRow, "id"> & { id?: string }): Promise<EvidenceRow> {
    const id = row.id ?? randomUUID();
    await this.db.insert(evidence).values({
      id,
      tenantId: row.tenantId,
      conversationId: row.conversationId,
      turnId: row.turnId,
      deploymentId: row.deploymentId,
      profileRevision: row.profileRevision,
      kind: row.kind,
      entityType: row.entityType,
      entityId: row.entityId,
      sanitizedFields: row.sanitizedFields,
      provenance: row.provenance,
      visibility: row.visibility,
      retrievedAt: row.retrievedAt,
      sourceUpdatedAt: row.sourceUpdatedAt,
      expiresAt: row.expiresAt,
      sourceLocator: row.sourceLocator,
    });
    return { ...row, id };
  }

  async getEvidence(
    tenantId: string,
    conversationId: string,
    evidenceId: string,
  ): Promise<EvidenceRow | null> {
    const rows = await this.db
      .select()
      .from(evidence)
      .where(
        and(
          eq(evidence.id, evidenceId),
          eq(evidence.tenantId, tenantId),
          eq(evidence.conversationId, conversationId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return mapEvidence(row);
  }

  async listEvidenceForTurn(tenantId: string, turnId: string): Promise<EvidenceRow[]> {
    const rows = await this.db
      .select()
      .from(evidence)
      .where(and(eq(evidence.tenantId, tenantId), eq(evidence.turnId, turnId)));
    return rows.map(mapEvidence);
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
    const existing = await this.db
      .select()
      .from(feedback)
      .where(
        and(
          eq(feedback.tenantId, input.tenantId),
          eq(feedback.turnId, input.turnId),
          eq(feedback.subject, input.subject),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const updated = await this.db
        .update(feedback)
        .set({
          rating: input.rating,
          reason: input.reason ?? null,
          comment: input.comment ?? null,
          updatedAt: new Date(),
        })
        .where(eq(feedback.id, existing[0].id))
        .returning();
      return mapFeedback(updated[0]!);
    }
    const id = randomUUID();
    const inserted = await this.db
      .insert(feedback)
      .values({
        id,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        turnId: input.turnId,
        subject: input.subject,
        rating: input.rating,
        reason: input.reason ?? null,
        comment: input.comment ?? null,
      })
      .returning();
    return mapFeedback(inserted[0]!);
  }

  async deleteConversation(
    tenantId: string,
    id: string,
    ownerSubject: string,
  ): Promise<boolean> {
    const row = await this.getConversation(tenantId, id);
    if (!row || row.ownerSubject !== ownerSubject) return false;
    if (row.activeTurnId) {
      const active = await this.getTurn(tenantId, row.activeTurnId);
      if (active?.state === "running") return false;
    }
    await this.db
      .update(conversations)
      .set({ deletedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)));
    return true;
  }

  async retainOlderThan(days: number, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60_000);
    const deleted = await this.db
      .delete(conversations)
      .where(lt(conversations.updatedAt, cutoff))
      .returning({ id: conversations.id });
    await this.db.delete(evidence).where(lt(evidence.retrievedAt, cutoff));
    return deleted.length;
  }
}

function mapConversation(row: typeof conversations.$inferSelect): ConversationRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    deploymentId: row.deploymentId,
    ownerSubject: row.ownerSubject,
    audience: row.audience,
    targetCustomerId: row.targetCustomerId,
    title: row.title,
    revision: row.revision,
    activeTurnId: row.activeTurnId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function mapConversationFromSql(row: Record<string, unknown>): ConversationRow {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    deploymentId: String(row.deployment_id),
    ownerSubject: String(row.owner_subject),
    audience: String(row.audience),
    targetCustomerId: row.target_customer_id == null ? null : String(row.target_customer_id),
    title: String(row.title),
    revision: Number(row.revision),
    activeTurnId: row.active_turn_id == null ? null : String(row.active_turn_id),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    deletedAt: row.deleted_at == null ? null : new Date(String(row.deleted_at)),
  };
}

function mapTurn(row: typeof turns.$inferSelect): TurnRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    conversationId: row.conversationId,
    clientTurnId: row.clientTurnId,
    requestHash: row.requestHash,
    profileRevision: row.profileRevision,
    policyVersion: row.policyVersion,
    state: row.state as TurnState,
    leaseToken: row.leaseToken,
    leaseExpiresAt: row.leaseExpiresAt,
    cancelRequested: row.cancelRequested,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    errorCode: row.errorCode,
    modelProvider: row.modelProvider,
    modelId: row.modelId,
    answerJson: row.answerJson,
    budgetsJson: row.budgetsJson ?? {},
  };
}

function mapEvidence(row: typeof evidence.$inferSelect): EvidenceRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    conversationId: row.conversationId,
    turnId: row.turnId,
    deploymentId: row.deploymentId,
    profileRevision: row.profileRevision,
    kind: row.kind,
    entityType: row.entityType,
    entityId: row.entityId,
    sanitizedFields: row.sanitizedFields,
    provenance: row.provenance,
    visibility: row.visibility,
    retrievedAt: row.retrievedAt,
    sourceUpdatedAt: row.sourceUpdatedAt,
    expiresAt: row.expiresAt,
    sourceLocator: row.sourceLocator,
  };
}

function mapFeedback(row: typeof feedback.$inferSelect): FeedbackRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    conversationId: row.conversationId,
    turnId: row.turnId,
    subject: row.subject,
    rating: row.rating,
    reason: row.reason,
    comment: row.comment,
  };
}
