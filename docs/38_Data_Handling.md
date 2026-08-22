# 38 · How Sahoda handles your data

**For:** the founder, and whoever the founder hands this to · **Date:** 2026-08-23 ·
**Supersedes:** [31_Your_Data.md](31_Your_Data.md)

This document is written to be read by a lawyer, not by an engineer. It says what Sahoda holds
about a customer, who else sees it, what a customer gets when they ask for a copy, what happens
when they ask for it to be deleted, and what is kept anyway and why.

India's **Digital Personal Data Protection Act, 2023** is the law this is written against. Two of
its rights drive everything below: the right to **access** a copy of your data (§11) and the right
to have it **erased** (§12). Both are built and both work from a screen in the product today.

**Every number here is measured, and none of it is measured by hand.** That matters because the
document this replaces was measured by hand and three of its figures were wrong within four days of
being written. The tables, the counts and the retention decisions in §3 and §4 are read out of the
database's own catalogue by tests that run on every build — `packages/db/tests/export_manifest.pglite.test.ts`,
`deletion_reach.pglite.test.ts` and `erasure.pglite.test.ts`. If somebody adds a table and does not
account for it here, the build fails and names it.

---

## 1 · In one page

| Question | Answer |
| --- | --- |
| Where is the data? | India — Supabase's `ap-south-1` region (Mumbai). |
| Can a customer get a copy? | Yes. Settings → Your data → Download my data. A zip with a readable page, every row as JSON, and every file. |
| Can a customer delete everything? | Yes. Settings → Your data → Delete everything. Two steps, the second typed. |
| Is anything kept after deletion? | The credit and payment record and the tax invoices. Nothing else. |
| Why is that kept? | It is the account of what was paid and charged, and Indian tax and company law requires financial records to be retained for years. |
| Does the kept record identify the person? | **Yes.** It carries a sign-in reference code, and one row in the whole system carries a plain email address. This is disclosed to the customer in the product, not buried here. See §5. |
| Does the product delete anything on a schedule? | **No.** Nothing expires. See §6 — this is an open question, not a decision. |
| Who else receives customer data? | Eleven processors. See §7. |
| Is there anything a customer asks for that we cannot give them? | One table, `ai_provider_logs`, which the app has no permission to read. It is named in the export by name rather than shown as empty. See §3. |

---

## 2 · What "the data" is

A Sahoda customer is a **business**, and their data is everything under one **workspace**. That is
not a description somebody wrote down — it is a fact about how the database is built: every table
holding a customer's data carries a `workspace_id` column, and the boundary between two customers is
enforced by the database itself (PostgreSQL row-level security), not by the application.

**MEASURED 2026-08-23: 47 tables.** They are listed in full in §3.

Three tables hold personal data and do **not** carry a `workspace_id`, so they are invisible to any
sweep built on that rule. This was a real gap and it is worth stating plainly because it is the kind
of gap that is easy to have and hard to notice:

| table | what it holds | what happens now |
| --- | --- | --- |
| `workspaces` | the business name, its address in the product, its settings | **exported**, and redacted rather than deleted — see §4 |
| `users_profile` | the customer's **email address**, display name and picture | **exported**, and deleted when they have no workspace left |
| `connection_secrets` | the keys that let Sahoda post to the customer's social accounts | **never exported** — named in the file as a deliberate omission — deleted with the account |

The document this replaces told customers that their name and email "belong to Clerk, our sign-in
provider, and are deleted with your account." A copy has lived in `users_profile` in Sahoda's own
database since July. That sentence was wrong, and it was wrong because it was derived from the same
`workspace_id` sweep that cannot see the table.

---
## 3 · Every table, what personal data it holds, and what happens to it

The columns below are the ones that name or describe a **person**, read from the database's own
catalogue rather than typed out. "No direct identifiers" means the row is about the business's work
rather than about a named individual — it does not mean the row is anonymous, because everything in
the table belongs to one identified workspace.

