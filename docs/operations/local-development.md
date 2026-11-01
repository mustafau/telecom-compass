# Local development

Commands that apply today, plus planned scripts for later milestones.

## Current (M0+)

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres   # optional until M2 persistence is used
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dev                        # Vite + Cloudflare plugin when workerd works on the host
# or: pnpm dev:node             # Hono on Node without workerd
pnpm cf:build
pnpm test:cloudflare
pnpm exec wrangler deploy --dry-run   # no publish
```

Local app defaults to http://localhost:3000. `APP_MODE=local`, `AUTH_MODE=local-fixture`, and `MODEL_MODE=scripted` are the safe defaults. `MODEL_MODE=provider` requires server-side provider settings; missing credentials must not silently fall back.

On some hosts (for example older macOS), `workerd` may fail binary validation. Unit tests and `wrangler deploy --dry-run` can still pass; interactive Worker preview needs a supported runtime. See [status.md](../implementation/status.md).

## Default TMF backend (from M1)

Start [telecom-api-sandbox](https://github.com/mustafau/telecom-api-sandbox) separately (default http://localhost:8787). Compass must not modify or embed that server.

```sh
pnpm setup:local   # planned: selects telecom-api-sandbox and prepares its ordinary profile
pnpm db:migrate
pnpm dev
```

`LOCAL_TMF_BASE_URL` is overridable during setup. See [default backend](default-backend.md). If the sandbox is down, show a clear connection error; never silently switch backends.

## Independent fixtures and later test gates

The separate fixture server will default to 127.0.0.1:8789. Planned commands:

```sh
pnpm fixtures:start
pnpm test:contract
pnpm test:integration
pnpm eval:offline
pnpm test:e2e
```

Integration/browser runners should own PostgreSQL and fixture lifecycle so CI needs no manually running sandbox. Store reports under ignored `.artifacts/`. Cloudflare compatibility must be tested under Wrangler/`workerd`, not inferred from Node-only `pnpm dev`. See [Cloudflare deployment](cloudflare.md).
