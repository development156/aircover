/**
 * The last recorded Alpha readiness verdict (docs/05 §1 + §5).
 *
 * WHY THIS IS A HAND-RECORDED CONSTANT AND NOT A QUERY. There is no gate-result
 * table. `ops_qa_runs` records test suites, not a judgement about whether the
 * product is shippable, and nothing in the schema can hold "six of the fourteen
 * Alpha items do not work". Until that record exists (carded), the honest
 * options are to show nothing or to show a dated, sourced, explicitly stale
 * transcription. Showing nothing is how 6/14 ended up discoverable only in a
 * subclause of a seed comment.
 *
 * SO: EVERY FIELD BELOW IS A TRANSCRIPTION, NOT A COMPUTATION. The card renders
 * it with its date and its age, and says out loud that it has not been re-run.
 * When the next gate runs, edit this and nothing else.
 *
 * A NOTE ON WHICH FOURTEEN. docs/05 §5 "Alpha Gate" is eleven checkboxes about
 * behaviour ("scheduled post fires within ±60s"). The fourteen counted here are
 * the Alpha ITEMS of docs/05 §1 — the build list this roadmap seeds as A1…A14.
 * They are different lists and only one of them has fourteen entries, so the
 * copy says "Alpha items" and never "the Alpha Gate", which would attach a real
 * number to the wrong thing.
 *
 * ── WHY ALL FOURTEEN ARE ENUMERATED, AND WHY EACH CARRIES ITS EVIDENCE ───────
 * This used to be a list of failing codes. A list of failures makes every item
 * NOT on it read as a pass, which is the same silence the file was written to
 * end — the reader cannot tell "checked and fine" from "nobody looked". Adding
 * a third status made that worse rather than better: with fails and partials
 * both named, the unnamed remainder looks doubly confirmed.
 *
 * So every code A1…A14 appears exactly once, with a status and a sentence of
 * evidence a person can go and check. `pass` here means "the 25 Jul audit found
 * it working", never "it is working now", and items nobody has re-checked say
 * so in their own evidence line rather than relying on the reader to infer it.
 *
 * ── WHY ITEMS CARRY A DATE THE RECORD DOES NOT ──────────────────────────────
 * `recordedOn` stays 25 Jul because that is when the sweep of all fourteen
 * happened. Six items were re-read on 13 Aug against the live database and the
 * deployed config; those carry `revisedOn`. Restamping the whole record would
 * have been the cheaper edit and a false one — it would claim a fresh reading
 * of eight items nobody looked at.
 */

/**
 * An Alpha item taken OUT of the beta on purpose, with the date and the reason.
 *
 * A descope is a decision, not a defect, and the two must not share a number —
 * a panel that counts them together tells the reader six things are broken when
 * the truth is five are broken and one was never attempted.
 *
 * It is a SEPARATE record from the audit above and carries its own date, because
 * it was made by a different person on a different day. Editing the statuses
 * instead would have been the cheaper change and a false one: it would make the
 * 25 Jul audit claim it found five failures when it found six.
 */
export interface AlphaDescope {
  /** The roadmap item code, e.g. `A12`. */
  code: string
  /** ISO date the scope decision was made — NOT the audit date. */
  decidedOn: string
  /** Why it is out, in words a person can check. */
  reason: string
}

/**
 * `partial` is the status this record most needed and least wants to be soft.
 *
 * It means: the item does something real AND does not do what docs/05 asked
 * for, with both halves named in the evidence. It is not a polite `fail` and it
 * is not a `pass` with a caveat — an item whose shipped half is useless on its
 * own is a `fail`, and one whose gap is cosmetic is a `pass`.
 */
export type AlphaStatus = 'pass' | 'partial' | 'fail'

export interface AlphaAssessment {
  /** The roadmap item code, e.g. `A8`. */
  code: string
  status: AlphaStatus
  /**
   * What was checked and what it showed, in words a person can go and verify.
   * Never a characterisation ("mostly works") — a fact with a source.
   */
  evidence: string
  /**
   * ISO date THIS item was last re-read, when later than `recordedOn`. Absent
   * means the reading is the base audit's and has not been revisited.
   */
  revisedOn?: string
}

