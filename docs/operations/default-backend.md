# Default TMF backend

Telecom API Sandbox is the **default configured backend for local development and the hosted demonstration**. It is not the foundation of the domain model or a required library. Other TMF deployments use the same profile, adapter and tool interfaces.

## Local defaults

- Selected deployment: `telecom-api-sandbox`.
- Base origin: `http://localhost:8787`, overridable with `LOCAL_TMF_BASE_URL` during setup.
- Data quality: fixture/synthetic, prominently labelled in the UI.
- Local authentication: explicit local test identities with approved synthetic account/resource entitlements.
- Model: explicit scripted mode until a provider key/model is configured; this is independent of backend choice.

Implement `pnpm setup:local` to prepare a normal profile and contract lock for this backend. The checked-in generic profile example is not a ready-made sandbox profile. Use verified supported APIs, effective paths and exact contracts; do not assume the example's filtered queries are supported.

Setup may inspect the sandbox's published catalog/scenario metadata and copy explicitly selected documents as local demo assets. This is a setup-time integration, never an agent tool or a runtime dependency of generic TMF adapters. Runtime tools call declared TMF operations. Scope/ownership test grants live in local/demo policy configuration, not hardcoded application conditionals. If a needed relation cannot be resolved by normal configured operations, display that limitation; do not invent filtering support or silently enumerate records.

The sandbox's historical scenario dates remain source dates and are labelled synthetic. Do not treat them as current production estimates. Its mock mutations remain unusable because Compass is read-only.

## Hosted default

Replace localhost with the actual deployed sandbox HTTPS origin before building/activating the Cloudflare demo profile. No deployed hostname is assumed by this repository. Validate origin, paths, capabilities and document provenance through the normal profile checks. When available, rebuild any sandbox absolute links for its actual origin; Compass still maps references through its trusted profile rather than blindly following them.

## Independent tests

Automated unit/integration/evaluation tests explicitly select the original fixture profiles A/B. They do not depend on sandbox uptime. Vitest and `pnpm eval:offline` set `COMPASS_ENABLE_TEST_FIXTURES=1` and `AUTHORIZATION_CONFIG_FILE=./config/auth/test-personas.yaml`. Interactive `pnpm dev:node` does **not** load those fixtures; it requires the sandbox profile from `pnpm setup:local` and fails startup if that profile is missing. An unavailable sandbox produces an actionable connection error; never silently switch to test fixtures or production data.
