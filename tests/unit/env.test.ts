import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv } from "../../src/server/config/env";

describe("loadEnv", () => {
  it("accepts local scripted defaults", () => {
    const env = loadEnv({
      APP_MODE: "local",
      AUTH_MODE: "local-fixture",
      MODEL_MODE: "scripted",
    });
    expect(env.APP_MODE).toBe("local");
    expect(env.DEFAULT_DEPLOYMENT_ID).toBe("telecom-api-sandbox");
  });

  it("rejects production with local-fixture auth", () => {
    expect(() =>
      loadEnv({
        APP_MODE: "production",
        AUTH_MODE: "local-fixture",
        MODEL_MODE: "provider",
        MODEL_PROVIDER: "openai",
        MODEL_ID: "gpt-test",
        MODEL_API_KEY: "sk-test",
        DATABASE_URL: "postgresql://compass:local_only@127.0.0.1:5432/compass",
        OIDC_ISSUER: "https://issuer.example",
        OIDC_CLIENT_ID: "compass",
        OIDC_REDIRECT_URI: "http://localhost:3000/api/auth/callback",
      }),
    ).toThrow(EnvValidationError);
  });

  it("rejects provider mode without credentials", () => {
    expect(() =>
      loadEnv({
        APP_MODE: "local",
        AUTH_MODE: "local-fixture",
        MODEL_MODE: "provider",
      }),
    ).toThrow(/MODEL_API_KEY/);
  });
});
