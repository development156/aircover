import type { PostStatus } from '@sahoda/shared'

import { formatScheduledAt } from '@/lib/posts/schedule-format'
import { DEFAULT_ZONE, resolveDisplayZone } from '@/lib/time/zone'

/**
 * THE READER'S CONTEXT FOR A REVIEW DECISION, AS PURE FUNCTIONS.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * F-23: a reviewer opening /approvals saw a title, a channel list and a badge,
 * and had to open the editor to learn WHEN the post goes out, WHAT it says, WHO
 * wrote it and whether anything in its history explains why it is here. Every
 * one of those is a sentence built from two or three columns, and each sentence
 * has a wrong version that is easy to write by hand at a call site ("Written by
 * user_2abc…", a time in the browser's zone, "Approved" over a return). So they
 * are built here, once, and pinned by `context.test.ts`.
 *
 * ── NO IDS REACH THE SCREEN ──────────────────────────────────────────────────
 * `created_by`, `actor` and `author` are Clerk subjects. The product cannot
 * currently resolve one to a name — `users_profile` is user-scoped, so a member
 * can read only their own row — and printing the subject would be worse than
 * printing nothing. So every person is "you" or "a teammate". A name lookup is
 * owed; when it lands, `whoIs` is the one place to change.
 */

/** `post_approvals.decision`. Three values, and the CHECK constraint agrees. */
export type ApprovalDecision = 'submitted' | 'approved' | 'returned'

export interface ApprovalRow {
  id: string
  post_id: string
  actor: string
  decision: ApprovalDecision
  reason: string | null
  created_at: string
}

export interface CommentRow {
  id: string
  post_id: string
  author: string
  body: string
  created_at: string
  deleted_at: string | null
}

/** `post_comments.body` is capped at 2000 in the column. */
export const COMMENT_MAX = 2000
/** `return_post_to_draft` accepts up to 500 characters of reason. */
export const REASON_MAX = 500
/** How much of the body a queue row shows before the disclosure. */
export const EXCERPT_LENGTH = 160

const DECISIONS: ReadonlySet<string> = new Set(['submitted', 'approved', 'returned'])

/**
 * Shape-checked rather than cast: these rows come from a table this lane
 * cannot type through `@sahoda/shared` yet (the schema lands with the
 * migration), and a malformed row must degrade to "not shown", never throw
 * inside a server component.
 */
export function parseApprovalRow(raw: unknown): ApprovalRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.post_id !== 'string') return null
  if (typeof r.actor !== 'string' || typeof r.created_at !== 'string') return null
  if (typeof r.decision !== 'string' || !DECISIONS.has(r.decision)) return null
  if (r.reason !== null && r.reason !== undefined && typeof r.reason !== 'string') return null
  return {
    id: r.id,
    post_id: r.post_id,
    actor: r.actor,
    decision: r.decision as ApprovalDecision,
    reason: typeof r.reason === 'string' ? r.reason : null,
    created_at: r.created_at,
  }
}

export function parseCommentRow(raw: unknown): CommentRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.post_id !== 'string') return null
  if (typeof r.author !== 'string' || typeof r.body !== 'string') return null
  if (typeof r.created_at !== 'string') return null
  const deleted = r.deleted_at
  if (deleted !== null && deleted !== undefined && typeof deleted !== 'string') return null
  return {
    id: r.id,
    post_id: r.post_id,
    author: r.author,
    body: r.body,
    created_at: r.created_at,
    deleted_at: typeof deleted === 'string' ? deleted : null,
  }
}

/** "you" or "a teammate". Never the subject. */
export function whoIs(subject: string | null | undefined, userId: string | null): string {
  return subject !== null && subject !== undefined && subject === userId ? 'you' : 'a teammate'
}

/**
 * `origin` is the only honest source for "Sahoda wrote this". `manual` is the
 * one origin that means a person typed it; every other value, including ones
 * the frozen enum does not list yet (the column was widened in production),
 * means a model produced the first draft. Compared as a string on purpose.
 */
export function authorshipLine(
  post: { origin: string; created_by: string | null },
  userId: string | null,
): string {
  if (post.origin !== 'manual') return 'Written by Sahoda'
  return `Written by ${whoIs(post.created_by, userId)}`
}

