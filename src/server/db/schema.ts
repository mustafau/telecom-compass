import "../guard";
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: text("token_hash").notNull(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    tenantId: text("tenant_id").notNull(),
    audience: text("audience").notNull(),
    rolesJson: jsonb("roles_json").$type<string[]>().notNull().default([]),
    claimsJson: jsonb("claims_json").$type<Record<string, unknown>>().notNull().default({}),
    policyVersion: text("policy_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    policyCheckedAt: timestamp("policy_checked_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("auth_sessions_token_hash_uidx").on(t.tokenHash)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: text("tenant_id").notNull(),
    deploymentId: text("deployment_id").notNull(),
    ownerSubject: text("owner_subject").notNull(),
    audience: text("audience").notNull(),
    targetCustomerId: text("target_customer_id"),
    title: text("title").notNull().default("Conversation"),
    revision: bigint("revision", { mode: "number" }).notNull().default(0),
    activeTurnId: uuid("active_turn_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("conversations_owner_list_idx").on(t.tenantId, t.ownerSubject, t.updatedAt, t.id),
  ],
);

export const turns = pgTable(
  "turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: text("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    clientTurnId: text("client_turn_id").notNull(),
    requestHash: text("request_hash").notNull(),
    profileRevision: text("profile_revision").notNull(),
    policyVersion: text("policy_version").notNull(),
    state: text("state").notNull(),
    leaseToken: uuid("lease_token").notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: text("error_code"),
    modelProvider: text("model_provider"),
    modelId: text("model_id"),
    answerJson: jsonb("answer_json").$type<Record<string, unknown>>(),
    budgetsJson: jsonb("budgets_json").$type<Record<string, unknown>>().default({}),
  },
  (t) => [
    uniqueIndex("turns_client_turn_uidx").on(t.tenantId, t.conversationId, t.clientTurnId),
    index("turns_lease_idx").on(t.state, t.leaseExpiresAt),
    uniqueIndex("turns_one_running_uidx")
      .on(t.tenantId, t.conversationId)
      .where(sql`${t.state} = 'running'`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: text("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    turnId: uuid("turn_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    role: text("role").notNull(),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
    contentSchemaVersion: text("content_schema_version").notNull().default("1"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("messages_sequence_uidx").on(t.tenantId, t.conversationId, t.sequence),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: text("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    turnId: uuid("turn_id").notNull(),
    deploymentId: text("deployment_id").notNull(),
    profileRevision: text("profile_revision").notNull(),
    kind: text("kind").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    sanitizedFields: jsonb("sanitized_fields").$type<Record<string, unknown>>().notNull(),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
    visibility: text("visibility").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sourceLocator: text("source_locator").notNull(),
  },
  (t) => [index("evidence_lookup_idx").on(t.tenantId, t.conversationId, t.id)],
);

export const toolExecutions = pgTable("tool_executions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),
  turnId: uuid("turn_id").notNull(),
  toolName: text("tool_name").notNull(),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  durationMs: bigint("duration_ms", { mode: "number" }),
  inputFingerprint: text("input_fingerprint").notNull(),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: text("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    turnId: uuid("turn_id").notNull(),
    subject: text("subject").notNull(),
    rating: text("rating").notNull(),
    reason: text("reason"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("feedback_turn_subject_uidx").on(t.tenantId, t.turnId, t.subject)],
);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  subjectPseudonym: text("subject_pseudonym").notNull(),
  action: text("action").notNull(),
  deploymentId: text("deployment_id"),
  conversationId: uuid("conversation_id"),
  turnId: uuid("turn_id"),
  outcome: text("outcome").notNull(),
  policyVersion: text("policy_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
