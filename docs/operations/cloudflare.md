# Cloudflare deployment

Cloudflare Workers is the primary deployment target, alongside a conventional Node host running the same Hono application. Compass and Telecom API Sandbox are separate Workers. Compass uses **Hono** with a React UI served as Worker static assets; the sandbox retains its existing Hono Worker. Do not deploy the full Compass application as a static Cloudflare Pages export, and do not use OpenNext/Next.js.

## Components

| Component | Cloudflare deployment |
| --- | --- |
| UI and server routes | One Hono Compass Worker serving API routes and built React static assets |
| Model calls | Vercel AI SDK using a configured provider over HTTPS |
| TMF backend | Default demo profile points to the deployed sandbox HTTPS origin |
| State | External PostgreSQL through a Hyperdrive binding |
| Secrets | Worker secrets, resolved server-side through a runtime configuration adapter |
| Profiles/initial corpus | Validated immutable data bundled during build |

Hyperdrive is a connection service, not PostgreSQL hosting. Supply an existing or managed PostgreSQL instance. D1 is not a drop-in replacement for the specified PostgreSQL transactions, locks and leases; switching databases needs a separate design decision. This repository does not provision database or model accounts.

## Build and runtime requirements

During M0, pin a mutually supported Hono/Wrangler/Vite/React/AI SDK/Node toolchain and record it. Prefer Web APIs; enable Workers `nodejs_compat` only for pinned dependencies that still require it. Do not assume a full long-running Node process. Add `wrangler.jsonc`, generated binding types, and commands `cf:build`, `cf:preview`, `cf:deploy`, and `test:cloudflare`. Declare actual static-asset and Hyperdrive bindings and a tested compatibility date.

Introduce a small runtime adapter for configuration, secrets, DB connection creation and telemetry. Node uses mounted config files and DATABASE_URL. Workers use validated build-bundled profile/corpus data, Worker bindings and `HYPERDRIVE.connectionString`. Resolve secrets at runtime; never bundle their values. Deployment/profile selection remains unchanged. Local setup can fetch sandbox metadata; chat requests cannot.

Use a compatible pg driver with Hyperdrive and request-scoped connection management; do not share live socket instances between Worker requests. Keep connections needed by the stream alive until turn finalization/cancellation, then release them. Disable Hyperdrive query caching for conversation, authorization, lease and idempotency data so coordination reads are current. Run migrations from a controlled Node/CI process using direct database access, not during Worker requests.

No runtime filesystem persistence, child processes or native modules are permitted in request handlers. Compile contracts/corpus/profile JSON ahead of deployment. Verify OIDC library, provider SDK, database driver and telemetry exporter in workerd; do not rely on Node-only auto-instrumentation. Use Web APIs where possible. No correctness-critical work may depend on an unbounded timer after the response closes. Lease expiry remains recoverable by the next authorized request or a configured maintenance job.

## Hosted demo mode

Add APP_MODE=demo for a hosted synthetic-data deployment. It permits only profiles marked fixture, shows a permanent demo badge, and still requires authenticated users plus per-user conversation ownership and model quotas. Use the existing OIDC path with configured demo entitlements; local-fixture login is restricted to local development and cannot be enabled on the public Worker. This keeps hosted demonstration separate from production data access. Customer persona testing in demo mode uses explicitly configured synthetic entitlements, not the production customer-launch switch.

Set DEFAULT_DEPLOYMENT_ID=telecom-api-sandbox. Supply the real sandbox HTTPS origin in the build/deployment profile; localhost is invalid for a remote demo. Use production APP_MODE only when real identity, authorization and TMF deployment gates are satisfied. A private TMF deployment additionally needs an approved reachable network path; Workers deployment does not automatically provide access to on-prem services.

## Verification and deployment sequence

1. Build the Cloudflare Worker bundle and run it with Wrangler/`workerd` preview.
2. Exercise login, streamed progress, final persistence, source access, cancellation and DB reconnect against test dependencies.
3. Test duplicate requests and competing turn leases in this runtime; prove uncached coordination reads.
4. Measure bundle size, CPU, memory and subrequest usage against the selected Workers plan. The 60-second application deadline is a wall-clock budget, not a claim of 60 seconds of available CPU.
5. Configure PostgreSQL, Hyperdrive, secrets, public origin, OIDC callback and sandbox profile. Execute migrations separately.
6. Deploy only when the owner requests deployment. Run an authenticated remote smoke test and record results.

Do not claim Cloudflare readiness solely because a Node build succeeds. A deployment command/configuration may be implemented and preview-tested without uploading anything. The public demo still consumes model/database resources; no free-tier guarantee is made.

## References

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [AI SDK Hono example](https://ai-sdk.dev/cookbook/api-servers/hono)
- [Hyperdrive and pg](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/)
- [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
