'use client'

import { forwardRef, useState, useTransition } from 'react'
import { Search } from 'lucide-react'
import { MAX_FOLDER_NAME, TOKEN_FIELDS } from '@sahoda/shared'
import type { SmartRule } from '@sahoda/shared'

import { createSmartFolder } from '@/app/actions/asset-smart-folders'

/**
 * ONE SEARCH BOX. This is the whole "add a filter" flow now.
 *
 * The rule builder it replaces was a modal, a mode toggle, and up to eight
 * rows of dropdowns. Nobody used it: the founder's word was "complicated".
 * `parseSearch` (packages/shared) reads plain words like `type:image` out of
 * this one field, so there is one control to learn instead of a builder to
 * open.
 */
export const LibrarySearch = forwardRef<
  HTMLInputElement,
  {
    query: string
    onQueryChange: (query: string) => void
    narrowing: boolean
    unusable: readonly { text: string; message: string }[]
    unresolvedFolderNames: readonly string[]
    rules: readonly SmartRule[]
    onSaved: (id: string) => void
  }
>(function LibrarySearch(
  { query, onQueryChange, narrowing, unusable, unresolvedFolderNames, rules, onSaved },
  ref,
) {
  const [focused, setFocused] = useState(false)
  const showHints = focused || query.trim() !== ''
  const showMessages = unusable.length > 0 || unresolvedFolderNames.length > 0

  function appendToken(example: string) {
    onQueryChange(query.trim() === '' ? example : `${query.trim()} ${example}`)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center">
          <span className="sr-only">Search your library</span>
          <Search
            size={15}
            strokeWidth={1.8}
            aria-hidden
            className="pointer-events-none absolute left-3 text-muted"
          />
          <input
            ref={ref}
            type="search"
            data-guide="assets.search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search, or type a filter like type:image"
            className="h-input w-full rounded-input border border-line bg-surface pr-3 pl-9 type-sm text-ink placeholder:text-muted max-narrow:min-h-[44px]"
          />
        </label>
        {narrowing ? <SaveSearch rules={rules} onSaved={onSaved} /> : null}
      </div>

      {showHints ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="type-meta text-muted">Try:</span>
          {TOKEN_FIELDS.map((field) => (
            <button
              key={field.key}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => appendToken(field.example)}
              title={field.label}
              className="rounded-pill bg-s2 px-2 py-0.5 type-chip text-muted transition-micro hover:bg-s1 hover:text-ink"
            >
              {field.example}
            </button>
          ))}
        </div>
      ) : null}

      {showMessages ? (
        <div className="flex flex-col gap-0.5">
          {unusable.map((entry) => (
            <p key={entry.text} role="alert" className="type-meta text-ink-mute">
              <span className="font-semibold text-ink">{entry.text}</span>: {entry.message}
            </p>
          ))}
          {unresolvedFolderNames.map((name) => (
            <p key={name} role="alert" className="type-meta text-ink-mute">
              Sahoda has no folder named &ldquo;{name}&rdquo;.
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
})

/** "Save this search" — narrows the whole smart-folder flow to one field and two clicks. */
function SaveSearch({
  rules,
  onSaved,
}: {
  rules: readonly SmartRule[]
  onSaved: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        data-guide="assets.saveSearch"
        className="flex shrink-0 items-center gap-1.5 rounded-pill bg-s2 px-3 py-1.5 type-sm font-semibold text-ink transition-micro hover:bg-s1"
      >
        Save this search
      </button>
    )
  }

  function submit() {
    if (name.trim() === '') return
    startTransition(async () => {
      const result = await createSmartFolder(name, { mode: 'all', rules: [...rules] })
      if (result.ok) {
        onSaved(result.folder.id)
        setEditing(false)
        setName('')
        setError(null)
        return
      }
      setError(result.message)
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="surface-ring flex shrink-0 items-center gap-2 rounded-pill bg-surface px-3 py-1.5"
    >
      <input
        autoFocus
        value={name}
        maxLength={MAX_FOLDER_NAME}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name this search"
        aria-label="Name this search"
        className="h-6 w-[140px] border-0 bg-transparent type-sm text-ink outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={pending || name.trim() === ''}
        className="type-sm font-semibold text-accent disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false)
          setName('')
          setError(null)
        }}
        className="type-sm text-muted"
      >
        Cancel
      </button>
      {error ? <span className="type-meta text-ink-mute">{error}</span> : null}
    </form>
  )
}
