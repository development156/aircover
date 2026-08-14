import { z } from 'zod'
import {
  OpsTaskColumnSchema,
  OpsAssigneeSchema,
  OpsChangelogKindSchema,
  OpsQaKindSchema,
  OpsQaSuiteSchema,
  OpsQaStatusSchema,
  OpsSessionStatusSchema,
} from '../enums'
import { OpsQaRunSchema, OpsQaArtifactSchema } from '../db/ops'

// The Claude ↔ dashboard sync protocol (doc 13 §9).
//
// The repo is the source of truth and the dashboard mirrors it. `ops/state/*.json`
// are committed, reviewable files that Claude edits as part of normal work;
// scripts/ops-sync.mjs POSTs them to /api/admin/devops/ingest, which validates
// against the schemas below before anything reaches Postgres.
//
// TWO THINGS ARE DELIBERATELY NOT ACCEPTED FROM A CLIENT:
//   · `moved_by` — the server stamps 'claude' on everything the token writes, so
//     the agent cannot forge a human drag (doc 13 §9.6).
//   · `author` on a changelog entry — assigned server-side from the global
//     sequence so the rotation stays deterministic (doc 13 §8, §9.4).

/** `SL-1` … `SL-9999`. The code is the task's identity across git, board and QA. */
export const OpsTaskCodeSchema = z.string().regex(/^SL-\d{1,4}$/, 'Task codes look like SL-12.')

/**
 * Client-generated id for an append-style row. Sending the same payload twice
 * must produce one row, so changelog entries and QA runs carry one of these and
 * the server upserts on it.
 */
export const OpsClientIdSchema = z.string().min(8).max(64)

// ── board.json ───────────────────────────────────────────────────────────────
export const OpsStateTaskSchema = z
  .object({
    code: OpsTaskCodeSchema,
    title: z.string().trim().min(1).max(200),
    /**
     * 20000, raised from 2000 on 2026-08-14 (SL-080).
     *
     * The 2000 was a zod-only invention: `ops_tasks.detail` is plain unbounded
     * `text` with no check constraint (20260725102928_ops_platform_tables.sql
     * :126), so nothing about storage wanted this number.
     *
     * It made the ingest endpoint reject the WHOLE payload — the schema is
     * `.strict()` and one long card fails all 83 — so the board could not sync
     * even after its dead-URL was corrected. Twelve cards were already over the
     * cap; the longest was 4763. A cap of 4000 would have bought weeks, not a
     * fix, because the sahoda-devops rule is that a card's technical detail is
     * verbatim and NOTHING is deleted in a rewrite: these fields only grow. So
     * this matches `OpsRoadmapItemSchema.details` (20000) below rather than
     * inventing a third number.
     *
     * Truncating in the syncer was the alternative and is the wrong one — it
     * would delete the detail the skill forbids deleting, and make the sync
     * report success while quietly shortening the record.
     */
    detail: z.string().max(20000).nullish(),
    doc_ref: z.string().max(200).nullish(),
    roadmap_code: z.string().max(40).nullish(),
    board_column: OpsTaskColumnSchema,
    assignee: OpsAssigneeSchema.default('claude'),
    blocked: z.boolean().default(false),
    blocked_reason: z.string().max(500).nullish(),
    archived: z.boolean().default(false),
    pr_ref: z.string().max(200).nullish(),
    commit_sha: z.string().max(64).nullish(),
    sort: z.int().default(0),
  })
  .strict()
export type OpsStateTask = z.infer<typeof OpsStateTaskSchema>

export const OpsBoardStateSchema = z.object({
  version: z.literal(1),
  tasks: z.array(OpsStateTaskSchema).max(1000),
})
export type OpsBoardState = z.infer<typeof OpsBoardStateSchema>

// ── roadmap.json ─────────────────────────────────────────────────────────────
export const OpsStateRoadmapItemSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    stage: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(200),
    weight: z.int().min(1).max(100).default(1),
    status: z.enum(['todo', 'active', 'done', 'cut']).default('todo'),
    target_date: z.string().nullish(),
    sort: z.int().default(0),
  })
  .strict()
export type OpsStateRoadmapItem = z.infer<typeof OpsStateRoadmapItemSchema>

export const OpsRoadmapStateSchema = z.object({
  version: z.literal(1),
  items: z.array(OpsStateRoadmapItemSchema).max(500),
})
export type OpsRoadmapState = z.infer<typeof OpsRoadmapStateSchema>

// ── changelog.pending.json ───────────────────────────────────────────────────
export const OpsStateChangelogEntrySchema = z
  .object({
    client_id: OpsClientIdSchema,
    title: z.string().trim().min(1).max(80),
    /**
     * Mandatory and non-technical (doc 13 §8). The length floor is the only thing
     * a schema can enforce; "no jargon, no file paths" is the skill's job and the
     * reviewer's.
     */
    summary_plain: z.string().trim().min(10).max(600),
    details_tech: z.string().max(4000).nullish(),
    kind: OpsChangelogKindSchema.default('changed'),
    task_codes: z.array(OpsTaskCodeSchema).max(20).default([]),
    tourable: z.boolean().default(false),
    happened_at: z.string().nullish(),
  })
  .strict()
export type OpsStateChangelogEntry = z.infer<typeof OpsStateChangelogEntrySchema>

