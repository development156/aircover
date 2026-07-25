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

/** doc 13 §18 → the 31 SL tasks for this build, the board's first content. */
const TASKS = [
  ['AO1', 'ops_* migrations + RLS + is_ops_admin()'],
  ['AO1', 'Anon-client RLS suite for all ten ops tables'],
  ['AO1', 'Shared ops enums + row schemas in packages/shared'],
  ['AO1', '/admin middleware gate, requireOpsAdmin, first CSP'],
  ['AO1', 'Seed script, qa-artifacts bucket, env and turbo wiring'],
  ['AO1', 'sahoda-db skill amendment for platform-scope tables'],
  ['AO2', 'Ingest RPC and route with idempotency tests'],
  ['AO2', 'ops/state seeds and scripts/ops-sync.mjs'],
  ['AO2', 'scripts/ops-hook-bash.mjs — auto QA runs and commit → done'],
  ['AO2', 'settings.json hook entries + sahoda-devops skill'],
  ['AO2', '/task, /qa-log, /log-change commands + /ship refusal'],
  ['AO2', 'End-to-end dogfood verification against the live board'],
  ['AO3', '/admin shell, sub-nav, rail item'],
  ['AO3', 'Roadmap progress card with "To reach Done"'],
  ['AO3', 'Session pulse and gates strips'],
  ['AO3', 'Scrum board — four columns, drag, filters'],
  ['AO3', 'Changelog rail with copy affordances'],
  ['AO3', 'QA console feed and filters'],
  ['AO3', 'Manual QA composer — paste/drop screenshots, autosave'],
  ['AO3', 'QA JSON export and import (sahoda_qa_v1)'],
  ['AO3', 'Live updates so cards move while Claude works'],
  ['AO3', 'Raw-hex guard test (doc 08 has no ESLint behind it)'],
  ['AO4', '/embed/beta public form'],
  ['AO4', 'Beta-apply hardening — Turnstile, rate limit, honeypot'],
  ['AO4', 'Applications inbox with CSV export'],
  ['AO4', 'Clerk invitations and user.created webhook'],
  ['AO4', 'Credit request with two-admin OTP'],
  ['AO4', 'Grant through apply_ledger_entry + replay proof'],
  ['AO4', '/admin/team roles with last-owner guard'],
  ['AO4', 'Audit log on every admin mutation'],
  ['AO5', 'Acceptance gate, security review, changelog, handoff'],

  // Technical debt found while wiring the admin grant, not part of doc 13's plan.
  // roadmap_code is null deliberately: docs/05 §6 is the founder's ordered
  // backlog and inserting a 21st item would misrepresent that ordering.
  [
    null,
    'Constrain credit_ledger.action_type instead of parsing grant keys',
    'GRANT rows carry their origin in action_type, which is plain text with no ' +
      'enum and no CHECK. GRANT_ORIGIN in @sahoda/shared plus a migration-scanning ' +
      'contract test keep producer and consumer honest, but nothing stops a new ' +
      'writer inventing a value — it renders as "Included with your plan", which ' +
      'is wrong for every grant that did not come from a plan. Replace the ' +
      'convention with a real grant_origin column or structured meta, backfill, ' +
      'then delete the string matching in lib/wallet/entry-copy.ts.',
  ],
]

export function tasks() {
  return TASKS.map(([roadmapCode, title, detail], i) => ({
    code: `SL-${String(i + 1).padStart(3, '0')}`,
    title,
    detail: detail ?? null,
    roadmap_code: roadmapCode,
    board_column: 'todo',
    assignee: 'claude',
    doc_ref: roadmapCode ? 'docs/13_Admin_Ops_SAHODA_LABS.md §18' : null,
    sort: (i + 1) * 10,
  }))
}
