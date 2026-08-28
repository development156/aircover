import type { Connection } from '@sahoda/shared'

import { ChannelAccounts } from '@/components/connections/channel-accounts'
import { ChannelDetails } from '@/components/connections/channel-details'
import { ChannelLogo } from '@/components/connections/channel-logo'
import { ConnectButton } from '@/components/connections/connect-button'
import { TelegramConnect } from '@/components/connections/telegram-connect'
import { needsPairingCode } from '@/lib/zernio/connect-platform'
import { XRationMeter, type XRationMeterProps } from '@/components/connections/x-ration-meter'
import {
  READINESS_CLASS,
  READINESS_LABEL,
  asChannel,
  asPlatform,
  type CatalogueEntry,
} from '@/lib/connections/catalogue'
import { channelDetailContent } from '@/lib/connections/details'

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
  /**
   * EVERY account linked on this channel, oldest first. Empty when none is.
   *
   * This was a single optional `connection`, which was the screen's half of the
   * belief that a platform holds one account. It does not: the unique index is
   * `(workspace_id, platform, external_account ->> 'id')` and the plan counts
   * ROWS, so four Instagram accounts are four slots and were, until now, one
   * visible tile showing whichever row was written last.
   */
  connections: readonly Connection[]
  /** Why connecting is unavailable right now, if it is. */
  disabledReason?: string
  disabled?: boolean
  /** X only — the per-post spend meter. Absent on every other channel. */
  ration?: XRationMeterProps
  now?: Date
}

/**
 * The channel half of the tile — identical in both the connectable and the
 * coming-soon shapes, which is the point. Being unbuilt is a reason to look
 * PROVISIONAL, not a reason to be a different component.
 */
