'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import {
  MAX_FOLDER_NAME,
  matchesQuery,
  SmartQuerySchema,
  type MatchMode,
  type SmartRule,
} from '@sahoda/shared'

import { createSmartFolder } from '@/app/actions/asset-smart-folders'
import { defaultRuleFor, SmartRuleRow } from '@/components/assets/smart-rule-row'
import { organizable } from '@/lib/assets/organize-view'
import type { AssetCard } from '@/lib/assets/view'

const MAX_RULES = 8

/**
 * BUILD A SMART FOLDER, AND SEE WHAT IT WILL HOLD BEFORE SAVING IT.
 *
 * The live count is the whole feature. It runs `matchesQuery` over the cards
 * already on screen as the person edits, exactly the same function the saved
 * folder will be re-asked with — so what they see while building is what they
 * get, not a preview computed a different way.
 */
export function SmartFolderBuilder({
  cards,
  onClose,
  onCreated,
}: {
  cards: AssetCard[]
  onClose: () => void
  onCreated?: (folderId: string) => void
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<MatchMode>('all')
  const [rules, setRules] = useState<SmartRule[]>([defaultRuleFor('kind')])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const now = useMemo(() => new Date(), [])
  const query = useMemo(() => ({ mode, rules }), [mode, rules])
  const parsedQuery = SmartQuerySchema.safeParse(query)

  const preview = useMemo(() => {
    let matched = 0
    let unknown = 0
    for (const card of cards) {
      const answer = matchesQuery(query, organizable(card), now)
      if (answer === 'yes') matched += 1
      else if (answer === 'unknown') unknown += 1
    }
    return { matched, unknown }
  }, [cards, query, now])

  function updateRule(index: number, next: SmartRule) {
    setRules((current) => current.map((rule, i) => (i === index ? next : rule)))
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, i) => i !== index))
  }

  function addRule() {
    if (rules.length >= MAX_RULES) return
    setRules((current) => [...current, defaultRuleFor('kind')])
  }

  function save() {
    if (!parsedQuery.success || name.trim() === '') return
    startTransition(async () => {
      const result = await createSmartFolder(name, parsedQuery.data)
      if (result.ok) {
        onCreated?.(result.folder.id)
        return onClose()
      }
      setError(result.message)
    })
  }

  const filesWord = preview.matched === 1 ? 'file' : 'files'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="smart-name" className="type-meta text-muted">
          Name
        </label>
        <input
          id="smart-name"
          autoFocus
          value={name}
          maxLength={MAX_FOLDER_NAME}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Missing descriptions"
          className="mt-1 h-9 w-full rounded-sm border border-line bg-bg px-2 type-sm text-ink"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="type-meta text-muted">Match</span>
        <div className="surface-ring-firm inline-flex rounded-pill bg-s2 p-0.5">
          {(['all', 'any'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              className={`rounded-pill px-3 py-1 type-sm transition-micro ${
                mode === option ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-ink'
              }`}
            >
              {option === 'all' ? 'every rule' : 'any rule'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {rules.map((rule, index) => (
          <SmartRuleRow
            key={index}
            rule={rule}
            onChange={(next) => updateRule(index, next)}
            onRemove={() => removeRule(index)}
            canRemove={rules.length > 1}
          />
        ))}
      </div>

      {rules.length >= MAX_RULES ? (
        <p className="type-meta text-muted">
          Smart folders hold up to {MAX_RULES} rules. Past that nobody can predict what the folder
          holds.
        </p>
      ) : (
        <button
          type="button"
          onClick={addRule}
          className="flex w-fit items-center gap-1.5 rounded-sm px-2 py-1 type-sm font-semibold text-accent transition-micro hover:bg-brand-wash"
        >
          <Plus size={14} aria-hidden />
          Add rule
        </button>
      )}

      {/* THE LIVE COUNT. What this folder will hold, right now. */}
      <div className="surface-ring rounded-sm bg-brand-wash px-3 py-2">
        <p className="type-sm text-ink">
          Matches <span className="num font-semibold">{preview.matched}</span> {filesWord} on screen
          right now
          {preview.unknown > 0 ? (
            <>
              . <span className="num font-semibold">{preview.unknown}</span>
              {preview.unknown === 1 ? ' file could not be checked' : ' files could not be checked'}
            </>
          ) : (
            '.'
          )}
        </p>
      </div>

      {error ? (
        <p role="alert" className="type-sm text-ink-mute">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="type-sm text-muted">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || name.trim() === '' || !parsedQuery.success}
          className="rounded-pill bg-primary px-4 py-1.5 type-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Save smart folder
        </button>
      </div>
    </div>
  )
}
