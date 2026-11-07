# Production integration checklist

Use with [production.md](production.md). Do not enable customer access until every required gate is checked for that deployment.

## Required before operator-only launch

- [ ] Deployment profile reviewed; contract lock hashes verified (`pnpm profile:check --live` with approved probe set)
- [ ] Auth mode is OIDC (not local-fixture); issuer/audience/claim mapping verified
- [ ] Local-fixture auth fails startup in demo/production
- [ ] Entitlement mapping covers deployments and customer IDs; revocation tested
- [ ] PostgreSQL migrations applied; Hyperdrive/external DB configured for Workers
- [ ] Secrets provisioned (OIDC, model, TMF, DB); never in the client bundle
- [ ] Deterministic tests + `pnpm eval:offline` pass in CI
- [ ] Retention/cleanup command scheduled and restore path documented
- [ ] Streaming ingress timeouts > turn deadline; buffering disabled
- [ ] Customer access remains disabled (`CUSTOMER_ACCESS_ENABLED=false`)

## Additional before customer launch

- [ ] Customer audience projections reviewed
- [ ] Cross-tenant / cross-account isolation tests pass on the live mapping
- [ ] Grounding evaluation recorded for the selected model
- [ ] Explicit owner approval to set `CUSTOMER_ACCESS_ENABLED=true`
