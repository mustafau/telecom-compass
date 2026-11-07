import "./guard";
import path from "node:path";
import type { AppEnv } from "./config/env";
import { loadLocalPersonas, type LocalPersonaFile } from "./auth/local-personas";
import { createDb } from "./db/client";
import { MemoryStore } from "./db/memory-store";
import { PostgresStore } from "./db/postgres-store";
import type { CompassStore } from "./db/types";
import { createFixtureAuthorizationService } from "./policy/fixture-authz";
import type { AuthorizationService } from "./policy/types";
import { loadCheckedProfile } from "./tmf/profile/load";
import type { CheckedProfile } from "./tmf/profile/revision";
import { createTmfGateway } from "./tmf/gateway";
import { createFixtureServer } from "./tmf/fixtures/server";
import { createDomainServices, type DomainServices } from "./domain/services/catalog";
import { envSecretResolver } from "./tmf/transport/auth";
import { safeLog } from "./telemetry/safe-log";

export type AppContext = {
  env: AppEnv;
  store: CompassStore;
  storeKind: "memory" | "postgres";
  authz: AuthorizationService;
  personas: LocalPersonaFile | null;
  profiles: Map<string, CheckedProfile>;
  servicesFor(deploymentId: string): DomainServices;
  close?: () => Promise<void>;
};

export async function createAppContext(env: AppEnv): Promise<AppContext> {
  if (env.AUTH_MODE === "local-fixture" && (env.APP_MODE === "production" || env.APP_MODE === "demo")) {
    throw new Error("local-fixture auth cannot start in demo/production");
  }

  let store: CompassStore;
  let storeKind: "memory" | "postgres" = "memory";
  let close: (() => Promise<void>) | undefined;

  if (env.DATABASE_URL) {
    const { db, pool } = createDb(env.DATABASE_URL);
    store = new PostgresStore(db);
    storeKind = "postgres";
    close = async () => {
      await pool.end();
    };
  } else {
    if (env.APP_MODE === "production") {
      throw new Error("APP_MODE=production requires DATABASE_URL");
    }
    store = new MemoryStore();
  }

  const authz = createFixtureAuthorizationService();
  let personas: LocalPersonaFile | null = null;
  if (env.AUTH_MODE === "local-fixture") {
    personas = await loadLocalPersonas(
      path.resolve(env.AUTHORIZATION_CONFIG_FILE ?? "config/auth/local-personas.yaml"),
    );
  }

  const profiles = new Map<string, CheckedProfile>();
  const fixtureFetchers = new Map<string, typeof fetch>();
  // In-process fixtures are for automated tests only — never the interactive default.
  const enableTestFixtures = process.env.COMPASS_ENABLE_TEST_FIXTURES === "1";
  if (enableTestFixtures) {
    const fixtureDeployments = path.resolve("config/fixtures/deployments.yaml");
    for (const id of ["fixture-a", "fixture-b", "fixture-c", "fixture-d"]) {
      try {
        profiles.set(id, await loadCheckedProfile(fixtureDeployments, id));
      } catch {
        // optional if file missing in partial checkouts
      }
    }
    for (const id of ["fixture-a", "fixture-b"] as const) {
      const variant = id === "fixture-a" ? "a" : "b";
      fixtureFetchers.set(id, createFixtureServer(variant).fetch);
    }
  }

  try {
    const localProfile = await loadCheckedProfile(env.DEPLOYMENTS_FILE, env.DEFAULT_DEPLOYMENT_ID);
    if (localProfile.environment === "live" && env.AUTH_MODE === "local-fixture") {
      throw new Error("local auth cannot activate a live deployment profile");
    }
    profiles.set(localProfile.id, localProfile);
  } catch (error) {
    if (!enableTestFixtures) {
      throw new Error(
        `Default deployment "${env.DEFAULT_DEPLOYMENT_ID}" is required for interactive use. Run pnpm setup:local (and start telecom-api-sandbox). ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  function servicesFor(deploymentId: string): DomainServices {
    const profile = profiles.get(deploymentId);
    if (!profile) {
      throw Object.assign(new Error(`Unknown deployment ${deploymentId}`), { status: 404 });
    }
    if (profile.environment === "live" && env.AUTH_MODE === "local-fixture") {
      throw Object.assign(new Error("local auth cannot use live deployments"), { status: 403 });
    }
    const fetchImpl = fixtureFetchers.get(deploymentId);
    const gateway = createTmfGateway({
      profile,
      resolveSecret: envSecretResolver(),
      fetchImpl,
    });
    return createDomainServices({ profile, gateway, authz });
  }

  const tmfHosts = [...new Set(
    [...profiles.values()].flatMap((p) =>
      Object.values(p.apis).map((api) => {
        try {
          return new URL(api.baseUrl).host;
        } catch {
          return "invalid-baseUrl";
        }
      }),
    ),
  )];
  safeLog("info", "app.boot", {
    appMode: env.APP_MODE,
    authMode: env.AUTH_MODE,
    modelMode: env.MODEL_MODE,
    store: storeKind,
    defaultDeploymentId: env.DEFAULT_DEPLOYMENT_ID,
    profileCount: profiles.size,
    testFixtures: enableTestFixtures ? 1 : 0,
    tmfHosts: tmfHosts.join(","),
  });

  return { env, store, storeKind, authz, personas, profiles, servicesFor, close };
}
