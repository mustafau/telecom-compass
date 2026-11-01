# 0005 — Read-only, scoped data access

Status: accepted for this implementation baseline. Date: 2026-11-01.

## Context

Initial scope is answering questions about production data. The owner has not requested operational mutations.

## Decision

Allow only reviewed GET operations and enforce tenant/customer/entity authorization in application code and downstream services. Keep customer access gated separately from operator rollout.

## Alternatives

General HTTP tools or mutation-capable agents would create unnecessary authority and complicate validation.

## Consequences

Mutation requests receive a capability explanation. Future writes need a new ADR, idempotency design, permissions and explicit confirmation semantics.

## Revisit when

A concrete new requirement invalidates this tradeoff. Record a superseding ADR and link both decisions; do not silently rewrite history.
