import type { Metadata } from 'next'

import { AudienceLayers } from '@/components/design-system/audience-layers'
import { CertaintyLadder } from '@/components/design-system/certainty-ladder'
import { AbsenceRow } from '@/components/design-system/absence-row'
import { PrimitiveRack } from '@/components/design-system/primitive-rack'
import { ScaleTables } from '@/components/design-system/scale-tables'
import { Surfaces } from '@/components/design-system/surfaces'
import { GreyscaleToggle } from '@/components/design-system/greyscale-toggle'

export const metadata: Metadata = {
  title: 'Design system · Sahoda',
  description: 'Every token and primitive, in every state.',
}

/**
 * The living reference for docs/37.
 *
 * ── WHY A ROUTE AND NOT A STATIC PAGE ────────────────────────────────────────
 * A hand-written swatch page drifts from the app the day after it is written.
 * This renders the REAL components against the REAL token file, so a token that
 * changes shows up here without anyone maintaining a copy — and a primitive that
 * has no state for `loading` cannot be documented as having one.
 *
 * ── THE GREYSCALE TOGGLE IS THE POINT ────────────────────────────────────────
 * This palette has one colour and no red. Every state therefore has to be
 * readable with hue removed, and the only honest way to know is to remove it.
 * The toggle applies `filter: grayscale(1)` to the whole page; anything that
 * becomes ambiguous under it is a bug in the system, not in the screen.
 */
export default function DesignSystemPage() {
  return (
    <main id="main" className="mx-auto max-w-[1080px] px-6 py-10">
      <header className="mb-10">
        <p className="type-eyebrow text-muted">Sahoda Labs</p>
        <h1 className="type-display mt-1">Design system</h1>
        <p className="type-body mt-2 max-w-[62ch] text-muted">
          Every token and primitive, in every state. The written rules are in{' '}
          <code className="rounded-sm bg-s2 px-1">docs/37_Design_System_v5.md</code>; this page is
          what they render as. Toggle greyscale to check that nothing depends on hue.
        </p>
        <GreyscaleToggle />
      </header>

      <Section
        title="The Certainty System"
        blurb="How real a thing is. Four rungs, each with a structural signature — fill, edge, texture — so the meaning survives greyscale, recolouring and colour blindness."
      >
        <CertaintyLadder />
      </Section>

      <Section
        title="The absence vocabulary"
        blurb="Three different claims that used to render as one em dash. A solid rule means the reading has not arrived; a broken rule means we asked and got nothing. A quantity that does not exist gets no slot at all."
      >
        <AbsenceRow />
      </Section>

      <Section
        title="Measured, and worked out"
        blurb="The two layers of /brain/audience. Above the line, every figure came from a platform and is drawn with a SOLID fill. Below it, every figure is Sahoda's arithmetic on those figures, drawn .is-proposed — dashed, unfilled — and each panel states the evidence it stands on and refuses when there is not enough. The numbers on this section are demonstration data, taken from Zernio's own published example."
      >
        <AudienceLayers />
      </Section>

      <Section
        title="Primitives"
        blurb="Every state each primitive ships with. A control with no disabled state here does not have one in the app."
      >
        <PrimitiveRack />
      </Section>

      <Section
        title="Surfaces, radius and glass"
        blurb="The three things v5 changed most. Surfaces separate by FILL rather than by line; the radius ladder is by surface size; glass is chrome-only, and the rule is shown rather than only stated."
      >
        <Surfaces />
      </Section>

      <Section
        title="Scales"
        blurb="Type, space, radius and elevation. Each step exists for a reason; the reason is the third column."
      >
        <ScaleTables />
      </Section>
    </main>
  )
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-12 border-t border-line-soft pt-6">
      <h2 className="type-h2">{title}</h2>
      <p className="type-sm mt-1 mb-5 max-w-[70ch] text-muted">{blurb}</p>
      {children}
    </section>
  )
}