| table | what it is, in the customer's words | columns naming a person | on deletion |
| --- | --- | --- | --- |
| `ai_provider_logs` | AI usage records | no direct identifiers | removed |
| `asset_derivatives` | the per-channel crops made from your pictures | `created_by` | removed |
| `asset_usages` | where each picture is used | no direct identifiers | removed |
| `assets` | your picture library | `title` `created_by` | removed |
| `audience_snapshots` | who follows you | no direct identifiers | removed |
| `audit_logs` | a record of admin actions | `actor` | removed |
| `billing_profiles` | who your invoices are made out to | `legal_name` `address` `billing_email` | removed |
| `brand_memory` | your Brand Brain | `payload` `created_by` | removed |
| `campaign_posts` | posts inside campaigns | no direct identifiers | removed |
| `campaigns` | your campaigns | `name` `created_by` | removed |
| `competitor_subscriptions` | the businesses you asked Radar to watch | `created_by` | removed |
| `connections` | your linked accounts | `created_by` | removed |
| `credit_balances` | your credit balance | no direct identifiers | **kept** |
| `credit_ledger` | every credit movement | `actor` | **kept** |
| `inbox_messages` | messages and comments | `body` `author_user_id` | removed |
| `inbox_threads` | conversations | `author_name` `body` | removed |
| `invoices` | your tax invoices and credit notes | `supplier_legal_name` `recipient_legal_name` | **kept** |
| `knowledge_chunks` | the passages your documents were split into | no direct identifiers | removed |
| `knowledge_documents` | the documents you added to the knowledge library | `title` `content_sha256` `addressed_instructions` `created_by` | removed |
| `leads` | enquiries from your site | `name` `email` `phone` `payload` | removed |
| `ledger_actor_redactions` | whether your name is shown on your credit record | no direct identifiers | **kept** |
| `loop_briefs` | what the Loop planned each week | `title` `body` | removed |
| `loop_channel_autonomy` | how much the Loop may do on each channel | `created_by` | removed |
| `loop_cycles` | every week the Loop ran | `created_by` | removed |
| `loop_settings` | your Loop settings | no direct identifiers | removed |
| `memory_events` | changes to your Brand Brain | no direct identifiers | removed |
| `ops_credit_requests` | credit top-up requests | no direct identifiers | removed |
| `planner_events` | your planner | `title` | removed |
| `playbook_run_items` | what each playbook run produced | `title` `body` | removed |
| `playbook_runs` | every playbook run | `created_by` | removed |
| `playbooks` | your playbooks | `created_by` | removed |
| `post_media` | pictures attached to posts | no direct identifiers | removed |
| `post_metric_snapshots` | how your posts performed | no direct identifiers | removed |
| `post_publish_logs` | every publish attempt | no direct identifiers | removed |
| `post_variants` | the per-channel wording | `body` | removed |
| `posts` | your posts | `title` `body` `created_by` | removed |
| `remix_batches` | your Remix runs | `source_title` `created_by` | removed |
| `remix_derivatives` | the drafts each Remix run produced | no direct identifiers | removed |
| `site_pages` | the pages of your sites | `title` | removed |
| `site_sections` | the sections on those pages | `content` | removed |
| `sites` | your websites | `name` `created_by` | removed |
| `subscriptions` | your plan | no direct identifiers | removed |
| `templates` | your saved templates | `name` `body` `created_by` | removed |
| `tour_progress` | which tours you have seen | `user_id` | removed |
| `workspace_members` | who is on this workspace | `user_id` | removed |
| `workspace_themes` | your colours | `created_by` | removed |
| `zernio_profiles` | the publishing profile id | no direct identifiers | removed |
| `zernio_webhook_events` | what the platforms told Sahoda about your accounts | `payload` | removed |

**Retention: none of these expires.** Every row above is kept for as long as the workspace exists
and is removed when the workspace is deleted. See §6.

### The three that need a sentence of their own

**`leads` — the only table holding a THIRD PARTY's personal data.** A lead is somebody who filled in
a form on the customer's website: their name, email and phone number. They are not the Sahoda
customer, they never agreed to anything with Sahoda, and Sahoda holds their contact details on the
customer's behalf. Under DPDP the customer is the one with the relationship to that person; Sahoda
processes it for them. It is exported with the rest and deleted with the rest.

**`inbox_messages` and `inbox_threads` — other people's words.** Comments, reviews and direct
messages sent to the customer's social accounts, including the sender's display name. Same shape as
`leads`: real people who are not the customer.

**`ai_provider_logs` — the one thing the export cannot include.** Row-level security is switched on
for this table and it has no read policy at all, so the application has no permission to read it,
for anybody. A database queried this way answers with an empty list rather than an error — which is
indistinguishable from "you have none". The export therefore **names it, with the reason**, and never
renders it as an empty section. It is deleted with everything else.

### Tables that exist and are NOT a customer's data

