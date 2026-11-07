# Local development

Commands that apply today, plus planned scripts for later milestones.

## Current

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres   # optional; required for `pnpm db:migrate`
pnpm test
pnpm eval:offline
pnpm typecheck
pnpm lint
pnpm build
pnpm dev:node                   # Hono on Node (recommended if workerd fails)
# or: pnpm dev                  # Vite + Cloudflare plugin when workerd works
pnpm cf:build
pnpm test:cloudflare
pnpm exec wrangler deploy --dry-run   # no publish
```

Local app defaults to http://localhost:3000. `APP_MODE=local`, `AUTH_MODE=local-fixture`, and `MODEL_MODE=scripted` are the safe defaults. `MODEL_MODE=provider` requires server-side provider settings; missing credentials must not silently fall back.

On some hosts (for example older macOS), `workerd` may fail binary validation. Unit tests and `wrangler deploy --dry-run` can still pass; interactive Worker preview needs a supported runtime. See [status.md](../implementation/status.md).

## Default TMF backend (M1+)

Start [telecom-api-sandbox](https://github.com/mustafau/telecom-api-sandbox) separately (default http://localhost:8787). Compass must not modify or embed that server.

```sh
pnpm setup:local                 # writes config/deployments.local.yaml + contracts.lock.local.json
pnpm profile:check --profile telecom-api-sandbox \
  --deployments config/deployments.local.yaml \
  --lock config/contracts.lock.local.json
pnpm db:migrate                  # reads DATABASE_URL from .env.local (Compose default in .env.example)
pnpm dev
```

`LOCAL_TMF_BASE_URL` (or `pnpm setup:local --base <url>`) is overridable during setup. See [default backend](default-backend.md). If the sandbox is down, setup still writes a profile with placeholders and warns; runtime must not silently switch to test fixtures.

## Independent fixtures and later test gates

Checked-in fixture profiles A/B (and degraded C/D) live under `config/fixtures/`. In-process Hono fixtures serve the same business IDs on different paths for unit/integration tests — no sandbox required.

```sh
pnpm profile:check --profile fixture-a
pnpm profile:check --profile fixture-b
pnpm test
# later:
pnpm test:e2e
pnpm eval:offline
```

Integration/browser runners should own PostgreSQL and fixture lifecycle so CI needs no manually running sandbox. Store reports under ignored `.artifacts/`. Cloudflare compatibility must be tested under Wrangler/`workerd`, not inferred from Node-only `pnpm dev`. See [Cloudflare deployment](cloudflare.md).
