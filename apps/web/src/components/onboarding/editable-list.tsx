'use client'

import { Minus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface EditableListProps {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  /** Exactly-length-3 arrays in the contract (e.g. signature_phrases) can't grow/shrink. */
  fixedLength?: boolean
  /**
   * Hard cap for the two OPEN-ended lists (banned_phrases, red_lines). resolve_brand_memory
   * rejects >40 entries with INVALID_PAYLOAD, and mesh prepends the brain to every model call —
   * an oversized brain bills tokens forever. Cap here so Finish can never fail on it.
   */
  maxItems?: number
  disabled?: boolean
}

/** An inline-editable string[] leaf (e.g. taboo red lines, sample hooks). */
export function EditableList({
  label,
  items,
  onChange,
  fixedLength,
  maxItems,
  disabled,
}: EditableListProps) {
  const atCap = maxItems !== undefined && items.length >= maxItems
  function updateItem(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)))
  }
  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }
  function addItem() {
    if (atCap) return
    onChange([...items, ''])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          // Ephemeral, locally-ordered edit list (no stable ids upstream) — index key is fine here.
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`${label} ${index + 1}`}
              value={item}
              disabled={disabled}
              onChange={(event) => updateItem(index, event.target.value)}
            />
            {fixedLength ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => removeItem(index)}
                aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                className="shrink-0 px-2"
              >
                <Minus size={14} aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {items.length === 0 ? <p className="text-[13px] text-muted">None yet.</p> : null}
      </div>
      {fixedLength ? null : (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || atCap}
            onClick={addItem}
            className="self-start px-2"
          >
            <Plus size={14} aria-hidden />
            Add {label.toLowerCase()}
          </Button>
          {atCap ? (
            <span className="text-[12.5px] text-muted">
              That's the maximum of <span className="tabular-nums">{maxItems}</span> — remove one to
              add another.
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}
