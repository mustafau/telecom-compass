# 0006 — PostgreSQL state and bounded synchronous turns

Status: accepted for this implementation baseline. Date: 2026-11-01.

## Context

Multiple application replicas and retries require coordination. Initial questions are bounded synchronous reads.

## Decision

Store conversations, evidence, leases and idempotency in PostgreSQL. Abort on disconnect and recover interrupted turns explicitly; no durable workflow engine in v1.

## Alternatives

In-memory state breaks across replicas/restarts. Temporal or resumable stream infrastructure is unnecessary for the current time-bounded request flow.

## Consequences

Use leases with fencing and no hidden replay. Live long-running investigations would require a later architecture decision.

## Revisit when

A concrete new requirement invalidates this tradeoff. Record a superseding ADR and link both decisions; do not silently rewrite history.
