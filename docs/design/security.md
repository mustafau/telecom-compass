# Identity, authorization and data boundaries

## Identity modes

Local fixture mode supplies an explicit development login page with a small set of fictional principals. It issues the same server session shape used by production and must bind only to local development/test. Startup fails if local identity is enabled with APP_MODE=production, APP_MODE=demo, or any live deployment. Hosted demo uses OIDC and explicit synthetic entitlements; live profiles are forbidden in demo mode. Do not accept an arbitrary tenant/role header as a development shortcut.

Production uses OIDC authorization-code flow with PKCE through a maintained library (default implementation: openid-client). Validate issuer, audience, signature, nonce and state. Store identity as issuer + subject; a subject alone is not globally unique. Use random opaque session cookies with Secure, HttpOnly, SameSite=Lax and explicit path; store only hashed session tokens server-side. Rotate on login, expire at 8 hours absolute or 30 minutes idle, and invalidate on logout. Store OAuth secrets/tokens separately from model data; request only necessary scopes.

Implement `auth_sessions` in PostgreSQL with token_hash, issuer, subject, tenant binding, minimal verified claims, expires_at, idle_expires_at and policy_checked_at. Do not store ID tokens in conversation records. Mutation routes validate same-origin Origin/Host against a configured public origin, independent of forwarded headers unless a trusted proxy is configured. Reject missing origin on browser mutations except explicitly authenticated maintenance interfaces.

## Authorization provider

Implement a policy interface with two usable adapters: local fixtures, and configured verified-claims mapping. The production mapping selects tenant, allowed deployments, audience, roles and account/customer IDs from **allowlisted claims issued by the configured trusted IdP**. Never allow clients to choose claim names or supply these values. For operators, allow only explicitly granted customer IDs or a configured enterprise entitlement lookup; do not interpret an operator role alone as permission for every customer.

For large installations, implement an entitlement-service adapter at this boundary when its contract is provided. No provider configured means live access denied. Claims are refreshed/revalidated under the session policy; set a maximum policy-cache age of 5 minutes and support immediate session invalidation. Document revocation latency, and reauthorize before retrieving evidence or returning saved history. Missing/ambiguous tenant/account mappings deny access.

Customer identity mapping cannot be inferred from name/email similarity. If multiple verified accounts exist, selection is constrained to that list. TMF relatedParty references can establish resource ownership only under a reviewed mapping; an untrusted document or model statement cannot.

## Enforcement points

1. Conversation creation: principal → deployment → customer scope.
2. Every route: session, conversation ownership and current customer access.
3. Every tool: tool capability, audience, entity ownership and field visibility.
4. Every related entity: authorize before model-visible projection; never assume a linked record shares scope.
5. Retrieval: document ACL before ranking and before inclusion in model context.
6. Final answer: citation belongs to current turn/scope; projected facts match audience.
7. Source drawer: recheck current permissions; never reveal raw upstream documents by bypassing projection.

API credentials are per-deployment/per-API secret bindings. Application auth does not replace downstream authorization where the service supports it. For a broad service credential, the application must have a reliable entitlement/ownership check; otherwise customer-facing access is disabled.

Some deployments cannot establish ownership before reading a record. Implement a two-stage check: authorize a bounded lookup within an already authorized deployment, read only the fields needed for ownership, and validate resource membership before projection, evidence persistence or model disclosure. Permit this lookup only when the configured policy explicitly allows it. Alternatively, use a trusted scoped membership query before detail retrieval. Missing ownership evidence denies access; a successful HTTP response by itself is never an authorization decision. Do not store unauthorized payloads in ordinary diagnostic logs.

## Network and tool boundaries

Only administrator-defined GET routes are executable. No shell, code execution, generic HTTP fetch, mutation tool, arbitrary SQL or unrestricted browser. Protect against SSRF by validating profile origins, resolving DNS/network policy at deployment, rejecting unregistered response links and disabling unchecked redirects. Private TMF hosts are legitimate when explicitly configured; do not implement a blanket private-IP ban that breaks on-prem deployments. Use an allowlist and infrastructure egress controls instead.

Model tool arguments never select a URL, credential, tenant or query parameter name. Production routes cannot be overridden by chat content. Test tokens must not work against live profiles.

## Untrusted content

User messages, TMF descriptions and retrieved documents are data, including text that asks the assistant to ignore rules or reveal secrets. The system instruction labels these sources untrusted. Enforce permissions and tool restrictions in code even if prompt injection succeeds. No automatic tool installation or runtime contract fetching.

Sanitize rendered Markdown; disable raw HTML, external images and model-authored links. Source links are generated from evidence IDs. Structured cards are assembled from allowed normalized fields, not arbitrary HTML from model output. Do not log hidden model reasoning or expose it as progress.

## Privacy and operational controls

Redact credentials and unnecessary personal fields before calling the model. Configure an approved provider/region/data-handling policy before live traffic. These settings are organization-specific deployment inputs, not assumed properties of any vendor. Model keys and TMF tokens remain server-side.

Default limits: one active turn per conversation, two active turns per principal, tenant concurrent limit 10 and per-principal rate 20 new turns per 10 minutes. Enforce atomically in PostgreSQL for multiple replicas, not only in process memory. Idempotent replay does not consume another model quota. Avoid high-cardinality customer IDs as metric labels. Security tests must include two tenants with colliding resource IDs and cross-conversation evidence attempts.
