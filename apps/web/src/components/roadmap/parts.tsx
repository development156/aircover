import type { LucideIcon } from 'lucide-react'

/**
 * The larger shapes a roadmap screen needs, beyond the controls in `inert.tsx`.
 *
 * ── WHY THIS MOVED OUT OF `components/ads/` ──────────────────────────────────
 * It was written for Ads and it was never about Ads. A panel, a row, a media
 * slot and the closing note are the vocabulary EVERY designed-but-unbuilt
 * section needs, and eight of them now exist. Leaving these under `ads/` meant
 * the next section either imported across a sibling feature folder or wrote its
 * own — and two vocabularies for one idea is how the certainty system drifts.
 *
 * `inert.tsx` holds the control-sized shapes (a button, a chip, a field, the
 * banner). This file holds the block-sized ones. Both obey the same two rules.
 *
 * ── EVERYTHING HERE IS A `div` OR A `span`, WITHOUT EXCEPTION ────────────────
 * A `<button disabled>` is still announced as a button, so it still offers an
 * action that does not exist: a screen reader reads it out, the reader takes it,
 * nothing happens, and the failure reads as a broken app rather than an unbuilt
 * feature. These are not disabled controls. They are pictures of controls, and
 * they carry no `aria-disabled` either — that attribute describes a control that
 * exists and is momentarily unavailable, which is a different and untrue claim.
 *
 * ── AND NOT ONE OF THEM HOLDS A NUMBER ───────────────────────────────────────
 * Ads is where invented figures are most tempting and most damaging. Every
 * competing tool puts an estimated reach under its audience builder, a CPM in
 * its budget step and a spend total on its dashboard. Sahoda has no ad account,
 * no bid, no impression and no rupee of spend, so every one of those would be a
 * number about the reader's business with nothing behind it — the one class of
 * thing this product may never invent.
 *
 * So the containers are drawn and the figures are absent. Not dashed, not
 * zeroed, not greyed: absent, because there is no such quantity yet.
 */

/** A labelled block with a hairline edge — the shape of a panel, drawn provisional. */
export function InertPanel({
  title,
  what,
  children,
}: {
  title: string
  /** One sentence on what this panel will do. Present tense, no promises. */
  what: string
  children?: React.ReactNode
}) {
  return (
    <section className="is-proposed flex flex-col gap-3 rounded-card p-4">
      <div>
        <h2 className="type-h3 text-ink">{title}</h2>
        <p className="type-sm mt-0.5 text-muted">{what}</p>
      </div>
      {children}
    </section>
  )
}

/** A row of a picture-of-a-list: a glyph, a name, and a line about it. */
export function InertRow({
  icon: Icon,
  name,
  note,
}: {
  icon: LucideIcon
  name: string
  note: string
}) {
  return (
    <div
      data-inert-control
      className="is-proposed flex items-start gap-3 rounded-input px-3 py-2.5 select-none"
    >
      <Icon aria-hidden size={15} strokeWidth={1.8} className="mt-[2px] shrink-0 text-muted" />
      <span className="min-w-0">
        <span className="type-h3 block text-ink">{name}</span>
        <span className="type-sm block text-muted">{note}</span>
      </span>
    </div>
  )
}

/**
 * A picture of a media slot — the box a creative will sit in.
 *
 * `aspect` names the placement's real shape (a Story is 9:16, a feed post is
 * 1:1, a Search ad is a wide strip with no picture at all), because the shape IS
 * the information on a creative screen: it is what makes "one ad, four
 * placements, four crops" legible without a word of copy.
 *
 * ── THE HEIGHT IS FIXED AND THE WIDTH FOLLOWS, WHICH IS THE OPPOSITE OF THE ──
 * ── OBVIOUS WAY TO DO THIS, AND THE OBVIOUS WAY WAS TRIED AND LOOKED WRONG ──
 * Letting each slot fill its grid cell's WIDTH and take whatever height the
 * aspect ratio implied put a 9:16 Story nearly four times the height of a 1:1
 * Feed in the same row. The row then sized to the tallest, and the short slots
 * left several hundred pixels of ragged emptiness beside them — the exact
 * "content stopped and the page did not" failure `docs/27` §3.4 names on three
 * other screens.
 *
 * Pinning the HEIGHT and deriving the width keeps every shape at one comparable
 * scale: a Story reads as narrow-and-tall, a Search ad as wide-and-short, and
 * the row has a single flat baseline. The proportion — the only thing this is
 * communicating — survives intact, because an aspect ratio is a ratio and does
 * not care which side is the given one.
 */
export function InertMediaSlot({ label, aspect }: { label: string; aspect: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* The band every slot is measured in. One height for the whole row, so
          the shapes are comparable and the row cannot go ragged. */}
      <div className="flex h-[168px] items-end justify-center">
        <div
          data-inert-control
          aria-hidden
          className="is-proposed grid h-full max-w-full place-items-center rounded-card"
          style={{ aspectRatio: aspect }}
        >
          <span className="type-eyebrow text-muted">{label}</span>
        </div>
      </div>
      <span className="type-sm text-muted">{label}</span>
    </div>
  )
}

/**
 * The honest note every Ads screen ends on.
 *
 * Without it a well-drawn roadmap screen reads as a feature that merely has no
 * data today — which is the same lie as a mocked API response, rendered larger.
 */
export function NotRunningNote({ children }: { children: React.ReactNode }) {
  return <p className="type-sm max-w-[68ch] text-muted">{children}</p>
}

/**
 * A column of a pipeline that has no cards in it.
 *
 * ── WHY IT IS NOT AN EMPTY LIST WITH A "0" HEADER ────────────────────────────
 * A kanban column's header normally carries a count, and that count is the first
 * thing a reader trusts. `New 0` on a leads board says "nobody has enquired",
 * which is a claim about the reader's business; the true claim is "nothing can
 * enquire yet, because no form is wired to this". So the column keeps its NAME —
 * the stage names are real, they are the `leads.status` CHECK constraint — and
 * carries a sentence about what lands in it instead of a number.
 */
export function InertColumn({
  name,
  what,
  children,
}: {
  name: string
  /** What a card in this column would mean. One short sentence. */
  what: string
  children?: React.ReactNode
}) {
  return (
    <section className="is-proposed flex min-h-[168px] flex-col gap-2 rounded-card p-3">
      <h3 className="type-eyebrow text-muted">{name}</h3>
      <p className="type-sm text-muted">{what}</p>
      {children}
    </section>
  )
}

/**
 * A switch-shaped thing that cannot be flipped.
 *
 * Deliberately NOT `<input type="checkbox" disabled>` and not `role="switch"`:
 * both announce a control, and a disabled one announces a control that exists
 * and is momentarily unavailable. Neither is true here. It is a picture of a
 * switch, drawn in the off position because "off" is what an unbuilt automation
 * actually is.
 */
export function InertToggle({ label }: { label: string }) {
  return (
    <span data-inert-control className="inline-flex items-center gap-2 select-none">
      <span aria-hidden className="is-proposed block h-[18px] w-[32px] rounded-pill">
        <span className="mt-[3px] ml-[3px] block size-[12px] rounded-full bg-surface-3" />
      </span>
      <span className="type-sm text-muted">{label}</span>
    </span>
  )
}
