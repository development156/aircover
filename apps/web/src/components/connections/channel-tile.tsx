import type { Connection } from '@sahoda/shared'

import { ChannelLogo } from '@/components/connections/channel-logo'
import { ConnectButton } from '@/components/connections/connect-button'
import { DisconnectButton } from '@/components/connections/disconnect-button'
import { ReconnectButton } from '@/components/connections/reconnect-button'
import { XRationMeter, type XRationMeterProps } from '@/components/connections/x-ration-meter'
import { Badge, type Rung } from '@/components/ui/badge'
import { accountLabel } from '@/lib/connections/account-label'
import {
  READINESS_CLASS,
  READINESS_LABEL,
  asChannel,
  type CatalogueEntry,
} from '@/lib/connections/catalogue'
import { connectionHealth, handleOf } from '@/lib/connections/health'

/**
 * ONE TILE PER CHANNEL — connected or not, built or not.
 *
 * ── TWO ZONES, BECAUSE THERE ARE TWO CLAIMS ──────────────────────────────────
 * The tile is split by a hairline into the only two things a person comes here to
 * find out, and they are claims about different subjects:
 *
 *   ABOVE  what SAHODA can do with this channel   — mark, name, kind, readiness
 *   BELOW  what THIS WORKSPACE has done about it  — account, health, the control
 *
 * `docs/27_Design_Audit.md` §3.3 measured what happens when those share one slot:
 * in a single row of four cards, Instagram and LinkedIn rendered status as plain
 * grey text ("Available") while X and Google Business Profile rendered it as a
 * hairline chip ("Not verified live") — two vocabularies for one slot, and the
 * less important status got the stronger treatment. Neither was wrong on its own;
 * they were answers to different questions sharing a line.
 *
 * `docs/26_Design_System_v4.md` §3.3 already rules on this exact shape for post
 * status: when one rung has to carry two meanings, the fix is a SECOND STRUCTURAL
 * AXIS, never a weaker rung. Here the axis is spatial — the divider — so it
 * survives greyscale, and it survives a reader who never learns what the chips
 * mean, because position alone tells them which subject they are reading about.
 *
 * ── THE TWO LADDERS ARE DELIBERATELY DIFFERENT COMPONENTS ────────────────────
 *   readiness  → the Certainty System (`.is-real` / `.is-committed` /
 *                `.is-proposed`), which ranks HOW REAL a thing is.
 *   connection → the `Badge` rung ladder, which ranks HOW MUCH IT NEEDS YOU.
 *
 * Collapsing them is explicitly forbidden (`docs/26` §3.2), and this screen is the
 * clearest case for why: a channel that publishes today is maximally REAL and, if
 * your token just expired, maximally URGENT. One chip cannot say both.
 */
export interface ChannelTileProps {
  entry: CatalogueEntry
  /** The live row, when one exists. */
  connection?: Connection
  /** Why connecting is unavailable right now, if it is. */
  disabledReason?: string
  disabled?: boolean
  /** X only — the per-post spend meter. Absent on every other channel. */
  ration?: XRationMeterProps
  now?: Date
}

function statusOf(
  connection: Connection | undefined,
  now: Date,
): { rung: Rung; label: string } | null {
  if (!connection) return null
  const health = connectionHealth(connection, now)
  if (connection.status === 'active' && health.kind === 'ok') {
    return { rung: 'active', label: 'Connected' }
  }
  // Everything else needs a person. A dead token and an expiring one are the
  // same problem to whoever's posts stop going out.
  return { rung: 'urgent', label: 'Needs you' }
}

/**
 * The channel half of the tile — identical in both the connectable and the
 * coming-soon shapes, which is the point. Being unbuilt is a reason to look
 * PROVISIONAL, not a reason to be a different component.
 */
function ChannelHeader({ entry }: { entry: CatalogueEntry }) {
  return (
    <div className="flex items-start gap-2">
      <ChannelLogo channel={entry.id} />
      {/* ── THE NAME NEVER LOSES TO THE CHIP ──────────────────────────────────
          These were siblings in one row: the chip `shrink-0`, the name
          `flex-1 truncate`. So the name absorbed all the shrink and MEASURED at
          1440 on a four-column grid it rendered "Instagr…", "Google …" and
          "Faceboo…" — on the one screen in the product whose entire subject is
          telling channels apart. docs/26 §1.6 already made that argument about
          the drawn marks ("two of eight tiles were anonymous"); the same
          argument applies to the word underneath them.

          `no-truncated-labels.spec.ts` could not see it, and was right not to
          by its own rule: it exempts anything wearing `truncate`, because an
          explicit ellipsis on a long customer string is a decision. A CATALOGUE
          label is not a customer string. The guard has been extended to say so.

          Wrapping rather than a second fixed row: the chip sits beside the name
          when there is room for both and drops beneath it when there is not, so
          one rule holds at 390, 1024 and 1440 without a breakpoint. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="type-h3">{entry.label}</p>
          {/* The readiness rung. `.is-proposed` and `.is-committed` are outline
              treatments, so this chip is quiet by construction on the two
              channels that need a caveat, and a solid brand fill on the two that
              have earned it. Ink on the fill, never white (§1.2). */}
          <span
            /* A DISTINCT hook from the tile's own `data-readiness`. Both carried the
           same attribute, so a `[data-readiness="..."]` query matched the
           <article> on a connectable channel and the chip on a coming-soon one —
           two different elements answering one selector. The dark-mode guard
           below caught it by reading a 0px border off the wrapper. */
            data-readiness-chip={entry.readiness}
            className={`${READINESS_CLASS[entry.readiness]} type-chip shrink-0 rounded-sm px-[7px] py-[3px]`}
          >
            {READINESS_LABEL[entry.readiness]}
          </span>
        </div>
        <p className="type-eyebrow mt-label-gap text-muted">{entry.kind}</p>
      </div>
    </div>
  )
}

