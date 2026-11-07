import "../guard";
import { z } from "zod";

const appModeSchema = z.enum(["local", "demo", "production"]);
const authModeSchema = z.enum(["local-fixture", "oidc"]);
const modelModeSchema = z.enum(["scripted", "provider"]);

const envSchema = z.object({
  APP_MODE: appModeSchema.default("local"),
  AUTH_MODE: authModeSchema.default("local-fixture"),
  MODEL_MODE: modelModeSchema.default("scripted"),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  DEPLOYMENTS_FILE: z.string().default("./config/deployments.local.yaml"),
  DEFAULT_DEPLOYMENT_ID: z.string().default("telecom-api-sandbox"),
  LOCAL_TMF_BASE_URL: z.string().url().default("http://localhost:8787"),
  CONTRACT_LOCK_FILE: z.string().default("./config/contracts.lock.json"),
  CUSTOMER_ACCESS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  MODEL_PROVIDER: z.string().optional(),
  MODEL_ID: z.string().optional(),
  MODEL_API_KEY: z.string().optional(),
  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().url().optional(),
  /** HMAC secret for PKCE login cookie; defaults to OIDC_CLIENT_SECRET when unset. */
  OIDC_STATE_SECRET: z.string().min(16).optional(),
  OIDC_ENTITLEMENTS_FILE: z.string().default("./config/auth/oidc-entitlements.yaml"),
  AUTHORIZATION_CONFIG_FILE: z.string().optional(),
  TURN_DEADLINE_MS: z.coerce.number().int().positive().default(60_000),
  DISCOVERY_DEADLINE_MS: z.coerce.number().int().positive().default(45_000),
  MAX_DISCOVERY_STEPS: z.coerce.number().int().positive().default(6),
  MAX_TOOL_CALLS: z.coerce.number().int().positive().default(8),
  MAX_HTTP_ATTEMPTS: z.coerce.number().int().positive().default(16),
  MAX_HTTP_CONCURRENCY: z.coerce.number().int().positive().default(3),
  HTTP_ATTEMPT_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  FINAL_ANSWER_MAX_TOKENS: z.coerce.number().int().positive().default(2_000),
  CONVERSATION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

function assertModeCompatibility(env: AppEnv): void {
  if (env.APP_MODE === "production" && env.AUTH_MODE === "local-fixture") {
    throw new EnvValidationError(
      "APP_MODE=production cannot use AUTH_MODE=local-fixture",
    );
  }
  if (env.APP_MODE === "demo" && env.AUTH_MODE === "local-fixture") {
    throw new EnvValidationError(
      "APP_MODE=demo requires AUTH_MODE=oidc; local-fixture login is local-only",
    );
  }
  if (env.APP_MODE === "production" && env.MODEL_MODE === "scripted") {
    throw new EnvValidationError("APP_MODE=production requires MODEL_MODE=provider");
  }
  if (env.MODEL_MODE === "provider") {
    if (!env.MODEL_PROVIDER || !env.MODEL_ID || !env.MODEL_API_KEY) {
      throw new EnvValidationError(
        "MODEL_MODE=provider requires MODEL_PROVIDER, MODEL_ID and MODEL_API_KEY",
      );
    }
    if (env.MODEL_PROVIDER !== "google" && env.MODEL_PROVIDER !== "openai") {
      throw new EnvValidationError(
        'MODEL_PROVIDER must be "google" or "openai"',
      );
    }
  }
  if (env.AUTH_MODE === "oidc") {
    if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID || !env.OIDC_REDIRECT_URI) {
      throw new EnvValidationError(
        "AUTH_MODE=oidc requires OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_REDIRECT_URI",
      );
    }
    if (!env.OIDC_STATE_SECRET && !env.OIDC_CLIENT_SECRET) {
      throw new EnvValidationError(
        "AUTH_MODE=oidc requires OIDC_CLIENT_SECRET or OIDC_STATE_SECRET for login state",
      );
    }
  }
  if (env.APP_MODE === "production" && !env.DATABASE_URL) {
    throw new EnvValidationError("APP_MODE=production requires DATABASE_URL");
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new EnvValidationError(`Invalid environment: ${details}`);
  }
  assertModeCompatibility(parsed.data);
  return parsed.data;
}

export function tryLoadEnv(
  source: Record<string, string | undefined> = process.env,
): { ok: true; env: AppEnv } | { ok: false; error: EnvValidationError } {
  try {
    return { ok: true, env: loadEnv(source) };
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return { ok: false, error };
    }
    throw error;
  }
}