Named here so that "we hold nothing else" is a statement somebody can check rather than a promise.
Every one of these is listed inside the export itself, in the customer's own words, with the reason —
because an omission a customer cannot see is a lie by silence.

| table | what it is | why it is not the customer's |
| --- | --- | --- |
| `connection_secrets` | encrypted access keys for the customer's linked accounts | It is theirs, and it is the one thing that must never be put in a file that leaves the building. Deleted with the connection. |
| `competitors`, `competitor_sources`, `competitor_snapshots`, `competitor_changes` | the businesses Radar watches and what it saw | They describe OTHER businesses and are shared between every customer watching the same one. Which businesses this customer chose to watch IS theirs, and is in `competitor_subscriptions`. |
| `billing_webhook_events` | raw messages from the payment processor | What they say about the customer's payments is in their credit record and their invoices, both of which they get. |
| `clerk_id_map` | a translation table from a one-time sign-in migration | Sign-in reference codes only. |
| `invoice_serials` | the invoice numbering counter | One counter shared by every invoice Sahoda issues. |
| `radar_fetch_log`, `radar_limits` | what Radar cost Sahoda to run | Sahoda's own running costs. |
| `ops_admins`, `ops_audit_log`, `ops_tasks`, `ops_qa_runs`, `ops_sessions` and the other `ops_` tables | how Sahoda is run | Sahoda's own staff and internal records. Where a Sahoda admin acted on a customer's workspace, that is in `audit_logs`, which the customer gets. |
| `app_settings`, `plans`, `guide_tours` | product configuration | The same for every customer. |

---
## 4 · The two rights, and exactly what each one does

### 4.1 · Taking a copy (DPDP §11)

**Settings → Your data → Download my data.** One zip file:

| inside the zip | what it is |
| --- | --- |
| `your-data.html` | A page a person can open and read. What is in the file, what is not, why, and how many of each. It opens from a folder with no internet connection. |
| `data.json` | Every row, exactly as it is stored, with nothing renamed, flattened or tidied. This is the file for a lawyer or a regulator. |
| `files/…` | Every picture and document the customer has uploaded, as the actual files. |

**Three rules the export follows, and they are the whole design.** The only failure mode of a
subject-access export that matters is a file that looks complete and is not, because the person
receiving it has no way to check.

1. **The list of what to include is read from the database, never written down.** Somebody adding a
   table next month cannot forget to add it here — the build fails and names the table. That guard
   is not theoretical: it caught a table the day this document was written.
2. **Anything missing is named IN the file, with a reason in plain words.** A section that was simply
   absent would leave the reader unable to tell "I have none of these" from "this was left out".
3. **A read that fails is reported, never swallowed.** A network fault must not quietly shorten the
   export and then call itself the export.

**It runs with the customer's own permissions.** The application deliberately holds no master key
that bypasses the database's tenant boundary — an export endpoint holding one would be the single
most attractive thing in the system to point at somebody else's business. The consequence is that
the export contains what that person is allowed to see, which is the right answer to "export MY
data" in any case, and every gap it creates is named under rule 2.

**Size.** The download carries up to 180 MB of files. Beyond that, the files are still LISTED in the
document and their contents are not in the zip, and the file says so and says to ask. It does not
silently send a short archive.

### 4.2 · Deleting everything (DPDP §12)

**Settings → Your data → Delete everything.** Two steps: a dialog that states what goes and what
stays from real counts read out of the database at that moment, and then the workspace's name typed
back. Both are re-checked on the server and the name is checked a third time by the database itself,
because the delete is an addressable endpoint whatever the screen does. Only the **owner** of a
workspace can do it.

**What is removed:** every row in all 47 tables except the four in the next paragraph, plus every
file in storage, plus the encrypted keys for the linked social accounts, plus the customer's sign-in
profile if this was their last workspace.

**What is kept, and why:**

| kept | the reason |
| --- | --- |
| `credit_ledger` | The account of what the customer paid and what they were charged. It is the only thing that can settle a disagreement about a charge, in their favour as easily as ours. It is append-only by construction: it cannot be edited, only added to. |
| `credit_balances` | The reconciled total of that ledger. Deleting it while keeping the ledger would leave the financial record internally inconsistent. |
| `invoices` | Tax invoices and credit notes. Indian GST and company law requires these to be retained for years, and a tax invoice must name its recipient — so these carry the customer's legal name and, where they gave one, their GSTIN. |
| `ledger_actor_redactions` | A single marker saying whether the customer's identity may be shown on the record above. See §5. Deleting it would silently re-reveal the identity it exists to suppress. |

