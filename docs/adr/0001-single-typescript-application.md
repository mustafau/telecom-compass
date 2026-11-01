# 0001 — One TypeScript application

Status: superseded by [0009](0009-native-cloudflare-hono.md) for the application shell (Next.js → Hono + React/Vite). The one-TypeScript-app and external-PostgreSQL intent remain. Date: 2026-11-01.

## Context

The team wants an interactive data assistant accessing existing TMF services. Those services can remain in Java; the API boundary permits TypeScript orchestration.

## Decision

The UI and agent backend are one Next.js/Node.js application using React and Vercel AI SDK. PostgreSQL is external. Hosting is independent of Vercel.

## Alternatives

A separate Java AI service would add a deployment boundary without a current requirement. A standalone frontend plus backend remains a possible later scaling decision.

## Consequences

Keep routes thin, server-only dependencies isolated and domain services framework-independent. Configure stream-aware ingress for self-hosting.

## Revisit when

A concrete new requirement invalidates this tradeoff. Record a superseding ADR and link both decisions; do not silently rewrite history.
