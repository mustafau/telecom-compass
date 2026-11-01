# Architecture decisions

These decisions define the project baseline. Product decisions are called out in context; other choices are the adopted technical defaults for this repository.

| ID | Decision | Status |
| --- | --- | --- |
| 0001 | [One TypeScript application](0001-single-typescript-application.md) | Superseded by 0009 (shell) |
| 0002 | [Native tools; no MCP](0002-native-tools-no-mcp.md) | Accepted baseline |
| 0003 | [Implementation-independent TMF profiles](0003-configurable-tmf-deployments.md) | Accepted baseline |
| 0004 | [Validate answers before display](0004-evidence-backed-answers.md) | Accepted baseline |
| 0005 | [Read-only, scoped data access](0005-read-only-scoped-access.md) | Accepted baseline |
| 0006 | [PostgreSQL state and bounded synchronous turns](0006-postgres-turn-state.md) | Accepted baseline |
| 0007 | [Optional scoped document retrieval](0007-optional-document-retrieval.md) | Accepted baseline |
| 0008 | [Cloudflare Workers deployment](0008-cloudflare-deployment.md) | Superseded by 0009 |
| 0009 | [Native Cloudflare Workers with Hono](0009-native-cloudflare-hono.md) | Accepted baseline |

Keep accepted decisions after implementation. Add a new sequential ADR for a significant change, mark the old one superseded, and cross-link. Routine implementation corrections belong in current design documentation.
