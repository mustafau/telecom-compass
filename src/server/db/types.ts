import "../guard";
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

export type FeedbackRow = {
  id: string;
  tenantId: string;
  conversationId: string;
  turnId: string;
  subject: string;
  rating: string;
  reason: string | null;
  comment: string | null;
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

export type FinalizeTurnInput = {
  turnId: string;
  leaseToken: string;
  state: Exclude<TurnState, "running">;
  answerJson?: Record<string, unknown> | null;
  errorCode?: string | null;
  now?: Date;
};

export type FinalizeTurnResult =
  | { ok: true; turn: TurnRow; conversation: ConversationRow }
  | { ok: false; code: string };

/** Persistence port used by HTTP, auth, evidence, and turn runner. */
export type CompassStore = {
  createSession(principal: Principal, tokenPlain: string, now?: Date): Promise<SessionRecord>;
  getSessionByToken(tokenPlain: string, now?: Date): Promise<SessionRecord | null>;
  revokeSession(tokenPlain: string): Promise<void>;

  createConversation(input: {
    tenantId: string;
    deploymentId: string;
    ownerSubject: string;
    audience: string;
    targetCustomerId: string | null;
    title?: string;
  }): Promise<ConversationRow>;
  getConversation(tenantId: string, id: string): Promise<ConversationRow | null>;
  listConversations(tenantId: string, ownerSubject: string): Promise<ConversationRow[]>;
  deleteConversation(tenantId: string, id: string, ownerSubject: string): Promise<boolean>;

  acceptTurn(input: AcceptTurnInput): Promise<AcceptTurnResult>;
  getTurn(tenantId: string, turnId: string): Promise<TurnRow | null>;
  heartbeat(turnId: string, leaseToken: string, now?: Date, leaseMs?: number): Promise<boolean>;
  requestCancel(turnId: string, tenantId: string): Promise<TurnRow | null>;
  finalizeTurn(input: FinalizeTurnInput): Promise<FinalizeTurnResult>;
  recoverExpiredLeases(now?: Date): Promise<number>;

  listMessages(tenantId: string, conversationId: string): Promise<MessageRow[]>;

  addEvidence(row: Omit<EvidenceRow, "id"> & { id?: string }): Promise<EvidenceRow>;
  getEvidence(
    tenantId: string,
    conversationId: string,
    evidenceId: string,
  ): Promise<EvidenceRow | null>;
  listEvidenceForTurn(tenantId: string, turnId: string): Promise<EvidenceRow[]>;

  upsertFeedback(input: {
    tenantId: string;
    conversationId: string;
    turnId: string;
    subject: string;
    rating: string;
    reason?: string;
    comment?: string;
  }): Promise<FeedbackRow>;

  retainOlderThan(days: number, now?: Date): Promise<number>;
};
