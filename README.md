# Telecom Compass

An evidence-backed assistant for telecom operators and, after production authorization is integrated, customers. It answers questions about services, orders, and incidents through existing TM Forum APIs.

**Status:** M0 foundation is implemented (Hono + React/Vite Worker scaffold, env validation, scripted AI SDK proof, tests, Cloudflare dry-run build). Product features — TMF profiles, auth, persistence, and chat UI — continue from M1. See [implementation status](docs/implementation/status.md).

**License:** [MIT](LICENSE) — Copyright (c) 2026 Telecom Compass contributors.

## Quick start

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres
pnpm test
pnpm dev
```

- App defaults to http://localhost:3000
- `MODEL_MODE=scripted` needs no provider key
- Default TMF backend for later milestones: [telecom-api-sandbox](https://github.com/mustafau/telecom-api-sandbox) at `http://localhost:8787` (not required for M0 tests)
- Never commit real secrets; use `.env.local`, Worker secrets, or `config/secrets/` (gitignored)

## Architecture (summary)

- Hono, React (Vite), TypeScript, Vercel AI SDK, native server-side tools, PostgreSQL
- Primary deploy target: Cloudflare Workers (same family as telecom-api-sandbox); same app also runs on Node
- Read-only TMF access via deployment profiles and typed adapters — not sandbox-specific runtime logic
- Evidence-backed answers: stream progress, then validate structured claims before display
- No MCP, shell, or unrestricted HTTP tools in the assistant

## Documentation

| Document | Purpose |
| --- | --- |
| [Product scope](docs/product-scope.md) | Users, behavior, release boundaries |
| [Architecture](docs/architecture.md) | Components, deployment and dependency rules |
| [ADRs](docs/adr/README.md) | Durable architectural choices |
| [Design](docs/design/low-level-design.md) | Modules, types, orchestration (current intended behavior) |
| [TMF integration](docs/design/tmf-integration.md) | Profiles, versions, mapping, relationships |
| [API and streaming](docs/design/api-and-streaming.md) | HTTP contract and browser protocol |
| [Security](docs/design/security.md) | Identity, isolation, data and network boundaries |
| [Local development](docs/operations/local-development.md) | Dev commands and test setup |
| [Cloudflare](docs/operations/cloudflare.md) | Worker deploy, Hyperdrive, runtime checks |
| [Production](docs/operations/production.md) | Hosting, telemetry, launch gates |
| [Roadmap](docs/implementation/plan.md) | Milestone plan |
| [Status](docs/implementation/status.md) | What is implemented vs planned |
| [Contributing](CONTRIBUTING.md) | How to continue work in this repo |
| [AGENTS.md](AGENTS.md) | Conventions for human and automated contributors |
| [References](docs/references.md) | Related repos and upstream docs |

Design docs describe **intended** behavior. Update them when implementation corrects or supersedes a detail. ADRs keep decision history. Do not mark a planned feature as done in README or status without evidence.

Optional doc integrity check: `python3 scripts/validate-handoff.py`.
