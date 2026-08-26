'use client'

import { useState } from 'react'
import { Smile } from 'lucide-react'

import { Input } from '@/components/ui/input'

export interface GlyphPickerProps {
  /**
   * What this picker writes into, as a person would say it: "Instagram copy",
   * "your post". Four of these can sit on one screen, so every accessible name
   * has to carry which box it belongs to.
   */
  target: string
  /** Insert at the caret. The caller owns the splice and the caret restore. */
  onInsert: (glyph: string) => void
}

/** The glyph table, fetched on first open rather than shipped with the route. */
type GlyphModule = typeof import('@/lib/posts/glyphs')

/**
 * EMOJI AND SYMBOLS, INSERTED AT THE CARET.
 *
 * ── WHY A DISCLOSURE AND NOT A POPOVER ───────────────────────────────────────
 * A popover needs positioning maths, a portal, an outside-click listener, a
 * focus trap and an escape handler, and every one of those is a place to get it
 * wrong — `apps/web/CLAUDE.md` records a `position: fixed` overlay that laid out
 * at 1834x137 instead of the viewport because of a `backdrop-filter` two levels
 * up, and it was reported as three separate bugs before anyone found the cause.
 * A `<details>` has none of that: the browser ships the open and close, the
 * keyboard support and the accessible state, and it cannot be trapped by an
 * ancestor's compositing.
 *
 * It costs vertical space while open, which is the honest trade. It is also the
 * disclosure this screen already uses for per-channel settings, so it is one
 * idiom rather than two.
 *
 * ── THE HUNDRED AND EIGHT GLYPHS ARE NOT IN THIS ROUTE'S BUNDLE ──────────────
 * MEASURED, and it is why the `import()` below is not decoration. The composer
 * is the heaviest route in the product and `scripts/perf/js-budget.mjs` allows
 * 8kB of growth before `pnpm build` fails. Built with the table imported
 * normally, `/(app)/posts/[id]` came out at **946.9 kB against a 937.2 kB
 * budget — plus 9.7 kB, which fails**. Rebuilt with the table stubbed down to
 * two entries, every one of the 81 routes was inside its budget. So the table is
 * essentially the whole of that growth, and the fix is to stop shipping it to
 * everyone who opens a post.
 *
 * It is fetched when the summary is first clicked, from a chunk of its own. A
 * writer who never opens the picker never downloads it, and one who does pays
 * for it once. Nothing else about the control changes.
 *
 * ── IT STAYS OPEN AFTER AN INSERT, DELIBERATELY ──────────────────────────────
 * Writers add two or three at a time. A picker that closed on every click would
 * make the second one cost as much as the first.
 */
export function GlyphPicker({ target, onInsert }: GlyphPickerProps) {
  const [query, setQuery] = useState('')
  const [glyphs, setGlyphs] = useState<GlyphModule | null>(null)

  /**
   * Hung off the summary's click rather than the element's `toggle` event.
   * `toggle` fires on close as well as open, and it fires AFTER the browser has
   * already painted the open panel — so the fetch would start one frame late, on
   * the frame the writer is looking at an empty box.
   */
  function load() {
    if (glyphs !== null) return
    void import('@/lib/posts/glyphs').then(setGlyphs)
  }

  const groups = glyphs === null ? null : glyphs.searchGlyphs(query)

  return (
    <details data-glyph-picker className="surface-ring rounded-sm bg-s2">
      <summary
        onClick={load}
        className="type-meta flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted select-none"
      >
        <Smile size={14} aria-hidden />
        Add an emoji or symbol
      </summary>

      <div className="space-y-2 border-t border-line px-3 pt-2 pb-3">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, such as star or rupee"
          aria-label={`Search emoji and symbols for ${target}`}
        />

        {groups === null ? (
          <p className="type-meta text-muted">Fetching the emoji and symbols.</p>
        ) : groups.length === 0 ? (
          /* The claim is precise: the SET does not have it, which is a different
             sentence from "there is no such emoji" — the operating system's own
             picker still has every one of them. */
          <p className="type-meta text-muted">
            No emoji or symbol here matches that. Your device&rsquo;s own picker has the full set.
          </p>
        ) : (
          <div className="max-h-[220px] space-y-2 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.id} className="space-y-1">
                <p className="type-eyebrow text-muted">{group.label}</p>
                <div className="flex flex-wrap gap-1">
                  {group.glyphs.map(([glyph, name]) => (
                    <button
                      key={glyph}
                      type="button"
                      aria-label={`Insert ${name} into ${target}`}
                      title={name}
                      onClick={() => onInsert(glyph)}
                      className="type-sm flex h-8 w-8 items-center justify-center rounded-sm transition-micro hover:bg-surface-3 max-narrow:h-11 max-narrow:w-11"
                    >
                      <span aria-hidden>{glyph}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}
