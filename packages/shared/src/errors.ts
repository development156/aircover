import { z } from 'zod'

/** Uniform error taxonomy across every module (FSD 0.4). */
export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'ENTITLEMENT_ERROR',
  'CREDIT_INSUFFICIENT',
  'PROVIDER_ERROR',
  'TOKEN_EXPIRED',
  'GUARDRAIL_BLOCKED',
  'RATE_LIMITED',
])
export type ErrorCode = z.infer<typeof ErrorCodeSchema>

/** Shortfall payload carried on a CREDIT_INSUFFICIENT error (FSD 0.1: "show exact shortfall"). */
export interface CreditInsufficientDetails {
  available: number
  required: number
}

/** The uniform error envelope. `traceId` is surfaced to the user for support (FSD 0.4). */
export interface AppError {
  code: ErrorCode
  message: string
  traceId: string
  details?: unknown
}

/**
 * The return shape of every server action and API handler. Callers branch on
 * `ok` before touching `data` / `error`.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const err = (error: AppError): Result<never> => ({ ok: false, error })

/** Construct an AppError inline. */
export const appError = (
  code: ErrorCode,
  message: string,
  traceId: string,
  details?: unknown,
): AppError => ({ code, message, traceId, details })
