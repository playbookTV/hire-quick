/**
 * Typed view of the API's error envelope: `{ error: { code, message, issues? } }`.
 * `issues` mirrors Zod's flattened issues so forms can map them onto fields.
 */
import type { z } from 'zod';

export interface ApiErrorIssue {
  path: (string | number)[];
  message: string;
  code?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues?: ApiErrorIssue[],
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True for the validation envelope; `issues` are present. */
  get isValidation(): boolean {
    return this.code === 'VALIDATION' && !!this.issues?.length;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; issues?: unknown };
}

/** Build an ApiError from a non-2xx response body (best-effort, never throws). */
export function toApiError(
  status: number,
  body: unknown,
  requestId?: string,
): ApiError {
  const env = (body ?? {}) as ErrorEnvelope;
  const code = env.error?.code ?? (status >= 500 ? 'INTERNAL' : 'ERROR');
  const message = env.error?.message ?? 'Something went wrong';
  const issues = normalizeIssues(env.error?.issues);
  return new ApiError(status, code, message, issues, requestId);
}

function normalizeIssues(raw: unknown): ApiErrorIssue[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const issues = raw
    .map((i) => i as z.ZodIssue)
    .filter((i) => i && Array.isArray(i.path))
    .map((i) => ({ path: i.path, message: i.message, code: i.code }));
  return issues.length ? issues : undefined;
}
