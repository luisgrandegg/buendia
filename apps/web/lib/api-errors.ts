/**
 * Shared error envelope for the operation layer.
 *
 * Operations return discriminated unions so each transport can shape the
 * outcome the way it wants — server actions translate failures into
 * redirect query strings, HTTP handlers translate them into JSON
 * responses. Throwing exceptions across that boundary would force every
 * caller into try/catch and discard the structured `code`/`status`/`details`
 * that the API contract relies on.
 */

export interface OpError {
  /** Stable machine-readable identifier, e.g. `not_found`, `not_owner`. */
  code: string;
  /** Human-readable explanation safe to surface to a non-technical user. */
  message: string;
  /** HTTP status the API should emit. Actions ignore this. */
  status: number;
  /** Optional structured context (never include credentials). */
  details?: Record<string, unknown>;
}

export type OpResult<T> = { ok: true; data: T } | { ok: false; error: OpError };

export function ok<T>(data: T): OpResult<T> {
  return { ok: true, data };
}

export function fail(error: OpError): OpResult<never> {
  return { ok: false, error };
}

/** Common errors reused across operations. */
export const Errors = {
  unauthenticated(): OpError {
    return { code: "unauthenticated", message: "Sign in or supply a valid token.", status: 401 };
  },
  forbidden(message = "You don't have access to that."): OpError {
    return { code: "forbidden", message, status: 403 };
  },
  notFound(message = "Not found."): OpError {
    return { code: "not_found", message, status: 404 };
  },
  badRequest(message: string, details?: Record<string, unknown>): OpError {
    return { code: "bad_request", message, status: 400, details };
  },
  conflict(message: string): OpError {
    return { code: "conflict", message, status: 409 };
  },
  upstream(message: string): OpError {
    return { code: "upstream_failed", message, status: 502 };
  },
  internal(message = "Something went wrong."): OpError {
    return { code: "internal", message, status: 500 };
  },
};
