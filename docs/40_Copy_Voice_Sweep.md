# 40 · Copy voice sweep (`wt-voice`)

**Run 2026-08-23** against `.agents/skills/humanizer` and the founder's ruling that the em
dash and the en dash leave user-facing prose. The ruling, its three exceptions and the
four rules that outrank the skill are recorded in CLAUDE.md "Copy style"; this file is the
evidence behind them.

Every entry below is a real replacement taken from the applier's own ledger, not a
reconstruction. `n` is how many times that exact string occurred.

## Totals

| | |
| --- | --- |
| replacements applied | 649 |
| distinct sentences rewritten | 461 |
| source files touched | 287 |
| test assertions retargeted | 22 across 20 files |
| dashes deliberately kept | 12 |

How each dash was resolved: 517 became a full stop, 74 a comma, 32 a colon, 10 a pair of
parentheses, and 16 needed the sentence restructured.

## Every changed string


### `apps/web/src/app/(app)/ads/budget/page.tsx`

- **before**: `and the ad it belongs to — the same way your credit history already works, and for the same reason.`
  **after**: `and the ad it belongs to, the same way your credit history already works and for the same reason.`
- **before**: `empty="No spend — Sahoda cannot spend on your behalf yet.`
  **after**: `empty="No spend. Sahoda cannot spend on your behalf yet.`

### `apps/web/src/app/(app)/ads/creative/page.tsx`

- **before**: `label="What you want them to do — the platform picks from a fixed list"`
  **after**: `label="What you want them to do. The platform picks from a fixed list"`
- **before**: `note: 'No picture at all — a headline and one line under it.',`
  **after**: `note: 'No picture at all. A headline with one line under it.',`
- **before**: `refusal gate your posts already pass — an ad that Sahoda would not let you publish for free`
  **after**: `refusal gate your posts already pass. An ad that Sahoda would not let you publish for free`
- **before**: `what="A headline and a body per placement — not one caption stretched over four shapes."`
  **after**: `what="A headline and a body for each placement. Not one caption stretched over four shapes."`

### `apps/web/src/app/(app)/ads/page.tsx`

- **before**: `Everything that looks like a control does not — there is no ad account, no bid and no spend behind any of it.`
  **after**: `Everything that looks like a control does not. There is no ad account, no bid and no spend behind any of it.`
- **before**: `empty="No ad campaigns — Sahoda cannot run one yet.`
  **after**: `empty="No ad campaigns. Sahoda cannot run one yet.`
- **before**: `for every placement — the same rule your posts already follow across channels.`
  **after**: `for every placement. That is the same rule your posts already follow across channels.`

### `apps/web/src/app/(app)/ads/performance/page.tsx`

- **before**: `That is the column this screen will sit beside — and it is the reason paid results here will be worth more`
  **after**: `That is the column this screen will sit beside. It is also the reason paid results here will be worth more`
- **before**: `empty="No results — no ad has run.`
  **after**: `empty="No results. No ad has run.`

### `apps/web/src/app/(app)/ads/targeting/page.tsx`

- **before**: `and move it as you drag the radius — it is convincing, it is the thing people budget against`
  **after**: `and move it as you drag the radius. It is convincing, it is the thing people budget against`

### `apps/web/src/app/(app)/analytics/page.tsx`

- **before**: `The rest are listed as not loaded — open a post to read its own.`
  **after**: `The rest are listed as not loaded. Open a post to read its own.`
- **before** ×2: `there is nothing to measure — which is different from measuring nothing.`
  **after**: `there is nothing to measure. That is different from measuring nothing.`

### `apps/web/src/app/(app)/approvals/page.tsx`

- **before**: `That is a real answer — not a screen that has yet to load.`
  **after**: `That is a real answer. It is not a screen that has yet to load.`

### `apps/web/src/app/(app)/assets/page.tsx`

- **before**: ` — the list did not come back.`
  **after**: `. The list did not come back.`

### `apps/web/src/app/(app)/brain/knowledge/page.tsx`

- **before**: ` — the list did not come back.`
  **after**: `. The list did not come back.`
- **before**: ` — there is simply nowhere `
  **after**: `. There is simply nowhere `

### `apps/web/src/app/(app)/brain/page.tsx`

- **before**: ` — reload to try again.`
  **after**: `. Reload to try again.`
- **before**: ` — there is simply no `
  **after**: `. There is simply no `
- **before**: `tip="You approve and correct what it resolves — you never start from a blank form."`
  **after**: `tip="You approve and correct what it resolves. You never start from a blank form."`

### `apps/web/src/app/(app)/brain/resolve/page.tsx`

- **before**: ` — reload to try again.`
  **after**: `. Reload to try again.`
- **before**: ` — there is simply nothing `
  **after**: `. There is simply nothing `
- **before**: `What is left are the fields Sahoda is meant to draft — how you sound, how formal to be, which phrases are yours.`
  **after**: `What is left are the fields Sahoda is meant to draft: how you sound, how formal to be, which phrases are yours.`
- **before**: `are things only you can actually know — what your customers fear, what Sahoda must never say, what you promise.`
  **after**: `are things only you can actually know: what your customers fear, what Sahoda must never say, what you promise.`
- **before**: `rewrites all {tally.registered} fields — including every one you have already confirmed.`
  **after**: `rewrites all {tally.registered} fields, including every one you have already confirmed.`

### `apps/web/src/app/(app)/campaigns/[id]/page.tsx`

- **before**: `Adding posts now would be working blind — some may already be in.`
  **after**: `Adding posts now would be working blind. Some may already be in.`
- **before**: `Every channel publishes on its own — a column can be out while another is still waiting.`
  **after**: `Every channel publishes on its own. A column can be out while another is still waiting.`
- **before**: `It did not come back this time. Reload — the campaign has not gone anywhere.`
  **after**: `It did not come back this time. Reload. The campaign has not gone anywhere.`

### `apps/web/src/app/(app)/campaigns/page.tsx`

- **before**: `Nothing moves a campaign between stages on its own — you set the stage when you are ready.`
  **after**: `Nothing moves a campaign between stages on its own. You set the stage when you are ready.`
- **before**: `Reload — this is not a sign that you have none, and making a new one would not help.`
  **after**: `Reload. This is not a sign that you have none, and making a new one would not help.`
- **before**: `body="A campaign is a named push — Diwali week, a new menu — that a handful of posts belong to`
  **after**: `body="A campaign is a named push (Diwali week, a new menu) that a handful of posts belong to`

### `apps/web/src/app/(app)/connections/page.tsx`

- **before**: ` — there is simply nothing `
  **after**: `. There is simply nothing `

### `apps/web/src/app/(app)/leads/page.tsx`

- **before**: `The embed code appears once you have a site — it names which site the enquiry belongs to.`
  **after**: `The embed code appears once you have a site. It names which site the enquiry belongs to.`
- **before**: `This is not the same as having no enquiries — reloading is worth a try.`
  **after**: `This is not the same as having no enquiries. Reloading is worth a try.`
- **before**: `a captcha widget inside the generated page — a plain HTML form cannot carry a token, and an enquiry endpoint without one would be open to anybody.`
  **after**: `a captcha widget inside the generated page. A plain HTML form cannot carry a token, and an enquiry endpoint without one would be open to anybody.`
- **before**: `they land here — with what they said and what to do next.`
  **after**: `they land here, with what they said and what to do next.`

### `apps/web/src/app/(app)/loop/page.tsx`

- **before**: `'It had nothing to reflect on — no post of yours has been measured yet, so there was nothing to learn from.'`
  **after**: `'It had nothing to reflect on. No post of yours has been measured yet, so there was nothing to learn from.'`
- **before**: `Try again in a moment — your cycle and its settings are unchanged.`
  **after**: `Try again in a moment. Your cycle and its settings are unchanged.`
- **before** ×2: `sub="A weekly cycle that plans, writes, tests and reports — as far as you let it go on its own."`
  **after**: `sub="A weekly cycle that plans, writes, tests and reports, as far as you let it go on its own."`

### `apps/web/src/app/(app)/not-found.tsx`

- **before**: `tell us — that one is ours to fix.`
  **after**: `tell us. That one is ours to fix.`

### `apps/web/src/app/(app)/planner/page.tsx`

- **before**: ` — there is simply no `
  **after**: `. There is simply no `
- **before**: `most recently updated posts — older ones may not be on this page.`
  **after**: `most recently updated posts. Older ones may not be on this page.`
- **before**: `tip="Add goals first if you have a push this week — the plan bends toward them."`
  **after**: `tip="Add goals first if you have a push this week. The plan bends toward them."`

### `apps/web/src/app/(app)/playbooks/page.tsx`

- **before**: `. Yours is currently <span className="text-ink">{ladder?.name}</span> —{' '} ⏎               {ladder?.may.toLowerCase()}`
  **after**: `. Yours is currently <span className="text-ink">{ladder?.name}</span>.{' '} ⏎               {ladder?.may}`

### `apps/web/src/app/(app)/posts/[id]/page.tsx`

- **before**: ` — there is simply nowhere `
  **after**: `. There is simply nowhere `

### `apps/web/src/app/(app)/posts/page.tsx`

- **before**: ` — there is simply nowhere `
  **after**: `. There is simply nowhere `
- **before**: `most recently updated posts — older ones may not be on this page.`
  **after**: `most recently updated posts. Older ones may not be on this page.`

### `apps/web/src/app/(app)/radar/page.tsx`

- **before**: `then tells you what moved — a new offer, a price that changed, a posting rhythm that shifted — and what your own brand would say back.`
  **after**: `then tells you what moved (a new offer, a price that changed, a posting rhythm that shifted) and what your own brand would say back.`

### `apps/web/src/app/(app)/report/page.tsx`

- **before**: `'Nothing — there was nothing to learn from. No post of yours has been measured,`
  **after**: `'Nothing. There was nothing to learn from. No post of yours has been measured,`
- **before**: `? ' — scheduled, waiting for your approval' ⏎                       : ' — a draft in your Planner'`
  **after**: `? ' · scheduled, waiting for your approval' ⏎                       : ' · a draft in your Planner'`
- **before**: `` — version ${learning.appliedVersion}``
  **after**: `` (version ${learning.appliedVersion})``
- **before**: `so there is no best and worst to name — with one post, the same post is both.`
  **after**: `so there is no best and worst to name. With one post, the same post is both.`

### `apps/web/src/app/(app)/settings/integrations/page.tsx`

- **before**: `Nothing failed — there is nothing to connect to until one exists.`
  **after**: `Nothing failed. There is nothing to connect to until one exists.`

### `apps/web/src/app/(app)/settings/page.tsx`

- **before**: ` — there is simply nothing `
  **after**: `. There is simply nothing `

### `apps/web/src/app/(app)/settings/plan/page.tsx`

- **before**: ` — reload to try again.`
  **after**: `. Reload to try again.`
- **before**: ` — this is not a zero.`
  **after**: `. This is not a zero.`

### `apps/web/src/app/(app)/sites/page.tsx`

- **before**: `Couldn&rsquo;t check your sites just now — reload before generating.`
  **after**: `Couldn&rsquo;t check your sites just now. Reload before generating.`
- **before**: `Nothing failed — and nothing has been charged.`
  **after**: `Nothing failed and nothing has been charged.`
- **before**: `generate again — you were only ever charged for drafts that saved.`
  **after**: `generate again. You were only ever charged for drafts that saved.`

### `apps/web/src/app/(app)/studio/page.tsx`

- **before**: `note="From your library, from your phone, or generated — dropped into a slot that already knows its crop."`
  **after**: `note="From your library, from your phone, or generated, then dropped into a slot that already knows its crop."`
- **before**: `sub="Make the picture, not just the caption — templates that already know your colours, your type and your logo."`
  **after**: `sub="Make the picture, not just the caption. Templates that already know your colours, your type and your logo."`

### `apps/web/src/app/(app)/wallet/page.tsx`

- **before**: ` — reload to try again.`
  **after**: `. Reload to try again.`
- **before**: ` — there is simply no `
  **after**: `. There is simply no `
- **before**: `tip="A hold is credits reserved while an action runs — if the action fails, they come back and you are not charged."`
  **after**: `tip="A hold is credits reserved while an action runs. If the action fails, they come back and you are not charged."`

### `apps/web/src/app/(onboarding)/error.tsx`

