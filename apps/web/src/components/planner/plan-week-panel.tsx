'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowRight, Share2, Sparkles, Target } from 'lucide-react'
import { creditCost, toChannelSet, type ChannelSet } from '@sahoda/shared'

import { planMyWeek } from '@/app/actions/plan-week'
import { WarmBand } from '@/components/planner/warm-band'
import { ChannelPicker } from '@/components/posts/channel-picker'
import { InlineError } from '@/components/posts/inline-error'
import { PendingLines } from '@/components/posts/pending-lines'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CostLabel } from '@/components/ui/cost-label'
import { creditWord } from '@/lib/credit-words'

const PENDING = [
  'Reading your Brand Brain…',
  'Planning five posts across your week…',
  'Placing each one at a sensible time…',
  'Still working. If this fails you will not be charged.',
] as const

/** The two Alpha real-publish channels: a sensible seed the user can change. */
const DEFAULT_CHANNELS: ChannelSet = toChannelSet(['x', 'gbp'])

/**
 * ONE constant, read by the `maxLength` attribute AND by the counter beside the
 * field. Written twice they drift, and the counter then reports a ceiling the
 * input does not enforce, which is a figure no query produced.
 */
const GOALS_MAX = 500

type Outcome =
  | { kind: 'planned'; clamped: number }
  | { kind: 'insufficient'; required: number; available: number }
  | { kind: 'failed'; message: string }

/**
 * One click → five Brand-Brain-grounded drafts across the coming week. The
 * credit cost is rendered from `creditCost('loop_cycle')` BEFORE the click,
 * never after, and unusable model times are reported as moved, not hidden.
 */
