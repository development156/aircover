# What only you can do

Everything in this list is blocked on you — not because it is unfinished, but because
it needs a decision, a password, or a person. Ordered by how much it holds up.

---

## 0. Get sandbox Cashfree keys — the ones in the repository are production keys

**Blocks: every payment. Nobody can buy anything, and no amount of code fixes it.**

The keys you pasted are **live production keys**, not sandbox ones. Cashfree's secret key
carries its environment in the key itself, and yours says `prod`. The sandbox refuses a
production key, which is why the error is `401 authentication Failed`.

Two separate problems, and both need you:

**a. They are the wrong environment.** Sandbox keys look different — the secret starts
`cfsk_ma_test_` rather than `cfsk_ma_prod_`, and the App ID starts `TEST` rather than `CF`.
Get them from the Cashfree dashboard with the environment toggle set to **Test/Sandbox**,
not Production.

**b. They do not work against production either.** MEASURED 2026-08-20: the same pair was
refused by the production host too, with the same 401. That is a separate thing to chase
with Cashfree — most likely the merchant account is not fully activated, or the App ID and
secret are from different key pairs. Worth asking them directly, because it will block go-live
even after the sandbox keys arrive.

**And they were in the wrong file.** You pasted them into the repository's top-level settings
file. The app reads its settings from the `apps/web` folder, and that file still held the OLD
broken pair — the two 40-character values that were identical to each other. So even correct
keys pasted there would not have reached the app. When you paste the sandbox keys, they need
to go in **`apps/web`**, and the two values must differ from one another.

**How you will know it worked:** the check reports `HTTP 200` instead of `HTTP 401`. Nothing
downstream can be tested against a real order until it does — everything else in the payment
system has been proven against a real database instead, which is as far as it can be taken
without this.

**Also blocked, separately:** the ten `SAHODA_GST_*` settings are unset, so invoices cannot be
issued at all. That one is not a bug — see `docs/29_GST_Questions.md`, which is written to be
handed to an accountant as it stands.

---

## 1. Merge this branch into the one that goes live

**Blocks: everything below, and all the work of the last four runs.**

All the recent work lives on a branch called `wt-ui-port`. The live site is built from
a different branch, `wt-web`. Nothing on `wt-ui-port` reaches customers until the two
are joined.

That includes the six database changes you applied — they are live in the database,
but the code that uses them is not live on the site. So right now the tables exist and
nothing fills or reads them.

**What to do:** ask for `wt-ui-port` to be merged into `wt-web`. I am not allowed to do
it, deliberately: merging into the live branch is a decision, not a task.

**How you will know it worked:** the site rebuilds and the analytics page starts showing
a "Performance over time" card that fills in over the following days.

---

## 2. Decide whether the nightly numbers job runs

**Blocks: the history that cannot be recovered later.**

Sahoda now has a job that records your posts' numbers once a day. Without it, the
platforms only ever tell us today's figures — last Tuesday's are gone for good, and no
amount of asking later brings them back. Every day it does not run is a day missing
from every chart you will ever see.

The job is written, tested, and has been run by hand three times against the real
database. It works: 27 measurements are already stored, across three days.

It is scheduled for 6:50 in the morning, India time. **That schedule starts the moment
item 1 happens** — there is nothing else to switch on. If you would rather it did not
run, say so and it can be turned off without another release.

**One thing to know:** one of your seven published posts consistently cannot be read
back from the platform. It is not a mistake in the recording — the request itself fails,
every time, for that one post. Its numbers are simply absent rather than wrong.

---

## 3. Walk the product yourself, as a customer

**Blocks: confidence. This is the largest untested area in the whole product.**

Being honest about this: **nobody has yet used this branch the way a customer would.**
Everything has been proven by automated checks — over three thousand of them, plus
fifty that drive a real browser — and those checks are only as good as the questions
they were written to ask.

What no check can tell you is whether the thing is any good. Whether the words make
sense. Whether the create flow feels like it is helping. Whether a screen you open
every day is laid out the way you would want it.

**What to do, once item 1 is done:** sign in as yourself and write one real post, end
to end. Pick a channel, choose a format, write the words, attach a picture, set a time.
Then look at the analytics page, the planner, and the inbox.

Write down anything that made you pause. A pause is a defect even when nothing is broken.

---

## 4. Publishing is still switched off, and the reason has changed

**Blocks: posts actually going out.**

Publishing has been held back because of a specific fear: that sending the wrong account
identifier to our publishing partner would post one customer's content to another
customer's feed — and their system would answer "success" and raise no error.

**That protection turns out to already exist, and it has now been proven on the real
database.** A check inside the database itself works out which customer a post belongs
to *from the post*, and refuses to hand back an account unless that customer genuinely
owns it, with a live connection, on the same channel. It was tested with one workspace's
post and another workspace's real, active Instagram account: refused.

It was also tested with a made-up account, a mismatched post, an empty value and a
string designed to confuse a database. All refused.

Two things were improved this run: a refused attempt is now recorded under its own name
rather than being filed as "the connection was unavailable" — so if it ever happens, it
can be found afterwards — and the protection now has a permanent test so a future change
cannot quietly weaken it.

**What to do:** publishing is your call, not a technical blocker any more. Before turning
it on, read the note in the code called SL-069 — there is a separate, narrower risk about
a post going out twice if a publish is interrupted at exactly the wrong moment, and that
one is not closed.

---

## 5. Create a Trigger.dev access token — or decide you do not need one

**Blocks: nothing today.**

Some background jobs were originally written for a service called Trigger.dev. Nothing
has ever been deployed there, and deploying needs a personal access token that only you
can create.

**You probably do not need to.** Everything that needs to run on a schedule now runs
through the website's own scheduled requests instead, which have been working every five
minutes for months — 288 runs in the last day alone. The Trigger.dev route is a spare
that nobody is using.

**What to do:** either create the token, or say the word and the unused Trigger.dev
wrappers can be removed so nobody wonders whether they are live.

---

## 6. Four features now have tables and nothing else

**Blocks: nothing. This is a planning decision.**

Five new tables are live and completely empty, because no screen touches them yet:
templates, campaigns, assets, and the two link tables that go with them. The screens for
these still say "coming soon" and show no figures — that was checked at both a laptop
and a phone width.

They are ready in the order that suits you. For what it is worth, the order that costs
least is:

1. **Templates** — smallest. Save a post you liked and start the next one from it.
2. **Campaigns** — small to build, but the useful part is budgets and paid ads, and
   those need approval from Meta and Google that takes as long as it takes.
3. **Assets** — largest. A picture library needs uploads, and a "where is this used?"
   check before anything can be deleted safely.

**What to do:** pick one, or say none of them matter yet and they can wait.

---

## 7. Two things I could not do, and why

**The Supabase tool has no password.** I was given permission to change the database
directly, but the connection itself reports "Unauthorized" — the tool has no access token
configured. Everything needed was done another way, by connecting to the database
directly and reading only. **No database change was made by me this run.** If you want me
to have that tool working, it needs an access token added to its settings.

**The preview site requires a Vercel login.** Branch previews are protected, so automated
checks cannot reach them without a temporary pass. That is a sensible setting and I am not
suggesting you change it — it is only why some checks ran against the code on this machine
rather than the deployed copy.