- **before**: ` — if it keeps happening, contact support.`
  **after**: `. If it keeps happening, contact support.`

### `apps/web/src/app/actions/approvals.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/assets.ts`

- **before**: ` — reload and try again.`
  **after**: `. Reload and try again.`
- **before**: ` — reload to confirm.`
  **after**: `. Reload to confirm.`
- **before** ×6: ` — try again.`
  **after**: `. Try again.`
- **before**: `against the channel limits — add it again.`
  **after**: `against the channel limits. Add it again.`

### `apps/web/src/app/actions/billing.ts`

- **before**: ` — check the 15 characters`
  **after**: `. Check the 15 characters`
- **before**: ` — nothing was charged.`
  **after**: `. Nothing was charged.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/brain-resolve-fields.ts`

- **before**: ` — reload and try again.`
  **after**: `. Reload and try again.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/brand-field.ts`

- **before**: ` — reload and try again.`
  **after**: `. Reload and try again.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/brand-resolve.ts`

- **before**: ` — reload to confirm.`
  **after**: `. Reload to confirm.`
- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'That Brand Brain is incomplete — check the cards and retry.'`
  **after**: `'That Brand Brain is incomplete. Check the cards and retry.'`

### `apps/web/src/app/actions/campaigns.ts`

- **before**: ` — reload to confirm.`
  **after**: `. Reload to confirm.`
- **before** ×6: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/connections.ts`

- **before**: ` — reload and try again.`
  **after**: `. Reload and try again.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/erase-workspace.ts`

- **before**: ` — if it keeps happening, write to support@sahodalabs.com.`
  **after**: `. If it keeps happening, write to support@sahodalabs.com.`
- **before**: `Write to support@sahodalabs.com — this one needs a person.`
  **after**: `Write to support@sahodalabs.com. This one needs a person.`

### `apps/web/src/app/actions/inbox-send.ts`

- **before** ×3: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/inbox.ts`

- **before** ×4: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/knowledge.ts`

- **before** ×5: ` — try again.`
  **after**: `. Try again.`
- **before**: `Nothing has changed in your Brand Brain — each one is waiting for you to agree with it.`
  **after**: `Nothing has changed in your Brand Brain. Each one is waiting for you to agree with it.`
- **before**: `Sahoda has kept what it already learned from it — ${brandFields}`
  **after**: `Sahoda has kept what it already learned from it. ${brandFields}`
- **before**: `That is an honest outcome — a menu of prices says a lot about what you sell`
  **after**: `That is an honest outcome. A menu of prices says a lot about what you sell`
- **before**: `This is not a claim that it is empty — the read did not come back.`
  **after**: `This is not a claim that it is empty. The read did not come back.`
- **before**: `message: `Read and indexed — ${chunked.chunks.length}`
  **after**: `message: `Read and indexed. That is ${chunked.chunks.length}`

### `apps/web/src/app/actions/leads.ts`

- **before** ×4: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/loop-controls.ts`

- **before**: ` — check the new total.`
  **after**: `. Check the new total.`
- **before** ×6: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/loop-create.ts`

- **before**: ` — nothing has been spent.`
  **after**: `. Nothing has been spent.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/loop-cycle.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: ` — you were not charged.`
  **after**: `. You were not charged.`

### `apps/web/src/app/actions/loop-dial.ts`

- **before** ×4: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/onboarding-resolve.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'Showing a sample Brand Brain — the model could not be reached,`
  **after**: `'Showing a sample Brand Brain. The model could not be reached,`

### `apps/web/src/app/actions/ops-board.ts`

- **before**: `'Say what is blocking it — a blocked card needs a reason.'`
  **after**: `'Say what is blocking it. A blocked card needs a reason.'`

### `apps/web/src/app/actions/ops-credits.ts`

- **before**: `'Pick a different admin to approve this — you cannot approve your own request.'`
  **after**: `'Pick a different admin to approve this. You cannot approve your own request.'`
- **before**: `This request is closed — ask for a new one.`
  **after**: `This request is closed. Ask for a new one.`
- **before**: `but nobody can approve it — deny it and try again once email works.`
  **after**: `but nobody can approve it. Deny it and try again once email works.`

### `apps/web/src/app/actions/ops-qa.ts`

- **before**: `'Screenshots only — PNG, JPEG or WebP, up to 10 MB.'`
  **after**: `'Screenshots only. PNG, JPEG or WebP, up to 10 MB.'`

### `apps/web/src/app/actions/ops-reset.ts`

- **before**: `'Reset is not available yet — the ops_workspace_reset function has not been applied to this database.'`
  **after**: `'Reset is not available yet. The ops_workspace_reset function has not been applied to this database.'`

### `apps/web/src/app/actions/ops-team.ts`

- **before**: `The seat was created but the invitation did not send — ${invited.message}`
  **after**: `The seat was created but the invitation did not send. ${invited.message}`

### `apps/web/src/app/actions/plan-week.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/planner.ts`

- **before**: ` — reload to confirm.`
  **after**: `. Reload to confirm.`
- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `from its current state — reload to see where it is.`
  **after**: `from its current state. Reload to see where it is.`

### `apps/web/src/app/actions/playbook-controls.ts`

- **before**: ` — check the new total.`
  **after**: `. Check the new total.`
- **before** ×4: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/playbook-run.ts`

- **before**: ` — nothing has been spent.`
  **after**: `. Nothing has been spent.`
- **before** ×2: ` — try again.`
  **after**: `. Try again.`
- **before**: `'This playbook is already running — look below for its preview.'`
  **after**: `'This playbook is already running. Look below for its preview.'`
- **before**: ``Not yet — this one still needs ${recipe.blocker}.``
  **after**: ``Not yet. This one still needs ${recipe.blocker}.``

### `apps/web/src/app/actions/playbooks.ts`

- **before** ×2: ` — try again.`
  **after**: `. Try again.`
- **before**: `'Check the fields — something there is not filled in yet.'`
  **after**: `'Check the fields. Something there is not filled in yet.'`
- **before** ×2: ``Not yet — this one still needs ${recipe.blocker}.``
  **after**: ``Not yet. This one still needs ${recipe.blocker}.``

### `apps/web/src/app/actions/posts-ai.ts`

- **before** ×2: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/posts-crop.ts`

- **before**: ` — reload and try again.`
  **after**: `. Reload and try again.`
- **before** ×2: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/posts-image.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/posts-media.ts`

- **before**: ` — reload to confirm.`
  **after**: `. Reload to confirm.`
- **before** ×4: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/posts-publish.ts`

- **before** ×2: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/posts-schedule.ts`

- **before** ×3: ` — try again.`
  **after**: `. Try again.`
- **before**: `'This post is already going out — you can’t change its time now.'`
  **after**: `'This post is already going out. You can’t change its time now.'`

### `apps/web/src/app/actions/posts.ts`

- **before**: ` — reload and try again.`
  **after**: `. Reload and try again.`
- **before** ×2: ` — reload to confirm.`
  **after**: `. Reload to confirm.`
- **before** ×5: ` — try again.`
  **after**: `. Try again.`
- **before**: `'This post has already been published or closed — its time can’t be changed.'`
  **after**: `'This post has already been published or closed. Its time can’t be changed.'`

### `apps/web/src/app/actions/remix-run.ts`

- **before** ×2: ` — nothing has been spent.`
  **after**: `. Nothing has been spent.`
- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'This batch has already been made — nothing was charged again.'`
  **after**: `'This batch has already been made. Nothing was charged again.'`
- **before**: `'nothing more will be charged for it — start a new batch when you are ready.'`
  **after**: `'nothing more will be charged for it. Start a new batch when you are ready.'`

### `apps/web/src/app/actions/remix.ts`

- **before** ×5: ` — try again.`
  **after**: `. Try again.`
- **before**: `'This batch is not what it was a moment ago. Check the total and approve it again — ' + ⏎           'nothing has been spent.'`
  **after**: `'This batch is not what it was a moment ago. Check the total and approve it again. ' + ⏎           'Nothing has been spent.'`

### `apps/web/src/app/actions/site-generate.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/templates.ts`

- **before** ×2: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/theme.ts`

- **before** ×5: ` — try again.`
  **after**: `. Try again.`
- **before**: `'That palette could not be read — re-upload your logo.'`
  **after**: `'That palette could not be read. Re-upload your logo.'`
- **before**: `'That palette could not be turned into a theme — try another logo.'`
  **after**: `'That palette could not be turned into a theme. Try another logo.'`
- **before**: `'Upload a logo first — there is no palette to save yet.'`
  **after**: `'Upload a logo first. There is no palette to save yet.'`

### `apps/web/src/app/actions/wallet.ts`

- **before**: ` — nothing was charged.`
  **after**: `. Nothing was charged.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/actions/workspace.ts`

- **before** ×2: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/admin/applications/page.tsx`

- **before**: ` — this is our read failing`
  **after**: `. This is our read failing`

### `apps/web/src/app/admin/credits/page.tsx`

- **before**: ` — this is our read failing`
  **after**: `. This is our read failing`

### `apps/web/src/app/admin/jobs/page.tsx`

- **before**: `Tenants are shown by id — naming them would mean widening what an operator can read.`
  **after**: `Tenants are shown by id. Naming them would mean widening what an operator can read.`
- **before**: `recorded as failed with no message — the failure is real, the reason was not captured`
  **after**: `recorded as failed with no message. The failure is real, the reason was not captured`

### `apps/web/src/app/admin/qa/page.tsx`

- **before**: `The records are safe — this is our read failing.`
  **after**: `The records are safe. This is our read failing.`

### `apps/web/src/app/admin/team/page.tsx`

- **before**: ` — this is our read failing`
  **after**: `. This is our read failing`

### `apps/web/src/app/api/oauth/zernio/start/route.ts`

- **before** ×5: ` — try again.`
  **after**: `. Try again.`
- **before**: `'Connecting isn’t available right now — the publishing key isn’t set.'`
  **after**: `'Connecting isn’t available right now. The publishing key isn’t set.'`

### `apps/web/src/app/api/onboarding/door/route.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/app/api/posts/[postId]/publish/route.ts`

- **before**: ` — try again in a moment.`
  **after**: `. Try again in a moment.`
- **before** ×3: ` — try again.`
  **after**: `. Try again.`
- **before**: `'Publishing is unavailable right now — nothing was sent. We’ve been alerted.'`
  **after**: `'Publishing is unavailable right now. Nothing was sent. We’ve been alerted.'`

### `apps/web/src/app/api/public/beta-apply/route.ts`

- **before**: ` — please try again in a moment.`
  **after**: `. Please try again in a moment.`
- **before**: `"Thanks — we have your details and we'll be in touch."`
  **after**: `"Thanks. We have your details and we'll be in touch."`

### `apps/web/src/app/api/public/site-lead/route.ts`

- **before**: ` — please try again in a moment.`
  **after**: `. Please try again in a moment.`
- **before**: `'Thanks — they have your details and will be in touch.'`
  **after**: `'Thanks. They have your details and will be in touch.'`

### `apps/web/src/app/design-system/page.tsx`

- **before**: `drawn .is-proposed — dashed, unfilled — and each panel states the evidence`
  **after**: `drawn .is-proposed, dashed and unfilled, and each panel states the evidence`
- **before**: `each with a structural signature — fill, edge, texture — so the meaning survives`
  **after**: `each with a structural signature (fill, edge, texture) so the meaning survives`
- **before**: `is what every account sees for its first hour — and its figures are labelled as demonstration data`
  **after**: `is what every account sees for its first hour. Its figures are labelled as demonstration data`

### `apps/web/src/app/global-error.tsx`

- **before**: ` — if it keeps happening, contact support.`
  **after**: `. If it keeps happening, contact support.`

### `apps/web/src/app/not-found.tsx`

- **before**: `aria-label="Sahoda — go to the start"`
  **after**: `aria-label="Sahoda, go to the start"`

### `apps/web/src/components/admin/alpha-chip.tsx`

- **before**: `Partly working — real, and not what was asked for:`
  **after**: `Partly working. Real, and not what was asked for:`
- **before**: `Taken out of scope on purpose — not assessed as broken:`
  **after**: `Taken out of scope on purpose, not assessed as broken:`
- **before**: `That is not a pass — see the partial items below.`
  **after**: `That is not a pass. See the partial items below.`
