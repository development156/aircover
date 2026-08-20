# What only you can do

Everything in this list is blocked on you — not because it is unfinished, but because it needs a
decision, a password, or a person. Ordered by how much it holds up.

**Last checked against the live site and the live database on 19 August 2026.** Two things this page
said last time were wrong, and both are corrected below: your web address is already working, and the
reason the nightly numbers job never ran is not the one we thought.

---

## 1. The nightly numbers job has never run, and every day costs you a day

**Blocks: history that cannot be recovered later. This is the most expensive item on the page.**

Sahoda is supposed to write down how your posts performed, once a night. It has never done it. The
27 measurements in the database are the three times somebody ran it by hand. The most recent covers
18 August. Nothing was recorded for today.

This matters more than it sounds. Instagram and Google only ever tell us **today's** numbers. Last
Tuesday's are gone for good, and no amount of asking later brings them back. Every night this does
not run is a permanent hole in every chart you will ever see.

**Why it never ran, stated plainly.** The live site is built from one branch of the code, called
`wt-web`. The numbers job was written on a different branch. It is not that the job is broken, or
switched off, or misconfigured — **the live site does not contain it at all.** We checked by asking
the live site for it: it answers "no such thing", in exactly the same words it uses for a page that
was never written. The five-minute job that publishes your posts sits right next to it on the same
live site and answers normally, so the scheduling itself works fine. One is there and one is not.

**What has to happen: the newer branch has to be merged into the live one.** There is no smaller
version of this. We deliberately did not do it — see item 2.

**Is there a way to start collecting tonight, without that merge?** Yes, one, and it is a stopgap:
the job is an ordinary program that talks to your database directly, so it can be run on a schedule
from somewhere other than the website — a nightly task on a laptop that is switched on, or a free
scheduled job on GitHub. It would collect the same numbers into the same table. It is worth doing
only if the merge is going to wait more than a few days, because it puts a second thing to remember
in a second place.

> **One sentence for the record:** the nightly numbers job has never collected anything because the
> live site is built from a branch that does not contain it, so it starts the night that branch is
> merged, and nothing else needs switching on.

---

## 2. Decide about the merge — and know what it carries

**Blocks: item 1, and everything built in the last several weeks.**

The gap between the branch that is live and the branch with all the recent work is:

| | |
| --- | --- |
| Separate pieces of work | 79 |
| Files changed | 410 |
| Lines added | about 38,700 |
| Lines removed | about 1,300 |

It goes in cleanly — the live branch has nothing on it that the new one does not already have, so
nothing has to be reconciled by hand.

**The honest part: no human being has used any of it.** Every one of those 79 pieces of work was
checked by automated tests, several thousand of them, and they all pass. But a test only asks the
question it was written to ask. Nobody has signed in, written a post, and looked at the result with
their own eyes. That is not a small caveat on a change of this size — it is the single largest
untested thing in the whole product, and it is item 5.

Merging is a decision, not a task, which is why it is yours and not ours.

---

## 3. Give the database tool its password

**Blocks: nothing today, but it makes every future database question slower and more manual.**

One of the tools that is supposed to read and change your database reports **"Unauthorized — please
provide a valid access token"** every single time. It has no password configured, and only you can
add one, in that tool's settings.

Nothing was blocked by this. Everything needed was done another way, by connecting to the database
directly and reading only. **No change was made to your database.** But every question that could
have been one step became three.

---

## 4. Move Clerk off its test keys — this is a one-way door

**Blocks: nothing visibly, until it blocks everything at once.**

Clerk is what signs your customers in. It has two modes: a test mode for building, and a live mode
for real customers. **Your live site is running the test mode right now.** We did not infer this —
Clerk itself says so, in the live site's own browser console:

> "Clerk has been loaded with development keys. Development instances have strict usage limits and
> should not be used when deploying your application to production."

Three things follow, and the third is why this is urgent rather than tidy:

