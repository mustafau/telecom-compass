# 0003 — Implementation-independent TMF profiles

Status: accepted for this implementation baseline. Date: 2026-11-01.

## Context

The owner explicitly requires the application to work with any TMF implementation. Implementations differ in versions, paths, optional relationships, extensions and access policy.

## Decision

Use deployment profiles, pinned contracts, version adapters, explicit queries and relationship plans. No sandbox-specific runtime behavior or application-code dependency. Telecom API Sandbox is the default local-development profile; this configuration default does not change the portability decision.

## Alternatives

Hardcoded sandbox endpoints or a single vendor client simplify a demo but do not satisfy the requirement. Automatic import of every OpenAPI operation would expose excessive and unverified behavior.

## Consequences

Support is capability-based and explicitly tested. New deployments usually add config; unsupported semantics may require an isolated adapter. No promise of zero-configuration support for nonconforming implementations.

## Revisit when

A concrete new requirement invalidates this tradeoff. Record a superseding ADR and link both decisions; do not silently rewrite history.
