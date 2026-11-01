# Implementation status

Updated: 2026-11-01.

M0 foundation is implemented. Later milestones are planned; design docs describe intended behavior until each milestone lands.

| Milestone | State | Evidence |
| --- | --- | --- |
| M0 Foundation | Complete (local) | `pnpm test` 6/6; `pnpm typecheck`; `pnpm lint`; `pnpm build`; `wrangler deploy --dry-run`; proof pipeline + UI stream tests; client bundle secret scan clean |
| M1 TMF profiles/adapters | Not started | — |
| M2 Identity/persistence | Not started | — |
| M3 Tools/evidence | Not started | — |
| M4 Agent/API | Not started | — |
| M5 UI | Not started | — |
| M6 Evaluation/operations | Not started | — |
| M7 Release polish | Not started | — |

## Resolved dependency matrix

Resolved 2026-11-01 against npm registry + Cloudflare vite-react-template alignment. Exact direct versions are pinned in `package.json` / `pnpm-lock.yaml`.

| Package | Version | Evidence |
| --- | --- | --- |
| Node | 22.23.4 (engines `>=22.12.0`) | local runtime |
| pnpm | 10.18.3 | `packageManager` field |
| TypeScript | 5.9.3 | typecheck passes |
| Hono | 4.13.16 | Worker/Node HTTP |
| @hono/node-server | 2.1.5 | Node adapter |
| Vite | 7.3.7 | CF plugin peer `^6 \|\| ^7 \|\| ^8` |
| @cloudflare/vite-plugin | 1.66.0 | production dual build |
| Wrangler | 4.156.0 | dry-run deploy |
| React / React DOM | 19.2.1 | UI |
| @vitejs/plugin-react | 5.1.1 | client build |
| AI SDK (`ai`) | 7.0.159 | native tools + Output.object + UI stream |
| @ai-sdk/provider | 4.0.35 | LanguageModelV3 types / mocks |
| @ai-sdk/openai | 4.0.106 | provider path (unused in scripted M0) |
| @ai-sdk/react | 4.0.163 | reserved for chat UI |
| Zod | 3.25.76 | env + tool schemas (AI SDK peer) |
| Drizzle ORM / Kit | 0.45.4 / 0.31.11 | schema placeholder + config |
| pg / @types/pg | 8.23.1 / 8.23.1 | Postgres driver |
| Vitest | 3.2.4 | unit + cloudflare entry tests |
| ESLint | 9.39.2 | lint passes |
| Prettier | 3.9.10 | formatter |

Compatibility notes:
- AI SDK 7 accepts Zod `^3.25.76 \|\| ^4.1.8`; M0 pins Zod 3 for ecosystem stability.
- Cloudflare Vite plugin dual-builds Worker + client assets; `wrangler deploy` uses the generated redirected config under `dist/client/telecom_compass/`.
- `workerd` postinstall failed binary validation on this host (macOS 12.6 / missing `libc++.1.dylib`). Wrangler dry-run still succeeded; live `vite`/`workerd` preview is unverified on this machine. Prefer macOS 13.5+ or Linux glibc 2.35+ for Worker runtime preview.

## Supported TMF matrix

Populate during M1 with API ID, major, edition, contract hash, adapter ID, supported operations and executed tests. No supported editions are claimed yet.

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
- 2026-11-01 local: `pnpm test` → 6 passed (env fail-fast, proof pipeline, proof UI stream, client import boundary).
- 2026-11-01 local: `pnpm typecheck` → pass.
- 2026-11-01 local: `pnpm lint` → pass.
- 2026-11-01 local: `pnpm build` → Worker + client assets emitted under `dist/client/`.
- 2026-11-01 local: client asset scan for `MODEL_API_KEY` / `OIDC_CLIENT_SECRET` / `sk-` → no matches.
- 2026-11-01 local: `pnpm test:cloudflare` → Worker `/api/health` via Hono `app.request`.
- 2026-11-01 local: `wrangler deploy --dry-run` → upload plan OK; no remote publish.
- 2026-11-01 local: interactive `workerd` preview / `pnpm dev` against workerd **not verified** on macOS 12.6.

## Clarification incorporated

Telecom API Sandbox is the default configured local-development backend. Application logic remains deployment-independent; automated tests use independent fixture profiles. Profile setup for the sandbox lands in M1.

Native Cloudflare Workers via Hono (ADR 0009) is the primary deployment target. Hyperdrive/external PostgreSQL and authenticated hosted demo mode remain planned. No Cloudflare account deployment has been performed from this repository.
