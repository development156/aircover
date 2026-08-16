import Link from 'next/link'

import { brainRing, ringAriaLabel, ringHoverLine } from '@/lib/brand/brain-ring'
import type { BrainRead } from '@/lib/brand/read-brain'

// The Brand Brain ring, beside the credit chip.
//
// It counts CONFIRMED fields, never filled ones. A resolve fills all fifteen at
// once, so a fullness meter reads 100% the moment the model answers — a claim the
// product exists to refuse. Derived fields (alignment.*) are outside the
// denominator: they are conclusions, not questions, and counting them would put
// the ring permanently out of reach.
//
// It takes the same `BrainRead` union /brain does, so the two cannot tell one
// user two different stories. Four answers, four claims:
//
//   ok            the count, and an arc. A real 0/15 renders as 0 — that is
//                 knowledge, and it is what a just-resolved brain honestly is.
//   no-brain      no arc and no count. There is no brain yet, so 0/15 would
//                 imply one exists and is empty. Links to onboarding, which is
//                 the only thing that helps.
//   no-workspace  nothing at all. No workspace means no brain to have; a nudge
//                 here would point at a page that cannot work yet.
//   unreadable    an em dash. NOT 0/15 — "we could not read it" and "you have
//                 confirmed nothing" are different claims and only one is true.

const R = 12
const CIRCUMFERENCE = 2 * Math.PI * R

function Dial({ percent }: { percent: number }) {
  return (
    <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden className="-rotate-90">
      <circle cx={15} cy={15} r={R} fill="none" strokeWidth={3} className="stroke-line" />
      <circle
        cx={15}
        cy={15}
        r={R}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
        className="stroke-primary transition-panel"
      />
    </svg>
  )
}

/**
 * One line on hover, and the same line to a screen reader via the link's label.
 * Rendered markup rather than a `title` attribute: `title` is unreliable on
 * touch, unstyleable, and slow enough to appear that it reads as broken.
 */
function HoverLine({ children }: { children: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-full right-0 z-10 mt-1.5 hidden w-max max-w-[min(19rem,calc(100vw-2rem))] rounded-input border border-line bg-bg px-2.5 py-1.5 text-[12.5px] leading-[17px] text-ink shadow-card group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  )
}

export function BrainRing({ brain }: { brain: BrainRead }) {
  if (brain.status === 'no-workspace') return null

  // `flex-none whitespace-nowrap` is load-bearing, not tidying. This pill is a
  // flex item in the topbar row, and a flex item shrinks below its content by
  // default — so between 768px and 1279px "No brain yet" wrapped: two lines at
  // 900–1200, THREE at 768, where the pill grew to 70px inside a 56px header and
  // burst out of it. The row's other items already carry this discipline
  // (`shrink-0` on the mark, `truncate` on the switcher and the palette); these
  // two chips were the only ones without it. The palette, sized
  // `w-[min(420px,100%)]`, is the item meant to absorb the shrink.
  const shell =
    'group relative flex flex-none items-center gap-2 rounded-pill border border-line bg-bg px-2 py-1 font-semibold whitespace-nowrap transition-micro hover:bg-tint-50 active:scale-[.97] dark:hover:bg-s2'

  if (brain.status === 'no-brain') {
    return (
      <Link
        href="/onboarding"
        data-guide="topbar.brain-ring"
        aria-label="No Brand Brain yet. Set one up"
        className={shell}
      >
        <Dial percent={0} />
        <span className="text-[13px] text-muted max-narrow:hidden">No brain yet</span>
        <HoverLine>Sahoda has nothing to write from yet — set up your Brand Brain.</HoverLine>
      </Link>
    )
  }

  if (brain.status === 'unreadable') {
    return (
      <Link
        href="/brain"
        data-guide="topbar.brain-ring"
        aria-label="Brand Brain unavailable. Open Brand Brain"
        className={shell}
      >
        <Dial percent={0} />
        <span className="num text-[13px] text-muted">&mdash;</span>
        <HoverLine>
          Could not read your Brand Brain just now — reload to try again. Nothing has changed.
        </HoverLine>
      </Link>
    )
  }

  const ring = brainRing(brain.provenance)

  return (
    <Link
      href="/brain"
      data-guide="topbar.brain-ring"
      aria-label={ringAriaLabel(ring)}
      className={shell}
    >
      <Dial percent={ring.percent} />
      <span className="num text-[13px] text-ink">
        {ring.confirmed}/{ring.total}
      </span>
      <span className="text-[13px] font-medium text-muted max-narrow:hidden">confirmed</span>
      <HoverLine>{ringHoverLine(ring)}</HoverLine>
    </Link>
  )
}
