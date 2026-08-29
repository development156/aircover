---
description: Do a task and explain it in plain English. Same rigour as /go, none of the jargon.
argument-hint: <what you want>
---

Do this: **$ARGUMENTS**

Everything below applies. Do not repeat it back — just work under it.

**This command is `/go` with one difference, and it is not a small one: the
person reading your answer does not write code and never will.** The engineering
standards are unchanged and are not negotiable. What changes is that every word
that reaches them must be a word they already know.

---

## First: size the job

Match the effort to the task. Everything here is available, not required.
Over-tooling a small job costs real money — everyone shares one quota.

| The job is                                           | Do this                                      |
| ---------------------------------------------------- | -------------------------------------------- |
| a question, or reading one thing                     | **Just answer it.** Skip to _How to report_. |
| one small change you already understand              | Do it yourself.                              |
| several parts, a new feature, a fault you can't find | Use helpers and skills, below.               |
| a claim you are about to make                        | A second helper told to disprove it. Always. |

## Use helpers, and send them together

**Send them in ONE message or they run one after another and you have wasted the
point.**

- Spans many parts of the product? Use helpers — you want their conclusion.
- About to tell him something is true? **Put a second helper on it and tell it
  to prove you wrong.** Findings that survive a hostile reader are the only ones
  worth his time. This project has produced confident-and-wrong findings
  repeatedly.

| Need                                                     | Helper                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| check work before it joins anyone else's                 | `reviewer`                                                                     |
| attack a claim or a safety check                         | `auditor`                                                                      |
| write the failing test first — money, access, publishing | `test-writer`                                                                  |
| a fault you have chased for 20 minutes, or a flaky test  | `debug-agent`                                                                  |
| sign-in, passwords, payments, private data               | `security-auditor`                                                             |
| the only helper allowed to change how records are stored | `db-migration-agent`                                                           |
| screens · colours · publishing · AI · background work    | `ui-agent` · `brandskin-agent` · `adapter-agent` · `mesh-agent` · `jobs-agent` |

## Load the skill before the work

Read afterwards it is a review; read first it is a specification.

| Working on                              | Load                             |
| --------------------------------------- | -------------------------------- |
| a screen or anything visible            | `sahoda-ui`, `impeccable`        |
| colours and theming                     | `sahoda-brandskin`               |
| **anything** about how records are kept | `sahoda-db`, `postgres-patterns` |
| credits, charges, refunds, the wallet   | `sahoda-ledger`                  |
| anything the AI writes                  | `sahoda-mesh`                    |
| posting to a social platform            | `sahoda-adapter`                 |
| sign-in, user input, secrets            | `security-review`                |
| before saying it is done                | `sahoda-ship`                    |

## What "done" actually means

These are the rules that keep the product honest. They do not relax here.

- **A safety check you have never seen fail is not a safety check.** Break the
  thing on purpose, watch the check catch it, then put it back. Say that you did.
- **Never call a test passed if it did not run.** Say plainly: it passed, it
  failed, or it never ran.
- **If a check finishes suspiciously fast, it did not really run** — it repeated
  an old answer.
- **Group faults by what they say, never count them.** Six unrelated things
  breaking at once is usually the machine; one is usually the change.
- **Never show a number the product did not actually produce.** Inventing a
  figure about his own business is the one thing this product may never do.

## Never, in any lane

Never post to a real customer's account · never change what customers are
charged · never delete or overwrite real customer records · never force through
a change to a shared copy · **never show a made-up number** · never merge the
separate versions written for each social platform into one.

---

# How to report back

**This matters as much as the work.** He decides what happens next, and he
cannot decide from a sentence he has to decode.

## Write it so a shopkeeper could act on it

**No file names. No code. No error text. No abbreviations. No branch names.**

Not a section at the bottom in plain language with jargon above it — **the whole
answer**, top to bottom, in words he already uses.

| Instead of                                      | Write                                                         |
| ----------------------------------------------- | ------------------------------------------------------------- |
| "26 tests were skipped by `describe.skipIf`"    | "26 checks were quietly being skipped and counted as passing" |
| "the RPC returned null and the assertion threw" | "the records accepted something they should have refused"     |
| "js-budget failed, +10.3 kB on /layout"         | "two screens got about 10 kB heavier than we allow"           |
| "I pushed 4 commits to wt-karunesh"             | "I've saved your work"                                        |
| "the Vercel preview is READY"                   | "it's live — here's the link to look at it"                   |

**Keep every real number.** Plain is not vague. A rewrite that loses the figures
is worse, not better.

## The shape

1. **First line: what happened.** Not what he asked for. Not "I'll help with".
   The result.
2. **What he can look at**, if anything. A link beats a description.
3. **What is left**, only if it matters to him.

**Short paragraphs, three or four sentences.** Use a table when there are three
or more things to compare — a table is read, a paragraph of the same content is
not.

**Bold the one phrase that carries the meaning**, once or twice. If everything
is bold, nothing is.

**Say how sure you are, in words.** Not "MEASURED" and "INFERRED" — say **"I
tried it and saw it work"** or **"I think this is right but I could not try
it"**. The difference decides whether he can rely on it.

## End with exactly two things

1. **What you did NOT do, and why.** The sentence that makes everything above
   trustworthy. "I could not try the sign-in screen, because that needs keys this
   machine doesn't have" is worth more than three paragraphs of what went right.
2. **Anything you need him to decide.** One line each. If nothing, say "nothing
   needs deciding" and stop.

## Do not

- narrate as you go ("Now I will…", "Let me…") — report at the end
- list what you did not change
- apologise, or thank him for asking
- say the same thing in the summary and again in the body
- finish with a conclusion that repeats the opening
- **ever leave him with a problem and no next step**

If the answer is one line, **make it one line.** Length is not effort.

---

When the work is worth keeping, save it and say so in four words. He never needs
to know how that happens.
