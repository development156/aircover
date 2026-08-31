import Link from 'next/link'
import { Sparkles } from 'lucide-react'

/**
 * WHERE PICTURES COME FROM, SAID ON THE SCREEN THAT USED TO MAKE THEM.
 *
 * ── WHY THE GENERATOR LEFT THIS SCREEN ──────────────────────────────────────
 * Media used to enter the product in two places: this pane's upload, and a
 * prompt box beside it that spent credits. Two origins meant provenance, cost,
 * brand conditioning and the per-channel format rules each had to be solved
 * twice, and one of the two always lagged.
 *
 * The Studio is the single origin now. It knows the brand, it records why every
 * picture looks the way it does, it shows the cost before spending, and it puts
 * the result in the same library this pane already reads. A prompt box on a
 * writing screen could do none of that.
 *
 * ── AND THIS IS A LINK, NOT A DISABLED BUTTON ───────────────────────────────
 * Nothing here is coming soon and nothing is switched off. The capability moved
 * and this says where to, which is the difference between a door and a wall.
 */
export function StudioOrigin() {
  return (
    <div
      className="surface-ring flex flex-col gap-1 rounded-card bg-surface p-3"
      data-studio-origin
    >
      <span className="flex items-center gap-1.5 type-body font-[550]">
        <Sparkles className="size-[15px]" aria-hidden />
        Need a picture?
      </span>
      <p className="type-sm max-w-[54ch] text-muted">
        The Studio draws one from a sentence, using your colours and the way your business sounds.
        It lands in your library, and you attach it here like any other photo.
      </p>
      <Link
        href="/studio"
        className="type-sm font-[600] underline underline-offset-2 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Open the Studio
      </Link>
    </div>
  )
}
