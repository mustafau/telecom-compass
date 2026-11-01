# 0004 — Validate answers before display

Status: accepted for this implementation baseline. Date: 2026-11-01.

## Context

Operational questions need traceable facts and customer-visible field controls. Unvalidated prose streaming can expose errors before checks execute.

## Decision

Stream safe progress, gather projected evidence, then generate and validate a structured final answer. Persist before emitting final output.

## Alternatives

Immediate token streaming feels faster but does not allow whole-answer citation and field validation before disclosure.

## Consequences

Users see progress while waiting. Validation checks provenance and deterministic fields; semantic grounding still requires evaluations and review.

## Revisit when

A concrete new requirement invalidates this tradeoff. Record a superseding ADR and link both decisions; do not silently rewrite history.
