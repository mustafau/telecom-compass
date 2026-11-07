import "../guard";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AppEnv } from "../config/env";

/**
 * Sole provider-specific entry point. Google Generative AI is the default
 * wired provider; OpenAI remains available. No silent fallback between them.
 */
export function createLanguageModel(env: AppEnv): LanguageModel {
  if (env.MODEL_MODE !== "provider") {
    throw new Error("createLanguageModel requires MODEL_MODE=provider");
  }
  const provider = env.MODEL_PROVIDER;
  const modelId = env.MODEL_ID;
  const apiKey = env.MODEL_API_KEY;
  if (!provider || !modelId || !apiKey) {
    throw new Error("MODEL_PROVIDER, MODEL_ID and MODEL_API_KEY are required");
  }
  if (provider === "google") {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelId);
  }
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai.chat(modelId);
  }
  throw new Error(
    `Unsupported MODEL_PROVIDER=${provider}; use "google" or "openai"`,
  );
}