- **before**: `have not been re-checked since</span> — that is a reading from {ageLabel(age)}, not a statement about today.`
  **after**: `have not been re-checked since</span>. That is a reading from {ageLabel(age)}, not a statement about today.`
- **before**: `no longer match a roadmap item — the record and the roadmap disagree.`
  **after**: `no longer match a roadmap item. The record and the roadmap disagree.`
- **before**: `unverified, not failed</span> — nobody has run them. The`
  **after**: `unverified, not failed</span>. Nobody has run them. The`
- **before**: `{' '} ⏎                 — check it before trusting the count above.`
  **after**: `.{' '} ⏎                 Check it before trusting the count above.`

### `apps/web/src/components/admin/board.tsx`

- **before**: ` — this is our read failing`
  **after**: `. This is our read failing`

### `apps/web/src/components/admin/changelog.tsx`

- **before**: `The entries are safe — this is our read`
  **after**: `The entries are safe. This is our read`

### `apps/web/src/components/admin/charts.tsx`

- **before**: `so this is blank rather than empty — there may well be work here.`
  **after**: `so this is blank rather than empty. There may well be work here.`

### `apps/web/src/components/admin/collapsible-region.tsx`

- **before**: `remembered in this browser only — a different browser, a different machine or a private window starts collapsed again.`
  **after**: `remembered in this browser only. A different browser, a different machine or a private window starts collapsed again.`

### `apps/web/src/components/admin/credits-view.tsx`

- **before**: `'Already approved — nothing was granted twice.'`
  **after**: `'Already approved. Nothing was granted twice.'`
- **before**: `on the Team screen first — one account cannot do both halves.`
  **after**: `on the Team screen first. One account cannot do both halves.`

### `apps/web/src/components/admin/danger-zone.tsx`

- **before**: ``Reset ${workspaceName.trim()} — content cleared, credits and access untouched.``
  **after**: ``Reset ${workspaceName.trim()}. Content is cleared; credits and access are untouched.``

### `apps/web/src/components/admin/flow-chart.tsx`

- **before**: `Fewer than five days of history — drawn as daily totals, not a trend.`
  **after**: `Fewer than five days of history. Drawn as daily totals, not a trend.`

### `apps/web/src/components/admin/gate-chart.tsx`

- **before**: `? `${day.day} — did not run` ⏎       : `${day.day} — ${VERDICT_LABEL[day.status]}``
  **after**: `? `${day.day}: did not run` ⏎       : `${day.day}: ${VERDICT_LABEL[day.status]}``
- **before**: `No suite has five measured days yet — read these as individual runs, not a trend.`
  **after**: `No suite has five measured days yet. Read these as individual runs, not a trend.`

### `apps/web/src/components/admin/hero-card.tsx`

- **before**: `Nothing is wrong with the plan — this is our read failing.`
  **after**: `Nothing is wrong with the plan. This is our read failing.`
- **before**: `This list is incomplete — we couldn&apos;t read{' '}`
  **after**: `This list is incomplete. We couldn&apos;t read{' '}`
- **before**: `title={`${stage.label} — ${stage.percent}%`}`
  **after**: `title={`${stage.label}: ${stage.percent}%`}`

### `apps/web/src/components/admin/hero-sections.tsx`

- **before**: `title="Read from the newest change in the console's own tables — never reported by the sync itself."`
  **after**: `title="Read from the newest change in the console's own tables, never reported by the sync itself."`

### `apps/web/src/components/admin/qa-composer.tsx`

- **before**: `A recorded run cannot be edited afterwards — it is the evidence someone reads later.`
  **after**: `A recorded run cannot be edited afterwards. It is the evidence someone reads later.`

### `apps/web/src/components/admin/qa-transfer.tsx`

- **before**: `There are more runs than one export holds — this file has the 500 most recent.`
  **after**: `There are more runs than one export holds. This file has the 500 most recent.`
- **before**: `stay in the bucket — an import restores the runs, not the images.`
  **after**: `stay in the bucket. An import restores the runs, not the images.`

### `apps/web/src/components/admin/sub-nav.tsx`

- **before**: `title={`Not built yet — ${section.pending} builds this screen.`}`
  **after**: `title={`Not built yet. ${section.pending} builds this screen.`}`

### `apps/web/src/components/admin/team-view.tsx`

- **before**: `viewer: 'Read only — never approves or grants',`
  **after**: `viewer: 'Read only, never approves or grants',`

### `apps/web/src/components/ads/gates-ladder.tsx`

- **before**: `'A budget is not a number on a row — it is a spend record`
  **after**: `'A budget is not a number on a row. It is a spend record`
- **before**: `and it is yours to give — nothing here can arrange it for you.`
  **after**: `and it is yours to give. Nothing here can arrange it for you.`

### `apps/web/src/components/analytics/follower-chart.tsx`

- **before**: `One day of history so far — not enough to show a trend.`
  **after**: `One day of history so far. Not enough to show a trend.`

### `apps/web/src/components/analytics/performance-over-time.tsx`

- **before**: `Nothing has been measured yet — the first readings`
  **after**: `Nothing has been measured yet. The first readings`

### `apps/web/src/components/analytics/post-table.tsx`

- **before**: `Not ranked — no measurement yet ({waiting.length})`
  **after**: `Not ranked, no measurement yet ({waiting.length})`

### `apps/web/src/components/assets/asset-library.tsx`

- **before**: `' — showing the most recent 200. Older files are not in this list.'`
  **after**: `'. Showing the most recent 200. Older files are not in this list.'`

### `apps/web/src/components/assets/asset-upload.tsx`

- **before**: `<span className="font-semibold">{entry.name}</span> — {entry.message}`
  **after**: `<span className="font-semibold">{entry.name}</span>: {entry.message}`

### `apps/web/src/components/billing/billing-details-form.tsx`

- **before**: `Invoices already issued do not change —`
  **after**: `Invoices already issued do not change.`

### `apps/web/src/components/billing/current-plan.tsx`

- **before**: ` — this is a failed`
  **after**: `. This is a failed`
- **before**: `Your free signup credits land the moment the workspace exists — that is{' '}`
  **after**: `Your free signup credits land the moment the workspace exists. That is{' '}`

### `apps/web/src/components/billing/plan-picker.tsx`

- **before**: ` — the payment page is not reachable from the app yet.`
  **after**: `. The payment page is not reachable from the app yet.`
- **before**: `is removed — every channel, site and post stays exactly where it is.`
  **after**: `is removed. Every channel, site and post stays exactly where it is.`

### `apps/web/src/components/brain/brain-header.tsx`

- **before**: `Every field is confirmed — Sahoda writes from your answers, not its guesses.`
  **after**: `Every field is confirmed. Sahoda writes from your answers, not its guesses.`
- **before**: `are not counted here — edit a`
  **after**: `are not counted here. Edit a`
- **before**: `that rewrites every field — including the ones you have already`
  **after**: `that rewrites every field, including the ones you have already`

### `apps/web/src/components/brain/brain-sections.tsx`

- **before**: ` — reload to try again.`
  **after**: `. Reload to try again.`

### `apps/web/src/components/brain/confidence-card.tsx`

- **before**: `until someone corrects it — and correcting one costs`
  **after**: `until someone corrects it, and correcting one costs`

### `apps/web/src/components/brain/derived-card.tsx`

- **before**: `>Derived — not counted</span>`
  **after**: `>Derived, not counted</span>`
- **before**: `weak: 'Weak signal — inputs conflict',`
  **after**: `weak: 'Weak signal, inputs conflict',`

### `apps/web/src/components/brain/field-editor.tsx`

- **before**: `</span> — remove one to add`
  **after**: `</span>. Remove one to add`

### `apps/web/src/components/brain/field-evidence.tsx`

- **before**: `Sahoda kept what it learned from it — this value is unchanged — but the passage behind it can no longer be opened.`
  **after**: `Sahoda kept what it learned from it, so this value is unchanged, but the passage behind it can no longer be opened.`

### `apps/web/src/components/brain/field-row.tsx`

- **before**: `'Already confirmed — edit the text to change it.'`
  **after**: `'Already confirmed. Edit the text to change it.'`

### `apps/web/src/components/brain/resolution-row.tsx`

- **before**: `>Nothing to confirm — it is empty</span>`
  **after**: `>Nothing to confirm, it is empty</span>`
- **before**: `here — a blank answer would be an`
  **after**: `here. A blank answer would be an`

### `apps/web/src/components/campaigns/add-posts.tsx`

- **before**: `Older posts are not shown here yet — open one from Posts to add it.`
  **after**: `Older posts are not shown here yet. Open one from Posts to add it.`
- **before**: `Reload — this is not a sign that you have`
  **after**: `Reload. This is not a sign that you have`
- **before**: ``Added ${result.changed} — ${skipped}`
  **after**: ``Added ${result.changed}, and ${skipped}`

### `apps/web/src/components/campaigns/campaign-form.tsx`

- **before**: `Nothing starts or ends a campaign on its own — you move it when you are`
  **after**: `Nothing starts or ends a campaign on its own. You move it when you are`
- **before**: `hint="Optional. In your words — nothing reads this but you."`
  **after**: `hint="Optional. In your words. Nothing reads this but you."`
- **before**: `hint="What you would call this push out loud — “Diwali week”, “New menu”."`
  **after**: `hint="What you would call this push out loud: “Diwali week”, “New menu”."`

### `apps/web/src/components/campaigns/campaign-table.tsx`

- **before**: `No channels — nothing in this campaign targets one yet`
  **after**: `No channels. Nothing in this campaign targets one yet`
- **before**: `return `${day(period.startsAt)} – ${day(period.endsAt)}``
  **after**: `return `${day(period.startsAt)} to ${day(period.endsAt)}``

### `apps/web/src/components/campaigns/campaign-tag.tsx`

- **before**: `<span className="sr-only"> — open this campaign</span>`
  **after**: `<span className="sr-only">, open this campaign</span>`

### `apps/web/src/components/campaigns/channel-cell.tsx`

- **before**: `Not on {channel} — this post does not target it`
  **after**: `Not on {channel}, because this post does not target it`

### `apps/web/src/components/campaigns/delete-campaign-button.tsx`

- **before**: `'Campaign deleted — the posts are still there'`
  **after**: `'Campaign deleted. The posts are still there'`

### `apps/web/src/components/campaigns/remove-post-button.tsx`

- **before**: `'Removed from the campaign — the post is still in Posts'`
  **after**: `'Removed from the campaign. The post is still in Posts'`
- **before**: ``Remove ${postTitle} from this campaign — the post is kept``
  **after**: ``Remove ${postTitle} from this campaign, keeping the post``

### `apps/web/src/components/coming-soon.tsx`

- **before**: `so you can see what is planned — not because the feature is running.`
  **after**: `so you can see what is planned. It is not here because the feature is running.`

### `apps/web/src/components/composer/divergence-notice.tsx`

- **before**: `Both versions are still here — choose which one to keep.`
  **after**: `Both versions are still here. Choose which one to keep.`
- **before**: `Your text is still here — retry now, or keep editing and Sahoda retries on the next change.`
  **after**: `Your text is still here. Retry now, or keep editing and Sahoda retries on the next change.`

### `apps/web/src/components/composer/gbp-options.tsx`

- **before**: `The saved button is not one Google offers — pick one from the list.`
  **after**: `The saved button is not one Google offers. Pick one from the list.`

### `apps/web/src/components/composer/gbp-topic-options.tsx`

- **before**: `Fill in at least one of these — an offer with none of them publishes as an ordinary update.`
  **after**: `Fill in at least one of these. An offer with none of them publishes as an ordinary update.`

### `apps/web/src/components/composer/poll-options.tsx`

- **before**: `Answers — two to four`
  **after**: `Answers, two to four`
- **before**: `On X the post itself is the question — the answers go below.`
  **after**: `On X the post itself is the question. The answers go below.`

### `apps/web/src/components/composer/relink-control.tsx`

- **before**: `Its own copy is kept until you save — nothing was written.`
  **after**: `Its own copy is kept until you save. Nothing was written.`

### `apps/web/src/components/composer/use-variant-format.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/components/composer/version-card.tsx`

- **before**: `Nothing to save — this channel has no copy.`
  **after**: `Nothing to save. This channel has no copy.`

### `apps/web/src/components/composer/version-options.tsx`

- **before**: `story: 'A story — gone in 24 hours',`
  **after**: `story: 'A story, gone in 24 hours',`

