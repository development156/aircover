import Link from 'next/link'
import type { Route } from 'next'

import { comparisonLine, readable } from '@/lib/report/compose'
import type { Compared, OneThing, PlanRow, WorkedPost } from '@/lib/report/model'
import { REPORT } from '@/lib/report/strings'
import type { Verdict } from '@/lib/report/verdict'
import { withheldSentence } from '@/lib/report/withheld'

/**
 * THE REPORT'S SECTIONS, AND NOT ONE OF THEM READS A DATABASE.
 *
 * Every component here takes the value it renders. That is what lets the same
 * components draw the real report and the greyed-out sample on the empty state,
 * from one definition — a preview built from a second set of components is a
 * preview that drifts away from the thing it promises.
 */

/**
 * THE VERDICT — the largest text on the page, and no card around it.
 *
 * A card is a container for a fact among other facts. This is the answer, and it
 * is meant to be read from a metre away while somebody is standing at a counter.
 */
export function VerdictBlock({
  verdict,
  week,
}: {
  verdict: Verdict
  week: { label: string; postsRan: number | null; channels: readonly string[] }
}) {
  // A null count is a count nobody read. It used to render as "0 posts", which
  // is a statement about the reader's week made out of a failed request.
  const ran =
    week.postsRan === null ? null : week.postsRan === 1 ? '1 post' : `${week.postsRan} posts`
  return (
    <section>
      <p className="type-meta text-muted">
        {[week.label, ran, week.channels.join(', ')].filter(Boolean).join(' · ')}
      </p>
      {/* ── THE VERDICT IS ALWAYS AN h2, INCLUDING WHEN IT IS WITHHELD ──────
          It used to be a paragraph in heading clothes on the suppressed branch,
          which is the COMMON state for a new workspace — so the document went
          h1 straight to h3 and somebody moving by headings skipped the answer
          the page exists to give. */}
      {verdict.kind === 'none' ? (
        <h2 className="type-h2 mt-2 max-w-[46ch] text-ink">{withheldSentence(verdict)}</h2>
      ) : (
        <>
          <h2 className="type-h1 mt-2 text-ink">{verdict.headline}</h2>
          <p className="type-body mt-1 max-w-[52ch] text-ink">{verdict.support}</p>
        </>
      )}
    </section>
  )
}

/** The three numbers. Equal width on a desk, stacked on a phone. */
export function ThreeNumbers({
  numbers,
}: {
  numbers: { reach: Compared; replies: Compared; enquiries: Compared }
}) {
  const cards = [
    { ...REPORT.numbers.reach, value: numbers.reach },
    { ...REPORT.numbers.replies, value: numbers.replies },
    { ...REPORT.numbers.enquiries, value: numbers.enquiries },
  ]
  return (
    <div className="grid gap-3 wide:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href as Route}
          className="surface-ring rounded-card bg-surface p-4 transition-micro hover:bg-s2"
        >
          <p className="type-meta text-muted">{card.label}</p>
          {/* A failed read has no number. Not a zero, and not a dash: both are
              statements about the reader's week that no query established. */}
          {card.value.status === 'unreadable' ? (
            <p className="type-body mt-1 text-muted">{REPORT.numbers.unreadable}</p>
          ) : (
            <>
              <p className="type-h1 num mt-1 text-ink">{readable(card.value.value)}</p>
              <p className="type-sm mt-1 text-muted">{comparisonLine(card.value)}</p>
            </>
          )}
        </Link>
      ))}
    </div>
  )
}

