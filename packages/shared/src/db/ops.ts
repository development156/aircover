import { z } from 'zod'
import {
  OpsRoleSchema,
  OpsAdminStatusSchema,
  OpsApplicationStatusSchema,
  OpsCreditRequestStatusSchema,
  OpsRoadmapStatusSchema,
  OpsTaskColumnSchema,
  OpsAssigneeSchema,
  OpsMovedBySchema,
  OpsChangelogKindSchema,
  OpsChangelogAuthorSchema,
  OpsQaKindSchema,
  OpsQaSuiteSchema,
  OpsQaStatusSchema,
  OpsSessionStatusSchema,
  OpsArtifactMimeSchema,
} from '../enums'
import { JsonbSchema } from '../common'

// Row schemas for the ten platform-scope ops_* tables (doc 13 §3).
//
// These carry no workspace_id — the sanctioned exception — so nothing here has a
// tenant field to validate. Every table is read through app.is_ops_admin() and
// written only through a public.ops_* RPC, which is why the Insert derivatives
// below describe RPC arguments rather than direct table writes.

// ── ops_admins ───────────────────────────────────────────────────────────────
export const OpsAdminSchema = z.object({
  id: z.uuid(),
  /** Null until the person signs in and the Clerk user.created webhook links them. */
  user_id: z.string().nullable(),
  email: z.string(),
  name: z.string().nullable(),
  role: OpsRoleSchema,
  status: OpsAdminStatusSchema,
  last_active_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type OpsAdmin = z.infer<typeof OpsAdminSchema>

// ── ops_beta_applications ────────────────────────────────────────────────────
export const OpsBetaApplicationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  business_name: z.string(),
  email: z.string(),
  phone: z.string(),
  source_url: z.string().nullable(),
  status: OpsApplicationStatusSchema,
  clerk_invitation_id: z.string().nullable(),
  clerk_user_id: z.string().nullable(),
  notes: z.string().nullable(),
  handled_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type OpsBetaApplication = z.infer<typeof OpsBetaApplicationSchema>

/**
 * The public embed form, exactly four fields (doc 13 §5) plus the anti-abuse
 * carriers. This is a REQUEST shape, not a row shape: it has no status and no
 * handled_by, so a caller cannot post themselves straight to `invited`.
 *
 * `website` is the honeypot — a real browser never fills it. It is named
 * innocuously on purpose and must be empty.
 */
export const OpsBetaApplyInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  business_name: z.string().trim().min(1).max(160),
  email: z.email().max(254),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9 ()-]{7,20}$/, 'Enter a phone number we can reach you on.')
    .refine((v) => (v.match(/\d/g) ?? []).length >= 7 && (v.match(/\d/g) ?? []).length <= 15, {
      message: 'Enter a phone number we can reach you on.',
    }),
  source_url: z.string().trim().max(200).optional(),
  website: z.string().max(0).optional(),
  turnstile_token: z.string().min(1).max(4096),
})
export type OpsBetaApplyInput = z.infer<typeof OpsBetaApplyInputSchema>

// ── ops_credit_requests ──────────────────────────────────────────────────────
// otp_hash and otp_expires_at are deliberately ABSENT from this schema. The row
// is read by the admin UI; a hashed one-time code has no business travelling to
// a browser even in hashed form, and leaving it out of the contract means no
// select can accidentally ship it.
export const OpsCreditRequestSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  workspace_label: z.string(),
  amount: z.int(),
  reason: z.string(),
  requested_by: z.string(),
  approver_id: z.string().nullable(),
  attempts: z.int(),
  self_approved: z.boolean(),
  status: OpsCreditRequestStatusSchema,
  denied_reason: z.string().nullable(),
  ledger_idempotency_key: z.string().nullable(),
  decided_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type OpsCreditRequest = z.infer<typeof OpsCreditRequestSchema>

/** Doc 13 §6 caps a single request at 10,000 credits; the table CHECKs it too. */
export const OpsCreditRequestCreateSchema = z.object({
  workspace_id: z.uuid(),
  amount: z.int().min(1).max(10_000),
  reason: z.string().trim().min(3).max(500),
  approver_email: z.email(),
})
export type OpsCreditRequestCreate = z.infer<typeof OpsCreditRequestCreateSchema>