1. **There are usage limits.** A test instance is capped. Fifty beta users will approach that cap.
2. **It is slower for everyone.** A test instance makes each visitor's first request bounce through
   an extra step before the page loads. That step is why one of our own automated checks currently
   fails against a perfectly healthy site.
3. **Switching is one-way, and it gets more expensive every day.** Test-mode accounts do not move to
   live mode. Every person who signs up between now and the switch is an account that has to be
   dealt with by hand or asked to sign up again. **The cheapest day to do this was any day before
   today, and the second cheapest is today.**

---

## 5. Walk the product yourself, as a customer

**Blocks: confidence. This is the largest untested area in the product.**

Nobody has used this as a customer would since Brand Brain shipped. Everything has been proven by
automated checks, and those checks are only as good as the questions they were written to ask.

What no check can tell you is whether the thing is any *good*. Whether the words make sense. Whether
writing a post feels like being helped. Whether a screen you would open every day is laid out the
way you would want it.

**What to do, once item 2 is done:** sign in as yourself and write one real post, end to end. Pick a
channel, choose a format, write the words, attach a picture, set a time. Then look at the analytics
page, the planner, and the inbox.

Write down anything that made you pause. A pause is a defect even when nothing is broken.

---

## 6. Publishing is still switched off, and the reason has changed

**Blocks: posts actually going out.**

Publishing was held back over a specific fear: that sending the wrong account identifier to our
publishing partner would post one customer's content to another customer's feed, and their system
would answer "success" and raise no error.

**That protection turns out to already exist, and it has been proven against your real database.** A
check inside the database works out which customer a post belongs to *from the post*, and refuses to
hand back an account unless that customer genuinely owns it, with a live connection, on the same
channel. It was tested with one workspace's post and another workspace's real, active Instagram
account, with a made-up account, with a mismatched post, with an empty value, and with text designed
to confuse a database. All refused.

**What to do:** publishing is your call now, not a technical blocker. Before turning it on, read the
note in the code marked SL-069 — there is a separate, narrower risk about a post going out twice if
a publish is interrupted at exactly the wrong moment, and that one is not closed.

---

## 7. Your web address already works — nothing to do

**Correcting the last version of this page, which listed it as blocked on you.**

`app.sahodalabs.com` is live, is pointed at Vercel, and serves the same site as the temporary
address. We opened it in a real browser: it loads, redirects to the sign-in page, and the page
renders. Your marketing site on `sahodalabs.com` and `www.sahodalabs.com` is a separate Framer site
and is unaffected.

The one blemish is cosmetic: the site has no icon file, so browsers log a small "not found" for it.

---

## 8. Create a Trigger.dev access token — or decide you do not need one

**Blocks: nothing.**

Some background jobs were originally written for a service called Trigger.dev. Nothing has ever been
deployed there, and deploying needs a personal access token only you can create.

**You probably do not need to.** Everything that needs a schedule now runs through the website's own
scheduled requests, which have been firing every five minutes for months. The Trigger.dev route is a
spare nobody is using.

**What to do:** either create the token, or say the word and the unused wrappers can be removed so
nobody wonders whether they are live.

---

## 9. Four features have tables and nothing else

**Blocks: nothing. This is a planning decision.**

Five tables are live and **completely empty** — we counted, on 19 August: templates 0, campaigns 0,
campaign_posts 0, assets 0, asset_usages 0. Templates has since gained a first screen, and nobody
has saved one yet. The other screens still say "coming soon" and show no figures.

The order that costs least:

1. **Campaigns** — small to build, but the useful part is budgets and paid ads, and those need
   approval from Meta and Google that takes as long as it takes.
2. **Assets** — largest. A picture library needs uploads, and a "where is this used?" check before
   anything can be deleted safely.

**What to do:** pick one, or say none of them matter yet.

---

## 10. Two things nobody should run but you

**A backup restore drill** and **a rollback rehearsal**. Both are on the operations list and both are
deliberately left to you: proving a backup restores means restoring it, and nothing automated should
be allowed to practise that on the database your customers are in.