Retention under a legal obligation is a lawful ground for keeping these under DPDP. **The customer
is told this in the product, before they press the button, in the dialog itself** — not only here.

**It is all-or-nothing.** The deletion runs as one database transaction. If any part of it refuses,
the whole thing is undone and the customer is told that nothing was deleted, rather than being left
with half a workspace and a success message. Files are removed **before** the transaction, so a file
that will not delete stops the whole thing — the alternative order would leave photographs in
storage that nothing points at any more, which nobody would ever find.

**What it does NOT do:** it does not close the customer's sign-in account. That account lives with
Clerk (§7) and closing it is a separate request. The copy of their email that Sahoda held is deleted.
The product says this on the confirmation screen.

---

## 5 · The one genuine conflict, and it is not resolved here

**The financial record that must be kept identifies the person.**

MEASURED across every row of `credit_ledger`: most rows carry a sign-in reference code
(`user_...`) in an `actor` column, and **one row carries a plain email address**. The reference code
is a pseudonymous identifier tied to an identifiable person; the email address is direct personal
data with no pseudonymity at all. The rest of the ledger — the `meta` column — was checked and
carries no user identifiers, so `actor` is the whole of the exposure and it is precisely bounded.

So there are two defensible positions and they are in genuine tension:

- **Keep the record intact and tell the customer plainly what it contains about them.** Retention
  under a legal obligation is a lawful ground, and a financial record that has been edited to
  satisfy a deletion request is a financial record whose integrity is now arguable.
- **Suppress the identity while keeping the amounts.** The amounts are what the law requires; the
  name is not obviously part of the obligation.

**This is a question for counsel, and no implementation should answer it quietly in either
direction.** So the mechanism is built, tested and switched off:

- `app.redact_ledger_actor(workspace_id, authority)` records a decision, and requires the authority
  for it to be written down.
- Reading the ledger through `credit_ledger_readable` then returns the amounts and dates and does
  **not** return the identity.
- **The ledger's own rows are never touched.** Nothing is edited. What changes is what is disclosed.
- **Nothing calls it.** Deletion does not call it. A test asserts that deletion does not call it, so
  the decision cannot be taken by accident.

**What is needed:** a decision, in writing, and the authority for it. If the answer is "suppress",
one function call per affected workspace switches it on and no data is altered.

**What the customer is told today:** the dialog says the credit record is kept, says why, and says it
holds a reference to them — "for most rows a sign-in code rather than your name". That is the honest
position while the question is open.

---

## 6 · Things this document does not answer

Stated as open questions rather than left to be assumed.

1. **There is no retention schedule.** Nothing in Sahoda expires on its own. A customer who signed up
   in 2026 and stops using the product still has every post, every conversation and every lead in
   2030. DPDP expects personal data to be erased when the purpose it was collected for is over. There
   is no mechanism for that and no policy defining when the purpose ends. **This needs a decision.**
2. **Nothing defines how long a deleted workspace's financial record is kept.** "Years, because tax
   law" is the reason; the actual number is a decision that has not been made. Indian company law
   generally points at eight years from the end of the financial year, but that is a decision to take
   with counsel and record here, not one to infer from a document.
3. **There is no data-processing agreement on file with any of the processors in §7.** Whether one is
   required for each is a legal question. They are named here so that question can be asked.
4. **Consent for a lead is the customer's to obtain, not Sahoda's.** When somebody fills in a form on
   a Sahoda-built website, the customer is the one with the relationship to that person. Whether the
   customer's own notice is adequate is outside what Sahoda can see or control.
5. **There is no stated breach-notification process.** DPDP requires notifying the Data Protection
   Board and affected people. Sahoda has error monitoring (§7, Sentry) and no written procedure.

---
## 7 · Everybody else who receives customer data

Under DPDP these are **data processors**: they hold or handle personal data on Sahoda's
instructions. They are listed with what each one actually receives, read out of the code rather than
from a list somebody kept.

### 7.1 · The ones that hold data at rest

**Supabase** — the database and the file storage. **Region: `ap-south-1`, Mumbai, India.** This is
where everything in §3 lives, and where every uploaded picture and PDF lives, in two private
buckets (`media`, `brand-assets`). Files are stored under a folder named after the workspace, and
the database enforces that a customer can only reach their own folder. Supabase holds **all** of it.

