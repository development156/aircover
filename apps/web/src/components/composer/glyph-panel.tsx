'use client'

import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'

export interface GlyphPanelProps {
  /**
   * What this writes into, as a person would say it: "Instagram copy", "your
   * post". Four of these can be open on one screen, so every accessible name
   * has to carry which box it belongs to.
   */
  target: string
  /** Insert at the caret. The caller owns the splice and the caret restore. */
  onInsert: (glyph: string) => void
  /** So the button that opens this can point at it with `aria-controls`. */
  id: string
}

/** The glyph table, fetched when this mounts rather than shipped with the route. */
type GlyphModule = typeof import('@/lib/posts/glyphs')

/**
 * THE EMOJI AND SYMBOL GRID.
 *
 * ── THE HUNDRED AND EIGHT GLYPHS ARE NOT IN THIS ROUTE'S BUNDLE ──────────────
 * MEASURED, and it is why the `import()` below is not decoration. The composer
 * is the heaviest route in the product and `scripts/perf/js-budget.mjs` allows
 * 8kB of growth before `pnpm build` fails. Built with the table imported
 * normally, `/(app)/posts/[id]` came out at **946.9 kB against a 937.2 kB
 * budget — plus 9.7 kB, which fails**. Rebuilt with the table stubbed down to
 * two entries, every one of the 81 routes was inside its budget. So the table
 * is essentially the whole of that growth.
 *
 * This component only ever mounts once a writer opens the picker, so the import
 * runs then and from a chunk of its own. Stated honestly: `js-budget.mjs:17-19`
 * records that bytes fetched AFTER load are outside what it measures, so the
 * split MOVES those bytes rather than deleting them. A writer who opens the
 * picker still downloads them, once. That is a fair trade for a small table of
 * static data behind a control most sessions never touch, and it is NOT a way
 * to smuggle in a 150kB library — which is why one is here and the other is
 * still refused.
 */
export function GlyphPanel({ target, onInsert, id }: GlyphPanelProps) {
  const [query, setQuery] = useState('')
  const [glyphs, setGlyphs] = useState<GlyphModule | null>(null)

  useEffect(() => {
    let live = true
    void import('@/lib/posts/glyphs').then((module) => {
      // A writer who opens and closes the picker faster than the chunk arrives
      // would otherwise set state on an unmounted component.
      if (live) setGlyphs(module)
    })
    return () => {
      live = false
    }
  }, [])

  const groups = glyphs === null ? null : glyphs.searchGlyphs(query)

  return (
    <div id={id} className="surface-ring space-y-2 rounded-sm bg-s2 p-3">
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
        /* The claim is precise: THIS SET does not have it, which is a different
           sentence from "there is no such emoji" — the writer's own device still
           has every one of them, and a remedy this panel cannot fulfil would be
           worse than none. */
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
  )
}
