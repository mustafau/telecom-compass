# Production deployment and operations

## Hosting

Supported targets: native Cloudflare Workers with Hono (see [Cloudflare](cloudflare.md)), or the same Hono application in a containerized Node.js host on the organization's existing platform, near its TMF gateways, with external PostgreSQL. Use a non-root user, a supported pinned Node runtime, a reproducible multi-stage build and a read-only filesystem except designated temporary paths. No requirement to host on Vercel.

Terminate TLS at trusted ingress; preserve secure cookie behavior and configure trusted forwarded headers. Disable response buffering for chat streams and set ingress timeout above the application's turn deadline. Replicas coordinate turns and quotas through PostgreSQL. Do not rely on in-memory sessions or sticky routing for correctness.

Liveness reports process health only. Readiness checks database connectivity and active configuration, not a model call on every probe. Validate TMF compatibility through explicit probes and monitor real failures separately. Run schema migrations as a controlled release job before application rollout. Keep old/new schema compatibility during rolling deployment.

## Configuration classes

- Public: application label and authorized deployment labels.
- Server-only configuration: profile registry, model choice, limits, trusted origins and policy mappings.
- Secrets: database credentials, session encryption/signing material if required by the OIDC library, OIDC secret, provider API keys, TMF auth bindings.
- Immutable build/runtime inputs: contract lock, adapter versions, prompt revision and document corpus revision.

A profile change is reviewed and versioned like code. Reload atomically for new turns; in-flight turns use their pinned profile. Production-to-fixture fallback is forbidden. Model/provider changes require evaluation results, not only a successful API call.

## Observability

Emit spans for request, turn, model step, tool, TMF request, knowledge retrieval and DB finalization. Log request/turn IDs, tool name, deployment alias, duration, status and error code. Customer/resource identifiers, prompts, response bodies, tokens and documents are excluded by default. A restricted diagnostic capture mode must be explicit, time-limited, access-controlled and redacted.

Metrics: turn count by outcome, latency histograms, time to first progress, tool/downstream error rates, budget exhaustion, concurrent turns, lease interruptions, token usage, citation-validation failures and feedback rating. Avoid customer/principal IDs as metric labels. A price table, if configured, must be versioned to report estimated model cost.

Alert on repeated upstream auth failures, abnormal authorization denies, failing DB finalization, interrupted lease growth and unexpected profile incompatibility. Establish baseline thresholds after load testing; do not invent achieved SLOs in documentation.

## Release gates

1. Approved profile with exact contract/adapter coverage and successful read-only probes for its intended queries.
2. Verified identity, tenant/account mapping and per-resource authorization; tested revocation behavior.
3. Field projections and knowledge ACLs validated for the intended audience.
4. Deterministic gates pass; selected model evaluation recorded and failures reviewed.
5. Secrets/provider region/data-handling settings approved by the operator.
6. Retention/deletion job, backup access and restore test documented.
7. Ingress streaming behavior, cancellation, concurrent replicas and load budgets tested.
8. Start operator-only with explicit customer access disabled. Enable customer access only after customer-specific isolation and grounding gates pass on that deployment.

## Runbook

Upstream auth error: disable affected capability/profile if persistent; repair secret binding without exposing token values. Missing/changed schema: preserve failure evidence, pin or update adapter under review; do not accept arbitrary new fields silently. Model outage: return an unavailable response with saved turn state, no invented answer. DB outage: reject new turns; never claim final answers saved. Stuck turn: wait for lease expiry/recovery; inspect safe trace; do not replay automatically. Unsafe answer report: preserve authorized evidence, disable affected tool/profile/model if needed, add a regression evaluation and rerun gates.

Rollback application/model/profile revisions together where compatibility requires it. Retain the revision used for each historical turn. Do not reinterpret old evidence with today's profile silently.