### `apps/web/src/components/connections/connect-button.tsx`

- **before**: ` — check your connection and try again.`
  **after**: `. Check your connection and try again.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/components/connections/connect-outcome-notice.tsx`

- **before**: `Connect the rest again — the ones that already worked will not be affected.`
  **after**: `Connect the rest again. The ones that already worked will not be affected.`
- **before**: `No new account came back from the platform — you may have closed its screen before approving.`
  **after**: `No new account came back from the platform. You may have closed its screen before approving.`
- **before**: `The rest are still connected on the platform — connect again once your plan has room`
  **after**: `The rest are still connected on the platform. Connect again once your plan has room`

### `apps/web/src/components/connections/reconnect-button.tsx`

- **before**: ` — check your connection and try again.`
  **after**: `. Check your connection and try again.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/components/design-system/absence-row.tsx`

- **before**: `rule="There is no such quantity. Delete the slot — do not fill it."`
  **after**: `rule="There is no such quantity. Delete the slot; do not fill it."`

### `apps/web/src/components/design-system/certainty-ladder.tsx`

- **before**: `three sit on the same rung — evidence, not intent, is what earns`
  **after**: `three sit on the same rung. Evidence, not intent, is what earns`

### `apps/web/src/components/design-system/primitive-rack.tsx`

- **before**: `Selection shows in three ways — aria-pressed, a ring, and weight — because a tint alone is nearly invisible against its surface.`
  **after**: `Selection shows in three ways (aria-pressed, a ring, and weight) because a tint alone is nearly invisible against its surface.`
- **before**: `note="A chip is data the USER put there — a channel, a filter, a tag.`
  **after**: `note="A chip is data the USER put there: a channel, a filter, a tag.`

### `apps/web/src/components/design-system/scale-tables.tsx`

- **before**: `16px was rejected — this product has tables.`
  **after**: `16px was rejected because this product has tables.`
- **before**: `Absorbs the 12.5px block — 110 hand-written uses,`
  **after**: `Absorbs the 12.5px block: 110 hand-written uses,`
- **before**: `Table cells, captions, timestamps, helper text — the 211 hand-written 12px uses that had nowhere to go.`
  **after**: `Table cells, captions, timestamps, helper text: the 211 hand-written 12px uses that had nowhere to go.`

### `apps/web/src/components/design-system/surfaces.tsx`

- **before**: `'A well INSIDE a card — inputs, table heads, code.'`
  **after**: `'A well INSIDE a card: inputs, table heads, code.'`
- **before**: `<h3 className="type-h3 mb-1">Glass — chrome only</h3>`
  **after**: `<h3 className="type-h3 mb-1">Glass, chrome only</h3>`
- **before**: `clears a floor derived from the reference — 1.03:1 on light, 1.06:1 on dark.`
  **after**: `clears a floor derived from the reference: 1.03:1 on light, 1.06:1 on dark.`
- **before**: `the parent&rsquo;s radius minus one step — equal radii on nested boxes make the two curves fight,`
  **after**: `the parent&rsquo;s radius minus one step. Equal radii on nested boxes make the two curves fight,`
- **before**: `which is the whole effect — and the whole problem for anything below.`
  **after**: `which is the whole effect, and the whole problem for anything below.`

### `apps/web/src/components/design-system/v5-primitives.tsx`

- **before**: `And ONE absence gets ONE statement — five cards each discovering the same emptiness is the defect this rule exists for.`
  **after**: `And ONE absence gets ONE statement. Five cards each discovering the same emptiness is the defect this rule exists for.`
- **before**: `and a sparkline beneath — the reference&rsquo;s most-repeated object.`
  **after**: `and a sparkline beneath. It is the reference&rsquo;s most-repeated object.`
- **before**: `not a row of buttons — the options are mutually exclusive`
  **after**: `not a row of buttons. The options are mutually exclusive`

### `apps/web/src/components/embed/beta-form.tsx`

- **before**: ` — please try again.`
  **after**: `. Please try again.`
- **before**: `'Thanks — we have your details.'`
  **after**: `'Thanks. We have your details.'`

### `apps/web/src/components/embed/lead-form.tsx`

- **before**: ` — please try again.`
  **after**: `. Please try again.`
- **before**: `'Thanks — they have your details.'`
  **after**: `'Thanks. They have your details.'`

### `apps/web/src/components/error-fallback.tsx`

- **before**: ` — if it keeps happening, contact support.`
  **after**: `. If it keeps happening, contact support.`

### `apps/web/src/components/home/chart-empty.tsx`

- **before**: `Showing from {label} — older days are outside this view.`
  **after**: `Showing from {label}. Older days are outside this view.`

### `apps/web/src/components/home/first-run.tsx`

- **before**: `body="Everything in Sahoda lives in a workspace — your Brand Brain, your posts and your credits.`
  **after**: `body="Everything in Sahoda lives in a workspace: your Brand Brain, your posts and your credits.`

### `apps/web/src/components/home/spend-bars.tsx`

- **before**: `empty="Nothing spent yet — no actions to break down."`
  **after**: `empty="Nothing spent yet. No actions to break down."`

### `apps/web/src/components/inbox/reply-composer.tsx`

- **before**: `Choose the one that is actually true — the platform audits these.`
  **after**: `Choose the one that is actually true. The platform audits these.`

### `apps/web/src/components/inbox/review-card.tsx`

- **before**: `>Rating only — no written review.</p>`
  **after**: `>Rating only. No written review.</p>`

### `apps/web/src/components/knowledge/add-document.tsx`

- **before**: `Sahoda reads the text layer — a menu saved as a picture has none,`
  **after**: `Sahoda reads the text layer. A menu saved as a picture has none,`

### `apps/web/src/components/knowledge/document-row.tsx`

- **before**: `This document contains text written as if to address an assistant —{' '}`
  **after**: `This document contains text written as if to address an assistant, in{' '}`

### `apps/web/src/components/knowledge/library-search.tsx`

- **before**: `Sahoda searched the words in every document it has read — a document still being read is not in there yet.`
  **after**: `Sahoda searched the words in every document it has read. A document still being read is not in there yet.`
- **before**: `This is not a claim that your library has nothing matching — the search did not come back.`
  **after**: `This is not a claim that your library has nothing matching. The search did not come back.`

### `apps/web/src/components/knowledge/resolve-from-library.tsx`

- **before**: `It changes nothing on its own — every suggestion waits for you on the{' '}`
  **after**: `It changes nothing on its own. Every suggestion waits for you on the{' '}`

### `apps/web/src/components/loop/autonomy-dial.tsx`

- **before**: `<span className="type-sm font-normal">— not available</span>`
  **after**: `<span className="type-sm font-normal">, not available</span>`
- **before**: `Not set — running at {AUTONOMY_LEVELS[defaultLevel]?.name.toLowerCase()}`
  **after**: `Not set, running at {AUTONOMY_LEVELS[defaultLevel]?.name.toLowerCase()}`
- **before**: `and publish for Google Business Profile — they do not have to move together.`
  **after**: `and publish for Google Business Profile. They do not have to move together.`

### `apps/web/src/components/loop/controls.tsx`

- **before**: `'Connect a channel first — Sahoda has nowhere to plan for.'`
  **after**: `'Connect a channel first. Sahoda has nowhere to plan for.'`

### `apps/web/src/components/loop/cost-preview.tsx`

- **before**: `'Nothing was written — every brief is on a channel set to suggest only.'`
  **after**: `'Nothing was written. Every brief is on a channel set to suggest only.'`
- **before**: `or approve it anyway — the budget is yours to set.`
  **after**: `or approve it anyway. The budget is yours to set.`

### `apps/web/src/components/loop/cycle-strip.tsx`

- **before**: `Then it starts again — and it starts from a Brand Brain that now knows what happened last week.`
  **after**: `Then it starts again, from a Brand Brain that now knows what happened last week.`
- **before**: `before it needs you — that is the dial below.`
  **after**: `before it needs you. That is the dial below.`

### `apps/web/src/components/loop/kill-switch.tsx`

- **before**: `Your drafts stay in the Planner — nothing is deleted.`
  **after**: `Your drafts stay in the Planner. Nothing is deleted.`

### `apps/web/src/components/media/crop-preview.tsx`

- **before**: `Preview unavailable — the crop can still be made.`
  **after**: `Preview unavailable. The crop can still be made.`

### `apps/web/src/components/onboarding/attempt-error.tsx`

- **before**: `Not enough credits to resolve your Brand Brain — this needs{' '}`
  **after**: `Not enough credits to resolve your Brand Brain. This needs{' '}`

### `apps/web/src/components/onboarding/cards/taboo-card.tsx`

- **before**: `not a filter on the way out — keep reviewing posts before they go live.`
  **after**: `not a filter on the way out. Keep reviewing posts before they go live.`
- **before**: `title="Red lines — what Sahoda steers away from"`
  **after**: `title="Red lines, what Sahoda steers away from"`

### `apps/web/src/components/onboarding/confirmed-fields-meter.tsx`

- **before**: `reading of what it found — none of it came from you yet.`
  **after**: `reading of what it found. None of it came from you yet.`

### `apps/web/src/components/onboarding/door-step.tsx`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'A website usually takes about 12 seconds — we read up to five pages.'`
  **after**: `'A website usually takes about 12 seconds. We read up to five pages.'`
- **before**: `'Fix the sign-in or the workspace first — pressing Read this again now would fail the same way.'`
  **after**: `'Fix the sign-in or the workspace first. Pressing Read this again now would fail the same way.'`
- **before**: `* 88))} — an estimate for a short document, charged to us, not to your credits.`
  **after**: `* 88))}, an estimate for a short document, charged to us, not to your credits.`
- **before**: `A few more words — that is too short to read anything from.`
  **after**: `A few more words. That is too short to read anything from.`
- **before**: `Nothing was charged — reading is always free. ⏎           </p>`
  **after**: `Nothing was charged. Reading is always free. ⏎           </p>`
- **before**: `Nothing was charged — reading is always free. Your link and PDF are still attached`
  **after**: `Nothing was charged. Reading is always free. Your link and PDF are still attached`
- **before**: `That is not us — try another source`
  **after**: `That is not us, try another source`
- **before**: `That is us — continue`
  **after**: `That is us, continue`
- **before**: `and nothing from that document — the Brain will be thinner, and every field stays a guess until you confirm it.`
  **after**: `and nothing from that document. The Brain will be thinner, and every field stays a guess until you confirm it.`
- **before**: `we read the PDF — it is the one you wrote every word of.`
  **after**: `we read the PDF. It is the one you wrote every word of.`

### `apps/web/src/components/onboarding/editable-list.tsx`

- **before**: `</span> — remove one to add another.`
  **after**: `</span>. Remove one to add another.`

### `apps/web/src/components/onboarding/intake-step.tsx`

- **before**: `and show you what we got — change any of them.`
  **after**: `and show you what we got. Change any of them.`

### `apps/web/src/components/onboarding/question-step.tsx`

- **before**: `Answer in a few words first — this is the one thing we cannot infer.`
  **after**: `Answer in a few words first. This is the one thing we cannot infer.`

### `apps/web/src/components/onboarding/resolving-panel.tsx`

- **before**: `'You are only charged for a real result — a sample or a failure costs nothing.'`
  **after**: `'You are only charged for a real result. A sample or a failure costs nothing.'`
- **before**: `and it will say so either way — leaving this page is what would lose it.`
  **after**: `and it will say so either way. Leaving this page is what would lose it.`

### `apps/web/src/components/onboarding/reveal-step.tsx`

- **before**: `there is nothing to resolve from — this brain was loaded, not answered for.`
  **after**: `there is nothing to resolve from. This brain was loaded, not answered for.`

### `apps/web/src/components/onboarding/saved-brain-banner.tsx`

- **before**: `Loaded your saved Brand Brain — version <span className="tabular-nums">{version}</span>,{' '}`
  **after**: `Loaded your saved Brand Brain, version <span className="tabular-nums">{version}</span>,{' '}`

### `apps/web/src/components/onboarding/stage/read-site.ts`

- **before**: `This is not a verdict on the site — it will be tried again when you build.`
  **after**: `This is not a verdict on the site. It will be tried again when you build.`

### `apps/web/src/components/onboarding/stage/steps/audience-step.tsx`

