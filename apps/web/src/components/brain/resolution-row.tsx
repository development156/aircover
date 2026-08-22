'use client'

import { useId, useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'

import { confirmBrainField } from '@/app/actions/brand-field'
import { Button } from '@/components/ui/button'
import { entitlementOf, type QueueEntry } from '@/lib/brand/resolution-queue'
import { leavesEqual, type BrainLeaf } from '@/lib/brand/leaf'
import { cn } from '@/lib/utils'

import { CertaintyMark } from './certainty-mark'
import { FieldEditor } from './field-editor'
import { FieldValue } from './field-value'

export interface ResolutionRowProps {
  entry: QueueEntry
  /** Whether this row is in the bulk selection. */
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  /** Fired after a single-row confirm or correction lands, so the parent can drop it. */
  onResolved: (path: string) => void
}

/**
 * One unresolved signal: what Sahoda guessed, why it was allowed to, and the
 * two honest ways to settle it.
 *
 * ── THE ROW HAS EXACTLY ONE DESTRUCTIVE-FREE SHAPE ───────────────────────────
 * docs/26 §1.5: a destructive action never gets standing real estate in a list
 * row — `/posts` giving every card a permanent `Delete` is the failure that rule
 * exists to stop. So there is no Reject button here. Clearing a field lives
 * INSIDE the editor, behind the same explicit press as any other correction,
 * and only where the payload contract permits an empty value (see
 * `field-editor.tsx` and the note on `fixedLength` below).
 *
 * ── AND EXACTLY ONE PRIMARY, WHICH IS NOT HERE ───────────────────────────────
 * docs/26 §1.5 again: one primary action per view. A queue of eleven rows each
 * carrying a primary `Confirm` is eleven primaries and therefore none. The
 * console's single primary is the bulk accept at the foot of the list; every
 * row-level action is `secondary` (hairline) or `ghost`. That is also the right
 * emphasis: the fast path through a fresh brain is to read, tick, and accept a
 * batch, not to press fifteen buttons.
 */
export function ResolutionRow({
  entry,
  selected,
  onSelectedChange,
  onResolved,
}: ResolutionRowProps) {
  const { field, value, state, blank } = entry
  const entitlement = entitlementOf(field)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<BrainLeaf>(value)
  const [error, setError] = useState<string | null>(null)
  const [pending, startSaving] = useTransition()
  const checkboxId = useId()

  function beginEdit() {
    // Re-seeded from the server value on every entry, so a cancelled edit or a
    // resolve that landed while this row sat open cannot resurrect a stale draft.
    setDraft(value)
    setError(null)
    setEditing(true)
  }

  function save(next: BrainLeaf) {
    setError(null)
    startSaving(async () => {
      const result = await confirmBrainField(field.path, next)
      if (!result.ok) {
        setError(result.message)
        return
      }
      // Left open on failure so the typing survives; on success the row leaves
      // the queue and the revalidated server render is the truth.
      setEditing(false)
      onResolved(field.path)
    })
  }

  const unchanged = leavesEqual(draft, value)

  /**
   * Emptying is only offered where an empty value is a real answer: an OPEN
   * list, where "there are none" is a position a person can hold. See the note
   * beside the control.
   */
  const clearable = !blank && field.kind === 'list' && !field.fixedLength

  return (
    <li
      data-guide={`console.field.${field.path}`}
      data-field={field.path}
      className="border-b border-line-soft last:border-b-0"
    >
      <div className="flex flex-col gap-2 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            A NATIVE CHECKBOX, visually hidden with a drawn box beside it — the
            same construction `pick-chips.tsx` uses for its radios, and for the
            same reason: the roving focus, the space-bar toggle, the label
            association and the form semantics all come free and correct, and a
            hand-rolled `aria-checked` div gets at least one of them subtly wrong.

            The label wraps BOTH the box and the field name, so the whole thing
            is one hit target and the accessible name is the field, not "check".
          */}
          <label className="flex min-w-0 cursor-pointer items-center gap-2.5 max-narrow:min-h-[44px]">
            {/*
              THE INPUT SITS ON TOP OF ITS OWN PICTURE, not behind it.

              The first build followed `pick-chips.tsx` and made the control
              `sr-only` with a drawn box beside it. That is correct for a radio
              in a chip whose whole 28px pill is the label, and wrong here: a
              real browser reported the drawn `<span>` "intercepts pointer
              events" and then that the input was "outside of the viewport",
              because `sr-only` clips the control to 1px and parks it behind the
              graphic. Clicking the LABEL still worked, so a person could always
              tick a row — but the 18px box that looks like the checkbox was not
              a hit target for a pointer, and focusing it by keyboard could
              scroll to a 1px box rather than to the row.
              Found by `e2e/resolution-console.spec.ts`; the jsdom suite cannot
              see it, because `userEvent.click` on a checkbox does not care where
              the element is.

              So: the real control is absolutely positioned across the full 18px,
              transparent, and on top. It takes every click and every focus. The
              picture below it is `pointer-events-none` and `aria-hidden` — it is
              decoration for a control that is genuinely there.

              `peer` still works because the input is the PREVIOUS SIBLING of the
              span it styles. And the label no longer carries `htmlFor`: the
              input is nested, so the association is implicit, and naming it
              twice is the redundancy that produces double-toggles.
            */}
            <span className="relative grid size-[18px] shrink-0 place-items-center">
              <input
                id={checkboxId}
                type="checkbox"
                checked={selected}
                disabled={pending || blank}
                onChange={(event) => onSelectedChange(event.target.checked)}
                className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none grid size-[18px] place-items-center rounded-sm transition-micro',
                  /*
                    A PROXY FOCUS RING, not an override of one.

                    docs/26 §1.4 forbids per-component focus treatments, and this
                    is not one: the real control is transparent, so the global
                    `:focus-visible` ring would paint on an invisible box. The
                    ring has to be drawn on the element the user can see, and it
                    reproduces the global treatment EXACTLY rather than inventing
                    a smaller one — 2px ink outline at 2px offset PLUS the 4px
                    `--brand-lift` halo. The two tones are the requirement: an
                    orange ring alone measures 2.94:1 and misses the WCAG 1.4.11
                    3:1 floor, so the ink core carries the contrast and the orange
                    carries the brand.
                  */
                  'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-focus-visible:shadow-[0_0_0_4px_var(--brand-lift)]',
                  selected
                    ? 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                    : 'shadow-[inset_0_0_0_1px_var(--line-firm)]',
                  (pending || blank) && 'opacity-45',
                )}
              >
                {/* An inline mark rather than a lucide glyph: at 18px a stroked
                    icon reads as a smudge, and this shape is the same tick the
                    Certainty System already uses for "a person did this". */}
                {selected ? (
                  <svg viewBox="0 0 12 12" className="size-[11px]" fill="none" aria-hidden>
                    <path
                      d="M2.5 6.2 4.8 8.5 9.5 3.8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </span>
            </span>
            {/*
              WRAPS, NEVER TRUNCATES. docs/26 §9: labels never collapse. A field
              label is two or three words ("Signature phrases", "Wants to
              become"), so at 390px it costs one extra line and loses nothing —
              whereas an ellipsis on the only thing identifying the row makes the
              queue unreadable on the width most of these users are on.
            */}
            <span className="type-h3 min-w-0 text-ink">{field.label}</span>
            {/*
              THE ROW'S HALF OF THE GROUPING, for a person who never reads the
              header. The entitlement SENTENCE now sits once over the run
              (`entitlement-group.tsx`), but a screen-reader user tabbing
              checkbox to checkbox never enters it, so the four-word marker rides
              in the accessible name instead: "Red lines. Only you know this,
              checkbox". `sr-only`, never `max-wide:hidden` — the latter strips
              the name outright.
            */}
            <span className="sr-only">. {entitlement.label}</span>
          </label>

          <CertaintyMark state={state} />

          {!editing ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/*
                A BLANK GUESS CANNOT BE CONFIRMED, and the control says why
                rather than sitting there disabled. `field-value.tsx` already
                treats blank as its own answer — "the model left it out, and it
                is the one case where 'guess' would overstate what is actually
                there". There is nothing to agree with, so agreeing is not
                offered; the only move is to write one.
              */}
              {blank ? (
                <span className="type-sm text-muted">Nothing to confirm — it is empty</span>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={pending}
                  onClick={() => save(value)}
                >
                  Confirm · free
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={beginEdit}>
                <Pencil size={13} aria-hidden />
                {blank ? 'Write it' : 'Correct'}
              </Button>
            </div>
          ) : null}
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <FieldEditor field={field} draft={draft} onDraftChange={setDraft} disabled={pending} />
            <p className="type-sm text-muted">{field.question}</p>
            {error ? (
              <p role="alert" className="type-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={pending}
                onClick={() => save(draft)}
              >
                {unchanged ? 'Confirm as written · free' : 'Save · free'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setDraft(value)
                  setError(null)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
              {/*
                CLEARING, AND WHERE AN EMPTY VALUE IS ACTUALLY AN ANSWER.

                WHAT IT RECORDS, verified rather than assumed. `confirmBrainField`
                passes the path in `confirmPaths`, so `nextFieldMeta` stamps
                `confirmedByOwner` — a cleared field comes back
                `confirmed: true`. An earlier draft of this row told the user the
                opposite ("afterwards this field looks the same as one Sahoda
                never filled"); that is false. A field Sahoda never filled is
                `confirmed: false`. Clearing is a DECISION and it is recorded as
                one, which is why it counts toward the ring.

                WHICH IS EXACTLY WHY IT IS OFFERED ON OPEN LISTS ONLY. For
                `red_lines` and `banned_phrases`, an empty list is a real,
                confirmable answer: "there are none". For a text field it is not
                — a blank `core_promise` is an ABSENCE, not a position, and
                recording "a person confirmed this promise" over nothing at all
                would put a hollow field into the confirmed count. That is the
                fake-confirmation state the whole `field_meta` contract exists to
                prevent, arriving through the one control that can empty a field.
                Correcting the wording is the route for a text field; there is no
                honest "none" to record.

                The three `fixedLength` lists are excluded on a different ground:
                `BrandMemoryPayloadSchema` pins them at exactly three entries and
                `confirmBrainField` refuses any other length, so a Clear here
                would be a button the server rejects.
              */}
              {clearable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => save([])}
                >
                  There are none
                </Button>
              ) : null}
            </div>
            {clearable ? (
              <p className="type-sm text-muted">
                Emptying this list records &ldquo;there are none&rdquo; as your answer, so it counts
                as confirmed and Sahoda stops leaning on what it guessed here.
              </p>
            ) : null}
            {field.fixedLength ? (
              <p className="type-sm text-muted">
                This list always holds three entries, so it cannot be emptied. Replace the wording
                instead.
              </p>
            ) : null}
            {!clearable && !field.fixedLength ? (
              <p className="type-sm text-muted">
                There is no way to record &ldquo;nothing&rdquo; here — a blank answer would be an
                absence rather than a position, and Sahoda will not count one as yours. Say it in
                your own words instead.
              </p>
            ) : null}
          </div>
        ) : (
          /*
            `FieldValue` draws its OWN certainty container (`valueBoxClass`) —
            solid once confirmed, dashed while it is a guess. The row does not
            add one. Wrapping it in a second box would paint a dashed edge
            inside a dashed edge, which is docs/26 §7's "never use border and
            ring together" in its other common form, and it would make the rung
            read as two rungs.
          */
          <FieldValue field={field} value={value} state={state} />
        )}
      </div>
    </li>
  )
}
