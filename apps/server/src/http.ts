import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const megabyte = 1024 * 1024;
export function failure(message: string, status = 400, code = 'VALIDATION_ERROR') {
  return { error: { code, message }, status };
}

/**
 * An error whose message is written for the user and safe to return. Any other error is
 * reported to the client as a generic 500, with details only in the server log.
 */
export class PublicError extends Error {
  constructor(
    message: string,
    readonly status: ContentfulStatusCode = 400,
    readonly code = 'VALIDATION_ERROR',
  ) {
    super(message);
  }
}

/** `app.onError` handler: public errors keep their message; anything else becomes a generic 500. */
export function errorResponse(error: Error, c: Context): Response {
  if (error instanceof PublicError) return c.json(failure(error.message, error.status, error.code), error.status);
  if (error instanceof HTTPException) return error.getResponse();
  // Unexpected errors may carry SQL, paths, or stack details: log them, answer generically.
  console.error(error);
  return c.json(failure('Nieoczekiwany błąd serwera.', 500, 'INTERNAL_ERROR'), 500);
}

/** True for an SQLite UNIQUE or PRIMARY KEY violation from `node:sqlite`. */
export function isUniqueViolation(error: unknown): boolean {
  // Extended result codes: SQLITE_CONSTRAINT_UNIQUE (2067) and SQLITE_CONSTRAINT_PRIMARYKEY (1555).
  const code = (error as { errcode?: unknown } | null)?.errcode;
  return code === 2067 || code === 1555;
}

export async function json<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new PublicError('Nieprawidłowy JSON.');
  }
}
