'use client'

import { Minus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { BrainField } from '@/lib/brand/fields'
import type { BrainLeaf } from '@/lib/brand/leaf'
import { MAX_OPEN_LIST_ENTRIES } from '@/lib/brand/limits'

export interface FieldEditorProps {
  field: BrainField
  draft: BrainLeaf
  onDraftChange: (draft: BrainLeaf) => void
  disabled: boolean
}

/**
 * The inputs a field shows while it is being edited. Split from `FieldRow` so
 * the row owns only the save lifecycle and this owns only the shape of the
 * control — the two change for different reasons.
 *
 * The caps mirror `public.resolve_brand_memory`: the three fixed lists cannot
 * grow or shrink, and the open ones stop at 40. Enforcing it here means a save
 * can never fail on INVALID_PAYLOAD after the user has typed.
 */
export function FieldEditor({ field, draft, onDraftChange, disabled }: FieldEditorProps) {
  if (field.kind === 'list') {
    const items = Array.isArray(draft) ? draft : []
    const atCap = !field.fixedLength && items.length >= MAX_OPEN_LIST_ENTRIES

    return (
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          // Ordered, locally-keyed edit list with no stable ids upstream.
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`${field.label} ${index + 1}`}
              value={item}
              disabled={disabled}
              onChange={(event) =>
                onDraftChange(items.map((entry, i) => (i === index ? event.target.value : entry)))
              }
            />
            {field.fixedLength ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={`Remove ${field.label.toLowerCase()} ${index + 1}`}
                onClick={() => onDraftChange(items.filter((_, i) => i !== index))}
                className="shrink-0 px-2"
              >
                <Minus size={14} aria-hidden />
              </Button>
            )}
          </div>
        ))}

        {field.fixedLength ? null : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || atCap}
              onClick={() => onDraftChange([...items, ''])}
              className="self-start px-2"
            >
              <Plus size={14} aria-hidden />
              Add {field.label.toLowerCase()}
            </Button>
            {atCap ? (
              <span className="text-[12.5px] text-muted">
                That&apos;s the maximum of{' '}
                <span className="tabular-nums">{MAX_OPEN_LIST_ENTRIES}</span>. Remove one to add
                another.
              </span>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  const value = typeof draft === 'string' ? draft : ''

  return field.kind === 'longtext' ? (
    <Textarea
      aria-label={field.label}
      value={value}
      disabled={disabled}
      onChange={(event) => onDraftChange(event.target.value)}
      className="min-h-[56px]"
    />
  ) : (
    <Input
      aria-label={field.label}
      value={value}
      disabled={disabled}
      onChange={(event) => onDraftChange(event.target.value)}
    />
  )
}
