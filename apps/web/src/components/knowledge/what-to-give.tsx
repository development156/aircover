import { Ban, FileText, MessageCircleQuestion, ScrollText, Tag } from 'lucide-react'

/**
 * What to give Sahoda, and what it cannot use.
 *
 * ── WHY THIS BLOCK EXISTS AT ALL ────────────────────────────────────────────
 * MEASURED in production 2026-08-29: three documents across all 33 workspaces,
 * in the product's lifetime, and one of the three is an Instagram login wall
 * stored as 74 characters and badged as a success. Neither number is an
 * adoption problem. They are the same problem: the screen said what the feature
 * IS and never what to put in it, so the two people who tried guessed, and one
 * guessed a page nobody can read without logging in.
 *
 * ── THE REFUSAL IS HALF THE VALUE, AND IT IS NOT A WARNING STRIP ────────────
 * "Pages behind a login" and "a menu that is a picture" are the two failures
 * this feature actually has, and both are silent: a login wall indexes cleanly
 * and reads as a success on this very screen. Saying so BEFORE somebody spends
 * a minute adding one is worth more than the sentence that explains it after.
 * It sits inside the same block rather than in a red bar because it is guidance,
 * not an error: nothing has gone wrong yet.
 *
 * ── EVERY LINE IS A CAPABILITY, NOT A DOCUMENT TYPE ─────────────────────────
 * "Price list" is a filing category. "So a post can name your real price" is
 * what the customer gets for going and finding it. The second is why anybody
 * opens a drawer, and this product's copy rule is that a sentence must never be
 * vaguer than the truth it replaces: each of these four says the exact thing
 * that becomes possible.
 */

const GIVE = [
  {
    icon: Tag,
    what: 'Your prices and packages',
    unlocks: 'so a post can name what you actually charge',
  },
  {
    icon: ScrollText,
    what: 'Your policies',
    unlocks: 'refunds, delivery, cancellations, so an answer matches your rules',
  },
  {
    icon: MessageCircleQuestion,
    what: 'The questions customers keep asking',
    unlocks: 'so Sahoda answers them the way you already do',
  },
  {
    icon: FileText,
    what: 'A proposal or brochure you are proud of',
    unlocks: 'so it writes about your work in your own words',
  },
]

export function WhatToGive() {
  return (
    <section
      aria-labelledby="knowledge-what-to-give"
      className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4"
    >
      <h2 id="knowledge-what-to-give" className="type-h3 text-ink">
        What to give it
      </h2>

      <ul className="grid gap-2 wide:grid-cols-2">
        {GIVE.map(({ icon: Icon, what, unlocks }) => (
          <li key={what} className="flex items-start gap-2">
            <Icon aria-hidden className="mt-icon-nudge size-4 shrink-0 text-accent" />
            <p className="type-sm text-ink">
              {what}{' '}
              <span className="text-muted">
                {/* The lowercase clause is a continuation of the same sentence,
                    not a second one. Checking the sentence the READER gets, per
                    the copy rules, rather than the two literals it is built
                    from. */}
                {unlocks}
              </span>
            </p>
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-2 type-sm text-muted">
        <Ban aria-hidden className="mt-icon-nudge size-4 shrink-0" />
        <span>
          Two things Sahoda cannot read: a page that asks anyone to log in first, such as an
          Instagram or Facebook profile, and a menu or price list that is a picture rather than
          typed text. Both look like they worked and leave you with nothing to quote.
        </span>
      </p>
    </section>
  )
}
