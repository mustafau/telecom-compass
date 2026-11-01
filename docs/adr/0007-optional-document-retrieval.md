# 0007 — Optional scoped document retrieval

Status: accepted for this implementation baseline. Date: 2026-11-01.

## Context

Some explanations need policies/runbooks, but an installation may only expose TMF APIs. A vector database is not a prerequisite for answering data questions.

## Decision

Operational data comes from live TMF reads. Documentation uses an optional ACL-filtered retrieval adapter; the first adapter is a reviewed Markdown corpus with lexical ranking.

## Alternatives

Embedding all production records would introduce stale data and authorization duplication. Mandating a vector store before a corpus exists adds unnecessary infrastructure.

## Consequences

API-only profiles remain useful. Larger corpora can adopt search/embedding services later while retaining the same ACL and evidence contract.

## Revisit when

A concrete new requirement invalidates this tradeoff. Record a superseding ADR and link both decisions; do not silently rewrite history.
