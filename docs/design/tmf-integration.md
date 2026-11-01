# TMF deployment integration

## Compatibility contract

Compass targets **any configurable TMF implementation**, not a particular sandbox. TMF standards establish resource shapes; implementations still vary in available APIs, release versions, context paths, filters, extensions, relationships, authorization and operational semantics. These differences are explicit configuration or adapter boundaries.

Do not claim universal zero-configuration compatibility. Display which capabilities are available for the selected deployment. Missing optional APIs disable only their dependent tools/sections. If a requested deployment has no supported read capabilities, reject activation with a precise validation report.

## Deployment profile

Implement a Zod schema matching [the example profile](../../config/deployments.example.yaml). Profiles are reviewed files mounted into the server, validated at startup, immutable within a turn, and identified by a hash/revision. Environment credentials are resolved by secret references; never store secret values in profiles.

Capabilities are derived from validated operations/plans and may be further disabled by the profile; a boolean cannot enable an operation that is absent or untested. Query binding `context.targetCustomerId` is server-owned; a query binding such as `args.serviceId` is accepted only after entity authorization. The generic profile format uses a small allowlisted grammar for binding names, not JavaScript expressions or string evaluation.

Each profile has: ID, label, environment (fixture/live), tenant bindings, API entries, operation mappings, capability declarations, relationship plans, extension mappings, authentication bindings, knowledge-source binding and limits. Each API entry has an explicit base URL including context path, API ID, major, exact contract edition/reference/hash, adapter ID and allowed GET operations. Different APIs may use different hosts and credentials. No assumption of a single gateway.

Generate operation keys such as `service.get`, `service.listByCustomer`, `ticket.get`, `ticket.listByService`. Method is always GET. Route templates are explicit and encode IDs as path segments; a model cannot supply path fragments. Query parameters are declared individually with types and server-owned source bindings. Capability `listByCustomer` is enabled only if the deployment actually supports and tests that query.

TMF query notation is not universal. A vendor might use `relatedParty.id`, another a custom customer key, and another require looking up products first. Do not guess filter semantics from parameter names or substitute an unfiltered collection scan. The administrator configures the operation and its conformance test.

## Version adapters and contracts

Initial feature coverage: TMF629 Customer, TMF637 Product Inventory, TMF638 Service Inventory, TMF639 Resource Inventory, TMF621 Trouble Ticket, TMF641 Service Ordering. Product catalog, billing, alarms and TMF622 product orders are later extensions unless needed by a configured relationship plan.

Implement adapters for the selected verified v4/v5 editions of these APIs where those editions exist and contracts can be acquired lawfully. At bootstrap, record an explicit support matrix: API ID, major, exact edition, adapter, contract SHA-256 and fixture test. Never advertise an edition that has only a generic mock or unexecuted test. The fixture server must include at least one working mixed-major deployment and another profile with different paths/query semantics.

Prefer pinned OpenAPI-generated TypeScript types for selected contracts; runtime validation must check the fields Compass consumes. OpenAPI compilation happens during development/build, never during a user turn. Accept unknown fields in raw TMF responses but discard them unless an approved mapping needs them; expose neither raw responses nor arbitrary vendor extensions to the model. Reject mismatched IDs, malformed references and invalid values for consumed fields.

Keep transport, version parsing and business semantics separate. A version adapter normalizes:

| Data | Normalization requirement |
| --- | --- |
| Entity identity | Preserve ID, type, API/version; no cross-type ID collisions |
| `relatedParty` | Handle direct v4 references and nested v5 references through tested adapters |
| Ticket related entities | Handle direct and nested reference representations; preserve role |
| Product → service | Normalize realizing-service references without assuming availability |
| Service → resource | Normalize supporting resources; do not infer topology from names |
| Service order items | Preserve item and aggregate state; do not infer completion from one item |
| State enums | Retain raw value plus known normalized meaning; unknown values stay `unknown` |
| Timestamps | Parse ISO instants with zones; preserve raw unparseable values only in restricted diagnostics |
| Extensions | Declarative JSON-pointer allowlist with type validators; no evaluated scripts |

If the standard optional relationship is absent, use another **configured** resolver or report RELATIONSHIP_UNAVAILABLE. Never fill gaps using a named scenario, hardcoded record IDs, natural-language ownership, or an unrestricted database query.

## Relationship plans

Implement three explicit plan primitives: `reference` (read declared references from a normalized source), `query` (invoke a declared filtered operation), and `via` (compose a bounded sequence such as customer → products → services). Plans have a cycle check, max depth 3, max page size 50, max pages 2, and global budget enforcement. Profile validation checks that every referenced operation and adapter exists. Defaults can be lowered per profile.

Each result carries a provenance chain and completeness. Empty result means “none found within the supported query and coverage,” not absence across the estate. Missing pagination metadata yields unknown completeness unless the deployment explicitly guarantees complete results within a known bound. If offset pagination can change during reads, do not claim a snapshot-consistent estate view.

Knowledge-document links are supplemental evidence, not resource-ownership authorization. A configured policy provider or trusted relationship resolver verifies ownership independently. Missing ownership evidence denies access.

## HTTP behavior

Construct URLs only from profile base URLs, fixed route templates and schema-validated arguments. Validate configured origins at activation; reject credentials in URLs and unapproved hosts. Disable redirects or validate every redirect against the same origin/operation policy. Do not follow arbitrary response `href` values: parse and map them to a known API/resource, then rebuild the URL from the profile. Cross-host relationships need explicit profile registration.

Send an Accept header and per-API server credential. Use the tenant/user propagation policy chosen by deployment (delegated identity, token exchange or a narrow service identity plus application authorization). A generic browser token must not be forwarded to unrelated APIs. Tokens never enter model context or traces.

Limit response bodies to 1 MiB per request; enforce while reading, not after buffering. Limit model-visible normalized output to 24 KiB per tool and 96 KiB across the evidence bundle. Truncate with explicit completeness warnings and record the omission count. Apply timeouts and retries from the shared budget.

## Activation and compatibility checks

Implement `pnpm profile:check --profile <id>`: validate schema, resolve adapters/secrets, verify contract hashes, compile routes/queries/plans, and report capabilities. Offline mode makes no network calls. `--live --probe-set <file>` runs approved read-only probes against administrator-supplied synthetic/test IDs, checks field mappings, query scoping, authorization behavior and pagination, and writes a redacted compatibility report. Never probe arbitrary customers or enumerate the estate.

Profile activation requires its checked revision. Deployments with changed contract hashes or unresolved adapter IDs fail activation. An upstream omission or unsupported optional capability produces a degraded report; required operations failing contract/auth checks prevent activation. A live deployment with unconfigured authorization cannot activate regardless of schema compatibility.

## Testing independent implementations

Maintain local fixture deployments A and B with identical business meaning but different base paths, mixed majors, optional-field presence and query names. Run the same domain acceptance suite against both. Add C with missing ticket capability and D with unavailable relationship lookup. Correct output must change in coverage rather than crash or hallucinate.

`telecom-api-sandbox` is the default local-development profile, tested by the same mechanisms. Local setup can prepare that profile from reviewed metadata; production and fixture profiles use the same loader. No application module imports its scenario metadata or checks its name. The production application does not depend on `/catalog`, `/scenarios`, or a sandbox-specific discovery route.
