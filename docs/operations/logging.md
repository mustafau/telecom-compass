# Logging and troubleshooting

Compass writes **structured JSON lines to process stdout/stderr**. There is no application log file. In production, scrape the Worker/container/platform log drain.

## What is logged

| Event | Fields (safe) |
| --- | --- |
| `app.boot` | app/auth/model mode, store kind, default deployment, profile count, TMF hosts |
| `http.request` | method, route pattern, status, durationMs (skips health probes) |
| `tmf.get` | deploymentId, operationKey, **host**, path **template** (`/service/{id}`), status or errorCode, durationMs |
| `turn.conflict` | deploymentId, conflict code, expected vs server revision |

Ordinary telemetry **omits** customer IDs, resource IDs, prompts, tokens, and upstream response bodies. Full URLs with IDs are not logged; use `host` + `operationKey` + `pathTemplate` to confirm which backend was called.

## Local troubleshooting

1. Run `pnpm dev:node` and watch that terminal.
2. On first API hit after boot you should see `app.boot` with `tmfHosts` (e.g. `telecom-api-sandbox.mustafaulu.workers.dev`).
3. Send a chat turn; look for `tmf.get` lines with the expected `host`.
4. Confirm profile config: `grep baseUrl config/deployments.local.yaml`.

## Production

Ship stdout to your platform logger (Workers Logpush, container logging, etc.). Alert on `tmf.get` with `status>=500` / `errorCode`, repeated `turn.conflict`, and readiness failures. Do not enable verbose request-body logging without a privacy review.
