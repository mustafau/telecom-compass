import "../guard";
import type { Principal } from "../auth/types";

export type RunBudget = {
  remainingMs(): number;
  reserveTool(): void;
  reserveHttpAttempt(): void;
  abort(reason: string): void;
  signal: AbortSignal;
  snapshot(): Record<string, unknown>;
};

export type ExecutionContext = Readonly<{
  principal: Principal;
  deploymentId: string;
  profileRevision: string;
  conversationId: string;
  turnId: string;
  targetCustomerId?: string;
  signal: AbortSignal;
  deadline: number;
  budget: RunBudget;
  leaseToken: string;
}>;

export function createRunBudget(options: {
  deadlineMs: number;
  maxTools?: number;
  maxHttp?: number;
  signal?: AbortSignal;
}): RunBudget {
  const started = Date.now();
  const maxTools = options.maxTools ?? 8;
  const maxHttp = options.maxHttp ?? 16;
  let tools = 0;
  let http = 0;
  const controller = new AbortController();
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }
  const deadlineAt = started + options.deadlineMs;

  return {
    signal: controller.signal,
    remainingMs() {
      return Math.max(0, deadlineAt - Date.now());
    },
    reserveTool() {
      tools += 1;
      if (tools > maxTools) {
        this.abort("BUDGET_EXCEEDED");
        throw Object.assign(new Error("Tool budget exceeded"), { code: "BUDGET_EXCEEDED" });
      }
      if (this.remainingMs() <= 0) {
        this.abort("CANCELLED");
        throw Object.assign(new Error("Deadline exceeded"), { code: "CANCELLED" });
      }
    },
    reserveHttpAttempt() {
      http += 1;
      if (http > maxHttp) {
        this.abort("BUDGET_EXCEEDED");
        throw Object.assign(new Error("HTTP budget exceeded"), { code: "BUDGET_EXCEEDED" });
      }
    },
    abort(reason: string) {
      controller.abort(reason);
    },
    snapshot() {
      return { tools, http, maxTools, maxHttp, remainingMs: this.remainingMs() };
    },
  };
}
