# Implementation status

Updated: 2026-11-06.

M0–M7 local slices are implemented. Live Cloudflare Access OIDC is verified end-to-end for the solo operator (`tiny-moon-dbaa` → callback → session; `oidc.login.success`). `MODEL_MODE=provider` uses Google Gemini (`@ai-sdk/google`) or OpenAI for discovery tools + structured synthesis (scripted path unchanged). Live provider quality, live TMF production profiles, Hyperdrive-backed Postgres in Workers, and Playwright browser e2e remain unverified / incomplete relative to full production launch gates.

| Milestone | State | Evidence |
| --- | --- | --- |
| M0 Foundation | Complete (local) | Proof pipeline, health, build, wrangler dry-run |
| M1 TMF profiles/adapters | Complete (local) | Fixture A/B, contract lock, transport, `profile:check`, `setup:local` |
| M2 Identity/persistence | Complete (local) + live OIDC session verified | Local personas; OIDC discovery/PKCE/JWKS + email entitlements; Access `tiny-moon-dbaa` login → callback → operator session (`oidc.login.success`) |
| M3 Tools/evidence | Complete (local) | Domain services, evidence ledger, audience projection, optional Markdown knowledge |
| M4 Agent/API | Complete (local) + provider path | Scripted turn runner; provider mode: native domain tools + structured synthesis (`MODEL_PROVIDER=google` or `openai`); conversation/turn/evidence/feedback routes, UI stream parts |
| M5 Product UI | Complete (local, API journeys) | React chat UI with login, scope, capabilities, evidence drawer; **Playwright browser suite not added** — operator/customer journeys covered by HTTP integration tests |
| M6 Evaluation/operations | Complete (local) | `pnpm eval:offline`, CI workflow, Docker Node image notes, health live/ready, retention command, safe telemetry helper |
| M7 Release polish | Complete (local) | README/status/plan updated; Forge example commands refreshed; production integration checklist added |

## Resolved dependency matrix

| Package | Version | Evidence |
| --- | --- | --- |
| Node | 22.x (engines `>=22.12.0`) | local/CI |
| pnpm | 10.18.3 | `packageManager` |
| TypeScript | 5.9.3 | typecheck |
| Hono | 4.13.16 | HTTP + fixtures |
| Vite / React | 7.3.7 / 19.2.1 | UI |
| AI SDK (`ai`) | 7.0.159 | tools + UI stream |
| `@ai-sdk/google` | 4.0.111 | Gemini provider (pinned to `@ai-sdk/provider` 4.0.35) |
| `@ai-sdk/openai` | 4.0.106 | optional OpenAI provider |
| Zod | 3.25.76 | schemas |
| yaml | 2.8.1 | profiles/personas |
| Drizzle / pg | 0.45.4 / 8.23.1 | schema + migrate |
| Vitest | 3.2.4 | unit + integration |
| jose | 6.2.15 | OIDC ID token JWKS verify |

## Supported TMF matrix

See M1 fixture adapters in `config/fixtures/`. Official TM Forum contract redistribution is not claimed; fixture stubs are original Compass documents. Sandbox profile from `setup:local` is get-by-id only until filters are verified.

## Persistence note

`createAppContext` selects store by env: **`DATABASE_URL` → PostgresStore (Drizzle/pg)**; otherwise **MemoryStore**. Production refuses to start without `DATABASE_URL`. Memory remains the default for offline CI and scripted local runs (same async port: tenant scope, idempotency, leases). Integration test `tests/integration/db/postgres-store.test.ts` runs when `DATABASE_URL` / `COMPASS_TEST_DATABASE_URL` is set (skipped in offline CI). Cloudflare Hyperdrive wiring remains an operations input and is not exercised offline.

Interactive local personas (`config/auth/local-personas.yaml`) entitle only `telecom-api-sandbox`. In-process fixture deployments load only when `COMPASS_ENABLE_TEST_FIXTURES=1` (Vitest / `eval:offline` + `config/auth/test-personas.yaml`).

## Verification log

- 2026-11-06: Postgres repos wired (`CompassStore`); `pnpm typecheck`; `pnpm test` → 38 passed, 1 skipped (Postgres, Docker unavailable)
- 2026-11-06: `pnpm eval:offline` (scripted fixture turns + recorded gates)
- Playwright browser e2e: **not run / not packaged**
- 2026-11-06: Live OIDC against Cloudflare Access (`tiny-moon-dbaa`): login redirect, discovery, and interactive callback → operator session verified (`oidc.login.success`, `/api/session` 200). Fixed `/api/health` false failure when `AUTH_MODE=oidc` (partial env omit of `OIDC_*`).
- 2026-11-07: Provider turn path wired (`createLanguageModel` + domain AI SDK tools + discovery/synthesis). Requires `MODEL_MODE=provider`, `MODEL_PROVIDER=google|openai`, `MODEL_ID`, `MODEL_API_KEY`. Default local choice: Google `gemini-3.5-flash-lite`. Live model quality not gated yet.
- Live TMF production profiles / Worker+Hyperdrive: **unverified**
- No Cloudflare account deployment performed

## Clarifications

- Local fixture auth cannot start in demo/production and cannot activate live deployments.
- Application code does not call sandbox `/catalog` at runtime.
- Customer launch still requires [production-integration-checklist.md](../operations/production-integration-checklist.md).
