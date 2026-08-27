'use client'

import { ChevronRight, Link2, Loader2, Plus } from 'lucide-react'

import type { ConnectionPlatform } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { useConnectFlow } from '@/lib/connections/use-connect-flow'

/**
 * Start the Zernio connect flow.
 *
 * The window handling lives in `useConnectFlow` — a popup opened synchronously on
 * the click, with the full-page redirect behind it for every browser that blocks
 * one. This component owns the WORDS and nothing else.
 */
export function ConnectButton({
  platform,
  label,
  addingAnother = false,
  disabled,
  disabledReason,
}: {
  platform: ConnectionPlatform
  label: string
  /**
   * True when this channel already has an account linked.
   *
   * ── WHY THE WORDS HAVE TO CHANGE ───────────────────────────────────────────
   * "Connect Instagram" beside a connected Instagram account offers to do a thing
   * that is already done, and a person reading it reasonably concludes the button
   * is broken or that their connection is not real. A plan sells SLOTS and a slot
   * holds one account, so the second press is a different act from the first and
   * has to say so.
   */
  addingAnother?: boolean
  disabled?: boolean
  disabledReason?: string
}) {
  const { pending, error, start } = useConnectFlow(platform)

  const idleWords = addingAnother ? 'Add another account' : `Connect ${label}`
  const busyWords = addingAnother ? 'Opening…' : `Opening ${label}…`

  return (
    // Just the control. The CARD is `ChannelTile`, which owns the logo, the name
    // and the state — this used to draw its own card and its own logo row, which
    // is how the page ended up with two different tiles for one idea.
    <div className="flex w-full flex-col gap-1">
      <Button
        /* SECONDARY, not primary, and this is the reference's own rule rather
           than a preference: "one primary per view" and "orange is rationed"
           (README §Design system). /connections renders FOUR of these at once —
           Instagram, LinkedIn, X, Google Business Profile — so making each one
           a solid orange full-width button spent the accent four times on a
           single screen and turned a calm checklist into the loudest page in
           the app.

           Four equal options also means there is no single primary here: none
           of these channels outranks the others, and the page's real job is to
           show which are connected. The workhorse secondary says "you may press
           this" without shouting, and the accent stays available for the one
           place a screen genuinely has a primary action. */
        variant="secondary"
        size="sm"
        /* `justify-between` with a leading mark and a trailing chevron. The mark
           is the one thing that differs by intent: a link for the first account,
           a plus for the next, so the two acts are not one control wearing two
           labels. */
        className="w-full justify-between"
        disabled={disabled || pending}
        /* \u2500\u2500 WHY `aria-busy` IS SET HERE RATHER THAN VIA `loading` \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
           `Button`'s own `loading` prop renders its spinner as a SIBLING of
           children, which on a `justify-between` control makes three flex
           children instead of two \u2014 the spinner and the leading mark would
           push apart and the chevron would stop sitting at the right edge.
           So the spin is swapped in for the leading mark below, in place,
           and the one thing `loading` does that a caller cannot see is set
           explicitly. Without it a screen reader is told nothing at all
           happened for as long as the round trip takes. */
        aria-busy={pending || undefined}
        onClick={start}
        data-adding-another={addingAnother ? 'true' : 'false'}
        data-guide={disabled ? undefined : `connections.connect_${platform}`}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {/* The mark BECOMES the spinner rather than sitting beside one, so
              the control's width and the label's start never move. A button
              that reflows on click reads as a mis-click.

              INTEGRATION NOTE: wt-jiban wrote the spinner swap against a
              `Connect ${label}` literal; wt-divas had already made both the
              mark and the words depend on `addingAnother`, because a plan
              sells SLOTS and the second press is a different act from the
              first. Taking either side whole would have dropped the other's
              work, so both are kept: the spinner replaces WHICHEVER mark
              this instance would otherwise show. */}
          {pending ? (
            <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />
          ) : addingAnother ? (
            <Plus aria-hidden className="size-3.5 shrink-0" />
          ) : (
            <Link2 aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{pending ? busyWords : idleWords}</span>
        </span>
        <ChevronRight aria-hidden className="size-3.5 shrink-0" />
      </Button>
      {disabled && disabledReason ? (
        <span className="text-[11px] text-muted">{disabledReason}</span>
      ) : null}
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  )
}
