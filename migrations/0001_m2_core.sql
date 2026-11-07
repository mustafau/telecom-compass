CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  issuer text NOT NULL,
  subject text NOT NULL,
  tenant_id text NOT NULL,
  audience text NOT NULL,
  roles_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  claims_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_version text NOT NULL,
  expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  policy_checked_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  deployment_id text NOT NULL,
  owner_subject text NOT NULL,
  audience text NOT NULL,
  target_customer_id text,
  title text NOT NULL DEFAULT 'Conversation',
  revision bigint NOT NULL DEFAULT 0,
  active_turn_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS conversations_owner_list_idx
  ON conversations (tenant_id, owner_subject, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  conversation_id uuid NOT NULL,
  client_turn_id text NOT NULL,
  request_hash text NOT NULL,
  profile_revision text NOT NULL,
  policy_version text NOT NULL,
  state text NOT NULL,
  lease_token uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  cancel_requested boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_code text,
  model_provider text,
  model_id text,
  answer_json jsonb,
  budgets_json jsonb DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, conversation_id, client_turn_id)
);
CREATE INDEX IF NOT EXISTS turns_lease_idx ON turns (state, lease_expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS turns_one_running_uidx
  ON turns (tenant_id, conversation_id)
  WHERE state = 'running';

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  conversation_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  sequence bigint NOT NULL,
  role text NOT NULL,
  content_json jsonb NOT NULL,
  content_schema_version text NOT NULL DEFAULT '1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, conversation_id, sequence)
);

CREATE TABLE IF NOT EXISTS evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  conversation_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  deployment_id text NOT NULL,
  profile_revision text NOT NULL,
  kind text NOT NULL,
  entity_type text,
  entity_id text,
  sanitized_fields jsonb NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  expires_at timestamptz,
  source_locator text NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_lookup_idx ON evidence (tenant_id, conversation_id, id);

CREATE TABLE IF NOT EXISTS tool_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  conversation_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  tool_name text NOT NULL,
  status text NOT NULL,
  error_code text,
  duration_ms bigint,
  input_fingerprint text NOT NULL,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  conversation_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  subject text NOT NULL,
  rating text NOT NULL,
  reason text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, turn_id, subject)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  subject_pseudonym text NOT NULL,
  action text NOT NULL,
  deployment_id text,
  conversation_id uuid,
  turn_id uuid,
  outcome text NOT NULL,
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
