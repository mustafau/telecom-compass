import "../guard";
import { Hono } from "hono";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import type { AppContext } from "../app-context";
import { personaToPrincipal } from "../auth/local-personas";
import {
  assertSameOrigin,
  clearSessionCookieHeader,
  issueSession,
  readSession,
  sessionCookieHeader,
  SESSION_COOKIE,
} from "../auth/session";
import { hashRequest } from "../db/memory-store";
import { runTurn } from "../agent/turn-runner";
import { assertAuthorized } from "../policy/fixture-authz";
import { beginOidcLogin, exchangeAuthorizationCode, mapVerifiedClaimsToPrincipal } from "../auth/oidc/client";

const createConversationSchema = z.object({
  deploymentId: z.string().min(1),
  targetCustomerId: z.string().min(1).optional(),
});

const createTurnSchema = z.object({
  clientTurnId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  text: z.string().min(1).max(8000),
});

export function mountApiRoutes(app: Hono, ctx: AppContext): void {
  app.get("/api/health/live", (c) => c.json({ ok: true }));

  app.get("/api/health/ready", (c) => {
    try {
      // Memory store is always ready; Postgres readiness hooks in later when wired.
      if (!ctx.env) return c.json({ ok: false }, 503);
      return c.json({ ok: true, authMode: ctx.env.AUTH_MODE, modelMode: ctx.env.MODEL_MODE });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  app.get("/api/auth/local/personas", (c) => {
    if (ctx.env.AUTH_MODE !== "local-fixture" || !ctx.personas) {
      return c.json({ error: { code: "NOT_AVAILABLE", message: "Local personas disabled" } }, 404);
    }
    return c.json({
      personas: ctx.personas.personas.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        audience: p.audience,
        tenantId: p.tenantId,
      })),
    });
  });

  app.post("/api/auth/local/login", async (c) => {
    if (ctx.env.AUTH_MODE !== "local-fixture" || !ctx.personas) {
      return c.json({ error: { code: "NOT_AVAILABLE", message: "Local login disabled" } }, 404);
    }
    try {
      assertSameOrigin(c.req.raw, ctx.env.APP_ORIGIN);
    } catch (error) {
      return originError(c, error);
    }
    const body = (await c.req.json()) as { personaId?: string };
    if (!body.personaId) {
      return c.json({ error: { code: "INVALID_ARGUMENT", message: "personaId required" } }, 400);
    }
    try {
      const principal = personaToPrincipal(ctx.personas, body.personaId);
      const { token } = issueSession(ctx.store, principal);
      c.header("Set-Cookie", sessionCookieHeader(token, ctx.env));
      return c.json({
        subject: principal.subject,
        audience: principal.audience,
        displayName: principal.displayName,
        tenantId: principal.tenantId,
      });
    } catch (error) {
      return c.json(
        { error: { code: "INVALID_ARGUMENT", message: error instanceof Error ? error.message : "login failed" } },
        400,
      );
    }
  });

  app.get("/api/auth/login", (c) => {
    if (ctx.env.AUTH_MODE !== "oidc") {
      return c.json({ error: { code: "NOT_AVAILABLE", message: "OIDC disabled" } }, 404);
    }
    if (!ctx.env.OIDC_ISSUER || !ctx.env.OIDC_CLIENT_ID || !ctx.env.OIDC_REDIRECT_URI) {
      return c.json({ error: { code: "MISCONFIGURED", message: "OIDC incomplete" } }, 503);
    }
    const started = beginOidcLogin({
      issuer: ctx.env.OIDC_ISSUER,
      clientId: ctx.env.OIDC_CLIENT_ID,
      clientSecret: ctx.env.OIDC_CLIENT_SECRET,
      redirectUri: ctx.env.OIDC_REDIRECT_URI,
    });
    // Ephemeral PKCE state kept in memory for demo; production should use signed cookie/store.
    (ctx as unknown as { oidcPending?: Map<string, typeof started> }).oidcPending ??= new Map();
    (ctx as unknown as { oidcPending: Map<string, typeof started> }).oidcPending.set(
      started.state,
      started,
    );
    return c.redirect(started.authorizationUrl);
  });

  app.get("/api/auth/callback", async (c) => {
    if (ctx.env.AUTH_MODE !== "oidc") {
      return c.json({ error: { code: "NOT_AVAILABLE", message: "OIDC disabled" } }, 404);
    }
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return c.json({ error: { code: "INVALID_ARGUMENT", message: "missing code/state" } }, 400);
    const pending = (ctx as unknown as { oidcPending?: Map<string, ReturnType<typeof beginOidcLogin>> })
      .oidcPending?.get(state.split(".")[0] ?? "");
    if (!pending) return c.json({ error: { code: "INVALID_ARGUMENT", message: "unknown state" } }, 400);
    try {
      const exchanged = await exchangeAuthorizationCode({
        config: {
          issuer: ctx.env.OIDC_ISSUER!,
          clientId: ctx.env.OIDC_CLIENT_ID!,
          clientSecret: ctx.env.OIDC_CLIENT_SECRET,
          redirectUri: ctx.env.OIDC_REDIRECT_URI!,
        },
        code,
        codeVerifier: pending.codeVerifier,
        expectedNonce: pending.nonce,
      });
      const principal = mapVerifiedClaimsToPrincipal(exchanged.idTokenClaims, {
        tenantClaim: "tenant_id",
        audienceClaim: "compass_audience",
        rolesClaim: "roles",
        deploymentsClaim: "deployments",
        customersClaim: "customers",
        policyVersion: "oidc-claims-1",
      });
      const { token } = issueSession(ctx.store, principal);
      c.header("Set-Cookie", sessionCookieHeader(token, ctx.env));
      return c.redirect("/");
    } catch (error) {
      return c.json(
        {
          error: {
            code: "AUTH_FAILED",
            message: error instanceof Error ? error.message : "OIDC failed",
          },
        },
        401,
      );
    }
  });

  app.post("/api/auth/logout", (c) => {
    try {
      assertSameOrigin(c.req.raw, ctx.env.APP_ORIGIN);
    } catch (error) {
      return originError(c, error);
    }
    const token = cookieValue(c.req.header("cookie"), SESSION_COOKIE);
    if (token) ctx.store.revokeSession(token);
    c.header("Set-Cookie", clearSessionCookieHeader(ctx.env));
    return c.body(null, 204);
  });

  app.get("/api/session", (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    const p = session.principal;
    return c.json({
      subject: p.subject,
      displayName: p.displayName,
      audience: p.audience,
      tenantId: p.tenantId,
      allowedDeploymentIds: p.allowedDeploymentIds,
      allowedCustomerIds: p.allowedCustomerIds,
    });
  });

  app.get("/api/deployments/:id/capabilities", (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    const id = c.req.param("id");
    const decision = ctx.authz.authorizeDeployment(session.principal, id);
    if (!decision.allowed) return c.json({ error: { code: decision.code, message: decision.reason } }, 404);
    const profile = ctx.profiles.get(id);
    if (!profile) return c.json({ error: { code: "NOT_FOUND", message: "Unknown deployment" } }, 404);
    return c.json({
      id: profile.id,
      label: profile.label,
      environment: profile.environment,
      capabilities: profile.capabilities,
      fixture: profile.environment === "fixture",
    });
  });

  app.get("/api/deployments/:id/customers", (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    if (session.principal.audience !== "operator") {
      return c.json({ error: { code: "FORBIDDEN", message: "Operators only" } }, 403);
    }
    const id = c.req.param("id");
    assertAuthorized(ctx.authz.authorizeDeployment(session.principal, id));
    const q = (c.req.query("q") ?? "").toLowerCase();
    const customers = session.principal.allowedCustomerIds
      .filter((cid) => !q || q.length < 3 || cid.includes(q))
      .slice(0, 20)
      .map((cid) => ({ id: cid, displayName: cid }));
    return c.json({ customers });
  });

  app.post("/api/conversations", async (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    try {
      assertSameOrigin(c.req.raw, ctx.env.APP_ORIGIN);
    } catch (error) {
      return originError(c, error);
    }
    const parsed = createConversationSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "INVALID_ARGUMENT", message: parsed.error.message } }, 400);
    }
    const { deploymentId } = parsed.data;
    let targetCustomerId = parsed.data.targetCustomerId ?? null;
    const dep = ctx.authz.authorizeDeployment(session.principal, deploymentId);
    if (!dep.allowed) return c.json({ error: { code: dep.code, message: dep.reason } }, 404);
    if (session.principal.audience === "customer") {
      targetCustomerId = session.principal.allowedCustomerIds[0] ?? null;
    }
    if (!targetCustomerId) {
      return c.json({ error: { code: "INVALID_ARGUMENT", message: "targetCustomerId required" } }, 400);
    }
    const cust = ctx.authz.authorizeCustomer(session.principal, deploymentId, targetCustomerId);
    if (!cust.allowed) return c.json({ error: { code: cust.code, message: cust.reason } }, 404);
    const conversation = ctx.store.createConversation({
      tenantId: session.principal.tenantId,
      deploymentId,
      ownerSubject: session.principal.subject,
      audience: session.principal.audience,
      targetCustomerId,
    });
    return c.json(
      {
        id: conversation.id,
        revision: conversation.revision,
        scope: { deploymentId, targetCustomerId },
      },
      201,
    );
  });

  app.get("/api/conversations", (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    const list = ctx.store
      .listConversations(session.principal.tenantId, session.principal.subject)
      .slice(0, 20)
      .map((row) => ({
        id: row.id,
        title: row.title,
        deploymentId: row.deploymentId,
        targetCustomerId: row.targetCustomerId,
        revision: row.revision,
        updatedAt: row.updatedAt.toISOString(),
      }));
    return c.json({ conversations: list });
  });

  app.get("/api/conversations/:id", (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    const conversation = ctx.store.getConversation(session.principal.tenantId, c.req.param("id"));
    if (!conversation || conversation.ownerSubject !== session.principal.subject) {
      return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    const messages = ctx.store.messages
      .filter((m) => m.conversationId === conversation.id)
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.contentJson,
        createdAt: m.createdAt.toISOString(),
      }));
    return c.json({ conversation, messages });
  });

  app.post("/api/conversations/:id/turns", async (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    try {
      assertSameOrigin(c.req.raw, ctx.env.APP_ORIGIN);
    } catch (error) {
      return originError(c, error);
    }
    const conversation = ctx.store.getConversation(session.principal.tenantId, c.req.param("id"));
    if (!conversation || conversation.ownerSubject !== session.principal.subject) {
      return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    const parsed = createTurnSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "INVALID_ARGUMENT", message: parsed.error.message } }, 400);
    }
    const requestHash = hashRequest(parsed.data.text, parsed.data.expectedRevision);
    const profile = ctx.profiles.get(conversation.deploymentId);
    if (!profile) {
      return c.json({ error: { code: "NOT_FOUND", message: "Deployment profile missing" } }, 404);
    }
    const accepted = ctx.store.acceptTurn({
      conversationId: conversation.id,
      tenantId: session.principal.tenantId,
      ownerSubject: session.principal.subject,
      clientTurnId: parsed.data.clientTurnId,
      expectedRevision: parsed.data.expectedRevision,
      text: parsed.data.text,
      requestHash,
      profileRevision: profile.revision,
      policyVersion: session.principal.policyVersion,
    });
    if (accepted.status === "conflict") {
      return c.json({ error: { code: accepted.code, message: accepted.code } }, 409);
    }
    if (accepted.replay && accepted.turn.state !== "running" && accepted.turn.answerJson) {
      return c.json({
        turnId: accepted.turn.id,
        status: accepted.turn.state,
        answer: accepted.turn.answerJson,
        conversationRevision: accepted.conversation.revision,
        replay: true,
      });
    }

    const services = ctx.servicesFor(conversation.deploymentId);
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const write = (part: unknown) => writer.write(part as never);
        write({
          type: "data-turn",
          data: {
            turnId: accepted.turn.id,
            conversationRevision: accepted.conversation.revision,
            status: "running",
          },
        });
        try {
          const answer = await runTurn(
            {
              store: ctx.store,
              services,
              profile,
              environment: profile.environment,
            },
            {
              principal: session.principal,
              conversationId: conversation.id,
              turnId: accepted.turn.id,
              leaseToken: accepted.turn.leaseToken,
              text: parsed.data.text,
              targetCustomerId: conversation.targetCustomerId,
              onProgress: (event) => {
                write({ type: "data-progress", data: event });
              },
            },
          );
          const finalized = ctx.store.finalizeTurn({
            turnId: accepted.turn.id,
            leaseToken: accepted.turn.leaseToken,
            state: answer.content.status === "partial" ? "partial" : "completed",
            answerJson: answer as unknown as Record<string, unknown>,
          });
          if (!finalized.ok) {
            write({
              type: "data-turn-error",
              data: {
                turnId: accepted.turn.id,
                code: finalized.code,
                message: "Failed to persist answer",
                retryable: false,
              },
            });
            return;
          }
          write({ type: "data-answer", data: answer });
          write({
            type: "data-turn",
            data: {
              turnId: accepted.turn.id,
              conversationRevision: finalized.conversation.revision,
              status: finalized.turn.state,
            },
          });
        } catch (error) {
          const code =
            error instanceof Error && "code" in error
              ? String((error as { code: string }).code)
              : "TURN_FAILED";
          ctx.store.finalizeTurn({
            turnId: accepted.turn.id,
            leaseToken: accepted.turn.leaseToken,
            state: code === "CANCELLED" ? "cancelled" : "failed",
            errorCode: code,
          });
          write({
            type: "data-turn-error",
            data: {
              turnId: accepted.turn.id,
              code,
              message: error instanceof Error ? error.message : "Turn failed",
              retryable: false,
            },
          });
        }
      },
    });
    return createUIMessageStreamResponse({ stream });
  });

  app.get("/api/conversations/:id/turns/:turnId", (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    const conversation = ctx.store.getConversation(session.principal.tenantId, c.req.param("id"));
    if (!conversation || conversation.ownerSubject !== session.principal.subject) {
      return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    const turn = ctx.store.turns.get(c.req.param("turnId"));
    if (!turn || turn.conversationId !== conversation.id) {
      return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    return c.json({
      turnId: turn.id,
      state: turn.state,
      answer: turn.answerJson,
      conversationRevision: conversation.revision,
    });
  });

  app.post("/api/conversations/:id/turns/:turnId/cancel", (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    try {
      assertSameOrigin(c.req.raw, ctx.env.APP_ORIGIN);
    } catch (error) {
      return originError(c, error);
    }
    const conversation = ctx.store.getConversation(session.principal.tenantId, c.req.param("id"));
    if (!conversation || conversation.ownerSubject !== session.principal.subject) {
      return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    ctx.store.requestCancel(c.req.param("turnId"), session.principal.tenantId);
    return c.json({ accepted: true }, 202);
  });

  app.get("/api/conversations/:id/evidence/:evidenceId", (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    const conversation = ctx.store.getConversation(session.principal.tenantId, c.req.param("id"));
    if (!conversation || conversation.ownerSubject !== session.principal.subject) {
      return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    const evidence = ctx.store.getEvidence(
      session.principal.tenantId,
      conversation.id,
      c.req.param("evidenceId"),
    );
    if (!evidence) return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    if (evidence.visibility === "operator" && session.principal.audience === "customer") {
      return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    return c.json({
      id: evidence.id,
      kind: evidence.kind,
      fields: evidence.sanitizedFields,
      visibility: evidence.visibility,
      retrievedAt: evidence.retrievedAt.toISOString(),
    });
  });

  app.post("/api/conversations/:id/feedback", async (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    try {
      assertSameOrigin(c.req.raw, ctx.env.APP_ORIGIN);
    } catch (error) {
      return originError(c, error);
    }
    const body = (await c.req.json()) as {
      turnId?: string;
      rating?: string;
      reason?: string;
      comment?: string;
    };
    if (!body.turnId || (body.rating !== "helpful" && body.rating !== "unhelpful")) {
      return c.json({ error: { code: "INVALID_ARGUMENT", message: "Invalid feedback" } }, 400);
    }
    ctx.store.feedback.push({
      tenantId: session.principal.tenantId,
      conversationId: c.req.param("id"),
      turnId: body.turnId,
      subject: session.principal.subject,
      rating: body.rating,
      reason: body.reason,
      comment: body.comment,
    });
    return c.json({ ok: true }, 201);
  });

  app.delete("/api/conversations/:id", (c) => {
    const session = readSession(ctx.store, c.req.header("cookie"));
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
    try {
      assertSameOrigin(c.req.raw, ctx.env.APP_ORIGIN);
    } catch (error) {
      return originError(c, error);
    }
    const ok = ctx.store.deleteConversation(
      session.principal.tenantId,
      c.req.param("id"),
      session.principal.subject,
    );
    if (!ok) return c.json({ error: { code: "CONFLICT", message: "Cannot delete" } }, 409);
    return c.body(null, 204);
  });
}

function originError(c: { json: (body: unknown, status: number) => Response }, error: unknown) {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status: number }).status)
      : 403;
  return c.json(
    {
      error: {
        code:
          error && typeof error === "object" && "code" in error
            ? String((error as { code: string }).code)
            : "FORBIDDEN",
        message: error instanceof Error ? error.message : "Forbidden",
      },
    },
    status as 400 | 403,
  );
}

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
