'use client'

import { ChevronDown, Images, Ratio, Settings2, Sparkles, Stamp, Wand2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { GenerationMode } from '@sahoda/shared'
import { MAX_TRIES_PER_PRESS, readyModes } from '@/lib/studio/modes'
import type { StudioFormat } from '@/lib/studio/formats'

/**
 * ONE ROW THAT SAYS WHAT THE NEXT PRESS WILL DO, AND CHANGES IT.
 *
 * ── WHAT THIS REPLACED, AND WHY ─────────────────────────────────────────────
 * The same four choices used to exist TWICE: a chip row that only summarised
 * them, and a tray of labelled fieldsets below that actually changed them. Two
 * elements for one fact is two places for it to drift, and a chip that opens a
 * panel is a control that does nothing on its first press. This row is both: it
 * reads as the summary and it IS the control.
 *
 * The tray still exists for the three choices that cannot be a pill — the
 * model, the pictures to match, and where a logo sits — behind "More".
 *
 * ── WHY THE SELECTED PILL IS NOT ORANGE ─────────────────────────────────────
 * `tokens.css` measures `--acc` at 2.75:1 on the light wash and 2.94:1 on white
 * — under WCAG's 4.5:1 for text and its 3:1 for a boundary — and its own ruling
 * forbids colour as the only signal. A selected pill here is a brighter surface
 * with a ring and a weight step, which reads at any contrast and in either
 * theme, and `aria-pressed` carries it to a screen reader. The one solid brand
 * fill on this screen is the button that spends money.
 */
function Pill({
  icon: Icon,
  on,
  onClick,
  children,
  label,
}: {
  icon?: LucideIcon
  on?: boolean
  onClick: () => void
  children: React.ReactNode
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on === undefined ? undefined : on}
      aria-label={label}
      className={`flex shrink-0 items-center gap-2 rounded-pill px-3 py-1.5 type-sm transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        on
          ? 'surface-ring bg-surface font-[600] text-ink'
          : 'font-[500] text-muted hover:bg-surface hover:text-ink'
      }`}
    >
      {Icon ? (
        <Icon className={`size-[14px] ${on ? 'text-accent' : ''}`} strokeWidth={1.75} aria-hidden />
      ) : null}
      {children}
    </button>
  )
}

/** The track the pills sit in. One per group, so groups read as groups. */
function Track({
  children,
  ...rest
}: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="surface-ring flex items-center gap-1 rounded-pill bg-s2 p-1" {...rest}>
      {children}
    </div>
  )
}

/** One glyph per mode, so a look is recognisable before it is read. */
const MODE_ICON: Partial<Record<GenerationMode, LucideIcon>> = {
  match: Images,
  explore: Sparkles,
  on_brand: Wand2,
  edit: Wand2,
  series: Images,
}

export function GenerationControls({
  mode,
  onMode,
  modelId,
  modelLabel,
  formats,
  formatId,
  onFormat,
  count,
  onCount,
  stampEnabled,
  onStamp,
  moreOpen,
  onMore,
}: {
  mode: GenerationMode
  onMode: (next: GenerationMode) => void
  modelId: string
  /** Read from `models.ts`, never retyped: the row may not name a model the picker dropped. */
  modelLabel: string
  formats: StudioFormat[]
  formatId: string
  onFormat: (id: string) => void
  count: number
  onCount: (n: number) => void
  stampEnabled: boolean
  onStamp: (on: boolean) => void
  moreOpen: boolean
  onMore: () => void
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 max-narrow:flex-nowrap max-narrow:overflow-x-auto"
      data-guide="studio-controls"
    >
      {/* The looks. The group's name is what `modes.ts` calls the question, and
          the modes offered are the ones the CHOSEN MODEL can actually draw. */}
      <Track role="group" aria-label="How should Sahoda approach it?">
        {readyModes(modelId).map((option) => {
          const Icon = MODE_ICON[option.mode]
          return (
            <Pill
              key={option.mode}
              icon={Icon}
              on={mode === option.mode}
              onClick={() => onMode(option.mode)}
            >
              {option.label}
            </Pill>
          )
        })}
      </Track>

      {/* ── THE SIZE ────────────────────────────────────────────────────────
          A real `<select>`, not a pill that cycles: there are six of them and a
          cycling control makes somebody press five times to see the fifth.

          The pill shows the NAME only. What that name means — the pixels, and
          how many of this workspace's channels it covers — is a sentence under
          the row, because it is a sentence and not a label. */}
      <label className="surface-ring flex shrink-0 items-center gap-2 rounded-pill bg-s2 py-1.5 pl-3 pr-2 type-sm text-muted transition-micro focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:bg-surface-3">
        <Ratio className="size-[14px]" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">What size?</span>
        <select
          value={formatId}
          onChange={(event) => onFormat(event.target.value)}
          className="cursor-pointer appearance-none bg-transparent pr-1 font-[600] text-ink outline-none"
          data-guide="studio-format"
        >
          {formats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </select>
        <ChevronDown className="size-[14px]" strokeWidth={1.75} aria-hidden />
      </label>

      {/* ── HOW MANY ────────────────────────────────────────────────────────
          Four pills rather than a minus/plus stepper. The ceiling is four, so
          every choice fits on the row and a person sees the bound instead of
          discovering it by pressing plus into a wall. */}
      <Track role="group" aria-label="How many options?" data-guide="studio-count">
        {Array.from({ length: MAX_TRIES_PER_PRESS }, (_unused, i) => i + 1).map((n) => (
          <Pill key={n} on={count === n} onClick={() => onCount(n)}>
            <span className="num">{n}</span>
          </Pill>
        ))}
      </Track>

      {/* The logo. Two states named as what they do, never a bare switch. */}
      <Track role="group" aria-label="Stamp your logo on this picture" data-guide="studio-logo">
        <Pill icon={Stamp} on={stampEnabled} onClick={() => onStamp(true)}>
          Logo on
        </Pill>
        <Pill on={!stampEnabled} onClick={() => onStamp(false)}>
          Off
        </Pill>
      </Track>

      <div className="grow max-narrow:hidden" />

      <button
        type="button"
        onClick={onMore}
        aria-expanded={moreOpen}
        aria-controls="studio-settings"
        /* The visible text names the chosen model, which is the fact worth a
           glance; the accessible name says what the press DOES first, because
           "The everyday one · More" announces a model rather than a disclosure.
           It still CARRIES the model, because which one draws decides what the
           press costs, and a reader who cannot see the row would otherwise have
           to open the tray to learn it. */
        aria-label={`${moreOpen ? 'Fewer' : 'More'} settings, drawing with ${modelLabel}`}
        className="flex shrink-0 items-center gap-2 rounded-pill px-3 py-1.5 type-sm text-muted transition-micro hover:bg-s2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Settings2 className="size-[14px]" strokeWidth={1.75} aria-hidden />
        <span className="font-[500]">{modelLabel}</span>
        <span className="text-muted">{moreOpen ? '· Less' : '· More'}</span>
      </button>
    </div>
  )
}