function ChannelHeader({
  entry,
  details,
}: {
  entry: CatalogueEntry
  details: ReturnType<typeof channelDetailContent>
}) {
  return (
    <div className="flex flex-col gap-1.5">
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
      {/* The rung and the way IN to everything behind it, on one line.

          Details sits here rather than on the tile's floor because the floor is
          where the actions are — Connect, Disconnect, Add another — and a control
          that only opens a reference panel does not belong in a row of controls
          that change a customer's account. It is also the one control every tile
          has, connectable or not, which is why it is beside the rung that is also
          on every tile. */}
      {/* ── THE RUNG MOVED BESIDE `kind`, NOT BESIDE THE NAME ─────────────
          The argument above is about the NAME: it is variable-width and comes
          from the catalogue, so a fixed-width chip sharing its row is paid for
          by it in silence. `kind` is neither — one or two short words from the
          same eight-row table — so the chip can sit with it and the tile loses a
          whole row. That row mattered: this grid went from eight tiles to
          twenty on 2026-08-26, so every row of tile chrome is now paid for
          twenty times and the screen was reported as looking bad. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
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
        <ChannelDetails
          label={details.label}
          blurb={details.blurb}
          rows={details.rows}
          note={details.note}
        />
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
      /* ── ALIVE, BUT NOT PRESSABLE ────────────────────────────────────────
         This used to carry the connectable tile's `hover:-translate-y-px`,
         with the reason "so a planned channel reads as a card on a roadmap
         rather than a dead box". The intent is right and is kept; the
         mechanism was not. A lift on pointer-over is the press affordance
         every OTHER card on this page uses to mean "this does something",
         and there is nothing here to press — no button, no link, nothing to
         tab to, which the header above is at pains to guarantee. Offering
         the gesture and then swallowing the click is the same broken
         promise as `<button disabled>`, made with motion instead of markup.

         The GROUND lifts instead. `.is-proposed` rests on `transparent`, so
         settling it onto `--surface-2` on hover is a real, visible answer to
         the pointer with no motion in it at all. It is also a property
         `transition-micro` actually animates — `background-color` is on its
         list, `filter` is not, so a brightness hover would have snapped
         rather than eased. The dashed edge is untouched: this card stays
         visibly provisional, which is the one thing it must keep saying. */
      className="is-proposed flex h-full flex-col gap-3 rounded-card p-4 transition-micro hover:bg-s2"
    >
      <ChannelHeader entry={entry} details={channelDetailContent(entry, 0)} />
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
      {/* ── THE ONE SENTENCE, AND IT SAYS WHICH KIND OF NOTHING THIS IS ────
          The blurb above it was removed with every other tile's: it described
          the channel and this line describes US, and only the second is what a
          reader on this row needs. It is the entry's own words rather than a
          constant, because "Sahoda can't post here yet" was true of eight
          different situations and is now true of one — a platform we cannot even
          link. Snapchat is not unbuilt, it is refused: 403
          `PLATFORM_BETA_RESTRICTED`. A remedy-shaped sentence there would be the
          impossible remedy `no-impossible-remedy.spec.ts` forbids. */}
      <p className="type-sm mt-auto border-t border-line-soft pt-2.5 text-muted">{entry.blurb}</p>
    </div>
  )
}

export function ChannelTile({
  entry,
  connections,
  disabled,
  disabledReason,
  ration,
  now = new Date(),
}: ChannelTileProps) {
  /**
   * ── THE BRANCH IS ABOUT LINKING, NOT ABOUT PUBLISHING ────────────────────
   * This was `asChannel`, which asks "can Sahoda POST here". Those were the same
   * question only while every connectable platform was also publishable. Eight
   * are now connect-only, and under the old branch all eight would have rendered
   * as unbuilt cards with no control at all — while the schema, the start route
   * and the plan gate were every one of them willing.
   *
   * `asPlatform` asks the question this component is actually about: can a row
   * exist in `connections` for this id. A planned id cannot — the CHECK
   * constraint sees to that — so this branch is still the type system and the
   * schema agreeing rather than a runtime guess.
   */
  const platform = asPlatform(entry.id)
  if (platform === null) return <ComingSoonTile entry={entry} />
  /** Publishable channels only. Drives nothing but the account rows' own copy. */
  const channel = asChannel(entry.id)

  const linked = connections.length > 0
  const details = channelDetailContent(entry, connections.length)

  return (
    <article
      data-channel={entry.id}
      data-connected={linked ? 'true' : 'false'}
      /* The ACCOUNT count, so a guard can tell one Instagram account from two
         without walking the DOM. `data-connected` cannot: it was true for one
         and true for two, which is exactly how a second account went missing
         from this screen without any check noticing. */
      data-account-count={connections.length}
      data-readiness={entry.readiness}
      /* ── HOVER IS A LIFT, AND IT COSTS NOTHING ──────────────────────────
         A 1px rise, a firmer ring and the card shadow — no colour change, so
         the tile's two status ladders stay the only things saying anything.
         `transition-micro` is the product's own duration/easing pair, and
         tokens.css zeroes it under `prefers-reduced-motion`, so this needs no
         media query of its own and no dependency. */
      className="surface-ring flex h-full flex-col rounded-card bg-surface p-3.5 transition-micro hover:-translate-y-px hover:shadow-card hover:surface-ring-firm"
    >
      <ChannelHeader entry={entry} details={details} />

      {/* ── THE BLURB IS BACK ON THE TILE FACE, CLAMPED ────────────────────
          It was removed on 2026-08-27 with a real measurement behind it: one
          sentence is ~40px, twenty cards is ~800px of prose nobody reads twice,
          and it answered a question ("what is Instagram for") that almost nobody
          on this screen is asking. Founder's ruling, 2026-08-27, reversing that:
          a marketplace card without a line saying what the platform is for is a
          logo and a button, and the reader who has never connected anything is
          exactly the reader this screen is for.

          `line-clamp-2` is the half of the old argument that survives. The
          removal was about UNBOUNDED height across twenty cards; two lines is
          bounded, so every tile in a row ends at the same place whatever its
          sentence runs to, and `mt-auto` on the floor below keeps the buttons on
          one line. The full sentence stays one tap away inside Details, verbatim
          — `channelDetailContent` is handed the same string, so there is one
          source and not two. */}
      <p className="type-sm mt-2 line-clamp-2 text-muted">{entry.blurb}</p>

      {/* THE DIVIDER IS THE AXIS. Above: the channel. Below: your accounts.
          A hairline rather than a gap, because §6 is explicit that a gap past a
          point wants to be a divider — and because two zones separated only by
          space read as one zone with awkward spacing. */}
      <hr className="my-2.5 border-0 border-t border-line-soft" />

      {linked ? (
        <ChannelAccounts
          channel={channel}
          platform={platform}
          label={entry.short}
          connections={connections}
          now={now}
        />
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
        <span className="type-chip inline-flex w-fit items-center gap-1.5 rounded-pill bg-brand-wash px-2 py-1 text-muted">
          <span aria-hidden className="size-1.5 rounded-pill bg-brand" />
          Not connected
        </span>
      )}

      {/* X only. The one channel that bills per post says so here, before the
          button that starts the flow — never after the money is gone. */}
      {ration ? <XRationMeter {...ration} /> : null}

      {/* `mt-auto` so the control sits on the tile's floor whatever the tile
          above it holds. Eight tiles in one grid with the buttons at eight
          different heights is the "loose template inside tight chrome" §3.4
          describes. */}
      {/* A HAIRLINE OVER THE CONTROL, matching the one that splits the tile.
          The tiles carry different amounts of content — X alone holds the spend
          row, and a channel with three accounts holds three rows — so without a
          rule the buttons floated at whatever height their own card ended at. */}
      <div className="mt-auto flex items-center gap-2 border-t border-line-soft pt-2.5">
        {/* ── CONNECT IS ALWAYS OFFERED, AND THAT IS THE FIX ────────────────
            The tile used to render Connect ONLY when the platform had no
            connection at all, so once a workspace linked one Instagram account
            there was no control anywhere in the product that could add a
            second — while the database, the plan gate and both OAuth routes
            were all perfectly willing to hold one. The screen was the whole
            blocker.

            The words change with what is already there, because "Connect
            Instagram" beside a connected Instagram account is an offer to do
            something that has already been done. `disabled` still carries the
            plan's answer, so a full plan says so here rather than starting a
            flow that the start route would refuse with a 403 after the customer
            had gone to the consent screen. */}
        {/* ── ONE CHANNEL DOES NOT OPEN A WINDOW, AND IT IS NOT AN EXCEPTION
            TO HIDE ────────────────────────────────────────────────────────
            MEASURED: `GET /v1/connect/telegram` returns no `authUrl` at all,
            only a pairing code the customer messages to a bot. There is no
            consent screen to pop up and no return trip to wait for, so
            `ConnectButton` — which is entirely about opening a window and
            listening for it to come home — cannot serve it. It answered
            "Couldn't start the connection. Try again." on every press until
            this branch existed.

            A branch on the platform id rather than a prop, because the two
            controls have different SHAPES: one is a button, the other is a
            code and a set of steps that stays on screen while the customer
            goes to another app. */}
        {needsPairingCode(platform) ? (
          <TelegramConnect disabled={disabled} disabledReason={disabledReason} />
        ) : (
          <ConnectButton
            platform={platform}
            label={entry.short}
            addingAnother={linked}
            disabled={disabled}
            disabledReason={disabledReason}
          />
        )}
      </div>
    </article>
  )
}
