# Persistence and lifecycle

Use PostgreSQL through Drizzle and pg. Migrations are reviewed files under `migrations/`. No auto-migration on each request and no shared in-memory store for production. Local Compose and CI integration tests use the same database engine.

## Tables

Every tenant-owned table includes `tenant_id`. Foreign keys include tenant/conversation scope to prevent accidental cross-tenant attachment. All repository methods require a scoped context; disallow unscoped `findById` helpers.

| Table | Key fields and constraints |
| --- | --- |
| `auth_sessions` | Hashed opaque token; issuer/subject; tenant binding; minimal claims; expiry/idle expiry; policy_checked_at; never model-visible |
| `conversations` | UUID id; tenant_id; deployment_id; owner_subject; audience; target_customer_id nullable; title; revision bigint; active_turn_id nullable; created_at; updated_at; deleted_at nullable |
| `turns` | UUID id; tenant_id; conversation_id; client_turn_id; request_hash; profile_revision; policy_version; state; lease_token UUID; lease_expires_at; cancel_requested boolean; started_at; finished_at; error_code; model_provider/model_id; token counts; budgets summary JSONB |
| `messages` | UUID id; tenant_id; conversation_id; turn_id; sequence bigint; role user/assistant; content JSONB; content_schema_version; created_at |
| `evidence` | UUID id; tenant_id; conversation_id; turn_id; deployment_id; profile_revision; kind; entity_type/id nullable; sanitized_fields JSONB; provenance JSONB; visibility; retrieved_at; source_updated_at nullable; expires_at |
| `tool_executions` | UUID id; tenant_id; conversation_id; turn_id; tool name; status/error code; duration; input fingerprint; evidence IDs; timestamps; no raw payloads by default |
| `feedback` | UUID id; tenant_id; conversation_id; turn_id; subject; rating; reason; comment; created/updated timestamps |
| `audit_events` | UUID id; tenant_id; subject pseudonym; action; deployment_id; conversation/turn correlation IDs nullable; outcome; policy version; created_at; no prompt/data body |

Indexes: unique (tenant_id, conversation_id, client_turn_id) on turns; unique (tenant_id, conversation_id, sequence) on messages; unique (tenant_id, turn_id, subject) on feedback; conversation listing index (tenant_id, owner_subject, updated_at DESC, id); evidence lookup (tenant_id, conversation_id, id); stale lease index on running turns; expiry index on evidence. Include unique composite parent keys needed by scoped foreign keys. Limit one active turn per conversation through row locking plus a partial unique index on running turns.

Separate owner-subject visibility from tenant membership. Being an operator in the same tenant does not automatically grant access to another operator's conversations. Shared conversations are out of scope. If customer-access permission is revoked, conversation/evidence reads also deny or redact; do not rely on old authorization.

## Transactions

1. Acceptance transaction: lock conversation; handle idempotency; check revision and no active run; insert turn with fencing token/lease; insert user message; set active turn; increment revision; commit.
2. Tool recording: insert sanitized evidence and tool metadata scoped to active turn, checking its valid lease. Never hold a DB transaction during external I/O.
3. Finalization transaction: verify matching lease token and uncancelled running state; insert assistant answer; mark terminal; clear active turn; increment revision; commit. Emit final answer after commit.
4. Cancellation transaction: set request flag. Owner aborts and marks cancelled with the same fencing predicate. A race after successful finalization returns the completed state, not a fabricated cancellation.
5. Recovery transaction: lock expired running turn; mark interrupted; revoke lease; clear active turn; increment revision. No automatic rerun or hidden API calls.

Partial evidence from failed runs is not a user-facing answer. It may be retained under the same ACL for diagnostics, but must not be inserted into future model history as a completed response.

## Retention defaults

Local defaults: conversations, answer evidence and feedback 30 days; tool metadata 30 days; privacy-minimized audit 90 days. These are product defaults requiring organization review, not legal retention guidance. Make policies configurable with documented deletion jobs. Evidence cited by a retained answer should be retained for that answer's lifetime; if policy requires earlier deletion, display “source no longer retained” rather than resolving the ID to another source.

Delete conversation content/evidence/feedback transactionally or via an explicit tombstone and bounded cleanup job; return no content after tombstoning. Audit may retain non-content deletion events under its own policy. Exports and backups must follow the same access and expiry rules. Scheduled cleanup can be an external cron invoking a dedicated maintenance command, not an agent job.

## Schema evolution

Version persisted answer/message JSON. Old conversations render through versioned parsers; do not feed obsolete SDK-specific tool messages directly to the current model. Store domain answer objects rather than treating the AI SDK UI transport format as the permanent database schema. Rebuild safe model context from stored user text and validated answer summaries, with previous factual observations explicitly labelled historical.
