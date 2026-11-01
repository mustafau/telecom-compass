# Contributor conventions

Guidance for humans and coding agents working in this repository. Read README.md, docs/product-scope.md, docs/architecture.md, and docs/adr/README.md before large changes. Before changing a module, read its design doc and acceptance criteria in `docs/design/` and `docs/implementation/plan.md`.

## Fixed decisions

1. Use TypeScript, Hono, React (Vite), Vercel AI SDK native tools, and PostgreSQL. Deploy natively on Cloudflare Workers (same family as telecom-api-sandbox); also support Node via the same Hono app. No Next.js/OpenNext. No MCP in this release. No Pi or other coding runtime inside Compass.
2. Tools call application services, which call typed TMF adapters. Browser code never holds provider or TMF credentials. Only explicitly registered GET operations may reach TMF APIs.
3. Support independent TMF deployment profiles. Keep local fixture and live profiles distinct. Never silently fall back from live data to fixtures. Fixture success is not proof of deployment compatibility.
4. Bind principal, tenant, audience, target customer and environment server-side. Enforce policy per request and per resource/tool. Prompts do not grant authority.
5. Source-backed claims must reference server-issued evidence from the current turn. Render a validated structured answer, with progress streaming before it. Do not stream unvalidated factual prose to customers.
6. Do not infer missing TMF relationships, fake endpoints, fabricate restoration times, or assume every API has both v4 and v5.
7. Configure telecom-api-sandbox as the default local-development backend through an ordinary deployment profile. Default base URL: http://localhost:8787, overridable. Keep the application portable to any supported TMF deployment, with no sandbox-specific runtime branches. Use independent fixtures for deterministic automated tests; never silently fall back to them if the default backend is down.

## Working method

- Follow milestones in docs/implementation/plan.md. Record evidence and limitations in docs/implementation/status.md.
- Pin exact direct dependency versions; keep `pnpm-lock.yaml` committed; update the version matrix in status.md when the stack changes.
- Use pnpm. Do not modify Forge, the sandbox, or other repositories as a side effect of Compass work.
- Prefer narrow, complete vertical slices. Unconfigured production integrations stay explicit deny adapters.
- Write real tests for authorization, relationship normalization, evidence validation, failure handling, persistence, streaming, and end-to-end flows. Do not test stubs against their own hardcoding.
- Do not add unnecessary frameworks, Redis, vector databases, workflow engines, multi-agent orchestration, or generalized plugin systems.
- Keep server-only import boundaries. Test/local shortcuts must fail startup in production.
- Keep identifiers and customer content out of ordinary telemetry. Do not commit secrets, generated model output, `.env.local`, `node_modules`, or local databases.
- Preserve docs. Add a superseding ADR for significant architecture changes; update design docs for routine corrections.
- Do not publish cloud resources, deploy Workers, or send customer messages unless the repository owner explicitly requests it.

## Done means

The local application runs against configurable TMF fixtures with operator and customer test personas; the scripted (no-key) model exercises the real tool pipeline; a configured provider uses the same pipeline; required test gates pass; README and status distinguish implemented, simulated, and unverified behavior. Live production/customer launch requires the gates in docs/operations/production.md.

## Deployment

Support native Cloudflare Workers through Hono (docs/operations/cloudflare.md) plus Node hosting of the same app. Test the Worker runtime where the host supports `workerd`. Keep the default sandbox profile configurable. Do not assume runtime filesystem access or global database sockets.
