# Telecom Compass

An evidence-backed assistant for telecom operators and, after production authorization is integrated, customers. It answers questions about services, orders, and incidents through existing TM Forum APIs.

**Status:** M0–M7 implemented for local/scripted use (profiles, auth fixtures, domain tools, agent turns, chat UI, offline evals, CI). Live OIDC, live TMF production profiles, Hyperdrive Postgres, and Playwright browser e2e are **not** verified. See [implementation status](docs/implementation/status.md).

**License:** [MIT](LICENSE) — Copyright (c) 2026 Telecom Compass contributors.

## Quick start

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres   # optional until you use DATABASE_URL migrations
pnpm setup:local                # writes sandbox deployment profile (required for interactive use)
# start telecom-api-sandbox on http://localhost:8787 in another terminal
pnpm test
pnpm eval:offline
pnpm dev:node                   # recommended if workerd is unavailable
# or: pnpm dev                  # Vite + Cloudflare plugin when workerd works
```

Open http://localhost:3000 — log in with a local persona, start a conversation (defaults to `telecom-api-sandbox` / `customer-001`), ask about `service-001`.

- `MODEL_MODE=scripted` needs no provider key
- Interactive local use always targets [telecom-api-sandbox](https://github.com/mustafau/telecom-api-sandbox) (default `http://localhost:8787`); fixtures are not offered in the UI
- Automated tests enable fixtures via `COMPASS_ENABLE_TEST_FIXTURES=1` + `config/auth/test-personas.yaml` (no sandbox required)
- Never commit real secrets

## Architecture (summary)

- Hono, React (Vite), TypeScript, Vercel AI SDK, native server-side tools, PostgreSQL schema
- Primary deploy target: Cloudflare Workers; same app also runs on Node
- Read-only TMF access via deployment profiles and typed adapters
- Evidence-backed answers: stream progress, then validate structured claims before display
- No MCP, shell, or unrestricted HTTP tools in the assistant

## Documentation

| Document | Purpose |
| --- | --- |
| [Product scope](docs/product-scope.md) | Users, behavior, release boundaries |
| [Architecture](docs/architecture.md) | Components, deployment and dependency rules |
| [ADRs](docs/adr/README.md) | Durable architectural choices |
| [Design](docs/design/low-level-design.md) | Modules, types, orchestration |
| [TMF integration](docs/design/tmf-integration.md) | Profiles, versions, mapping, relationships |
| [Local development](docs/operations/local-development.md) | Dev commands and test setup |
| [Logging](docs/operations/logging.md) | Stdout JSON events for local/prod troubleshooting |
| [OIDC / Cloudflare Access](docs/operations/oidc-cloudflare-access.md) | Solo-operator Sign-in wiring |
| [Production checklist](docs/operations/production-integration-checklist.md) | Launch gates |
| [Status](docs/implementation/status.md) | Implemented vs unverified |
| [Contributing](CONTRIBUTING.md) | How to continue work |
| [AGENTS.md](AGENTS.md) | Conventions for humans and agents |

Optional doc integrity check: `python3 scripts/validate-handoff.py`.
