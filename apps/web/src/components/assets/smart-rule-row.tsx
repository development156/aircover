'use client'

import { X } from 'lucide-react'
import {
  AssetKindSchema,
  OrientationSchema,
  SmartFieldSchema,
  UsageStateSchema,
  type SmartField,
  type SmartRule,
} from '@sahoda/shared'

import { Select } from '@/components/ui/select'
import { labelForKind } from '@/lib/assets/kind'

/** One rule, editable. Every branch of `SmartRuleSchema` gets its own controls. */
const FIELD_LABEL: Record<SmartField, string> = {
  kind: 'File type',
  usage: 'Usage',
  name: 'Name or description contains',
  description: 'Description',
  orientation: 'Orientation',
  bytes: 'File size',
  added: 'Added',
}

const USAGE_LABEL: Record<'used' | 'unused' | 'locked', string> = {
  used: 'used in a post',
  unused: 'not used yet',
  locked: 'locked by a post that has gone out',
}

const ORIENTATION_LABEL: Record<'landscape' | 'portrait' | 'square', string> = {
  landscape: 'landscape',
  portrait: 'portrait',
  square: 'square',
}

/** A fresh, valid rule for a newly picked field. */
export function defaultRuleFor(field: SmartField): SmartRule {
  switch (field) {
    case 'kind':
      return { field: 'kind', is: 'image' }
    case 'usage':
      return { field: 'usage', is: 'unused' }
    case 'name':
      return { field: 'name', contains: '' }
    case 'description':
      return { field: 'description', is: 'missing' }
    case 'orientation':
      return { field: 'orientation', is: 'landscape' }
    case 'bytes':
      return { field: 'bytes', op: 'over', value: 2_000_000 }
    case 'added':
      return { field: 'added', withinDays: 30 }
  }
}

export function SmartRuleRow({
  rule,
  onChange,
  onRemove,
  canRemove,
}: {
  rule: SmartRule
  onChange: (next: SmartRule) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div className="surface-ring flex flex-wrap items-center gap-2 rounded-sm bg-surface p-2">
      <Select
        aria-label="Field"
        wrapperClassName="w-auto max-w-none"
        value={rule.field}
        onChange={(event) => onChange(defaultRuleFor(SmartFieldSchema.parse(event.target.value)))}
      >
        {SmartFieldSchema.options.map((field) => (
          <option key={field} value={field}>
            {FIELD_LABEL[field]}
          </option>
        ))}
      </Select>

      {rule.field === 'kind' ? (
        <Select
          aria-label="File type"
          wrapperClassName="w-auto max-w-none"
          value={rule.is}
          onChange={(event) =>
            onChange({ field: 'kind', is: AssetKindSchema.parse(event.target.value) })
          }
        >
          {AssetKindSchema.options.map((kind) => (
            <option key={kind} value={kind}>
              {labelForKind(kind)}
            </option>
          ))}
        </Select>
      ) : null}

      {rule.field === 'usage' ? (
        <Select
          aria-label="Usage"
          wrapperClassName="w-auto max-w-none"
          value={rule.is}
          onChange={(event) =>
            onChange({ field: 'usage', is: UsageStateSchema.parse(event.target.value) })
          }
        >
          {UsageStateSchema.options.map((state) => (
            <option key={state} value={state}>
              {USAGE_LABEL[state]}
            </option>
          ))}
        </Select>
      ) : null}

      {rule.field === 'name' ? (
        <input
          aria-label="Contains"
          value={rule.contains}
          maxLength={120}
          onChange={(event) => onChange({ field: 'name', contains: event.target.value })}
          placeholder="e.g. shopfront"
          className="h-8 min-w-[140px] flex-1 rounded-sm border border-line bg-bg px-2 type-sm text-ink"
        />
      ) : null}

      {rule.field === 'description' ? (
        <Select
          aria-label="Description"
          wrapperClassName="w-auto max-w-none"
          value={rule.is}
          onChange={(event) =>
            onChange({
              field: 'description',
              is: event.target.value === 'present' ? 'present' : 'missing',
            })
          }
        >
          <option value="missing">is missing</option>
          <option value="present">is written</option>
        </Select>
      ) : null}

      {rule.field === 'orientation' ? (
        <Select
          aria-label="Orientation"
          wrapperClassName="w-auto max-w-none"
          value={rule.is}
          onChange={(event) =>
            onChange({ field: 'orientation', is: OrientationSchema.parse(event.target.value) })
          }
        >
          {OrientationSchema.options.map((shape) => (
            <option key={shape} value={shape}>
              {ORIENTATION_LABEL[shape]}
            </option>
          ))}
        </Select>
      ) : null}

      {rule.field === 'bytes' ? (
        <>
          <Select
            aria-label="Over or under"
            wrapperClassName="w-auto max-w-none"
            value={rule.op}
            onChange={(event) =>
              onChange({
                ...rule,
                op: event.target.value === 'under' ? 'under' : 'over',
              })
            }
          >
            <option value="over">over</option>
            <option value="under">under</option>
          </Select>
          <input
            aria-label="Size in KB"
            type="number"
            min={0}
            className="num h-8 w-24 rounded-sm border border-line bg-bg px-2 type-sm text-ink"
            value={Math.round(rule.value / 1024)}
            onChange={(event) => {
              const kb = Number(event.target.value)
              onChange({ ...rule, value: Number.isFinite(kb) ? Math.max(0, kb) * 1024 : 0 })
            }}
          />
          <span className="type-meta text-muted">KB</span>
        </>
      ) : null}

      {rule.field === 'added' ? (
        <>
          <span className="type-meta text-muted">within</span>
          <input
            aria-label="Days"
            type="number"
            min={1}
            max={3650}
            className="num h-8 w-20 rounded-sm border border-line bg-bg px-2 type-sm text-ink"
            value={rule.withinDays}
            onChange={(event) => {
              const days = Number(event.target.value)
              onChange({
                field: 'added',
                withinDays: Number.isFinite(days) ? Math.min(3650, Math.max(1, days)) : 1,
              })
            }}
          />
          <span className="type-meta text-muted">days</span>
        </>
      ) : null}

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label="Remove this rule"
        className="ml-auto grid size-7 place-items-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink disabled:opacity-40"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