export interface AlphaGateRecord {
  /** ISO date the sweep of all fourteen was made. */
  recordedOn: string
  verdict: 'no-ship' | 'ship'
  /**
   * The commit the audit was performed against, so a reader can tell whether
   * what is deployed is what was assessed. Rendered beside the deployed SHA;
   * see `alpha-chip.tsx` for why a difference is stated rather than alarmed.
   */
  auditedSha: string
  /**
   * EVERY Alpha item, exactly once. Enumerated rather than filtered so that
   * absence from the list can never be read as a pass — see the header.
   */
  assessments: readonly AlphaAssessment[]
  /** Items deliberately deferred past the beta. */
  outOfScope: readonly AlphaDescope[]
  /** Where the judgement came from, in words a person can check. */
  source: string
}

/** Wording reused by every item the 13 Aug pass did not re-open. */
const AS_AUDITED =
  'Recorded by the 25 Jul sweep and not re-checked since — this is that date’s reading, not today’s.'

export const ALPHA_GATE: AlphaGateRecord = {
  recordedOn: '2026-07-25',
  verdict: 'no-ship',
  auditedSha: 'a9aad9c',
  assessments: [
    {
      code: 'A1',
      status: 'pass',
      evidence: `Monorepo and the shared zod contracts build and typecheck across every package. ${AS_AUDITED}`,
    },
    {
      code: 'A2',
      status: 'partial',
      revisedOn: '2026-08-13',
      evidence:
        'Schema, RLS and apply_ledger_entry() are live and in use. The CLAUDE.md non-negotiable is "every table: workspace_id + RLS + anon-client test", and the test half is not met: the 27 Jul audit (docs/audit/2026-07-27) counted the anon-client test on 11 of 27 tables. packages/db/tests holds 17 files today, but several are cross-cutting rather than per-table (migration integrity, the live guard, the ledger key contract), so the per-table count has not been re-derived and is somewhere above 11 and below 17.',
    },
    {
      code: 'A3',
      status: 'fail',
      evidence: `Clerk auth reaches workspaces and members; the switcher was the half assessed as not working. ${AS_AUDITED}`,
    },
    {
      code: 'A4',
      status: 'pass',
      evidence: `Onboarding resolves to brand_memory v1. ${AS_AUDITED}`,
    },
    {
      code: 'A5',
      status: 'partial',
      revisedOn: '2026-08-13',
      evidence:
        'Colour extraction, the Readability Guard and persistence all work — themeTokensFrom() derives the tokens and saveWorkspaceTheme() writes them, and 5 workspaces wear an active extracted theme. Two halves are missing: the 4 default themes docs/05 asks for do not exist anywhere in the app, and a palette is only ever found when the door is a URL whose page declares a colour. A sentence door yields none, which the door step states on screen ("a sentence carries no colour").',
    },
    {
      code: 'A6',
      status: 'pass',
      evidence: `Posts editor with per-platform variants and AI rewrite. ${AS_AUDITED}`,
    },
    {
      code: 'A7',
      status: 'pass',
      evidence: `Planner list and week calendar, with statuses and reschedule. ${AS_AUDITED}`,
    },
    {
      code: 'A8',
      status: 'fail',
      revisedOn: '2026-08-13',
      evidence:
        'Neither platform A8 names has ever published live. In post_publish_logs, x is 3 fixture successes and gbp is 2 fixture successes plus 1 fixture failure, all dated 22 Jul; there is not one live row for either. Every live row belongs to a platform A8 does not name — instagram 6 succeeded and linkedin 1 succeeded, both 10 Aug, through Zernio. Live publishing works; live publishing TO X AND GBP has never happened.',
    },
    {
      code: 'A9',
      status: 'partial',
      revisedOn: '2026-08-13',
      evidence:
        'Scheduled publish runs, and is genuinely idempotent: runClaimedPublish claims a variant with a single atomic UPDATE, so two overlapping ticks cannot double-post. Two things A9 names are not true. It is not Trigger.dev — apps/jobs was never deployed there, and the sweep runs as a Vercel cron. And the schedule in apps/web/vercel.json is "*/5 * * * *", so a due post waits up to five minutes for a tick.',
    },
    {
      code: 'A10',
      status: 'partial',
      revisedOn: '2026-08-13',
      evidence:
        'Grants, HOLD→DEBIT and the wallet UI are live through apply_ledger_entry. The checkout is not the one A10 names: packages/billing/src/providers holds cashfree and a fixture, and no source file anywhere reads STRIPE_SECRET_KEY or STRIPE_STARTER_PRICE_ID, though both still sit in the build env allowlist. "stripe" survives as an enum value and a type name and nothing else, so the Stripe test checkout is unbuilt rather than untested.',
    },
    {
      code: 'A11',
      status: 'pass',
      evidence: `"Plan my week" v0 produces five Brand-Brain-grounded drafts. ${AS_AUDITED}`,
    },
    {
      code: 'A12',
      status: 'partial',
      revisedOn: '2026-08-13',
      evidence:
        'Prompt → sections → in-app preview works. The rest of the chain A12 names — real deploy, contact form, leads — is unbuilt, so the module is hidden from the nav rather than shown half-finished. Deferred on purpose; see the out-of-scope record below.',
    },
    {
      code: 'A13',
      status: 'fail',
      evidence: `Dashboard CMO card, credit chip and empty states. ${AS_AUDITED}`,
    },
    {
      code: 'A14',
      status: 'fail',
      evidence: `Sahoda Guide v0 — mascot, six tours and the sandbox seed brand. ${AS_AUDITED}`,
    },
  ],
  outOfScope: [
    {
      code: 'A12',
      decidedOn: '2026-08-13',
      reason:
        'Sites is out of beta scope. Generation and preview work; the deploy half (real address, contact form, leads) is unowned, so the module is hidden from the nav rather than shown half-finished.',
    },
  ],
  source: 'wt-web audit, 25 Jul 2026; six items re-read against the live database, 13 Aug 2026',
}

