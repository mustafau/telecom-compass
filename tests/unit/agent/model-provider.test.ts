import { describe, expect, it } from "vitest";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createLanguageModel } from "../../../src/server/agent/model-provider";
import { loadEnv, type AppEnv } from "../../../src/server/config/env";

function asV3(model: ReturnType<typeof createLanguageModel>): LanguageModelV3 {
  if (typeof model === "string") {
    throw new Error("expected LanguageModelV3 instance");
  }
  return model as LanguageModelV3;
}

describe("createLanguageModel", () => {
  it("builds a Google Generative AI model", () => {
    const env = loadEnv({
      APP_MODE: "local",
      AUTH_MODE: "local-fixture",
      MODEL_MODE: "provider",
      MODEL_PROVIDER: "google",
      MODEL_ID: "gemini-3.5-flash-lite",
      MODEL_API_KEY: "test-key",
    });
    const model = asV3(createLanguageModel(env));
    expect(model.provider).toBe("google.generative-ai");
    expect(model.modelId).toBe("gemini-3.5-flash-lite");
  });

  it("builds an OpenAI chat model", () => {
    const env = loadEnv({
      APP_MODE: "local",
      AUTH_MODE: "local-fixture",
      MODEL_MODE: "provider",
      MODEL_PROVIDER: "openai",
      MODEL_ID: "gpt-4o-mini",
      MODEL_API_KEY: "sk-test",
    });
    const model = asV3(createLanguageModel(env));
    expect(model.provider).toBe("openai.chat");
    expect(model.modelId).toBe("gpt-4o-mini");
  });

  it("rejects unsupported providers at the factory", () => {
    const env = {
      MODEL_MODE: "provider",
      MODEL_PROVIDER: "anthropic",
      MODEL_ID: "claude",
      MODEL_API_KEY: "sk-test",
    } as AppEnv;
    expect(() => createLanguageModel(env)).toThrow(/Unsupported MODEL_PROVIDER/);
  });
});
