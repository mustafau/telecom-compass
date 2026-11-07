# Optional Telecom Forge registration

Compass does not call Forge at runtime. This directory contains a registration proposal for its engineering workflow. Apply through a reviewed change in Forge only when the owner wants that integration.

Add a read-write `telecom-compass` alias to Forge's trusted catalog with the actual owner/repository and a dedicated `compass-node` build profile. Do not reuse the fixture `node-script` profile with a no-op build. Dependency installation should use the committed pnpm lockfile and the trusted runner's supported Node version. Build/test execution runs without production credentials.

Suggested trusted commands:

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm lint`
3. `corepack pnpm typecheck`
4. `corepack pnpm test`
5. `corepack pnpm build`
6. `corepack pnpm test:cloudflare`
7. `corepack pnpm profile:check --profile fixture-a`
8. `corepack pnpm test:integration`
9. `corepack pnpm eval:offline`
10. `corepack pnpm test:e2e`

Integration/e2e jobs need local PostgreSQL and the fixture server. Set their lifecycle in trusted CI; do not let a task supply shell commands or production secrets. Do not run live model evaluations or live TMF probes on ordinary agent PRs.

The adjacent YAML task example matches the inspected Forge task schema. It is an example, not a task created in Forge. A catalog change and a committed task branch are required before dispatch.