export const OpsCreditOtpVerifySchema = z.object({
  request_id: z.uuid(),
  code: z.string().regex(/^\d{6}$/, 'The code is six digits.'),
})
export type OpsCreditOtpVerify = z.infer<typeof OpsCreditOtpVerifySchema>

// ── ops_roadmap_items ────────────────────────────────────────────────────────
export const OpsRoadmapItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  stage: z.string(),
  title: z.string(),
  weight: z.int(),
  status: OpsRoadmapStatusSchema,
  target_date: z.string().nullable(),
  sort: z.int(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type OpsRoadmapItem = z.infer<typeof OpsRoadmapItemSchema>

// ── ops_tasks ────────────────────────────────────────────────────────────────
export const OpsTaskSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  doc_ref: z.string().nullable(),
  roadmap_code: z.string().nullable(),
  board_column: OpsTaskColumnSchema,
  assignee: OpsAssigneeSchema,
  blocked: z.boolean(),
  blocked_reason: z.string().nullable(),
  archived: z.boolean(),
  pr_ref: z.string().nullable(),
  commit_sha: z.string().nullable(),
  started_at: z.string().nullable(),
  review_at: z.string().nullable(),
  done_at: z.string().nullable(),
  moved_by: OpsMovedBySchema,
  sort: z.int(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type OpsTask = z.infer<typeof OpsTaskSchema>

// ── ops_changelog ────────────────────────────────────────────────────────────
export const OpsChangelogEntrySchema = z.object({
  id: z.uuid(),
  seq: z.number(),
  title: z.string(),
  summary_plain: z.string(),
  details_tech: z.string().nullable(),
  kind: OpsChangelogKindSchema,
  author: OpsChangelogAuthorSchema,
  author_overridden: z.boolean(),
  task_codes: z.array(z.string()),
  tourable: z.boolean(),
  happened_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type OpsChangelogEntry = z.infer<typeof OpsChangelogEntrySchema>

// ── ops_qa_runs ──────────────────────────────────────────────────────────────
export const OpsQaRunSchema = z.object({
  id: z.uuid(),
  task_code: z.string().nullable(),
  kind: OpsQaKindSchema,
  suite: OpsQaSuiteSchema,
  status: OpsQaStatusSchema,
  summary_plain: z.string().nullable(),
  details: z.string().nullable(),
  actor: z.string(),
  duration_ms: z.int().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type OpsQaRun = z.infer<typeof OpsQaRunSchema>

// ── ops_qa_artifacts ─────────────────────────────────────────────────────────
export const OPS_QA_ARTIFACT_MAX_BYTES = 10 * 1024 * 1024

export const OpsQaArtifactSchema = z.object({
  id: z.uuid(),
  run_id: z.uuid(),
  storage_path: z.string(),
  caption: z.string().nullable(),
  bytes: z.int(),
  mime: OpsArtifactMimeSchema,
  created_at: z.string(),
})
export type OpsQaArtifact = z.infer<typeof OpsQaArtifactSchema>

// ── ops_sessions ─────────────────────────────────────────────────────────────
export const OpsSessionSchema = z.object({
  id: z.uuid(),
  session_id: z.string(),
  label: z.string().nullable(),
  tasks_touched: z.array(z.string()),
  status: OpsSessionStatusSchema,
  started_at: z.string(),
  last_heartbeat_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type OpsSession = z.infer<typeof OpsSessionSchema>

// ── ops_audit_log (append-only) ──────────────────────────────────────────────
export const OpsAuditLogSchema = z.object({
  id: z.uuid(),
  actor: z.string(),
  action: z.string(),
  target_table: z.string().nullable(),
  target_id: z.string().nullable(),
  meta: JsonbSchema.nullable(),
  created_at: z.string(),
})
export type OpsAuditLog = z.infer<typeof OpsAuditLogSchema>
