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
 * APPEND ONLY. The code is this array's INDEX — `SL-${i + 1}` — so inserting an
 * entry in the middle renumbers every card after it, and the board, the git
 * history and the QA rows all keep pointing at the old numbers. That happened
 * once: a card added before the last entry gave two different cards the same
 * title and left a third with no home. New work goes at the END, always, even
 * when it belongs next to something else conceptually.
 */
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
  [
    'AO4',
    'Grant through apply_ledger_entry + replay proof',
    'Also owns the why-line. wt-web rewrote the wallet GRANT copy to classify ' +
      'from the idempotency key and actor rather than action_type, and the admin ' +
      'why-line went with it — so doc 13 §6\'s "Credits added by Sahoda Labs ' +
      'team." currently has no implementation. Add it as an `admin` origin in ' +
      'lib/wallet/grant-origin.ts, PROVEN from adminGrantKey() the way signup and ' +
      'plan are proven, not by matching action_type: that field is free text with ' +
      'no CHECK and the classifier deliberately stopped trusting it (see SL-032). ' +
      'Until then the doc is ahead of the code, which is the safe direction.',
  ],
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

  // Process and reliability debt found while building P1. None of it is doc 13
  // scope, so roadmap_code stays null for the same reason SL-032 does.
  [
    null,
    'Add CI: run the gate and smoke on every pull request',
    'There is no CI at all — .github holds one issue template, and the Stop hook ' +
      'is the only thing standing between a broken commit and main. Smoke cannot ' +
      'go in the Stop hook: Playwright boots its own dev server (~8s cold) and ' +
      'global-setup fetches a Clerk testing token, so it would add 60-120s to ' +
      'every stop AND hard-fail the credential-free cloud sandbox that teammates ' +
      'use, where a non-technical user cannot recover. A workflow file runs the ' +
      'same checks once per PR instead of once per stop. Needs Clerk test and ' +
      'Supabase secrets in GitHub; gate the live-DB suites on their env flags so ' +
      'a fork PR without secrets still reports honestly rather than red.',
  ],
  [
    null,
    'Fix the flaky brand-resolve deployment-config test',
    'apps/web/src/app/actions/brand-resolve.test.ts > "resolveBrand — deployment ' +
      'config failures" > "missing billing env → honest config copy, cause logged ' +
      'server-side" failed 2 of 5 full-suite runs on 2026-07-26 and passes every ' +
      'time in isolation. It is NOT a logic race: the captured failure is "Test ' +
      'timed out in 5000ms". The test calls loadResolveBrand(), which resets ' +
      'modules and dynamically re-imports the action; in a full run the import ' +
      'phase alone takes ~156s across 92 files, so under that contention the ' +
      'import exceeds the 5s default. Fix by giving this test an explicit ' +
      'timeout, or by hoisting the dynamic import out of the timed body — not by ' +
      'raising testTimeout globally, which would hide slow tests everywhere. ' +
      'Owner: whoever owns brand-resolve; found by the Admin-Ops lane.',
  ],
  [
    null,
    'Guard against a migration that records success without applying',
    'On 2026-07-25 migration 20260725182153_ops_ingest.sql was written to ' +
      'schema_migrations while the file was 0 bytes: a first push timed out ' +
      'before the content was copied in, and the retry applied an empty file. ' +
      'History said applied, the schema had neither the function nor the columns, ' +
      'and every layer downstream reported success — supabase db push exited 0, ' +
      'the app returned a clean 502, and a future push would skip the version ' +
      'forever. Nothing in the stack compares what a migration CLAIMS to create ' +
      'against what exists afterwards. Cheapest useful guard: refuse to apply an ' +
      'empty migration file, then a post-push check that parses CREATE ' +
      'TABLE/FUNCTION/INDEX/POLICY names out of the applied files and asserts ' +
      'each object exists in the catalog. Run it in the CI card above.',
  ],
  [
    null,
    'Clear lifecycle stamps when a card moves backward',
    'public.ops_ingest only ever coalesces started_at / review_at / done_at, so ' +
      'a stamp survives a card moving back a column. Proven on 2026-07-26: the ' +
      'commit hook wrongly closed SL-028 and SL-032, and after reverting them to ' +
      'todo both still carried a done_at — the rows were repaired by hand. ' +
      'Nothing reads those columns yet, which is the only reason this is not ' +
      'already visible; the P2 board shows "age in column" and would read them. ' +
      'Fix in the RPC: null the stamps that the incoming column does not justify ' +
      '(done_at only when board_column = done, review_at only at review or ' +
      'beyond) rather than coalescing unconditionally.',
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
