# 0008 — Cloudflare Workers deployment support

Status: superseded by [0009](0009-native-cloudflare-hono.md). Date: 2026-11-01. OpenNext is no longer the Workers path; Hyperdrive + external PostgreSQL and separate sandbox Worker remain valid.

## Context

The owner wants to deploy Compass on Cloudflare, as with Telecom API Sandbox. Compass is a stateful Next.js application, while the existing sandbox is a stateless Hono Worker. The same deployment configuration cannot simply be copied.

## Decision

Support a separate Compass Worker through the OpenNext Cloudflare adapter. Retain Next.js native tools and the PostgreSQL data model. Use Hyperdrive to connect to externally hosted PostgreSQL, with query caching disabled for coordination/auth/conversation data. Keep Node container deployment available. Configure the deployed sandbox as the default backend for the hosted synthetic demonstration; retain arbitrary supported TMF profiles for real installations.

## Consequences

Add build/preview/deploy configuration and workerd integration tests. Use thin platform adapters for configuration, database connection lifecycle and telemetry. No runtime filesystem persistence or process spawning. Hosted demo uses authenticated identity and synthetic entitlements; local test login does not become a public authentication mechanism. PostgreSQL and model access remain external resources.

This extends ADR 0001's hosting choice without changing its one-application boundary, and refines ADR 0006's connection management without changing its transactional state model. See [Cloudflare operations](../operations/cloudflare.md).
