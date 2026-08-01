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
  [
    "AO3",
    "/admin shell, sub-nav, rail item",
    "Shell, sub-nav and rail item render; typecheck+lint green",
  ],
  [
    "AO3",
    "Roadmap progress card with \"To reach Done\"",
    "Roadmap card renders live: Admin Ops 30%, 3 open items",
  ],
  [
    "AO3",
    "Session pulse and gates strips",
    "Strips render live: working pulse + 5 gate chips",
  ],
  [
    "AO3",
    "Scrum board \u2014 four columns, drag, filters",
    "Board renders 39 cards in four columns with filters and QA dots",
  ],
  [
    "AO3",
    "Changelog rail with copy affordances",
    "Changelog rail live with per-entry and per-day copy",
  ],
  [
    "AO3",
    "QA console feed and filters",
    "QA console live at /admin/qa with filters and standing-failure pinning",
  ],
  [
    "AO3",
    "Manual QA composer \u2014 paste/drop screenshots, autosave",
    "Owed, not descoped. Doc 13 section 11 makes the manual composer, screenshots, 2s autosave and the sahoda_qa_v1 round-trip core to the QA console. Section 18 cut line is CSV export, copy-day/watermark, WIP nudge, session-strip label \u2014 this is not on it. Deferred for time on 2026-07-27 and marked blocked deliberately so it stays in To reach Done. P4/SL-031 must not close while this is open.",
  ],
  [
    "AO3",
    "QA JSON export and import (sahoda_qa_v1)",
    "Owed, not descoped. Doc 13 section 11 makes the manual composer, screenshots, 2s autosave and the sahoda_qa_v1 round-trip core to the QA console. Section 18 cut line is CSV export, copy-day/watermark, WIP nudge, session-strip label \u2014 this is not on it. Deferred for time on 2026-07-27 and marked blocked deliberately so it stays in To reach Done. P4/SL-031 must not close while this is open.",
  ],
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
    "Add CI: run the gate and smoke on every pull request",
    "There is no CI at all \u2014 .github holds one issue template, and the Stop hook is the only thing standing between a broken commit and main. Smoke cannot go in the Stop hook: Playwright boots its own dev server (~8s cold) and global-setup fetches a Clerk testing token, so it would add 60-120s to every stop AND hard-fail the credential-free cloud sandbox that teammates use, where a non-technical user cannot recover. A workflow file runs the same checks once per PR instead of once per stop. Needs Clerk test and Supabase secrets in GitHub; gate the live-DB suites on their env flags so a fork PR without secrets still reports honestly rather than red. MUST ALSO HANDLE SL-046: turbo typecheck does not depend on build, so on a fresh CI checkout (no .next) typedRoutes validation is meaningless \u2014 the CI config has to build before typecheck or it inherits the trap. See also SL-047 (/ returns 404) for the smoke matrix.",
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
    "admin-ops",
    "Two charts below the board: cumulative flow and gate health",
    "ORIGINAL ASK: Recharts, doc 08 tokens only, crimson for failures, tabular-nums. (1) Cumulative flow \u2014 To Do / In Progress / For Review / Done over time, reconstructed from ops_tasks timestamps. (2) Gate health \u2014 pass/fail per suite over time from ops_qa_runs. Honesty rules are part of the card, not polish: state the window explicitly on the chart, draw no trend through fewer than five points, and render a gap in the data as a GAP rather than a straight line between the two known points either side of it. No velocity chart until there is enough history for one to mean anything. Note: gate-health data comes from ops_qa_runs, whose authorship was forgeable until SL-042 \u2014 the chart is only as honest as that table, which is why the import path was fixed first.\n\nDECIDED 2026-07-30, approved by DIVAS \u2014 do NOT 'fix' this back to Recharts. Two grounds. (1) The repo already carries a hand-rolled SVG chart pattern with an explicit rationale in components/home/spend-area.tsx: 'no chart library, by design'. Adding one contradicts a standing decision and touches pnpm-lock, which has caused two outages. (2) Every fill is an L1 Brand Skin token (--t100/--t300/--p/--pstrong), so both charts re-theme with the workspace for free; a library's config object needs a per-theme branch kept in sync by hand.\n\nTwo calls inside that, also deliberate. The four board columns are an ORDERED sequence, not four categories, so they take one hue light-to-dark rather than four hues \u2014 truer to the data and colour-blind safe by construction, because lightness separates where hue would not. And gate health is a GRID OF DAY CELLS, not a line chart, because that makes the gap rule physical: there is no line that could be joined across a week nobody tested. A line chart would make the most dangerous failure mode a one-character change.\n\nIf a future session still wants Recharts, the data layer (flow-history.ts, gate-history.ts) is separate and fully tested, so the swap is contained \u2014 but read this first.",
  ],
  [
    null,
    "Stand up a separate staging Supabase project before real customers",
    "TOP OF THE OPEN LIST, promoted 2026-07-30 by DIVAS: blocking NOW, not 'when a customer exists'. There are already 26 real workspaces and 17 real users on this database.\n\nThere is exactly ONE Supabase project (rloztdhzfliyvpvxsgjl, ap-south-1) serving local dev, CI, Vercel previews and production at once. Three symptoms, one cause: (a) local tests reached production through a blanked env var (R-01); (b) every migration is a production migration with no rehearsal; (c) every PREVIEW deployment reads and writes the live database \u2014 each of the five Supabase vars is a single Vercel row scoped 'Preview, Production' \u2014 while TEAM_ONBOARDING.md tells non-technical teammates that visual checks happen on preview URLs. A teammate clicking a preview can spend real credits, and credit_ledger is append-only so those debits are permanent.\n\nCOST, measured 2026-07-30 against org 'sahoda', not estimated: a second PROJECT is $0/month; a persistent BRANCH is $0.01344/hour (~$9.80/month). A standing staging project is cheaper AND simpler than branching. Cost was never the obstacle \u2014 nobody had checked.\n\nFULL PLAN \u2014 what moves, what breaks in the interim, and the done-when: docs/audit/2026-07-30-staging-project-plan.md\n\nHeadline of it: create sahoda-staging in ap-south-1, replay all 23 migrations onto it (that replay is the rehearsal we have never had), seed ops_* only and NO customer data, then split each of the five Vercel Supabase vars into Preview\u2192staging and Production\u2192prod. That split is what actually closes SL-049. Point local .env at staging, move preview onto the Clerk dev instance, and flip the R-01 guard from 'abort if target is prod' to 'assert target is staging'.\n\nDONE WHEN a preview provably cannot reach production \u2014 verified by reading a row on preview that exists only in staging, not by inspecting config. SL-049 closes with this card.",
  ],
  [
    null,
    "Admin console design-guard drift \u2014 16 contrast + 4 eyebrow files",
    "wt-admin branched before the v3 readability/typography guards landed on wt-web (8ea9155) and was never run against them; the 2026-07-28 trunk merge is the first time they met. 16 files paint content text with --ink-faint (~2.5:1 against a 4.5:1 floor) and 4 hand-roll an eyebrow instead of type-eyebrow. Recorded as debt in apps/web/src/lib/design/{ink-faint,eyebrow}-exceptions.ts with per-file counts, dates and this card; debt-ratchet.test.ts caps the registers so they can only shrink. Fix = text-faint -> text-muted, hand-rolled eyebrow -> type-eyebrow, then DELETE each entry and lower the ratchet baseline. Week 1 chore, not launch scope (docs/audit/2026-07-27/03-30-day-plan.md 7).",
  ],
  [
    null,
    "Quarantined flaky test \u2014 media-pane focus restoration",
    "INTERMITTENT, not consistent: passes 15/15 alone, failed 1 of 3 full apps/web runs (1,816 tests) on the trunk merge. Untouched by the merge (empty diff vs 88b081a), so pre-existing flake surfaced by the larger merged suite. Assertion is toHaveFocus() after an async in-flight disable; under parallel load the restore-focus effect can land after the assertion. Skipped with test.skip and a QUARANTINED-FLAKY label so it stays VISIBLE in run output \u2014 this suite is about to become a required CI status check and a silently-inherited flake makes the signal untrustworthy. Fix = await the focus restoration deterministically, or fix the component if the race is real, then un-skip.",
  ],
  [
    null,
    "CI must not typecheck against stale build artifacts",
    "turbo.json's `typecheck` task declares dependsOn ['^typecheck'] only \u2014 it does NOT depend on `build`. apps/web sets typedRoutes:true, so Next generates .next/types/routes.d.ts at BUILD time; typecheck therefore validates against whatever artifacts happen to be on disk. Observed 2026-07-28: immediately after the wt-admin merge, typecheck reported 7 RouteImpl errors on /admin/* purely because the route manifest predated those routes; `turbo run build --force` regenerated it and typecheck went green with zero code changes. A fresh CI checkout has NO .next at all, so CI will either fail spuriously or \u2014 worse \u2014 pass while validating nothing. FIX: make the gate run build before typecheck (or add dependsOn ['^build'] to the typecheck task) and prove it on a clean clone. MUST be handled in the CI config or CI inherits the trap. Blocks//informs SL-033.",
  ],
  [
    null,
    "LAUNCH-BLOCKING: / returns 404 in production \u2014 bare domain has no landing or sign-in",
    "Measured 2026-07-28: https://sahodalabs.vercel.app/ -> 404, and the same on the trunk preview, so it is PRE-EXISTING and not caused by the wt-admin merge. apps/web/src/app has route groups (app)/(auth)/(onboarding) but no root page.tsx, so Next serves its default 404 to anyone typing the bare domain. /sign-in returns 200, so the app works \u2014 you just cannot arrive at it. Out of Phase 2 scope (reconciliation), but launch-blocking: the first thing a design partner or a payment provider's reviewer does is open the domain. FIX: a root page that redirects signed-out visitors to /sign-in and signed-in ones to /home, or a real landing page. Also add a probe for / to the CI smoke matrix so it cannot regress silently.",
  ],
  [
    null,
    "OPS_INGEST_URL absent from Vercel \u2014 ops sync route ships non-functional",
    "Found 2026-07-28 during the Phase 3 pre-flight. The wt-admin merge added OPS_INGEST_URL to turbo.json's @sahoda/web#build env allowlist, but the variable does not exist in ANY Vercel environment (verified: vercel env ls shows 46 vars, this is not among them). The ops sync path reads it, so that path is deployed and non-functional. Not launch-blocking \u2014 the ops console is frozen scope and the sync is an internal convenience \u2014 but it is a declared dependency with no value behind it, which is the same class of half-landed change as SENTRY_ORG/PROJECT/AUTH_TOKEN (declared in turbo by ba32a3f, never set in Vercel, so production stack traces are still minified and no build complains). FIX: set the value in Vercel, or delete it from the allowlist so the declaration stops asserting a dependency that is not real. Do it AFTER the Phase 3 soak, one variable at a time.",
  ],
  [
    null,
    "DANGER: preview deployments write to the PRODUCTION database, and onboarding tells teammates to click them",
    "Verified 2026-07-28 by vercel env ls: every Supabase variable (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, SUPABASE_PROJECT_REF) exists as exactly ONE row scoped 'Preview, Production' \u2014 a single shared value, no preview override. There is also only one Supabase project in the account (rloztdhzfliyvpvxsgjl), so there is nothing else a preview could point at. Every preview deployment therefore reads and WRITES the live database holding 26 real workspaces and 17 real users. The harm is not theoretical: docs/TEAM_ONBOARDING.md instructs non-technical teammates that 'visual checks happen on the Vercel preview URL', and CLAUDE.md repeats it for cloud bug-fix sessions. A teammate clicking through a preview to check a fix can spend real credits (credit_ledger is append-only \u2014 those debits are permanent), create real posts, sites and themes, and mutate a paying customer's workspace. Note the irony recorded in the same session: the R-01 forbidden-target guard now REFUSES to let an automated test touch this database, while a human is actively directed at it through a preview. FIX (two parts, both needed): (1) create a preview-scoped Supabase project or branch and re-scope the five variables so Preview and Production no longer share values; (2) until (1) lands, add an explicit warning line to TEAM_ONBOARDING.md and apps/web CLAUDE.md stating that preview writes to live customer data and that teammates must not perform credit-spending or content-creating actions there.\n\nROOT CAUSE IS SL-043 (one Supabase project). This card is the sharpest symptom \u2014 preview deployments writing to the live database while onboarding sends teammates there. It closes when SL-043's Vercel env split lands; do not fix it separately.",
  ],
  [
    null,
    "100 test files have never executed \u2014 five packages have no vitest config",
    "`packages/shared` (7 files), `billing` (19), `mesh` (14), `publishing` (8) and `sites` (52) have no `vitest.config.*` or `vite.config.*`, and there is no workspace or projects key. Each falls back to the repo-root config, whose `include` is `['scripts/**/*.test.mjs']`, resolved against the package as root \u2014 matching nothing, since every test lives under `src/`. Their script is `vitest run --passWithNoTests`, which turns \"found nothing\" into exit 0. Only `packages/db`, `apps/web` and `apps/jobs` have ever run anything. All five also still carry `lint: exit 0` (SL-033, live). BLOCKS SLICE A: `packages/billing` holds 19 unrun test files and the payment slice lives there. Task 0.4a. Scope the failures before fixing \u2014 switching this on after six weeks may reveal a lot.",
  ],
  [
    null,
    "The QA evidence hook counts skipped tests as passed",
    "`scripts/lib/ops-classify.mjs:132-135` \u2014 `countsFor()` has a regex for `passed` and one for `failed` and NONE for `skipped`. Vitest prints `Tests 71 passed | 202 skipped (273)`; the 202 is invisible. A run where 202 database tests never executed was recorded as \"the checks ran and everything passed.\" Contributing factor at `:166`: `stripAnsi(output).slice(-4000)` keeps only the tail, so the skip lines never reach the classifier and `apps/web`'s count gets attributed to a suite labelled typecheck. Fix: add `skipped: sum(/(\\d+)\\s+skipped/i)` and make the summary sentence at `:189` conditional on it being zero. Note the shape of the bug \u2014 the function was hardened three times against UNDERSTATING success, with a comment at `:43-44` saying understatement \"is its own kind of dishonesty,\" and nobody asked whether a test that never ran should count as one that passed. Direct violation of doc 15 \u00a72 rule 3.",
  ],
  [
    null,
    "BACKLOG: board.json encoding churn makes board diffs unreviewable",
    "BACKLOG (see the note on columns below). `scripts/lib/ops-state.mjs:56-60` writes state as raw UTF-8 via `JSON.stringify(value, null, 2)`; an older writer produced ASCII-escaped `\\uXXXX`. Every `writeState('board', \u2026)` re-encodes the whole file \u2014 commit `8f9a0db` shows 63 insertions / 63 deletions of which only 8 lines are real content. RULING: raw UTF-8 is the committed form, because `:48-54` documents that the current encoding deliberately matches Prettier's output so the formatter's rewrite is a no-op. Reverting to escapes would be flipped back by the next hook run. Remaining work: confirm no other writer produces escapes, and add an assertion to the board resolver.",
  ],
  [
    null,
    "BACKLOG: p_storage_path validated only in the application layer",
    "BACKLOG (see the note on columns below). `ops_qa_artifact_add` accepts any text for `p_storage_path`; the `qa/<runId>/` prefix is enforced only at `apps/web/src/lib/ops/ops-qa.ts:209`. The RPC is granted to `authenticated`, so a PostgREST caller can pass an arbitrary path. NOT privilege escalation \u2014 the run must be the caller's own and still running (`ops_credit_self_approve_gate.sql:197`), and the bucket policy is admin-only, so nothing becomes readable that was not. Data-integrity wrinkle only. Flagged because the same migration argues eight lines earlier at `:185-186` that validation living only in the application \"disappears the first time somebody calls storage directly\" \u2014 reasoning that applies verbatim here and was not applied.",
  ],
  [
    null,
    "Production was down 22h40m \u2014 the recreated Vercel project could not build main",
    "REWRITTEN 1 Aug against verified evidence only; the original detail was inferred from measurements since withdrawn (wrong host, an SSO gate read as a broken build, probes sent with `Accept: */*`). PROVED: the recreated Vercel project built `main`, which on the new remote is a single \"Initial commit\" of 490 files. Its `turbo.json` has NO `@sahoda/web#build` task at all and an empty `globalEnv`, so Turborepo 2 strict mode declared nothing and stripped ~36 server variables \u2014 CLERK_SECRET_KEY, every SUPABASE_*, TOKEN_VAULT_KEY. The build FAILED (`Tasks: 0 successful` \u00b7 `exited (1)`), all three attempts ERRORed, and not one request ever reached a `main` build. So there was no production deployment at all and Vercel's edge answered DEPLOYMENT_NOT_FOUND before any application code ran. Secrets were set correctly; the branch was too old to declare them. Down from between 19:01 and 19:29 IST on 30 July (old project destroyed \u2014 exact moment died with it) to ~18:05 IST on 31 July. Fixed by a CLI deploy from wt-web at 17:47 plus disabling ssoProtection. Gate: `pnpm probe:prod`. STILL OPEN pending founder sign-in verification.",
  ],
  [
    null,
    "BACKLOG: Infrastructure that hosts production is founder-approval-only",
    "BACKLOG (see the note on columns below). On 30 July the GitHub repository and the Vercel project were deleted and recreated without founder approval. This destroyed the rollback target for every merge in flight and caused ~22h40m of downtime for 17 users. Rule, effective immediately: the Vercel project, the GitHub repository and the Supabase project may not be deleted, recreated or re-linked without an explicit founder message. Not an assumption, not an inference from a plan. This is the most irreversible class of action in the stack and it sits alongside the non-negotiables in doc 15 \u00a72. Extended 31 July: production actions run in ONE NAMED SESSION AT A TIME \u2014 a second session deployed at 17:47 IST while P0 was being diagnosed, and for twenty minutes two sessions held contradictory beliefs about whether production was deployed.",
  ],
  [
    null,
    "BACKLOG: Rollback targets must be re-asserted immediately before the push",
    "BACKLOG (see the note on columns below). Every push plan in this project ended with a named, verified rollback target \u2014 `dpl_8te1K3q\u2026`, `isRollbackCandidate: true`. It now returns 410 GONE. The safety architecture of several sessions rested on an artifact verified once, at one moment, that nothing re-checked and that a project deletion evaporated. A rollback target is only as durable as the project hosting it. Process change: re-assert the target exists and is promotable in the same session as the push, not in the plan that precedes it. Assert on the response body, not the status.",
  ],
  [
    null,
    "The repository is public",
    "`development156/sahodalabs` is public. Secret scan across all refs came back clean: no real `.env` has ever been committed, and every hit for `SUPABASE_SERVICE_ROLE`, `CLERK_SECRET_KEY`, `sk_`+64hex, `CASHFREE`, `OPENROUTER` and `DEVOPS_INGEST_TOKEN` is an empty `.env.example` key or a test fixture. What is exposed is the production Supabase project ref across 10 files and 8 audit documents \u2014 a map, not keys. Access still requires the anon key plus a valid Clerk JWT, or the service-role key; neither is in the repo. 0 forks, 0 stars, so privatising is still effective rather than symbolic. DOWNGRADED from emergency to routine. No rotation required. Partly mitigated 31 July: .gitignore now carries `.vercel` and `.env*`.",
  ],
  [
    null,
    "Confirm WHY push-to-deploy works, and pin it",
    "REWRITTEN 1 Aug. The original premise \u2014 \"pushing to trunk does not deploy until Vercel's production branch is corrected\" \u2014 is FALSE as of 31 July. Two pushes to `wt-web` each produced a git-sourced deployment with `target: production` that claimed `sahodalabs.vercel.app` (`dpl_EB5EmZ5J`, `dpl_HGxjuCHx`). So push-to-deploy works. What is NOT established is why: Vercel's production branch has three modes \u2014 the `main` branch, the repository's default branch, or a custom branch \u2014 and GitHub's default is now `wt-web`, so \"repository's default branch\" would resolve correctly. Nobody has read the Settings \u2192 Git page to confirm which mode is set. Close this once that page has been read after a hard refresh AND a push to `wt-web` has produced a production deployment (the latter is already twice true). If the mode is literal `main`, the two successful deploys need a different explanation and this card becomes urgent again.",
  ],
  [
    null,
    "The middleware layer has never been tested against a running server",
    "`middleware.test.ts:78` asserts `/`, `/home`, `/wallet`, `/planner`, `/posts` and `/connections` are protected. 17/17 green, mutation-tested on 28 July \u2014 and blind to how those routes actually behave, because that suite READS SOURCE and asserts on its shape (`expect(code).toContain(...)`). It can prove the code says the right thing, never that it does it, because no server ever runs. The middleware gap documented on 26 July was theoretical; on 31 July it shipped. Tier 1 DONE (SL-059a, `pnpm probe:prod`): six routes, browser navigation headers, judged on where the redirect CHAIN ends \u2014 16 unit tests, and it caught two bugs in itself before running once. Tier 2 (`next build && next start` integration tests in CI, 1-2 days) and Tier 3 (Playwright against a preview, 2-3 days, blocked on SL-043) remain. DO NOT close this by adding another source-assertion test \u2014 the existing one is correct and proved nothing.",
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