/**
 * A channel with no adapter.
 *
 * ── A `<div>`, NEVER A `<button disabled>` ───────────────────────────────────
 * A disabled button is still announced as a button: a screen reader offers the
 * action, the user takes it, nothing happens, and the failure reads as "broken
 * app" rather than "unbuilt feature" (`docs/26` §10.2, guarded by
 * `e2e/design-system.spec.ts`). `aria-disabled` is not used either — it describes
 * a control that exists and is unavailable, not one that was never built.
 *
 * There is no control here at all, which is the strongest version of the same
 * rule: nothing to tab to, so nothing to be disappointed by.
 */
function ComingSoonTile({ entry }: { entry: CatalogueEntry }) {
  return (
    <div
      data-channel={entry.id}
      data-coming-soon="true"
      data-connected="false"
      className="is-proposed flex h-full flex-col gap-3 rounded-card p-4"
    >
      <ChannelHeader entry={entry} />
      {/* NOT "Not connected". That is the sentence a CONNECTABLE channel uses, and
          on a tile with no adapter it implies the customer could fix it by
          connecting — the exact confusion between "unbuilt" and "unconfigured"
          this whole treatment exists to end.

          A sentence about SAHODA, never a figure about the customer: a container
          labelled coming soon is a promise we control, while a number inside one
          is a claim about their business no query in this codebase can support. */}
      <p className="type-sm mt-auto text-muted">Sahoda can&rsquo;t post here yet.</p>
    </div>
  )
}

export function ChannelTile({
  entry,
  connection,
  disabled,
  disabledReason,
  ration,
  now = new Date(),
}: ChannelTileProps) {
  const channel = asChannel(entry.id)
  // A planned channel cannot hold a connection row — the database CHECK
  // constraint sees to that — so this branch is the type system and the schema
  // agreeing rather than a runtime guess.
  if (channel === null) return <ComingSoonTile entry={entry} />

  const status = statusOf(connection, now)
  const handle = connection ? handleOf(connection) : null
  const account = connection ? accountLabel(connection.external_account) : null
  const health = connection ? connectionHealth(connection, now) : null

  return (
    <article
      data-channel={entry.id}
      data-connected={connection ? 'true' : 'false'}
      data-readiness={entry.readiness}
      className="surface-ring flex h-full flex-col rounded-card bg-surface p-4"
    >
      <ChannelHeader entry={entry} />

      {/* THE DIVIDER IS THE AXIS. Above: the channel. Below: your account.
          A hairline rather than a gap, because §6 is explicit that a gap past a
          point wants to be a divider — and because two zones separated only by
          space read as one zone with awkward spacing. */}
      <hr className="my-3 border-0 border-t border-line-soft" />

      <div className="flex min-h-[20px] items-center justify-between gap-2">
        {status ? (
          <Badge rung={status.rung}>{status.label}</Badge>
        ) : (
          <span className="type-sm text-muted">Not connected</span>
        )}
        {/* The expiry line. 60 days, no refresh, no warning from anyone — so a
            tile that says "Connected" without saying "for how much longer" is
            the shape of a customer finding out a week after their posts died. */}
        {health && health.kind === 'ok' && health.daysLeft !== null ? (
          <span className="type-sm num shrink-0 text-muted">{health.daysLeft}d left</span>
        ) : null}
      </div>

      {connection && (handle || account) ? (
        <p className="type-sm mt-1 truncate text-muted">
          {handle ? `@${handle.replace(/^@/, '')}` : account}
        </p>
      ) : null}

      {/* X only. The one channel that bills per post says so here, before the
          button that starts the flow — never after the money is gone. */}
      {ration ? <XRationMeter {...ration} /> : null}

      {/* `mt-auto` so the control sits on the tile's floor whatever the tile
          above it holds. Eight tiles in one grid with the buttons at eight
          different heights is the "loose template inside tight chrome" §3.4
          describes. */}
      <div className="mt-auto flex items-center gap-2 pt-3">
        {connection ? (
          <>
            {health && health.kind !== 'ok' ? (
              <ReconnectButton platform={channel} label={entry.short} />
            ) : null}
            <DisconnectButton connectionId={connection.id} label={account ?? entry.label} />
          </>
        ) : (
          <ConnectButton
            platform={channel}
            label={entry.short}
            disabled={disabled}
            disabledReason={disabledReason}
          />
        )}
      </div>
    </article>
  )
}
