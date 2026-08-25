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
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <ChannelLogo channel={entry.id} />
        {/* NO `truncate`. The name is this tile's whole subject and it comes from
            an eight-row catalogue, not from customer data — there was never a
            long value to defend against, only a slot too narrow to hold "Google
            Business Profile" (147px) once a 22px mark and an 88px chip had taken
            their share of a 181px tile at 1180px. */}
        <div className="min-w-0 flex-1">
          <p className="type-h3">{entry.label}</p>
          <p className="type-eyebrow mt-label-gap text-muted">{entry.kind}</p>
        </div>
      </div>
      {/* The readiness rung, on its OWN line. It is a fixed-width claim about
          Sahoda; the name is a variable-width claim about the channel. Sharing
          one row meant the fixed thing was paid for by the variable one, in
          silence — and the `kind` beneath the name, which carries no `truncate`,
          wrapped or painted outside its box instead of being clipped.
          `self-start` keeps the chip hugging its own text.

          `.is-proposed` and `.is-committed` are outline treatments, so this chip
          is quiet by construction on the two channels that need a caveat, and a
          solid brand fill on the two that have earned it. Ink on the fill, never
          white (§1.2). */}
      <span
        /* A DISTINCT hook from the tile's own `data-readiness`. Both carried the
           same attribute, so a `[data-readiness="..."]` query matched the
           <article> on a connectable channel and the chip on a coming-soon one —
           two different elements answering one selector. The dark-mode guard
           below caught it by reading a 0px border off the wrapper. */
        data-readiness-chip={entry.readiness}
        className={`${READINESS_CLASS[entry.readiness]} type-chip self-start rounded-sm px-[7px] py-[3px]`}
      >
        {READINESS_LABEL[entry.readiness]}
      </span>
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
      /* The same lift, so a planned channel reads as a card on a roadmap
         rather than a dead box — while `.is-proposed` keeps it visibly
         provisional. No shadow: it is not offering an action. */
      className="is-proposed flex h-full flex-col gap-3 rounded-card p-4 transition-micro hover:-translate-y-px"
    >
      <ChannelHeader entry={entry} />
      {/* What the channel is FOR. Present tense describes the channel, not an
          offer — the "Coming soon" rung above and the line below both say we
          cannot do it yet, so this sentence never has to carry that too. */}
      <p className="type-sm text-muted">{entry.blurb}</p>
      {/* NOT "Not connected". That is the sentence a CONNECTABLE channel uses, and
          on a tile with no adapter it implies the customer could fix it by
          connecting — the exact confusion between "unbuilt" and "unconfigured"
          this whole treatment exists to end.

          A sentence about SAHODA, never a figure about the customer: a container
          labelled coming soon is a promise we control, while a number inside one
          is a claim about their business no query in this codebase can support.

          ── AND IT IS NOT A "NOTIFY ME" BUTTON ─────────────────────────────
          The reference for this page puts a control here. There is no table, no
          action and no sender behind one, so it would be a button that promises
          a message nobody can send — the impossible remedy `no-impossible-
          remedy.spec.ts` exists to catch, and the same failure this component's
          header rejects a `<button disabled>` for. The floor keeps the honest
          sentence until the notify flow is real. */}
      <p className="type-sm mt-auto border-t border-line-soft pt-3 text-muted">
        Sahoda can&rsquo;t post here yet.
      </p>
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
      /* ── HOVER IS A LIFT, AND IT COSTS NOTHING ──────────────────────────
         A 1px rise, a firmer ring and the card shadow — no colour change, so
         the tile's two status ladders stay the only things saying anything.
         `transition-micro` is the product's own duration/easing pair, and
         tokens.css zeroes it under `prefers-reduced-motion`, so this needs no
         media query of its own and no dependency. */
      className="surface-ring flex h-full flex-col rounded-card bg-surface p-4 transition-micro hover:-translate-y-px hover:shadow-card hover:surface-ring-firm"
    >
      <ChannelHeader entry={entry} />

      {/* What Sahoda does with this channel, in one sentence. It sits ABOVE the
          divider because it is a claim about the CHANNEL, which is what this
          zone is for — putting it below would file "what Instagram is for"
          under "what your workspace has done about it". */}
      <p className="type-sm mt-2 text-muted">{entry.blurb}</p>

      {/* THE DIVIDER IS THE AXIS. Above: the channel. Below: your account.
          A hairline rather than a gap, because §6 is explicit that a gap past a
          point wants to be a divider — and because two zones separated only by
          space read as one zone with awkward spacing. */}
      <hr className="my-3 border-0 border-t border-line-soft" />

      <div className="flex min-h-[20px] items-center justify-between gap-2">
        {status ? (
          <Badge rung={status.rung}>{status.label}</Badge>
        ) : (
          /* ── A CHIP, AND THE DOT IS NOT THE MESSAGE ──────────────────────
             "Not connected" was plain grey text beside a Badge on the
             connected tiles: one slot, two vocabularies, which is the exact
             §3.3 defect the divider above was introduced to end — it fixed
             the SUBJECT split and left the TREATMENT split standing.

             It is not a `Badge`, because the ladder ranks how much a thing
             NEEDS YOU and an unconnected channel needs nothing; rung 4 would
             put a tick on it. So it is a chip in the same shape at a quieter
             weight.

             The wash is `--brand-wash` at alpha 0.06, which
             `accent-area-budget.spec.ts` skips (it ignores any paint under
             0.08), so four of these cost the screen's accent budget nothing.
             The dot is decorative and the WORDS carry the claim — hue is
             never load-bearing here (docs/37 §1). */
          <span className="type-chip inline-flex items-center gap-1.5 rounded-pill bg-brand-wash px-2 py-1 text-muted">
            <span aria-hidden className="size-1.5 rounded-pill bg-brand" />
            Not connected
          </span>
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
      {/* A HAIRLINE OVER THE CONTROL, matching the one that splits the tile.
          The tiles carry different amounts of content — X alone holds the spend
          row — so without a rule the buttons floated at whatever height their
          own card ended at. `mt-auto` already pinned them to the floor; the
          border makes that floor visible, so eight cards read as one row. */}
      <div className="mt-auto flex items-center gap-2 border-t border-line-soft pt-3">
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
