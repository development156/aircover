# 31 · Your data — export and deletion

**Date:** 2026-08-19 · **Superseded 2026-08-23.**

> **Read [38_Data_Handling.md](38_Data_Handling.md) instead.** That document is the current one and
> it is written for a lawyer. This page is kept because it is the record of a decision — it argued,
> correctly at the time, that a deletion button would be a lie, and it specified the function that
> would make one honest. That function now exists
> (`packages/db/supabase/migrations/20260823000000_dpdp_erasure.sql`) and the button is real.
>
> **Three things below are now WRONG and are left in place rather than quietly corrected**, because
> the reason they went wrong is the point:
>
> | said | actually | why it matters |
> | --- | --- | --- |
> | "30 tables" | **47** on 2026-08-23 | a number in prose is a claim nobody checks |
> | "15 of 30 have no member DELETE policy" | **26 of 47** | same |
> | "your name, email and sign-in belong to Clerk … and are deleted with your account" | a copy lives in `users_profile` in **our** database | the sweep it was derived from cannot see a table keyed by `user_id` |
>
> Every figure in doc 38 is re-measured by a test on every gate run instead of being written down.

India's DPDP Act gives a person the right to a copy of their data and the right to have it erased.
This page was two things at once: the plain-language answer a shop owner should get, and the
engineering record of what was built, what was not, and exactly why.

---

## Part 1 — For the person asking

### Taking a copy: **built, works today**

Settings → Your data → **Download my data**. One JSON file containing everything in your workspace:
your posts and the separate wording for each channel, your Brand Brain, your conversations and
enquiries, your linked accounts, every credit movement, and how your posts performed.

**The file also lists anything it could not include, and why.** That matters more than it sounds. If
a section were simply missing, you would have no way to tell "I have none of these" from "this was
left out" — so the file never shows an empty list where the truth is "we could not read it". One
thing is in that list today, and it is named in Part 2.

### Asking for deletion: ~~by request, not self-serve~~ **BUILT 2026-08-23**

> Settings → Your data → **Delete everything**. Two steps, the second typed. See doc 38 §4.

The original text follows, and the reasoning in it is still correct about why a client-driven button
would have been a lie:

> Email **support@sahodalabs.com** from the address you signed up with. It is done by hand today.
> The button is not there because a button would delete about half of it and tell you it had
> finished — and you would have no way to know. Part 2 says exactly what stands in the way.

### What is removed, and what is kept

| Removed | Kept |
| --- | --- |
| Your posts, and the per-channel wording of each | Your credit and payment record |
| Your pictures and where they were used | |
| Your Brand Brain — voice, values, customers | |
| Conversations, comments and reviews | |
| Enquiries from your website forms | |
| Your websites, their pages and sections | |
| Your linked social accounts | |
| Your campaigns, templates and planner | |

**Why the credit record is kept.** It is the account of what you paid and what you were charged. It
is the only thing that can settle a disagreement about a charge, in your favour as easily as ours,
and Indian tax and company law requires financial records to be retained for years regardless of
anything else. Erasing it would leave you with no evidence of your own purchases.

**Be told plainly what that record contains about you.** Amounts, dates, what each charge was for,
and who took the action. For almost every row that last one is a long code from our sign-in
provider rather than your name — but it is still a reference to you, and it stays. One row in the
whole system records an email address instead. We would rather say that than let you believe the
record is anonymous when it is not.

Nothing else about you is kept. Your name, email and sign-in belong to Clerk, our sign-in provider,
and are deleted with your account.

---

## Part 2 — The engineering record

### What "everything you own" means, and how the list is derived

A workspace's data is every table carrying a `workspace_id`. That is a fact about the schema, so it
is derived from the schema rather than typed out:

```sql
select c.table_name from information_schema.columns c
join information_schema.tables t using (table_schema, table_name)
where t.table_type = 'BASE TABLE'
  and c.table_schema = 'public' and c.column_name = 'workspace_id'
```

**MEASURED 2026-08-19: 30 tables.** `apps/web/src/lib/privacy/export-drift.test.ts` runs that query
against the live database and fails, naming the table, if the manifest and the schema ever disagree.
It skips without a database URL rather than failing in the sandbox — a suite that is red for a
non-defect is a suite people stop reading.

Proven by mutation:

| mutant | result |
| --- | --- |
| `leads` removed from the manifest | **fails**, naming `leads` as missing from every export |
| `ai_provider_logs` declared readable | **fails**: "manifest says readable, policies say no-read-policy" |

### The one table the export cannot include

`ai_provider_logs` has **RLS enabled and no policies at all**. PostgREST answers `[]` for it — not an
error. So an export that rendered it as an empty array would be asserting "you have no AI usage
records", which is false, in a document a customer may hand to a regulator. It is listed in
`notIncluded` by name, with the reason.