- **before**: `will be aimed at <em>{audience}</em> — not at everyone.`
  **after**: `will be aimed at <em>{audience}</em>, not at everyone.`

### `apps/web/src/components/onboarding/stage/steps/intro-step.tsx`

- **before**: `Open it to read or change what it knows — nothing to rebuild and nothing to spend.`
  **after**: `Open it to read or change what it knows. Nothing to rebuild and nothing to spend.`

### `apps/web/src/components/onboarding/stage/steps/references-step.tsx`

- **before**: `Websites, Instagram accounts, Pinterest boards, competitors — anything you admire.`
  **after**: `Websites, Instagram accounts, Pinterest boards, competitors: anything you admire.`

### `apps/web/src/components/onboarding/stage/steps/result-step.tsx`

- **before**: ` — nothing was charged.`
  **after**: `. Nothing was charged.`
- **before**: `I have not settled on a tone of voice yet — set that in Brand Brain and everything I write follows it.`
  **after**: `I have not settled on a tone of voice yet. Set that in Brand Brain and everything I write follows it.`
- **before**: `Your Brand Brain is unaffected — only the workspace colours were not saved.`
  **after**: `Your Brand Brain is unaffected. Only the workspace colours were not saved.`

### `apps/web/src/components/onboarding/stage/steps/what-step.tsx`

- **before**: `Got it — <em>{data.category}</em>.`
  **after**: `Got it, <em>{data.category}</em>.`

### `apps/web/src/components/onboarding/stage/wait-for-door.ts`

- **before**: `That is not a verdict on your site — open Brand Brain to add what it says.`
  **after**: `That is not a verdict on your site. Open Brand Brain to add what it says.`

### `apps/web/src/components/planner/plan-week-panel.tsx`

- **before**: `'Still working — if this fails you will not be charged.',`
  **after**: `'Still working. If this fails you will not be charged.',`

### `apps/web/src/components/playbooks/festival-form.tsx`

- **before**: `'Ready — the cost preview is below.',`
  **after**: `'Ready. The cost preview is below.',`

### `apps/web/src/components/playbooks/kill-switch.tsx`

- **before**: `drafts stay in the Planner — nothing is deleted, and anything you scheduled yourself is left`
  **after**: `drafts stay in the Planner. Nothing is deleted, and anything you scheduled yourself is left`

### `apps/web/src/components/playbooks/run-history.tsx`

- **before**: `<span>— {OUTCOME[item.outcome] ?? item.outcome}</span>`
  **after**: `<span>{OUTCOME[item.outcome] ?? item.outcome}</span>`

### `apps/web/src/components/posts/channel-chip.tsx`

- **before**: `: ' — not sent yet'}`
  **after**: `: ', not sent yet'}`
- **before**: `? ' — did not go out'`
  **after**: `? ', did not go out'`
- **before**: `? ' — going out now'`
  **after**: `? ', going out now'`
- **before**: `? ' — published, no link yet'`
  **after**: `? ', published, no link yet'`

### `apps/web/src/components/posts/delete-post-button.tsx`

- **before**: ` — try again.`
  **after**: `. Try again.`

### `apps/web/src/components/posts/generate-panel.tsx`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'Still working — if this fails you will not be charged.',`
  **after**: `'Still working. If this fails you will not be charged.',`

### `apps/web/src/components/posts/inline-rewrite.tsx`

- **before**: `'Still waiting — you are not charged if this fails.',`
  **after**: `'Still waiting. You are not charged if this fails.',`
- **before**: `was still charged — here it is to place yourself.`
  **after**: `was still charged. Here it is to place yourself.`

### `apps/web/src/components/posts/library-picker.tsx`

- **before**: `It is on the post — these channels will not use it:`
  **after**: `It is on the post. These channels will not use it:`
- **before**: `This is not a claim that it is empty — close this`
  **after**: `This is not a claim that it is empty. Close this`

### `apps/web/src/components/posts/live/live-phase-note.tsx`

- **before**: `Stopped watching for updates — a publish has been running for a while.`
  **after**: `Stopped watching for updates. A publish has been running for a while.`

### `apps/web/src/components/posts/media-attach.tsx`

- **before**: `It is on the post — these channels will not use it:`
  **after**: `It is on the post. These channels will not use it:`

### `apps/web/src/components/posts/media-pane.tsx`

- **before**: `<span>Preview unavailable — the file is still attached to this post.</span>`
  **after**: `<span>Preview unavailable. The file is still attached to this post.</span>`
- **before**: ``Attached image with no alt text — ${fileName}``
  **after**: ``Attached image with no alt text: ${fileName}``
- **before**: `{"Can't verify this file — "} ⏎             {!result.ok ? result.message : 'it could not be checked against the channel limits.'}`
  **after**: `{"Can't verify this file. "} ⏎             {!result.ok ? result.message : 'It could not be checked against the channel limits.'}`

### `apps/web/src/components/posts/publish-now.tsx`

- **before**: ` — check your connection and try again.`
  **after**: `. Check your connection and try again.`
- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'Instagram accepted the post but hasn’t given us a link yet — check back shortly.'`
  **after**: `'Instagram accepted the post but hasn’t given us a link yet. Check back shortly.'`
- **before**: `'Waiting for Instagram to finish processing — this takes about fifteen seconds.',`
  **after**: `'Waiting for Instagram to finish processing. This takes about fifteen seconds.',`

### `apps/web/src/components/posts/publish-preview.tsx`

- **before** ×2: ` — try again.`
  **after**: `. Try again.`
- **before**: `Connect a channel, then use Publish below — or set a time and let it go out on its own.`
  **after**: `Connect a channel, then use Publish below, or set a time and let it go out on its own.`
- **before**: `Simulated — nothing was posted`
  **after**: `Simulated, nothing was posted`
- **before**: `[item.channel]}</span> — preview isn&rsquo;t something this release can post to,`
  **after**: `[item.channel]}</span> is not something this release can post to,`
- **before**: `[item.channel]}</span> — would be rejected.`
  **after**: `[item.channel]}</span> would be rejected.`
- **before**: `[result.channel]}</span> — passes the channel rules we check.`
  **after**: `[result.channel]}</span> passes the channel rules we check.`

### `apps/web/src/components/posts/schedule-field.tsx`

- **before**: `'No schedule set — this post stays a draft.'`
  **after**: `'No schedule set. This post stays a draft.'`

### `apps/web/src/components/posts/status-badge.tsx`

- **before**: `<span className="sr-only"> — {mark.hint}</span>`
  **after**: `<span className="sr-only">. {mark.hint}</span>`

### `apps/web/src/components/radar/marks.tsx`

- **before**: `{note ? ` — ${note}` : ''}`
  **after**: `{note ? `. ${note}` : ''}`

### `apps/web/src/components/remix/batch-preview.tsx`

- **before**: `. Every one is a draft — read it, change it, and approve it yourself before it goes`
  **after**: `. Every one is a draft. Read it, change it, and approve it yourself before it goes`
- **before**: `takes away a draft and not a credit — one writing pass covers every`
  **after**: `takes away a draft and not a credit. One writing pass covers every`

### `apps/web/src/components/remix/plan-batch.tsx`

- **before**: `credit — one writing pass covers every channel it is for.`
  **after**: `credit. One writing pass covers every channel it is for.`

### `apps/web/src/components/settings/your-data-panel.tsx`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `It holds a reference to you — for most rows a sign-in code rather than your name.`
  **after**: `It holds a reference to you, which for most rows is a sign-in code rather than your name.`
- **before**: `Your credit and payment record is kept — it is what proves what you paid`
  **after**: `Your credit and payment record is kept. It is what proves what you paid`
- **before**: `Your sign-in account is separate — close that with your sign-in provider if you want it gone too.`
  **after**: `Your sign-in account is separate. Close that with your sign-in provider if you want it gone too.`
- **before**: `it lists anything it could not include and why — so you can tell an empty section from a missing one.`
  **after**: `it lists anything it could not include and why, so you can tell an empty section from a missing one.`

### `apps/web/src/components/shell/bottom-nav.tsx`

- **before**: `aria-label="Sahoda — go to Home"`
  **after**: `aria-label="Sahoda, go to Home"`

### `apps/web/src/components/shell/brain-ring.tsx`

- **before**: ` — reload to try again.`
  **after**: `. Reload to try again.`
- **before**: `Sahoda has nothing to write from yet — set up your Brand Brain.`
  **after**: `Sahoda has nothing to write from yet. Set up your Brand Brain.`

### `apps/web/src/components/shell/nav-item.tsx`

- **before**: ``${label} — not built yet``
  **after**: ``${label}, not built yet``

### `apps/web/src/components/shell/rail.tsx`

- **before**: `aria-label="Sahoda — go to Home"`
  **after**: `aria-label="Sahoda, go to Home"`

### `apps/web/src/components/sites/generate-site-panel.tsx`

- **before**: `'Still working — if this fails you will not be charged.',`
  **after**: `'Still working. If this fails you will not be charged.',`
- **before**: `Preview only for now — publishing to a real address is coming.`
  **after**: `Preview only for now. Publishing to a real address is coming.`

### `apps/web/src/components/sites/site-preview.tsx`

- **before**: `title={`Preview of ${siteName} — ${active.path}`}`
  **after**: `title={`Preview of ${siteName}: ${active.path}`}`

### `apps/web/src/components/wallet/ledger-table.tsx`

- **before**: ``Credit activity, newest first — the ${limit} most recent entries``
  **after**: ``Credit activity, newest first: the ${limit} most recent entries``
- **before**: `could not be ⏎       displayed — {one ? 'it did' : 'they did'} not match the ledger contract.`
  **after**: `could not be ⏎       displayed, because {one ? 'it did' : 'they did'} not match the ledger contract.`

### `apps/web/src/components/wallet/top-up-panel.tsx`

- **before**: `'Sandbox order created — no real money moves'`
  **after**: `'Sandbox order created. No real money moves'`
- **before**: `'Simulated checkout — no payment rail is connected'`
  **after**: `'Simulated checkout. No payment rail is connected'`
- **before**: `Nothing was charged and no credits were added — credits arrive only after a completed payment is confirmed.`
  **after**: `Nothing was charged and no credits were added. Credits arrive only after a completed payment is confirmed.`
- **before**: `Starts a checkout session for {plan.name} — ₹`
  **after**: `Starts a checkout session for {plan.name}, at ₹`

### `apps/web/src/lib/actions/paid-failure.ts`

- **before**: `'This deployment is not fully configured for AI actions yet — nothing ran and you were not charged.'`
  **after**: `'This deployment is not fully configured for AI actions yet. Nothing ran and you were not charged.'`

### `apps/web/src/lib/assets/view.ts`

- **before**: ``${displayName(card)} — no description added``
  **after**: ``${displayName(card)}, no description added``
- **before**: ``In ${nameOfPost(first)} — ${reasonForLock(first)}``
  **after**: ``In ${nameOfPost(first)}: ${reasonForLock(first)}``

### `apps/web/src/lib/billing/limit-copy.ts`

- **before**: `and above — your ${planName} plan doesn't include one.``
  **after**: `and above. Your ${planName} plan doesn't include one.``

### `apps/web/src/lib/billing/plan-copy.ts`

- **before**: `'Your workspace is on the free plan’s limits for now. Nothing has been deleted — ' +`
  **after**: `'Your workspace is on the free plan’s limits for now. Nothing has been deleted. ' +`
- **before**: `Nothing is charged today and nothing is refunded — ``
  **after**: `Nothing is charged today and nothing is refunded. ``

### `apps/web/src/lib/brand/brain-origin.ts`

- **before**: `it cannot show which sentence produced which field — it read everything in one pass`
  **after**: `it cannot show which sentence produced which field. It read everything in one pass`

### `apps/web/src/lib/brand/brain-ring.ts`

- **before**: `'Every field is confirmed — Sahoda writes from your answers.'`
  **after**: `'Every field is confirmed. Sahoda writes from your answers.'`

### `apps/web/src/lib/brand/fields.ts`

- **before**: `'How formal should you be — a shopkeeper, or a consultant?'`
  **after**: `'How formal should you be: a shopkeeper, or a consultant?'`

### `apps/web/src/lib/brand/resolution-queue.ts`

- **before**: `'Sahoda is not entitled to answer these — it filled them in so the Brain would work at all,`
  **after**: `'Sahoda is not entitled to answer these. It filled them in so the Brain would work at all,`

