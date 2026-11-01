# Product scope

Design date: 2026-11-01. Status: accepted product baseline (implementation in progress; see docs/implementation/status.md).

## Purpose

Telecom Compass helps users understand telecom data without knowing TMF API names. Answers identify what is known, where it came from, when it was observed, and what remains unavailable. It is a read-only application.

## Users and release scope

| Persona | Initial behavior | Production requirement |
| --- | --- | --- |
| Operator | Select an authorized customer; inspect service health, tickets and restoration orders | Enterprise identity and explicit customer-access policy |
| Customer | Ask about own subscription and outage, using an explicit local test persona | Verified subject-to-account mapping and customer-safe projection |
| Maintainer | Configure source profiles, model provider and evaluations through reviewed code/config | No natural-language administrative actions |

The implementation must deliver both persona experiences in local fixture mode. Production defaults to operator-only, with customer access disabled until the policy provider and field-projection tests pass. No UI role toggle can change production identity.

## Initial questions

- Why is this customer's connection unavailable?
- Which service and subscription are affected?
- Is there already a trouble ticket? What does it say?
- What is the restoration estimate, and is it current?
- What is the progress of the related service order?
- What does our support guidance say about this situation?
- Follow-up questions such as “What about the ticket?” retain the same authorized customer context.

## Out of scope

Creating tickets, modifying orders, provisioning, network operations, customer communications, payment changes, general-purpose SQL, unrestricted cross-customer analytics, arbitrary internet browsing, attachment uploads, MCP, coding automation, autonomous background work, and self-updating prompts. Product-order APIs can be added later; the initial order tool explicitly means a TMF641 service order.

## Release acceptance

A deployment profile selects available TMF APIs, versions, paths, authentication and supported query operations. Compass must function with any deployment for which these required capabilities are implemented, and degrade explicitly when optional capabilities are missing. It must not assume a shared origin, identical API versions, mandatory optional fields, or universal query support. New vendor-specific mappings are isolated adapters, not changes to orchestration.

Contract-driven normalization preserves the distinction between lifecycle state and operational availability. Estimates remain estimates. Missing data never implies success, restoration, or absence of incidents. Mock servers are test infrastructure only; the application has no knowledge of a named sandbox scenario.

Unknown records, unauthorized targets, missing relationships, stale data, upstream errors and contradictory evidence are first-class outcomes. The user can inspect sources and report an incorrect answer. There is no requirement to produce an answer when evidence is insufficient.

## Initial engineering budgets

These are configurable starting limits, not measured service-level guarantees: 60 seconds per turn, 6 discovery model steps, 8 tool invocations, 16 downstream HTTP attempts including retries, 3 concurrent HTTP requests, 8 seconds per HTTP attempt, 2,000 final-answer output tokens, 8,000 characters per user message, and 12 recent messages in model context. Count final synthesis separately from the 6 discovery steps. See the low-level design for the shared deadline and resource budget.
