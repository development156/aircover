import { CARDS, cardDetail } from './ops-cards.mjs'

/**
 * Roadmap and board seed, taken from docs/05 (Roadmap v2.0) and doc 13 §18.
 *
 * ALPHA STATUSES ARE ALL `todo`, on purpose and by decision. Several Alpha items
 * are in fact shipped, but the last gate review scored §5 at 6/14 FAIL and
 * nothing here is going to invent a status it cannot evidence. An understated
 * percentage is the safe direction: it self-corrects the moment a human flips a
 * card, whereas an overstated one is the fake-success this project refuses.
 * Flip them from the roadmap side sheet once the next Alpha Gate runs.
 */

/** docs/05 §1 — the 14 Day-2 Alpha items, in the document's own order. */
const ALPHA = [
  'Monorepo + packages/shared zod contracts',
  'Supabase core schema, RLS on every table, apply_ledger_entry(), seed script',
  'Clerk auth → workspaces + members; workspace switcher',
  'Onboarding — Signal Resolution Console → brand_memory v1',
  'Look & Feel — 4 default themes, colour extraction, Readability Guard',
  'Posts editor with per-platform variants + AI rewrite',
  'Planner — list + week calendar, statuses, reschedule',
  'Real publishing to X and Google Business Profile',
  'Scheduled publish via Trigger.dev (idempotent, retries)',
  'Credit ledger live — grants, HOLD→DEBIT, wallet UI, Stripe test checkout',
  '"Plan my week" v0 — five Brand-Brain-grounded drafts',
  'Sites v0 — prompt → sections → real deploy → contact form → leads',
  'Dashboard — CMO card, credit chip, empty states',
  'Sahoda Guide v0 — mascot + 6 tours + sandbox seed brand',
]

/** doc 13 §18 — this build, one roadmap item per phase, weight = its timebox in half-hours. */
const ADMIN_OPS = [
  ['AO1', 'Foundations — ops tables, RLS, shared contracts, /admin gate', 3],
  ['AO2', 'Sync protocol — ingest API, state files, hooks, skill, commands', 3],
  ['AO3', 'DevOps dashboard — roadmap card, scrum board, changelog, QA console', 6],
  ['AO4', 'Admin half — beta form, inbox, invitations, credit OTP, team', 6],
  ['AO5', 'Acceptance gate — doc 13 §17, security review, handoff', 2],
]

/** docs/05 §6 — the post-sprint backlog, strict order, one stage each per doc 13 §7. */
const BACKLOG = [
  'Scheduled Loop cycles + Monday CMO report',
  'Approval flows L2 (in-app, email, WhatsApp when verified)',
  'Analytics ingestion X/GBP → normalized',
  'Audience Twin v0 + inline scores',
  'Campaigns full (tabs + add-to-planner)',
  'Meta publish + Instagram variants',
  'Studio renderer (zero-COGS exports)',
  'Razorpay UPI AutoPay',
  'Inbox v0 — X mentions + GBP reviews',
  'Guideline-PDF Brand Skin extraction',
  'Custom domains (SSL-for-SaaS)',
  'Playbooks ×3',
  'Remix',
  'Radar',
  'DIFM + stuck-detect',
  'Hindi',
  'Agency tier + white-label',
  'Public API + MCP',
  'Pinterest / Threads / Shorts / Shopify',
  'Loop L3',
]

export function roadmapItems() {
  const items = []

  ALPHA.forEach((title, i) => {
    items.push({
      code: `A${i + 1}`,
      stage: 'alpha',
      title,
      weight: 1,
      status: 'todo',
      sort: i + 1,
    })
  })

  ADMIN_OPS.forEach(([code, title, weight], i) => {
    items.push({ code, stage: 'admin-ops', title, weight, status: 'todo', sort: 20 + i })
  })

  BACKLOG.forEach((title, i) => {
    items.push({
      code: `B${i + 1}`,
      stage: `backlog-${i + 1}`,
      title,
      weight: 1,
      status: 'todo',
      sort: 100 + i * 10,
    })
  })

  return items
}

/**
 * doc 13 §18 → the SL tasks for this build, the board's first content.
 *
 * THE TEXT NO LONGER LIVES HERE. Every card's title and detail comes from
 * `ops-cards.mjs`, the one source list, which `ops/state/board.json` is also
 * written from. Two hand-kept copies of the same 62 cards is what drifted
 * seventeen cards apart in SL-060; there is now one copy and a test.
 *
 * APPEND ONLY, over there. The code is the array's INDEX — `SL-${i + 1}` — so
 * inserting an entry in the middle renumbers every card after it, and the
 * board, the git history and the QA rows all keep pointing at the old numbers.
 * That happened once: a card added before the last entry gave two different
 * cards the same title and left a third with no home. New work goes at the END,
 * always, even when it belongs next to something else conceptually.
 */
export function tasks() {
  return CARDS.map((card, i) => ({
    code: `SL-${String(i + 1).padStart(3, '0')}`,
    title: card.title,
    detail: cardDetail(card),
    roadmap_code: card.roadmap ?? null,
    board_column: 'todo',
    assignee: 'claude',
    doc_ref: card.roadmap ? 'docs/13_Admin_Ops_SAHODA_LABS.md §18' : null,
    sort: (i + 1) * 10,
  }))
}