### `apps/web/src/lib/brand/resolve-result.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'Showing a sample Brand Brain — the model could not be reached, so you were not charged.`
  **after**: `'Showing a sample Brand Brain. The model could not be reached, so you were not charged.`

### `apps/web/src/lib/brand/save-brand-error.ts`

- **before**: ` — reload and try again.`
  **after**: `. Reload and try again.`
- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'That Brand Brain is too long to save — trim the longest fields or list entries and try again.'`
  **after**: `'That Brand Brain is too long to save. Trim the longest fields or list entries and try again.'`
- **before**: `'Your role cannot change the Brand Brain — ask an owner or editor.'`
  **after**: `'Your role cannot change the Brand Brain. Ask an owner or editor.'`

### `apps/web/src/lib/brand/url-door.ts`

- **before**: `'No document to read — we will ask you instead.'`
  **after**: `'No document to read. We will ask you instead.'`
- **before**: `'That document is too large to read — send a shorter one, or tell us in your own words.'`
  **after**: `'That document is too large to read. Send a shorter one, or tell us in your own words.'`
- **before**: `'That file is not a PDF — upload a PDF, or tell us in your own words instead.'`
  **after**: `'That file is not a PDF. Upload a PDF, or tell us in your own words instead.'`
- **before** ×2: `could not turn it into a brand just now — tell us in your own words instead.`
  **after**: `could not turn it into a brand just now. Tell us in your own words instead.`
- **before**: `found almost no text in that document — its words are probably inside the design`
  **after**: `found almost no text in that document. Its words are probably inside the design`

### `apps/web/src/lib/campaigns/campaign-error.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'A campaign with that name already exists — pick another name.'`
  **after**: `'A campaign with that name already exists. Pick another name.'`
- **before**: `'Check the name, the status and the dates — one of them is not allowed.'`
  **after**: `'Check the name, the status and the dates. One of them is not allowed.'`
- **before**: `'That campaign or post no longer exists — reload to see the current list.'`
  **after**: `'That campaign or post no longer exists. Reload to see the current list.'`

### `apps/web/src/lib/connections/health.ts`

- **before**: ``Reconnect ${platform} today — access ends tomorrow.``
  **after**: ``Reconnect ${platform} today. Access ends tomorrow.``
- **before**: ``Reconnect ${platform} within ${health.daysLeft} days — access ends then.``
  **after**: ``Reconnect ${platform} within ${health.daysLeft} days. Access ends then.``
- **before**: ``Reconnect ${platform} — ${health.reason}.``
  **after**: ``Reconnect ${platform}: ${health.reason}.``
- **before**: ``Reconnect ${platform} — its access has run out and scheduled posts will not go out.``
  **after**: ``Reconnect ${platform}. Its access has run out and scheduled posts will not go out.``

### `apps/web/src/lib/home/greeting.ts`

- **before**: `'Nothing in flight yet — plan a week and it starts filling in.'`
  **after**: `'Nothing in flight yet. Plan a week and it starts filling in.'`

### `apps/web/src/lib/inbox/emptiness.ts`

- **before**: `so it has nothing to show yet — this is not a reading of your ${surface.noun}.`
  **after**: `so it has nothing to show yet. This is not a reading of your ${surface.noun}.`
- **before**: `which accounts you have connected — so it cannot tell whether nothing is connected`
  **after**: `which accounts you have connected, so it cannot tell whether nothing is connected`

### `apps/web/src/lib/inbox/send.ts`

- **before**: `could not confirm this reply was delivered — the platform did not return an id for it.`
  **after**: `could not confirm this reply was delivered. The platform did not return an id for it.`

### `apps/web/src/lib/inbox/store-decision.ts`

- **before**: `This is not a reading of your ${noun} — it is what has reached Sahoda so far, which is nothing.`
  **after**: `This is not a reading of your ${noun}. It is what has reached Sahoda so far, which is nothing.`
- **before**: ``This is not a reading of your ${noun} — the attempt itself failed.`
  **after**: ``This is not a reading of your ${noun}. The attempt itself failed.`
- **before**: `has been receiving updates — none of them ${noun}.`
  **after**: `has been receiving updates, none of them ${noun}.`

### `apps/web/src/lib/knowledge/delete-impact.ts`

- **before**: `does not undo what Sahoda already learned — those stay exactly as they are.`
  **after**: `does not undo what Sahoda already learned. Those stay exactly as they are.`

### `apps/web/src/lib/knowledge/failure-copy.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `Nothing was saved and nothing was charged — read it again.`
  **after**: `Nothing was saved and nothing was charged. Read it again.`
- **before**: `found almost no text — the words are probably part of the design rather than typed into it.`
  **after**: `found almost no text. The words are probably part of the design rather than typed into it.`
- **before**: `longer than Sahoda stores in one go — about ${extra.passages`
  **after**: `longer than Sahoda stores in one go: about ${extra.passages`
- **before**: `rather than to a page on the open web — a home network, or a machine only this server can see.`
  **after**: `rather than to a page on the open web. It looks like a home network, or a machine only this server can see.`

### `apps/web/src/lib/loop/refusal-copy.ts`

- **before**: ` — nothing was charged.`
  **after**: `. Nothing was charged.`
- **before**: `${has} lapsed — reconnect ${them} and Sahoda has somewhere to plan for again.``
  **after**: `${has} lapsed. Reconnect ${them} and Sahoda has somewhere to plan for again.``
- **before**: `'Connect a channel first — Sahoda has nowhere to plan for.'`
  **after**: `'Connect a channel first. Sahoda has nowhere to plan for.'`

### `apps/web/src/lib/media/crop-offer.ts`

- **before**: `'States no size or shape rule — takes it as it is.'`
  **after**: `'States no size or shape rule. Takes it as it is.'`
- **before**: `'Will not take this file — cropping cannot fix it.'`
  **after**: `'Will not take this file. Cropping cannot fix it.'`
- **before**: ``inside the ${min}–${max} shape range``
  **after**: ``inside the ${min} to ${max} shape range``

### `apps/web/src/lib/media/mint.ts`

- **before** ×3: ` — try again.`
  **after**: `. Try again.`
- **before**: `'Sahoda does not crop moving images — it would freeze them.'`
  **after**: `'Sahoda does not crop moving images. It would freeze them.'`

### `apps/web/src/lib/onboarding/classify.ts`

- **before**: `'We could not read any of this from your words — pick below.'`
  **after**: `'We could not read any of this from your words. Pick below.'`
- **before**: ``We guessed ${list} — change it below if that is wrong.``
  **after**: ``We guessed ${list}. Change it below if that is wrong.``

### `apps/web/src/lib/onboarding/door-transport-failure.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `Create one and try again — your link or PDF has not been read either way.`
  **after**: `Create one and try again. Your link or PDF has not been read either way.`
- **before**: `Sign in again and press Read this — nothing about your link or PDF was the problem.`
  **after**: `Sign in again and press Read this. Nothing about your link or PDF was the problem.`

### `apps/web/src/lib/onboarding/door.ts`

- **before**: `and ignoring ${list} — ${KIND_REASON[choice.kind]}.``
  **after**: `and ignoring ${list}, because ${KIND_REASON[choice.kind]}.``

### `apps/web/src/lib/onboarding/questions.ts`

- **before**: `recovery on your Instagram — "it will give other people hope."`
  **after**: `recovery on your Instagram, because "it will give other people hope."`

### `apps/web/src/lib/onboarding/read-door.ts`

- **before**: `'Give us one thing to read — a link, a PDF, or a sentence about what you do.'`
  **after**: `'Give us one thing to read: a link, a PDF, or a sentence about what you do.'`
- **before**: `'The free reader found no text — switching to OCR, which reads pictures'`
  **after**: `'The free reader found no text, so it is switching to OCR, which reads pictures'`
- **before**: `MB — upload a shorter one, or tell us in your own words.``
  **after**: `MB. Upload a shorter one, or tell us in your own words.``

### `apps/web/src/lib/ops/action-state.ts`

- **before**: `'That change was not applied — your account cannot edit the board.'`
  **after**: `'That change was not applied. Your account cannot edit the board.'`
- **before**: `'That was not saved — your account cannot write QA runs.'`
  **after**: `'That was not saved. Your account cannot write QA runs.'`

### `apps/web/src/lib/ops/alpha-gate.ts`

- **before**: `It is not Trigger.dev — apps/jobs was never deployed there,`
  **after**: `It is not Trigger.dev, because apps/jobs was never deployed there`
- **before**: `The rest of the chain A12 names — real deploy, contact form, leads — is unbuilt,`
  **after**: `The rest of the chain A12 names (real deploy, contact form, leads) is unbuilt,`
- **before**: ``Sahoda Guide v0 — mascot, six tours and the sandbox seed brand.`
  **after**: ``Sahoda Guide v0: mascot, six tours and the sandbox seed brand.`
- **before**: `belongs to a platform A8 does not name — instagram 6 succeeded and linkedin`
  **after**: `belongs to a platform A8 does not name: instagram 6 succeeded and linkedin`
- **before**: `not re-checked since — this is that date’s reading, not today’s.`
  **after**: `not re-checked since. This is that date’s reading, not today’s.`
- **before**: `the Readability Guard and persistence all work — themeTokensFrom() derives the tokens`
  **after**: `the Readability Guard and persistence all work: themeTokensFrom() derives the tokens`

### `apps/web/src/lib/ops/cannot-prove.ts`

- **before**: `Five parts of the codebase — including the one that handles payments — have no test runner wired up,`
  **after**: `Five parts of the codebase, including the one that handles payments, have no test runner wired up,`

### `apps/web/src/lib/ops/changelog.ts`

- **before**: ``*${entry.kind}${codes} — ${entry.author}${when ? ` · ${when}` : ''}*``
  **after**: ``*${entry.kind}${codes} · ${entry.author}${when ? ` · ${when}` : ''}*``
- **before**: ``— ${entry.author}${when ? ` · ${when}` : ''}``
  **after**: ``by ${entry.author}${when ? ` · ${when}` : ''}``

### `apps/web/src/lib/ops/email.ts`

- **before**: `do not enter it — deny the request in /admin/credits instead.`
  **after**: `do not enter it. Deny the request in /admin/credits instead.`

### `apps/web/src/lib/ops/flow-history.ts`

- **before**: `'Today only — one day of history'`
  **after**: `'Today only, one day of history'`

### `apps/web/src/lib/ops/freshness.ts`

- **before**: `'Last sync unknown — nothing on this page can be trusted to be current'`
  **after**: `'Last sync unknown, so nothing on this page can be trusted to be current'`

### `apps/web/src/lib/ops/gate-history.ts`

- **before**: `'No gate runs landed in this window — the chart below is empty, not green.'`
  **after**: `'No gate runs landed in this window. The chart below is empty, not green.'`

### `apps/web/src/lib/ops/qa-draft.ts`

- **before**: `'Say in one line what you checked — this record is read later.'`
  **after**: `'Say in one line what you checked. This record is read later.'`
- **before**: `'Screenshots only — PNG, JPEG or WebP.'`
  **after**: `'Screenshots only. PNG, JPEG or WebP.'`

### `apps/web/src/lib/ops/qa-transfer.ts`

- **before**: `Import takes up to 0.9 MB at a time — split it and import each part.`
  **after**: `Import takes up to 0.9 MB at a time. Split it and import each part.`
- **before**: ``Nothing new — all ${payload.runs.length} runs were already recorded.``
  **after**: ``Nothing new. All ${payload.runs.length} runs were already recorded.``
- **before**: `but were not restored — the images live in a private bucket and do not travel in the JSON.`
  **after**: `but were not restored. The images live in a private bucket and do not travel in the JSON.`

### `apps/web/src/lib/ops/qa-upload.ts`

- **before**: `'That screenshot did not upload — check your connection.'`
  **after**: `'That screenshot did not upload. Check your connection.'`

### `apps/web/src/lib/ops/reset-scope.ts`

- **before**: `'Connected social accounts — no re-authorising'`
  **after**: `'Connected social accounts, no re-authorising'`
- **before**: `'Credits and the whole ledger — append-only, and the money record'`
  **after**: `'Credits and the whole ledger, append-only, and the money record'`
- **before**: `'Publish history — append-only evidence a post really went out'`
  **after**: `'Publish history, append-only evidence a post really went out'`

