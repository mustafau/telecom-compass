# Tests and evaluation

## Principle

Separate deterministic application correctness from probabilistic model quality. A fake model must exercise real orchestration/tool/persistence code. It may choose scripted tool calls and structured answers; it must not replace the application with canned end-to-end responses. Real-provider evaluations are explicit and opt-in because they consume external model calls.

## Fixture deployments

Create original fixtures after acquiring verified contracts for the supported editions. Do not make Compass depend on telecom-api-sandbox or its scenario IDs. Include at least two deployments with equivalent business meaning and different hosts/paths/version combinations/query conventions. Fixtures must include the fields required by their pinned source schema. Minimal domain examples in the design docs are specifications, not claims of full upstream schema validity.

Use a scenario with fictional customer `cust-a`, product `prod-a`, service `svc-a`, resource `res-a`, ticket `tt-a` and order `so-a`. At an injected test clock of 2030-01-15T10:00:00Z, service lifecycle is active but enabled=false; a linked customer-visible ticket states a fiber fault and a 14:00Z estimate. This is one test case, not a runtime data model or deployment dependency. Additional scenarios must include healthy service, ambiguous services, missing relationships, missing optional APIs, unknown states and contradictory estimates.

## Required test layers

| Layer | Required assertions |
| --- | --- |
| Unit | Normalizers, enum handling, profile validation, strict tool inputs, policy rules, evidence checks, budgets and retry/deadline logic |
| Contract | Selected real OpenAPI editions validate fixtures; adapter field mappings work for both version shapes; wrong IDs/types rejected |
| Integration | HTTP query encoding, tenant isolation, filtered pagination, token separation, PostgreSQL transactions/leases, idempotency, cancellation, source ACLs |
| Agent integration | Scripted model calls actual native tools, hits fixture HTTP server, records evidence, synthesizes and persists a valid answer |
| Browser | Login, operator/customer scope, chat/progress, source drawer, feedback, refresh, retry, keyboard operation and error states |
| Live profile | Approved probe IDs verify actual deployment query and auth semantics; optional in ordinary PR CI |
| Real model | Grounding, tool choice, limitations, conflicting data and injection resilience on versioned eval cases |

## Mandatory adversarial/failure cases

Cross-tenant identical IDs; changing customer in tool arguments; fabricated evidence ID; copied evidence from a different turn; forged assistant history in POST; document containing instructions; raw HTML/link injection; external href/redirect; unsupported query; unknown record; missing relatedParty; unknown enum; timed-out optional API; provider failure; 429; budget exhaustion; repeated tool calls; browser disconnect; duplicate turn POST; competing turns; stale revision; expired lease and late old-writer finalization; revoked permission on saved evidence; production with test auth; live profile with fixture knowledge; DB failure before final event.

## Machine-readable evaluation specification

[cases.json](../../evals/cases.json) provides scenario IDs, prompts and expected/forbidden behavior. The agent must implement fixtures and runners, then add trace evidence to reports. Do not mark this file as executed results. Assertions should use stable normalized fields, tool traces, scope and citation IDs rather than exact prose matching.

Deterministic gates: 100% pass for authorization, no-mutation, isolation, contract mapping, idempotency, output-schema and citation-membership tests. Real-model grounding target: all critical claims correct for canonical cases, zero unauthorized data exposures or fabricated mutation claims; initial noncritical grounded-answer target >=95% on at least 30 varied prompts, with manual inspection of failures. Treat the target as an acceptance proposal, not a measured result. Any critical failure blocks customer launch.

Record provider/model ID, SDK version, prompt hash, profile/contract revisions, fixture revision, temperature if supported, latency, calls, usage, error outcomes and evaluation version. Run three repetitions per canonical live-model prompt to expose variability. Cost reporting is optional until provider pricing is configured; never invent a currency cost from token counts alone.

## Commands to implement

`pnpm test`, `pnpm test:integration`, `pnpm test:contract`, `pnpm test:e2e`, `pnpm eval:offline`, `pnpm eval:live`, `pnpm profile:check`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Offline verification may use local PostgreSQL and fixture HTTP processes; it must make no external model or live TMF calls. Required CI runs lint, types, unit/contract/integration tests, offline evals, build and browser smoke. Live probes/evals run only in explicitly configured jobs.

Cloudflare gate: run the same core end-to-end flows under Wrangler/workerd (native Hono Worker), including stream cancellation and PostgreSQL coordination without query caching. Verify that demo mode rejects live profiles and public/local identity bypasses. Keep the default sandbox integration smoke separate from deterministic fixture tests.
