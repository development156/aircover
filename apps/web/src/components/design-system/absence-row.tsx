/**
 * The three absence states, side by side, so the difference is arguable.
 *
 * The two that RENDER are marks with accessible names. The third renders
 * nothing at all, which is the hardest of the three to remember and the one
 * `100 of —` got wrong.
 */

export function Unmeasured({ what }: { what: string }) {
  return (
    <>
      <span aria-hidden className="is-unmeasured" />
      <span className="sr-only">{what} has not been measured yet</span>
    </>
  )
}

export function Unreadable({ what }: { what: string }) {
  return (
    <>
      <span aria-hidden className="is-unreadable" />
      <span className="sr-only">{what} could not be read</span>
    </>
  )
}

/**
 * The slot has no SUBJECT yet — there is nothing that could have a value.
 *
 * Distinct from `Unreadable`, and the distinction is not pedantry. MEASURED
 * 2026-08-22 on a brand-new account with no workspace: the rail announced
 * "Your credit balance could not be read" and "Your role in this workspace
 * could not be read" to a screen reader, while the MAIN PANE of the very same
 * screen said "Nothing has failed and nothing was charged; there is simply
 * nothing to show until one exists." Both were describing the same fact and
 * only the main pane was telling the truth. Nothing had failed. There was no
 * workspace to have a balance or a role.
 *
 * Same neutral visible mark as `Unreadable` — a sighted user is looking at an
 * absence either way and the shape of the absence is not worth a second glyph.
 * The claim differs only where a claim is actually made, which is the name.
 */
export function NotYet({ what }: { what: string }) {
  return (
    <>
      <span aria-hidden className="is-unreadable" />
      <span className="sr-only">{what} starts once you create a workspace</span>
    </>
  )
}

export function AbsenceRow() {
  return (
    <div className="grid gap-3 narrow:grid-cols-3">
      <Case
        title="Not yet measured"
        rule="The slot is real. The reading has not arrived."
        example="Reach, before anything has published."
      >
        <Unmeasured what="Reach" />
      </Case>

      <Case
        title="Unreadable"
        rule="We asked and got nothing back. Different from having none."
        example="A balance read that threw."
      >
        <Unreadable what="Your balance" />
      </Case>

      <Case
        title="Does not exist"
        rule="There is no such quantity. Delete the slot; do not fill it."
        example="A monthly allowance, for a wallet that is a balance."
      >
        <span className="type-sm text-muted">(nothing renders)</span>
      </Case>
    </div>
  )
}

function Case({
  title,
  rule,
  example,
  children,
}: {
  title: string
  rule: string
  example: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-card border border-line-soft p-3">
      <div className="flex min-h-[28px] items-center gap-2">
        <span className="type-h3">{title}</span>
        {children}
      </div>
      <p className="type-sm mt-1 text-ink">{rule}</p>
      <p className="type-sm mt-0.5 text-muted">{example}</p>
    </div>
  )
}
