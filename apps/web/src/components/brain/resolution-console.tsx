'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, MessageSquareQuote, Sparkles } from 'lucide-react'

import { confirmBrainFields } from '@/app/actions/brain-resolve-fields'
import { Button } from '@/components/ui/button'
import {
  queueTally,
  resolutionQueue,
  settledFields,
  type QueueEntry,
} from '@/lib/brand/resolution-queue'
import type { Provenance } from '@/lib/brand/provenance'
import type { BrandMemoryPayload } from '@sahoda/shared'

import { CertaintyMark } from './certainty-mark'
import { EntitlementGroup } from './entitlement-group'
import { ResolutionRow } from './resolution-row'
import type { CitedPassage } from '@/lib/knowledge/store'

export interface ResolutionConsoleProps {
  payload: BrandMemoryPayload
  provenance: Provenance
  /**
   * Field path → the library passage it came from, when it came from one.
   *
   * Absent for every field `brand_guidelines` wrote, which is most of them and
   * is not a degraded read — `brain-origin.ts` explains why that path can never
   * have per-field evidence. Present only where a citation was resolved from an
   * index WE supplied.
   */
  evidence?: ReadonlyMap<string, CitedPassage>
}

/**
 * The Signal Resolution Console's working surface.
 *
 * Everything Sahoda guessed, ordered by how little business it had guessing it,
 * with the two ways to settle each one and a single bulk accept for the ones a
 * person has read and agreed with.
 */
