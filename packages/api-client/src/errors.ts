import type { ErrorResponse } from "@mirra/shared-types";

/** An error returned by the Mirra API, unwrapped from the `{error: {...}}` envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static from(status: number, body: unknown): ApiError {
    const err = (body as Partial<ErrorResponse> | undefined)?.error;
    if (err && typeof err.code === "string") {
      return new ApiError(status, err.code, err.message ?? "Request failed", err.details);
    }
    return new ApiError(
      status,
      status === 0 ? "network_error" : "http_error",
      `Request failed (${status})`,
    );
  }
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}
