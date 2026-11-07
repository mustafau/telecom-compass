import "../guard";
import { randomBytes } from "node:crypto";
import type { AppEnv } from "../config/env";
import type { CompassStore } from "../db/types";
import type { Principal, SessionRecord } from "./types";

export const SESSION_COOKIE = "compass_session";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueSession(
  store: CompassStore,
  principal: Principal,
): Promise<{ token: string; session: SessionRecord }> {
  const token = createSessionToken();
  const session = await store.createSession(principal, token);
  return { token, session };
}

export async function readSession(
  store: CompassStore,
  cookieHeader: string | undefined,
): Promise<SessionRecord | null> {
  const token = parseCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  return store.getSessionByToken(token);
}

export function sessionCookieHeader(token: string, env: AppEnv, maxAgeSeconds = 8 * 60 * 60): string {
  const secure = env.APP_MODE !== "local" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookieHeader(env: AppEnv): string {
  const secure = env.APP_MODE !== "local" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function assertSameOrigin(request: Request, appOrigin: string): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw Object.assign(new Error("Missing Origin"), { status: 400, code: "MISSING_ORIGIN" });
  }
  if (origin !== appOrigin) {
    throw Object.assign(new Error("Origin mismatch"), { status: 403, code: "ORIGIN_MISMATCH" });
  }
}

export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
