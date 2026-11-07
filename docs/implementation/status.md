# Implementation status

Updated: 2026-11-06.

M0–M7 local slices are implemented. Live OIDC IdP, live TMF production profiles, Hyperdrive-backed Postgres in Workers, and Playwright browser e2e remain unverified / incomplete relative to full production launch gates.

| Milestone | State | Evidence |
| --- | --- | --- |
| M0 Foundation | Complete (local) | Proof pipeline, health, build, wrangler dry-run |
| M1 TMF profiles/adapters | Complete (local) | Fixture A/B, contract lock, transport, `profile:check`, `setup:local` |
| M2 Identity/persistence | Complete (local) | Local personas, OIDC helpers + mocked tests, memory store with lease/idempotency, SQL migration `0001_m2_core.sql` |
| M3 Tools/evidence | Complete (local) | Domain services, evidence ledger, audience projection, optional Markdown knowledge |
| M4 Agent/API | Complete (local) | Scripted turn runner, conversation/turn/evidence/feedback routes, UI stream parts |
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
| Zod | 3.25.76 | schemas |
| yaml | 2.8.1 | profiles/personas |
| Drizzle / pg | 0.45.4 / 8.23.1 | schema + migrate |
| Vitest | 3.2.4 | unit + integration |

## Supported TMF matrix

See M1 fixture adapters in `config/fixtures/`. Official TM Forum contract redistribution is not claimed; fixture stubs are original Compass documents. Sandbox profile from `setup:local` is get-by-id only until filters are verified.

## Persistence note

Runtime default for local/scripted tests is the **in-memory store** (same semantics: tenant scope, idempotency, leases). PostgreSQL schema/migration is checked in under `migrations/` for Node/Compose; Cloudflare Hyperdrive wiring remains an operations input and is not exercised in offline CI.

## Verification log

- 2026-11-06: `pnpm test` → 38 passed; `pnpm typecheck`; `pnpm lint`
- 2026-11-06: `pnpm eval:offline` (scripted fixture turns + recorded gates)
- Playwright browser e2e: **not run / not packaged**
- Live OIDC / live TMF / Worker+Hyperdrive: **unverified**
- No Cloudflare account deployment performed

## Clarifications

- Local fixture auth cannot start in demo/production and cannot activate live deployments.
- Application code does not call sandbox `/catalog` at runtime.
- Customer launch still requires [production-integration-checklist.md](../operations/production-integration-checklist.md).
