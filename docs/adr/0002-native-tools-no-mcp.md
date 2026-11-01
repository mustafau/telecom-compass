# 0002 — Native tools; no MCP

Status: accepted for this implementation baseline. Date: 2026-11-01.

## Context

The owner explicitly chose no MCP for now. The same backend is the sole consumer, and native tools already carry descriptions and input schemas.

## Decision

Register native AI SDK tools in the data-agent backend. Tools call domain services and the TMF client directly. No MCP server or client in this release.

## Alternatives

A same-backend MCP endpoint is feasible but adds a protocol boundary that is not currently needed.

## Consequences

Separate operation definitions and handlers from SDK registration, allowing a later adapter without rewriting domain logic.

## Revisit when

A concrete new requirement invalidates this tradeoff. Record a superseding ADR and link both decisions; do not silently rewrite history.
