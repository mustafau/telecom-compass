# Low-level design

Status: current intended design. Applies to arbitrary configured TMF deployments; there is no sandbox-specific execution path. Read [TMF integration](tmf-integration.md) before changing adapters. Reconcile this document with `src/` as milestones land.

## 1. Source layout

| Path | Responsibility |
| --- | --- |
| `src/worker/` | Hono Worker entry and HTTP route mounting |
| `src/node/` | Optional Node adapter entry for the same Hono app |
| `src/client/` | React SPA: authenticated layout, conversations, operator customer selection |
| `src/client/components/chat/` | Composer, message list, progress and answer cards |
| `src/client/components/evidence/` | Source drawer and provenance display |
| `src/server/config/` | Environment validation and deployment-profile loading |
| `src/server/auth/` | OIDC sessions, principal mapping, policy interface, local test provider |
| `src/server/agent/` | Provider factory, discovery loop, answer synthesis, budgets, instructions |
| `src/server/tools/` | Native AI SDK registration and common execution wrapper |
| `src/server/domain/` | Normalized types, service diagnosis, orders, tickets, relationship resolution |
| `src/server/tmf/` | Transport, operation registry, version adapters, profile compatibility checks |
| `src/server/knowledge/` | Document source adapter, scoped retrieval and evidence extraction |
| `src/server/evidence/` | Evidence ledger, projection, citation validation and source resolution |
| `src/server/db/` | Drizzle tables, repositories and transactional turn lifecycle |
| `src/server/telemetry/` | Safe logs, spans, metrics and audit events |
| `src/contracts/` | Browser-safe schemas for requests, results and stream data |
| `src/generated/tmf/` | Optional generated types for explicitly pinned contracts, not hand-edited |
| `migrations/` | Reviewed SQL migrations generated during implementation |
| `tests/{unit,integration,contract,e2e,cloudflare}/` | Deterministic tests; fixtures live under `tests/fixtures/` |
| `evals/` | Versioned scenarios and model-evaluation specifications |

Use server-only guards on every integration, provider and storage entry point. Client components may import only browser-safe contracts. Enforce this with lint/import rules.

## 2. Core types

Implement these as TypeScript types plus Zod validators at external boundaries. UUIDs are server-generated except `clientTurnId`, which is an untrusted idempotency token.

```ts
type Audience = 'operator' | 'customer';
type Principal = Readonly<{
  subject: string; tenantId: string; audience: Audience;
  roles: readonly string[]; policyVersion: string;
}>;
type ExecutionContext = Readonly<{
  principal: Principal; deploymentId: string; profileRevision: string;
  conversationId: string; turnId: string; targetCustomerId?: string;
  signal: AbortSignal; deadline: number; budget: RunBudget;
}>;
type EntityKind = 'customer' | 'product' | 'service' | 'resource'
  | 'troubleTicket' | 'serviceOrder' | 'productOrder';
type EntityRef = { kind: EntityKind; id: string; apiId: string; major: string };
type Completeness = 'complete' | 'partial' | 'unknown';
type ToolResult<T> =
  | { status: 'ok' | 'partial'; data: T; evidenceIds: string[];
      completeness: Completeness; warnings: string[] }
  | { status: 'unavailable'; code: ErrorCode; retryable: boolean;
      evidenceIds: string[]; userMessage: string };
```

`ErrorCode`: INVALID_ARGUMENT, NOT_FOUND_OR_NOT_AUTHORIZED, CAPABILITY_UNAVAILABLE, RELATIONSHIP_UNAVAILABLE, UPSTREAM_UNAVAILABLE, UPSTREAM_TIMEOUT, UPSTREAM_RATE_LIMITED, UPSTREAM_AUTH_FAILURE, INVALID_UPSTREAM_RESPONSE, CONTRACT_MISMATCH, BUDGET_EXCEEDED, CANCELLED. Internal audit may distinguish forbidden/not-found; public errors do not reveal inaccessible record existence. Never send stack traces, upstream bodies or credentials in errors.

Define `RunBudget` as a request-scoped object exposing `reserveTool()`, `reserveHttpAttempt()`, `remainingMs()`, `withHttpSlot(fn)` and `abort(reason)`. Reserve counters synchronously/atomically before asynchronous work. Counters cannot be reset by retries or child domain operations. Preserve the distinction between a turn state (`running`, `completed`, `partial`, `failed`, `cancelled`, `interrupted`) and an answer content status (`answered`, `partial`, `insufficient_evidence`, `clarification`). A successful clarification is a completed turn.

## 3. Dependency interfaces

- `IdentityProvider.resolve(request): Principal` validates the session, never trusts browser role/tenant headers.
- `AuthorizationService.authorizeDeployment(principal, deploymentId)` and `authorizeCustomer(principal, deploymentId, customerId)` run before work.
- `AuthorizationService.authorizeEntity(context, ref)` uses the configured resource-ownership policy, not the model's claim or a guessed relationship.
- `TmfGateway.read(context, operationKey, validatedArgs)` resolves a pre-registered operation. It cannot accept an arbitrary URL or HTTP method.
- `RelationshipResolver.resolve(context, sourceRef, relation, pageBudget)` returns authorized target references plus coverage and evidence. Resolution plans come from the reviewed deployment profile.
- `KnowledgeSource.search(context, query, relatedRefs)` returns ACL-filtered document chunks and provenance. No unrestricted URL retrieval.
- `EvidenceLedger.record(context, normalizedFacts)` returns stable evidence IDs scoped to this turn.
- `ToolRegistry.forContext(context)` provides only capabilities allowed for that user and deployment.
- `ModelProviderFactory.create(config)` is the only provider-specific module. Start with one configured direct provider; keep the interface ready for another.

