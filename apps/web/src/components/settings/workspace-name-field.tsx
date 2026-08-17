'use client'

import { useState, useTransition } from 'react'

import { renameWorkspace } from '@/app/actions/workspace'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/posts/inline-error'

/**
 * The workspace name, editable.
 *
 * ── WHAT IT REPLACED ─────────────────────────────────────────────────────────
 * A `<span>`. /settings rendered every value as read-only text, so the name in
 * the switcher — set from the signup email at bootstrap and shown on every
 * screen — could not be changed from anywhere in the product.
 *
 * ── WHY IT SAVES ON A BUTTON AND NOT ON BLUR ─────────────────────────────────
 * The create flow's per-channel editors commit on blur because they are drafts:
 * losing an unsaved keystroke there costs writing. This is a single settings
 * field whose value is read by the shell on every page, so a stray click after
 * a half-typed word should not rename the workspace. An explicit press is the
 * right granularity for a value this visible.
 *
 * The button stays disabled while the field is unchanged or empty, so the only
 * thing it can ever do is commit a real edit.
 */
export function WorkspaceNameField({
  workspaceId,
  initialName,
}: {
  workspaceId: string
  initialName: string
}) {
  const [value, setValue] = useState(initialName)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const trimmed = value.trim()
  const dirty = trimmed !== initialName && trimmed.length > 0

  function save() {
    setError(null)
    setSaved(null)
    startTransition(async () => {
      const result = await renameWorkspace(workspaceId, trimmed)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSaved(result.name)
    })
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <div className="flex items-center gap-2 max-narrow:flex-col max-narrow:items-stretch">
        <input
          id="workspace-name"
          data-workspace-name
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          aria-label="Workspace name"
          className="min-w-0 flex-1 rounded-input border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring max-narrow:min-h-[44px]"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty}
          loading={pending}
          onClick={save}
          className="flex-none max-narrow:min-h-[44px]"
        >
          Save
        </Button>
      </div>
      {error ? <InlineError>{error}</InlineError> : null}
      {saved ? (
        <p data-saved-name className="text-[12px] font-semibold text-accent">
          Saved. The switcher now reads {saved}.
        </p>
      ) : null}
    </div>
  )
}