### `apps/web/src/lib/ops/roadmap-progress.ts`

- **before**: ``${task.code} is blocked — ${task.blocked_reason}``
  **after**: ``${task.code} is blocked: ${task.blocked_reason}``
- **before**: ``The ${suite} gate is red — fix it or supersede the run.``
  **after**: ``The ${suite} gate is red. Fix it or supersede the run.``

### `apps/web/src/lib/ops/waiting.ts`

- **before**: `'DIVAS — a decision'`
  **after**: `'DIVAS, a decision'`
- **before**: `'DIVAS — a decision, not engineering'`
  **after**: `'DIVAS, a decision, not engineering'`

### `apps/web/src/lib/playbooks/propose.ts`

- **before**: `in the business's own voice — ${festival.angle}. `
  **after**: `in the business's own voice: ${festival.angle}. `

### `apps/web/src/lib/posts/attach-decision.ts`

- **before**: `'Attached this file — some channels will not use it.'`
  **after**: `'Attached this file. Some channels will not use it.'`
- **before**: `'Check this file — no channel on this post can use it.'`
  **after**: `'Check this file. No channel on this post can use it.'`
- **before**: `'Re-upload this file — it could not be checked against the channel limits.'`
  **after**: `'Re-upload this file. It could not be checked against the channel limits.'`

### `apps/web/src/lib/posts/charge-failure.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: ` — you were not charged.`
  **after**: `. You were not charged.`

### `apps/web/src/lib/posts/connection-gap.ts`

- **before**: ``Nothing goes out at that time — ${names} ${verb} connected.``
  **after**: ``Nothing goes out at that time. ${names} ${verb} connected.``
- **before**: `on its own at around that time — but ${names} ${verb} connected,`
  **after**: `on its own at around that time, but ${names} ${verb} connected,`

### `apps/web/src/lib/posts/counters.ts`

- **before**: `"Instagram needs at least one photo — there`
  **after**: `"Instagram needs at least one photo. There`

### `apps/web/src/lib/posts/post-error.ts`

- **before** ×2: ` — reload and try again.`
  **after**: `. Reload and try again.`
- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'That post no longer exists — reload to see the current list.'`
  **after**: `'That post no longer exists. Reload to see the current list.'`

### `apps/web/src/lib/posts/publish-error-copy.ts`

- **before**: `'An event needs a name — it is the heading Google shows.'`
  **after**: `'An event needs a name. It is the heading Google shows.'`
- **before**: `Instagram needs at least one photo — there is no text-only post.`
  **after**: `Instagram needs at least one photo. There is no text-only post.`
- **before**: `It may still go live — check shortly.`
  **after**: `It may still go live. Check shortly.`

### `apps/web/src/lib/posts/schedule-status.ts`

- **before**: `"Nothing reached a platform — this ran as a simulation, and scheduled auto-publish isn't live yet.`
  **after**: `"Nothing reached a platform. This ran as a simulation, and scheduled auto-publish isn't live yet.`
- **before**: `"Out on some channels and not on others — scheduled auto-publish isn't live yet,`
  **after**: `"Out on some channels and not on others. Scheduled auto-publish isn't live yet,`
- **before**: `"Setting a time doesn't publish it — scheduled auto-publish isn't live yet.`
  **after**: `"Setting a time doesn't publish it. Scheduled auto-publish isn't live yet.`
- **before**: `"This time has passed and nothing was published — scheduled auto-publish isn't live yet.`
  **after**: `"This time has passed and nothing was published. Scheduled auto-publish isn't live yet.`
- **before**: `"Won't post itself — scheduled auto-publish isn't live yet.`
  **after**: `"Won't post itself. Scheduled auto-publish isn't live yet.`
- **before**: `'Nothing reached a platform — this ran as a simulation. Send it again to post it for real.'`
  **after**: `'Nothing reached a platform. This ran as a simulation. Send it again to post it for real.'`
- **before**: `'Out on some channels and not on others — check the channel status on the post.'`
  **after**: `'Out on some channels and not on others. Check the channel status on the post.'`
- **before**: `'This time has passed and it has not gone out yet — check the channel status on the post.'`
  **after**: `'This time has passed and it has not gone out yet. Check the channel status on the post.'`

### `apps/web/src/lib/posts/sniff-image.ts`

- **before**: `'Re-upload this file to check it — it looks incomplete, so it cannot be checked against the channel limits.'`
  **after**: `'Re-upload this file to check it. It looks incomplete, so it cannot be checked against the channel limits.'`
- **before**: `'Upload a JPEG, PNG, WebP or GIF — this file is not an image type the channels accept.'`
  **after**: `'Upload a JPEG, PNG, WebP or GIF. This file is not an image type the channels accept.'`

### `apps/web/src/lib/posts/sniff-video.ts`

- **before**: `'Upload an MP4 — this file is not a video type the channels accept.'`
  **after**: `'Upload an MP4. This file is not a video type the channels accept.'`

### `apps/web/src/lib/posts/to-attachment.ts`

- **before**: `'Re-upload this file to check it — its file size could not be read,`
  **after**: `'Re-upload this file to check it. Its file size could not be read,`
- **before**: `'Re-upload this file to check it — its file size is missing,`
  **after**: `'Re-upload this file to check it. Its file size is missing,`
- **before**: `'Re-upload this file to check it — its file type is missing,`
  **after**: `'Re-upload this file to check it. Its file type is missing,`

### `apps/web/src/lib/posts/violation-copy.ts`

- **before**: `//   engine: "instagram feed photos must be between 0.75:1 and 1.91:1 — this one is 0.56:1."`
  **after**: `//   engine: "instagram feed photos must be between 0.75:1 and 1.91:1. This one is 0.56:1."`
- **before**: `//   engine: "instagram needs at least one photo — there is no text-only post."`
  **after**: `//   engine: "instagram needs at least one photo. There is no text-only post."`
- **before**: `MEDIA_REQUIRED: 'This channel has no text-only post — attach at least one photo.',`
  **after**: `MEDIA_REQUIRED: 'This channel has no text-only post. Attach at least one photo.',`
- **before**: ``^(?:${CHANNEL}) feed photos must be between ${DECIMAL}:1 and ${DECIMAL}:1 — this one is ${DECIMAL}:1\\.$``
  **after**: ``^(?:${CHANNEL}) feed photos must be between ${DECIMAL}:1 and ${DECIMAL}:1\\. This one is ${DECIMAL}:1\\.$``
- **before**: ``^(?:${CHANNEL}) needs at least one photo — there is no text-only post\\.$``
  **after**: ``^(?:${CHANNEL}) needs at least one photo\\. There is no text-only post\\.$``
- **before**: ``^(?:(?:${CHANNEL}) has no text-only post — this one needs at least one photo\\.``
  **after**: ``^(?:(?:${CHANNEL}) has no text-only post\\. This one needs at least one photo\\.``
- **before**: ``^A story is taller than it is wide — this photo is ${DECIMAL}:1\\. ``
  **after**: ``^A story is taller than it is wide\\. This photo is ${DECIMAL}:1\\. ``
- **before**: ``holds ${NUM}\\. Splitting it would cut it in half — shorten it, or put it on ``
  **after**: ``holds ${NUM}\\. Splitting it would cut it in half\\. Shorten it, or put it on ``
- **before**: ``\|A story is a picture — this one has none attached\\.``
  **after**: ``\|A story is a picture\\. This one has none attached\\.``
- **before**: ``\|This was written as a single photo but has ${NUM} attached — choose a set instead\\.)$``
  **after**: ``\|This was written as a single photo but has ${NUM} attached\\. Choose a set instead\\.)$``

### `apps/web/src/lib/privacy/archive.ts`

- **before**: ``not in the archive — this download has a size limit. Ask Sahoda and we will ``
  **after**: ``not in the archive, because this download has a size limit. Ask Sahoda and we will ``

### `apps/web/src/lib/privacy/export.ts`

- **before**: `It is not empty — it simply cannot be included from here.`
  **after**: `It is not empty. It simply cannot be included from here.`

### `apps/web/src/lib/privacy/readable.ts`

- **before**: `${escapeHtml(f.prefix)} — ${escapeHtml(f.reason)}`
  **after**: `${escapeHtml(f.prefix)}: ${escapeHtml(f.reason)}`
- **before**: `' <b>(shortened — see below)</b>'`
  **after**: `' <b>(shortened, see below)</b>'`
- **before**: `<li><code>data.json</code> — every row, exactly as it is stored.`
  **after**: `<li><code>data.json</code>: every row, exactly as it is stored.`
- **before**: `<li><code>files/</code> — ${payload.files.length} of your pictures and documents`
  **after**: `<li><code>files/</code>: ${payload.files.length} of your pictures and documents`
- **before**: `<li><code>your-data.html</code> — this page.</li>`
  **after**: `<li><code>your-data.html</code>: this page.</li>`
- **before**: `No records were left out — but some of your FILES were, and they are named above.`
  **after**: `No records were left out, but some of your FILES were, and they are named above.`
- **before**: `Nothing yet — this workspace has no saved work.`
  **after**: `Nothing yet. This workspace has no saved work.`
- **before**: `settle a disagreement about a charge — in your favour as easily as ours — and Indian tax and`
  **after**: `settle a disagreement about a charge, in your favour as easily as ours, and Indian tax and`
- **before**: `that should not be, say so — an export that reads as complete and is not would be the worst`
  **after**: `that should not be, say so. An export that reads as complete and is not would be the worst`

### `apps/web/src/lib/radar/brief.ts`

- **before**: ``Answer from our own position — ${brandBasis.field}:`
  **after**: ``Answer from our own position, ${brandBasis.field}:`

### `apps/web/src/lib/radar/fixtures.ts`

- **before**: `'same-day freshness, so the answer is what a weekend combo cannot copy — ' +`
  **after**: `'same-day freshness, so the answer is what a weekend combo cannot copy. ' +`

### `apps/web/src/lib/wallet/balance.ts`

- **before**: ``${credits} ${expiry} — those credits are held by ${action} and are not released ``
  **after**: ``${credits} ${expiry}. Those credits are held by ${action} and are not released ``
- **before**: ``${credits} ${expiry} — those credits are held by ${action}. Sahoda releases ``
  **after**: ``${credits} ${expiry}. Those credits are held by ${action}. Sahoda releases ``

### `apps/web/src/lib/wallet/entry-copy.ts`

- **before**: `'Reserved while this action runs — returned in full if it does not complete.'`
  **after**: `'Reserved while this action runs. Returned in full if it does not complete.'`

### `apps/web/src/lib/workspace-bootstrap.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`
- **before**: `'That name is taken — try a different one.'`
  **after**: `'That name is taken. Try a different one.'`

### `apps/web/src/lib/workspaces.ts`

- **before**: ` — try again.`
  **after**: `. Try again.`

### `packages/billing/src/plans/downgradeImpact.ts`

- **before**: ``You have ${list}. Nothing is removed — you keep what you have built, ``
  **after**: ``You have ${list}. Nothing is removed. You keep what you have built, ``

### `packages/publishing/src/adapters/zernio.ts`

- **before**: ``${channel} is still processing this post — no live link yet.``
  **after**: ``${channel} is still processing this post. No live link yet.``
- **before**: `needs at least one photo — there is no text-only post.`
  **after**: `needs at least one photo. There is no text-only post.`

### `packages/publishing/src/format-refusal.ts`

- **before**: `'A story is a picture — this one has none attached.'`
  **after**: `'A story is a picture. This one has none attached.'`
- **before**: ``${channel} has no text-only post — this one needs at least one photo.``
  **after**: ``${channel} has no text-only post. This one needs at least one photo.``
- **before**: ``A story is taller than it is wide — this photo is ${aspect.toFixed(2)}:1.`
  **after**: ``A story is taller than it is wide. This photo is ${aspect.toFixed(2)}:1.`
- **before**: `but has ${mediaCount} attached — choose a set instead.``
  **after**: `but has ${mediaCount} attached. Choose a set instead.``

### `packages/publishing/src/format-rules.ts`

- **before**: `need: 'No photo — words only.'`
  **after**: `need: 'No photo, words only.'`
- **before**: `need: 'One upright photo — 9:16 is the shape Instagram fills.'`
  **after**: `need: 'One upright photo. 9:16 is the shape Instagram fills.'`