**Clerk** — sign-in. Clerk holds the customer's email address, name and however they chose to sign
in. It is the system of record for identity; Sahoda keeps a copy of the email, display name and
picture in `users_profile` for showing on screen. **Closing a Sahoda workspace does not close a
Clerk account** — that is a separate request, and the product says so.

**Upstash (Redis)** — short-lived operational state: rate-limit counters and job heartbeats. No
customer content.

**Vercel** — hosting. Sees whatever an HTTP request carries, in the ordinary way any host does.

### 7.2 · The ones that receive content

**Zernio** — publishing and the inbox. This is the widest flow in the product. Zernio receives the
**text of every post that is published**, the **pictures attached to it**, and the identifiers of
the customer's connected social accounts. It sends back what the platforms report: comments, direct
messages, reviews — which means **other people's names and words** arrive through Zernio and land in
`inbox_messages` and `inbox_threads`. The OAuth tokens for the connected accounts are stored
encrypted in Sahoda's own database (`connection_secrets`), never in a log and never in an export.

**OpenRouter** — every AI call. It is a router: Sahoda sends a prompt, OpenRouter forwards it to
whichever model provider is chosen and returns the answer.

> **What is in a prompt is the thing worth being precise about.** Sahoda's prompts carry the
> customer's **Brand Brain** (voice, values, who their customers are — written by them, about their
> business), the **text of posts being written or rewritten**, **documents the customer uploaded to
> the knowledge library**, and, for inbox replies, **the text of the message being replied to** —
> which is another person's words. A lead's name, email or phone number is not deliberately put in a
> prompt, but a customer who pastes an enquiry into the composer puts it there themselves.
>
> **MEASURED: the request sets no data-collection or zero-retention preference.** The body is
> `model`, `messages`, `max_tokens` and the task's own options. Two identifying headers are set on
> image calls — `http-referer: https://sahoda.site` and `x-title: SAHODA LABS` — which tell
> OpenRouter which application is calling, not who the customer is.
>
> **What OpenRouter says it retains** (checked against openrouter.ai/privacy, 2026-08-23): it does
> not persist prompts and completions by default, and states that image, audio and video files are
> not kept "beyond the duration necessary to route the request, except as required for abuse
> detection, security, billing, or legal compliance." **No fixed retention period is published.**
> Separately, each MODEL PROVIDER behind the router has its own retention policy, and OpenRouter
> documents that it does not route around those policies. **So Sahoda cannot presently state, for a
> given prompt, which company held it or for how long.** That is a real gap and it is a decision to
> take, not a fact to look up — see §6.

**Cashfree** — payments. MEASURED from the order it creates: Cashfree receives the **workspace's id
as the customer id**, the customer's **email address** where one is known, the amount, and the plan
and period as tags. Cashfree's own webhooks return payment details including, in some payloads, a
**phone number** the customer gave Cashfree directly. Sahoda does not see or store card numbers at
any point.

**Resend** — email. Used for operational alerts to Sahoda's own team, not for customer mail.

**Sentry** — error monitoring. Receives crash reports. A scrubber runs on every event before it
leaves: it drops the whole of `request.cookies`, `request.headers` and `request.query_string`, and
drops `email`, `ip_address` and `username` from the user object, and redacts any string that looks
like a credential. **It is not a guarantee that no customer text ever reaches Sentry** — an error
message that quoted a post's body would carry that body — so the honest statement is: identifiers
and credentials are removed by construction, and content is removed by not being in error messages.

**Apify and Zyte** — Radar's page fetching, for watching competitors. They receive **URLs of other
businesses' public pages** that the customer asked Sahoda to watch. Nothing about the customer is
sent.

**Cloudflare** — where a customer's generated website would be published. A published site is
public by definition, and its contents are whatever the customer chose to put on it.

### 7.3 · What has not been done

There is no data-processing agreement on file with any of the above. Whether one is required for
each is a legal question — they are named here so it can be asked. See §6.

---
## 8 · What a person must be told when they ask

A customer, a lead, or a regulator may write and ask. This is the answer, and it should be given in
these words rather than reconstructed each time.

### If a CUSTOMER asks "what do you hold about me?"

> Everything is in the product: **Settings → Your data → Download my data**. You get one zip file
> with a page you can read, every record as data, and every picture and document you have uploaded.
> The file also lists anything it could not include, and why — so you can tell a section you have
> nothing in from a section that was left out.
>
> If you would rather we sent it, write to support@sahodalabs.com from the address you signed up
> with and we will.

