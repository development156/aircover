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
  [
    null,
    'Say WHY /admin denied, in the server log only',
    'Doc 13 §2 requires /admin to 404 identically for "no such route" and "not ' +
      'an admin", and that is right — a distinguishable response tells a ' +
      'stranger the console exists. But it is indistinguishable to the OWNER ' +
      'too: on 2026-07-26 a signed-in owner hit /admin, got a 404, and spent a ' +
      'detour working out whether the route was missing or the seat was. Both ' +
      'were true at once, which is exactly the case the identical response ' +
      'hides. Fix in middleware.ts: when NODE_ENV !== production, ' +
      'console.info a single line naming the reason — `[admin] denied: no ' +
      'ops_admin seat` / `no session` / `ops_admins query failed` — and keep ' +
      'the RESPONSE byte-identical in every case. Never in production, never ' +
      'in a header, never in the body: the log is for the operator at the ' +
      'terminal, not for the client. Include the reason for a failed check too, ' +
      'since isActiveOpsAdmin() swallows every error into false and a broken ' +
      'query currently looks exactly like a revoked seat.',
  ],
  [
    null,
    'Sweep the repo for `as` casts in test helpers and factories',
    'On 2026-07-26 a test factory ended `} as OpsRoadmapItem`, and the cast let ' +
      'four call sites pass status:"in_progress" — a value the enum does not ' +
      'have and the CHECK constraint rejects. Twenty-five tests were green ' +
      'against a status that cannot exist; the live ingest caught it, not the ' +
      'suite. The cast is the defect, not the value: a factory is exactly where ' +
      'the type system should be strictest, because everything downstream ' +
      'trusts the shape it produces. Sweep every `as <RowType>` and `as any` in ' +
      '*.test.ts / *.test.tsx / test factories and fixtures across apps and ' +
      'packages; replace each with an annotated return type so the fields are ' +
      'checked at the call site. Where a cast is genuinely needed (a ' +
      'deliberately malformed row proving a parser rejects it) keep it and ' +
      'write the reason on the line above — an explained cast is a test, an ' +
      'unexplained one is a hole. Related: the earlier finding that a green ' +
      'suite can pin a defect as correct.',
  ],
  [
    null,
    'Audit where the dashboard INFERS state it could record',
    'Two instances found on 2026-07-26, both wrong in the same way. (1) The ' +
      'heartbeat derived tasks_touched from "board_column !== todo", so it ' +
      'named every DONE card and announced Claude was working on SL-001–003 ' +
      'while the real work was SL-015 — the session never recorded what it ' +
      'actually touched, so the strip guessed. (2) Roadmap item statuses are ' +
      'flipped by hand when their SL cards finish; nothing derives or records ' +
      'the link, so AO1/AO2 sat at todo while all twelve of their cards were ' +
      'done with shas. A third is already in the code: the auto-QA hook ' +
      'attributes every run to whichever card happens to be in_progress ' +
      '(currentTaskCode in ops-hook-bash.mjs) rather than to what was actually ' +
      'tested. Sweep the whole surface for the pattern — a value the dashboard ' +
      'COMPUTES from a proxy when the producer could have RECORDED the fact — ' +
      'and for each one decide: record it at the source, or label it on screen ' +
      'as derived. The rule to apply: infer only what cannot be recorded, and ' +
      'say so where it shows. Candidates to check: tasks_touched, roadmap ' +
      'status, QA run attribution, "age in column" (derived from ' +
      'started_at/review_at/done_at, which SL-036 shows are themselves ' +
      'unreliable on a backward move), and the changelog task_codes link.',
  ],
  [
    null,
    'Walk the eight-step admin click-through',
    'Doc 13 section 17 has four partial items that are unit-proven but never ' +
      'exercised by a person: the /admin 404 for a non-admin, Restricted signup ' +
      'through to a joined row, a real cross-origin embed submission, and the ' +
      'roadmap card recomputing. They stay partial until someone walks them. ' +
      'Steps, in order: (1) /admin/team, add a second admin, confirm the seat ' +
      'reads "not signed in yet". (2) Confirm the last owner has no role select ' +
      'and no Revoke. (3) /admin/dev, drag a card between columns, confirm it ' +
      'survives a reload. (4) Block a card, confirm it refuses with no reason ' +
      'then accepts one. (5) /admin/applications shows the empty state. ' +
      '(6) /embed/beta inside an iframe on a FOREIGN origin renders, and any ' +
      'other route refuses framing. (7) Submit the form, it lands as new, then ' +
      'Approve and invite sends a real Clerk invitation. (8) The credit flow ' +
      'end to end: request, wrong code counts down, right code grants, SAME ' +
      'code again says already approved and /wallet shows ONE entry. ' +
      'Needs Clerk Restricted mode on, plus TURNSTILE and CLERK_WEBHOOK_SECRET ' +
      'in .env. Blocked so it stays in To reach Done rather than looking optional.',
  ],
  [
    'admin-ops',
    'Close the maker-checker bypass found by /security-review',
    'p_allow_self was a boolean parameter on ops_credit_request_verify, a ' +
      'function granted to authenticated — so the caller set it, and setting it ' +
      'true skipped the approver check as well as self-approval. A third ' +
      'active admin with a valid code was granted 250 credits in a test written ' +
      'to check the finding rather than take it on trust. Migration 16 drops ' +
      'the three-argument overload, makes not_the_approver unconditional, and ' +
      'moves the dev escape hatch to sahoda.allow_self_approve, a database ' +
      'setting no PostgREST client can write. Also: Clerk user.created now ' +
      'requires a VERIFIED primary email before binding a seat; ' +
      "ops_qa_artifact_add requires the run to be the caller's own and still " +
      'open; service-rpc.test.ts written, since the module header claimed it ' +
      'existed. Done when migration 16 is applied and packages/db ops_credits ' +
      'is green.',
  ],
  [
    'admin-ops',
    'Two charts below the board: cumulative flow and gate health',
    'Recharts, doc 08 tokens only, crimson for failures, tabular-nums. ' +
      '(1) Cumulative flow — To Do / In Progress / For Review / Done over ' +
      'time, reconstructed from ops_tasks timestamps. (2) Gate health — ' +
      'pass/fail per suite over time from ops_qa_runs. Honesty rules are part ' +
      'of the card, not polish: state the window explicitly on the chart, draw ' +
      'no trend through fewer than five points, and render a gap in the data as ' +
      'a GAP rather than a straight line between the two known points either ' +
      'side of it. No velocity chart until there is enough history for one to ' +
      'mean anything. Note: gate-health data comes from ops_qa_runs, whose ' +
      'authorship was forgeable until SL-042 — the chart is only as honest as ' +
      'that table, which is why the import path was fixed first.',
  ],
  [
    null,
    'Stand up a separate staging Supabase project before real customers',
    'There is exactly ONE Supabase project (sahodalabs, ap-south-1). Dev and ' +
      'production are the same database, which nobody had noticed until the ' +
      'maker-checker post-mortem asked whether the vulnerable function had ever ' +
      'been on production. It had: live for 3h03m, reachable through PostgREST ' +
      'by any JWT matching an active writer seat, independent of what the ' +
      'deployed app served. Nothing was exploited — zero real credit requests ' +
      'have ever existed and all 290 credit audit rows carry @example.test ' +
      'actors — but the reason was luck of timing, not isolation. Consequences ' +
      'today: every test run writes to the customer database, every migration ' +
      'is a production migration with no rehearsal, and a destructive seed has ' +
      'nothing between it and real rows. Not blocking before customers exist; ' +
      'blocking the moment one does. Scope: second project, migrations applied ' +
      'from the same history, SUPABASE_* split per Vercel environment, ' +
      'packages/db tests pointed at staging, and a check that fails loudly if ' +
      'the test DSN and the production DSN are ever the same host.',
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