export function ResolutionConsole({ payload, provenance, evidence }: ResolutionConsoleProps) {
  const queue = useMemo(() => resolutionQueue(payload, provenance), [payload, provenance])
  const settled = useMemo(() => settledFields(payload, provenance), [payload, provenance])
  const tally = queueTally(queue)

  /**
   * SELECTION STARTS EMPTY, and that is the honesty rule of this screen.
   *
   * Pre-ticking every row would make one press confirm fifteen fields a person
   * has not scrolled past, and confirmation is the only signal the whole Brand
   * Brain rests on — the ring counts it, the mesh writes from it, and nothing
   * downstream can tell a considered tick from a rubber stamp. So the batch is
   * built by hand, one row at a time, and the button always names the count it
   * is about to act on.
   */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  /**
   * Rows resolved since this render, held so they leave the list immediately.
   *
   * The server action revalidates and the queue re-derives from fresh
   * provenance, but a revalidation is a round trip: without this, a confirmed
   * row sits there still marked "Guess" for as long as that takes, which reads
   * as a press that did nothing.
   */
  const [justResolved, setJustResolved] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()

  const open = queue.filter((entry) => !justResolved.has(entry.field.path))
  const chosen = [...picked].filter((path) => !justResolved.has(path))

  function toggle(path: string, selected: boolean) {
    setPicked((current) => {
      const next = new Set(current)
      if (selected) next.add(path)
      else next.delete(path)
      return next
    })
  }

  function resolved(path: string) {
    setJustResolved((current) => new Set(current).add(path))
    setPicked((current) => {
      const next = new Set(current)
      next.delete(path)
      return next
    })
  }

  function confirmChosen() {
    setError(null)
    setDone(null)
    startSaving(async () => {
      const result = await confirmBrainFields(chosen)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setJustResolved((current) => {
        const next = new Set(current)
        for (const path of chosen) next.add(path)
        return next
      })
      setPicked(new Set())
      setDone(`Confirmed ${result.confirmed} ${result.confirmed === 1 ? 'field' : 'fields'}.`)
    })
  }

  /**
   * Select-all acts on the OPEN rows only, and never on a blank one.
   *
   * A blank field has nothing to agree with, so including it would send a path
   * the row itself refuses to offer — and `nextFieldMeta` would happily stamp
   * it confirmed, leaving a field marked "a person stands behind this" whose
   * value is nothing at all.
   */
  const selectable = open.filter((entry) => !entry.blank)
  const allPicked = selectable.length > 0 && selectable.every((e) => picked.has(e.field.path))

  if (open.length === 0) {
    return (
      <section className="surface-ring rounded-card bg-surface" aria-labelledby="console-clear">
        <div className="flex flex-col gap-2 px-4 py-6">
          <h2 id="console-clear" className="type-h2">
            Nothing left to check
          </h2>
          <p className="type-body text-muted">
            All {tally.registered} fields are confirmed by you. Sahoda writes from your answers, not
            its guesses. Rebuilding would replace every one of them.
          </p>
        </div>
        {settled.length > 0 ? <Settled entries={settled} /> : null}
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-grid">
      <section className="surface-ring rounded-card bg-surface" aria-labelledby="console-queue">
        <header className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">
          <h2 id="console-queue" className="type-h2">
            Still to check
          </h2>
          <span className="num type-sm ml-auto text-muted">
            {open.length} of {tally.registered}
          </span>
        </header>

        {/*
          THE SELECT-ALL, as a control and not as a header checkbox.

          It is a `ghost` button rather than a tri-state box in the header row:
          an indeterminate checkbox has no accessible name of its own here, and
          the two states this actually needs are "tick everything I can see" and
          "start over", which are two verbs.
        */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving || selectable.length === 0}
            onClick={() =>
              setPicked(allPicked ? new Set() : new Set(selectable.map((e) => e.field.path)))
            }
          >
            {allPicked ? 'Clear selection' : `Select all ${selectable.length}`}
          </Button>
          <p className="type-sm text-muted">
            Tick the guesses you agree with. Confirming is free. It never rebuilds anything.
          </p>
        </div>

        {/*
          GROUPED BY WHOSE KNOWLEDGE IT IS — the screen's whole argument, stated
          once over each run rather than re-stated under every row. `divided` is
          indexed over the FILTERED list, so if every `asked` row is confirmed
          the surviving group is still index 0 and grows no stray top rule.
        */}
        {(['intake', 'asked', 'negotiated'] as const)
          .map((kind) => ({
            kind,
            rows: open.filter((entry) =>
              kind === 'intake'
                ? entry.state === 'intake'
                : entry.state !== 'intake' && entry.field.metaKind === kind,
            ),
          }))
          .filter((group) => group.rows.length > 0)
          .map((group, index) => (
            <EntitlementGroup key={group.kind} kind={group.kind} divided={index > 0}>
              {group.rows.map((entry) => (
                <ResolutionRow
                  key={entry.field.path}
                  entry={entry}
                  cited={evidence?.get(entry.field.path) ?? null}
                  selected={picked.has(entry.field.path)}
                  onSelectedChange={(next) => toggle(entry.field.path, next)}
                  onResolved={resolved}
                />
              ))}
            </EntitlementGroup>
          ))}

        {/*
          THE ONE PRIMARY ACTION ON THIS VIEW (docs/26 §1.5).

          Every row-level control is secondary or ghost precisely so this one
          reads as the way through. It names its count, so it can never confirm
          more than the number on its own face.
        */}
        <div className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-3">
          <Button
            type="button"
            data-guide="console.confirm-selected"
            loading={saving}
            disabled={chosen.length === 0}
            onClick={confirmChosen}
          >
            {chosen.length === 0
              ? 'Confirm selected · free'
              : `Confirm ${chosen.length} selected · free`}
          </Button>
          {chosen.length === 0 ? (
            <p className="type-sm text-muted">Nothing selected yet.</p>
          ) : (
            <p className="type-sm text-muted">
              Marks <span className="num font-[550] text-ink">{chosen.length}</span>{' '}
              {chosen.length === 1 ? 'field' : 'fields'} as yours. The words stay the same.
            </p>
          )}
        </div>

        {error ? (
          <p role="alert" className="border-t border-line-soft px-4 py-3 type-sm text-danger">
            {error}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="border-t border-line-soft px-4 py-3 type-sm text-ink">
            {done}
          </p>
        ) : null}
      </section>

      {settled.length > 0 ? (
        <section className="surface-ring rounded-card bg-surface" aria-labelledby="console-settled">
          <Settled entries={settled} />
        </section>
      ) : null}
    </div>
  )
}

/**
 * What is already settled — present, and deliberately quiet.
 *
 * It is a `<details>` rather than a second full list: the console's subject is
 * what still needs a person, and a confirmed field competing for the same
 * vertical space would bury it. Closed by default, but never omitted — a screen
 * that shows only the unresolved half makes a nearly-finished brain look like an
 * unstarted one.
 */
function Settled({ entries }: { entries: readonly QueueEntry[] }) {
  return (
    <details className="group">
      <summary className="flex min-h-[46px] cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="type-h3 text-ink">Confirmed by you</span>
        <span className="num type-sm ml-auto text-muted">{entries.length}</span>
      </summary>
      <ul className="border-t border-line-soft">
        {entries.map((entry) => (
          <li
            key={entry.field.path}
            className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 last:border-b-0"
          >
            <span className="type-body min-w-0 flex-1 text-ink">{entry.field.label}</span>
            {/*
              A CONFIRMED FIELD CAN BE EMPTY, and the row has to say so.

              "There are none" writes an empty list AND marks the field
              confirmed, so it leaves the queue and lands here — where a label
              beside a Confirmed mark would read as "a person wrote an answer",
              which is the opposite of what happened. This states the answer they
              actually gave. It is only reachable on the open lists; a text field
              is never offered an empty answer (see `resolution-row.tsx`).
            */}
            {entry.blank ? (
              <span className="type-sm shrink-0 text-muted">you said there are none</span>
            ) : null}
            <CertaintyMark state="confirmed" />
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * The split, stated in words as well as in the bar above it.
 *
 * Exported so the page header and the queue cannot drift: both read the same
 * tally from the same function.
 */
export function QueueLegend({
  unearned,
  proposed,
  fromIntake = 0,
}: {
  unearned: number
  proposed: number
  fromIntake?: number
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1">
      {fromIntake > 0 ? (
        <li className="type-sm flex items-center gap-icon-gap text-muted">
          <MessageSquareQuote className="size-[13px] shrink-0 text-ink" aria-hidden />
          <span className="num font-[550] text-ink">{fromIntake}</span> from your answers
        </li>
      ) : null}
      <li className="type-sm flex items-center gap-icon-gap text-muted">
        <Sparkles className="size-[13px] shrink-0 text-ink" aria-hidden />
        <span className="num font-[550] text-ink">{unearned}</span> only you can answer
      </li>
      <li className="type-sm flex items-center gap-icon-gap text-muted">
        <Check className="size-[13px] shrink-0" aria-hidden />
        <span className="num font-[550]">{proposed}</span> Sahoda wrote for you
      </li>
    </ul>
  )
}