/**
 * `OPS_QUEUE_CEILING`, not `OPS_WIRE_BATCH_MAX` — the two are different limits
 * that were one number until SL-084.
 *
 * A `*.pending.json` file is an OUTBOX: rows leave it only when the dashboard
 * acknowledges them, so everything in it is unsent. Capping it at one POST's
 * worth is what made `ops-hook-bash.mjs` evict 140 unsent QA runs while a dead
 * endpoint kept the drain from ever running. Retention is now the writer's
 * business (scripts/lib/ops-queue.mjs), and it refuses loudly instead of
 * deleting; this bound only has to be at least as large as the writer's ceiling
 * so that a legitimately backed-up file still parses.
 *
 * The wire limit below is UNCHANGED and must stay 200: it is the server's, and
 * exceeding it 400s the whole payload.
 */
export const OPS_QUEUE_CEILING = 1000

/** One POST's worth. Mirrored in scripts/lib/ops-queue.mjs — see state-sendable.test.ts. */
export const OPS_WIRE_BATCH_MAX = 200

export const OpsChangelogPendingSchema = z.object({
  version: z.literal(1),
  entries: z.array(OpsStateChangelogEntrySchema).max(OPS_QUEUE_CEILING),
})
export type OpsChangelogPending = z.infer<typeof OpsChangelogPendingSchema>

// ── qa.pending.json ──────────────────────────────────────────────────────────
export const OpsStateQaRunSchema = z
  .object({
    client_id: OpsClientIdSchema,
    task_code: OpsTaskCodeSchema.nullish(),
    kind: OpsQaKindSchema.default('auto'),
    suite: OpsQaSuiteSchema,
    status: OpsQaStatusSchema,
    summary_plain: z.string().max(600).nullish(),
    details: z.string().max(20000).nullish(),
    actor: z.string().max(80).default('claude'),
    duration_ms: z.int().min(0).nullish(),
    started_at: z.string().nullish(),
    finished_at: z.string().nullish(),
  })
  .strict()
export type OpsStateQaRun = z.infer<typeof OpsStateQaRunSchema>

export const OpsQaPendingSchema = z.object({
  version: z.literal(1),
  runs: z.array(OpsStateQaRunSchema).max(OPS_QUEUE_CEILING),
})
export type OpsQaPending = z.infer<typeof OpsQaPendingSchema>

// ── the ingest payload ───────────────────────────────────────────────────────
export const OpsIngestSessionSchema = z
  .object({
    session_id: z.string().min(1).max(120),
    label: z.string().max(120).nullish(),
    tasks_touched: z.array(OpsTaskCodeSchema).max(100).default([]),
    status: OpsSessionStatusSchema,
  })
  .strict()
export type OpsIngestSession = z.infer<typeof OpsIngestSessionSchema>

/**
 * `.strict()` is load-bearing, not tidiness. Doc 13 §16 requires that the ingest
 * token be unable to reach credits; an unknown key here is REJECTED rather than
 * stripped, so a payload carrying `credits` or `admins` fails the whole request
 * instead of being quietly ignored. The RPC behind this accepts these five
 * sections and nothing else.
 */
export const OpsIngestPayloadSchema = z
  .object({
    source: z.string().min(1).max(80),
    git: z
      .object({
        branch: z.string().max(200).nullish(),
        subject: z.string().max(300).nullish(),
        sha: z.string().max(64).nullish(),
      })
      .nullish(),
    /** `--full`: tasks absent from this payload are archived, never deleted (doc 13 §9.7). */
    full: z.boolean().default(false),
    roadmap: z.array(OpsStateRoadmapItemSchema).max(500).default([]),
    tasks: z.array(OpsStateTaskSchema).max(1000).default([]),
    // The WIRE limit, and the reason scripts/ops-sync.mjs sends the oldest
    // OPS_WIRE_BATCH_MAX rows rather than the whole queue. Raising it is a
    // server-side decision; a client that exceeds it gets a 400 on the ENTIRE
    // payload, which `ingestVerdict` correctly refuses to retry.
    changelog: z.array(OpsStateChangelogEntrySchema).max(OPS_WIRE_BATCH_MAX).default([]),
    qa: z.array(OpsStateQaRunSchema).max(OPS_WIRE_BATCH_MAX).default([]),
    session: OpsIngestSessionSchema.nullish(),
  })
  .strict()
export type OpsIngestPayload = z.infer<typeof OpsIngestPayloadSchema>

/** What the ingest route acknowledges — counts only, never row contents. */
export const OpsIngestAckSchema = z.object({
  ok: z.literal(true),
  roadmap: z.int(),
  tasks: z.int(),
  changelog: z.int(),
  qa: z.int(),
  archived: z.int(),
  session: z.boolean(),
})
export type OpsIngestAck = z.infer<typeof OpsIngestAckSchema>

// ── the portable QA record (doc 13 §11) ──────────────────────────────────────
/**
 * Artifacts travel as metadata only — the bytes stay in the private bucket, so an
 * exported file can be pasted into a ticket without leaking screenshots.
 */
export const SahodaQaExportSchema = z.object({
  schema: z.literal('sahoda_qa_v1'),
  exported_at: z.string(),
  runs: z.array(OpsQaRunSchema),
  artifacts: z.array(OpsQaArtifactSchema),
})
export type SahodaQaExport = z.infer<typeof SahodaQaExportSchema>