This is the general trap the whole module is shaped around: **the only thing worse than an
incomplete export is an incomplete export that reads as complete.** Three ways it could happen, all
closed — a table with no read policy, a read that fails, and a table nobody remembered.

### Why the export runs under RLS and not a service role

`apps/web` has no service-role client on purpose (`lib/supabase/server.ts`: "RLS is the security
boundary"). An export endpoint holding a key that bypasses RLS would be the single most attractive
thing in this codebase to aim at another tenant. The cost is that the export contains what the
signed-in member may read — which is the correct answer to "export **my** data" anyway.

### Why deletion is not built, stated precisely

**MEASURED from `pg_policies`: 15 of the 30 workspace tables have no DELETE policy for members.**

| deletable under member RLS (15) | NOT deletable (15) |
| --- | --- |
| assets, asset_usages, campaigns, campaign_posts, connections, planner_events, post_media, post_variants, posts, sites, site_pages, site_sections, templates, tour_progress, workspace_themes | **brand_memory**, **inbox_messages**, **inbox_threads**, **leads**, ai_provider_logs, audit_logs, credit_balances, credit_ledger, memory_events, ops_credit_requests, post_metric_snapshots, post_publish_logs, subscriptions, workspace_members, zernio_profiles |

The bolded four are the problem. They hold the **most** personal data in the product — the entire
Brand Brain, every customer conversation, and the names, emails and phone numbers captured by site
forms — and a member cannot delete any of them. `brand_memory` and `memory_events` carry
`app.apply_tenant_read_policy`, which grants SELECT only, by design.

So a "Delete everything" button in `apps/web` would delete the 15 it can, report success, and leave
the Brand Brain and the inbox in place. That is worse than no button: the failure is invisible and
the customer believes their data is gone.

**Also relevant:** `ops_workspace_reset`, the RPC the admin Danger Zone calls, **does not exist** —
not in the database and not in any migration file. That panel has never worked; it returns
"Reset is not available yet". It is not a usable reference for what deletion should do, and this
document replaces it as one.

### What it would take

One migration, owned by `wt-db`, adding a `SECURITY DEFINER` function — the same shape and for the
same three reasons `ops-reset.ts` already documents:

1. **One transaction.** Fifteen sequential deletes have none; a failure on the eighth leaves a
   half-deleted workspace with no resume path and no record of where it stopped.
2. **The SELECT-only tables.** No client can delete `brand_memory` or `memory_events` at all.
3. **Identity.** The caller's RLS identity and the right to erase are different questions.

It must delete in foreign-key order, scope every statement by `workspace_id`, and **leave
`credit_ledger` and `credit_balances` untouched** — the ledger is append-only and never lies, and a
deletion path that could write to it would be a bigger integrity problem than the one it solves.

### The conflict this document refuses to resolve silently

MEASURED across all 152 `credit_ledger` rows on 2026-08-19:

| `actor` | rows |
| --- | --- |
| null | 104 |
| `demo_seed_*` | 22 |
| **Clerk user id** (`user_…`) | **21** |
| **a plain email address** | **1** (a GRANT) |
| test/integration markers | 4 |

The 21 Clerk ids are pseudonymous identifiers tied to identifiable people. The single email address
is direct personal data with no pseudonymity at all, and it is the more awkward of the two — it is
one row, and it is in the record that must be retained.

**`meta` does NOT carry user identifiers.** This was assumed and then checked:
`select count(*) from credit_ledger where meta::text like '%user_%'` returns **0**. So `actor` is the
whole of the exposure, which makes it a smaller problem than it first looked and a precisely bounded
one.

Retention under a legal obligation is a valid ground, so the position taken is: **keep the ledger
intact, and tell the customer in plain words that it contains a reference to them.** Part 1 does
exactly that.

The alternative — redacting `actor` on request (21 rows, plus the one email) — was considered and
rejected. It is an UPDATE on an
append-only ledger, performed to satisfy a deletion request, which trades a stated retention for a
silent mutation of financial records. If the founder or counsel decides redaction is required, it is
a decision to take deliberately and write down, not one an implementation should make on its own.

### Not done on this run

- ~~**The deletion RPC.**~~ **BUILT 2026-08-23** as `public.erase_workspace`, to this specification,
  with two additions this page did not anticipate: `ledger_actor_redactions` is retained alongside
  the ledger (erasing the marker would silently re-disclose the identity it suppresses), and
  `users_profile` is removed for anybody left with no workspace at all.
- **A retention period.** Still not answered. Nothing in this product expires anything on a
  schedule. Doc 38 §6 states that as an open question rather than leaving it implied.
