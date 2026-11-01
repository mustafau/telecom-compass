# Native tool catalog

Tools are registered with Vercel AI SDK inside the Compass backend. They are not HTTP endpoints and are never executed by the browser. Schemas and domain handlers are separate from SDK adapters. There is no MCP.

## Shared rules

Every wrapper: validates strict inputs → checks audience/capability → authorizes targets → reserves budget → executes domain handler → removes forbidden fields → records evidence → returns a bounded ToolResult. Tools receive ExecutionContext through a server closure, not through model arguments. Tenant ID, deployment ID, credential, arbitrary URL, role and audience are never tool input fields.

IDs: opaque strings, length 1–128; reject control characters, path traversal fragments and embedded URL syntax. Do not enforce a UUID format on TMF IDs. Encode valid IDs as single path segments. Optional query text: 1–500 characters. Search limit: 1–5. A supplied entity ID is a target to authorize, not proof of access.

## Initial tools

| Tool | Input | Domain output | Capability requirement |
| --- | --- | --- | --- |
| `getCustomerOverview` | `{}` | Selected customer identity summary and authorized product/service counts only when complete | Customer read; related lists optional |
| `listCustomerServices` | `{}` | Up to 10 services with product associations, lifecycle/enabled states and completeness | Configured customer-to-service plan |
| `getServiceDetails` | `{ serviceId }` | Normalized service facts and authorized reference summaries | Service read + entity authorization |
| `diagnoseService` | `{ serviceId }` | Observations, tickets, orders, resource summaries and explicit gaps | Service read; related capabilities optional |
| `getTroubleTicket` | `{ ticketId }` | Status, description excerpt, severity and available resolution estimate | Ticket read + entity authorization |
| `getServiceOrderProgress` | `{ orderId }` | Aggregate and item state, relevant service references, dates and blockers if stated | Service-order read + entity authorization |
| `searchKnowledge` | `{ query, serviceId?, limit? }` | Scoped document excerpts with retrieval provenance and relevance score | Configured knowledge source |

The selected customer is immutable conversation scope. If no target is selected, customer-specific tools return a clarification outcome; they must not pick an arbitrary customer. An operator chooses from an authorized picker outside the model. Customer self-service binds the target from the verified account mapping.

Unavailable tools are omitted from registration. Diagnostics can return partial output when its optional dependencies are absent. The server also provides a compact capability summary to the model and UI so the assistant can explain limitations without attempting nonexistent tools.

## Audience projections

| Field | Operator | Customer |
| --- | --- | --- |
| Customer display name, subscribed product, public service label | Allowed within authorized scope | Own account only |
| Customer-facing ticket status and estimate | Allowed | Allowed if source visibility permits |
| Internal ticket notes, troubleshooting playbooks | Role-dependent | Omit |
| Resource topology, equipment addresses, diagnostic identifiers | Role-dependent | Omit; allow a reviewed high-level impact summary |
| Credentials, secret characteristics, financial identifiers not needed for answer | Omit | Omit |
| Internal upstream URL and raw TMF response | Restricted diagnostics only | Omit |

Projection precedes model invocation. Hiding an internal field in the UI after the model reads it is insufficient. Derived customer summaries may use only customer-approved observations; do not expose an internal document through paraphrasing.

## Knowledge retrieval

Start with a `KnowledgeSource` interface and a read-only, administrator-provisioned Markdown corpus adapter. Parse frontmatter containing document ID, title, tenant/deployment, audience, permitted customer/entity scope, updatedAt and optional validFrom/validTo. ACL and scope filtering happens before lexical ranking. Use heading-based chunks of at most 800 words, return at most 5, and cap the total evidence budget. No embeddings or vector database are required initially.

Implement another source adapter only when an actual enterprise knowledge service is supplied. Corpus paths are trusted config, not URLs or filenames chosen by the model. Production startup rejects fixture corpora. Knowledge search can be disabled entirely; the API-only assistant remains usable.

For an outage estimate, retain the date of the source and the estimate separately. If sources disagree, return both with a conflict warning unless a configured authority rule establishes precedence. A general support policy is not evidence of a specific customer's incident. Expired documents cannot establish current operational state.

## Native registration example (conceptual)

```ts
function registerTools(ctx: ExecutionContext, services: Services) {
  return {
    getServiceDetails: tool({
      description: 'Read current service facts for the selected authorized customer.',
      inputSchema: ServiceIdInput,
      execute: args => executeAuthorizedTool(ctx, 'getServiceDetails', args,
        () => services.serviceDetails.read(ctx, args.serviceId)),
    }),
  };
}
```

This is a design sketch; compile against the pinned AI SDK version. Do not register a tool merely because it appears in this example: the actual registry checks capabilities first. Global deadlines and auth checks still apply if the model repeats a call, invents an ID, or requests parallel execution.