### If a CUSTOMER asks "delete everything about me"

> You can do it yourself: **Settings → Your data → Delete everything**. It asks you to type the
> workspace name, and it shows you exactly what goes and what stays before you do.
>
> Everything goes: your posts, your pictures, your Brand Brain, your conversations, your enquiries,
> your websites, your linked accounts, and the files themselves.
>
> **One thing stays: your credit and payment record and your tax invoices.** That is the account of
> what you paid and what you were charged, it can settle a disagreement about a charge in your
> favour as easily as ours, and Indian tax law requires financial records to be kept for years. It
> holds a reference to you — for most rows a sign-in code rather than your name.
>
> Your sign-in account is separate from your Sahoda workspace. Close that with the sign-in screen or
> ask us, and we will.

### If a LEAD asks — somebody who filled in a form on a customer's website

This is the case most likely to be got wrong, so it is written out.

> Your details reached us because you filled in a form on a website that one of our customers runs.
> They are the business you contacted; we hold your details for them. Ask **them** to remove your
> details and we will act on their instruction, or write to support@sahodalabs.com and we will pass
> the request on and tell you when it is done.

Under DPDP the customer is the one with the relationship to that person. Sahoda should not delete a
lead on a third party's say-so without the customer knowing, and should not refuse either.

### If a REGULATOR asks

Give them the same export the customer gets — `data.json` is the file, and it is unmodified rows.
Give them this document. §5 and §6 are the two places where a decision is open rather than made, and
saying so is better than being found out.

---

## 9 · What the guards can see, and what they cannot

Everything above rests on tests. Those tests have limits, and a document that did not state them
would be doing the thing it warns about.

**They can see:**

- Every base table carrying a `workspace_id`, from the database's own catalogue, on every build.
- Whether each one is in the export list, and whether its stated readability matches its actual
  policies.
- One complete cycle: create a workspace, fill all 47 tables, delete it, and count what is left —
  including a second workspace that must be untouched.
- Whether the deletion writes to the financial ledger. It does not, and that is asserted against the
  function's own source.

**They cannot see:**

- **What production actually holds.** Every automatic check runs against the migration FILES in an
  in-process database. The one check that can speak for production (`export-drift.test.ts`) needs a
  database credential the build does not have and is run by hand. It was run on 2026-08-23 and
  reported that the export list matches production exactly.
- **Storage.** PostgreSQL holds no files, so no test that runs against a database can say anything
  about whether a customer's photographs were really deleted. The sweep is covered by its own unit
  tests against a stand-in; the real thing has been exercised by hand and not by the build.
- **A table reached by a JOIN rather than by a column.** This is the blind spot that produced the
  three tables in §2, and it is structural: a sweep for `workspace_id` cannot see a table keyed by
  `connection_id`. Nothing automatic will catch a fourth one. **The manual check is: whenever a new
  table is added that does NOT carry a `workspace_id`, ask what happens to it on deletion.**
- **A view.** `knowledge_current_chunks` is the only one, it reads through the caller's own
  permissions, and its underlying table is covered. A future view that did not would be invisible to
  the export list, which is built from base tables.
- **Anything a processor in §7 does with the data after we send it.** That is contract, not code.

**One more thing worth writing down.** The check that catches a missing table is not a clever one —
it asks the database what tables exist and compares that to a list. It caught two tables on the day
it was written, both added by the person writing it, within minutes of them being added. The reason
the previous version of this document was wrong in three places is that its figures came from a
person running the same query once and typing the answer into prose.

---

## 10 · Where this lives in the code

For whoever has to check any of the above.

| what | where |
| --- | --- |
| The list of what a workspace owns | `apps/web/src/lib/privacy/export-manifest.ts` |
| Building the export | `apps/web/src/lib/privacy/export.ts` |
| The readable page inside the zip | `apps/web/src/lib/privacy/readable.ts` |
| Listing and deleting files | `apps/web/src/lib/privacy/storage.ts` |
| The download endpoint | `apps/web/src/app/api/privacy/export/route.ts` |
| The deletion, in the database | `packages/db/supabase/migrations/20260823000000_dpdp_erasure.sql` |
| The screen | `apps/web/src/components/settings/your-data-panel.tsx` |
| The proof that one full deletion works | `packages/db/tests/erasure.pglite.test.ts` |
| The guard on the export list | `packages/db/tests/export_manifest.pglite.test.ts` |
| The live check against production | `apps/web/src/lib/privacy/export-drift.test.ts` |
