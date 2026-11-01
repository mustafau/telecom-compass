import "../guard";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3GenerateResult,
  LanguageModelV3Message,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";

const emptyUsage = (): LanguageModelV3Usage => ({
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 8,
    text: 8,
    reasoning: undefined,
  },
});

/**
 * Deterministic no-key LanguageModelV3 used for M0 proofs and scripted mode.
 * Built on AI SDK MockLanguageModelV3 so it stays aligned with the installed major.
 */
export function createScriptedLanguageModel(modelId = "scripted-m0"): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "telecom-compass",
    modelId,
    doGenerate: async (options) => createGenerateResult(options),
    doStream: async (options) => {
      const result = createGenerateResult(options);
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            for (const part of result.content) {
              if (part.type === "text") {
                controller.enqueue({ type: "text-start", id: "txt-1" });
                controller.enqueue({ type: "text-delta", id: "txt-1", delta: part.text });
                controller.enqueue({ type: "text-end", id: "txt-1" });
              }
              if (part.type === "tool-call") {
                controller.enqueue(part);
              }
            }
            controller.enqueue({
              type: "finish",
              finishReason: result.finishReason,
              usage: result.usage,
            });
            controller.close();
          },
        }),
      };
    },
  });
}

function createGenerateResult(options: LanguageModelV3CallOptions): LanguageModelV3GenerateResult {
  const toolCall = planToolCall(options);
  if (toolCall) {
    const content: LanguageModelV3Content[] = [
      {
        type: "tool-call",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: JSON.stringify(toolCall.input),
      },
    ];
    return {
      content,
      finishReason: { unified: "tool-calls", raw: "tool-calls" },
      usage: emptyUsage(),
      warnings: [],
    };
  }

  return {
    content: [{ type: "text", text: buildStructuredAnswer(options) }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: emptyUsage(),
    warnings: [],
  };
}

function planToolCall(options: LanguageModelV3CallOptions): {
  toolCallId: string;
  toolName: string;
  input: Record<string, string>;
} | null {
  if (!options.tools || options.tools.length === 0) {
    return null;
  }
  const alreadyCalled = options.prompt.some((message: LanguageModelV3Message) => {
    if (message.role === "tool") return true;
    if (message.role !== "assistant") return false;
    return message.content.some((part) => part.type === "tool-call");
  });
  if (alreadyCalled) {
    return null;
  }
  const toolName = options.tools[0]?.name;
  if (!toolName) {
    return null;
  }
  return {
    toolCallId: "call_proof_1",
    toolName,
    input: { serviceId: "svc-proof-1" },
  };
}

function buildStructuredAnswer(options: LanguageModelV3CallOptions): string {
  const evidenceIds: string[] = [];
  for (const message of options.prompt) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;
      const output = part.output;
      if (output.type === "json" && output.value && typeof output.value === "object") {
        const evidenceId = (output.value as { evidenceId?: unknown }).evidenceId;
        if (typeof evidenceId === "string") {
          evidenceIds.push(evidenceId);
        }
      }
    }
  }

  return JSON.stringify({
    status: "answered",
    summary: "Scripted model completed the M0 proof with tool evidence.",
    evidenceIds: evidenceIds.length > 0 ? evidenceIds : ["ev-proof-fallback"],
  });
}