export function PlanWeekPanel({ initialGoals = '' }: { initialGoals?: string }) {
  /* Seeded from the URL, which is how the command bar on /home hands over what
     the reader typed there. `useState`'s initial value is read once, so a later
     navigation with a different goal remounts rather than fighting the field —
     and typing here always wins over the seed, which is the behaviour anybody
     would expect of a box they are looking at. */
  const [goals, setGoals] = useState(initialGoals)
  const [channels, setChannels] = useState<ChannelSet>(DEFAULT_CHANNELS)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [pending, startTransition] = useTransition()

  const cost = creditCost('loop_cycle')

  function run() {
    if (channels.length === 0) return
    setOutcome(null)

    startTransition(async () => {
      const result = await planMyWeek(goals, channels)

      if (result.ok) {
        toast.success(
          <span>
            Planned <span className="tabular-nums">{result.created}</span> drafts ·{' '}
            <span className="tabular-nums">{result.creditsCharged}</span>{' '}
            {creditWord(result.creditsCharged)} used ·{' '}
            <span className="tabular-nums">{result.balanceAfter}</span> left
          </span>,
        )
        setOutcome({ kind: 'planned', clamped: result.clamped })
        return
      }

      setOutcome(
        result.insufficient
          ? { kind: 'insufficient', required: result.required, available: result.available }
          : { kind: 'failed', message: result.message },
      )
    })
  }

  return (
    <section
      data-guide="planner.plan_week"
      /* ── WHY THIS CARD LOOKS DIFFERENT FROM EVERY OTHER CARD ──────────────
         The founder asked for the one AI feature on the page to read as the
         main event. The available currency for that is NOT more orange:
         `accent-budget.spec.ts` enforces docs/37 §16's "exactly one solid-brand
         fill per view", /planner already spends it on this card's own button,
         and §2.3 records this route at 2.883% saturated pixels — the worst of
         ten. So the weight comes from GROUND and EDGE instead: a `--brand-wash`
         tint (orange at 6%, a ground rather than a fill, explicitly excluded
         from the accent count) under a firmer inset ring.

         A ring, not a border. docs/37 §6: "Never use a border and a ring
         together. Pick one." The previous `border border-line` plus
         `shadow-card` also broke §6's other rule — "a resting card gets no
         shadow" — so both are gone. */
      className="surface-ring-firm overflow-hidden rounded-card bg-surface"
    >
      {/* ── THE BAND. THE ONE LOUD OBJECT ON THIS ROUTE ───────────────────────
          The founder asked for a wide gradient card with the sparkle, the
          heading, one line of promise and a large pill button — "the obvious
          next action". This is it, and the reason it can exist is that the hero
          at the top of the page gave up the weight to pay for it: docs/37 §2.3
          measures /planner as the loudest screen in the product and §16 names
          "a 1032px orange band holding two words" as the cause. Two loud bands
          is not a hierarchy. One is.

          THE GRADIENT IS ORANGE INTO NOTHING, NOT ORANGE INTO PINK. The brief
          asks for "orange to peach to soft pink" and this palette holds exactly
          one chromatic colour for chrome: #ff6600. There is no peach token and
          no pink token; the only pink in the file is `--channel-instagram`,
          whose own comment says it "never leaks into buttons, text or
          surfaces". So the sweep runs `--t100` (orange at 16%) through `--t50`
          (6%) to transparent, left to right — which reads as orange fading to
          peach on the warm ground, and stops there. A third colour would mean
          inventing a token, and a brand gaining a second hue is a decision for
          the founder, not for a page.

          The stops are `var()` in an inline style rather than Tailwind's
          `from-`/`via-`/`to-`: those utilities emit `--tw-gradient-*` custom
          properties, and this file must also carry `--brand-wash` as a base
          layer under the sweep so the band never renders transparent while the
          gradient paints. One declaration is easier to read than four classes
          that have to agree. Raw hex is banned here and none is used. */}
      <div className="relative isolate overflow-hidden bg-brand-wash">
        <WarmBand />
        <div className="relative flex flex-wrap items-center gap-4 p-5 narrow:p-6">
          <span
            aria-hidden
            /* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 surface */
            className="grid size-10 shrink-0 place-items-center rounded-sm bg-tint-50 text-accent dark:bg-s2"
          >
            <Sparkles size={20} strokeWidth={1.8} />
          </span>

          <div className="min-w-0 flex-1">
            {/* `type-h2` is 20px and the page title above is `type-h1` at 24px,
                so this leads its CARD without outranking its PAGE. */}
            <h2 className="type-h2 text-ink">Plan my week</h2>
            {/* The brief's own line, and it is a better sentence than the one it
                replaces: "Five drafts, grounded in your Brand Brain, placed
                across the coming week" describes our mechanism, this describes
                the reader's outcome. It stays exact — five is still five, and
                the count is stated one line down where the goal is set. */}
            <p className="mt-0.5 type-sm text-muted">Turn drafts into a ready-to-publish week.</p>
          </div>

          {
            /* ── THE PRIMARY. THE ONE SOLID BRAND FILL ON THIS SCREEN ───────
               `rounded-pill` and `shadow-brand` are the brief's "rounded pill,
               soft glow". `shadow-brand` already exists — `0 8px 24px` of the
               brand at 24% — and was reserved by comment for the credits hero;
               this is the second place in the product that has earned it.

               NOT a gradient fill. There is one orange in this palette, and
               `--brand-deep` is BLACK in light mode (it is the hover token), so
               "brand to brand-deep" would paint orange into black. A gradient
               button needs a second orange that does not exist yet.

               The hover stays canon and goes BLACK, which is the rule every
               other primary in the product follows. */
            <Button
              size="lg"
              onClick={run}
              loading={pending}
              disabled={channels.length === 0 || pending}
              className="w-full rounded-pill px-5 shadow-brand transition-micro hover:shadow-none narrow:w-auto"
            >
              {/* `Sparkles` lives on the band now, so the button carries the
                  direction instead. docs/37 §18 bans emoji in Sahoda's own
                  interface — the brief's "✨" and "→" are both lucide glyphs
                  here, which inherit the button's colour in both themes. */}
              <CostLabel action="Plan my week" cost={cost} />
              <ArrowRight size={15} aria-hidden />
            </Button>
          }
        </div>
      </div>

      {/* ── EVERYTHING BELOW THE BAND IS THE CONTROLS, AND NONE WAS REMOVED ───
          The brief redraws this panel as a bar with one button, and taken
          literally that deletes the goals field and the channel picker. The
          channel picker decides which platforms get written and therefore what
          the reader is charged for; dropping it would silently plan against a
          default the reader never chose. The same brief says "preserve the
          existing functionality" and "do not invent unnecessary features", so
          the resolution is a shape, not a deletion: the band IS the action and
          the controls sit under it, quieter, on plain surface. Goals are
          optional and channels have a seeded default, so the one-click path the
          brief asks for is real — it just has not thrown anything away. */}
      <div className="p-5 narrow:p-6">
        {/* ── 1 · THE GOAL ──────────────────────────────────────────────────────
          Three groups, each opened by a hairline rule and a `type-h3` heading:
          goal, then channels, then the action. The card was one undifferentiated
          `space-y-3` stack before, which is why it read as a settings form. */}
        <div>
          <p className="type-eyebrow text-ink-mute">Step 1</p>
          {/* A plain <label>, not the `Label` primitive. `Label` hard-codes a 12px
            form-label step, and layering `type-h3` over it would leave two font
            declarations racing on CSS order rather than on intent.

            "(optional)" stays INSIDE the label. Moved out to a sibling it still
            LOOKS the same and the accessible name silently drops it, so a screen
            reader would hear a required-sounding field. */}
          <label
            htmlFor="plan-week-goals"
            className="mt-1 flex flex-wrap items-center gap-x-2 type-h3 text-ink"
          >
            <Target size={15} strokeWidth={2} className="text-accent" aria-hidden />
            Goals for the week <span className="type-sm text-muted">(optional)</span>
          </label>

          <Textarea
            id="plan-week-goals"
            value={goals}
            onChange={(event) => setGoals(event.target.value)}
            disabled={pending}
            rows={5}
            maxLength={GOALS_MAX}
            placeholder="e.g. promote the monsoon menu, bring more people in at the weekend"
            // Padding and height only, plus a focus ring one tint step firmer than
            // the primitive's. The RESTING ring, the radius and the placeholder
            // colour are deliberately NOT overridden: every other field in the
            // product wears them, and a planning canvas that disagrees with the
            // composer is drift rather than polish. The placeholder in particular
            // stays --ink-mute; the reference art has it lighter, and lighter is a
            // legibility regression on the phone this product is built for.
            className="mt-2 px-4 py-3 focus:shadow-[inset_0_0_0_1.5px_var(--brand),0_0_0_3px_var(--t100)]"
          />

          {/* The ceiling was already enforced and invisible. This reports the two
            numbers the field itself produced; neither is estimated. */}
          <p className="mt-1.5 text-right type-meta text-muted">
            <span className="tabular-nums">{goals.length}</span> /{' '}
            <span className="tabular-nums">{GOALS_MAX}</span> characters
          </p>
        </div>

        {/* ── 2 · THE CHANNELS ──────────────────────────────────────────────── */}
        <div className="mt-5 border-t border-line pt-5">
          <p className="type-eyebrow text-ink-mute">Step 2</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="flex items-center gap-2 type-h3 text-ink">
              <Share2 size={15} strokeWidth={2} className="text-accent" aria-hidden />
              Channels
            </h3>
            <p className="type-sm text-muted">Choose the channels you want to plan for.</p>
          </div>
          {/* `hideLabel` because the heading above already says it. The picker's
            own 12px `Label` under a `type-h3` heading would be the same word
            twice at two sizes. */}
          <div className="mt-3">
            <ChannelPicker
              selected={channels}
              onChange={setChannels}
              disabled={pending}
              hideLabel
            />
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-5">
          {pending ? (
            /* The button in the band shows the spinner; these four lines say what
             is happening while it spins, and the last of them is the charge
             promise. A spinner alone on a 20-credit action is not enough. */
            <PendingLines lines={PENDING} />
          ) : (
            /* Says where the output LANDS, which nothing else on this card does.
             Deliberately not "nothing publishes until you approve": auto-publish
             exists on this route and that sentence would be false wherever it is
             switched on. Editing and rescheduling are true in every
             configuration.

             Capped at 46ch. Uncapped it set one 940px line at 1440. */
            <p className="type-meta max-w-[46ch] text-muted">
              Sahoda saves the drafts to your planner, where you can edit or reschedule each one.
            </p>
          )}
        </div>

        {outcome?.kind === 'planned' && outcome.clamped > 0 ? (
          <p className="mt-4 rounded-input bg-s2 px-3 py-2.5 type-sm text-muted">
            <span className="tabular-nums">{outcome.clamped}</span>
            {outcome.clamped === 1 ? ' suggested time was' : ' suggested times were'} unusable and
            moved to sensible future slots.
          </p>
        ) : null}

        {outcome?.kind === 'insufficient' ? (
          <InlineError className="mt-4">
            Planning needs <span className="tabular-nums">{outcome.required}</span>{' '}
            {creditWord(outcome.required)} and you have{' '}
            <span className="tabular-nums">{outcome.available}</span>. Nothing was planned and you
            were not charged.{' '}
            <Link href="/wallet" className="font-semibold underline underline-offset-2">
              Top up your wallet
            </Link>
          </InlineError>
        ) : null}

        {/* The charge statement has exactly ONE owner: the action that produced the
          message. It alone knows whether the hold was released — rendered
          verbatim for that reason. */}
        {outcome?.kind === 'failed' ? (
          <InlineError className="mt-4">{outcome.message}</InlineError>
        ) : null}
      </div>
    </section>
  )
}