/** The codes at a given status, in record order. */
export function codesAt(record: AlphaGateRecord, status: AlphaStatus): string[] {
  return record.assessments.filter((a) => a.status === status).map((a) => a.code)
}

/** Whole days since the assessment. Negative is impossible and clamps to 0. */
export function gateAgeDays(record: AlphaGateRecord, today: Date): number {
  const recorded = Date.parse(`${record.recordedOn}T00:00:00Z`)
  if (Number.isNaN(recorded)) return 0
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.max(0, Math.round((midnight - recorded) / 86_400_000))
}

/**
 * A verdict older than this is reported as possibly out of date.
 *
 * Two days, not two weeks: the sprint is measured in hours, and a three-day-old
 * "NO-SHIP" is as capable of misleading as a three-day-old "ready" — work lands
 * fast enough here that both go stale on the same clock.
 */
export const GATE_STALE_AFTER_DAYS = 2

export function ageLabel(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/**
 * How the audited commit relates to what is actually deployed.
 *
 * `unknown` is its own outcome and must never collapse into `match`: a build
 * that recorded no SHA cannot prove the audit describes it, and saying nothing
 * would let the reader assume it does.
 */
export type ShaDrift = 'unknown' | 'match' | 'drift'

/** Compares on the audited prefix, since `auditedSha` is recorded short. */
export function shaDrift(record: AlphaGateRecord, deployedSha: string | undefined): ShaDrift {
  const deployed = deployedSha?.trim()
  if (!deployed) return 'unknown'
  return deployed.startsWith(record.auditedSha) ? 'match' : 'drift'
}

/** First 7 characters, the length git itself abbreviates to. */
export function shortSha(sha: string): string {
  return sha.trim().slice(0, 7)
}