Do not introduce a general dependency-injection framework. Use constructors/factory functions and explicit dependencies.

## 4. Turn algorithm

1. Validate authenticated session, same-origin mutation request, body size and text. Resolve deployment and customer from the owned conversation, not request-injected model context.
2. Recheck deployment/customer access and resolve the currently active immutable profile revision. Atomically insert/retrieve the idempotent turn and acquire the conversation lease.
3. Build a request-scoped dependency graph, evidence ledger, AbortController and shared budget. Load the last 12 authorized conversation messages. Prior claims are context only; operational facts must be fetched again for the new turn.
4. Register native tools for declared capabilities, filtered by audience. Supply a system instruction containing scope, tool-use rules, uncertainty rules and no raw secrets. User text and documents remain untrusted content.
5. Run a bounded AI SDK discovery loop. The model chooses tools; wrappers validate, authorize, execute, normalize, project and record evidence. Discard free-form discovery prose; only safe progress reaches the browser. Model requests cannot change scope or profile.
6. Freeze a bounded evidence bundle. If there is no usable evidence for a factual request, return an insufficiency/clarification result rather than synthesizing facts.
7. Perform a separate structured synthesis call with **no executable tools**, using the JSON answer schema. This stage receives sanitized evidence, user question and minimal conversational context. It outputs short claims with evidence IDs and structured cards.
8. Validate schema, evidence membership, audience, target IDs, and factual card values. Dates/status/numeric card fields must equal or explicitly derive from ledger fields. One schema/citation repair call is allowed within the existing deadline; otherwise return a deterministic safe fallback based on tool statuses.
9. In one transaction, confirm the active lease/fencing token, persist final answer and evidence, mark completed/partial, increment conversation revision and release lease. Only then emit the final answer event. If persistence fails, send an error and do not present a final answer as saved.
10. Record safe metrics. On disconnect, cancellation or deadline abort downstream operations, persist terminal state if possible and release the lease. A crashed process is handled by lease expiry, not automatic model replay.

Structured validation proves referenced sources exist, not that every natural-language inference is true. Evaluate semantic grounding separately. Unsupported claims can still occur; the UI must allow evidence inspection and feedback.

## 5. Budget implementation

Use one `RunBudget` object for the entire turn. Count attempted invocations before execution, including failed/denied calls; count every HTTP attempt including retries. Model discovery: 6 steps; tools: 8; HTTP: 16; concurrency: 3; per-attempt timeout: min(8s, remaining deadline). Reserve up to 15 seconds of the 60-second turn for synthesis and persistence; stop discovery at 45 seconds. Synthesis and any repair share the reserved remainder, not extra time. A provider call must receive the shared abort signal.

For GET requests, retry once on connection failure, 429 or transient 502/503/504 if remaining budget allows. Honor a bounded Retry-After; do not wait past the discovery deadline. Do not retry 400/401/403/404 or invalid schemas. Do not cache failures as successful empty results.

Memoize identical authorized reads within one turn using tenant + subject/policy + deployment/profile + operation + canonical args. Do not share customer-response caches across turns initially. A memo hit still counts as a tool invocation but not as an HTTP attempt. Documents may have a shared immutable content cache, with authorization checked per request.

## 6. Answer and evidence

Use [answer.schema.json](contracts/answer.schema.json) as the conceptual browser contract. The server assigns `answerId`, `turnId`, `environment`, and timestamps after synthesis; the model does not control them. The model produces status, claims, gaps, suggested questions and proposed cards. Only cards reconstructed/validated against normalized evidence are returned.

An evidence record contains deployment/profile revision, API/version, operation key, resource type/ID, allowlisted normalized fields, retrievedAt, optional sourceUpdatedAt, optional validity interval, quality (`live`, `fixture`), audience visibility, and a source locator. Locators stay server-side; the browser receives `/api/conversations/{id}/evidence/{evidenceId}` links. No model-supplied URLs are rendered.

Missing fields remain absent; never replace missing status with `active`, missing totals with zero, or unavailable tickets with `[]`. Explicit collection completeness and pagination metadata determine whether “none found” is justified.

## 7. Diagnostics algorithm

`diagnoseService` reads the authorized service, resolves permitted supporting resources, relevant tickets and service orders using configured plans, and optionally retrieves matching documents. Limit to one hop from service for resources and explicitly configured reverse relations for tickets/orders. Resolve at most 5 related records per category and return truncation flags. Share the global budget across fan-out.

Preserve lifecycle state, enabled flag and operational state independently. Present conflicts, for example “inventory lifecycle is active; enabled flag is false.” A cause is established only by explicit diagnostic/ticket/document evidence tied to the same authorized entity; a disabled resource alone supports an observation, not a root cause. Estimates require a named source, source date when available and confidence wording. Passed estimates do not establish restoration.

## 8. Configuration and extensibility

The only dimensions selected by trusted configuration are deployment, API/version, operation mapping, authentication binding, query capability, relationship strategy, extension mapping and document source. The language model cannot edit these. A new implementation should usually require a new profile and contract tests; a new major representation or vendor-specific semantic behavior may require a new adapter. State this limitation clearly rather than promising automatic compatibility with every nonconforming API.

Existing conversations bind to a deployment and target. A profile revision may change between turns after compatibility validation; persist the revision used for each turn. Do not move a conversation to another tenant/deployment/customer. Start a new conversation for changed scope.
