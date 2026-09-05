import { Anchor, AudioLines, Ban, User, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { BrainSectionKey } from '@/lib/brand/fields'

/**
 * ONE GLYPH PER SECTION, AND ONLY ONE PLACE THAT DECIDES IT.
 *
 * A section appears twice: as a row in the Overview's list, and as a card on the
 * Identity or Voice tab that row links to. The glyph is how a person recognises
 * it is the same thing in both places, which only works if the two cannot
 * disagree — so the map lives here rather than being written out twice.
 *
 * ── EVERY USE IS `aria-hidden`, AND THAT IS NOT AN OVERSIGHT ────────────────
 * The section's title sits beside the glyph in both places and says the same
 * thing, so announcing the icon reads each row twice. It earns its place by
 * making a list scannable, never by carrying meaning — which is also what makes
 * an accent-coloured glyph safe here under docs/26 §3.1: nothing on either
 * screen is knowable from the colour alone.
 *
 * ── WHY THE TILE BEHIND IT IS NOT PURPLE ───────────────────────────────────
 * The reference this was built against tints these tiles lavender, described as
 * a "purple AI accent". This repository has no purple: `tokens.css` defines no
 * violet, indigo or lilac at any step, `apps/web/CLAUDE.md` forbids raw hex in a
 * component, and a second hue is a Brand Skin decision rather than a layout one
 * — every workspace can retheme this product, and a hardcoded purple would
 * survive that retheme and clash with it. So the tiles use the brand wash the
 * rest of the app already uses, and the purple is a decision to be taken
 * deliberately rather than smuggled in through an icon.
 */
export const SECTION_ICON: Record<BrainSectionKey, LucideIcon> = {
  voice: AudioLines,
  brand_persona: User,
  customer_persona: Users,
  hook: Anchor,
  taboo: Ban,
  alignment: Anchor,
}

/**
 * The tile the glyph sits in, identical on the list and the card.
 *
 * `dark:bg-s2` is load-bearing rather than decorative: `apps/web/CLAUDE.md`
 * records that in dark `--t50` stays warm-light while `--acc` flips to
 * Orange300, and the pair measures ~1.7:1. Swapping the surface is the
 * documented fix, and the ring gives that swapped surface the edge the same
 * note demands — `--surface-2` separates from `--surface` at 1.04:1 on its own,
 * which is chrome rather than separation.
 */
export const SECTION_ICON_TILE =
  'grid shrink-0 place-items-center rounded-input bg-brand-wash text-accent dark:surface-ring dark:bg-s2'
