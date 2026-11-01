# Implementation roadmap

Every milestone should leave tests passing and update status.md. Milestone names are delivery slices, not product feature names.

## M0 — Foundation and version proof — done

Package, lockfile, Hono + Vite/React, Wrangler, lint/format, tests, server-only boundaries, Compose PostgreSQL stub, env schema with fail-fast mode checks, and AI SDK proof (native tool + structured output + UI stream).

Acceptance (met): production build compiles; no-key proof works; client bundle has no provider secrets; baseline tests pass; versions recorded in status.md.

## M1 — Deployment profile, transport and normalization

Implement profile schema/loader/revision hashing, contract lock, operation registry, credential bindings, bounded GET transport and adapter registry. Acquire pinned official/approved contracts for the initial supported editions. Build original fixture servers A/B and selected-field normalizers; implement reference/query/via relationship plans. Add profile:check offline and explicitly authorized live-probe modes. Implement local setup that selects `telecom-api-sandbox` at `LOCAL_TMF_BASE_URL` (default http://localhost:8787) and produces a validated ordinary deployment profile. See [default backend](../operations/default-backend.md).

Acceptance: two profiles with different endpoints and version/query representations pass the same normalized behavior tests; unknown/missing optional data stays unknown; unsupported capability disables itself; invalid configured contract hash fails activation; arbitrary URL, mutation, redirect and unsupported filter tests pass. No reliance on sandbox discovery endpoints or fixture IDs in application runtime code. Explicit local setup may consume metadata to produce a normal profile; missing sandbox query capabilities must be disabled rather than invented.

## M2 — Identity, policy and persistence

Implement local fixture identity, OIDC session flow and configured verified-claims authorization adapter. Implement database migrations/repositories, conversation ownership, tenant scoping, idempotency, revision checks, turn lease/cancellation and retention command.

Acceptance: two tenants with identical resource IDs remain isolated; a customer cannot select another account; operators are limited to entitlement scope; stale/duplicate/conflicting turns behave as documented; competing replica/expired-lease tests prove fencing; local auth cannot start against live data. Live OIDC may be unverified without organization details, but the generic implementation and mocked protocol tests must exist.

## M3 — Domain tools and evidence

Implement customer/service/ticket/service-order domain services, diagnostics, audience projection, optional knowledge source and evidence ledger. Register capability-filtered native AI SDK tools using request-scoped context. Enforce shared budgets for nested calls and retries.

Acceptance: direct service facts and configured correlations work in both profiles; missing relationship lookup produces partial evidence; lifecycle/availability are separate; all forbidden fields are removed before model input; document ACL and unknown ID tests pass; empty/incomplete lists cannot imply absence.

## M4 — Agent orchestration and HTTP

Implement provider factory, instructions, discovery loop, evidence freeze, structured synthesis and validation. Add API routes, progress stream, persisted final result and recovery semantics. Implement a scripted model adapter that participates in the actual loop.

Acceptance: a no-key end-to-end turn calls real fixture HTTP endpoints, persists evidence and returns the answer contract; forged citations and tool-result history are rejected; rate/time/call budgets stop work; a disconnected/retried stream never duplicates a completed turn; DB failure prevents a false saved-answer event.

## M5 — Product UI

Implement layout, authorized deployment/customer selection, chat, capability-aware suggestions, status/estimate cards, evidence drawer, feedback, cancellation, refresh/retry and responsive accessibility. Keep fixture indicators permanent in local mode.

Acceptance: Playwright covers operator and customer journeys, both success and partial/failure states; no raw internal tool arguments appear in UI; evidence scope remains enforced after permission changes; keyboard and mobile-width checks pass. No customer launch toggle based only on frontend state.

## M6 — Evaluation and operations

Implement all cases in evals/cases.json and the required adversarial suite. Add offline CI, opt-in live evals/probes, container configuration, health endpoints, structured telemetry, quotas and cleanup command. Add safe Docker deployment instructions and an explicit production-integration checklist.

Acceptance: all deterministic gates pass; application starts with the documented command sequence; model provider and profile are configurable; live-model results are labelled not-run if credentials are absent; production startup refuses unsafe/missing configuration. No cloud resources are provisioned as part of this task.

## M7 — Release polish and optional Forge integration

Keep README and status aligned with reality. Document supported contracts/adapters, capability limitations, run commands, tested versions and missing real-deployment inputs. Prepare Forge catalog/build-profile entries using examples under integrations/forge; do not modify or publish Forge automatically.

Acceptance: a fresh checkout can follow setup without undocumented state; design and code agree; generated artifacts and secrets are ignored; required checks and limitations are recorded. A new TMF profile can be supplied without editing the agent loop.

## Deferred backlog

Additional TMF domains/editions, enterprise document-source integrations, pgvector, long-running durable jobs, MCP, mutation approvals, large-scale analytics, shared conversations, attachment ingestion and multi-agent behavior. Implement only when scope explicitly expands.

## Cloudflare across milestones

M0 established Hono/Wrangler/Vite build and dry-run deploy. M1 adds the default sandbox profile/setup. M2 adds authenticated hosted demo mode without enabling local test login remotely. M6 completes Hyperdrive bindings (caching disabled for coordination), runtime-specific tests, and migration/deploy docs. Node-only success is not enough for Cloudflare claims. See docs/operations/cloudflare.md and ADR 0009. Do not publish a Worker unless explicitly requested.
