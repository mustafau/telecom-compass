# Implementation roadmap

Every milestone should leave tests passing and update status.md. Milestone names are delivery slices, not product feature names.

## M0 — Foundation and version proof — done

Package, lockfile, Hono + Vite/React, Wrangler, lint/format, tests, server-only boundaries, Compose PostgreSQL stub, env schema with fail-fast mode checks, and AI SDK proof (native tool + structured output + UI stream).

## M1 — Deployment profile, transport and normalization — done

Profile schema/loader/revision hashing, contract lock, operation registry, credential bindings, bounded GET transport and adapter registry. Original fixture servers A/B and selected-field normalizers; reference/query/via relationship plans. `profile:check` offline; `setup:local` for telecom-api-sandbox.

## M2 — Identity, policy and persistence — done (local)

Local fixture identity, OIDC helper + mocked exchange tests, verified-claims mapping helper. Memory store repositories with conversation ownership, tenant scoping, idempotency, revision checks, turn lease/cancellation/recovery. SQL migration checked in; Postgres migrate command available. Live IdP integration remains unverified without org credentials.

## M3 — Domain tools and evidence — done (local)

Customer/service/ticket/order domain services, diagnoseService, audience projection, Markdown knowledge adapter, evidence ledger, budgets.

## M4 — Agent orchestration and HTTP — done (local)

Scripted turn runner with real fixture HTTP + evidence validation. Conversation/turn/cancel/evidence/feedback routes and UI message stream data parts.

## M5 — Product UI — done (local; Playwright deferred)

Layout, local login, deployment/customer selection, chat, capability list, status cards, evidence drawer, fixture banner. Operator/customer journeys covered by HTTP integration tests. **Playwright browser suite not packaged yet.**

## M6 — Evaluation and operations — done (local)

`evals/cases.json` offline runner, GitHub Actions CI, Docker Node notes, health live/ready, retention command, safe telemetry helper, production integration checklist. No cloud resources provisioned.

## M7 — Release polish — done (local)

README/status aligned; Forge example commands updated; limitations recorded. A new TMF profile can be supplied via config without editing the agent loop.

## Deferred backlog

Playwright browser e2e, Hyperdrive runtime verification, live OIDC against a real IdP, official TMF contract acquisition, additional TMF domains/editions, enterprise document-source integrations, pgvector, long-running durable jobs, MCP, mutation approvals, large-scale analytics, shared conversations, attachment ingestion and multi-agent behavior.

## Cloudflare across milestones

Worker scaffold and dry-run exist. Authenticated hosted demo and Hyperdrive-backed Postgres still require organization inputs and are unverified here. Do not publish a Worker unless explicitly requested.