/** What worked, and what did not. Two cards, side by side where there is room. */
export function WorkedBlock({
  worked,
}: {
  worked: { best: WorkedPost; weakest: WorkedPost } | null
}) {
  if (worked === null) {
    return (
      <section className="surface-ring rounded-card bg-surface p-4">
        <h3 className="type-h3 text-ink">{REPORT.worked.bestTitle}</h3>
        <p className="type-body mt-1 max-w-[62ch] text-muted">{REPORT.worked.tooFew}</p>
      </section>
    )
  }
  return (
    <div className="grid gap-3 wide:grid-cols-2">
      {[
        { title: REPORT.worked.bestTitle, post: worked.best, reason: null as string | null },
        { title: REPORT.worked.weakTitle, post: worked.weakest, reason: REPORT.worked.noReason },
      ].map(({ title, post, reason }) => (
        <section key={title} className="surface-ring rounded-card bg-surface p-4">
          <h3 className="type-h3 text-ink">{title}</h3>
          <Link
            href={`/posts/${post.postId}` as Route}
            className="type-body mt-1 block text-ink underline-offset-2 hover:underline"
          >
            {post.title}
          </Link>
          <p className="type-sm num mt-1 text-muted">
            {readable(post.value)} {post.measure} on {post.channelName}
          </p>
          {reason ? <p className="type-sm mt-2 text-muted">{reason}</p> : null}
        </section>
      ))}
    </div>
  )
}

/**
 * WHAT I CHANGED — the one accent element on this page.
 *
 * It is the only place in the product where the owner watches the loop close:
 * measured, learned, and the plan already different because of it. Every line
 * comes from a learning this cycle actually applied. Nothing generic is ever
 * padded in to fill the card, which is why the empty sentence is a real sentence
 * and not a smaller version of the full one.
 */
export function ChangedBlock({ changed }: { changed: readonly string[] }) {
  return (
    <section className="rounded-card bg-brand-wash p-4 ring-1 ring-[var(--brand-lift)]">
      <h3 className="type-h3 text-ink">{REPORT.changed.title}</h3>
      {changed.length === 0 ? (
        <p className="type-body mt-1 max-w-[62ch] text-muted">{REPORT.changed.nothing}</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {changed.slice(0, 4).map((line) => (
            <li key={line} className="type-body text-ink">
              {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function PlanBlock({ plan }: { plan: readonly PlanRow[] }) {
  const awaiting = plan.filter((row) => row.status === 'awaiting_approval').length
  return (
    <section className="surface-ring rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-h3 text-ink">{REPORT.plan.title}</h3>
        {awaiting > 0 ? (
          <Link
            href={'/approvals' as Route}
            className="type-sm font-[550] text-accent underline underline-offset-2"
          >
            {REPORT.plan.approveAll}
          </Link>
        ) : null}
      </div>
      {plan.length === 0 ? (
        <p className="type-body mt-1 max-w-[62ch] text-muted">{REPORT.plan.empty}</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {plan.map((row) => (
            <li key={row.id} className="rounded-input bg-surface-2 p-3">
              <p className="type-body text-ink">{row.title}</p>
              <p className="type-sm mt-1 text-muted">
                {[row.when, row.channels.join(', '), REPORT.plan.status[row.status]]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Exactly one action, and the page ends on it. */
export function OneThingBlock({ oneThing }: { oneThing: OneThing | null }) {
  return (
    <section className="surface-ring rounded-card bg-surface p-4">
      <h3 className="type-h3 text-ink">{REPORT.oneThing.title}</h3>
      {oneThing === null ? (
        <p className="type-body mt-1 max-w-[62ch] text-muted">{REPORT.oneThing.nothing}</p>
      ) : (
        <>
          <p className="type-body mt-1 max-w-[62ch] text-ink">{oneThing.body}</p>
          <Link
            href={oneThing.href as Route}
            className="type-sm mt-3 inline-flex h-control items-center rounded-sm bg-primary px-3 font-[550] text-primary-foreground transition-micro hover:bg-ink hover:text-white dark:hover:bg-white dark:hover:text-[var(--canvas)]"
          >
            {oneThing.action}
          </Link>
        </>
      )}
    </section>
  )
}

/** Credits. A line, never a card, and never the heaviest thing on the page. */
export function CreditsLine({ credits }: { credits: { spent: number; budget: number | null } }) {
  return (
    <p className="type-sm num text-muted">
      {REPORT.credits.line(credits.spent, credits.budget)}{' '}
      <Link
        href={REPORT.credits.href as Route}
        className="font-[550] text-accent underline underline-offset-2"
      >
        {REPORT.credits.link}
      </Link>
    </p>
  )
}
