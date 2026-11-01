# 0009 — Native Cloudflare Workers with Hono

Status: accepted for this implementation baseline. Date: 2026-11-01. Supersedes [0001](0001-single-typescript-application.md) (Next.js application shell) and [0008](0008-cloudflare-deployment.md) (OpenNext Workers path).

## Context

The owner wants Compass native to Cloudflare in the same technology family as Telecom API Sandbox (Workers + Hono + Wrangler), while retaining product functionality: React UI, Vercel AI SDK native tools, evidence-backed answers, OIDC, and PostgreSQL conversation/lease state. ADR 0008 chose OpenNext to preserve Next.js; that adapter is no longer required if the application shell may change.

## Decision

Implement Compass as one TypeScript deployment unit on **Cloudflare Workers** using **Hono** for authenticated HTTP, agent streaming and static asset serving, with a **React** UI built by Vite (or equivalent) and consumed through AI SDK UI. Keep **Vercel AI SDK** native tools, domain services, typed TMF adapters and **external PostgreSQL** via **Hyperdrive** (query caching disabled for coordination/auth/conversation data). Prefer Web APIs and workerd-safe libraries; use `nodejs_compat` only where a pinned dependency still requires it.

Retain conventional **Node** hosting by running the same Hono app through Hono’s Node adapter (or equivalent), with a thin runtime adapter for config, secrets, DB connection lifecycle and telemetry. Do not use Next.js, OpenNext or a static Cloudflare Pages export of the full application. Do not replace PostgreSQL with D1 for v1 transactional leases and evidence.

Compass and Telecom API Sandbox remain separate Workers. The deployed sandbox stays an ordinary TMF backend profile for local/demo use.

## Alternatives

- Keep Next.js + OpenNext (ADR 0008): minimizes UI rewrite, adds OpenNext/Node-compat complexity and diverges from the sandbox stack.
- Hono API Worker plus a separate Pages SPA: splits deployables and complicates cookie/OIDC same-origin assumptions.
- D1 or Durable Objects for conversation state: would reopen ADR 0006 and is out of scope for this change.

## Consequences

Supersede the Next.js App Router shell. M0 resolves Hono/Wrangler/Vite/AI SDK/workerd compatibility instead of OpenNext. Domain, policy, evidence and TMF design are unchanged. Dual Workers + Node targeting becomes simpler than OpenNext. Long turns remain bounded by Workers CPU/subrequest limits and the existing 60-second application deadline. New ADRs are required only if PostgreSQL or the one-app boundary changes again.

## Revisit when

A required dependency cannot run in workerd without an unacceptable compatibility layer, or a concrete requirement restores a Next.js-specific capability.
