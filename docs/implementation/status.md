# Implementation status

Updated: 2026-11-06.

M0 foundation and M1 TMF profiles/adapters are implemented locally. Later milestones are planned; design docs describe intended behavior until each milestone lands.

| Milestone | State | Evidence |
| --- | --- | --- |
| M0 Foundation | Complete (local) | `pnpm test` includes env/proof/UI stream/client boundary; typecheck; lint; build; wrangler dry-run |
| M1 TMF profiles/adapters | Complete (local) | Profile schema/loader/revision; contract lock; GET transport; adapters; fixture A/B (+C/D); relationship plans; `pnpm profile:check`; `pnpm setup:local`; tests 24/24 |
| M2 Identity/persistence | Not started | — |
| M3 Tools/evidence | Not started | — |
| M4 Agent/API | Not started | — |
| M5 UI | Not started | — |
| M6 Evaluation/operations | Not started | — |
| M7 Release polish | Not started | — |

## Resolved dependency matrix

Resolved 2026-11-01 against npm registry + Cloudflare vite-react-template alignment; M1 added `yaml@2.8.1`. Exact direct versions are pinned in `package.json` / `pnpm-lock.yaml`.

| Package | Version | Evidence |
| --- | --- | --- |
| Node | 22.23.4 (engines `>=22.12.0`) | local runtime |
| pnpm | 10.18.3 | `packageManager` field |
| TypeScript | 5.9.3 | typecheck passes |
| Hono | 4.13.16 | Worker/Node HTTP + fixture servers |
| @hono/node-server | 2.1.5 | Node adapter |
| Vite | 7.3.7 | CF plugin peer `^6 \|\| ^7 \|\| ^8` |
| @cloudflare/vite-plugin | 1.66.0 | production dual build |
| Wrangler | 4.156.0 | dry-run deploy |
| React / React DOM | 19.2.1 | UI |
| @vitejs/plugin-react | 5.1.1 | client build |
| AI SDK (`ai`) | 7.0.159 | native tools + Output.object + UI stream |
| @ai-sdk/provider | 4.0.35 | LanguageModelV3 types / mocks |
| @ai-sdk/openai | 4.0.106 | provider path (unused in scripted mode) |
| @ai-sdk/react | 4.0.163 | reserved for chat UI |
| Zod | 3.25.76 | env + profile + tool schemas |
| yaml | 2.8.1 | deployment profile loader |
| Drizzle ORM / Kit | 0.45.4 / 0.31.11 | schema placeholder + config |
| pg / @types/pg | 8.23.1 / 8.23.1 | Postgres driver |
| Vitest | 3.2.4 | unit + integration + cloudflare entry tests |
| ESLint | 9.39.2 | lint passes |
| Prettier | 3.9.10 | formatter |

Compatibility notes:
- AI SDK 7 accepts Zod `^3.25.76 \|\| ^4.1.8`; pins Zod 3 for ecosystem stability.
- Cloudflare Vite plugin dual-builds Worker + client assets; `wrangler deploy` uses the generated redirected config under `dist/client/telecom_compass/`.
- `workerd` postinstall failed binary validation on this host (macOS 12.6 / missing `libc++.1.dylib`). Wrangler dry-run still succeeded; live `vite`/`workerd` preview is unverified on this machine. Prefer macOS 13.5+ or Linux glibc 2.35+ for Worker runtime preview.

## Supported TMF matrix

Fixture-backed adapters (consumed fields only). Contract stubs are **original Compass fixtures**, not TM Forum official OpenAPI redistributions. Official/approved live editions remain to be acquired per deployment.

| API | Major | Adapter | Contract ref | Operations tested | Notes |
| --- | --- | --- | --- | --- | --- |
| TMF629 | v4 / v5 | `tmf629-v4` / `tmf629-v5` | `fixture-tmf629-v*-compass` | `customer.get` | relatedParty direct + nested |
| TMF637 | v4 / v5 | `tmf637-v4` / `tmf637-v5` | `fixture-tmf637-v*-compass` | `product.get`, `product.listByCustomer` | realizingService(s) |
| TMF638 | v5 | `tmf638-v5` | `fixture-tmf638-v5-compass` | `service.get` | No v4 adapter (edition not claimed) |
| TMF639 | v4 / v5 | `tmf639-v4` / `tmf639-v5` | `fixture-tmf639-v*-compass` | `resource.get` | |
| TMF621 | v4 / v5 | `tmf621-v4` / `tmf621-v5` | `fixture-tmf621-v*-compass` | `ticket.get`, `ticket.listByService` | relatedEntity direct + nested |
| TMF641 | v4 / v5 | `tmf641-v4` / `tmf641-v5` | `fixture-tmf641-v*-compass` | `order.get` | |

Sandbox local profile (`pnpm setup:local`) registers get-by-id operations only; filtered relationship capabilities stay disabled until verified against that backend.

## Required deployment inputs

- Deployment/API base URLs and approved exact contracts/versions.
- Authentication bindings and secret provisioning method for each API.
- Proven filtering/pagination behavior and relationship mappings.
- OIDC issuer/client configuration and verified tenant/account/entitlement mapping.
- Approved model provider/model/region and data-handling configuration.
- Optional knowledge-source ACLs and enterprise document retrieval interface.
- Hosting ingress, secret management, database, retention, telemetry and rollout owner.
- Hyperdrive id + externally hosted PostgreSQL for Cloudflare demo/production.

## Verification log

- 2026-11-01 local: `pnpm install` with onlyBuiltDependencies `[esbuild, workerd, sharp, unrs-resolver]`.
- 2026-11-01 local: M0 tests, typecheck, lint, build, client secret scan, cloudflare health, wrangler dry-run.
- 2026-11-06 local: M1 — `pnpm test` → 24 passed (profile/transport/normalize/fixtures A/B/profile-check + M0).
- 2026-11-06 local: `pnpm typecheck` → pass; `pnpm lint` → pass.
- 2026-11-06 local: `pnpm profile:check --profile fixture-a` / `fixture-b` offline → ok.
- 2026-11-06 local: interactive `workerd` preview **not verified** on macOS 12.6.
- 2026-11-06 local: live sandbox `setup:local` against a running backend **optional**; script writes profile with placeholders when unreachable.

## Clarification incorporated

Telecom API Sandbox is the default configured local-development backend. Application logic remains deployment-independent; automated tests use independent fixture profiles under `config/fixtures/`. `pnpm setup:local` is setup-time only and never becomes a runtime `/catalog` dependency.

Native Cloudflare Workers via Hono (ADR 0009) is the primary deployment target. Hyperdrive/external PostgreSQL and authenticated hosted demo mode remain planned. No Cloudflare account deployment has been performed from this repository.
