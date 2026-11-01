# Contributing

This repository is an active application codebase with design docs that define intended behavior. M0 (foundation) is complete; continue in milestone order from [docs/implementation/plan.md](docs/implementation/plan.md) and record progress in [docs/implementation/status.md](docs/implementation/status.md).

## Before you change code

1. Read [AGENTS.md](AGENTS.md), [product scope](docs/product-scope.md), [architecture](docs/architecture.md), and the [ADR index](docs/adr/README.md).
2. Read the design doc for the area you are touching under `docs/design/`.
3. Check [status.md](docs/implementation/status.md) for what is already implemented and what remains unverified.

## Local baseline

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Use `MODEL_MODE=scripted` unless you intentionally configure a provider. Do not invent production credentials. Missing identity/contracts/backends stay listed in status.md as deployment inputs.

## Documentation authority

- Accepted ADRs and detailed design contracts define product decisions.
- `docs/implementation/plan.md` defines implementation order.
- When implementation corrects a design detail, update the design doc (or supersede an ADR for major changes).
- Example profiles and evaluation cases are specifications until verified against real contracts/deployments.

[telecom-forge](https://github.com/mustafau/telecom-forge) may automate maintenance of this repo; it is not a runtime dependency and must not receive production data through Compass.
