'use client'

import { TOKEN_FIELDS } from '@sahoda/shared'
import type { TokenField } from '@sahoda/shared'

import { MenuItemRow } from '@/components/assets/menu-item-row'
import { MenuTrigger } from '@/components/assets/menu-trigger'
import { useContextMenuTrigger } from '@/components/assets/use-context-menu-trigger'

/**
 * F2 — THE BRIDGE TO THE TYPED SYNTAX.
 *
 * `search-tokens.ts`'s own words: a person who never learns `type:image` gets
 * the same power through a click, and a person who watches the box while
 * clicking learns the syntax for free. So every chip inserts the EXACT token
 * `parseSearch` reads back out, never a paraphrase — built from `TOKEN_FIELDS`
 * so the chips and the parser can never name a field the other does not know.
 *
 * ── WHY ONLY FOUR OF THE SEVEN FIELDS SHOW A VALUES MENU ─────────────────────
 * `type`, `used`, `added` and `shape` each have a small, real, enumerable set
 * of values — the founder's own list. `size` needs a number, and `desc` and
 * `in` need free text a chip cannot offer without becoming a second search
 * box. A field with no curated menu still gets a chip (`FIELD_VALUES`'s
 * fallback below): it offers the field's own worked example as its one
 * value, which is exactly what the search hint row already does, so a chip
 * for a field this component does not specifically know about still inserts
 * something real rather than nothing.
 */

interface ChipValue {
  value: string
  label: string
}

const FIELD_VALUES: Partial<Record<string, ChipValue[]>> = {
  type: [
    { value: 'image', label: 'Image' },
    { value: 'video', label: 'Video' },
    { value: 'document', label: 'Document' },
  ],
  used: [
    { value: 'yes', label: 'Used on a post' },
    { value: 'no', label: 'Not used' },
    { value: 'locked', label: 'Locked to a post' },
  ],
  added: [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
  ],
  shape: [
    { value: 'landscape', label: 'Landscape' },
    { value: 'portrait', label: 'Portrait' },
    { value: 'square', label: 'Square' },
  ],
}

const DEFAULT_CHIP_KEYS = new Set(['type', 'used', 'added', 'shape'])

/** The word the row shows. `TokenField.label` is a full sentence for the
 *  search box's own hint row ("the kind of file") — too long for a chip,
 *  which still carries the full sentence as its `title`. A field with no
 *  short word here falls back to its own `label`, so an unknown field still
 *  reads as SOMETHING rather than nothing. */
const CHIP_WORD: Partial<Record<string, string>> = {
  type: 'Type',
  used: 'Used',
  added: 'Added',
  shape: 'Shape',
}
const chipWord = (field: TokenField): string => CHIP_WORD[field.key] ?? field.label

/** The values a field's chip offers — curated where Sahoda knows the real
 *  enum, and the field's own worked example otherwise, so a field this
 *  component was not specifically taught about still opens a working chip. */
function valuesFor(field: TokenField): ChipValue[] {
  return (
    FIELD_VALUES[field.key] ?? [{ value: field.example.split(':')[1] ?? '', label: field.example }]
  )
}

function isFieldToken(word: string, key: string): boolean {
  const colon = word.indexOf(':')
  return colon > 0 && word.slice(0, colon).toLowerCase() === key
}

/** The value currently set for this field in the query, or `null`. */
function activeValue(query: string, key: string): string | null {
  for (const word of query.trim().split(/\s+/)) {
    if (isFieldToken(word, key)) return word.slice(word.indexOf(':') + 1)
  }
  return null
}

/** Replaces (or removes, when `token` is `null`) this field's own token,
 *  leaving every other word exactly as typed. */
function withFieldToken(query: string, key: string, token: string | null): string {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '' && !isFieldToken(word, key))
  if (token !== null) words.push(token)
  return words.join(' ')
}

export function FilterChips({
  fields = TOKEN_FIELDS.filter((field) => DEFAULT_CHIP_KEYS.has(field.key)),
  query,
  onQueryChange,
}: {
  /** Defaults to the four fields with a real menu of values. A caller may
   *  pass its own list — every entry becomes a chip regardless, which is
   *  what proves this is genuinely DERIVED and not four names written here
   *  by hand. */
  fields?: readonly TokenField[]
  query: string
  onQueryChange: (query: string) => void
}) {
  if (fields.length === 0) return null

  return (
    <div role="group" aria-label="Filter" className="flex flex-wrap items-center gap-1.5">
      {fields.map((field) => (
        <FilterChip key={field.key} field={field} query={query} onQueryChange={onQueryChange} />
      ))}
    </div>
  )
}

function FilterChip({
  field,
  query,
  onQueryChange,
}: {
  field: TokenField
  query: string
  onQueryChange: (query: string) => void
}) {
  const trigger = useContextMenuTrigger()
  const active = activeValue(query, field.key)
  const values = valuesFor(field)
  const activeLabel = values.find((v) => v.value === active)?.label

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    if (active !== null) {
      // "Clicking it again removes that token from the query" — the chip
      // ITSELF is the toggle once a value is set; it does not reopen the
      // menu to ask which value to remove.
      onQueryChange(withFieldToken(query, field.key, null))
      return
    }
    trigger.openAtElement(event.currentTarget)
  }

  const word = chipWord(field)

  return (
    <MenuTrigger
      trigger={trigger}
      ariaLabel={`${field.label} filter`}
      button={() => (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={active !== null}
          title={field.label}
          className={
            active !== null
              ? 'rounded-pill bg-primary px-2.5 py-1 type-chip font-semibold text-primary-foreground transition-micro'
              : 'rounded-pill bg-s2 px-2.5 py-1 type-chip text-muted transition-micro hover:bg-s1 hover:text-ink'
          }
        >
          {active !== null ? `${word}: ${activeLabel ?? active}` : word}
        </button>
      )}
    >
      <div className="flex flex-col gap-0.5">
        {values.map((value, index) => (
          <MenuItemRow
            key={value.value}
            autoFocus={index === 0}
            onClick={() => {
              onQueryChange(withFieldToken(query, field.key, `${field.key}:${value.value}`))
              trigger.close()
            }}
          >
            {value.label}
          </MenuItemRow>
        ))}
      </div>
    </MenuTrigger>
  )
}