export function isOwnPost(post: { created_by: string | null }, userId: string | null): boolean {
  return userId !== null && post.created_by !== null && post.created_by === userId
}

/** The first ~160 characters, on a word, one line. Null when there is nothing. */
export function excerpt(body: string | null, length = EXCERPT_LENGTH): string | null {
  if (body === null) return null
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat === '') return null
  if (flat.length <= length) return flat
  const head = flat.slice(0, length)
  const cut = head.lastIndexOf(' ')
  return `${(cut > length / 2 ? head.slice(0, cut) : head).trimEnd()}…`
}

/** Rows grouped by post, newest first inside each group. */
export function approvalGroups(rows: readonly ApprovalRow[]): Map<string, ApprovalRow[]> {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const groups = new Map<string, ApprovalRow[]>()
  for (const row of sorted) {
    const list = groups.get(row.post_id) ?? []
    groups.set(row.post_id, [...list, row])
  }
  return groups
}

const VERB: Readonly<Record<ApprovalDecision, string>> = {
  submitted: 'Sent for review',
  approved: 'Approved',
  returned: 'Sent back',
}

/** One history row as a sentence: the act, the person, and the reason if any. */
export function historyLine(row: ApprovalRow, userId: string | null): string {
  const base = `${VERB[row.decision]} by ${whoIs(row.actor, userId)}`
  const reason = row.reason?.trim()
  return reason ? `${base}: ${reason}` : base
}

/** The latest row's sentence, for the queue, or null when the post has no history. */
export function reviewLine(rows: readonly ApprovalRow[], userId: string | null): string | null {
  const latest = rows[0]
  return latest === undefined ? null : historyLine(latest, userId)
}

/** The most recent return's reason, or null. What a reviewer most wants to see. */
export function latestReturnReason(rows: readonly ApprovalRow[]): string | null {
  const returned = rows.find((row) => row.decision === 'returned')
  const reason = returned?.reason?.trim()
  return reason ? reason : null
}

export interface PanelSubject {
  intent: PostStatus
  approvedBy: string | null
  approvedAt: string | null
  scheduledAt: string | null
}

const DAY_CACHE = new Map<string, Intl.DateTimeFormat>()

function dayIn(zone: string, iso: string): string | null {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  const { zone: display } = resolveDisplayZone(zone ?? DEFAULT_ZONE)
  let f = DAY_CACHE.get(display)
  if (!f) {
    f = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: display,
    })
    DAY_CACHE.set(display, f)
  }
  return f.format(parsed)
}

/**
 * The finish panel's state sentence: what this post is waiting on, or booked
 * for. Null for a draft or idea, which have no state worth a sentence.
 *
 * "Approved" alone when the approver was not recorded: rows approved before
 * `approved_by` existed carry no name, and inventing "by a teammate" over a
 * null would be a claim about a person nobody recorded.
 */
export function panelState(
  subject: PanelSubject,
  userId: string | null,
  zone: string,
): string | null {
  if (subject.intent === 'review') return 'Waiting for review'
  if (subject.intent === 'scheduled') {
    const when = formatScheduledAt(subject.scheduledAt, zone)
    return when === null ? 'Booked' : `Booked for ${when}`
  }
  if (subject.intent === 'approved') {
    if (subject.approvedBy === null || subject.approvedAt === null) return 'Approved'
    const day = dayIn(zone, subject.approvedAt)
    const who = whoIs(subject.approvedBy, userId)
    return day === null ? `Approved by ${who}` : `Approved by ${who} on ${day}`
  }
  return null
}

export const REASON_REQUIRED_COPY =
  'Say in a sentence what should change, so the writer knows what to do.'

export type ReasonCheck = { ok: true; reason: string } | { ok: false; message: string }

/** The same rule the RPC applies, checked before a round trip is spent. */
export function validateReason(raw: string): ReasonCheck {
  const reason = raw.trim()
  if (reason.length === 0) return { ok: false, message: REASON_REQUIRED_COPY }
  if (reason.length > REASON_MAX) {
    return {
      ok: false,
      message: `Keep the note under ${REASON_MAX} characters. It is ${reason.length} now.`,
    }
  }
  return { ok: true, reason }
}
