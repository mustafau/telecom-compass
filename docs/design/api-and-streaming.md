# HTTP API and streaming contract

All application routes are same-origin. JSON errors use `{ error: { code, message, requestId } }`. Authenticate before returning protected metadata. Use 404 for inaccessible conversation/evidence identifiers. Use 401 for absent/invalid sessions, 400 for malformed input, 409 for version/concurrency conflicts, 413 for excess body size, 429 for quota limits and 503 for unavailable dependencies. Avoid customer details in error strings.

## Routes

| Route | Request | Success response |
| --- | --- | --- |
| `GET /api/auth/login` | Initiate OIDC; allowlisted relative return path | Redirect with state/nonce/PKCE |
| `GET /api/auth/callback` | OIDC code/state validated by library | Establish opaque server session; redirect |
| `POST /api/auth/logout` | Same-origin session request | Revoke session, clear cookie; 204 |
| `GET /api/session` | Session cookie | Safe principal display, audience and accessible deployment labels |
| `GET /api/deployments/{id}/capabilities` | Authorized deployment | Capability names, coverage and safe limitations; no secrets/URLs |
| `GET /api/deployments/{id}/customers?q=...&cursor=...` | Operator only; min 3-character search or configured recent list | Authorized IDs/display names, opaque cursor; max 20 |
| `POST /api/conversations` | `{ deploymentId, targetCustomerId? }` | 201 `{ id, revision: 0, scope }` |
| `GET /api/conversations?cursor=...` | Owned conversations | Max 20 summaries, next cursor |
| `GET /api/conversations/{id}` | Owned conversation | Scope, revision, persisted messages, last turn status |
| `POST /api/conversations/{id}/turns` | `{ clientTurnId, expectedRevision, text }` | AI SDK UI message stream, or conflict/error JSON before stream opens |
| `GET /api/conversations/{id}/turns/{turnId}` | Owned turn | Pending/completed/partial/failed/cancelled/interrupted state and saved answer |
| `POST /api/conversations/{id}/turns/{turnId}/cancel` | Empty JSON | 202; idempotently requests cancellation |
| `GET /api/conversations/{id}/evidence/{evidenceId}` | Reauthorize current user and entity | Sanitized evidence record; expired/redacted source notice if unavailable |
| `POST /api/conversations/{id}/feedback` | `{ turnId, rating: 'helpful'|'unhelpful', reason?, comment? }` | 201; one current feedback record per user/turn |
| `DELETE /api/conversations/{id}` | Owned conversation; no active turn | 204 after deletion policy; 409 if active |
| `GET /api/health/live` | Public minimal response | 200 process liveness only |
| `GET /api/health/ready` | Restricted operational endpoint | 200 database/config ready; 503 otherwise; no secret details |

The customer picker requires an identity/customer directory adapter or a proven scoped TMF query. If unavailable, operators may enter an exact customer ID, which is still authorized before conversation creation. No unrestricted collection search fallback.

Customer-mode conversation creation ignores/rejects arbitrary targetCustomerId and uses the verified principal-account mapping. If an identity owns multiple accounts, present an authorized account chooser. A deployment or customer change always creates a new conversation.

## Idempotency and concurrency

`clientTurnId` is a client-created UUID, unique within a conversation. Hash normalized text plus expectedRevision as the request fingerprint. In a transaction, first look for an existing idempotency key: same fingerprint replays its saved result or returns its pending state; a different fingerprint returns 409 IDEMPOTENCY_CONFLICT. Do this before the revision check so a completed retry remains replayable.

For a new key, lock the conversation row, compare expectedRevision, and reject another active turn with 409 TURN_IN_PROGRESS. Persist the user message and increment revision when accepting a turn; return the resulting revision in the start event. Terminal finalization increments again. Failures retain the user message and the terminal status. Clients must use the latest server revision for the next turn.

Use a 20-second database lease with heartbeat every 5 seconds and a fencing token. Only the lease holder can write output/finalize. An expired lease changes running work to interrupted through an atomic recovery operation. Do not continue old model output after a new owner takes over. Another replica can observe cancellation via the database flag checked by the heartbeat and before each tool call. Explicit cancel signals the local AbortController immediately when on the same process; elsewhere detection is bounded by heartbeat interval.

## UI stream

Use the pinned AI SDK UI message-stream helpers and `useChat` with a custom transport/request builder. The browser sends only its new user text and idempotency/revision fields; it never supplies trusted assistant history, tool results or system messages. Ignore/reject such extra input through strict schemas.

Within the SDK's documented wire format, use typed data parts:

| Part | Payload |
| --- | --- |
| `data-turn` | `{ turnId, conversationRevision, status: 'running' }` |
| `data-progress` | `{ sequence, stage, label }`; safe labels such as “Checking service details” |
| `data-answer` | Validated Answer envelope from the answer schema |
| `data-turn-error` | `{ turnId, code, message, retryable, conversationRevision? }` |

Use standard SDK message IDs and completion markers. Do not hand-code an incompatible SSE protocol or expose hidden reasoning/tool arguments. Progress is ephemeral; the final answer is persisted before delivery. No unvalidated factual tokens are streamed. The UI shows progress quickly and renders the complete validated answer when available.

If the connection fails after commit but before the answer arrives, GET turn retrieves the saved answer. If it fails before commit, the turn is cancelled/interrupted according to lease state; the UI offers an explicit retry with a new clientTurnId after terminal confirmation. There is no durable stream-resume subsystem in v1. Repeating the same key must not execute model/tool work again.

## Input and output limits

Max request body 16 KiB, text 8,000 characters, comment 2,000 characters. Escape/sanitize Markdown, disable raw HTML and external images, and allow only server-created evidence links. Responses carrying conversation data use `Cache-Control: private, no-store`. Do not allow shared HTTP caching for authenticated TMF reads or conversation routes. Configure proxy buffering off and timeouts above the 60-second application turn deadline.
