import "../../guard";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppEnv } from "../../config/env";

export const OIDC_LOGIN_COOKIE = "compass_oidc_login";

export type OidcLoginState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnPath: string;
  exp: number;
};

export function sealOidcLoginState(payload: OidcLoginState, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function openOidcLoginState(token: string, secret: string, now = Date.now()): OidcLoginState {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Invalid OIDC login state");
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("OIDC login state signature mismatch");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OidcLoginState;
  if (!payload.state || !payload.nonce || !payload.codeVerifier || !payload.exp) {
    throw new Error("OIDC login state incomplete");
  }
  if (payload.exp <= now) throw new Error("OIDC login state expired");
  return payload;
}

export function oidcLoginCookieHeader(value: string, env: AppEnv, maxAgeSeconds = 600): string {
  const secure = env.APP_MODE !== "local" ? "; Secure" : "";
  return `${OIDC_LOGIN_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearOidcLoginCookieHeader(env: AppEnv): string {
  const secure = env.APP_MODE !== "local" ? "; Secure" : "";
  return `${OIDC_LOGIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function resolveOidcStateSecret(env: AppEnv): string {
  const secret = env.OIDC_STATE_SECRET || env.OIDC_CLIENT_SECRET;
  if (!secret) {
    throw new Error("OIDC_STATE_SECRET or OIDC_CLIENT_SECRET required for login state");
  }
  return secret;
}
