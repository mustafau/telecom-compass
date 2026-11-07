import "./guard";
import path from "node:path";
import type { AppEnv } from "./config/env";
import { loadLocalPersonas, type LocalPersonaFile } from "./auth/local-personas";
import { MemoryStore } from "./db/memory-store";
import { createFixtureAuthorizationService } from "./policy/fixture-authz";
import type { AuthorizationService } from "./policy/types";
import { loadCheckedProfile } from "./tmf/profile/load";
import type { CheckedProfile } from "./tmf/profile/revision";
import { createTmfGateway } from "./tmf/gateway";
import { createFixtureServer } from "./tmf/fixtures/server";
import { createDomainServices, type DomainServices } from "./domain/services/catalog";
import { envSecretResolver } from "./tmf/transport/auth";

export type AppContext = {
  env: AppEnv;
  store: MemoryStore;
  authz: AuthorizationService;
  personas: LocalPersonaFile | null;
  profiles: Map<string, CheckedProfile>;
  servicesFor(deploymentId: string): DomainServices;
};

export async function createAppContext(env: AppEnv): Promise<AppContext> {
  if (env.AUTH_MODE === "local-fixture" && (env.APP_MODE === "production" || env.APP_MODE === "demo")) {
    throw new Error("local-fixture auth cannot start in demo/production");
  }

  const store = new MemoryStore();
  const authz = createFixtureAuthorizationService();
  let personas: LocalPersonaFile | null = null;
  if (env.AUTH_MODE === "local-fixture") {
    personas = await loadLocalPersonas(
      path.resolve(env.AUTHORIZATION_CONFIG_FILE ?? "config/auth/local-personas.yaml"),
    );
  }

  const profiles = new Map<string, CheckedProfile>();
  const fixtureDeployments = path.resolve("config/fixtures/deployments.yaml");
  for (const id of ["fixture-a", "fixture-b", "fixture-c", "fixture-d"]) {
    try {
      profiles.set(id, await loadCheckedProfile(fixtureDeployments, id));
    } catch {
      // optional if file missing in partial checkouts
    }
  }

  // Optional local sandbox profile
  try {
    const localProfile = await loadCheckedProfile(env.DEPLOYMENTS_FILE, env.DEFAULT_DEPLOYMENT_ID);
    if (localProfile.environment === "live" && env.AUTH_MODE === "local-fixture") {
      throw new Error("local auth cannot activate a live deployment profile");
    }
    profiles.set(localProfile.id, localProfile);
  } catch {
    // setup:local may not have been run
  }

  const fixtureFetchers = new Map<string, typeof fetch>();
  for (const id of ["fixture-a", "fixture-b"]) {
    const variant = id === "fixture-a" ? "a" : "b";
    fixtureFetchers.set(id, createFixtureServer(variant).fetch);
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

  return { env, store, authz, personas, profiles, servicesFor };
}
