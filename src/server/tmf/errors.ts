import "../guard";

export type TmfErrorCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND_OR_NOT_AUTHORIZED"
  | "CAPABILITY_UNAVAILABLE"
  | "RELATIONSHIP_UNAVAILABLE"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_AUTH_FAILURE"
  | "INVALID_UPSTREAM_RESPONSE"
  | "CONTRACT_MISMATCH"
  | "BUDGET_EXCEEDED"
  | "CANCELLED"
  | "PROFILE_INVALID"
  | "ACTIVATION_DENIED"
  | "METHOD_NOT_ALLOWED"
  | "REDIRECT_DENIED"
  | "RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_FILTER";

export class TmfError extends Error {
  readonly code: TmfErrorCode;
  readonly retryable: boolean;

  constructor(code: TmfErrorCode, message: string, options?: { retryable?: boolean; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "TmfError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}
