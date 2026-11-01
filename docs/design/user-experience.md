# User experience

## Main screen

Use a compact application layout: conversation list, central chat, optional evidence side panel. Top bar shows deployment label, selected customer/account, and a prominent fixture badge in local mode. Customer view displays friendly account/service names; operator view may show authorized IDs. Internal implementation details such as model token counts and TMF adapter names belong in restricted diagnostics, not the normal user flow.

New conversation: choose an authorized deployment; operators select or enter an authorized customer; customers use the verified account mapping. Offer example questions based on capabilities, not unavailable APIs. Changing target starts a new conversation with a visible scope change.

## Answer rendering

Each answer has a short direct response, source markers next to claims, optional service/ticket/order cards, explicit gaps and up to 3 useful follow-up questions. Avoid presenting a missing capability as a system failure. A degraded answer can still display verified service facts with “Ticket information is unavailable for this deployment.”

Cards distinguish lifecycle state from actual availability. Dates show timezone and source freshness. An estimate is labelled “estimated,” and if in the past it is labelled “past estimate; current restoration not confirmed.” Do not derive a countdown if source time or timezone is uncertain. Use the user's display timezone only for rendering; store timestamps as UTC instants.

The evidence drawer shows source type, record label, source update time when known, retrieval time, and allowed excerpt/fields. “Retrieved now” is not “updated now.” Contradictory sources appear separately. No arbitrary upstream URL is clickable without an administrator-approved link template and authorization; initial release uses internal evidence routes only.

## States

| State | UI behavior |
| --- | --- |
| Idle | Composer enabled; capability-aware examples |
| Running | Safe progress labels, elapsed time, cancel button; no unvalidated factual text |
| Complete | Validated answer, sources and feedback |
| Partial | Verified facts plus visibly missing scope/records |
| Clarification | One focused request, such as choosing among authorized services |
| Failed | Plain error with request ID and retry guidance; no invented response |
| Interrupted | Reload saved state; explicit retry after confirming previous turn stopped |
| Unauthorized | Generic unavailable message; never reveal another customer's details |
| Fixture | Persistent environment badge on all answers and sources |

Preserve the user's unsent input on failures. A retry uses a new turn ID only after the previous turn is terminal. Browser refresh loads the persisted state; it does not launch the model again.

## Accessibility and presentation

Keyboard navigation, labelled inputs, visible focus, readable contrast and responsive layout are required. Announce progress through a throttled polite live region, not every token. Do not move focus on every update. Evidence drawer traps focus only when modal and restores it on close. Cancellation and errors are distinguishable without color alone. Test mobile-width layout and reduced-motion preferences.

No attachment upload, command execution, ticket creation button or generic action button in v1. Feedback has helpful/unhelpful with optional reason/comment; it never automatically changes prompts or policies.