### `packages/publishing/src/oauth/common.ts`

- **before** ×2: ` — restart the connect flow.`
  **after**: `. Restart the connect flow.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `packages/publishing/src/oauth/gbp.ts`

- **before** ×4: ` — restart the connect flow.`
  **after**: `. Restart the connect flow.`
- **before**: ` — try again.`
  **after**: `. Try again.`

### `packages/publishing/src/thread-plan.ts`

- **before**: `Splitting it would cut it in half — shorten it, or put it on its own line.`
  **after**: `Splitting it would cut it in half. Shorten it, or put it on its own line.`

### `packages/publishing/src/x-cost.ts`

- **before**: ``X charges Sahoda for every post, so the rest are held until the month turns — ` +`
  **after**: ``X charges Sahoda for every post, so the rest are held until the month turns. ` +`

### `packages/publishing/src/zernio/platform-data.ts`

- **before**: `'A Google button needs somewhere to go — add the web address it opens.'`
  **after**: `'A Google button needs somewhere to go. Add the web address it opens.'`

### `packages/publishing/src/zernio/recovery.ts`

- **before**: ``Google posts can’t be ${what} from here — open your Business Profile to change it.``
  **after**: ``Google posts can’t be ${what} from here. Open your Business Profile to change it.``
- **before**: ``Instagram posts can’t be ${what} from here — open Instagram to change it.``
  **after**: ``Instagram posts can’t be ${what} from here. Open Instagram to change it.``
- **before**: ``LinkedIn posts can’t be ${what} from here — open LinkedIn to change it.``
  **after**: ``LinkedIn posts can’t be ${what} from here. Open LinkedIn to change it.``

### `packages/publishing/src/zernio/variant-options.ts`

- **before**: `'An event needs a name — it is the heading Google shows.'`
  **after**: `'An event needs a name. It is the heading Google shows.'`
- **before**: `answers — this one has ${options.length}.``
  **after**: `answers. This one has ${options.length}.``
- **before**: `characters — this one has ${Array.from(question).length}.``
  **after**: `characters. This one has ${Array.from(question).length}.``
- **before**: `characters — “${tooLong.slice(0, 30)}…” is longer.``
  **after**: `characters. “${tooLong.slice(0, 30)}…” is longer.``

### `packages/research/src/crawl-site.ts`

- **before**: `'Check that website address — we could not read it as a link.`
  **after**: `'Check that website address. We could not read it as a link.`
- **before**: `'Could not reach that website — check the address, or tell us in your own words instead.'`
  **after**: `'Could not reach that website. Check the address, or tell us in your own words instead.'`
- **before** ×2: `'Could not read your website just now — we will ask you instead.'`
  **after**: `'Could not read your website just now. We will ask you instead.'`
- **before**: `'No website to read — we will ask you instead.'`
  **after**: `'No website to read. We will ask you instead.'`
- **before**: `not enough writing to learn your voice — tell us in your own words instead.`
  **after**: `not enough writing to learn your voice. Tell us in your own words instead.`
- **before**: `so we could not read it — tell us in your own words instead.`
  **after**: `so we could not read it. Tell us in your own words instead.`

### `packages/shared/src/billing/gst.ts`

- **before**: ` — check the 15 characters`
  **after**: `. Check the 15 characters`

### `packages/shared/src/brand/resolve.ts`

- **before**: `'Your brand, handled — while you run the shop.'`
  **after**: `'Your brand, handled, while you run the shop.'`

### `packages/shared/src/gate/packs.ts`

- **before**: `and how it was measured — "rated 4.8 by 300 customers" says more than "No.1"`
  **after**: `and how it was measured. "rated 4.8 by 300 customers" says more than "No.1"`
- **before**: `and what customers have seen — "most clients see X within Y" — rather than promising the outcome.`
  **after**: `and what customers have seen ("most clients see X within Y") rather than promising the outcome.`
- **before**: `does and who it suits — "manages", "relieves", "supports recovery from" — and leave the outcome to the clinician.`
  **after**: `does and who it suits ("manages", "relieves", "supports recovery from") and leave the outcome to the clinician.`
- **before**: `the cohort it came from — "62 of 80 placed in 2025" — which is more persuasive than a guarantee nobody believes.`
  **after**: `the cohort it came from ("62 of 80 placed in 2025"), which is more persuasive than a guarantee nobody believes.`
- **before**: `the ingredient and what it is — "made with millet, high in fibre" — without attaching it to a condition.`
  **after**: `the ingredient and what it is ("made with millet, high in fibre") without attaching it to a condition.`

### `packages/shared/src/gate/resolve-ruleset.ts`

- **before**: `'Say it in your own words — this is a phrase you ruled out, not a rule about us.'`
  **after**: `'Say it in your own words. This is a phrase you ruled out, not a rule about us.'`

### `packages/shared/src/inbox/send-window.ts`

- **before**: ``Replies are open — ${platform} allows a free-form reply`
  **after**: ``Replies are open. ${platform} allows a free-form reply`

### `packages/shared/src/playbooks/festivals.ts`

- **before**: `'only if you have something real to say about it — otherwise skip'`
  **after**: `'only if you have something real to say about it, otherwise skip'`

### `packages/shared/src/playbooks/recipes.ts`

- **before**: `'Something new appears on a feed you follow — your own blog, an industry site.'`
  **after**: `'Something new appears on a feed you follow: your own blog, an industry site.'`
- **before**: `'somewhere for Sahoda to learn that a product exists — a catalogue connection or a form on your site'`
  **after**: `'somewhere for Sahoda to learn that a product exists: a catalogue connection or a form on your site'`

### `packages/shared/src/publishing/constraints.ts`

- **before**: `:1 — this one is ${aspect.toFixed(2)}:1.``
  **after**: `:1. This one is ${aspect.toFixed(2)}:1.``
- **before**: `It is the channel's own limit, not a Sahoda one — ` +`
  **after**: `It is the channel's own limit, not a Sahoda one. ` +`
- **before**: `needs at least one photo — there is no text-only post.`
  **after**: `needs at least one photo. There is no text-only post.`

---

## Every dash deliberately kept, and why

### The absence mark (8 sites, docs/26 §4)

A dash that IS the whole string value means "we have no measurement here". It is a UI
token, guards assert it, and `golden-path.spec.ts:138` asserts a credit chip does *not*
carry it. All eight are untouched.

| file | line |
| --- | --- |
| `apps/web/src/app/(app)/settings/plan/page.tsx` | 112 |
| `apps/web/src/components/analytics/figure.tsx` | 48 |
| `apps/web/src/components/media/crop-outcomes.tsx` | 52 |
| `apps/web/src/components/onboarding/stage/refs.ts` | 61 |
| `apps/web/src/components/onboarding/stage/steps/result-step.tsx` | 57, 58, 59 |
| `apps/web/src/lib/analytics/copy.ts` | 198 |
| `apps/web/src/lib/ops/qa-console.ts` | 27 |

### Three more, each for a stated reason

**`apps/web/src/lib/ops/card-copy.ts:17` — `TECHNICAL_MARKER`.** Not prose. It is a parse
sentinel. `scripts/ops-cards-write.mjs` writes `${plain}${TECHNICAL_MARKER}${technical}`
into the `detail` column of every `ops_tasks` row in production, and `splitCardDetail`
finds the technical half by searching for it. This was changed to a colon and then
REVERTED, because `card-copy.test.ts` proved the round-trip breaks: every existing board
card would render its technical half inline as plain text. Changing it needs a prod
rewrite of the board, not a copy edit.

**`apps/web/src/components/onboarding/stage/progress-bar.tsx:23` — the step counter
`01 — 06`.** LOGGED FOR THE UI LANE, not fixed. The component's own docstring says "The
count lives in type (`01 — 06`)", so the dash is a deliberate typographic device in the
founder's onboarding package rather than a sentence. The `role="progressbar"` beside it
carries `aria-label`, `aria-valuenow`, `aria-valuemin` and `aria-valuemax`, so the
accessible name does not depend on the glyph. Replacing it with `/`, `of` or a middot is a
design decision about that counter, and the lane that owns the screen should make it.

**`packages/mesh/src/providers/openai-compatible.ts:90`.** A `ProviderCallError` message.
It reaches telemetry, never a person.

### Whole files excluded before editing, with the reason

| file or prefix | why it is out of scope |
| --- | --- |
| `packages/mesh/src/tasks/**` | generation prompts. P3c and docs/22 §4: nothing from Sahoda's interface ruling may reach a customer's caption. |
| `packages/mesh/src/brand-context.ts` | the grounded prompt prefix, same reason |
| `packages/mesh/src/engine.ts` | a retry instruction sent to the model |
| `packages/research/src/quarantine.ts` | the prompt-injection quarantine wrapper |
| `apps/web/src/lib/sites/tokens-css-inline.ts` | generated CSS mirrored from `tokens.css` |
| `apps/web/src/lib/radar/evidence.ts` | a regex literal: the dashes are matched characters |
| `apps/web/src/lib/design/{ink-faint,eyebrow}-exceptions.ts` | developer registries read only by their own tests |
| `apps/web/src/lib/{env,clerk-key-guard}.ts` | server console warnings |
| `apps/web/src/lib/testing/e2e-target-report.ts` | CLI output |
| `packages/*/src/**/env.ts`, `test-helpers/`, `tests/helpers/`, `*.fixtures.ts` | throws on missing env, and test fixtures |
| `scripts/lib/ops-cards.mjs` | 110 dashes in board card titles and details that are ALREADY WRITTEN into prod's `ops_tasks`. Editing the source list without re-writing the board makes `ops-cards-write.mjs --check` fail. Needs an owner decision plus a prod write. |

## The one coupling that would have failed silently

`apps/web/src/lib/posts/violation-copy.ts` anchors a regex against every sentence the
Constraint Engine emits and substitutes a vaguer fallback when it does not match. Six
sentences changed, so the six patterns changed in the same commit.

VERIFIED by mutation rather than by a green suite: putting the old dash back into the
`MEDIA_REQUIRED` pattern alone turns `instagram needs at least one photo. There is no
text-only post.` into `This channel has no text-only post. Attach at least one photo.` and
fails the canary in `violation-copy.test.ts`. Without moving the guard, every channel
refusal in the editor would have quietly lost its numbers and its channel name.

## Tests

22 assertions across 20 files. Fourteen pinned a whole sentence and were updated to the
new sentence. Eight checked a claim through a lowercase substring (`reconnect it`,
`reconnect them`, `nothing was charged`, `reload to try again`, `keep reviewing posts
before they go live`, `not enough to show a trend`) that only read lowercase because it
sat mid-sentence after a dash; those now match case-insensitively, so they still assert
the claim and no longer assert the punctuation around it.

No assertion was deleted, and none was weakened in what it checks.

## The AI-slop sweep found almost nothing

Measured across `apps/web/src` and `packages`, comments stripped, over 35 patterns:
`seamless`, `elevate`, `unlock`, `leverage`, `robust`, `comprehensive`, `delve`,
`vibrant`, `tapestry`, `testament`, `pivotal`, `showcase`, `underscore`, `foster`,
`crucial`, `intricate`, `enhance`, `streamline`, `empower`, `cutting-edge`,
`game-changer`, `effortless`, `nestled`, `renowned`, `stunning`, `breathtaking`,
`groundbreaking`, `Let's` openers, signposting, servility, aphorism formulas, hedging
stacks, filler phrases, inflated claims, staccato tailing negations and emoji.

**Zero hits in user-facing interface copy.** Every match was one of: a test fixture, a
deliberate example of a banned phrase (`banned_phrases: ['revolutionary', 'game-changer']`
is the feature), a TypeScript non-null assertion `!` matching the exclamation pattern, or
an identifier (`unlocked`, `underscore`).

**Exclamation marks: one candidate, and it is `portSingleton!.balance(...)`.** The peer
who removed `Welcome back!` from `/sign-in` took the last real one.

**Rule-of-three triads found, and deliberately left:** `/settings/plan`'s "Every entry,
what it was for, and what it cost" and the Loop strip's "Last week's numbers, unanswered
messages, and anything Radar picked up". Both enumerate three things that actually exist
(three ledger columns; three real Loop inputs). The humanizer's own false-positive clause
covers these: a triad is a tell when it is padding, not when the three things are real.

**Curly quotes** stay, per CLAUDE.md and §19's false-positive clause.
